// Find Match's Trending pills and searches in Indian languages, against the
// local stack as one signed-in member (an onboarded account, password
// TestPass!2026; moved to Mumbai):
//  1. Trending: what other members in the member's city searched, made by at
//     least 2 of them, comes first under "Trending in Mumbai"; one member's
//     search, one with a phone number and one that found nobody never show;
//     a tapped pill goes into the search box; signed out, nobody can ask
//  2. With Gemini (gemini-standin.cjs running, the functions served with its
//     settings): a search in Hinglish and one in Hindi are understood, and
//     the AI's line back is in the language they were typed in
//  3. Without Gemini (a prompt with "quota" makes the stand-in say "out of
//     quota"), the rules still understand a Hinglish search
// Usage: node search-languages.mjs <email>   (DB_CONTAINER, BASE_URL, ANON_KEY)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY;

const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/search-languages/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${EMAIL}';`);
sql(`update profiles set daily_search_count = 0, subscription_tier = 'FREE', is_paused = false, account_created = now(),
       city = 'Mumbai', state = 'Maharashtra', country = 'India' where id = '${me}';
     delete from search_usage where user_id = '${me}';`);
// Searches by other members: three in Mumbai made each of the first two (more
// than any other Mumbai search here); one made it only once; one has a phone
// number; one found nobody; and two members of another city
const [m1, m2, m3] = sql(`select id from profiles where id <> '${me}' and city = 'Mumbai' and onboarding_complete order by id limit 3;`).split('\n');
const OTHER_CITY = sql(`select city from profiles where city <> 'Mumbai' and coalesce(state, '') <> 'Maharashtra'
  and onboarding_complete and id <> '${me}' group by city having count(*) >= 2 order by count(*) desc limit 1;`);
const [d1, d2] = sql(`select id from profiles where id <> '${me}' and city = '${OTHER_CITY}' and onboarding_complete order by id limit 2;`).split('\n');
const found = sql(`select id from profiles where id <> '${me}' limit 1;`);
// So this run's searches are its own (letters: a run of digits reads as a phone number)
const TAG = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const MUMBAI = `Kind teacher who sings ${TAG}`;
const MUMBAI_HINDI = `Mumbai wali ladki ${TAG}`;
const ONCE = `Only one searched this ${TAG}`;
const PHONE = `call 98765 43210 ${TAG}`;
const NOBODY = `Nobody found ${TAG}`;
const OTHER = `Doctor who cooks ${TAG}`;
const add = (who, prompt, results = true) => `insert into search_history (user_id, prompt, filters, result_ids, pool_size)
  values ('${who}', '${prompt}', '{}', ${results ? `array['${found}']::uuid[]` : `'{}'::uuid[]`}, 10);`;
sql([
  add(m1, MUMBAI), add(m2, MUMBAI), add(m2, MUMBAI), add(m3, MUMBAI),
  add(m1, MUMBAI_HINDI), add(m2, MUMBAI_HINDI), add(m3, MUMBAI_HINDI.toUpperCase()),
  add(m1, ONCE), add(m1, PHONE), add(m2, PHONE), add(m1, NOBODY, false), add(m2, NOBODY, false),
  add(d1, OTHER), add(d2, OTHER),
].join('\n'));
const cleanup = () => sql(`delete from search_history where prompt ilike '%${TAG}%';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => { log('pageerror:', e.message); failures++; });

async function search(prompt) {
  sql(`delete from search_usage where user_id = '${me}';`);  // free accounts get 3 every 5 hours
  await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
  await page.getByRole('button', { name: /^Find Match/ }).filter({ visible: true }).first().click();
  const box = page.getByTestId('find-match-box');
  await box.fill(prompt);
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 15000 });
  await box.press('Enter');
  const res = await responded;
  const json = await res.json();
  await page.waitForTimeout(1200);
  return json;
}

try {
  log('1. Trending in the member\'s city');
  if (ANON) {
    const anon = await fetch(`${API}/rest/v1/rpc/trending_searches`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    check(anon.status === 401 || anon.status === 403, `signed out, nobody can ask (${anon.status})`);
  }
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  const pills = page.getByTestId('example-prompts');
  await pills.waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}1-trending.png` });
  const heading = await pills.locator('p').first().innerText();
  const shown = await pills.getByRole('button').allInnerTexts();
  check(/^Trending in Mumbai/i.test(heading), `the heading says where: "${heading}"`);
  check(shown.indexOf(MUMBAI) === 0, `the Mumbai search the most members made comes first (${shown.slice(0, 3).join(' | ')})`);
  check(shown.filter((s) => s.toLowerCase() === MUMBAI_HINDI.toLowerCase()).length === 1,
    'the same search in other capitals is one pill');
  check(!shown.some((s) => s.includes(ONCE)), 'a search only one member made is not shown');
  check(!shown.some((s) => s.includes('98765')), 'a search with a phone number is not shown');
  check(!shown.some((s) => s.includes(NOBODY)), 'a search that found nobody is not shown');
  check(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), 'the start screen still fits the phone');
  await pills.getByRole('button', { name: MUMBAI }).click();
  check(await page.getByTestId('find-match-box').inputValue() === MUMBAI, 'a tapped pill goes into the search box');
  const outside = JSON.parse(sql(`select set_config('request.jwt.claims', json_build_object('sub', '${d1}', 'role', 'authenticated')::text, false);
    select public.trending_searches()::text;`).split('\n').pop());
  check(outside.searches.some((t) => t.prompt === OTHER && t.scope === 'city' && t.place === OTHER_CITY)
    && !outside.searches.some((t) => t.prompt === MUMBAI && t.scope === 'city'), `a member in ${OTHER_CITY} sees what ${OTHER_CITY} searches first`);

  log('2. Searches in Hinglish and Hindi, understood by the AI (the stand-in)');
  const hinglish = await search('Mumbai me rehne wali ladki dhundho');
  await page.screenshot({ path: `${OUT}2-hinglish.png` });
  check(hinglish.understoodBy === 'ai', `understood by the AI (${hinglish.understoodBy})`);
  check(hinglish.said === 'Mumbai me rehne wali ladkiyan', `the AI's line back is in Hinglish: "${hinglish.said}"`);
  check(await page.getByTestId('ai-said').innerText().then((t) => t.includes('Mumbai me rehne wali ladkiyan')), 'it shows above the results');
  check(hinglish.understood.includes('Women'), `"ladki" is a woman (${hinglish.understood.join(', ')})`);
  const hindi = await search('मुंबई में रहने वाली लड़की');
  await page.screenshot({ path: `${OUT}3-hindi.png` });
  check(hindi.said === 'मुंबई में रहने वाली लड़कियां', `in Devanagari, the line back is too: "${hindi.said}"`);
  const english = await search('a girl in Mumbai');
  check(english.said === null && await page.getByTestId('ai-said').count() === 0, 'an English search gets no line back');

  log('3. Without the AI, the rules read Hinglish');
  const rules = await search('6 foot ka ladka jo sharab nahi peeta quota');
  check(rules.understoodBy === 'rules', `understood by the rules (${rules.understoodBy})`);
  check(rules.understood.includes('Men') && rules.understood.some((c) => /5'11"–6'1"|6'0"/.test(c)) && rules.understood.includes("Doesn't drink"),
    `"6 foot ka ladka jo sharab nahi peeta": ${rules.understood.join(', ')}`);
} catch (e) {
  failures++;
  log('FAIL', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}error.png` }).catch(() => {});
} finally {
  cleanup();
  sql(`delete from search_usage where user_id = '${me}';`);
  await browser.close();
}
log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
