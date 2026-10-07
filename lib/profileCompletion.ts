// ============================================================================
// Profile completion, shared by My Profile and the dashboard banner.
//
// Counts the answers Shaadi24 asks for (sign-up and the six sections of My
// Profile), plus up to 6 photos. Horoscope, gotra and sect only count for the
// religions that use them.
// ============================================================================

import type { UserProfile } from '../types';

const ALWAYS: (keyof UserProfile)[] = [
  // asked at sign-up
  'name', 'age', 'gender', 'interestedIn', 'profileCreatedFor', 'dateOfBirth', 'maritalStatus', 'height',
  'country', 'city', 'religion', 'motherTongue', 'educationLevel', 'occupation',
  // religion and community
  'caste', 'openToOtherCommunities', 'languages',
  // education and work
  'degree', 'university', 'employedIn', 'jobTitle', 'work', 'workStyle', 'annualIncome',
  // family
  'familyType', 'familyStatus', 'familyValues', 'fatherOccupation', 'motherOccupation', 'brothers', 'sisters',
  'familyLocation', 'livingWithFamily', 'familyCloseness', 'aboutFamily',
  // lifestyle
  'dietaryPreferences', 'drinking', 'smoking', 'gymRoutine', 'canCook', 'hobbies', 'sleepSchedule',
  'readingInterest', 'sportsInterest', 'lovesTravel', 'travelStyle',
  // about you
  'description', 'hometown', 'bodyType',
  // plans and values
  'marriageTimeline', 'familyPlans', 'settlingAbroad', 'socialBattery', 'conflictResolution', 'financialApproach',
  'futurePlans', 'pets',
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
