// ============================================================================
// constants.tsx
//
// Phase 3 cleanup:
//   - MOCK_USER_PROFILE / MOCK_USER_PHOTOS / GUEST_USER_PROFILE removed
//   - MOCK_MATCH_CANDIDATES / MOCK_CHATS removed
//   - SUBSCRIPTION_PLANS reduced to FREE + PRO (no PLUS tier)
//   - Voice / boost / admin icons kept (some still used in shared UI)
// ============================================================================

import React from 'react';
import { PhotoSlot, MatchCandidate, SubscriptionTier } from './types';

// ----------------------------------------------------------------------------
// Subscription plans (FREE vs PRO only)
// ----------------------------------------------------------------------------

export const SUBSCRIPTION_PLANS = [
  {
    tier: 'FREE' as SubscriptionTier,
    name: 'MatchGPT Free',
    price: '₹0',
    period: 'Forever',
    features: [
      '1 AI Search Prompt per day',
      'Basic Filters (Age, Distance)',
      '6 Likes per day',
      'Basic Chat',
      'Blurred "Likes You" View',
    ],
    highlight: false,
    color: 'gray',
  },
  {
    tier: 'PRO' as SubscriptionTier,
    name: 'MatchGPT Pro',
    price: '₹2,999',
    period: 'per month',
    features: [
      'Unlimited AI Search Prompts',
      'All Filters Unlocked',
      'See Everyone Who Liked You',
      'Unlimited Likes & Super Likes',
      'Rewinds Last 60s of Swipes',
      'Incognito Mode & Read Receipts',
      'Travel Mode',
      'Date Proposals in Chat',
      'Deep Compatibility Analysis',
    ],
    highlight: true,
    color: 'yellow',
  },
];

// ----------------------------------------------------------------------------
// Photo slot config (used in onboarding + profile editing)
// ----------------------------------------------------------------------------

export const PHOTO_SLOTS_CONFIG: PhotoSlot[] = [
  { id: 'p1', category: 'The Basics', description: 'Front-Face Selfie',  tip: 'Good lighting, natural smile, no sunglasses.', required: true, file: null, previewUrl: null },
  { id: 'p2', category: 'Lifestyle',  description: 'Adventurous Photo',  tip: 'Hiking, traveling, or doing something active.', required: true, file: null, previewUrl: null },
  { id: 'p3', category: 'Empathy',    description: 'With an Animal',     tip: 'Shows kindness. Pet or friendly encounter.', required: true, file: null, previewUrl: null },
  { id: 'p4', category: 'Style',      description: 'Best Outfit',         tip: 'Full body. Wear something you feel good in.', required: true, file: null, previewUrl: null },
  { id: 'p5', category: 'Social',     description: 'With Friends',        tip: 'You should be easy to identify.', required: true, file: null, previewUrl: null },
  { id: 'p6', category: 'Career',     description: 'Work Context',        tip: 'At your desk, on site, or in professional attire.', required: true, file: null, previewUrl: null },
];

// ----------------------------------------------------------------------------
// Hidden-by-default fields on a public profile (user can override)
// ----------------------------------------------------------------------------

export const DEFAULT_HIDDEN_FIELDS = [
  'race', 'nationalityCount', 'phoneType',
  'bodyType', 'hairColor', 'hairType', 'eyeColor', 'facialHair', 'makeupRoutine', 'clothingStyle',
  'wearsGlasses', 'wearsLenses', 'wearsJewelry', 'bodyHair', 'hasTattoos', 'dressesWell', 'hygiene',
  'drivesCar', 'hasDriversLicense', 'livingPreference', 'favoriteDrink', 'canCook', 'bakingInterest',
  'shoppingPreference', 'gymRoutine', 'sportsInterest', 'readingInterest', 'hobbies', 'isOrganised', 'snoring',
  'lovesTravel', 'travelStyle', 'nextTravelDestination',
  'workStyle',
  'therapyHistory', 'childhoodDescription', 'musicGenre', 'familyHealthHistory', 'criminalRecord',
  'futurePlans', 'dreamHouseType',
  'marriageTimeline', 'sexStyle', 'interracialMarriage', 'siblings', 'familyCloseness', 'financialSplitting',
];

// ----------------------------------------------------------------------------
// Profile attribute groups (for displaying a candidate's profile)
// ----------------------------------------------------------------------------

type AttributeGroup = {
  title: string;
  fields: { label: string; key: keyof MatchCandidate }[];
};

export const PROFILE_ATTRIBUTE_GROUPS: AttributeGroup[] = [
  {
    title: 'Appearance',
    fields: [
      { label: 'Height', key: 'height' },
      { label: 'Body Type', key: 'bodyType' },
      { label: 'Ethnicity', key: 'ethnicity' },
      { label: 'Hair Color', key: 'hairColor' },
      { label: 'Eye Color', key: 'eyeColor' },
      { label: 'Style', key: 'clothingStyle' },
    ],
  },
  {
    title: 'Lifestyle',
    fields: [
      { label: 'Exercise', key: 'gymRoutine' },
      { label: 'Cooking', key: 'canCook' },
      { label: 'Drinking', key: 'drinking' },
      { label: 'Smoking', key: 'smoking' },
      { label: 'Marijuana', key: 'marijuana' },
      { label: 'Drugs', key: 'drugs' },
      { label: 'Living', key: 'livingPreference' },
      { label: 'Travel', key: 'travelStyle' },
    ],
  },
  {
    title: 'Background',
    fields: [
      { label: 'Religion', key: 'religion' },
      { label: 'Politics', key: 'politics' },
      { label: 'Zodiac', key: 'zodiac' },
      { label: 'Languages', key: 'languages' },
      { label: 'Education', key: 'educationLevel' },
      { label: 'Hometown', key: 'hometown' },
    ],
  },
  {
    title: 'Relationship',
    fields: [
      { label: 'Love Language', key: 'loveLanguage' },
      { label: 'Looking For', key: 'datingIntention' },
      { label: 'Marriage', key: 'marriageTimeline' },
      { label: 'Children', key: 'children' },
      { label: 'Family Plans', key: 'familyPlans' },
      { label: 'Pets', key: 'pets' },
    ],
  },
  {
    title: 'Psychology',
    fields: [
      { label: 'Social Battery', key: 'socialBattery' },
      { label: 'Attachment', key: 'attachmentStyle' },
      { label: 'Conflict Style', key: 'conflictResolution' },
      { label: 'Money', key: 'financialApproach' },
      { label: 'Sleep', key: 'sleepSchedule' },
      { label: 'Diet', key: 'dietaryPreferences' },
    ],
  },
];

// ----------------------------------------------------------------------------
// Country codes for phone input (kept for future use)
// ----------------------------------------------------------------------------

export const COUNTRY_CODES = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+1', country: 'United States', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+1', country: 'Canada', flag: '🇨🇦' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
];

// ----------------------------------------------------------------------------
// Icons (unchanged from before, just kept compact)
// ----------------------------------------------------------------------------

export const IconCheck = ({ className }: { className?: string } = {}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>
);
export const IconChevronRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
);
export const IconChevronLeft = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
);
export const IconChevronDown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
);
export const IconX = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
export const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
);
export const IconEye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);
export const IconEyeOff = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
);
export const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
);
export const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
export const IconUser = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
export const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
export const IconHistory = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
);
export const IconHeart = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
);
export const IconMessageCircle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
);
export const IconStar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);
export const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);
export const IconLogOut = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
);
export const IconMenu = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
);
export const IconMail = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
);
export const IconGoogle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
    <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29v-3.09h-3.98C.435 8.55 0 10.22 0 12c0 1.78.435 3.45 1.545 5.39l3.98-3.1z"/>
    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.61l3.98 3.09c.95-2.85 3.6-4.95 6.73-4.95z"/>
  </svg>
);
export const IconLock = ({ className }: { className?: string } = {}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
export const IconShield = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
);
export const IconClock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
export const IconSun = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
);
export const IconMoon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
);
export const IconHelpCircle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
);
export const IconBook = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
);
export const IconZap = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
export const IconZapFilled = ({ className }: { className?: string } = {}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
