// Admin → a member's Timeline, Growth, Search insights and Success stories, end to end:
//   1. Customers → a member → Timeline: their searches, likes, matches and the rest, newest first,
//      by day; "Safety" shows only reports, blocks and verification
//   2. Growth: members and who's active, how far new members get (8 steps), sign-ups and active
//      members a day (hover and the numbers as a table), members by city / religion / …; 7 days
//   3. Search insights: a search that found no one shows, with its words; the filters used
//   4. Success stories: publishing needs both partners' consent written down; published, it's on
//      the home page and /stories; taken down, it's gone; the contact form has "Our success story"
//   5. Members can't read any of it; visitors read published stories only
// Usage: node admin-insights.mjs <admin email> <member email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const SITE = process.env.SITE_URL || 'http://localhost:3002';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node admin-insights.mjs <admin email> <member email>'); process.exit(2); }
const OUT = new URL('./.shots/admin-insights/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);

const member = sql(`select id from profiles where email = '${MEMBER}';`);
const memberName = sql(`select name from profiles where id = '${member}';`);
const NOBODY = 'test a jain doctor in nagpur who plays the sitar';
const NAMES = 'Testcase Priya & Arjun';
const cleanup = () => sql(`delete from search_history where prompt = '${NOBODY}';
  delete from success_stories where names like 'Testcase %';`);
cleanup();
sql(`insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;
  update profiles set ${CONSENTED} where email in ('${ADMIN}', '${MEMBER}');
  insert into search_history (user_id, prompt, filters, result_ids, pool_size)
  values ('${member}', '${NOBODY}', '{"isVerified": true, "religion": ["Jain"]}', '{}', 0);`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newPage = async (width = 1400) => {
  const ctx = await browser.newContext({ viewport: { width, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
};
const signIn = async (page, email) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')), null, { timeout: 20000 });
};

const page = await newPage();
try {
  await signIn(page, ADMIN);
  await page.getByText('Admin', { exact: true }).first().click();
  const sidebar = page.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  const open = (name) => sidebar.getByRole('button', { name: new RegExp(`^${name}`) }).click();

  // ---- 1. Timeline ---------------------------------------------------------------------------
  log('1. A member\'s timeline');
  await open('Customers');
  await page.getByRole('searchbox').or(page.getByPlaceholder(/Search/)).first().fill(MEMBER);
  const row = page.getByTestId('customers-table').locator('tbody tr', { hasText: memberName }).first();
  await row.waitFor({ timeout: 15000 });
  await row.getByRole('button').first().click();
  const panel = page.getByTestId('member-panel');
  await panel.waitFor({ timeout: 10000 });
  await panel.getByRole('tab', { name: 'Timeline' }).click();
  const timeline = panel.getByTestId('member-timeline');
  await timeline.getByTestId('timeline-event').first().waitFor({ timeout: 15000 });
  check(await timeline.getByText(`${NOBODY} · 0 found`).isVisible(), 'the timeline shows their latest search, with how many it found');
  check(await timeline.getByText('Joined Shaadi24').count() === 1, 'and when they joined');
  const kinds = await timeline.getByTestId('timeline-event').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.kind))]);
  check(kinds.length >= 3, `several kinds of events (${kinds.join(', ')})`);
  await timeline.getByRole('button', { name: 'Safety' }).click();
  const safetyKinds = await timeline.getByTestId('timeline-event').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.kind))]);
  check(safetyKinds.every((k) => k === 'safety' || k === 'verification'), `"Safety" shows only safety and verification (${safetyKinds.join(', ') || 'none'})`);
  await page.screenshot({ path: `${OUT}1-timeline.png` });
  await panel.getByRole('tab', { name: 'Details' }).click();
  check(await panel.getByText('Likes sent / received').isVisible(), 'Details is back');
  await panel.getByRole('button', { name: 'Close' }).click();

  // ---- 2. Growth ---------------------------------------------------------------------------------
  log('2. Growth');
  await open('Growth');
  const growth = page.getByTestId('admin-growth');
  await growth.waitFor({ timeout: 15000 });
  const members = Number(sql(`select count(*) from profiles where onboarding_complete and not coalesce(is_banned, false);`));
  check((await growth.getByTestId('growth-tiles').innerText()).includes(members.toLocaleString('en-IN')), `the member count matches the database (${members})`);
  check(await growth.getByTestId('growth-funnel').locator('tbody tr').count() === 8, 'how far new members get: 8 steps');
  const joined30 = Number(sql(`select count(*) from profiles where (account_created at time zone 'Asia/Kolkata')::date >= (now() at time zone 'Asia/Kolkata')::date - 29;`));
  check((await growth.getByTestId('growth-funnel').locator('tbody tr').first().innerText()).includes(joined30.toLocaleString('en-IN')), `joined in 30 days matches (${joined30})`);
  const chart = growth.getByTestId('chart-signups');
  const box = await chart.locator('svg').boundingBox();
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2);
  check(await appears(chart.getByTestId('daily-tooltip'), 5000), 'hovering a day shows its number');
  await chart.getByRole('button', { name: 'Show the numbers' }).click();
  check(await chart.locator('tbody tr').count() === 30, 'the numbers: 30 days');
  await growth.getByRole('button', { name: '7 days' }).click();
  await page.waitForTimeout(800);
  check(await chart.locator('tbody tr').count() === 7, '7 days: 7 rows');
  await growth.getByRole('group', { name: 'Members by' }).getByRole('button', { name: 'Religion' }).click();
  check(await growth.getByTestId('growth-breakdown').locator('tbody tr').count() > 0, 'members by religion');
  await page.screenshot({ path: `${OUT}2-growth.png`, fullPage: true });

  // ---- 3. Search insights ----------------------------------------------------------------------
  log('3. Search insights');
  await open('Search insights');
  const search = page.getByTestId('admin-search');
  await search.waitFor({ timeout: 15000 });
  check(await search.getByTestId('none-found').getByText(`“${NOBODY}”`).isVisible(), 'a search that found no one is listed');
  const words = await search.getByTestId('top-words').locator('li span:first-child').allInnerTexts();
  check(words.length > 0 && !words.some((w) => ['someone', 'partner', 'who'].includes(w)), `the words searched most, without "someone" and the like (${words.slice(0, 5).join(', ')})`);
  check(await search.getByTestId('filters-used').getByText('Verified only').isVisible(), 'and the filters used');
  check(await search.getByTestId('chart-searches').isVisible(), 'searches a day');
  await page.screenshot({ path: `${OUT}3-search.png`, fullPage: true });

  // ---- 4. Success stories ------------------------------------------------------------------------
  log('4. Success stories');
  await open('Success stories');
  const stories = page.getByTestId('admin-stories');
  await stories.waitFor({ timeout: 15000 });
  await stories.getByRole('button', { name: 'New story' }).click();
  const editor = page.getByTestId('story-editor');
  await editor.getByLabel('The couple').fill(NAMES);
  await editor.getByLabel('Where').fill('Pune');
  await editor.getByLabel('Their story').fill('We both wrote that we wanted someone kind who loves books. Shaadi24 put us at the top of each other\'s results.');
  await editor.getByLabel('Show it on the website').check();
  await editor.getByRole('button', { name: 'Save' }).click();
  check(await appears(page.getByText('Say how both of them agreed to be shown, before publishing'), 5000), 'publishing without both partners\' consent is refused');
  await editor.getByLabel('How both of them agreed to be shown').fill('Both agreed by email on 3 October 2026');
  await editor.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Story published').waitFor({ timeout: 10000 });
  check(await stories.getByTestId('story-card').filter({ hasText: NAMES }).getByText('Published').isVisible(), 'listed as Published');
  check(sql(`select count(*) from admin_audit where action = 'publish_story' and details->>'names' = '${NAMES.replace(/'/g, "''")}';`) !== '0', 'publishing is logged');

  const site = await newPage();
  await site.goto(SITE);
  const home = site.getByTestId('home-stories');
  check(await appears(home), 'the home page shows "Couples who met on Shaadi24"');
  check(await home.getByText(NAMES).isVisible(), '…with the story');
  await site.goto(`${SITE}/stories`);
  await site.getByTestId('stories-page').waitFor({ timeout: 15000 });
  check(await appears(site.getByTestId('story').filter({ hasText: NAMES })), '/stories lists it');
  check((await site.title()) === 'Success stories | Shaadi24', '/stories has its own title');
  await site.screenshot({ path: `${OUT}4-stories.png`, fullPage: true });
  await site.goto(`${SITE}/support`);
  await site.locator('#contact-topic').waitFor({ timeout: 15000 });
  check(await site.locator('#contact-topic option', { hasText: 'Our success story' }).count() === 1, 'the contact form has "Our success story"');

  await stories.getByTestId('story-card').filter({ hasText: NAMES }).getByRole('button', { name: /^Edit/ }).click();
  await editor.getByLabel('Show it on the website').uncheck();
  await editor.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Story saved').waitFor({ timeout: 10000 });
  await site.goto(SITE);
  await site.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
  await site.waitForTimeout(1500);
  check(!(await site.getByTestId('home-stories').isVisible()), 'taken down, it\'s gone from the home page');

  // ---- 5. Who can see what ----------------------------------------------------------------------
  log('5. Members and visitors');
  const memberPage = await newPage();
  await signIn(memberPage, MEMBER);
  const token = await memberPage.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith('-auth-token')))).access_token);
  const as = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (const [fn, args] of [['admin_member_timeline', { p_user: member }], ['admin_growth', {}], ['admin_search_insights', {}]]) {
    const res = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: as, body: JSON.stringify(args) });
    check(!res.ok, `a member can't call ${fn} (${res.status})`);
  }
  const write = await fetch(`${API}/rest/v1/success_stories`, { method: 'POST', headers: as, body: JSON.stringify({ names: 'Testcase X & Y', story: 'x'.repeat(30) }) });
  check(!write.ok, `a member can't add a story (${write.status})`);
  sql(`insert into success_stories (names, story, published, consent_note) values ('Testcase Shown', '${'A published story. '.repeat(3)}', true, 'Both agreed');`);
  const visible = await fetch(`${API}/rest/v1/success_stories?select=names&names=like.Testcase*`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }).then((r) => r.json());
  check(Array.isArray(visible) && visible.length === 1 && visible[0].names === 'Testcase Shown', 'visitors read published stories only');

  await stories.getByTestId('story-card').filter({ hasText: NAMES }).getByRole('button', { name: /^Delete/ }).click();
  await page.getByText('Story deleted').waitFor({ timeout: 10000 });
  check(sql(`select count(*) from success_stories where names = '${NAMES.replace(/'/g, "''")}';`) === '0', 'Delete removes it');
} catch (e) {
  failures++;
  console.error(e);
  await page.screenshot({ path: `${OUT}error.png`, fullPage: true }).catch(() => {});
} finally {
  cleanup();
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
