// ============================================================================
// matchingService
//
// THE BRAIN of MatchGPT search. Pure functions — no React, no Supabase imports
// in the scoring logic itself (so it's unit-testable). Only the
// `runSearch` wrapper hits the DB.
//
// Two-stage pipeline:
//   1) Hard filters    → eliminate ineligible candidates from pool
//   2) Weighted score  → rank survivors 0–100 across 9 dimensions
//   3) Prompt bonus    → +0–30 on top, based on natural-language search match
//
// Scoring weights (sum to 100):
//   relationship goals  20
//   lifestyle           15
//   values              15
//   location/background 15
//   age                 10
//   personality         10
//   physical             5
//   education            5
//   prompt bonus        +0–30 (additive, not in the 100)
// ============================================================================

import { supabase } from './supabase';
import { rowToProfile } from './profileMapping';
import { listMyBlockedIds } from './blocksService';
import type { ProfileRow } from './database.types';
import type {
  UserProfile, FilterOptions, MatchCandidate, CompatibilityItem,
} from '../types';

// ============================================================================
// PUBLIC API
// ============================================================================

export interface SearchInput {
  searcherId: string;
  searcher: UserProfile;
  prompt: string;            // natural-language query, may be empty
  filters: FilterOptions;
  limit?: number;            // max candidates to return (default 8 for free, unlimited for pro)
}

export interface SearchOutput {
  candidates: MatchCandidate[];   // top N, ranked
  poolSize: number;               // how many we considered before ranking
  totalEligible: number;          // how many in DB before hard filters
}

/**
 * Run the full matching pipeline. Fetches candidate pool from Supabase,
 * applies hard filters, scores survivors, returns top N.
 *
 * Tier limits (Item 4):
 *   - FREE (Basic): 8 results per search (2 rows × 4 cards in the new grid)
 *   - PRO:          up to 50 results per search (effectively unlimited)
 *
 * Caller decides the limit by passing `limit`. Defaults to 8 if not provided
 * so any new callers won't accidentally explode the result set.
 */
// "Online" means active in the last 5 minutes (the app records activity every
// 2 minutes while open), unless the person turned Active Status off.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export function isOnlineNow(row: { last_active_at?: string | null; settings_show_online?: boolean | null }): boolean {
  if (row.settings_show_online === false || !row.last_active_at) return false;
  return Date.now() - new Date(row.last_active_at).getTime() <= ONLINE_WINDOW_MS;
}

export async function runSearch(input: SearchInput): Promise<SearchOutput> {
  // 1. Pull candidate pool
  const { data, error } = await supabase
    .from('eligible_profiles')
    .select('*')
    .neq('id', input.searcherId);

  if (error) {
    console.error('[matchingService] failed to fetch pool:', error.message);
    return { candidates: [], poolSize: 0, totalEligible: 0 };
  }

  const totalEligible = data.length;

  // eligible_profiles exposes only a subset of the profile columns; the rest
  // read as undefined here (see ROADMAP Phase 9, search rework).
  let pool = data as unknown as ProfileRow[];

  // Pre-step: nobody the searcher blocked, or who blocked the searcher.
  const { ids: blocked } = await listMyBlockedIds();
  pool = pool.filter((row) => !blocked.has(row.id));

  // Pre-step: if `notAlreadyLiked` is set, fetch IDs the searcher already liked
  // and exclude them from the pool BEFORE other filtering.
  if (input.filters.notAlreadyLiked) {
    const { listLikesSent } = await import('./likesService');
    const { likedIds } = await listLikesSent(input.searcherId);
    pool = pool.filter((row) => !likedIds.has(row.id));
  }

  // Pre-step: incognito users only appear to people they've already liked.
  // We fetch the IDs of users who liked the SEARCHER (so we can show them
  // even if they're in incognito), and exclude all other incognito users.
  const incognitoIds = pool.filter((r) => r.settings_incognito).map((r) => r.id);
  if (incognitoIds.length > 0) {
    const { data: likedMe } = await supabase
      .from('likes')
      .select('liker_id')
      .eq('liked_id', input.searcherId)
      .in('liker_id', incognitoIds);
    const allowedIncognitoIds = new Set((likedMe ?? []).map((r) => r.liker_id as string));
    pool = pool.filter((row) => !row.settings_incognito || allowedIncognitoIds.has(row.id));
  }

  // 2. Hard filters
  const survivors = applyHardFilters(pool, input.searcher, input.filters);
  const poolSize = survivors.length;

  // 3. Score every survivor
  const scored = survivors.map((row) => scoreCandidate(row, input.searcher, input.prompt));

  // 4. Sort by score descending, take top N (default 8)
  scored.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  const limit = input.limit ?? 8;
  return {
    candidates: scored.slice(0, limit),
    poolSize,
    totalEligible,
  };
}

// Score specific people (e.g. today's saved Standouts picks) the same way search
// does. Anyone no longer eligible (paused, banned, deleted) or blocked in either
// direction drops out.
export async function scoreProfilesByIds(searcher: UserProfile, ids: string[]): Promise<MatchCandidate[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('eligible_profiles').select('*').in('id', ids);
  if (error) {
    console.error('[matchingService] failed to fetch profiles:', error.message);
    return [];
  }
  const { ids: blocked } = await listMyBlockedIds();
  return (data as unknown as ProfileRow[])
    .filter((row) => !blocked.has(row.id))
    .map((row) => scoreCandidate(row, searcher, ''));
}

// ============================================================================
// STAGE 1 — HARD FILTERS
// ============================================================================

function applyHardFilters(
  pool: ProfileRow[],
  searcher: UserProfile,
  filters: FilterOptions
): ProfileRow[] {
  return pool.filter((row) => {
    // ---- Sexuality / interested-in (mutual interest) ----
    if (!areMutuallyInterested(searcher, row)) return false;

    // ---- Age range ----
    if (filters.ageRange && row.age != null) {
      const [min, max] = filters.ageRange;
      if (row.age < min || row.age > max) return false;
    }

    // ---- Distance / location filters ----
    if (filters.neighborhood && filters.neighborhood.trim()) {
      const needle = filters.neighborhood.toLowerCase();
      const hay = `${row.location ?? ''} ${row.hometown ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }

    // ---- Verified only ----
    if (filters.isVerified && !row.is_verified) return false;

    // ---- Online now (filter pill) ----
    if (filters.isOnline && !isOnlineNow(row)) return false;

    // ---- Recently active (within 7 days) ----
    // People who turned Active Status off don't show their activity.
    if (filters.recentlyActive) {
      if (!row.last_active_at || row.settings_show_online === false) return false;
      const ageMs = Date.now() - new Date(row.last_active_at).getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) return false;
    }

    // ---- Has socials (only candidates who actually filled in their handle) ----
    if (filters.hasLinkedin && !row.linkedin) return false;
    if (filters.hasInstagram && !row.instagram) return false;

    // ---- Premium only ----
    if (filters.isPremium && row.subscription_tier !== 'PRO') return false;

    // ---- Hard preference filters ----
    // STRICT: if a filter is set, the candidate MUST have a matching value.
    // A candidate who hasn't filled in this field is excluded — otherwise the
    // filter is meaningless (a Hindu searcher filtering for "Hindu" would
    // still see every blank-religion profile).
    if (filters.ethnicity && row.ethnicity !== filters.ethnicity) return false;
    if (filters.religion && row.religion !== filters.religion) return false;
    if (filters.relationshipType && row.relationship_type !== filters.relationshipType) return false;
    if (filters.datingIntention && row.dating_intention !== filters.datingIntention) return false;
    if (filters.children && row.children !== filters.children) return false;
    if (filters.familyPlans && row.family_plans !== filters.familyPlans) return false;
    if (filters.educationLevel && row.education_level !== filters.educationLevel) return false;
    if (filters.politics && row.politics !== filters.politics) return false;

    // ---- Height filter ----
    // Stored as free-text (e.g. "5'10\""). We do a direct equality check.
    // If the field is unset on the candidate, exclude.
    if (filters.height && row.height !== filters.height) return false;

    // ---- Lifestyle hard filters ----
    // For these, "no smokers" should only exclude actual smokers, not blank
    // entries — but the FilterPanel only offers explicit values, so be strict.
    if (filters.smoking && row.smoking !== filters.smoking) return false;
    if (filters.drinking && row.drinking !== filters.drinking) return false;
    if (filters.marijuana && row.marijuana !== filters.marijuana) return false;
    if (filters.drugs && row.drugs !== filters.drugs) return false;

    return true;
  });
}

// ----------------------------------------------------------------------------
// Mutual interest check — both sides have to want each other's gender
// ----------------------------------------------------------------------------

function areMutuallyInterested(searcher: UserProfile, candidate: ProfileRow): boolean {
  // If either side hasn't filled in interestedIn, we err on the side of allowing.
  const sInterest = (searcher.interestedIn || '').toLowerCase();
  const cInterest = (candidate.interested_in || '').toLowerCase();
  const sGender = (searcher.gender || '').toLowerCase();
  const cGender = (candidate.gender || '').toLowerCase();

  // searcher interested in candidate's gender?
  if (sInterest && cGender) {
    if (!matchesGenderPreference(sInterest, cGender)) return false;
  }
  // candidate interested in searcher's gender?
  if (cInterest && sGender) {
    if (!matchesGenderPreference(cInterest, sGender)) return false;
  }
  return true;
}

function matchesGenderPreference(preference: string, target: string): boolean {
  // "everyone", "all", or empty = open to anyone
  if (!preference || preference.includes('everyone') || preference.includes('all')) return true;

  // CRITICAL: check female/woman FIRST, because "female" contains "male" as a
  // substring and "woman" contains "man". Order matters here.
  // We also use word-boundary regex on the target itself (not .includes()) for
  // the same reason — a Female candidate must not be classified as Male.
  if (/\b(woman|women|female|girls?|ladies)\b/.test(target)) {
    return /\b(woman|women|female|girls?|ladies)\b/.test(preference);
  }
  if (/\b(man|men|male|guys?)\b/.test(target)) {
    return /\b(man|men|male|guys?)\b/.test(preference);
  }
  if (/\bnon-?binary\b/.test(target)) {
    return /\bnon-?binary\b/.test(preference);
  }
  return true; // unknown gender → don't filter out
}

// ============================================================================
// STAGE 2 — WEIGHTED SCORING
// ============================================================================

function scoreCandidate(
  row: ProfileRow,
  searcher: UserProfile,
  prompt: string
): MatchCandidate {
  const candidate = rowToProfile(row);

  // Run each dimension. Each returns { score, max, items }.
  const goals    = scoreRelationshipGoals(searcher, candidate);   // /20
  const lifestyle = scoreLifestyle(searcher, candidate);          // /15
  const values   = scoreValues(searcher, candidate);              // /15
  const location = scoreLocationBackground(searcher, candidate);  // /15
  const age      = scoreAge(searcher, candidate);                 // /10
  const personality = scorePersonality(searcher, candidate);      // /10
  const physical = scorePhysical(searcher, candidate);            // /5
  const education = scoreEducation(searcher, candidate);          // /5

  const baseScore =
    goals.score + lifestyle.score + values.score + location.score +
    age.score + personality.score + physical.score + education.score;

  const promptBonus = scorePromptMatch(prompt, row, candidate); // 0-30

  // Final compatibility cap at 100 for display, but actual is base + bonus.
  const finalScore = Math.min(100, Math.round(baseScore + promptBonus));

  // Build the report items — only the ones with notable signal
  const reportItems: CompatibilityItem[] = [
    ...goals.items, ...lifestyle.items, ...values.items, ...location.items,
    ...age.items, ...personality.items, ...physical.items, ...education.items,
  ];

  // Tags = surfaced highlights (top 3 strongest positives)
  const tags = reportItems
    .filter((i) => i.color === 'green')
    .slice(0, 3)
    .map((i) => i.text);

  return {
    id: row.id,
    name: row.name ?? '',
    age: row.age ?? 0,
    location: row.location ?? '',
    compatibilityScore: finalScore,
    compatibilityReport: reportItems,
    tags,
    bio: row.description ?? '',
    imageUrls: row.photo_urls ?? [],
    linkedin: row.linkedin ?? undefined,
    instagram: row.instagram ?? undefined,
    isOnline: isOnlineNow(row),
    isVerified: row.is_verified ?? false,
    isPremium: row.subscription_tier === 'PRO',
    subscriptionTier: (row.subscription_tier as 'FREE' | 'PRO') ?? 'FREE',
    hiddenFields: row.hidden_fields ?? [],

    // Detail fields used by ProfileModal
    jobTitle: row.job_title ?? undefined,
    work: row.work ?? undefined,
    university: row.university ?? undefined,
    educationLevel: row.education_level ?? undefined,
    hometown: row.hometown ?? undefined,
    height: row.height ?? undefined,
    ethnicity: row.ethnicity ?? undefined,
    religion: row.religion ?? undefined,
    politics: row.politics ?? undefined,
    zodiac: row.zodiac ?? undefined,
    drinking: row.drinking ?? undefined,
    smoking: row.smoking ?? undefined,
    marijuana: row.marijuana ?? undefined,
    drugs: row.drugs ?? undefined,
    languages: row.languages ?? undefined,
    interestedIn: row.interested_in ?? undefined,
    relationshipType: row.relationship_type ?? undefined,
    datingIntention: row.dating_intention ?? undefined,
    children: row.children ?? undefined,
    familyPlans: row.family_plans ?? undefined,
    pets: row.pets ?? undefined,
    bodyType: row.body_type ?? undefined,
    hairColor: row.hair_color ?? undefined,
    eyeColor: row.eye_color ?? undefined,
    gymRoutine: row.gym_routine ?? undefined,
    hobbies: row.hobbies ?? undefined,
    travelStyle: row.travel_style ?? undefined,
    loveLanguage: row.love_language ?? undefined,
    socialBattery: row.social_battery ?? undefined,
    attachmentStyle: row.attachment_style ?? undefined,
    conflictResolution: row.conflict_resolution ?? undefined,
    financialApproach: row.financial_approach ?? undefined,
    sleepSchedule: row.sleep_schedule ?? undefined,
    dietaryPreferences: row.dietary_preferences ?? undefined,
    marriageTimeline: row.marriage_timeline ?? undefined,
    livingPreference: row.living_preference ?? undefined,
    sportsInterest: row.sports_interest ?? undefined,
    readingInterest: row.reading_interest ?? undefined,
    musicGenre: row.music_genre ?? undefined,
    therapyHistory: row.therapy_history ?? undefined,
    futurePlans: row.future_plans ?? undefined,
    dreamHouseType: row.dream_house_type ?? undefined,
    familyCloseness: row.family_closeness ?? undefined,
    siblings: row.siblings ?? undefined,
    workStyle: row.work_style ?? undefined,
    canCook: row.can_cook ?? undefined,
    lovesTravel: row.loves_travel ?? undefined,
    nextTravelDestination: row.next_travel_destination ?? undefined,
    hasTattoos: row.has_tattoos ?? undefined,
    clothingStyle: row.clothing_style ?? undefined,
    sexStyle: row.sex_style ?? undefined,
    interracialMarriage: row.interracial_marriage ?? undefined,
    favoriteDrink: row.favorite_drink ?? undefined,
  };
}

// ----------------------------------------------------------------------------
// Relationship goals (max 20) — most important dimension
// ----------------------------------------------------------------------------

function scoreRelationshipGoals(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Dating intention (8 pts) — exact match best, "marriage" vs "long-term" still ok
  if (s.datingIntention && c.datingIntention) {
    if (s.datingIntention === c.datingIntention) {
      score += 8;
      items.push({ icon: '💍', text: `Both looking for ${c.datingIntention.toLowerCase()}`, color: 'green' });
    } else if (similarIntent(s.datingIntention, c.datingIntention)) {
      score += 5;
      items.push({ icon: '🤝', text: 'Similar relationship intent', color: 'amber' });
    } else {
      items.push({ icon: '⚠️', text: `Different intent (${s.datingIntention} vs ${c.datingIntention})`, color: 'red' });
    }
  } else {
    score += 4;
  }

  // Marriage timeline (5 pts)
  if (s.marriageTimeline && c.marriageTimeline) {
    if (s.marriageTimeline === c.marriageTimeline) {
      score += 5;
      items.push({ icon: '⏳', text: `Same marriage timeline: ${c.marriageTimeline}`, color: 'green' });
    } else if (closeTimelines(s.marriageTimeline, c.marriageTimeline)) {
      score += 3;
    } else {
      items.push({ icon: '⚠️', text: 'Different marriage timelines', color: 'amber' });
    }
  } else {
    score += 2.5;
  }

  // Family plans / wants kids (4 pts) — high stakes alignment
  if (s.familyPlans && c.familyPlans) {
    if (s.familyPlans === c.familyPlans) {
      score += 4;
      items.push({ icon: '👶', text: `Aligned on children: ${c.familyPlans.toLowerCase()}`, color: 'green' });
    } else if (
      (s.familyPlans.includes('Wants') && c.familyPlans.includes('Open')) ||
      (s.familyPlans.includes('Open') && c.familyPlans.includes('Wants'))
    ) {
      score += 2;
    } else if (
      (s.familyPlans.includes('Wants') && c.familyPlans.includes('Does not')) ||
      (s.familyPlans.includes('Does not') && c.familyPlans.includes('Wants'))
    ) {
      // hard mismatch — no points, red flag
      items.push({ icon: '🚨', text: 'Major mismatch on having children', color: 'red' });
    }
  } else {
    score += 2;
  }

  // Relationship type (3 pts)
  if (s.relationshipType && c.relationshipType) {
    if (s.relationshipType === c.relationshipType) {
      score += 3;
    }
  } else {
    score += 1.5;
  }

  return { score: Math.min(20, score), max: 20, items };
}

function similarIntent(a: string, b: string): boolean {
  const longTerm = ['Marriage', 'Long-term relationship', 'Long-term, open to short'];
  return longTerm.includes(a) && longTerm.includes(b);
}

function closeTimelines(a: string, b: string): boolean {
  const order = ['ASAP', 'Within 6 months', 'Within 1 year', '1-2 years', '3-5 years', '5+ years', 'Not sure yet'];
  const aIdx = order.indexOf(a);
  const bIdx = order.indexOf(b);
  if (aIdx === -1 || bIdx === -1) return false;
  return Math.abs(aIdx - bIdx) <= 1;
}

// ----------------------------------------------------------------------------
// Lifestyle (max 15)
// ----------------------------------------------------------------------------

function scoreLifestyle(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Vices — drinking/smoking/marijuana/drugs (4 pts each, max 8 total since drugs is rare)
  const vices: Array<[keyof UserProfile, string]> = [
    ['drinking', 'drinking habits'],
    ['smoking', 'smoking habits'],
    ['marijuana', 'cannabis habits'],
  ];
  let viceMatches = 0;
  vices.forEach(([key, label]) => {
    const sv = s[key]; const cv = c[key];
    if (sv && cv) {
      if (sv === cv) { score += 2; viceMatches++; }
      else if (vicesSimilar(String(sv), String(cv))) score += 1;
      else if (sv === 'No' && cv === 'Regularly') {
        items.push({ icon: '⚠️', text: `Different ${label}`, color: 'red' });
      }
    } else { score += 1; }
  });
  if (viceMatches >= 2) {
    items.push({ icon: '🍸', text: 'Aligned lifestyle habits', color: 'green' });
  }

  // Diet (2 pts)
  if (s.dietaryPreferences && c.dietaryPreferences) {
    if (s.dietaryPreferences === c.dietaryPreferences) {
      score += 2;
      items.push({ icon: '🥗', text: `Both ${c.dietaryPreferences.toLowerCase()}`, color: 'green' });
    } else if (dietsCompatible(s.dietaryPreferences, c.dietaryPreferences)) {
      score += 1;
    }
  } else { score += 1; }

  // Exercise (2 pts)
  if (s.gymRoutine && c.gymRoutine) {
    if (s.gymRoutine === c.gymRoutine) {
      score += 2;
      if (c.gymRoutine === 'Daily' || c.gymRoutine === '3-4 times a week') {
        items.push({ icon: '💪', text: 'Both stay active', color: 'green' });
      }
    } else if (closeExerciseLevels(s.gymRoutine, c.gymRoutine)) {
      score += 1;
    }
  } else { score += 1; }

  // Sleep schedule (1 pt) — small but matters for cohabitation
  if (s.sleepSchedule && c.sleepSchedule && s.sleepSchedule === c.sleepSchedule) {
    score += 1;
  } else { score += 0.5; }

  // Living preference (2 pts)
  if (s.livingPreference && c.livingPreference) {
    if (s.livingPreference === c.livingPreference) score += 2;
  } else { score += 1; }

  return { score: Math.min(15, score), max: 15, items };
}

function vicesSimilar(a: string, b: string): boolean {
  // "No" + "Socially" is fine, "Socially" + "Regularly" is fine, etc.
  const order = ['No', 'Socially', 'Regularly', 'Sometimes', 'Often'];
  const ai = order.indexOf(a); const bi = order.indexOf(b);
  if (ai === -1 || bi === -1) return false;
  return Math.abs(ai - bi) <= 1;
}

function dietsCompatible(a: string, b: string): boolean {
  // Vegetarian + Vegan or Eggetarian: compatible. Halal + Kosher: not really.
  const veggie = ['Vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Pescatarian'];
  return (veggie.includes(a) && veggie.includes(b)) || a === b;
}

function closeExerciseLevels(a: string, b: string): boolean {
  const order = ['Never', 'Occasionally', '1-2 times a week', '3-4 times a week', 'Daily'];
  const ai = order.indexOf(a); const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// ----------------------------------------------------------------------------
// Values (max 15) — religion, politics, money
// ----------------------------------------------------------------------------

function scoreValues(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Religion (6 pts)
  if (s.religion && c.religion) {
    if (s.religion === c.religion) {
      score += 6;
      items.push({ icon: '🕉️', text: `Both ${c.religion}`, color: 'green' });
    } else if (religionsCompatible(s.religion, c.religion)) {
      score += 3;
    } else {
      items.push({ icon: '⚠️', text: `Different religions (${s.religion} vs ${c.religion})`, color: 'amber' });
    }
  } else { score += 3; }

  // Politics (5 pts)
  if (s.politics && c.politics) {
    if (s.politics === c.politics) {
      score += 5;
      items.push({ icon: '🗳️', text: `Both ${c.politics.toLowerCase()}`, color: 'green' });
    } else if (politicsClose(s.politics, c.politics)) {
      score += 2;
    } else if (
      (s.politics === 'Liberal' && c.politics === 'Conservative') ||
      (s.politics === 'Conservative' && c.politics === 'Liberal')
    ) {
      items.push({ icon: '⚠️', text: 'Different political views', color: 'red' });
    }
  } else { score += 2.5; }

  // Money (4 pts)
  if (s.financialApproach && c.financialApproach) {
    if (s.financialApproach === c.financialApproach) {
      score += 4;
      items.push({ icon: '💰', text: `Same money mindset: ${c.financialApproach.toLowerCase()}`, color: 'green' });
    } else if (
      (s.financialApproach === 'Saver' && c.financialApproach === 'Spender') ||
      (s.financialApproach === 'Spender' && c.financialApproach === 'Saver')
    ) {
      // classic mismatch
      items.push({ icon: '⚠️', text: 'Different financial styles', color: 'amber' });
    } else { score += 2; }
  } else { score += 2; }

  return { score: Math.min(15, score), max: 15, items };
}

function religionsCompatible(a: string, b: string): boolean {
  const flexible = ['Spiritual', 'Agnostic', 'Atheist', 'Other'];
  return flexible.includes(a) || flexible.includes(b);
}

function politicsClose(a: string, b: string): boolean {
  const moderate = ['Moderate', 'Apolitical'];
  return moderate.includes(a) || moderate.includes(b);
}

// ----------------------------------------------------------------------------
// Location & background (max 15)
// ----------------------------------------------------------------------------

function scoreLocationBackground(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Same city (8 pts) — biggest single signal
  if (s.location && c.location) {
    if (sameCity(s.location, c.location)) {
      score += 8;
      items.push({ icon: '📍', text: `Both in ${c.location}`, color: 'green' });
    } else if (sameRegion(s.location, c.location)) {
      score += 4;
    } else {
      items.push({ icon: '✈️', text: 'Different cities', color: 'amber' });
    }
  } else { score += 3; }

  // Languages overlap (4 pts) — shared language is a meaningful daily-life signal
  if (s.languages && c.languages) {
    const sLangs = s.languages.toLowerCase().split(/[,;\/]/).map((x) => x.trim()).filter(Boolean);
    const cLangs = c.languages.toLowerCase().split(/[,;\/]/).map((x) => x.trim()).filter(Boolean);
    const shared = sLangs.filter((lang) => cLangs.includes(lang));
    if (shared.length >= 2) {
      score += 4;
      items.push({ icon: '🗣️', text: `Speak ${shared.length} common languages`, color: 'green' });
    } else if (shared.length === 1) {
      score += 2;
    }
  } else { score += 2; }

  // Ethnicity / interracial openness (3 pts)
  if (s.ethnicity && c.ethnicity) {
    if (s.ethnicity === c.ethnicity) {
      score += 3;
    } else if (
      (s.interracialMarriage === 'Yes') ||
      (c.interracialMarriage === 'Yes')
    ) {
      score += 2;
      items.push({ icon: '🌏', text: 'Open to interracial relationship', color: 'green' });
    } else if (
      s.interracialMarriage === 'No' || c.interracialMarriage === 'No' ||
      s.interracialMarriage === 'Prefer same race' || c.interracialMarriage === 'Prefer same race'
    ) {
      items.push({ icon: '⚠️', text: 'One side prefers same ethnicity', color: 'red' });
    } else { score += 1; }
  } else { score += 1.5; }

  return { score: Math.min(15, score), max: 15, items };
}

function sameCity(a: string, b: string): boolean {
  // Loose match — "Mumbai" matches "Mumbai, India" or "South Mumbai"
  const norm = (s: string) => s.toLowerCase().split(',')[0].trim();
  return norm(a) === norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

function sameRegion(a: string, b: string): boolean {
  // Same country — second comma-separated component matches
  const region = (s: string) => {
    const parts = s.toLowerCase().split(',').map((x) => x.trim());
    return parts[parts.length - 1] || parts[0];
  };
  return region(a) === region(b);
}

// ----------------------------------------------------------------------------
// Age (max 10)
// ----------------------------------------------------------------------------

function scoreAge(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  if (!s.age || !c.age) return { score: 5, max: 10, items };

  const diff = Math.abs(s.age - c.age);

  if (diff <= 2) {
    score = 10;
    items.push({ icon: '🎂', text: `Close in age (${c.age} vs ${s.age})`, color: 'green' });
  } else if (diff <= 4) {
    score = 8;
  } else if (diff <= 7) {
    score = 5;
  } else if (diff <= 10) {
    score = 3;
    items.push({ icon: '⏳', text: `Notable age gap (${diff} years)`, color: 'amber' });
  } else {
    score = 0;
    items.push({ icon: '⚠️', text: `Large age gap (${diff} years)`, color: 'red' });
  }

  return { score, max: 10, items };
}

// ----------------------------------------------------------------------------
// Personality (max 10)
// ----------------------------------------------------------------------------

function scorePersonality(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Social battery (3 pts)
  if (s.socialBattery && c.socialBattery) {
    if (s.socialBattery === c.socialBattery) score += 3;
    else if (socialBatteriesCompatible(s.socialBattery, c.socialBattery)) score += 2;
  } else { score += 1.5; }

  // Attachment style (3 pts)
  if (s.attachmentStyle && c.attachmentStyle) {
    if (s.attachmentStyle === 'Secure' && c.attachmentStyle === 'Secure') {
      score += 3;
      items.push({ icon: '💖', text: 'Both have secure attachment', color: 'green' });
    } else if (s.attachmentStyle === c.attachmentStyle) score += 2;
    else if (
      (s.attachmentStyle === 'Anxious' && c.attachmentStyle === 'Avoidant') ||
      (s.attachmentStyle === 'Avoidant' && c.attachmentStyle === 'Anxious')
    ) {
      // classic mismatch
      items.push({ icon: '⚠️', text: 'Anxious-avoidant attachment pairing', color: 'red' });
    } else { score += 1; }
  } else { score += 1.5; }

  // Conflict resolution (2 pts)
  if (s.conflictResolution && c.conflictResolution) {
    if (s.conflictResolution === c.conflictResolution) score += 2;
    else if (
      (s.conflictResolution === 'Calm discussion' && c.conflictResolution === 'Direct & assertive') ||
      (s.conflictResolution === 'Direct & assertive' && c.conflictResolution === 'Calm discussion')
    ) score += 1;
  } else { score += 1; }

  // Love language (2 pts)
  if (s.loveLanguage && c.loveLanguage) {
    if (s.loveLanguage === c.loveLanguage) {
      score += 2;
      items.push({ icon: '💝', text: `Same love language: ${c.loveLanguage}`, color: 'green' });
    } else { score += 0.5; }
  } else { score += 1; }

  return { score: Math.min(10, score), max: 10, items };
}

function socialBatteriesCompatible(a: string, b: string): boolean {
  const intro = ['Introvert', 'Homebody'];
  const extro = ['Extrovert', 'Social Butterfly'];
  return (intro.includes(a) && intro.includes(b)) || (extro.includes(a) && extro.includes(b)) ||
         a === 'Ambivert' || b === 'Ambivert';
}

// ----------------------------------------------------------------------------
// Physical (max 5) — height, body type
// ----------------------------------------------------------------------------

function scorePhysical(s: UserProfile, c: UserProfile) {
  let score = 2.5; // default neutral
  const items: CompatibilityItem[] = [];

  // For now we don't auto-rank physical compatibility heavily — it's subjective.
  // Just give baseline points and let prompt + other dimensions drive ranking.

  return { score, max: 5, items };
}

// ----------------------------------------------------------------------------
// Education (max 5)
// ----------------------------------------------------------------------------

function scoreEducation(s: UserProfile, c: UserProfile) {
  let score = 0;
  const items: CompatibilityItem[] = [];

  if (s.educationLevel && c.educationLevel) {
    if (s.educationLevel === c.educationLevel) {
      score += 3;
      items.push({ icon: '🎓', text: `Same education: ${c.educationLevel}`, color: 'green' });
    } else if (educationLevelsClose(s.educationLevel, c.educationLevel)) {
      score += 2;
    }
  } else { score += 1.5; }

  // Family closeness (2 pts) — small but real signal
  if (s.familyCloseness && c.familyCloseness && s.familyCloseness === c.familyCloseness) {
    score += 2;
  } else { score += 1; }

  return { score: Math.min(5, score), max: 5, items };
}

function educationLevelsClose(a: string, b: string): boolean {
  const order = ['High School', 'Trade School', `Bachelor's`, `Master's`, 'PhD'];
  const ai = order.indexOf(a); const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// ============================================================================
// STAGE 3 — PROMPT MATCHING (natural language → +0–30 bonus)
// ============================================================================

/**
 * Score how well the candidate matches the user's prompt. Returns 0–30.
 *
 * Approach:
 *  1. Tokenize prompt into meaningful keywords (drop fillers).
 *  2. For each keyword, check:
 *     a. Direct text match in candidate's serialized profile blob
 *     b. Synonym/intent match via SYNONYM_MAP
 *  3. Score = (matched_keywords / total_keywords) × 30, with 0-keyword prompt = 0.
 */
function scorePromptMatch(prompt: string, row: ProfileRow, candidate: UserProfile): number {
  if (!prompt || !prompt.trim()) return 0;

  const keywords = tokenizePrompt(prompt);
  if (keywords.length === 0) return 0;

  // Serialize candidate profile to a single lowercase blob for text search.
  const blob = serializeProfile(row).toLowerCase();

  let matched = 0;
  for (const keyword of keywords) {
    if (matchesKeyword(keyword, blob, candidate)) {
      matched++;
    }
  }

  return Math.round((matched / keywords.length) * 30);
}

// Filler words to drop from prompts.
const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'she', 'it', 'they', 'them', 'their', 'his', 'her', 'hers',
  'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how',
  'this', 'that', 'these', 'those',
  'in', 'on', 'at', 'by', 'to', 'of', 'with', 'about', 'from', 'as',
  'than', 'then', 'into', 'over', 'under',
  'someone', 'somebody', 'something', 'somewhere',
  'looking', 'want', 'wants', 'wanting', 'need', 'needs', 'like', 'likes',
  'find', 'finding', 'partner',
]);

function tokenizePrompt(prompt: string): string[] {
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER_WORDS.has(w));

  // Also extract 2-word phrases for things like "loves hiking", "wants kids"
  // For simplicity, we'll just use the unigrams. Bigrams could be added later.

  return Array.from(new Set(cleaned));
}

// Map keywords to alternative search terms or specific field checks.
const SYNONYM_MAP: Record<string, string[]> = {
  // Career
  lawyer: ['lawyer', 'attorney', 'legal', 'law'],
  doctor: ['doctor', 'physician', 'md', 'medical'],
  engineer: ['engineer', 'engineering', 'developer', 'programmer'],
  teacher: ['teacher', 'professor', 'educator', 'lecturer'],
  artist: ['artist', 'painter', 'designer', 'creative'],
  entrepreneur: ['entrepreneur', 'founder', 'ceo', 'startup', 'business owner'],

  // Hobbies
  hiking: ['hike', 'hiking', 'trekking', 'trail', 'outdoor'],
  reading: ['read', 'reading', 'books', 'novel', 'literature'],
  cooking: ['cook', 'cooking', 'chef', 'food', 'culinary'],
  yoga: ['yoga', 'meditation', 'mindfulness'],
  music: ['music', 'musician', 'guitar', 'piano', 'sing'],
  travel: ['travel', 'travelling', 'wanderlust', 'explorer', 'nomad'],
  fitness: ['gym', 'fitness', 'workout', 'exercise', 'crossfit'],
  dance: ['dance', 'dancing', 'dancer'],
  photography: ['photo', 'photography', 'photographer', 'camera'],

  // Personality
  ambitious: ['ambitious', 'driven', 'motivated', 'go-getter', 'entrepreneur'],
  funny: ['funny', 'humor', 'humour', 'comedian', 'witty'],
  kind: ['kind', 'caring', 'compassionate', 'empathetic'],
  introvert: ['introvert', 'introverted', 'homebody', 'quiet'],
  extrovert: ['extrovert', 'extroverted', 'social', 'outgoing'],

  // Lifestyle
  vegetarian: ['vegetarian', 'veg'],
  vegan: ['vegan'],
  fit: ['fit', 'athletic', 'gym', 'fitness'],
};

function matchesKeyword(keyword: string, blob: string, candidate: UserProfile): boolean {
  // Direct match
  if (blob.includes(keyword)) return true;

  // Synonym match
  const synonyms = SYNONYM_MAP[keyword];
  if (synonyms) {
    for (const syn of synonyms) {
      if (blob.includes(syn)) return true;
    }
  }

  // Special intent matches
  if (keyword === 'kids' || keyword === 'children' || keyword === 'family') {
    if (candidate.familyPlans?.toLowerCase().includes('want')) return true;
  }
  if (keyword === 'marriage' || keyword === 'married') {
    if (candidate.datingIntention === 'Marriage') return true;
  }

  return false;
}

function serializeProfile(row: ProfileRow): string {
  // All text fields concatenated for full-text search
  return [
    row.name, row.description, row.hobbies, row.job_title, row.work,
    row.university, row.location, row.hometown, row.religion, row.politics,
    row.ethnicity, row.languages, row.height, row.body_type,
    row.dating_intention, row.relationship_type, row.family_plans, row.children,
    row.marriage_timeline, row.drinking, row.smoking, row.marijuana, row.drugs,
    row.gym_routine, row.dietary_preferences, row.travel_style, row.sleep_schedule,
    row.education_level, row.love_language, row.social_battery, row.attachment_style,
    row.conflict_resolution, row.financial_approach, row.music_genre, row.future_plans,
    row.hair_color, row.eye_color, row.clothing_style, row.has_tattoos,
    row.zodiac, row.next_travel_destination, row.living_preference, row.work_style,
    row.sports_interest, row.reading_interest, row.can_cook, row.dream_house_type,
    row.pets, row.therapy_history, row.childhood_description, row.sex_style,
    row.favorite_drink,
  ]
    .filter(Boolean)
    .join(' ');
}
