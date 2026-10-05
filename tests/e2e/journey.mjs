// The whole journey, against the local stack: a brand-new member signs up and
// sets up their profile (signup-flow.mjs), finds someone with a filter, likes
// them from their profile; she sees the like in Likes You and likes back; she
// sees "It's a Match!" once, and he gets it live; she sends the first message
// and he gets it while his chat is open, answers, and she gets that; each sees
// "Read" once the other has read it; the match is in both Matches lists.
// Usage: node journey.mjs   (SERVICE_ROLE_KEY; DB_CONTAINER, BASE_URL, MAILPIT_URL
//   as signup-flow.mjs; makes two new accounts)
import { chromium } from 'playwright';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SERVICE = process.env.SERVICE_ROLE_KEY || '';
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is needed (npx supabase status)'); process.exit(2); }
const OUT = new URL('./.shots/journey/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const stamp = Date.now();
const HIM = `newuser_${stamp}@shaadigpt.dev`;          // signs up through the website
const HER = `journey_${stamp}@shaadigpt.dev`;          // already a member
const HER_NAME = 'Meera Journey';
const PLACE = `Journeyville${String(stamp).slice(-4)}`;  // only she lives there
const PASSWORD = 'TestPass!2026';

log('1. He signs up and sets up his profile (signup-flow.mjs)');
try {
  execFileSync(process.execPath, [new URL('./signup-flow.mjs', import.meta.url).pathname, HIM], { stdio: 'inherit', env: process.env });
  check(true, 'sign-up and profile setup went through');
} catch {
  check(false, 'sign-up and profile setup went through');
  process.exit(1);
}
const him = sql(`select id || '|' || name || '|' || gender || '|' || interested_in from profiles where email = '${HIM}';`).split('|');
check(him.length === 4 && him[2] === 'Male' && him[3] === 'Women', `his profile: ${him[1]}, ${him[2]}, looking for ${him[3]}`);

// She's a member already: an account, and a profile like one of the seeded women's
const r = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: HER, password: PASSWORD, email_confirm: true }),
});
const her = (await r.json()).id;
if (!her) { check(false, 'her account was made'); process.exit(1); }
const seed = sql(`select id from profiles where gender = 'Female' and onboarding_complete and array_length(photo_urls, 1) >= 4 and email like 'seed_%' order by email limit 1;`);
sql(`update profiles p set
       (age, date_of_birth, height, religion, mother_tongue, description, photo_urls, job_title, education_level, hobbies,
        languages, dietary_preferences, smoking, drinking, marital_status)
     = (select s.age, s.date_of_birth, s.height, s.religion, s.mother_tongue, s.description, s.photo_urls, s.job_title,
               s.education_level, s.hobbies, s.languages, s.dietary_preferences, s.smoking, s.drinking, s.marital_status
          from profiles s where s.id = '${seed}')
     where p.id = '${her}';
     update profiles set name = '${HER_NAME}', gender = 'Female', interested_in = 'Men', city = '${PLACE}', state = 'Kerala',
       country = 'India', onboarding_complete = true, is_verified = true, terms_accepted_at = now(), privacy_accepted_at = now()
     where id = '${her}';`);
check(sql(`select location from profiles where id = '${her}';`).startsWith(PLACE), `she lives in ${PLACE}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const open = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 20000 });
  return page;
};

let hisPage, herPage;
try {
  log('2. He finds her with a filter and likes her');
  hisPage = await open(HIM);
  await hisPage.getByRole('button', { name: 'Open filters' }).click();
  await hisPage.getByPlaceholder('e.g. Mumbai, Bangalore').fill(PLACE);
  await hisPage.getByRole('button', { name: 'Apply filters' }).click();
  await hisPage.getByRole('button', { name: 'Search', exact: true }).click();
  check(await appears(hisPage.getByText(HER_NAME), 20000), `the search finds ${HER_NAME}`);
  await hisPage.screenshot({ path: `${OUT}1-found.png` });
  await hisPage.getByText(HER_NAME).first().click();
  const dialog = hisPage.locator('[data-popup], .fixed.inset-0').filter({ hasText: 'Profile Details' }).last();
  await dialog.getByTitle('Like').first().click();
  await hisPage.getByRole('button', { name: 'Yes, Like' }).click();
  check(await appears(hisPage.getByText(`Liked ${HER_NAME}`)), 'he likes her ("Liked …")');
  check(sql(`select count(*) from likes where liker_id = '${him[0]}' and liked_id = '${her}';`) === '1', 'the like is saved');
  await hisPage.keyboard.press('Escape');

  log('3. She sees his like and likes back: a match');
  herPage = await open(HER);
  await herPage.getByRole('button', { name: /Likes You/ }).first().click();
  check(await appears(herPage.getByText(him[1])), `Likes You shows ${him[1]}`);
  await herPage.getByTitle('Like').first().click();
  await herPage.getByRole('button', { name: 'Yes, Like' }).click();
  check(await appears(herPage.getByText("It's a Match!")), `"It's a Match!" for her`);
  check(await appears(herPage.getByText(`You and ${him[1]} liked each other.`)), 'naming him');
  const matchId = sql(`select id from matches where (user_a_id, user_b_id) in (('${him[0]}', '${her}'), ('${her}', '${him[0]}')) and unmatched_at is null;`);
  check(/^[0-9a-f-]{36}$/.test(matchId), 'the match is saved');
  // He liked first: the match reaches him live, wherever he is in the app
  check(await appears(hisPage.getByText(`You and ${HER_NAME} liked each other.`), 15000), `"It's a Match!" reaches him live`);
  await herPage.waitForTimeout(2000);  // her own live notice of the match has arrived by now
  check(await herPage.getByRole('button', { name: /Send a Message/ }).count() === 1, 'one celebration for her (there used to be two on top of each other)');
  await herPage.screenshot({ path: `${OUT}2-match.png` });
  await hisPage.getByRole('button', { name: 'Keep Searching' }).click();

  log('4. They chat');
  await herPage.getByRole('button', { name: /Send a Message/ }).click();
  const herBox = herPage.getByPlaceholder(`Message ${him[1]}…`);
  check(await appears(herBox), '"Send a Message" opens their chat (from Likes You it only said to open Matches)');
  await hisPage.getByRole('button', { name: /^Matches/ }).first().click();
  check(await appears(hisPage.getByText(HER_NAME)), `his Matches list has ${HER_NAME}`);
  await hisPage.getByText(HER_NAME).first().click();
  const hisBox = hisPage.getByPlaceholder(`Message ${HER_NAME}…`);
  await hisBox.waitFor({ timeout: 10000 });

  const hello = `Hi! You like hiking too? (${stamp})`;
  await herBox.fill(hello);
  await herBox.press('Enter');
  check(await appears(hisPage.getByText(hello), 15000), 'he gets her message while his chat is open');
  const reply = `Yes! Sinhagad next Sunday? (${stamp})`;
  await hisBox.fill(reply);
  await hisBox.press('Enter');
  check(await appears(herPage.getByText(reply), 15000), 'she gets his answer');
  check(await appears(herPage.getByText('Read'), 15000), 'she sees "Read" under her message');
  check(await appears(hisPage.getByText('Read'), 15000), 'he sees "Read" under his');
  check(sql(`select count(*) from messages where match_id = '${matchId}';`) === '2', 'both messages are saved');
  await herPage.screenshot({ path: `${OUT}3-her-chat.png` });
  await hisPage.screenshot({ path: `${OUT}4-his-chat.png` });

  await herPage.reload();
  await herPage.getByRole('button', { name: /^Matches/ }).first().click();
  check(await appears(herPage.getByText(him[1])), `her Matches list has ${him[1]}`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await hisPage?.screenshot({ path: `${OUT}FAILED-his.png` }).catch(() => {});
  await herPage?.screenshot({ path: `${OUT}FAILED-her.png` }).catch(() => {});
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
