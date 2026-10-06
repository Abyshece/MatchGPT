// The consent screen and what Indian law asks around it, against the local stack:
//  B. A Google-style sign-up: account created by the auth server (no password, name in
//     metadata, no Terms answer), signed in by a link that returns with #access_token —
//     the same way the app receives a Google sign-in. Expect: consent screen, which
//     needs the Terms, the declarations (to marry, true details, the legal age) and
//     the consent to sensitive details → step 1 with the name filled in.
//  C. An existing, fully set-up account that never accepted the Terms (like the live
//     accounts): expect the consent screen once, then straight to the main app
//     (its required answers are filled in first: fixtures.mjs).
//  D. An account that accepted an earlier version: "We've updated our Terms", once.
//  E. Three months after the last reminder of the rules (IT Rules 2021, rule
//     3(1)(c)): the reminder, once.
//  F. A man under 21 (the legal age to marry): his profile stays hidden and the app
//     goes no further than the under-age screen.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED, PRIVACY_VERSION, REQUIRED_DETAILS, TERMS_VERSION, agreeToTerms } from './fixtures.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';  // local CLI default
const SEED_EMAIL = process.argv[2] || 'seed_aanyasharma_22@shaadigpt.dev';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const OUT = new URL('./.shots/shots-consent/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

async function admin(path, body) {
  const r = await fetch(`${API}/auth/v1/admin/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;

async function scenario(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Pretend the cookie banner was already answered so it doesn't cover buttons.
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().startsWith(API) && !r.url().includes('/realtime/')) {
      let b = ''; try { b = (await r.text()).slice(0, 160); } catch {}
      problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')} ${b}`);
    }
  });
  let n = 0;
  const shot = async (s) => page.screenshot({ path: `${OUT}${name[0]}${String(++n).padStart(2, '0')}-${s}.png` });
  log('SCENARIO', name);
  try {
    await fn(page, shot);
    log('  PASS');
  } catch (e) {
    failures++;
    log('  FAIL', e.message.split('\n')[0]);
    await shot('FAILED');
  }
  for (const p of [...new Set(problems)]) log('  browser problem:', p);
  await ctx.close();
}

await scenario('B Google-style new user', async (page, shot) => {
  const email = `google_like_${Date.now()}@shaadigpt.dev`;
  await admin('users', { email, email_confirm: true, user_metadata: { full_name: 'Priya Google', name: 'Priya Google' } });
  const link = await admin('generate_link', { type: 'magiclink', email, redirect_to: BASE });
  await page.goto(link.action_link ?? link.properties.action_link);
  await page.getByText('Before you start').waitFor({ timeout: 15000 });
  await shot('consent-screen');
  const cont = page.getByRole('button', { name: /Agree and continue/ });
  if (await cont.isEnabled()) throw new Error('Agree and continue is enabled before ticking anything');
  await page.getByTestId('consent-terms').check();
  await page.getByTestId('consent-marriage').check();
  await page.getByTestId('consent-age').check();
  if (await cont.isEnabled()) throw new Error('Agree and continue is enabled without the consent to sensitive details');
  if (await page.getByTestId('consent-marketing').isChecked()) throw new Error('emails ticked without asking');
  await page.getByTestId('consent-sensitive').check();
  await cont.click();
  await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
  const name = await page.getByPlaceholder("As you'd like it shown").inputValue();
  await shot('step1-name-prefilled');
  if (name !== 'Priya Google') throw new Error(`name not prefilled (got "${name}")`);
  const recorded = sql(`select string_agg(event_type || '=' || consented, ',' order by event_type) || ' ip=' || bool_and(ip_address is not null)
    from consent_records c join profiles p on p.id = c.user_id where p.email = '${email}'`);
  if (recorded !== 'legal_age_declaration=true,marketing_consent=false,matrimony_declaration=true,privacy_accepted=true,sensitive_data_consent=true,terms_accepted=true ip=true')
    throw new Error(`consent records: ${recorded}`);
  const versions = sql(`select terms_version || ' ' || privacy_version || ' ' || (rules_reminded_at > now() - interval '1 minute') from profiles where email = '${email}'`);
  if (versions !== `${TERMS_VERSION} ${PRIVACY_VERSION} true`) throw new Error(`profile versions: ${versions}`);
  log('  consent recorded, step 1 shows name:', name);
});

await scenario('C Existing account without Terms', async (page, shot) => {
  // An earlier run accepted them: back to never having answered
  const reset = await fetch(`${API}/rest/v1/profiles?email=eq.${encodeURIComponent(SEED_EMAIL)}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms_accepted_at: null, privacy_accepted_at: null, terms_version: null, privacy_version: null, rules_reminded_at: null }),
  });
  if (!reset.ok) throw new Error(`resetting the account's Terms: ${reset.status} ${await reset.text()}`);
  // The answers every member gives, so the Terms are all it's asked for
  execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`,
    { input: `update profiles set ${REQUIRED_DETAILS} where email = '${SEED_EMAIL}';` });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(SEED_EMAIL);
  await page.locator('input[type=password]').fill('SeedUser!2024');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByText('Before you start').waitFor({ timeout: 15000 });
  await shot('consent-screen');
  await agreeToTerms(page);
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  await shot('main-app');
  if (await page.getByTestId('rules-reminder').isVisible()) throw new Error('the rules were recalled right after agreeing to them');
  // Reload: the consent screen must not come back.
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  if (await page.getByText('Before you start').isVisible()) throw new Error('consent screen came back after reload');
});

const signIn = async (page, email, password) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
};

await scenario('D Accepted an earlier version', async (page, shot) => {
  sql(`update profiles set ${REQUIRED_DETAILS}, ${CONSENTED} where email = '${SEED_EMAIL}';
       update profiles set terms_version = 'terms-v5-2026-09-01' where email = '${SEED_EMAIL}';`);
  await signIn(page, SEED_EMAIL, 'SeedUser!2024');
  await page.getByRole('heading', { name: "We've updated our Terms" }).waitFor({ timeout: 15000 });
  await shot('updated-terms');
  await agreeToTerms(page);
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  const version = sql(`select terms_version from profiles where email = '${SEED_EMAIL}'`);
  if (version !== TERMS_VERSION) throw new Error(`accepted version not saved: ${version}`);
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  if (await page.getByTestId('consent-screen').isVisible()) throw new Error('consent screen came back after reload');
});

await scenario('E The rules, recalled every three months', async (page, shot) => {
  sql(`update profiles set ${REQUIRED_DETAILS}, ${CONSENTED} where email = '${SEED_EMAIL}';
       update profiles set rules_reminded_at = now() - interval '91 days' where email = '${SEED_EMAIL}';`);
  await signIn(page, SEED_EMAIL, 'SeedUser!2024');
  const reminder = page.getByTestId('rules-reminder');
  await reminder.waitFor({ timeout: 15000 });
  await shot('rules-reminder');
  const text = await reminder.innerText();
  if (!/suspend or\s+close your account/.test(text) || !/penalties or punishment/.test(text) || !/report them to the authorities/.test(text))
    throw new Error(`the reminder doesn't say what the law asks: ${text.slice(0, 200)}`);
  await page.getByTestId('rules-reminder-ok').click();
  await reminder.waitFor({ state: 'detached', timeout: 10000 });
  const fresh = sql(`select rules_reminded_at > now() - interval '1 minute' from profiles where email = '${SEED_EMAIL}'`);
  if (fresh !== 't') throw new Error('the reminder was not recorded');
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  if (await page.getByTestId('rules-reminder').isVisible()) throw new Error('the reminder came back after reload');
});

await scenario('F A man under 21', async (page, shot) => {
  const email = `under21_${Date.now()}@shaadigpt.dev`;
  await admin('users', { email, password: 'TestPass!2026', email_confirm: true });
  // As it would be for someone who joined before the rule: written past the check
  sql(`update profiles set ${REQUIRED_DETAILS}, ${CONSENTED}, onboarding_complete = true where email = '${email}';
       set session_replication_role = replica;
       update profiles set gender = 'Male', date_of_birth = current_date - interval '20 years', age = 20, is_paused = false where email = '${email}';`);
  await signIn(page, email, 'TestPass!2026');
  await page.getByTestId('under-age').waitFor({ timeout: 15000 });
  await shot('under-age');
  const text = await page.getByTestId('under-age').innerText();
  if (!/Shaadi24 is for 21 and over/.test(text)) throw new Error(`under-age screen: ${text.slice(0, 120)}`);
  if (await page.getByTestId('find-match-box').count()) throw new Error('the app opened for a man under 21');
  // Any change to the profile keeps it hidden
  sql(`update profiles set city = 'Pune' where email = '${email}'`);
  const paused = sql(`select is_paused from profiles where email = '${email}'`);
  if (paused !== 't') throw new Error('his profile is not hidden');
  // And the database refuses a new date of birth under 21
  let refused = false;
  try { sql(`update profiles set date_of_birth = current_date - interval '19 years' where email = '${email}'`); } catch { refused = true; }
  if (!refused) throw new Error('a date of birth under 21 was accepted for a man');
});

await browser.close();
log(failures ? `${failures} scenario(s) failed` : 'all scenarios passed');
process.exit(failures ? 1 : 0);
