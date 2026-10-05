// Phase 12: the India details in My Profile, on other people's screens and in search.
// Usage: node india-profile.mjs <email A> <email B>
//   A: an onboarded account (password TestPass!2026). Its India details are cleared
//      first, so it gets the invitation; then they are filled in through My Profile.
//   B: another onboarded account (same password), who searches for A.
// Both accounts are changed: A becomes a woman looking for men in Chennai, B a
// verified Pro man looking for women.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B) { console.error('usage: node india-profile.mjs <email A> <email B>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';  // `docker ps` shows the name
const OUT = new URL('./.shots/india/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const INDIA_COLUMNS = ['profile_created_for', 'date_of_birth', 'marital_status', 'children_count', 'disability',
  'mother_tongue', 'caste', 'sub_caste', 'sect', 'open_to_other_communities', 'gotra', 'manglik', 'rashi', 'nakshatra',
  'birth_time', 'birth_place', 'horoscope_match', 'degree', 'employed_in', 'occupation', 'annual_income', 'country',
  'state', 'city', 'residential_status', 'settling_abroad', 'family_type', 'family_status', 'family_values',
  'father_occupation', 'mother_occupation', 'brothers', 'brothers_married', 'sisters', 'sisters_married',
  'family_location', 'living_with_family', 'about_family'];
const A = sql(`select id from profiles where email = '${EMAIL_A}';`);
const B = sql(`select id from profiles where email = '${EMAIL_B}';`);
const tierB = sql(`select subscription_tier from profiles where id = '${B}';`);
const NAME_A = 'Meera Testcase';
sql(`update profiles set ${INDIA_COLUMNS.map((c) => `${c} = null`).join(', ')}, name = '${NAME_A}', gender = 'Female',
       interested_in = 'Men', location = 'Mumbai, MH', height = null, religion = null, dietary_preferences = null, languages = null,
       hidden_fields = '{}', is_paused = false, settings_incognito = false, onboarding_complete = true where id = '${A}';
     update profiles set gender = 'Male', interested_in = 'Women', is_verified = true, subscription_tier = 'PRO',
       daily_search_count = 0, is_paused = false where id = '${B}';
     delete from likes where (liker_id = '${A}' and liked_id = '${B}') or (liker_id = '${B}' and liked_id = '${A}');
     delete from blocks where (blocker_id = '${A}' and blocked_id = '${B}') or (blocker_id = '${B}' and blocked_id = '${A}');`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { log('pageerror:', e.message); failures++; });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  return page;
}

try {
  // ---- A: the invitation, then My Profile -------------------------------------
  const pa = await signIn(EMAIL_A);
  log('1. the invitation to add the new details');
  await pa.getByText('New on your profile:').waitFor({ timeout: 5000 });
  await pa.screenshot({ path: `${OUT}1-invitation.png` });
  check(true, 'dashboard shows the invitation');
  await pa.getByRole('button', { name: /Add details/ }).click();
  await pa.getByText('Religion & Community').first().waitFor({ timeout: 5000 });
  check(true, '"Add details" opens My Profile');

  // A profile row, found by its label
  const row = (label) => pa.locator('div.group', { has: pa.locator(`span.truncate:text-is("${label}")`) }).first();
  const edit = async (label, fill) => {
    const r = row(label);
    await r.scrollIntoViewIfNeeded();
    await r.hover();
    await r.getByTitle('Edit').click();
    await fill(r);
    await r.getByRole('button', { name: 'Save' }).click();
    await pa.waitForTimeout(700);
  };
  const choose = (typed, option) => async (r) => {
    const box = r.getByRole('combobox');
    await box.fill(typed);
    await pa.getByRole('option', { name: option, exact: true }).click();
  };
  const select = (value) => async (r) => { await r.locator('select').first().selectOption(value); };
  const shown = async (label) => (await row(label).innerText()).replace(/\s+/g, ' ');

  log('2. filling in the India details in My Profile');
  await edit('Date of birth', async (r) => {
    await r.getByLabel('Day').selectOption('2');
    await r.getByLabel('Month').selectOption({ label: 'Apr' });
    await r.getByLabel('Year').selectOption('1996');
  });
  const age = sql(`select extract(year from age(current_date, date '1996-04-02'));`);
  check((await shown('Age')).includes(age), `age worked out from the date of birth: ${age}`);
  await row('Age').hover();
  check(await row('Age').getByTitle('Edit').count() === 0, 'the age can no longer be edited by hand');
  check((await shown('Date of birth')).includes('2 Apr 1996 (only your age is shown)'), 'date of birth says only the age is shown');

  await edit('Religion', select('Hindu'));
  await edit('Mother tongue', choose('tam', 'Tamil'));
  await edit('Caste', choose('brah', 'Brahmin'));
  await edit('Sub-caste', choose('iye', 'Iyer'));
  await row('Caste').hover();
  await row('Caste').getByTitle('Hide from profile').click();
  await pa.waitForTimeout(700);
  check((await shown('Caste')).includes('Hidden'), 'caste marked hidden');
  check(await row('Gotra').isVisible() && !(await row('Denomination').isVisible()), 'gotra offered to a Hindu, denomination not');
  await edit('Height', choose(`5' 8`, `5' 8" (173 cm)`));
  await edit('State', choose('tamil', 'Tamil Nadu'));
  await edit('City', choose('chen', 'Chennai'));
  await edit('Brothers', select('2'));
  await edit('Brothers married', select('1'));
  check((await shown('Brothers')).includes('2 (1 married)'), 'brothers read "2 (1 married)"');
  await edit('Manglik', select('Non Manglik'));
  await edit('Diet', select('Vegetarian'));
  await edit('Languages', async (r) => {
    await r.getByRole('button', { name: 'Tamil', exact: true }).click();
    await r.getByRole('button', { name: 'English', exact: true }).click();
  });
  await pa.screenshot({ path: `${OUT}2-my-profile.png`, fullPage: true });
  const pageText = await pa.locator('body').innerText();
  check(!/Marijuana|Other drugs|Relationship type/.test(pageText), 'cannabis, other drugs and relationship type are gone from My Profile');

  const saved = sql(`select concat_ws(' | ', mother_tongue, caste, sub_caste, 'caste' = any(hidden_fields), location, country, height_cm,
      brothers || '+' || brothers_married, manglik, languages, age) from profiles where id = '${A}';`);
  const want = `Tamil | Brahmin | Iyer | t | Chennai, Tamil Nadu | India | 173 | 2+1 | Non Manglik | Tamil, English | ${age}`;
  check(saved === want, `saved: ${saved}`);

  // ---- B: searching for A ---------------------------------------------------------
  const pb = await signIn(EMAIL_B);
  const search = async (prompt) => {
    await pb.getByText('Find Match', { exact: true }).first().click();
    const box = pb.getByPlaceholder(/Describe your ideal match/);
    await box.fill(prompt);
    const responded = pb.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 15000 });
    await box.press('Enter');
    const res = await responded;
    const body = await res.text();
    await pb.waitForTimeout(1200);
    return { body, json: JSON.parse(body) };
  };

  log('3. filters: mother tongue and height');
  await pb.getByRole('button', { name: 'Open filters' }).click();
  const mt = pb.getByRole('combobox', { name: 'Mother tongue' });
  await mt.fill('tam');
  await pb.getByRole('option', { name: 'Tamil', exact: true }).click();
  await pb.getByLabel('Shortest').selectOption({ label: `5' 6" (168 cm)` });
  await pb.screenshot({ path: `${OUT}3-filters.png` });
  await pb.getByRole('button', { name: 'Apply filters' }).click();
  const filtered = await search('someone kind');
  const ids = filtered.json.candidates.map((c) => c.id);
  check(ids.includes(A), `A found with mother tongue Tamil and 5'6" or taller (${ids.length} result(s))`);
  const others = sql(`select count(*) from profiles where id in (${ids.map((i) => `'${i}'`).join(',') || 'null'})
                        and (mother_tongue is distinct from 'Tamil' or height_cm < 168);`);
  check(others === '0', 'everyone found speaks Tamil at home and is 5\'6" or taller');
  const a = filtered.json.candidates.find((c) => c.id === A);
  check(!!a && a.caste === undefined && a.subCaste === 'Iyer' && !('dateOfBirth' in a) && !('date_of_birth' in a),
    'the server sent the sub-caste but not the hidden caste or the date of birth');
  check(!filtered.body.includes('1996-04-02') && !filtered.body.includes('Brahmin'), 'neither appears anywhere in the response');

  log("4. A's profile as B sees it");
  await pb.locator('h3', { hasText: NAME_A }).first().click();
  await pb.getByText('Religion & Community').waitFor({ timeout: 5000 });
  await pb.waitForTimeout(500);
  await pb.screenshot({ path: `${OUT}4-profile-seen-by-b.png` });
  const modal = await pb.locator('div.fixed.inset-0', { has: pb.getByText('Profile Details') }).innerText();
  check(modal.includes(NAME_A), 'reading the profile popup');
  for (const [what, text] of [['mother tongue', 'Tamil'], ['sub-caste', 'Iyer'], ['religion', 'Hindu'],
    ['brothers', '2 (1 married)'], ['Manglik', 'Non Manglik'], ['height', `5' 8" (173 cm)`], ['location', 'Chennai, Tamil Nadu']]) {
    check(modal.includes(text), `shows the ${what}: ${text}`);
  }
  check(!modal.includes('Brahmin') && !modal.includes('1996'), 'shows neither the hidden caste nor the date of birth');
  check(!/Marijuana|Other drugs|Relationship type/.test(modal), 'no cannabis, other drugs or relationship type');
  await pb.keyboard.press('Escape');

  log('5. typed search: heights and India words');
  await pb.getByRole('button', { name: 'Open filters' }).click();
  await pb.locator('aside').getByRole('button', { name: 'Clear all' }).click();
  await pb.getByRole('button', { name: 'Apply filters' }).click();
  const tall = await search(`Tamil girl, taller than 5'6"`);
  check(tall.json.understood.includes(`5'7" or taller`), `understood: ${tall.json.understood.join(', ')}`);
  check(tall.json.candidates.some((c) => c.id === A), 'A is found');
  const short = await search(`shorter than 5'5"`);
  check(!short.json.candidates.some((c) => c.id === A), 'A (5\'8") is left out of "shorter than 5\'5\\""');
  const nonManglik = await search('non manglik vegetarian');
  check(nonManglik.json.candidates[0]?.compatibilityScore >= 0 && nonManglik.json.candidates.some((c) => c.id === A),
    `"non manglik vegetarian" finds A (${nonManglik.json.understood.join(', ')})`);
} catch (e) {
  log('ERROR', e.message.split('\n')[0]);
  failures++;
} finally {
  await browser.close();
  sql(`update profiles set subscription_tier = '${tierB}' where id = '${B}';`);
}
log(failures === 0 ? 'RESULT: all checks passed' : `RESULT: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
