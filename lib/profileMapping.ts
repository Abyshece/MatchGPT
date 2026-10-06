// ============================================================================
// Profile Mapping
//
// The frontend uses camelCase (UserProfile from types.ts).
// The database uses snake_case (ProfileRow from database.types.ts).
// These helpers convert between the two so the rest of the code doesn't have
// to think about it.
//
// IMPORTANT: every time we add a new attribute to types.ts AND the database,
// add it to the FIELD_MAP below. Everything else flows from that.
// ============================================================================

import type { UserProfile, SubscriptionTier } from '../types';
import type { ProfileRow } from './database.types';

// Map from UserProfile (camelCase) key -> ProfileRow (snake_case) key.
// Only attribute fields belong here. Photos, hidden_fields, settings, and
// account meta are handled separately because they have non-trivial shapes.
const FIELD_MAP: Partial<Record<keyof UserProfile, keyof ProfileRow>> = {
  name: 'name',
  email: 'email',
  phoneNumber: 'phone_number',
  age: 'age',

  pronouns: 'pronouns',
  gender: 'gender',
  sexuality: 'sexuality',
  interestedIn: 'interested_in',

  location: 'location',
  hometown: 'hometown',
  ethnicity: 'ethnicity',
  race: 'race',
  nationalityCount: 'nationality_count',
  languages: 'languages',

  height: 'height',
  bodyType: 'body_type',

  hairColor: 'hair_color',
  hairType: 'hair_type',
  eyeColor: 'eye_color',
  facialHair: 'facial_hair',
  makeupRoutine: 'makeup_routine',
  clothingStyle: 'clothing_style',
  wearsGlasses: 'wears_glasses',
  wearsLenses: 'wears_lenses',
  wearsJewelry: 'wears_jewelry',
  bodyHair: 'body_hair',
  hasTattoos: 'has_tattoos',
  dressesWell: 'dresses_well',
  hygiene: 'hygiene',

  drinking: 'drinking',
  smoking: 'smoking',
  marijuana: 'marijuana',
  drugs: 'drugs',
  covidVaccine: 'covid_vaccine',
  drivesCar: 'drives_car',
  hasDriversLicense: 'has_drivers_license',
  livingPreference: 'living_preference',
  favoriteDrink: 'favorite_drink',
  canCook: 'can_cook',
  bakingInterest: 'baking_interest',
  shoppingPreference: 'shopping_preference',
  gymRoutine: 'gym_routine',
  sportsInterest: 'sports_interest',
  readingInterest: 'reading_interest',
  hobbies: 'hobbies',
  isOrganised: 'is_organised',
  snoring: 'snoring',
  phoneType: 'phone_type',

  lovesTravel: 'loves_travel',
  travelStyle: 'travel_style',
  nextTravelDestination: 'next_travel_destination',

  jobTitle: 'job_title',
  work: 'work',
  university: 'university',
  educationLevel: 'education_level',
  workStyle: 'work_style',

  religion: 'religion',
  politics: 'politics',
  zodiac: 'zodiac',
  therapyHistory: 'therapy_history',
  childhoodDescription: 'childhood_description',
  musicGenre: 'music_genre',
  familyHealthHistory: 'family_health_history',
  criminalRecord: 'criminal_record',

  futurePlans: 'future_plans',
  dreamHouseType: 'dream_house_type',

  loveLanguage: 'love_language',
  relationshipType: 'relationship_type',
  datingIntention: 'dating_intention',
  children: 'children',
  familyPlans: 'family_plans',
  pets: 'pets',
  marriageTimeline: 'marriage_timeline',
  sexStyle: 'sex_style',
  interracialMarriage: 'interracial_marriage',
  siblings: 'siblings',
  familyCloseness: 'family_closeness',
  financialSplitting: 'financial_splitting',

  conflictResolution: 'conflict_resolution',
  socialBattery: 'social_battery',
  dietaryPreferences: 'dietary_preferences',
  attachmentStyle: 'attachment_style',
  sleepSchedule: 'sleep_schedule',
  financialApproach: 'financial_approach',

  // Phase 12: India fields
  profileCreatedFor: 'profile_created_for',
  dateOfBirth: 'date_of_birth',
  maritalStatus: 'marital_status',
  childrenCount: 'children_count',
  heightCm: 'height_cm',
  disability: 'disability',
  motherTongue: 'mother_tongue',
  caste: 'caste',
  subCaste: 'sub_caste',
  sect: 'sect',
  openToOtherCommunities: 'open_to_other_communities',
  gotra: 'gotra',
  manglik: 'manglik',
  rashi: 'rashi',
  nakshatra: 'nakshatra',
  birthTime: 'birth_time',
  birthPlace: 'birth_place',
  horoscopeMatch: 'horoscope_match',
  degree: 'degree',
  employedIn: 'employed_in',
  occupation: 'occupation',
  annualIncome: 'annual_income',
  country: 'country',
  state: 'state',
  city: 'city',
  residentialStatus: 'residential_status',
  settlingAbroad: 'settling_abroad',
  familyType: 'family_type',
  familyStatus: 'family_status',
  familyValues: 'family_values',
  fatherOccupation: 'father_occupation',
  motherOccupation: 'mother_occupation',
  brothers: 'brothers',
  brothersMarried: 'brothers_married',
  sisters: 'sisters',
  sistersMarried: 'sisters_married',
  familyLocation: 'family_location',
  livingWithFamily: 'living_with_family',
  aboutFamily: 'about_family',

  description: 'description',
  linkedin: 'linkedin',
  instagram: 'instagram',
  facebook: 'facebook',
  twitter: 'twitter',
};

// ----------------------------------------------------------------------------
// DB row → UI profile
// ----------------------------------------------------------------------------

export function rowToProfile(row: ProfileRow): UserProfile {
  // start with safe defaults that satisfy UserProfile's required fields
  const profile: UserProfile = {
    name: row.name ?? '',
    age: row.age,
    pronouns: row.pronouns ?? '',
    gender: row.gender ?? '',
    sexuality: row.sexuality ?? '',
    interestedIn: row.interested_in ?? '',
    work: row.work ?? '',
    jobTitle: row.job_title ?? '',
    university: row.university ?? '',
    educationLevel: row.education_level ?? '',
    religion: row.religion ?? '',
    politics: row.politics ?? '',
    hometown: row.hometown ?? '',
    location: row.location ?? '',
    height: row.height ?? '',
    ethnicity: row.ethnicity ?? '',
    children: row.children ?? '',
    familyPlans: row.family_plans ?? '',
    covidVaccine: row.covid_vaccine ?? '',
    pets: row.pets ?? '',
    zodiac: row.zodiac ?? '',
    languages: row.languages ?? '',
    datingIntention: row.dating_intention ?? '',
    relationshipType: row.relationship_type ?? '',
    drinking: row.drinking ?? '',
    smoking: row.smoking ?? '',
    marijuana: row.marijuana ?? '',
    drugs: row.drugs ?? '',
  };

  // map every field we know about
  for (const [uiKey, dbKey] of Object.entries(FIELD_MAP) as [keyof UserProfile, keyof ProfileRow][]) {
    const dbValue = row[dbKey];
    if (dbValue !== null && dbValue !== undefined) {
      (profile as unknown as Record<string, unknown>)[uiKey] = dbValue;
    }
  }

  // fields with custom shapes
  profile.email = row.email ?? undefined;
  profile.phoneNumber = row.phone_number ?? undefined;
  profile.subscriptionTier = row.subscription_tier as SubscriptionTier;
  profile.isPremium = row.subscription_tier === 'PRO';
  profile.isVerified = row.is_verified;
  profile.verificationStatus = row.verification_status as UserProfile['verificationStatus'];
  profile.accountCreated = new Date(row.account_created).getTime();
  profile.dailySearchCount = row.daily_search_count;
  profile.searchBonus = row.search_bonus ?? 0;
  profile.lastSearchDate = row.last_search_date;
  profile.dailyLikeCount = row.daily_like_count;
  profile.lastLikeDate = row.last_like_date;
  profile.hiddenFields = row.hidden_fields ?? [];

  return profile;
}

// ----------------------------------------------------------------------------
// UI profile (or partial) → DB update payload
// Only includes keys that have values. Useful for incremental saves. An empty
// answer is saved as null (a date or number column can't hold '').
// ----------------------------------------------------------------------------

export function profileToRowUpdate(
  profile: Partial<UserProfile>
): Partial<ProfileRow> {
  const update: Partial<ProfileRow> = {};

  for (const [uiKey, dbKey] of Object.entries(FIELD_MAP) as [keyof UserProfile, keyof ProfileRow][]) {
    if (uiKey in profile) {
      const value = profile[uiKey];
      if (value !== undefined) {
        // '' clears the field
        (update as Record<string, unknown>)[dbKey] = value === '' ? null : value;
      }
    }
  }

  // hidden_fields is the one array we let the UI manage directly
  if (profile.hiddenFields !== undefined) {
    update.hidden_fields = profile.hiddenFields;
  }

  return update;
}

// ----------------------------------------------------------------------------
// Settings mapping (separate because settings live on the same row but are
// grouped logically in the UI)
// ----------------------------------------------------------------------------

import type { UserSettings } from '../types';

export function rowToSettings(row: ProfileRow): UserSettings {
  return {
    incognito: row.settings_incognito,
    showOnline: row.settings_show_online,
    readReceipts: row.settings_read_receipts,
    pushNotifs: row.settings_push_notifs,
    emailNotifs: row.settings_email_notifs,
    theme: (row.settings_theme as 'system' | 'light' | 'dark') ?? 'system',
  };
}

export function settingsToRowUpdate(s: UserSettings): Partial<ProfileRow> {
  return {
    settings_incognito: s.incognito,
    settings_show_online: s.showOnline,
    settings_read_receipts: s.readReceipts,
    settings_push_notifs: s.pushNotifs,
    settings_email_notifs: s.emailNotifs,
    settings_theme: s.theme,
  };
}

// ----------------------------------------------------------------------------
// Subscription tier helper
// ----------------------------------------------------------------------------

export function tierFromRow(row: ProfileRow): SubscriptionTier {
  return row.subscription_tier as SubscriptionTier;
}

// Other people's names come back empty when they chose to hide them.
export function displayName(name: string | null | undefined): string {
  return name?.trim() || 'Name hidden';
}
