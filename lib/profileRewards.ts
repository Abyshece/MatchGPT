// ============================================================================
// Required details, and free searches for filling in the profile
//
// Required: what every member gives before using the app (asked at sign-up;
// members who joined before are asked for what's missing, RequiredDetails).
//
// Sections: the optional answers come in six sections, and each one a member
// completes (about 70% of its answers given) adds one free AI search a day:
// 3 a day plus up to 6. The database decides (profile_sections() in
// supabase/migrations/…_phase10_profile_sections.sql) and keeps the count in
// profiles.search_bonus; this file reads it for My Profile.
// ============================================================================

import { supabase } from './supabase';
import type { UserProfile } from '../types';

/** The shortest "About me" that counts. */
export const ABOUT_ME_MIN = 30;

export type RequiredKey =
  | 'profileCreatedFor' | 'name' | 'dateOfBirth' | 'gender' | 'interestedIn'
  | 'maritalStatus' | 'height' | 'country' | 'state' | 'city' | 'religion' | 'motherTongue'
  | 'educationLevel' | 'occupation' | 'description';

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
  description: 'About me',
};

const given = (v: unknown) => typeof v === 'string' ? v.trim() !== '' && v !== 'Not specified' : v !== undefined && v !== null;

/** The required answers this profile doesn't have yet, in the order they're asked. */
export function missingRequired(profile: UserProfile): RequiredKey[] {
  const keys: RequiredKey[] = [
    'profileCreatedFor', 'name', 'dateOfBirth', 'gender', 'interestedIn', 'maritalStatus',
    'height', 'country', 'state', 'city', 'religion', 'motherTongue', 'educationLevel', 'occupation', 'description',
  ];
  return keys.filter((key) => {
    if (key === 'state') return (profile.country ?? '') === 'India' && !given(profile.state);
    if (key === 'description') return (profile.description ?? '').trim().length < ABOUT_ME_MIN;
    return !given(profile[key]);
  });
}

// ---- Sections -------------------------------------------------------------------------------

export type SectionId = 'community' | 'career' | 'family' | 'lifestyle' | 'appearance' | 'plans';

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
  bonus: number;           // sections complete: free searches a day on top of 3
  dailySearches: number;
}

/** The signed-in member's sections, as the database counts them. */
export async function fetchProfileSections(): Promise<ProfileSections | null> {
  const { data, error } = await supabase.rpc('my_profile_sections');
  if (error || !data) return null;
  const d = data as unknown as { sections: ProfileSection[] | null; bonus: number; daily_searches: number };
  return { sections: d.sections ?? [], bonus: d.bonus, dailySearches: d.daily_searches };
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
  body_type: 'Body type', hair_color: 'Hair colour', hair_type: 'Hair type', eye_color: 'Eye colour',
  wears_glasses: 'Glasses', has_tattoos: 'Tattoos', clothing_style: 'Style',
  marriage_timeline: 'Marriage timeline', family_plans: 'Children', settling_abroad: 'Settling abroad',
  love_language: 'Love language', social_battery: 'Social battery', attachment_style: 'Attachment style',
  conflict_resolution: 'Conflict style', financial_approach: 'Money', future_plans: '5-year vision',
  dream_house_type: 'Dream home', pets: 'Pets',
};

/** The answers still to give in a section, by name. */
export const unansweredLabels = (section: ProfileSection): string[] =>
  section.fields.filter((f) => !f.answered).map((f) => SECTION_FIELD_LABELS[f.key] ?? f.key);
