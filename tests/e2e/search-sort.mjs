// Find Match's results: the Sort button, the match level, and the filter
// chips (components/SearchView.tsx, components/ResultsSortMenu.tsx,
// lib/searchResults.ts), on a phone-sized screen:
//  1. The Sort button sits above the first card; best match first by default
//  2. Lowest match first, online first, youngest and oldest first
//  3. Match level: the top, middle or lower third of the results, with their
//     scores; "k of N"; back to any match
//  4. "Online Now" on its own shows an "Online now" chip with Clear all (it
//     used to show nothing: the chips counted every filter but Online), and
//     narrows the results on screen at once; its × brings them back
//  5. A search with Online on brings only people online; taking it off asks
//     to search again, and Search again brings everyone
//  6. A quick filter nobody in the results has: "Show all" brings them back
// Usage: node search-sort.mjs <email>   (an onboarded account, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
if (!EMAIL) { console.error('usage: node search-sort.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/search-sort/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const sorted = (list, cmp) => list.every((x, i) => i === 0 || cmp(list[i - 1], x) <= 0);

const me = sql(`select id from auth.users where email = '${EMAIL}';`);
const freshSearches = () => sql(`update profiles set daily_search_count = 0 where id = '${me}'; delete from search_usage where user_id = '${me}';`);
sql(`update profiles set subscription_tier = 'FREE', is_paused = false, account_created = now(), settings_theme = 'system', ${CONSENTED} where id = '${me}';
     delete from likes where liker_id = '${me}';`);
freshSearches();
let madeOnline = [];
let lastActive = [];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror:', e.message));

// The cards on screen, in order: score, online, age
const cards = () => page.getByTestId('results-grid').locator(':scope > div').evaluateAll((els) => els.map((el) => {
  const t = el.innerText;
  return {
    score: Number(/(\d+)% Match/.exec(t)?.[1] ?? 0),
    online: /^Online$/m.test(t),
    age: Number(/^[^\n,]+,\s*(\d+)\s*$/m.exec(t)?.[1] ?? 0),
  };
}));
const count = () => page.getByTestId('results-count').innerText();
const chips = () => page.getByTestId('filter-chips');
async function search() {
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 });
  await page.getByTestId('find-match-box').press('Enter');
  const json = await (await responded).json();
  await page.getByTestId('results-grid').waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return json;
}
async function pick(name) {
  if (!(await page.getByTestId('sort-menu').isVisible())) await page.getByTestId('sort-button').click();
  await page.getByTestId('sort-menu').getByRole('radio', { name }).click();
  await page.waitForTimeout(250);
}
const done = () => page.getByTestId('sort-menu').getByRole('button', { name: 'Done' }).click();

try {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });

  // A first search finds who comes up; a few of them are then made online
  await page.getByTestId('find-match-box').fill('Most compatible');
  const first = await search();
  const ids = (first.candidates ?? []).map((c) => c.id);
  check(ids.length >= 8, `a search brings results (${ids.length})`);
  madeOnline = ids.filter((_, i) => i % 3 === 1).slice(0, 5);
  lastActive = madeOnline.map((id) => [id, sql(`select coalesce(last_active_at::text, '') || '|' || coalesce(settings_show_online::text, '') from profiles where id = '${id}';`)]);
  sql(`update profiles set last_active_at = now(), settings_show_online = true where id in (${madeOnline.map((id) => `'${id}'`).join(',')});`);
  freshSearches();
  await search();

  log('1. The Sort button, above the first card');
  const all = await cards();
  const n = all.length;
  const sortBox = await page.getByTestId('sort-button').boundingBox();
  const cardBox = await page.getByTestId('results-grid').locator(':scope > div').first().boundingBox();
  check(sortBox && cardBox && sortBox.y + sortBox.height <= cardBox.y, 'the Sort button is just above the first card');
  check(sortBox && sortBox.x + sortBox.width <= 390 - 16, 'and fits on the phone');
  check((await page.getByTestId('sort-button').innerText()).includes('Best match'), 'it says Best match');
  check(sorted(all, (a, b) => b.score - a.score), `best match first by default (${all.slice(0, 5).map((c) => c.score).join(', ')}…)`);
  check(all.filter((c) => c.online).length >= 1, `some are online (${all.filter((c) => c.online).length})`);
  await page.screenshot({ path: `${OUT}1-results.png` });

  log('2. The orders');
  await page.getByTestId('sort-button').click();
  check(await page.getByTestId('sort-menu').isVisible(), 'the menu opens');
  check(await page.getByTestId('sort-button').getAttribute('aria-expanded') === 'true', 'aria-expanded is true');
  await page.waitForTimeout(500);  // its fade-in
  await page.screenshot({ path: `${OUT}2-menu.png` });
  await pick('Lowest match first');
  let now = await cards();
  check(sorted(now, (a, b) => a.score - b.score), `lowest match first (${now.slice(0, 5).map((c) => c.score).join(', ')}…)`);
  check(now.length === n, 'still all of them');
  await pick('Online now first');
  now = await cards();
  const firstOffline = now.findIndex((c) => !c.online);
  check(firstOffline === -1 || now.slice(firstOffline).every((c) => !c.online), `online first (${now.filter((c) => c.online).length} online at the top)`);
  await pick('Youngest first');
  now = await cards();
  check(sorted(now, (a, b) => a.age - b.age), `youngest first (${now.slice(0, 5).map((c) => c.age).join(', ')}…)`);
  await pick('Oldest first');
  now = await cards();
  check(sorted(now, (a, b) => b.age - a.age), `oldest first (${now.slice(0, 5).map((c) => c.age).join(', ')}…)`);
  check((await page.getByTestId('sort-button').innerText()).includes('Oldest'), 'the button says Oldest');
  await page.keyboard.press('Escape');
  check(!(await page.getByTestId('sort-menu').isVisible()), 'Escape closes the menu');

  log('3. Match level: the top, middle and lower third of the results');
  // About a third each, keeping equal scores together (a cut in a run of
  // equal scores goes to the nearer end of it)
  const byScoreDesc = [...all].sort((a, b) => b.score - a.score);
  const sc = (i) => byScoreDesc[i].score;
  const cut = (target, from) => {
    if (target <= from) return from;
    if (target >= n || sc(target - 1) !== sc(target)) return target;
    let [start, end] = [target, target];
    while (start > from && sc(start - 1) === sc(target)) start--;
    while (end < n && sc(end) === sc(target)) end++;
    return start > from && target - start <= end - target ? start : end;
  };
  const cut1 = cut(Math.ceil(n / 3), 0);
  const cut2 = cut(Math.max(cut1, Math.ceil((2 * n) / 3)), cut1);
  const third = cut1;
  const expect = { 'Top matches': byScoreDesc.slice(0, cut1), 'Middle matches': byScoreDesc.slice(cut1, cut2), 'Lower matches': byScoreDesc.slice(cut2) };
  await page.getByTestId('sort-button').click();
  await pick('Best match first');
  for (const [label, group] of Object.entries(expect)) {
    const radio = page.getByTestId('sort-menu').getByRole('radio', { name: new RegExp(`^${label}`) });
    const text = await radio.innerText();
    const [hi, lo] = [group[0]?.score, group[group.length - 1]?.score];
    const range = hi === lo ? `${hi}%` : `${lo}–${hi}%`;
    if (group.length === 0) { check(await radio.isDisabled(), `${label}: none, so it can't be picked`); continue; }
    check(text.includes(range) && new RegExp(`\\b${group.length}\\b`).test(text), `${label}: "${text.replace(/\s+/g, ' ')}" (${range}, ${group.length})`);
  }
  await pick(/^Top matches/);
  await done();
  now = await cards();
  check(now.length === third && now.every((c) => c.score >= expect['Top matches'][third - 1].score), `top matches: the best ${third} (${now.map((c) => c.score).slice(0, 4).join(', ')}…)`);
  check(Math.min(...now.map((c) => c.score)) > Math.max(...expect['Middle matches'].map((c) => c.score), 0), 'no score is in two levels');
  check(await count() === `${third} of ${n}`, `the count says "${await count()}"`);
  check((await page.getByTestId('sort-button').innerText()).includes('Top matches'), 'the button shows the level');
  const [row, sortAt] = [await page.getByTestId('results-count').boundingBox(), await page.getByTestId('sort-button').boundingBox()];
  check(row.height <= 26 && sortAt.x + sortAt.width <= 390 - 16, 'the count and the button each fit on one line, inside the screen');
  await page.screenshot({ path: `${OUT}3-level.png` });
  await pick(/^Lower matches/);
  now = await cards();
  const lower = expect['Lower matches'];
  check(now.length === lower.length && now.every((c) => c.score <= lower[0].score), `lower matches: the lowest ${lower.length} (${now.map((c) => c.score).slice(0, 4).join(', ')}…)`);
  if (expect['Middle matches'].length) {
    await pick(/^Middle matches/);
    check((await cards()).length === expect['Middle matches'].length, 'middle matches: the middle third');
  }
  await pick(/^Any match/);
  await done();
  check((await cards()).length === n, 'any match: all of them again');

  log('4. "Online Now" on its own');
  const online = all.filter((c) => c.online).length;
  await page.getByRole('button', { name: 'Online Now', exact: true }).click();
  await page.waitForTimeout(300);
  check(await chips().isVisible(), 'the chips show');
  check(await chips().getByRole('button', { name: /Online now/ }).isVisible(), 'with "Online now"');
  check(await chips().getByRole('button', { name: 'Clear all' }).isVisible(), 'and Clear all');
  check(await page.getByRole('button', { name: 'Online Now', exact: true }).count() === 0, 'the pill moves from the row above into the chips');
  check((await page.getByRole('button', { name: 'Open filters' }).innerText()).trim() === '1', 'the filter button counts it');
  now = await cards();
  check(now.length === online && now.every((c) => c.online), `only the ${online} online show, at once`);
  check(await count() === `${online} of ${n}`, `the count says "${await count()}"`);
  check(!(await page.getByTestId('search-again').isVisible()), 'no new search needed to narrow');
  await page.screenshot({ path: `${OUT}4-online-chip.png` });
  await chips().getByRole('button', { name: /Online now/ }).click();
  await page.waitForTimeout(300);
  check(!(await chips().isVisible()), 'its × takes it off');
  check((await cards()).length === n, 'and everyone is back');
  check(await page.getByRole('button', { name: 'Online Now', exact: true }).isVisible(), 'the pill is back in the row');

  log('5. A search with Online on');
  await page.getByRole('button', { name: 'Online Now', exact: true }).click();
  freshSearches();
  const onlySearch = await search();
  now = await cards();
  check(now.length > 0 && now.every((c) => c.online), `the server brings only people online (${now.length})`);
  check((onlySearch.candidates ?? []).length === now.length, 'all of them show');
  await chips().getByRole('button', { name: /Online now/ }).click();
  await page.waitForTimeout(300);
  check(await page.getByTestId('search-again').isVisible(), 'taking it off asks to search again');
  await page.screenshot({ path: `${OUT}5-search-again.png` });
  freshSearches();
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 });
  await page.getByTestId('search-again').getByRole('button', { name: 'Search again' }).click();
  await responded;
  await page.waitForTimeout(1200);
  check((await cards()).length === n, `Search again brings everyone (${(await cards()).length})`);
  check(!(await page.getByTestId('search-again').isVisible()), 'and the note goes');

  log('6. A quick filter nobody in the results has');
  await page.getByRole('button', { name: 'Has LinkedIn' }).click();
  await page.waitForTimeout(300);
  check(await page.getByTestId('none-shown').isVisible(), 'none of them has LinkedIn: it says so');
  await page.getByTestId('none-shown').getByRole('button', { name: `Show all ${n}` }).click();
  await page.waitForTimeout(300);
  check((await cards()).length === n && !(await chips().isVisible()), '"Show all" brings them back');

  log('7. Dark mode');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('sort-button').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}6-menu-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` }).catch(() => {});
} finally {
  for (const [id, was] of lastActive) {
    const [at, show] = was.split('|');
    sql(`update profiles set last_active_at = ${at ? `'${at}'` : 'null'}, settings_show_online = ${show || 'true'} where id = '${id}';`);
  }
  freshSearches();
  await browser.close();
}
log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
