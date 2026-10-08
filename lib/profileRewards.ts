// ============================================================================
// Required details, and free searches for filling in the profile
//
// Required: what every member gives before using the app, kept to what
// families judge a match on first (asked at sign-up in about two minutes;
// members who joined before are asked for what's missing, RequiredDetails).
//
// Sections: everything else is optional and comes in six sections in My
// Profile, and each one a member completes (about 70% of its answers given)
// adds one free AI search a day: the free plan's (3 to start with; owners set
// it in Admin → Search insights) plus up to 6. The database decides
// (profile_sections(), latest in supabase/migrations/…_short_sign_up.sql) and
// keeps the count in profiles.search_bonus; this file reads it for My Profile
// and the pop-up that offers it (ProfileRewardsPopup).
// ============================================================================

import { supabase } from './supabase';
import { DAILY_LIMITS } from './profileService';
import type { UserProfile } from '../types';

/** The shortest "About me" that counts. */
export const ABOUT_ME_MIN = 30;

export type RequiredKey =
  | 'profileCreatedFor' | 'name' | 'dateOfBirth' | 'gender' | 'interestedIn'
  | 'maritalStatus' | 'height' | 'country' | 'state' | 'city' | 'religion' | 'motherTongue'
  | 'educationLevel' | 'occupation';

export const REQUIRED_LABELS: Record<RequiredKey, string> = {
  profileCreatedFor: 'Profile created for',
  name: 'Name',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  interestedIn: 'Interested in',
  maritalStatus: 'Marital status',
  height: 'Height',
  country: 'Country',
  state: 'State',
  city: 'City',
  religion: 'Religion',
  motherTongue: 'Mother tongue',
  educationLevel: 'Highest qualification',
  occupation: 'Occupation',
};

const given = (v: unknown) => typeof v === 'string' ? v.trim() !== '' && v !== 'Not specified' : v !== undefined && v !== null;

/** The required answers this profile doesn't have yet, in the order they're asked. */
export function missingRequired(profile: UserProfile): RequiredKey[] {
  const keys: RequiredKey[] = [
    'profileCreatedFor', 'name', 'dateOfBirth', 'gender', 'interestedIn', 'maritalStatus',
    'height', 'country', 'state', 'city', 'religion', 'motherTongue', 'educationLevel', 'occupation',
  ];
  return keys.filter((key) => {
    if (key === 'state') return (profile.country ?? '') === 'India' && !given(profile.state);
    return !given(profile[key]);
  });
}

// ---- Sections -------------------------------------------------------------------------------

export type SectionId = 'community' | 'career' | 'family' | 'lifestyle' | 'about' | 'plans';

export interface ProfileSection {
  id: SectionId;
  title: string;
  fields: { key: string; answered: boolean }[];   // database column names
  answered: number;
  total: number;
  needed: number;   // answers that complete it
  complete: boolean;
}

export interface ProfileSections {
  sections: ProfileSection[];
  bonus: number;                   // sections complete: free searches a day on top of the free plan's
  dailySearches: number | null;    // the member's own searches a day (null: no daily limit)
  freeDailySearches: number | null; // the free plan's, before the bonus (Admin → Search insights)
}

/** The signed-in member's sections, as the database counts them. */
export async function fetchProfileSections(): Promise<ProfileSections | null> {
  const { data, error } = await supabase.rpc('my_profile_sections');
  if (error || !data) return null;
  const d = data as unknown as { sections: ProfileSection[] | null; bonus: number; daily_searches: number | null; free_daily_searches?: number | null };
  return {
    sections: d.sections ?? [], bonus: d.bonus, dailySearches: d.daily_searches,
    freeDailySearches: d.free_daily_searches === undefined ? DAILY_LIMITS.FREE.searches : d.free_daily_searches,
  };
}

/** What My Profile calls each counted answer, for "answer these to finish it". */
export const SECTION_FIELD_LABELS: Record<string, string> = {
  caste: 'Caste', sub_caste: 'Sub-caste', sect: 'Sect', gotra: 'Gotra',
  open_to_other_communities: 'Other communities', languages: 'Languages', manglik: 'Manglik',
  rashi: 'Rashi', nakshatra: 'Nakshatra', birth_time: 'Time of birth', birth_place: 'Place of birth',
  horoscope_match: 'Horoscope match',
  degree: 'Degree', university: 'College / university', employed_in: 'Employed in', job_title: 'Job title',
  work: 'Workplace', work_style: 'Work style', annual_income: 'Annual income',
  family_type: 'Family type', family_status: 'Family status', family_values: 'Family values',
  father_occupation: "Father's occupation", mother_occupation: "Mother's occupation", brothers: 'Brothers',
  sisters: 'Sisters', family_location: 'Family lives in', living_with_family: 'Lives with family',
  family_closeness: 'Closeness to family', about_family: 'About my family',
  dietary_preferences: 'Diet', drinking: 'Drinking', smoking: 'Smoking', gym_routine: 'Exercise',
  sleep_schedule: 'Sleep schedule', can_cook: 'Cooking', hobbies: 'Hobbies', reading_interest: 'Reading',
  sports_interest: 'Sports', loves_travel: 'Travel', travel_style: 'Travel style',
  description: 'About me', hometown: 'Grew up in', body_type: 'Body type',
  marriage_timeline: 'Marriage timeline', family_plans: 'Children', settling_abroad: 'Settling abroad',
  social_battery: 'Introvert or extrovert', conflict_resolution: 'Disagreements', financial_approach: 'Money',
  future_plans: 'Next five years', pets: 'Pets',
};

// Answers you type take longer than a tap: rough seconds each, for the time
// a section takes (sectionMinutes)
const TYPED_SECONDS: Record<string, number> = {
  description: 120, about_family: 75, future_plans: 60,
  university: 15, job_title: 15, work: 15, family_location: 15, birth_place: 15, hometown: 15, birth_time: 15,
};
const TAP_SECONDS = 8;

/** About how long the answers still needed to complete a section take, in whole minutes (0 when it's complete). */
export function sectionMinutes(section: ProfileSection): number {
  const left = Math.max(0, section.needed - section.answered);
  if (!left) return 0;
  // The quickest answers first: what someone in a hurry would give
  const seconds = section.fields.filter((f) => !f.answered)
    .map((f) => TYPED_SECONDS[f.key] ?? TAP_SECONDS)
    .sort((a, b) => a - b)
    .slice(0, left)
    .reduce((sum, s) => sum + s, 0);
  return Math.max(1, Math.ceil(seconds / 60));
}

/** The answers still to give in a section, by name. */
export const unansweredLabels = (section: ProfileSection): string[] =>
  section.fields.filter((f) => !f.answered).map((f) => SECTION_FIELD_LABELS[f.key] ?? f.key);

// ---- The pop-up that offers them (ProfileRewardsPopup) ----------------------------------------
// Shown on the first visit after sign-up, then at most every few days until
// every section is complete. When it last showed is kept with the profile
// (profiles.profile_nudged_at), so it doesn't come back on another device.

const NUDGE_EVERY_DAYS = 3;
const nudgedThisVisit = new Set<string>();   // until the profile is read again

/** Whether it's time to show the pop-up again. */
export function profileNudgeDue(userId: string, nudgedAt: string | null | undefined, now = Date.now()): boolean {
  if (nudgedThisVisit.has(userId)) return false;
  return !nudgedAt || now - Date.parse(nudgedAt) >= NUDGE_EVERY_DAYS * 24 * 60 * 60 * 1000;
}

/** The pop-up showed: not again for a few days. */
export async function markProfileNudged(userId: string): Promise<void> {
  nudgedThisVisit.add(userId);
  await supabase.from('profiles').update({ profile_nudged_at: new Date().toISOString() }).eq('id', userId);
}
