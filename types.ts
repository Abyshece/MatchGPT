// ============================================================================
// types.ts
//
// Frontend types. Mirrors the database in shape but uses camelCase, and
// drops fields we don't surface in the UI.
//
// Phase 3 cleanup:
//   - Removed: voiceIntroUrl, boostsClaimed, ageChangedOnce
//   - Removed AppStep enum (auth-state-driven routing now)
//   - Removed admin-related types
// ============================================================================

export type SubscriptionTier = 'FREE' | 'PRO';

export interface UserSettings {
  incognito: boolean;
  showOnline: boolean;
  readReceipts: boolean;
  pushNotifs: boolean;
  emailNotifs: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface UserProfile {
  // ---- account ----
  name: string;
  email?: string;
  phoneNumber?: string;
  age: number | null;
  isPremium?: boolean;
  subscriptionTier?: SubscriptionTier;
  dailySearchCount?: number;
  searchBonus?: number;           // profile sections completed: one more free search a day each
  lastSearchDate?: string;
  dailyLikeCount?: number;
  lastLikeDate?: string;

  isVerified?: boolean;
  verificationStatus?: 'unverified' | 'pending' | 'verified';
  accountCreated?: number;

  // ---- basics ----
  pronouns: string;
  gender: string;
  sexuality: string;
  interestedIn: string;
  hometown: string;
  location: string;
  ethnicity: string;
  race?: string;
  nationalityCount?: number;
  languages: string;

  // ---- appearance ----
  height: string;
  bodyType?: string;
  hairColor?: string;
  hairType?: string;
  eyeColor?: string;
  facialHair?: string;
  makeupRoutine?: string;
  clothingStyle?: string;
  wearsGlasses?: string;
  wearsLenses?: string;
  wearsJewelry?: string;
  bodyHair?: string;
  hasTattoos?: string;
  dressesWell?: string;
  hygiene?: string;

  // ---- lifestyle ----
  drinking: string;
  smoking: string;
  marijuana: string;
  drugs: string;
  covidVaccine: string;
  drivesCar?: string;
  hasDriversLicense?: string;
  livingPreference?: string;
  favoriteDrink?: string;
  canCook?: string;
  bakingInterest?: string;
  shoppingPreference?: string;
  gymRoutine?: string;
  sportsInterest?: string;
  readingInterest?: string;
  hobbies?: string;
  isOrganised?: string;
  snoring?: string;
  phoneType?: string;

  // ---- travel ----
  lovesTravel?: string;
  travelStyle?: string;
  nextTravelDestination?: string;

  // ---- career ----
  work: string;
  jobTitle: string;
  university: string;
  educationLevel: string;
  workStyle?: string;

  // ---- background ----
  religion: string;
  politics: string;
  zodiac: string;
  therapyHistory?: string;
  childhoodDescription?: string;
  musicGenre?: string;
  familyHealthHistory?: string;
  criminalRecord?: string;

  // ---- future ----
  futurePlans?: string;
  dreamHouseType?: string;

  // ---- family & dating ----
  loveLanguage?: string;
  relationshipType: string;
  datingIntention: string;
  children: string;
  familyPlans: string;
  pets: string;
  marriageTimeline?: string;
  sexStyle?: string;
  interracialMarriage?: string;
  siblings?: string;
  familyCloseness?: string;
  financialSplitting?: string;

  // ---- psychology ----
  conflictResolution?: string;
  socialBattery?: string;
  dietaryPreferences?: string;
  attachmentStyle?: string;
  sleepSchedule?: string;
  financialApproach?: string;

  // ---- summary & social ----
  description?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;

  // ---- India fields (Phase 12) ----
  profileCreatedFor?: string;
  dateOfBirth?: string;          // private: others only see the age
  maritalStatus?: string;
  childrenCount?: string;
  heightCm?: number;             // worked out by the database from height
  disability?: string;
  motherTongue?: string;
  caste?: string;
  subCaste?: string;
  sect?: string;
  openToOtherCommunities?: string;
  gotra?: string;
  manglik?: string;
  rashi?: string;
  nakshatra?: string;
  birthTime?: string;
  birthPlace?: string;
  horoscopeMatch?: string;
  degree?: string;
  employedIn?: string;
  occupation?: string;
  annualIncome?: string;
  country?: string;
  state?: string;
  city?: string;
  residentialStatus?: string;
  settlingAbroad?: string;
  familyType?: string;
  familyStatus?: string;
  familyValues?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  brothers?: string;
  brothersMarried?: string;
  sisters?: string;
  sistersMarried?: string;
  familyLocation?: string;
  livingWithFamily?: string;
  aboutFamily?: string;

  // ---- privacy ----
  hiddenFields?: string[];
}

export interface FilterOptions {
  isOnline: boolean;
  recentlyActive?: boolean;
  isVerified: boolean;
  isPremium: boolean;
  hasLinkedin?: boolean;
  hasInstagram?: boolean;
  notAlreadyLiked?: boolean;
  neighborhood?: string;
  maxDistance?: number;
  ageRange?: [number, number];
  ethnicity?: string;
  religion?: string;
  datingIntention?: string;
  children?: string;             // 'No' or 'Yes'
  familyPlans?: string;
  smoking?: string;
  drinking?: string;
  politics?: string;
  educationLevel?: string;
  // Phase 12
  motherTongue?: string;
  caste?: string;
  maritalStatus?: string;
  manglik?: string;
  dietaryPreferences?: string;
  country?: string;
  state?: string;
  heightRange?: [number, number];  // cm
  // No longer asked or offered (Phase 12); the server ignores them
  relationshipType?: string;
  height?: string;
  drugs?: string;
  marijuana?: string;
}

export interface PhotoSlot {
  id: string;
  category: string;
  description: string;
  required: boolean;
  file: File | null;
  previewUrl: string | null;
  tip: string;
}

export interface CompatibilityItem {
  icon: string;
  text: string;
  color?: string;
}

export interface MatchCandidate {
  id: string;
  name: string;
  age: number;
  location: string;
  compatibilityScore: number;
  compatibilityReport?: CompatibilityItem[];
  tags: string[];
  bio: string;
  imageUrls: string[];
  linkedin?: string;
  instagram?: string;
  isOnline?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  subscriptionTier?: SubscriptionTier;
  lastSeen?: string;
  isLiked?: boolean;
  joinedDate?: string;
  hiddenFields?: string[];

  // Detailed profile fields used by ProfileModal — same shape as UserProfile
  jobTitle?: string;
  work?: string;
  university?: string;
  educationLevel?: string;
  hometown?: string;
  height?: string;
  ethnicity?: string;
  religion?: string;
  politics?: string;
  zodiac?: string;
  drinking?: string;
  smoking?: string;
  marijuana?: string;
  drugs?: string;
  covidVaccine?: string;
  languages?: string;
  interestedIn?: string;
  relationshipType?: string;
  datingIntention?: string;
  children?: string;
  familyPlans?: string;
  pets?: string;
  hairColor?: string;
  hairType?: string;
  eyeColor?: string;
  race?: string;
  bodyType?: string;
  wearsGlasses?: string;
  wearsLenses?: string;
  wearsJewelry?: string;
  bodyHair?: string;
  drivesCar?: string;
  hasDriversLicense?: string;
  canCook?: string;
  gymRoutine?: string;
  dressesWell?: string;
  hasTattoos?: string;
  lovesTravel?: string;
  isOrganised?: string;
  therapyHistory?: string;
  childhoodDescription?: string;
  nationalityCount?: number;
  hygiene?: string;
  futurePlans?: string;
  dreamHouseType?: string;
  facialHair?: string;
  makeupRoutine?: string;
  musicGenre?: string;
  phoneType?: string;
  livingPreference?: string;
  sportsInterest?: string;
  favoriteDrink?: string;
  nextTravelDestination?: string;
  travelStyle?: string;
  workStyle?: string;
  bakingInterest?: string;
  shoppingPreference?: string;
  interracialMarriage?: string;
  clothingStyle?: string;
  familyCloseness?: string;
  snoring?: string;
  familyHealthHistory?: string;
  readingInterest?: string;
  hobbies?: string;
  criminalRecord?: string;
  financialSplitting?: string;
  siblings?: string;
  marriageTimeline?: string;
  sexStyle?: string;
  loveLanguage?: string;
  conflictResolution?: string;
  socialBattery?: string;
  dietaryPreferences?: string;
  attachmentStyle?: string;
  sleepSchedule?: string;
  financialApproach?: string;
  // ---- India fields (Phase 12; never the date of birth) ----
  profileCreatedFor?: string;
  maritalStatus?: string;
  childrenCount?: string;
  heightCm?: number;             // worked out by the database from height
  disability?: string;
  motherTongue?: string;
  caste?: string;
  subCaste?: string;
  sect?: string;
  openToOtherCommunities?: string;
  gotra?: string;
  manglik?: string;
  rashi?: string;
  nakshatra?: string;
  birthTime?: string;
  birthPlace?: string;
  horoscopeMatch?: string;
  degree?: string;
  employedIn?: string;
  occupation?: string;
  annualIncome?: string;
  country?: string;
  state?: string;
  city?: string;
  residentialStatus?: string;
  settlingAbroad?: string;
  familyType?: string;
  familyStatus?: string;
  familyValues?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  brothers?: string;
  brothersMarried?: string;
  sisters?: string;
  sistersMarried?: string;
  familyLocation?: string;
  livingWithFamily?: string;
  aboutFamily?: string;
}

export interface HistoryItem {
  id: string;
  query: string;
  filters: FilterOptions;
  results: MatchCandidate[];
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  isRead?: boolean;
}
