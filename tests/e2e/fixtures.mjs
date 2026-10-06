// Shared by the browser tests.
import { readFileSync } from 'node:fs';

const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;

// The answers every member gives (lib/profileRewards.ts), for accounts the
// tests make or reuse: a SQL "set" list that fills only what's missing, so an
// account skips the required-details screen. Use it in an
// `update profiles set …` statement.
export const REQUIRED_DETAILS = `
  profile_created_for = coalesce(nullif(profile_created_for, ''), 'Myself'),
  date_of_birth = coalesce(date_of_birth, date '1995-06-15'),
  gender = coalesce(nullif(gender, ''), 'Female'),
  interested_in = coalesce(nullif(interested_in, ''), 'Men'),
  marital_status = coalesce(nullif(marital_status, ''), 'Never Married'),
  height = coalesce(nullif(height, ''), '5'' 5" (165 cm)'),
  country = coalesce(nullif(country, ''), 'India'),
  state = case when coalesce(nullif(country, ''), 'India') = 'India' then coalesce(nullif(state, ''), 'Maharashtra') else state end,
  city = coalesce(nullif(city, ''), 'Mumbai'),
  religion = coalesce(nullif(religion, ''), 'Hindu'),
  mother_tongue = coalesce(nullif(mother_tongue, ''), 'Marathi'),
  education_level = coalesce(nullif(education_level, ''), 'Bachelor''s'),
  occupation = coalesce(nullif(occupation, ''), 'Software Professional'),
  description = case when length(btrim(coalesce(description, ''))) >= 30 then description
                     else 'Kind, curious and close to family. Testing Shaadi24.' end`;


// The Terms and Privacy Policy versions the app asks members to accept
// (lib/consentService.ts; the consent screen comes back when they change)
const consentSource = readFileSync(`${REPO}/lib/consentService.ts`, 'utf8');
export const TERMS_VERSION = consentSource.match(/TERMS_VERSION = '([^']+)'/)[1];
export const PRIVACY_VERSION = consentSource.match(/PRIVACY_VERSION = '([^']+)'/)[1];

// For accounts the tests reuse: the current Terms and Privacy Policy accepted
// and the rules just recalled (RulesReminder), so neither screen comes up. A
// SQL "set" list, like REQUIRED_DETAILS.
export const CONSENTED = `
  terms_accepted_at = coalesce(terms_accepted_at, now()),
  privacy_accepted_at = coalesce(privacy_accepted_at, now()),
  terms_version = '${TERMS_VERSION}',
  privacy_version = '${PRIVACY_VERSION}',
  rules_reminded_at = now()`;

/** On the consent screen (StepConsent): ticks what a new member must agree to, and agrees. */
export async function agreeToTerms(page, { timeout = 15000 } = {}) {
  await page.getByTestId('consent-screen').waitFor({ timeout });
  const terms = page.getByTestId('consent-terms');
  if (await terms.count()) await terms.check();   // ticked already on the email sign-up form
  for (const id of ['consent-marriage', 'consent-age', 'consent-sensitive']) await page.getByTestId(id).check();
  await page.getByRole('button', { name: /Agree and continue/ }).click();
}
