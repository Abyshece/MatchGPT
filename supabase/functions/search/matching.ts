// ============================================================================
// Matching: filters, prompt understanding and compatibility scoring.
//
// Used by the `search` edge function. No imports, so it can be tested on its
// own. (Until Phase 9 this ran in the browser, in lib/matchingService.ts.)
//
// For one searcher and the pool from search_candidates():
//   1. Each candidate is seen the way other users see them: fields they marked
//      hidden count as not filled in, for filters, prompt matching and scoring
//      alike, so nothing in the results can reveal a hidden answer.
//   2. Hard filters: the filter panel, plus what the prompt asks for ("near
//      me", "online", "under 30", "doesn't smoke", "a woman", ...)
//   3. Score: 0–100 across 8 dimensions (weights below), plus up to +30 for how
//      much of the prompt the profile matches; the total is capped at 100
//   4. The top N, with only the fields the profile screen shows
//
// Weights: relationship goals 20, lifestyle 15, values 15, location and
// background 15, age 10, personality 10, physical 5, education and family 5.
// ============================================================================

export type Row = Record<string, unknown> & { id: string };
// A profile with camelCase keys; empty and hidden fields are left out.
// deno-lint-ignore no-explicit-any
type Profile = Record<string, any>;

export interface CompatibilityItem {
  icon: string;
  text: string;
  color?: string;
}

export interface FilterOptions {
  isOnline?: boolean;
  recentlyActive?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  hasLinkedin?: boolean;
  hasInstagram?: boolean;
  neighborhood?: string;
  ageRange?: [number, number];
  ethnicity?: string;
  religion?: string;
  relationshipType?: string;
  height?: string;
  datingIntention?: string;
  children?: string;
  familyPlans?: string;
  drugs?: string;
  smoking?: string;
  marijuana?: string;
  drinking?: string;
  politics?: string;
  educationLevel?: string;
}

export interface MatchCandidate {
  id: string;
  name: string;
  age: number;
  location: string;
  compatibilityScore: number;
  compatibilityReport: CompatibilityItem[];
  tags: string[];
  bio: string;
  imageUrls: string[];
  isOnline: boolean;
  isVerified: boolean;
  isPremium: boolean;
  subscriptionTier: 'FREE' | 'PRO';
  hiddenFields: string[];
  [detail: string]: unknown;
}

// The detail fields the profile screen (ProfileModal) shows. Nothing else
// about other people is sent to the browser.
const SHOWN_FIELDS = [
  'jobTitle', 'work', 'workStyle', 'university', 'educationLevel', 'hometown',
  'height', 'ethnicity', 'religion', 'politics', 'zodiac', 'languages',
  'datingIntention', 'relationshipType', 'marriageTimeline', 'children', 'familyPlans',
  'loveLanguage', 'drinking', 'smoking', 'marijuana', 'drugs', 'gymRoutine',
  'dietaryPreferences', 'sleepSchedule', 'livingPreference', 'canCook',
  'socialBattery', 'attachmentStyle', 'conflictResolution', 'financialApproach',
  'hobbies', 'travelStyle', 'musicGenre', 'sportsInterest', 'readingInterest',
  'nextTravelDestination', 'linkedin', 'instagram',
];

// ============================================================================
// Profiles
// ============================================================================

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function isFilledIn(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && value !== 'Not specified';
}

// The searcher's own profile, everything included.
export function ownProfile(row: Row): Profile {
  const p: Profile = {};
  for (const [key, value] of Object.entries(row)) {
    if (isFilledIn(value)) p[toCamel(key)] = value;
  }
  return p;
}

// Someone else's profile as other users see it: hidden fields left out.
function asSeenByOthers(row: Row): Profile {
  const p = ownProfile(row);
  for (const key of (row.hidden_fields as string[] | null) ?? []) delete p[key];
  return p;
}

// "Online" means active in the last 5 minutes (the app records activity every
// 2 minutes while open), unless the person turned Active Status off.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function activeWithin(row: Row, windowMs: number, now: number): boolean {
  if (row.settings_show_online === false || !row.last_active_at) return false;
  return now - Date.parse(String(row.last_active_at)) <= windowMs;
}

type Gender = 'woman' | 'man' | 'nonbinary';

// Whole words only, women first ("female" contains "male").
function genderOf(value: unknown): Gender | null {
  const g = String(value ?? '').toLowerCase();
  if (/\b(woman|women|female|girls?|lady|ladies)\b/.test(g)) return 'woman';
  if (/\b(man|men|male|guys?)\b/.test(g)) return 'man';
  if (/\bnon-?binary\b/.test(g)) return 'nonbinary';
  return null;
}

// Loose: "Mumbai" matches "Mumbai, MH" and "Navi Mumbai".
function sameCity(a: string, b: string): boolean {
  const city = (s: string) => s.toLowerCase().split(',')[0].trim();
  return city(a) === city(b) || city(a).includes(city(b)) || city(b).includes(city(a));
}

// Same state or country: the last comma-separated part matches.
function sameRegion(a: string, b: string): boolean {
  const region = (s: string) => {
    const parts = s.toLowerCase().split(',').map((x) => x.trim());
    return parts[parts.length - 1] || parts[0];
  };
  return region(a) === region(b);
}

// ============================================================================
// Filters sent by the browser
// ============================================================================

const BOOLEAN_FILTERS = ['isOnline', 'recentlyActive', 'isVerified', 'isPremium', 'hasLinkedin', 'hasInstagram'] as const;
const TEXT_FILTERS = [
  'neighborhood', 'ethnicity', 'religion', 'relationshipType', 'height', 'datingIntention',
  'children', 'familyPlans', 'drugs', 'smoking', 'marijuana', 'drinking', 'politics', 'educationLevel',
] as const;

// Keep only known filters with values of the right type.
export function sanitizeFilters(input: unknown): FilterOptions {
  const filters: FilterOptions = {};
  if (!input || typeof input !== 'object') return filters;
  const src = input as Record<string, unknown>;
  for (const key of BOOLEAN_FILTERS) if (src[key] === true) filters[key] = true;
  for (const key of TEXT_FILTERS) {
    const value = src[key];
    if (typeof value === 'string' && value.trim()) filters[key] = value.trim().slice(0, 100);
  }
  const range = src.ageRange;
  if (Array.isArray(range) && range.length === 2 && range.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    filters.ageRange = [Math.min(range[0], range[1]), Math.max(range[0], range[1])];
  }
  return filters;
}

// ============================================================================
// Understanding the prompt
// ============================================================================

// Lower case, "doesn't" → "does not", punctuation → spaces, plurals trimmed
// ("hikers" → "hiker"). Prompt and profile text go through the same steps and
// are compared as whole words, so "man" never matches "woman".
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/n['’]t\b/g, ' not')
    .replace(/(\d)['’]s\b/g, '$1s')   // 20's → 20s
    .replace(/['’]s\b/g, '')          // master's → master
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(stem)
    .join(' ');
}

const normalizeAll = (words: string[]) => words.map(normalize);

// Words that carry no meaning for matching.
const FILLER_WORDS = new Set(normalizeAll([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'shall',
  'and', 'but', 'so', 'yet', 'for', 'if', 'then', 'than',
  'i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'yourself', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs',
  'who', 'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how',
  'this', 'that', 'these', 'those', 'there', 'here',
  'in', 'on', 'at', 'by', 'to', 'of', 'with', 'about', 'from', 'as', 'into',
  'over', 'under', 'up', 'out', 'off', 'onto',
  'some', 'any', 'all', 'every', 'each', 'only', 'just', 'really', 'very', 'also', 'too',
  'more', 'most', 'much', 'many', 'lot', 'lots', 'bit', 'little', 'quite',
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'everyone', 'everybody',
  'person', 'people', 'profile', 'profiles', 'one', 'ones',
  'looking', 'look', 'want', 'wants', 'wanting', 'need', 'needs', 'find', 'finding',
  'show', 'showing', 'search', 'searching', 'get', 'give', 'see', 'meet', 'meeting',
  'partner', 'partners', 'match', 'matches', 'compatible', 'ideal', 'perfect', 'best',
  'good', 'great', 'nice', 'potential', 'special', 'date', 'dating', 'relationship',
  'like', 'likes', 'love', 'loves', 'lover', 'lovers', 'loving', 'enjoy', 'enjoys',
  'fan', 'fans', 'type', 'please', 'thanks', 'hi', 'hello', 'hey', 'ok', 'okay',
  'down', 'sure', 'well', 'able',
]));

const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'non', 'dont', 'doesnt', 'isnt', 'arent', 'didnt', 'wont', 'cannot']);

const GENDER_WORDS = new Map<string, Gender>([
  ...normalizeAll(['woman', 'women', 'female', 'girl', 'lady', 'ladies', 'gal', 'bride', 'wife'])
    .map((w): [string, Gender] => [w, 'woman']),
  ...normalizeAll(['man', 'men', 'male', 'guy', 'boy', 'gentleman', 'gentlemen', 'dude', 'groom', 'husband'])
    .map((w): [string, Gender] => [w, 'man']),
]);
// "wife" and "husband" also say "marriage", so they stay in the prompt.
const GENDER_WORDS_KEPT = new Set(normalizeAll(['wife', 'husband']));

// Close alternatives: any of them in a profile counts as a match.
const SYNONYMS: string[][] = [
  ['lawyer', 'attorney', 'advocate', 'legal', 'law'],
  ['doctor', 'physician', 'surgeon', 'medical', 'mbbs', 'dentist'],
  ['engineer', 'engineering', 'developer', 'programmer', 'software', 'coder'],
  ['teacher', 'professor', 'educator', 'lecturer', 'teaching'],
  ['artist', 'painter', 'designer', 'creative', 'art', 'painting'],
  ['entrepreneur', 'founder', 'ceo', 'startup', 'business owner'],
  ['hike', 'hiking', 'hiker', 'trek', 'trekking', 'trail', 'outdoor', 'outdoorsy', 'mountain'],
  ['yoga', 'meditation', 'meditate', 'mindfulness'],
  ['music', 'musician', 'guitar', 'piano', 'sing', 'singing', 'singer'],
  ['dance', 'dancing', 'dancer'],
  ['photo', 'photography', 'photographer', 'camera'],
  ['movie', 'film', 'cinema'],
  ['coffee', 'cafe', 'espresso'],
  ['tea', 'chai'],
  ['ambitious', 'driven', 'motivated', 'go getter', 'career oriented', 'hardworking', 'hard working'],
  ['funny', 'humor', 'humour', 'witty', 'comedy', 'comedian'],
  ['kind', 'caring', 'compassionate', 'empathetic', 'gentle'],
  ['early bird', 'morning person'],
  ['night owl', 'night person'],
].map(normalizeAll);

type Answer = boolean | undefined;  // does the profile say yes, no, or nothing?

// Questions a profile answers with a field. For "doesn't smoke" style
// prompts, `strictWhenNot` leaves out people who clearly do.
interface Intent {
  words: string[];
  answer: (p: Profile) => Answer;
  strictWhenNot?: boolean;
  alsoText?: boolean;   // a mention in the bio or hobbies counts too
  flips?: string[];     // words that mean the opposite ("sober" = not drinking)
}

function fieldAnswer(field: string, yes: string[], no: string[]) {
  return (p: Profile): Answer => {
    const value = p[field];
    if (yes.includes(value)) return true;
    if (no.includes(value)) return false;
    return undefined;
  };
}

const LONG_TERM = ['Marriage', 'Long-term relationship', 'Long-term, open to short'];
const VEGGIE_DIETS = ['Vegetarian', 'Vegan', 'Eggetarian', 'Jain'];

const INTENT_LIST: Intent[] = [
  { words: ['smoke', 'smoking', 'smoker', 'cigarette', 'cig', 'tobacco', 'vape', 'vaping'],
    answer: fieldAnswer('smoking', ['Socially', 'Regularly'], ['No']), strictWhenNot: true },
  { words: ['drink', 'drinking', 'drinker', 'alcohol', 'booze', 'beer', 'wine', 'whisky', 'whiskey', 'cocktail'],
    flips: ['sober', 'teetotal', 'teetotaler', 'teetotaller'],
    answer: fieldAnswer('drinking', ['Socially', 'Regularly'], ['No']), strictWhenNot: true },
  { words: ['weed', 'marijuana', 'cannabis', 'pot', 'ganja', 'stoner', '420'],
    answer: fieldAnswer('marijuana', ['Socially', 'Regularly'], ['No']), strictWhenNot: true },
  { words: ['drug'],
    answer: fieldAnswer('drugs', ['Sometimes', 'Often'], ['No']), strictWhenNot: true },
  { words: ['kid', 'kiddo', 'child', 'children', 'baby'],
    answer: fieldAnswer('familyPlans',
      ['Wants children', 'Open to children', 'Already have, want more'],
      ['Does not want children', 'Already have, no more']) },
  { words: ['marriage', 'marry', 'married', 'wife', 'husband', 'spouse', 'shaadi', 'settle'],
    answer: (p) => (p.datingIntention ? p.datingIntention === 'Marriage' : undefined) },
  { words: ['serious', 'committed', 'commitment', 'long term', 'longterm'],
    answer: (p) => (p.datingIntention ? LONG_TERM.includes(p.datingIntention) : undefined) },
  { words: ['casual', 'fling', 'hookup', 'hook up', 'short term'],
    answer: (p) => {
      if (p.datingIntention === 'Casual / Dating' || p.relationshipType === 'Casual') return true;
      return p.datingIntention ? false : undefined;
    } },
  { words: ['friend', 'friendship', 'bff'],
    answer: (p) => (p.datingIntention ? p.datingIntention === 'Friendship' : undefined) },
  { words: ['religious', 'devout', 'practicing', 'practising'],
    answer: fieldAnswer('religion',
      ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Jewish'], ['Atheist', 'Agnostic']) },
  { words: ['vegetarian', 'veg', 'veggie'], alsoText: true,
    answer: (p) => (p.dietaryPreferences ? VEGGIE_DIETS.includes(p.dietaryPreferences) : undefined) },
  { words: ['vegan'], alsoText: true,
    answer: (p) => (p.dietaryPreferences ? p.dietaryPreferences === 'Vegan' : undefined) },
  { words: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal'], alsoText: true,
    answer: fieldAnswer('pets', ['Has pets', 'Wants pets'], ['No pets', 'Allergic']) },
  { words: ['cook', 'cooking', 'chef', 'foodie', 'baking', 'baker'], alsoText: true,
    answer: fieldAnswer('canCook', ['Excellent', 'Decent'], ["Can't cook", 'Basic']) },
  { words: ['gym', 'fitness', 'fit', 'workout', 'exercise', 'athletic', 'athlete'], alsoText: true,
    answer: fieldAnswer('gymRoutine', ['Daily', '3-4 times a week'], ['Never', 'Occasionally']) },
  { words: ['sport', 'sporty'], alsoText: true,
    answer: fieldAnswer('sportsInterest', ['Avid fan', 'I play, not watch'], ['Not interested']) },
  { words: ['reader', 'reading', 'read', 'book', 'bookworm', 'novel'], alsoText: true,
    answer: fieldAnswer('readingInterest', ['Avid reader'], ["I don't read much"]) },
  { words: ['travel', 'traveling', 'travelling', 'traveler', 'traveller', 'wanderlust', 'explorer', 'backpacking', 'backpacker'],
    alsoText: true,
    answer: (p) => {
      if (p.lovesTravel === 'Yes, frequently' || p.nextTravelDestination) return true;
      return p.lovesTravel === 'I prefer staying home' ? false : undefined;
    } },
  { words: ['introvert', 'introverted', 'homebody', 'quiet', 'shy'], alsoText: true,
    answer: fieldAnswer('socialBattery', ['Introvert', 'Homebody'], ['Extrovert', 'Social Butterfly']) },
  { words: ['extrovert', 'extroverted', 'outgoing', 'social', 'sociable', 'social butterfly'], alsoText: true,
    answer: fieldAnswer('socialBattery', ['Extrovert', 'Social Butterfly'], ['Introvert', 'Homebody']) },
  { words: ['tattoo', 'tattooed', 'inked'],
    answer: fieldAnswer('hasTattoos', ['Yes', 'A few small ones'], ['No']) },
];
const INTENTS: Intent[] = INTENT_LIST.map((intent) => ({
  ...intent, words: normalizeAll(intent.words), flips: normalizeAll(intent.flips ?? []),
}));

// Multi-word phrases are matched as one unit.
const PHRASES = Array.from(new Set([
  ...SYNONYMS.flat(),
  ...INTENTS.flatMap((i) => [...i.words, ...(i.flips ?? [])]),
  ...normalizeAll(['gluten free', 'open minded', 'family oriented']),
].filter((p) => p.includes(' ')))).sort((a, b) => b.length - a.length);

interface Term {
  phrases: string[];   // any of these in the profile text is a match
  negated: boolean;
  intent?: Intent;
}

interface ParsedPrompt {
  terms: Term[];
  nearMe: boolean;
  online: boolean;
  recentlyActive: boolean;
  verified: boolean;
  gender: Gender | null;
  ageRange: [number, number] | null;
}

function takeAge(text: string): { text: string; range: [number, number] | null } {
  let min = 18;
  let max = 99;
  let found = false;
  const clamp = (n: number) => Math.min(99, Math.max(18, n));
  const rules: Array<[RegExp, (m: RegExpMatchArray) => void]> = [
    [/\b(?:between )?([1-9]\d) (?:to |and )?([1-9]\d)\b/, (m) => {
      const a = Number(m[1]); const b = Number(m[2]);
      if (a < b) { min = Math.max(min, a); max = Math.min(max, b); found = true; }
    }],
    [/\b(early |mid |late )?([2-6]0)s\b/, (m) => {
      const decade = Number(m[2]);
      const [from, to] = m[1] === 'early ' ? [0, 3] : m[1] === 'mid ' ? [3, 6] : m[1] === 'late ' ? [6, 9] : [0, 9];
      min = Math.max(min, decade + from); max = Math.min(max, decade + to); found = true;
    }],
    [/\b(under|below|younger than|less than|up to|upto|max|maximum) ([1-9]\d)\b/, (m) => {
      const n = Number(m[2]);
      max = Math.min(max, ['up to', 'upto', 'max', 'maximum'].includes(m[1]) ? n : n - 1); found = true;
    }],
    [/\b(over|above|older than|more than|at least|min|minimum) ([1-9]\d)\b/, (m) => {
      const n = Number(m[2]);
      min = Math.max(min, ['at least', 'min', 'minimum'].includes(m[1]) ? n : n + 1); found = true;
    }],
    [/\b(?:aged? )?([1-9]\d) (?:year old|yr old|yo)\b|\baged? ([1-9]\d)\b/, (m) => {
      const n = Number(m[1] ?? m[2]);
      min = Math.max(min, n - 2); max = Math.min(max, n + 2); found = true;
    }],
  ];
  for (const [pattern, apply] of rules) {
    const m = text.match(pattern);
    if (m) {
      apply(m);
      text = text.replace(pattern, ' ');
    }
  }
  return { text, range: found ? [clamp(min), clamp(max)] : null };
}

function take(text: string, pattern: RegExp): { text: string; found: boolean } {
  const found = pattern.test(text);
  return { text: found ? text.replace(pattern, ' ') : text, found };
}

const INTENT_BY_WORD = new Map<string, { intent: Intent; flipped: boolean }>();
for (const intent of INTENTS) {
  for (const w of intent.words) INTENT_BY_WORD.set(w, { intent, flipped: false });
  for (const w of intent.flips ?? []) INTENT_BY_WORD.set(w, { intent, flipped: true });
}

export function parsePrompt(prompt: string): ParsedPrompt {
  let text = normalize(prompt.slice(0, 500));

  const age = takeAge(text);
  text = age.text;
  const near = take(text, /\b(near me|nearby|near by|close to me|close by|around me|in my (city|area|town)|same city|local)\b/g);
  text = near.text;
  const recent = take(text, /\b(recently active|active recently|active this week)\b/g);
  text = recent.text;
  const online = take(text, /\b(online now|online|active now|currently active|available now)\b/g);
  text = online.text;
  const verified = take(text, /\bverified\b/g);
  text = verified.text;
  const nonbinary = take(text, /\b(non binary|nonbinary|enby)\b/g);
  text = nonbinary.text;
  for (const phrase of PHRASES) {
    text = (' ' + text + ' ').split(' ' + phrase + ' ').join(' ' + phrase.replace(/ /g, '_') + ' ').trim();
  }

  const genders = new Set<Gender>(nonbinary.found ? ['nonbinary'] : []);
  const terms: Term[] = [];
  const seen = new Set<string>();
  let negateNext = false;
  let lastWasNegated = false;
  let lastWasTerm = false;

  for (const token of text.split(' ').filter(Boolean)) {
    if (NEGATIONS.has(token)) { negateNext = true; lastWasTerm = false; continue; }
    // "doesn't smoke or drink": the "not" carries over
    if (token === 'or' || token === 'nor') { if (lastWasNegated) negateNext = true; lastWasTerm = false; continue; }
    // "smoke free"
    if (token === 'free' && lastWasTerm) {
      const last = terms[terms.length - 1];
      last.negated = !last.negated;
      lastWasTerm = false;
      continue;
    }
    const gender = GENDER_WORDS.get(token);
    if (gender) {
      if (!negateNext) genders.add(gender);
      if (!GENDER_WORDS_KEPT.has(token)) { negateNext = false; lastWasTerm = false; continue; }
    }
    if (FILLER_WORDS.has(token) || token.length < 3 || (/^\d+$/.test(token) && !INTENT_BY_WORD.has(token))) {
      lastWasTerm = false;
      continue;
    }

    const word = token.replace(/_/g, ' ');
    const known = INTENT_BY_WORD.get(word);
    const negated = known?.flipped ? !negateNext : negateNext;
    const key = (known ? `intent:${INTENTS.indexOf(known.intent)}` : `word:${word}`) + (negated ? ':not' : '');
    // A repeated word adds nothing (and "free" after it has nothing to flip)
    lastWasTerm = !seen.has(key);
    if (lastWasTerm) {
      seen.add(key);
      const group = SYNONYMS.find((g) => g.includes(word));
      terms.push({
        phrases: known ? known.intent.words : group ?? [word],
        negated,
        intent: known?.intent,
      });
    }
    lastWasNegated = negated;
    negateNext = false;
  }

  return {
    terms,
    nearMe: near.found,
    online: online.found,
    recentlyActive: recent.found,
    verified: verified.found,
    gender: genders.size === 1 ? [...genders][0] : null,
    ageRange: age.range,
  };
}

// Profile text the prompt is matched against. Yes/no style answers are left
// out ("No pets" would match "pets"); the intents above read those fields.
const TEXT_FIELDS = [
  'name', 'description', 'hobbies', 'jobTitle', 'work', 'workStyle', 'university', 'educationLevel',
  'location', 'hometown', 'religion', 'politics', 'ethnicity', 'languages', 'zodiac',
  'bodyType', 'hairColor', 'eyeColor', 'clothingStyle',
  'datingIntention', 'relationshipType', 'marriageTimeline',
  'dietaryPreferences', 'sleepSchedule', 'livingPreference', 'travelStyle', 'musicGenre',
  'nextTravelDestination', 'favoriteDrink', 'futurePlans', 'dreamHouseType',
  'loveLanguage', 'socialBattery', 'attachmentStyle', 'conflictResolution', 'financialApproach',
];

function profileText(p: Profile): string {
  return ' ' + normalize(TEXT_FIELDS.map((f) => p[f]).filter((v) => typeof v === 'string').join(' . ')) + ' ';
}

const mentions = (text: string, phrases: string[]) => phrases.some((ph) => text.includes(' ' + ph + ' '));

// Does the profile satisfy this part of the prompt?
function satisfies(term: Term, p: Profile, text: string): boolean {
  if (!term.intent) return mentions(text, term.phrases) !== term.negated;
  const answer = term.intent.answer(p);
  if (term.negated) return answer === false;
  return answer === true || (answer === undefined && !!term.intent.alsoText && mentions(text, term.phrases));
}

// Up to +30: the share of the prompt's terms the profile satisfies.
function promptBonus(parsed: ParsedPrompt, p: Profile): number {
  if (parsed.terms.length === 0) return 0;
  const text = profileText(p);
  const matched = parsed.terms.filter((term) => satisfies(term, p, text)).length;
  return Math.round((matched / parsed.terms.length) * 30);
}

// ============================================================================
// Hard filters
// ============================================================================

function passesFilters(
  row: Row, c: Profile, me: Profile, filters: FilterOptions, parsed: ParsedPrompt, now: number,
): boolean {
  // Age: the filter panel and the prompt combined. Someone whose age isn't
  // shown can't be confirmed to fit, so they're left out.
  const ranges = [filters.ageRange, parsed.ageRange].filter(Boolean) as [number, number][];
  if (ranges.length > 0) {
    const min = Math.max(...ranges.map((r) => r[0]));
    const max = Math.min(...ranges.map((r) => r[1]));
    if (typeof c.age !== 'number' || c.age < min || c.age > max) return false;
  }

  if (filters.neighborhood) {
    const hay = `${c.location ?? ''} ${c.hometown ?? ''}`.toLowerCase();
    if (!hay.includes(filters.neighborhood.toLowerCase())) return false;
  }
  if (parsed.nearMe && me.location) {
    if (!c.location || !(sameCity(me.location, c.location) || sameRegion(me.location, c.location))) return false;
  }

  if ((filters.isVerified || parsed.verified) && row.is_verified !== true) return false;
  if ((filters.isOnline || parsed.online) && !activeWithin(row, ONLINE_WINDOW_MS, now)) return false;
  if ((filters.recentlyActive || parsed.recentlyActive) && !activeWithin(row, RECENT_WINDOW_MS, now)) return false;
  if (filters.isPremium && row.subscription_tier !== 'PRO') return false;
  if (filters.hasLinkedin && !c.linkedin) return false;
  if (filters.hasInstagram && !c.instagram) return false;

  // "a woman", "men": the person's gender, as for the gender preferences.
  if (parsed.gender && genderOf(row.gender) !== parsed.gender) return false;

  // Exact-value filters: the person must show that answer.
  const exact: (keyof FilterOptions)[] = [
    'ethnicity', 'religion', 'relationshipType', 'datingIntention', 'children', 'familyPlans',
    'educationLevel', 'politics', 'height', 'smoking', 'drinking', 'marijuana', 'drugs',
  ];
  for (const key of exact) {
    if (filters[key] && c[key] !== filters[key]) return false;
  }

  // "doesn't smoke": leave out people who say they do
  for (const term of parsed.terms) {
    if (term.negated && term.intent?.strictWhenNot && term.intent.answer(c) === true) return false;
  }
  return true;
}

// ============================================================================
// Compatibility score
// ============================================================================

interface Dimension {
  score: number;
  items: CompatibilityItem[];
}

// Relationship goals (max 20) — the most important dimension
function scoreRelationshipGoals(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Dating intention (8) — exact match best, "marriage" vs "long-term" still ok
  if (s.datingIntention && c.datingIntention) {
    if (s.datingIntention === c.datingIntention) {
      score += 8;
      items.push({ icon: '💍', text: `Both looking for ${c.datingIntention.toLowerCase()}`, color: 'green' });
    } else if (LONG_TERM.includes(s.datingIntention) && LONG_TERM.includes(c.datingIntention)) {
      score += 5;
      items.push({ icon: '🤝', text: 'Similar relationship intent', color: 'amber' });
    } else {
      items.push({ icon: '⚠️', text: `Different intent (${s.datingIntention} vs ${c.datingIntention})`, color: 'red' });
    }
  } else {
    score += 4;
  }

  // Marriage timeline (5)
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

  // Family plans (4) — high stakes
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
      items.push({ icon: '🚨', text: 'Major mismatch on having children', color: 'red' });
    }
  } else {
    score += 2;
  }

  // Relationship type (3)
  if (s.relationshipType && c.relationshipType) {
    if (s.relationshipType === c.relationshipType) score += 3;
  } else {
    score += 1.5;
  }

  return { score: Math.min(20, score), items };
}

function closeTimelines(a: string, b: string): boolean {
  const order = ['ASAP', 'Within 6 months', 'Within 1 year', '1-2 years', '3-5 years', '5+ years', 'Not sure yet'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// Lifestyle (max 15)
function scoreLifestyle(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Drinking, smoking, cannabis (2 each)
  const vices: Array<[string, string]> = [
    ['drinking', 'drinking habits'],
    ['smoking', 'smoking habits'],
    ['marijuana', 'cannabis habits'],
  ];
  let viceMatches = 0;
  for (const [key, label] of vices) {
    const sv = s[key];
    const cv = c[key];
    if (sv && cv) {
      if (sv === cv) { score += 2; viceMatches++; }
      else if (vicesSimilar(sv, cv)) score += 1;
      else if (sv === 'No' && cv === 'Regularly') {
        items.push({ icon: '⚠️', text: `Different ${label}`, color: 'red' });
      }
    } else {
      score += 1;
    }
  }
  if (viceMatches >= 2) items.push({ icon: '🍸', text: 'Aligned lifestyle habits', color: 'green' });

  // Diet (2)
  if (s.dietaryPreferences && c.dietaryPreferences) {
    if (s.dietaryPreferences === c.dietaryPreferences) {
      score += 2;
      items.push({ icon: '🥗', text: `Both ${c.dietaryPreferences.toLowerCase()}`, color: 'green' });
    } else if (VEGGIE_DIETS.includes(s.dietaryPreferences) && VEGGIE_DIETS.includes(c.dietaryPreferences)) {
      score += 1;
    }
  } else {
    score += 1;
  }

  // Exercise (2)
  if (s.gymRoutine && c.gymRoutine) {
    if (s.gymRoutine === c.gymRoutine) {
      score += 2;
      if (c.gymRoutine === 'Daily' || c.gymRoutine === '3-4 times a week') {
        items.push({ icon: '💪', text: 'Both stay active', color: 'green' });
      }
    } else if (closeExerciseLevels(s.gymRoutine, c.gymRoutine)) {
      score += 1;
    }
  } else {
    score += 1;
  }

  // Sleep schedule (1)
  if (s.sleepSchedule && c.sleepSchedule && s.sleepSchedule === c.sleepSchedule) score += 1;
  else score += 0.5;

  // Living preference (2)
  if (s.livingPreference && c.livingPreference) {
    if (s.livingPreference === c.livingPreference) score += 2;
  } else {
    score += 1;
  }

  return { score: Math.min(15, score), items };
}

function vicesSimilar(a: string, b: string): boolean {
  const order = ['No', 'Socially', 'Regularly', 'Sometimes', 'Often'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

function closeExerciseLevels(a: string, b: string): boolean {
  const order = ['Never', 'Occasionally', '1-2 times a week', '3-4 times a week', 'Daily'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// Values (max 15) — religion, politics, money
function scoreValues(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Religion (6)
  if (s.religion && c.religion) {
    if (s.religion === c.religion) {
      score += 6;
      items.push({ icon: '🕉️', text: `Both ${c.religion}`, color: 'green' });
    } else if (['Spiritual', 'Agnostic', 'Atheist', 'Other'].some((r) => r === s.religion || r === c.religion)) {
      score += 3;
    } else {
      items.push({ icon: '⚠️', text: `Different religions (${s.religion} vs ${c.religion})`, color: 'amber' });
    }
  } else {
    score += 3;
  }

  // Politics (5)
  if (s.politics && c.politics) {
    if (s.politics === c.politics) {
      score += 5;
      items.push({ icon: '🗳️', text: `Both ${c.politics.toLowerCase()}`, color: 'green' });
    } else if (['Moderate', 'Apolitical'].some((x) => x === s.politics || x === c.politics)) {
      score += 2;
    } else if (
      (s.politics === 'Liberal' && c.politics === 'Conservative') ||
      (s.politics === 'Conservative' && c.politics === 'Liberal')
    ) {
      items.push({ icon: '⚠️', text: 'Different political views', color: 'red' });
    }
  } else {
    score += 2.5;
  }

  // Money (4)
  if (s.financialApproach && c.financialApproach) {
    if (s.financialApproach === c.financialApproach) {
      score += 4;
      items.push({ icon: '💰', text: `Same money mindset: ${c.financialApproach.toLowerCase()}`, color: 'green' });
    } else if (
      (s.financialApproach === 'Saver' && c.financialApproach === 'Spender') ||
      (s.financialApproach === 'Spender' && c.financialApproach === 'Saver')
    ) {
      items.push({ icon: '⚠️', text: 'Different financial styles', color: 'amber' });
    } else {
      score += 2;
    }
  } else {
    score += 2;
  }

  return { score: Math.min(15, score), items };
}

// Location and background (max 15)
function scoreLocationBackground(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Same city (8) — the biggest single signal
  if (s.location && c.location) {
    if (sameCity(s.location, c.location)) {
      score += 8;
      items.push({ icon: '📍', text: `Both in ${c.location}`, color: 'green' });
    } else if (sameRegion(s.location, c.location)) {
      score += 4;
    } else {
      items.push({ icon: '✈️', text: 'Different cities', color: 'amber' });
    }
  } else {
    score += 3;
  }

  // Shared languages (4)
  if (s.languages && c.languages) {
    const split = (x: string) => x.toLowerCase().split(/[,;/]/).map((l) => l.trim()).filter(Boolean);
    const theirs = split(c.languages);
    const shared = split(s.languages).filter((lang) => theirs.includes(lang));
    if (shared.length >= 2) {
      score += 4;
      items.push({ icon: '🗣️', text: `Speak ${shared.length} common languages`, color: 'green' });
    } else if (shared.length === 1) {
      score += 2;
    }
  } else {
    score += 2;
  }

  // Ethnicity and openness to an interracial marriage (3)
  if (s.ethnicity && c.ethnicity) {
    if (s.ethnicity === c.ethnicity) {
      score += 3;
    } else if (s.interracialMarriage === 'Yes' || c.interracialMarriage === 'Yes') {
      score += 2;
      items.push({ icon: '🌏', text: 'Open to interracial relationship', color: 'green' });
    } else if (
      ['No', 'Prefer same race'].includes(s.interracialMarriage) ||
      ['No', 'Prefer same race'].includes(c.interracialMarriage)
    ) {
      items.push({ icon: '⚠️', text: 'One side prefers same ethnicity', color: 'red' });
    } else {
      score += 1;
    }
  } else {
    score += 1.5;
  }

  return { score: Math.min(15, score), items };
}

// Age (max 10)
function scoreAge(s: Profile, c: Profile): Dimension {
  const items: CompatibilityItem[] = [];
  if (!s.age || !c.age) return { score: 5, items };

  const diff = Math.abs(s.age - c.age);
  let score: number;
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
  return { score, items };
}

// Personality (max 10)
function scorePersonality(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Social battery (3)
  if (s.socialBattery && c.socialBattery) {
    if (s.socialBattery === c.socialBattery) score += 3;
    else if (socialBatteriesCompatible(s.socialBattery, c.socialBattery)) score += 2;
  } else {
    score += 1.5;
  }

  // Attachment style (3)
  if (s.attachmentStyle && c.attachmentStyle) {
    if (s.attachmentStyle === 'Secure' && c.attachmentStyle === 'Secure') {
      score += 3;
      items.push({ icon: '💖', text: 'Both have secure attachment', color: 'green' });
    } else if (s.attachmentStyle === c.attachmentStyle) {
      score += 2;
    } else if (
      (s.attachmentStyle === 'Anxious' && c.attachmentStyle === 'Avoidant') ||
      (s.attachmentStyle === 'Avoidant' && c.attachmentStyle === 'Anxious')
    ) {
      items.push({ icon: '⚠️', text: 'Anxious-avoidant attachment pairing', color: 'red' });
    } else {
      score += 1;
    }
  } else {
    score += 1.5;
  }

  // Conflict style (2)
  if (s.conflictResolution && c.conflictResolution) {
    if (s.conflictResolution === c.conflictResolution) score += 2;
    else if (
      (s.conflictResolution === 'Calm discussion' && c.conflictResolution === 'Direct & assertive') ||
      (s.conflictResolution === 'Direct & assertive' && c.conflictResolution === 'Calm discussion')
    ) score += 1;
  } else {
    score += 1;
  }

  // Love language (2)
  if (s.loveLanguage && c.loveLanguage) {
    if (s.loveLanguage === c.loveLanguage) {
      score += 2;
      items.push({ icon: '💝', text: `Same love language: ${c.loveLanguage}`, color: 'green' });
    } else {
      score += 0.5;
    }
  } else {
    score += 1;
  }

  return { score: Math.min(10, score), items };
}

function socialBatteriesCompatible(a: string, b: string): boolean {
  const intro = ['Introvert', 'Homebody'];
  const extro = ['Extrovert', 'Social Butterfly'];
  return (intro.includes(a) && intro.includes(b)) || (extro.includes(a) && extro.includes(b)) ||
    a === 'Ambivert' || b === 'Ambivert';
}

// Physical (max 5): subjective, so a neutral 2.5 for everyone; the prompt and
// the other dimensions drive the ranking.
function scorePhysical(): Dimension {
  return { score: 2.5, items: [] };
}

// Education and family (max 5)
function scoreEducation(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  if (s.educationLevel && c.educationLevel) {
    if (s.educationLevel === c.educationLevel) {
      score += 3;
      items.push({ icon: '🎓', text: `Same education: ${c.educationLevel}`, color: 'green' });
    } else if (educationLevelsClose(s.educationLevel, c.educationLevel)) {
      score += 2;
    }
  } else {
    score += 1.5;
  }

  // Closeness to family (2)
  if (s.familyCloseness && c.familyCloseness && s.familyCloseness === c.familyCloseness) score += 2;
  else score += 1;

  return { score: Math.min(5, score), items };
}

function educationLevelsClose(a: string, b: string): boolean {
  const order = ['High School', 'Trade School', "Bachelor's", "Master's", 'PhD'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// ============================================================================
// Ranking
// ============================================================================

function toCandidate(row: Row, c: Profile, me: Profile, parsed: ParsedPrompt, now: number): MatchCandidate {
  const dimensions = [
    scoreRelationshipGoals(me, c),
    scoreLifestyle(me, c),
    scoreValues(me, c),
    scoreLocationBackground(me, c),
    scoreAge(me, c),
    scorePersonality(me, c),
    scorePhysical(),
    scoreEducation(me, c),
  ];
  const base = dimensions.reduce((sum, d) => sum + d.score, 0);
  const report = dimensions.flatMap((d) => d.items);
  const tier = row.subscription_tier === 'PRO' ? 'PRO' : 'FREE';

  const candidate: MatchCandidate = {
    id: row.id,
    name: c.name ?? '',
    age: c.age ?? 0,
    location: c.location ?? '',
    compatibilityScore: Math.min(100, Math.round(base + promptBonus(parsed, c))),
    compatibilityReport: report,
    // Highlights: the first three positives
    tags: report.filter((i) => i.color === 'green').slice(0, 3).map((i) => i.text),
    bio: c.description ?? '',
    imageUrls: (row.photo_urls as string[] | null) ?? [],
    isOnline: activeWithin(row, ONLINE_WINDOW_MS, now),
    isVerified: row.is_verified === true,
    isPremium: tier === 'PRO',
    subscriptionTier: tier,
    hiddenFields: (row.hidden_fields as string[] | null) ?? [],
  };
  for (const field of SHOWN_FIELDS) {
    if (c[field] !== undefined) candidate[field] = c[field];
  }
  return candidate;
}

// Rank the pool for the searcher: filters, then score, best first. Ties keep
// the pool's order (most recently active first).
export function rankCandidates(
  meRow: Row,
  pool: Row[],
  prompt: string,
  filters: FilterOptions,
  limit: number,
  now = Date.now(),
): { candidates: MatchCandidate[]; poolSize: number } {
  const me = ownProfile(meRow);
  const parsed = parsePrompt(prompt);
  const survivors = pool
    .map((row) => ({ row, c: asSeenByOthers(row) }))
    .filter(({ row, c }) => passesFilters(row, c, me, filters, parsed, now));
  const ranked = survivors
    .map(({ row, c }) => toCandidate(row, c, me, parsed, now))
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  return { candidates: ranked.slice(0, limit), poolSize: survivors.length };
}
