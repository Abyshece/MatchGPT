// ============================================================================
// Shaadi24 Mock Profile Seeder
//
// Inserts ~50 realistic mock profiles into your Supabase dev database so you
// can test searches end-to-end before any real users exist.
//
// HOW TO RUN:
//   1. Make sure .env.local has VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//   2. From the project root:
//        npm install --save-dev tsx dotenv @supabase/supabase-js
//        npx tsx scripts/seed.ts
//
// HOW TO RESET (wipe all seeded users):
//        npx tsx scripts/seed.ts --reset
//
// SAFETY: this uses the SERVICE ROLE key. Never run this in production.
// All seeded users have emails like seed_xxx@shaadigpt.dev so they're easy
// to identify and delete.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import type { Database, ProfileRow } from '../lib/database.types';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ----------------------------------------------------------------------------
// Mock data pools
// ----------------------------------------------------------------------------

const FEMALE_NAMES = [
  'Aanya Sharma', 'Priya Iyer', 'Riya Mehta', 'Ananya Reddy', 'Kavya Nair',
  'Diya Kapoor', 'Ishita Banerjee', 'Sneha Pillai', 'Tanvi Joshi', 'Meera Krishnan',
  'Aditi Rao', 'Nisha Verma', 'Pooja Gupta', 'Saanvi Desai', 'Avani Patel',
  'Emma Walker', 'Olivia Brooks', 'Sophia Reed', 'Charlotte Hayes', 'Amelia Cole',
  'Isabella Cruz', 'Mia Foster', 'Ava Bennett', 'Harper Quinn', 'Evelyn Park',
];

const MALE_NAMES = [
  'Arjun Mehta', 'Rohan Sharma', 'Vikram Iyer', 'Kabir Reddy', 'Aditya Nair',
  'Karan Kapoor', 'Rishabh Banerjee', 'Siddharth Pillai', 'Aarav Joshi', 'Dhruv Krishnan',
  'Veer Rao', 'Manav Verma', 'Ishaan Gupta', 'Reyansh Desai', 'Aryan Patel',
  'Liam Walker', 'Noah Brooks', 'Ethan Reed', 'Mason Hayes', 'Lucas Cole',
  'Henry Cruz', 'Jack Foster', 'Owen Bennett', 'Theo Quinn', 'Leo Park',
];

const LOCATIONS_INDIA = [
  'Mumbai, MH', 'Bangalore, KA', 'Delhi, DL', 'Hyderabad, TG', 'Chennai, TN',
  'Pune, MH', 'Kolkata, WB', 'Ahmedabad, GJ', 'Gurgaon, HR', 'Noida, UP',
];

const LOCATIONS_GLOBAL = [
  'New York, NY', 'San Francisco, CA', 'London, UK', 'Toronto, ON', 'Singapore',
];

const JOBS = [
  'Software Engineer', 'Product Manager', 'Doctor', 'Lawyer', 'Architect',
  'Designer', 'Teacher', 'Founder', 'Chartered Accountant', 'Investment Banker',
  'Marketing Manager', 'Data Scientist', 'Researcher', 'Consultant', 'Therapist',
  'Writer', 'Chef', 'Pilot', 'Photographer', 'Civil Servant',
];

const UNIVERSITIES = [
  'IIT Bombay', 'IIT Delhi', 'IIT Madras', 'IIM Ahmedabad', 'IIM Bangalore',
  'BITS Pilani', 'Delhi University', 'Mumbai University', 'Stanford University',
  'MIT', 'NYU', 'LSE', 'Oxford', 'Cambridge', 'NLSIU Bangalore',
];

const HOBBIES = [
  'Reading, Yoga, Travel', 'Hiking, Photography, Cooking', 'Gaming, Music, Movies',
  'Painting, Pottery, Coffee', 'Running, Cycling, Swimming', 'Dance, Singing, Theater',
  'Chess, Reading, Tea', 'Football, Gym, Travel', 'Coding side projects, Anime, Boba',
  'Trekking, Birdwatching, Journaling',
];

const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Agnostic', 'Spiritual', 'Atheist'];
const POLITICS = ['Liberal', 'Moderate', 'Conservative', 'Apolitical'];
const HEIGHTS = [`5'2"`, `5'4"`, `5'6"`, `5'8"`, `5'10"`, `6'0"`, `6'2"`];
const BODY_TYPES = ['Slim', 'Athletic', 'Average', 'Curvy', 'Plus Size', 'Muscular'];
const ETHNICITIES = ['Indian', 'Asian', 'Black', 'Caucasian', 'Hispanic', 'Mixed'];
const RELATIONSHIP_TYPES = ['Monogamous', 'Open to monogamy'];
const DATING_INTENTIONS = ['Marriage', 'Long-term relationship', 'Long-term, open to short'];
const FAMILY_PLANS = ['Wants children', 'Open to children', 'Does not want children'];
const VICE_LEVELS = ['No', 'Socially', 'Regularly'];
const LOVE_LANGUAGES = ['Words of Affirmation', 'Acts of Service', 'Receiving Gifts', 'Quality Time', 'Physical Touch'];
const ATTACHMENT_STYLES = ['Secure', 'Anxious', 'Avoidant'];
const SLEEP = ['Early Bird', 'Night Owl', 'Flexible'];
const SOCIAL_BATTERY = ['Introvert', 'Ambivert', 'Extrovert'];
const DIET = ['No restrictions', 'Vegetarian', 'Vegan', 'Eggetarian', 'Jain'];
const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const MUSIC = ['Bollywood', 'Indie', 'Classical', 'Pop', 'Rock', 'Hip Hop', 'Jazz', 'Electronic'];
const FINANCIAL_APPROACHES = ['Saver', 'Spender', 'Balanced', 'Investor'];
const CONFLICT_RESOLUTION = ['Calm discussion', 'Needs space', 'Direct & assertive'];
const MARRIAGE_TIMELINE = ['Within 1 Year', '1-2 Years', '3-5 Years', 'Not sure yet'];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

function buildPhotoUrls(seed: string, gender: 'female' | 'male'): string[] {
  const dir = gender === 'female' ? 'women' : 'men';
  const idx = (Math.abs(seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 99) + 1;
  const portrait = `https://randomuser.me/api/portraits/${dir}/${idx}.jpg`;
  const lifestyle = (n: number) => `https://picsum.photos/seed/${seed}_${n}/600/800`;
  return [portrait, lifestyle(1), lifestyle(2), lifestyle(3), lifestyle(4), lifestyle(5)];
}

function buildBio(name: string, job: string, location: string, hobbies: string): string {
  const first = name.split(' ')[0];
  const intros = [
    `${job} based in ${location.split(',')[0]}.`,
    `Currently working as a ${job} in ${location.split(',')[0]}.`,
    `${job} who calls ${location.split(',')[0]} home.`,
  ];
  const middles = [
    `On weekends, you'll find me ${hobbies.split(',')[0].toLowerCase()}.`,
    `Big fan of ${hobbies.split(',')[0].toLowerCase()} and good conversation.`,
    `When I'm not working, it's ${hobbies.toLowerCase()}.`,
  ];
  const ends = [
    `Looking for someone genuine to share life with.`,
    `Hoping to meet someone with shared values and a good sense of humor.`,
    `Here for something real, not just a swipe.`,
  ];
  return `${pick(intros)} ${pick(middles)} ${pick(ends)}`;
}

// Build a single mock profile. Returns the auth-user payload + profile fields.
function generateProfile(index: number) {
  const isFemale = chance(0.5);
  const name = pick(isFemale ? FEMALE_NAMES : MALE_NAMES);
  const gender = isFemale ? 'Female' : 'Male';
  const interestedIn = isFemale ? 'Men' : 'Women';
  const age = randInt(22, 38);
  const location = chance(0.7) ? pick(LOCATIONS_INDIA) : pick(LOCATIONS_GLOBAL);
  const job = pick(JOBS);
  const hobbies = pick(HOBBIES);
  const tags = hobbies.split(',').map(h => h.trim()).slice(0, 3);

  const seed = `${name.replace(/\s/g, '').toLowerCase()}_${index}`;
  const email = `seed_${seed}@shaadigpt.dev`;

  return {
    email,
    password: 'SeedUser!2024', // all seeded users share a password for dev convenience
    profile: {
      email,
      email_verified: true,
      phone_verified: true,
      onboarding_complete: true,
      verification_status: 'verified' as const,
      is_verified: true,

      subscription_tier: chance(0.15) ? ('PRO' as const) : ('FREE' as const),

      name,
      age,
      gender,
      interested_in: interestedIn,
      pronouns: isFemale ? 'She/Her' : 'He/Him',
      sexuality: 'Straight',
      location,
      hometown: pick([...LOCATIONS_INDIA, ...LOCATIONS_GLOBAL]),
      ethnicity: pick(ETHNICITIES),
      languages: pick(['English, Hindi', 'English', 'English, Tamil', 'English, Marathi', 'English, Bengali']),

      height: pick(HEIGHTS),
      body_type: pick(BODY_TYPES),
      hair_color: pick(['Black', 'Brown', 'Blonde']),
      eye_color: pick(['Brown', 'Black', 'Hazel', 'Green']),
      has_tattoos: chance(0.2) ? 'Yes' : 'No',
      wears_glasses: chance(0.3) ? 'Yes' : 'No',

      drinking: pick(VICE_LEVELS),
      smoking: chance(0.85) ? 'No' : pick(['Socially', 'Regularly']),
      marijuana: chance(0.9) ? 'No' : 'Socially',
      drugs: chance(0.97) ? 'No' : 'Sometimes',
      can_cook: chance(0.6) ? 'Yes' : 'No',
      gym_routine: pick(['Daily', '3-4 times a week', '1-2 times a week', 'Occasionally', 'Never']),
      reading_interest: pick(['Avid Reader', 'Occasionally', 'Audiobooks']),
      hobbies,

      loves_travel: chance(0.85) ? 'Yes' : 'No',
      travel_style: pick(['Budget/Backpacking', 'Standard', 'Luxury', 'Adventure', 'Cultural']),

      job_title: job,
      work: pick(['Tech Co', 'Startup', 'MNC', 'Self Employed', 'Government', 'Hospital', 'Law Firm']),
      university: pick(UNIVERSITIES),
      education_level: pick(['Bachelor\'s', 'Master\'s', 'PhD']),
      work_style: pick(['In-Office', 'Remote (WFH)', 'Hybrid']),

      religion: pick(RELIGIONS),
      politics: pick(POLITICS),
      zodiac: pick(ZODIAC),
      music_genre: pick(MUSIC),
      criminal_record: 'Clean Record',

      love_language: pick(LOVE_LANGUAGES),
      relationship_type: pick(RELATIONSHIP_TYPES),
      dating_intention: pick(DATING_INTENTIONS),
      children: chance(0.9) ? 'No children' : 'Has children',
      family_plans: pick(FAMILY_PLANS),
      pets: pick(['Dog', 'Cat', 'None']),
      marriage_timeline: pick(MARRIAGE_TIMELINE),
      family_closeness: pick(['Very Close', 'Moderately Close']),
      financial_splitting: pick(['Split 50/50', 'Proportional to Income']),

      conflict_resolution: pick(CONFLICT_RESOLUTION),
      social_battery: pick(SOCIAL_BATTERY),
      dietary_preferences: pick(DIET),
      attachment_style: pick(ATTACHMENT_STYLES),
      sleep_schedule: pick(SLEEP),
      financial_approach: pick(FINANCIAL_APPROACHES),

      description: buildBio(name, job, location, hobbies),
      photo_urls: buildPhotoUrls(seed, isFemale ? 'female' : 'male'),
      hidden_fields: [],
    },
  };
}

// ----------------------------------------------------------------------------
// Reset (wipe all seeded users)
// ----------------------------------------------------------------------------

async function reset() {
  console.log('Resetting: deleting all seeded users (emails matching seed_*@shaadigpt.dev)...');

  // Page through auth.users and delete the seed ones.
  let page = 1;
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;

    for (const user of data.users) {
      if (user.email?.startsWith('seed_') && user.email.endsWith('@shaadigpt.dev')) {
        const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
        if (delErr) {
          console.warn(`  failed to delete ${user.email}:`, delErr.message);
        } else {
          deleted++;
        }
      }
    }

    if (data.users.length < 200) break;
    page++;
  }

  console.log(`Deleted ${deleted} seeded users.`);
}

// ----------------------------------------------------------------------------
// Seed
// ----------------------------------------------------------------------------

async function seed(count: number) {
  console.log(`Seeding ${count} mock profiles...`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const { email, password, profile } = generateProfile(i);

    // create the auth user. The on_auth_user_created trigger will insert a profiles row.
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error(`  [${i + 1}/${count}] auth failed for ${email}:`, authError?.message);
      failed++;
      continue;
    }

    // update the profile row that the trigger just created
    const { error: profileError } = await admin
      .from('profiles')
      .update(profile as Partial<ProfileRow>)
      .eq('id', authData.user.id);

    if (profileError) {
      console.error(`  [${i + 1}/${count}] profile update failed for ${email}:`, profileError.message);
      failed++;
      continue;
    }

    success++;
    if ((i + 1) % 10 === 0 || i === count - 1) {
      console.log(`  [${i + 1}/${count}] ${success} ok, ${failed} failed`);
    }
  }

  console.log(`\nDone. ${success} profiles created, ${failed} failed.`);
  console.log(`All seeded users share password: SeedUser!2024`);
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

const args = process.argv.slice(2);
const isReset = args.includes('--reset');
const countArg = args.find(a => a.startsWith('--count='));
const count = countArg ? parseInt(countArg.split('=')[1], 10) : 50;

(async () => {
  try {
    if (isReset) {
      await reset();
    } else {
      await seed(count);
    }
    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
