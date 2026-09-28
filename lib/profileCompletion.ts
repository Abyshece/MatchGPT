// ============================================================================
// Profile completion, shared by My Profile and the dashboard banner.
//
// Counts the answers that matter most for matching, plus up to 6 photos.
// Horoscope, gotra and sect only count for the religions that use them.
// ============================================================================

import type { UserProfile } from '../types';

const ALWAYS: (keyof UserProfile)[] = [
  // basics
  'name', 'age', 'gender', 'pronouns', 'sexuality', 'interestedIn', 'profileCreatedFor', 'dateOfBirth',
  'maritalStatus', 'height', 'languages',
  // where they live
  'country', 'city', 'hometown', 'settlingAbroad',
  // religion and community
  'religion', 'motherTongue', 'caste', 'openToOtherCommunities', 'ethnicity', 'race',
  // education and work
  'educationLevel', 'degree', 'university', 'employedIn', 'occupation', 'jobTitle', 'work', 'workStyle',
  'annualIncome',
  // family
  'familyType', 'familyStatus', 'familyValues', 'fatherOccupation', 'motherOccupation', 'brothers', 'sisters',
  'livingWithFamily', 'familyCloseness',
  // appearance and lifestyle
  'bodyType', 'hairColor', 'hairType', 'eyeColor', 'facialHair', 'clothingStyle', 'wearsGlasses', 'hasTattoos',
  'drinking', 'smoking', 'dietaryPreferences', 'gymRoutine', 'canCook', 'hobbies', 'sportsInterest',
  'readingInterest', 'lovesTravel', 'travelStyle', 'livingPreference', 'sleepSchedule', 'covidVaccine', 'phoneType',
  // relationship and personality
  'datingIntention', 'marriageTimeline', 'children', 'familyPlans', 'pets', 'description', 'loveLanguage',
  'attachmentStyle', 'socialBattery', 'conflictResolution', 'financialApproach', 'politics', 'zodiac',
  'futurePlans', 'dreamHouseType',
  // socials
  'linkedin', 'instagram',
];

const HOROSCOPE: (keyof UserProfile)[] = ['manglik', 'rashi', 'nakshatra', 'horoscopeMatch'];

export function completionFields(profile: UserProfile): (keyof UserProfile)[] {
  const religion = profile.religion ?? '';
  const fields = [...ALWAYS];
  if (['Hindu', 'Jain', 'Sikh', 'Buddhist'].includes(religion)) fields.push(...HOROSCOPE);
  if (['Hindu', 'Jain', 'Sikh'].includes(religion)) fields.push('gotra');
  if (['Muslim', 'Christian'].includes(religion)) fields.push('sect');
  if (profile.country && profile.country !== 'India') fields.push('residentialStatus');
  else fields.push('state');
  return fields;
}

const answered = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== 'Not specified';

export function profileCompletion(profile: UserProfile, photoCount: number) {
  const fields = completionFields(profile);
  const done = fields.filter((f) => answered(profile[f])).length + Math.min(photoCount, 6);
  const total = fields.length + 6;
  return {
    completionPercentage: Math.min(100, Math.floor((done / total) * 100)),
    estimatedMinutes: Math.max(1, Math.ceil((total - done) / 5)),
  };
}

// The India details added in Phase 12. Someone who has none of these yet is
// invited to add them.
export function hasIndiaDetails(profile: UserProfile): boolean {
  return (['maritalStatus', 'motherTongue', 'familyType', 'dateOfBirth', 'city'] as (keyof UserProfile)[])
    .some((f) => answered(profile[f]));
}
