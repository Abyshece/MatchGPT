// ============================================================================
// Matching: filters, prompt understanding and compatibility scoring.
//
// Used by the `search` edge function. No imports, so it can be tested on its
// own. (Until Phase 9 this ran in the browser, in lib/matchingService.ts.)
//
// The prompt is understood either by Gemini (ai.ts, turned into the same
// shape by planToParsed) or, when Gemini isn't available, by parsePrompt.
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
// Weights: relationship goals 20 (intent, timeline, children, marital history,
// horoscope), lifestyle 15, values 15 (religion, community, money), location
// and background 15 (city, mother tongue, languages, settling abroad), age 10,
// personality 10 (introvert or extrovert, disagreements), physical 5,
// education and family 5.
//
// Answers that are no longer asked (NOT_ASKED: the cannabis, other-drugs and
// relationship-type answers since Phase 12; politics, ethnicity, zodiac, love
// language, looks and the rest since the short sign-up, research in
// docs/research/profile-questions.md) are left out of every profile here, so
// nothing reads them.
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
  religion?: string;
  datingIntention?: string;
  children?: string;           // 'No' or 'Yes'
  familyPlans?: string;
  smoking?: string;
  drinking?: string;
  educationLevel?: string;
  motherTongue?: string;       // 'Hindi' also finds the regional kinds of Hindi
  caste?: string;
  maritalStatus?: string;
  manglik?: string;
  dietaryPreferences?: string;
  country?: string;
  state?: string;
  heightRange?: [number, number];  // cm
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
  'height', 'bodyType', 'religion', 'languages',
  'datingIntention', 'marriageTimeline', 'children', 'familyPlans',
  'drinking', 'smoking', 'gymRoutine',
  'dietaryPreferences', 'sleepSchedule', 'canCook',
  'socialBattery', 'conflictResolution', 'financialApproach', 'futurePlans', 'pets',
  'hobbies', 'travelStyle', 'lovesTravel', 'sportsInterest', 'readingInterest',
  'linkedin', 'instagram',
  // Phase 12 (the date of birth is never read from the database for search)
  'profileCreatedFor', 'maritalStatus', 'childrenCount', 'disability', 'motherTongue', 'caste', 'subCaste',
  'sect', 'openToOtherCommunities', 'gotra', 'manglik', 'rashi', 'nakshatra', 'birthTime', 'birthPlace',
  'horoscopeMatch', 'degree', 'employedIn', 'occupation', 'annualIncome', 'country', 'state', 'city',
  'residentialStatus', 'settlingAbroad', 'familyType', 'familyStatus', 'familyValues', 'fatherOccupation',
  'motherOccupation', 'brothers', 'brothersMarried', 'sisters', 'sistersMarried', 'familyLocation',
  'livingWithFamily', 'aboutFamily', 'familyCloseness',
];

// ============================================================================
// Profiles
// ============================================================================

const toCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function isFilledIn(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '' && value !== 'Not specified';
}

// Answers no longer asked. What members gave before stays in their data (and
// in "Download my data"), but isn't shown, searched or scored.
const NOT_ASKED = new Set([
  'marijuana', 'drugs', 'relationshipType',
  'politics', 'ethnicity', 'race', 'interracialMarriage', 'nationalityCount', 'sexuality', 'sexStyle',
  'zodiac', 'loveLanguage', 'attachmentStyle', 'livingPreference', 'dreamHouseType',
  'hairColor', 'hairType', 'eyeColor', 'wearsGlasses', 'wearsLenses', 'hasTattoos', 'facialHair', 'bodyHair',
  'clothingStyle', 'dressesWell', 'makeupRoutine', 'wearsJewelry', 'hygiene',
  'therapyHistory', 'familyHealthHistory', 'criminalRecord', 'covidVaccine',
  'financialSplitting', 'isOrganised', 'snoring', 'phoneType', 'drivesCar', 'hasDriversLicense',
  'shoppingPreference', 'bakingInterest', 'childhoodDescription', 'musicGenre', 'nextTravelDestination',
  'favoriteDrink',
]);

// The searcher's own profile, everything still asked included.
export function ownProfile(row: Row): Profile {
  const p: Profile = {};
  for (const [key, value] of Object.entries(row)) {
    const field = toCamel(key);
    if (isFilledIn(value) && !NOT_ASKED.has(field)) p[field] = value;
  }
  return p;
}

// Answers hidden together with another: hiding the location hides city,
// state and country; hiding the height hides the height in cm.
const HIDDEN_WITH: Record<string, string[]> = {
  location: ['city', 'state', 'country'],
  height: ['heightCm'],
};

// Someone else's profile as other users see it: hidden fields left out.
function asSeenByOthers(row: Row): Profile {
  const p = ownProfile(row);
  for (const key of (row.hidden_fields as string[] | null) ?? []) {
    delete p[key];
    for (const linked of HIDDEN_WITH[key] ?? []) delete p[linked];
  }
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

// Cities known by two names
const CITY_NAMES: Record<string, string> = {
  bengaluru: 'bangalore', gurugram: 'gurgaon', mysuru: 'mysore', mangaluru: 'mangalore', belagavi: 'belgaum',
  kalaburagi: 'gulbarga', prayagraj: 'allahabad', bombay: 'mumbai', madras: 'chennai', calcutta: 'kolkata',
  trivandrum: 'thiruvananthapuram', cochin: 'kochi', poona: 'pune', baroda: 'vadodara', secunderabad: 'hyderabad',
  'new delhi': 'delhi', 'chhatrapati sambhajinagar': 'aurangabad', 'navi mumbai': 'mumbai',
};

// Loose: "Mumbai" matches "Mumbai, MH" and "Navi Mumbai"; "Bengaluru" matches "Bangalore".
function sameCity(a: string, b: string): boolean {
  const city = (s: string) => {
    const name = s.toLowerCase().split(',')[0].trim();
    return CITY_NAMES[name] ?? name;
  };
  return city(a) === city(b) || city(a).includes(city(b)) || city(b).includes(city(a));
}

// Indian state codes in locations typed before Phase 12 ("Mumbai, MH")
const STATE_CODES: Record<string, string> = {
  an: 'andaman and nicobar islands', ap: 'andhra pradesh', ar: 'arunachal pradesh', as: 'assam', br: 'bihar',
  ch: 'chandigarh', cg: 'chhattisgarh', ct: 'chhattisgarh', dl: 'delhi', ga: 'goa', gj: 'gujarat', hr: 'haryana',
  hp: 'himachal pradesh', jk: 'jammu and kashmir', jh: 'jharkhand', ka: 'karnataka', kl: 'kerala', la: 'ladakh',
  mp: 'madhya pradesh', mh: 'maharashtra', mn: 'manipur', ml: 'meghalaya', mz: 'mizoram', nl: 'nagaland',
  od: 'odisha', or: 'odisha', py: 'puducherry', pb: 'punjab', rj: 'rajasthan', sk: 'sikkim', tn: 'tamil nadu',
  tg: 'telangana', ts: 'telangana', tr: 'tripura', up: 'uttar pradesh', ut: 'uttarakhand', wb: 'west bengal',
};

// Same state or country: the last comma-separated part matches ("MH" and
// "Maharashtra" count as the same).
function sameRegion(a: string, b: string): boolean {
  const region = (s: string) => {
    const parts = s.toLowerCase().split(',').map((x) => x.trim());
    const last = parts[parts.length - 1] || parts[0];
    return STATE_CODES[last] ?? last;
  };
  return region(a) === region(b);
}

// Where someone lives: city and state (or country) when they chose them,
// otherwise the location as typed before Phase 12.
function placeOf(p: Profile): string | undefined {
  return p.city ? [p.city, p.state || p.country].filter(Boolean).join(', ') : p.location;
}

// Same city, or the same state (compared by the state answers when both have one)
function nearby(a: Profile, b: Profile): boolean {
  const pa = placeOf(a);
  const pb = placeOf(b);
  if (!pa || !pb) return false;
  if (sameCity(pa, pb)) return true;
  return a.state && b.state ? a.state === b.state : sameRegion(pa, pb);
}

// ============================================================================
// Filters sent by the browser
// ============================================================================

const BOOLEAN_FILTERS = ['isOnline', 'recentlyActive', 'isVerified', 'isPremium', 'hasLinkedin', 'hasInstagram'] as const;
const TEXT_FILTERS = [
  'neighborhood', 'religion', 'datingIntention', 'children', 'familyPlans', 'smoking', 'drinking',
  'educationLevel', 'motherTongue', 'caste', 'maritalStatus', 'manglik', 'dietaryPreferences',
  'country', 'state',
] as const;

// The filters Shaadi24+ adds (the ones FilterPanel locks without it). Age,
// place and the verified / Instagram / LinkedIn switches are everyone's.
export const PRO_FILTERS = [
  'religion', 'motherTongue', 'caste', 'maritalStatus', 'heightRange', 'manglik', 'dietaryPreferences',
  'educationLevel', 'datingIntention', 'children', 'familyPlans', 'drinking', 'smoking',
] as const;

/** The filters without Shaadi24+'s, for members who don't have it. */
export function withoutProFilters(filters: FilterOptions): FilterOptions {
  const kept: FilterOptions = { ...filters };
  for (const key of PRO_FILTERS) delete kept[key];
  return kept;
}

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
  const heights = src.heightRange;
  if (Array.isArray(heights) && heights.length === 2 && heights.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    filters.heightRange = [Math.min(heights[0], heights[1]), Math.max(heights[0], heights[1])];
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
  { words: ['kid', 'kiddo', 'child', 'children', 'baby'],
    answer: fieldAnswer('familyPlans',
      ['Wants children', 'Open to children', 'Already have, want more'],
      ['Does not want children', 'Already have, no more']) },
  { words: ['marriage', 'marry', 'married', 'wife', 'husband', 'spouse', 'shaadi', 'settle'],
    answer: (p) => (p.datingIntention ? p.datingIntention === 'Marriage' : undefined) },
  { words: ['serious', 'committed', 'commitment', 'long term', 'longterm'],
    answer: (p) => (p.datingIntention ? LONG_TERM.includes(p.datingIntention) : undefined) },
  { words: ['religious', 'devout', 'practicing', 'practising'],
    answer: fieldAnswer('religion',
      ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Jewish'], ['Atheist', 'Agnostic']) },
  { words: ['vegetarian', 'veg', 'veggie'], alsoText: true,
    answer: (p) => (p.dietaryPreferences ? VEGGIE_DIETS.includes(p.dietaryPreferences) : undefined) },
  { words: ['vegan'], alsoText: true,
    answer: (p) => (p.dietaryPreferences ? p.dietaryPreferences === 'Vegan' : undefined) },
  { words: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'animal'], alsoText: true,
    answer: fieldAnswer('pets', ['Has pets', 'Wants pets', 'Dog', 'Cat'], ['No pets', 'Allergic', 'None']) },
  { words: ['cook', 'cooking', 'chef', 'foodie', 'baking', 'baker'], alsoText: true,
    answer: fieldAnswer('canCook', ['Excellent', 'Decent', 'Yes'], ["Can't cook", 'Basic', 'No']) },
  { words: ['gym', 'fitness', 'fit', 'workout', 'exercise', 'athletic', 'athlete'], alsoText: true,
    answer: fieldAnswer('gymRoutine', ['Daily', '3-4 times a week'], ['Never', 'Occasionally']) },
  { words: ['sport', 'sporty'], alsoText: true,
    answer: fieldAnswer('sportsInterest', ['Avid fan', 'I play, not watch'], ['Not interested']) },
  { words: ['reader', 'reading', 'read', 'book', 'bookworm', 'novel'], alsoText: true,
    answer: fieldAnswer('readingInterest', ['Avid reader', 'Avid Reader'], ["I don't read much"]) },
  { words: ['travel', 'traveling', 'travelling', 'traveler', 'traveller', 'wanderlust', 'explorer', 'backpacking', 'backpacker'],
    alsoText: true,
    answer: (p) => {
      if (['Yes, frequently', 'Yes'].includes(p.lovesTravel)) return true;
      return ['I prefer staying home', 'No'].includes(p.lovesTravel) ? false : undefined;
    } },
  { words: ['introvert', 'introverted', 'homebody', 'quiet', 'shy'], alsoText: true,
    answer: fieldAnswer('socialBattery', ['Introvert', 'Homebody'], ['Extrovert', 'Social Butterfly']) },
  { words: ['extrovert', 'extroverted', 'outgoing', 'social', 'sociable', 'social butterfly'], alsoText: true,
    answer: fieldAnswer('socialBattery', ['Extrovert', 'Social Butterfly'], ['Introvert', 'Homebody']) },
  // Phase 12
  { words: ['never married', 'unmarried', 'first marriage'],
    answer: (p) => (p.maritalStatus ? p.maritalStatus === 'Never Married' : undefined) },
  { words: ['divorced', 'divorcee'],
    answer: fieldAnswer('maritalStatus', ['Divorced', 'Awaiting Divorce'], ['Never Married', 'Widowed', 'Annulled']) },
  { words: ['widow', 'widowed', 'widower'],
    answer: fieldAnswer('maritalStatus', ['Widowed'], ['Never Married', 'Divorced', 'Awaiting Divorce', 'Annulled']) },
  { words: ['second marriage', 'remarriage'],
    answer: (p) => (p.maritalStatus ? p.maritalStatus !== 'Never Married' : undefined) },
  { words: ['manglik', 'mangalik'],
    answer: fieldAnswer('manglik', ['Manglik', 'Angshik (partial Manglik)'], ['Non Manglik']) },
  { words: ['nri', 'abroad', 'overseas'],
    answer: (p) => (p.country ? p.country !== 'India' : undefined) },
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
  field?: string;      // from Gemini: a profile answer (camelCase field)...
  values?: string[];   // ...and the answers that count
  label: string;       // how it's shown back to the searcher
}

export interface ParsedPrompt {
  terms: Term[];
  nearMe: boolean;
  city: string | null;
  online: boolean;
  recentlyActive: boolean;
  verified: boolean;
  gender: Gender | null;
  ageRange: [number, number] | null;
  heightRange: [number, number] | null;  // cm
}

// Heights in the prompt: 5'8", 5 ft 8 in, 6 feet, 170 cm, with "taller than",
// "under", "between ... and ...", "5'4 to 5'8", "5'6+". Only a number with a
// unit counts, so ages are never read as heights. Taken from the prompt
// before it is normalized (which drops the ' and ").
const HEIGHT = String.raw`(?:([4-7])\s*(?:'|’|ft|feet|foot)\s*(?:(1[01]|\d)(?!\d)\s*(?:"|”|''|in\b|inch\b|inches\b)?)?|(1\d\d|2[0-2]\d)\s*cm\b)`;
const HEIGHT_CM_MIN = 120;
const HEIGHT_CM_MAX = 230;

const inchesToCm = (inches: number) => Math.round(inches * 2.54);

// The height a match stands for, in cm. `step` moves it by one step of the
// height list (an inch), or a cm when it was given in cm: "taller than 5'6"
// starts at 5'7".
function heightCm(m: RegExpMatchArray, from: number, step = 0): number {
  if (m[from + 2]) return Number(m[from + 2]) + step;
  return inchesToCm(Number(m[from]) * 12 + Number(m[from + 1] ?? 0) + step);
}

export function takeHeight(prompt: string): { text: string; range: [number, number] | null } {
  let text = prompt;
  let min = HEIGHT_CM_MIN;
  let max = HEIGHT_CM_MAX;
  let found = false;
  const rules: Array<[RegExp, (m: RegExpMatchArray) => void]> = [
    [new RegExp(String.raw`\b(?:between|from)?\s*${HEIGHT}\s*(?:and|to|-|–)\s*${HEIGHT}`, 'i'), (m) => {
      const a = heightCm(m, 1);
      const b = heightCm(m, 4);
      min = Math.max(min, Math.min(a, b)); max = Math.min(max, Math.max(a, b)); found = true;
    }],
    [new RegExp(String.raw`\b(taller than|above|over|more than|at least|min(?:imum)?)\s*${HEIGHT}`, 'i'), (m) => {
      min = Math.max(min, heightCm(m, 2, /at least|min/i.test(m[1]) ? 0 : 1)); found = true;
    }],
    [new RegExp(String.raw`\b(shorter than|under|below|less than|at most|max(?:imum)?|up ?to)\s*${HEIGHT}`, 'i'), (m) => {
      max = Math.min(max, heightCm(m, 2, /at most|max|up ?to/i.test(m[1]) ? 0 : -1)); found = true;
    }],
    [new RegExp(String.raw`${HEIGHT}\s*(?:\+|or (?:taller|more|above)|and (?:above|taller|more))`, 'i'), (m) => {
      min = Math.max(min, heightCm(m, 1)); found = true;
    }],
    [new RegExp(HEIGHT, 'i'), (m) => {
      // "a 5'8 guy": about that height
      const h = heightCm(m, 1);
      min = Math.max(min, h - 3); max = Math.min(max, h + 3); found = true;
    }],
  ];
  for (const [pattern, apply] of rules) {
    const m = text.match(pattern);
    if (m) {
      apply(m);
      text = text.replace(pattern, ' ');
    }
  }
  return { text, range: found && min <= max ? [min, max] : null };
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
  const height = takeHeight(prompt.slice(0, 500));
  let text = normalize(height.text);

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
        label: word,
      });
    }
    lastWasNegated = negated;
    negateNext = false;
  }

  return {
    terms,
    nearMe: near.found,
    city: null,
    online: online.found,
    recentlyActive: recent.found,
    verified: verified.found,
    gender: genders.size === 1 ? [...genders][0] : null,
    ageRange: age.range,
    heightRange: height.range,
  };
}

// Profile text the prompt is matched against. Yes/no style answers are left
// out ("No pets" would match "pets"); the intents above read those fields.
const TEXT_FIELDS = [
  'name', 'description', 'hobbies', 'jobTitle', 'work', 'workStyle', 'university', 'educationLevel',
  'location', 'hometown', 'religion', 'languages', 'bodyType',
  'datingIntention', 'marriageTimeline',
  'dietaryPreferences', 'sleepSchedule', 'travelStyle', 'futurePlans',
  'socialBattery', 'conflictResolution', 'financialApproach',
  'motherTongue', 'caste', 'subCaste', 'sect', 'gotra', 'degree', 'occupation', 'employedIn',
  'city', 'state', 'country', 'familyLocation', 'aboutFamily',
];

function profileText(p: Profile): string {
  return ' ' + normalize(TEXT_FIELDS.map((f) => p[f]).filter((v) => typeof v === 'string').join(' . ')) + ' ';
}

const mentions = (text: string, phrases: string[]) => phrases.some((ph) => text.includes(' ' + ph + ' '));

// Does the profile satisfy this part of the prompt?
function satisfies(term: Term, p: Profile, text: string): boolean {
  if (term.field) {
    // Unknown (not filled in or hidden) never counts, either way
    if (p[term.field] === undefined) return false;
    return (term.values ?? []).includes(p[term.field]) !== term.negated;
  }
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
// Prompts understood by Gemini (ai.ts)
// ============================================================================

export type Habit = 'smoking' | 'drinking';

// What Gemini made of a prompt, already checked by ai.ts.
export interface SearchPlan {
  gender: Gender | null;
  ageMin: number | null;
  ageMax: number | null;
  heightMinCm?: number | null;  // plans saved before Phase 12 have no heights
  heightMaxCm?: number | null;
  nearMe: boolean;
  city: string | null;
  online: boolean;
  recentlyActive: boolean;
  verified: boolean;
  avoid: Habit[];                                                        // left out, like "doesn't smoke"
  preferences: { field: string; answers: string[]; negated: boolean }[];  // snake_case profile answers
  keywords: { words: string[]; negated: boolean }[];                     // looked for in bios, hobbies, jobs
}

// Profile answers Gemini may choose from: the ones people in the pool have.
export const AI_FIELDS: Record<string, string> = {
  religion: 'Religion', dating_intention: 'Looking for',
  marriage_timeline: 'Marriage', family_plans: 'Kids',
  children: 'Has kids', education_level: 'Education', work_style: 'Work',
  drinking: 'Drinks', smoking: 'Smokes',
  dietary_preferences: 'Diet', gym_routine: 'Exercise', sleep_schedule: 'Sleep',
  can_cook: 'Cooks', pets: 'Pets', social_battery: 'Personality', conflict_resolution: 'Conflict style',
  financial_approach: 'Money', family_closeness: 'Family', travel_style: 'Travel',
  loves_travel: 'Loves travel', reading_interest: 'Reading', sports_interest: 'Sports',
  body_type: 'Body type',
  // Phase 12
  marital_status: 'Marital status', mother_tongue: 'Mother tongue', caste: 'Caste', sub_caste: 'Sub-caste',
  sect: 'Sect', gotra: 'Gotra', open_to_other_communities: 'Other communities', manglik: 'Manglik',
  rashi: 'Rashi', nakshatra: 'Nakshatra', horoscope_match: 'Horoscope match', degree: 'Degree',
  employed_in: 'Employed in', occupation: 'Occupation', annual_income: 'Income', country: 'Country',
  state: 'State', city: 'City', residential_status: 'Residential status', settling_abroad: 'Settling abroad',
  family_type: 'Family type', family_status: 'Family status', family_values: 'Family values',
  living_with_family: 'Lives with family', profile_created_for: 'Profile made for',
};

// Field → the answers visible in the pool (hidden ones left out), sorted.
// Fields with mostly free text (more than 40 different answers) are skipped;
// the prompt's words are still looked for in them.
export function buildCatalog(pool: Row[]): Record<string, string[]> {
  const seen = new Map<string, Set<string>>();
  for (const row of pool) {
    const p = asSeenByOthers(row);
    for (const field of Object.keys(AI_FIELDS)) {
      const value = p[toCamel(field)];
      if (typeof value !== 'string' || value.length > 80) continue;
      if (!seen.has(field)) seen.set(field, new Set());
      seen.get(field)!.add(value);
    }
  }
  const catalog: Record<string, string[]> = {};
  for (const field of Object.keys(AI_FIELDS)) {
    const values = seen.get(field);
    if (values && values.size <= 40) catalog[field] = [...values].sort();
  }
  return catalog;
}

const HABIT_INTENT: Record<Habit, string> = { smoking: 'smoke', drinking: 'drink' };

export function planToParsed(plan: SearchPlan): ParsedPrompt {
  const terms: Term[] = [];
  for (const habit of plan.avoid) {
    const intent = INTENT_BY_WORD.get(HABIT_INTENT[habit])?.intent;
    if (intent) terms.push({ phrases: intent.words, negated: true, intent, label: HABIT_INTENT[habit] });
  }
  for (const pref of plan.preferences) {
    terms.push({
      phrases: [], negated: pref.negated, field: toCamel(pref.field), values: pref.answers,
      label: `${AI_FIELDS[pref.field] ?? pref.field}: ${pref.negated ? 'not ' : ''}${pref.answers.join(' / ')}`,
    });
  }
  for (const keyword of plan.keywords) {
    const phrases = [...new Set(keyword.words.map(normalize).filter(Boolean))];
    if (phrases.length > 0) terms.push({ phrases, negated: keyword.negated, label: keyword.words[0] });
  }
  const hasAge = plan.ageMin !== null || plan.ageMax !== null;
  const hasHeight = !!plan.heightMinCm || !!plan.heightMaxCm;
  return {
    terms,
    nearMe: plan.nearMe,
    city: plan.city,
    online: plan.online,
    recentlyActive: plan.recentlyActive,
    verified: plan.verified,
    gender: plan.gender,
    ageRange: hasAge ? [plan.ageMin ?? 18, plan.ageMax ?? 99] : null,
    heightRange: hasHeight ? [plan.heightMinCm || HEIGHT_CM_MIN, plan.heightMaxCm || HEIGHT_CM_MAX] : null,
  };
}

const HABIT_CHIPS: Record<string, [string, string]> = {
  smoke: ['Smokes', "Doesn't smoke"], drink: ['Drinks', "Doesn't drink"],
};

// 173 -> 5'8"
function feetAndInches(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

// Short labels for what the search understood ("Women", "Age 25–30",
// "Doesn't smoke", "Diet: Vegetarian / Vegan", "reading"), shown above results.
export function describeParsed(parsed: ParsedPrompt): string[] {
  const chips: string[] = [];
  if (parsed.gender) chips.push({ woman: 'Women', man: 'Men', nonbinary: 'Non-binary people' }[parsed.gender]);
  if (parsed.ageRange) {
    const [min, max] = parsed.ageRange;
    chips.push(min <= 18 ? `Under ${max + 1}` : max >= 99 ? `Over ${min - 1}` : `Age ${min}–${max}`);
  }
  if (parsed.heightRange) {
    const [min, max] = parsed.heightRange;
    chips.push(min <= HEIGHT_CM_MIN ? `${feetAndInches(max)} or shorter`
      : max >= HEIGHT_CM_MAX ? `${feetAndInches(min)} or taller`
      : `Height ${feetAndInches(min)}–${feetAndInches(max)}`);
  }
  if (parsed.city) chips.push(`In ${parsed.city}`);
  if (parsed.nearMe) chips.push('Near you');
  if (parsed.online) chips.push('Online now');
  if (parsed.recentlyActive) chips.push('Active this week');
  if (parsed.verified) chips.push('Verified');
  for (const term of parsed.terms) {
    const habit = term.intent && HABIT_CHIPS[term.intent.words[0]];
    if (habit) chips.push(habit[term.negated ? 1 : 0]);
    else if (term.field) chips.push(term.label);
    else chips.push(`${term.negated ? 'not ' : ''}${term.label}`);
  }
  return [...new Set(chips)].slice(0, 10);
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

  // Height: the filter panel and the prompt combined; unknown is left out
  const heights = [filters.heightRange, parsed.heightRange].filter(Boolean) as [number, number][];
  if (heights.length > 0) {
    const min = Math.max(...heights.map((r) => r[0]));
    const max = Math.min(...heights.map((r) => r[1]));
    if (typeof c.heightCm !== 'number' || c.heightCm < min || c.heightCm > max) return false;
  }

  const places = `${c.location ?? ''} ${c.hometown ?? ''} ${c.city ?? ''} ${c.state ?? ''}`.toLowerCase();
  if (filters.neighborhood && !places.includes(filters.neighborhood.toLowerCase())) return false;
  if (parsed.city) {
    // "from Gujarat" can be where they live, grew up or where the family is
    const hay = `${places} ${c.country ?? ''} ${c.familyLocation ?? ''}`.toLowerCase();
    if (!hay.includes(parsed.city.toLowerCase())) return false;
  }
  if (filters.country && c.country !== filters.country) return false;
  if (filters.state && c.state !== filters.state) return false;
  if (parsed.nearMe && placeOf(me) && !nearby(me, c)) return false;

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
    'religion', 'datingIntention', 'familyPlans', 'educationLevel', 'smoking',
    'drinking', 'maritalStatus', 'manglik', 'dietaryPreferences',
  ];
  for (const key of exact) {
    if (filters[key] && c[key] !== filters[key]) return false;
  }
  if (filters.children && hasChildren(c.children) !== ['Yes', 'Has children'].includes(filters.children)) return false;
  // "Hindi" also finds "Hindi (Delhi)" and the other regional kinds
  if (filters.motherTongue && !(c.motherTongue === filters.motherTongue
    || (filters.motherTongue === 'Hindi' && String(c.motherTongue ?? '').startsWith('Hindi')))) return false;
  if (filters.caste && String(c.caste ?? '').toLowerCase() !== filters.caste.toLowerCase()) return false;

  // "doesn't smoke": leave out people who say they do
  for (const term of parsed.terms) {
    if (term.negated && term.intent?.strictWhenNot && term.intent.answer(c) === true) return false;
  }
  return true;
}

// Children: "No" (or the older "No children"), any "Yes, ..." (or the older
// "Has children"), or unknown.
function hasChildren(value: unknown): boolean | undefined {
  if (value === 'No' || value === 'No children') return false;
  if (typeof value === 'string' && (value.startsWith('Yes') || value === 'Has children')) return true;
  return undefined;
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

  // Marriage timeline (4)
  if (s.marriageTimeline && c.marriageTimeline) {
    if (s.marriageTimeline.toLowerCase() === c.marriageTimeline.toLowerCase()) {
      score += 4;
      items.push({ icon: '⏳', text: `Same marriage timeline: ${c.marriageTimeline}`, color: 'green' });
    } else if (closeTimelines(s.marriageTimeline, c.marriageTimeline)) {
      score += 2.5;
    } else {
      items.push({ icon: '⚠️', text: 'Different marriage timelines', color: 'amber' });
    }
  } else {
    score += 2;
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

  // Marital history (2): both marrying for the first time, or both not
  if (s.maritalStatus && c.maritalStatus) {
    const first = (m: string) => m === 'Never Married';
    score += first(s.maritalStatus) === first(c.maritalStatus) ? 2 : 0.5;
  } else {
    score += 1;
  }

  // Horoscope (2): when either wants the horoscopes to match, Manglik status
  // is compared (Manglik with Manglik, non-Manglik with non-Manglik)
  const wantsMatch = s.horoscopeMatch === 'Must match' || c.horoscopeMatch === 'Must match';
  const dosha = (m: unknown) => (m === 'Manglik' || m === 'Angshik (partial Manglik)' ? true : m === 'Non Manglik' ? false : undefined);
  if (!wantsMatch) {
    score += 2;
  } else if (dosha(s.manglik) === undefined || dosha(c.manglik) === undefined) {
    score += 1;
  } else if (dosha(s.manglik) === dosha(c.manglik)) {
    score += 2;
    items.push({ icon: '🪔', text: 'Manglik status matches', color: 'green' });
  } else {
    items.push({ icon: '⚠️', text: 'Manglik status differs, and a horoscope match is wanted', color: 'red' });
  }

  return { score: Math.min(20, score), items };
}

function closeTimelines(a: string, b: string): boolean {
  const order = ['asap', 'within 6 months', 'within 1 year', '1-2 years', '3-5 years', '5+ years', 'not sure yet'];
  const ai = order.indexOf(a.toLowerCase());
  const bi = order.indexOf(b.toLowerCase());
  return ai !== -1 && bi !== -1 && Math.abs(ai - bi) <= 1;
}

// Lifestyle (max 15)
function scoreLifestyle(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Drinking and smoking (3 each)
  const vices: Array<[string, string]> = [
    ['drinking', 'drinking habits'],
    ['smoking', 'smoking habits'],
  ];
  let viceMatches = 0;
  for (const [key, label] of vices) {
    const sv = s[key];
    const cv = c[key];
    if (sv && cv) {
      if (sv === cv) { score += 3; viceMatches++; }
      else if (vicesSimilar(sv, cv)) score += 1.5;
      else if (sv === 'No' && cv === 'Regularly') {
        items.push({ icon: '⚠️', text: `Different ${label}`, color: 'red' });
      }
    } else {
      score += 1.5;
    }
  }
  if (viceMatches === 2) items.push({ icon: '🍸', text: 'Aligned lifestyle habits', color: 'green' });

  // Diet (4): matters to many families; vegetarian and non-vegetarian is the big split
  if (s.dietaryPreferences && c.dietaryPreferences) {
    const veg = (d: string) => VEGGIE_DIETS.includes(d);
    if (s.dietaryPreferences === c.dietaryPreferences) {
      score += 4;
      items.push({ icon: '🥗', text: `Both ${c.dietaryPreferences.toLowerCase()}`, color: 'green' });
    } else if (veg(s.dietaryPreferences) && veg(c.dietaryPreferences)) {
      score += 3;
    } else if (veg(s.dietaryPreferences) && c.dietaryPreferences === 'Non-vegetarian'
      || veg(c.dietaryPreferences) && s.dietaryPreferences === 'Non-vegetarian') {
      items.push({ icon: '⚠️', text: `Different diets (${s.dietaryPreferences} vs ${c.dietaryPreferences})`, color: 'amber' });
    } else {
      score += 2;
    }
  } else {
    score += 2;
  }

  // Exercise (3)
  if (s.gymRoutine && c.gymRoutine) {
    if (s.gymRoutine === c.gymRoutine) {
      score += 3;
      if (c.gymRoutine === 'Daily' || c.gymRoutine === '3-4 times a week') {
        items.push({ icon: '💪', text: 'Both stay active', color: 'green' });
      }
    } else if (closeExerciseLevels(s.gymRoutine, c.gymRoutine)) {
      score += 1.5;
    }
  } else {
    score += 1.5;
  }

  // Sleep schedule (2)
  if (s.sleepSchedule && c.sleepSchedule && s.sleepSchedule === c.sleepSchedule) score += 2;
  else score += 1;

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

// Values (max 15) — religion, community, money
function scoreValues(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Religion (6)
  if (s.religion && c.religion) {
    if (s.religion === c.religion) {
      score += 6;
      items.push({ icon: '🕉️', text: `Both ${c.religion}`, color: 'green' });
    } else if (['Spiritual', 'Agnostic', 'Atheist', 'No religion', 'Other'].some((r) => r === s.religion || r === c.religion)) {
      score += 3;
    } else {
      items.push({ icon: '⚠️', text: `Different religions (${s.religion} vs ${c.religion})`, color: 'amber' });
    }
  } else {
    score += 3;
  }

  // Community (4): only counts when someone prefers their own community;
  // "caste no bar" on both sides, or not saying, is neutral
  const prefersOwn = (p: Profile) => ['Prefer my own community', 'Only my own community'].includes(p.openToOtherCommunities);
  const onlyOwn = (p: Profile) => p.openToOtherCommunities === 'Only my own community';
  const known = (caste: unknown) => typeof caste === 'string' && caste !== 'Prefer not to say' && caste !== 'Other';
  if (!prefersOwn(s) && !prefersOwn(c)) {
    score += s.openToOtherCommunities === 'Yes, caste no bar' && c.openToOtherCommunities === 'Yes, caste no bar' ? 4 : 3;
  } else if (!known(s.caste) || !known(c.caste)) {
    score += 2;
  } else if (String(s.caste).toLowerCase() === String(c.caste).toLowerCase()) {
    score += 4;
    items.push({ icon: '🤝', text: 'Same community', color: 'green' });
  } else {
    items.push({
      icon: '⚠️',
      text: onlyOwn(s) || onlyOwn(c) ? 'Different communities; one of you only wants their own' : 'Different communities',
      color: onlyOwn(s) || onlyOwn(c) ? 'red' : 'amber',
    });
  }

  // Money (5)
  if (s.financialApproach && c.financialApproach) {
    if (s.financialApproach === c.financialApproach) {
      score += 5;
      items.push({ icon: '💰', text: `Same money mindset: ${c.financialApproach.toLowerCase()}`, color: 'green' });
    } else if (
      (s.financialApproach === 'Saver' && c.financialApproach === 'Spender') ||
      (s.financialApproach === 'Spender' && c.financialApproach === 'Saver')
    ) {
      items.push({ icon: '⚠️', text: 'Different financial styles', color: 'amber' });
    } else {
      score += 2.5;
    }
  } else {
    score += 2.5;
  }

  return { score: Math.min(15, score), items };
}

// Location and background (max 15)
function scoreLocationBackground(s: Profile, c: Profile): Dimension {
  let score = 0;
  const items: CompatibilityItem[] = [];

  // Same city (6) — the biggest single signal. City and state when both
  // have them, otherwise the location text.
  const myPlace = placeOf(s);
  const theirPlace = placeOf(c);
  if (myPlace && theirPlace) {
    if (sameCity(myPlace, theirPlace)) {
      score += 6;
      items.push({ icon: '📍', text: `Both in ${c.city || c.location}`, color: 'green' });
    } else if (s.state && c.state ? s.state === c.state : sameRegion(myPlace, theirPlace)) {
      score += 3;
    } else {
      items.push({ icon: '✈️', text: 'Different cities', color: 'amber' });
    }
  } else {
    score += 2.5;
  }

  // Mother tongue (4): the same one, or two kinds of Hindi
  if (s.motherTongue && c.motherTongue) {
    const hindi = (m: string) => m.startsWith('Hindi');
    if (s.motherTongue === c.motherTongue) {
      score += 4;
      items.push({ icon: '🗣️', text: `Both speak ${c.motherTongue} at home`, color: 'green' });
    } else if (hindi(s.motherTongue) && hindi(c.motherTongue)) {
      score += 3;
    }
  } else {
    score += 2;
  }

  // Shared languages (2)
  if (s.languages && c.languages) {
    const split = (x: string) => x.toLowerCase().split(/[,;/]/).map((l) => l.trim()).filter(Boolean);
    const theirs = split(c.languages);
    const shared = split(s.languages).filter((lang) => theirs.includes(lang));
    if (shared.length >= 2) {
      score += 2;
      items.push({ icon: '💬', text: `Speak ${shared.length} common languages`, color: 'green' });
    } else if (shared.length === 1) {
      score += 1;
    }
  } else {
    score += 1;
  }

  // Settling abroad (3)
  const abroad = (p: Profile) => (p.settlingAbroad === 'Interested in settling abroad' ? true
    : p.settlingAbroad === 'Not interested in settling abroad' ? false : undefined);
  if (abroad(s) !== undefined && abroad(c) !== undefined) {
    if (abroad(s) === abroad(c)) {
      score += 3;
      if (abroad(c)) items.push({ icon: '🌍', text: 'Both open to settling abroad', color: 'green' });
    } else {
      items.push({ icon: '⚠️', text: 'Different plans about settling abroad', color: 'amber' });
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

  // Introvert or extrovert (5)
  if (s.socialBattery && c.socialBattery) {
    if (s.socialBattery === c.socialBattery) score += 5;
    else if (socialBatteriesCompatible(s.socialBattery, c.socialBattery)) score += 3.5;
    else score += 1;
  } else {
    score += 2.5;
  }

  // Disagreements (5)
  if (s.conflictResolution && c.conflictResolution) {
    if (s.conflictResolution === c.conflictResolution) {
      score += 5;
      if (c.conflictResolution === 'Calm discussion') items.push({ icon: '🕊️', text: 'Both talk disagreements through calmly', color: 'green' });
    } else if (
      (s.conflictResolution === 'Calm discussion' && c.conflictResolution === 'Direct & assertive') ||
      (s.conflictResolution === 'Direct & assertive' && c.conflictResolution === 'Calm discussion')
    ) score += 2.5;
    else score += 1;
  } else {
    score += 2.5;
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

  // Education (2)
  if (s.educationLevel && c.educationLevel) {
    if (s.educationLevel === c.educationLevel) {
      score += 2;
      items.push({ icon: '🎓', text: `Same education: ${c.educationLevel}`, color: 'green' });
    } else if (educationLevelsClose(s.educationLevel, c.educationLevel)) {
      score += 1.5;
    }
  } else {
    score += 1;
  }

  // Family values (2): the same, or next to each other on the scale
  const valuesOrder = ['Orthodox', 'Conservative', 'Moderate', 'Liberal'];
  const mine = valuesOrder.indexOf(s.familyValues);
  const theirs = valuesOrder.indexOf(c.familyValues);
  if (mine >= 0 && theirs >= 0) {
    const gap = Math.abs(mine - theirs);
    if (gap === 0) {
      score += 2;
      items.push({ icon: '🏡', text: `Both from ${c.familyValues.toLowerCase()} families`, color: 'green' });
    } else if (gap === 1) {
      score += 1;
    }
  } else {
    score += 1;
  }

  // Closeness to family (1)
  if (s.familyCloseness && c.familyCloseness && s.familyCloseness === c.familyCloseness) score += 1;
  else score += 0.5;

  return { score: Math.min(5, score), items };
}

function educationLevelsClose(a: string, b: string): boolean {
  const order = ['High School', 'Trade School', 'Diploma', "Bachelor's", "Master's", 'PhD'];
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
  parsed: ParsedPrompt = parsePrompt(prompt),
): { candidates: MatchCandidate[]; poolSize: number } {
  const me = ownProfile(meRow);
  const survivors = pool
    .map((row) => ({ row, c: asSeenByOthers(row) }))
    .filter(({ row, c }) => passesFilters(row, c, me, filters, parsed, now));
  const ranked = survivors
    .map(({ row, c }) => toCandidate(row, c, me, parsed, now))
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  return { candidates: ranked.slice(0, limit), poolSize: survivors.length };
}
