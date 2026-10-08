// Search limits, like Claude's (supabase/migrations/…_search_limits.sql, lib/searchLimits.ts), end to end,
// with the free plan set to 2 every 5 hours, 3 a day (plus the profile bonus) and 20 a week:
//   1. Every 5 hours: Find Match says "1 search left until …" after one search and "Out of searches until …"
//      after two; a third opens "You've used your searches for now" with when, and the server refuses it
//      (429, by the 5 hours)
//   2. 5 hours later (moved back in the database) searching works again
//   3. The day: used up, "Out of searches until midnight" and "You've used today's searches"; the server says
//      by the day
//   4. The week: used up, out until Friday 6 pm India time and "You've used this week's searches"; when the
//      week starts (Friday 6 pm India time, checked either side) searching works again
//   5. Settings → Shaadi24+: each limit with how many are used, a bar and when it resets (axe-core)
//   6. Shaadi24+: its own numbers, and at a limit no offer to buy what they have
//   7. Admin → Search insights → Search limits: the numbers and the members a limit stopped; an owner changes
//      them (an empty box is no limit; Shaadi24+ below free is refused), in the audit log; a Content admin
//      sees them and can't change them, nor can the database be asked to (axe-core)
//   8. Members and visitors can't read the counts or the settings, nor use a search up for someone
// Usage: node search-limits.mjs <owner email> <member email> <another account>   (password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const [OWNER, MEMBER, STAFF] = process.argv.slice(2);
if (!OWNER || !MEMBER || !STAFF) { console.error('usage: node search-limits.mjs <owner email> <member email> <another account>'); process.exit(2); }
const OUT = new URL('./.shots/search-limits/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (loc, ms = 15000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const accessible = async (page, name) => {
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  const { violations } = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  }));
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(!bad.length, `${name}: accessible${bad.length ? ` (${bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`).join('; ')})` : ''}`);
};

const me = sql(`select id from profiles where email = '${MEMBER}';`);
const staffId = sql(`select id from profiles where email = '${STAFF}';`);
const before = {
  limits: sql(`select string_agg(format('(%L,%s,%s,%s)', plan, coalesce(per_window::text, 'null'), coalesce(per_day::text, 'null'),
                 coalesce(per_week::text, 'null')), ',') from search_limits;`),
  hours: sql(`select search_window_hours from app_settings limit 1;`),
  tier: sql(`select subscription_tier from profiles where id = '${me}';`),
  staffRole: sql(`select role from admin_emails where lower(email) = lower('${STAFF}');`),
};
const cleanup = () => sql(`
  update search_limits l set per_window = v.w, per_day = v.d, per_week = v.k
    from (values ${before.limits}) as v(plan, w, d, k) where l.plan = v.plan;
  update app_settings set search_window_hours = ${before.hours} where id;
  update profiles set subscription_tier = '${before.tier}' where id = '${me}';
  delete from search_usage where user_id in ('${me}', '${staffId}');
  ${before.staffRole ? `update admin_emails set role = '${before.staffRole}' where lower(email) = lower('${STAFF}');`
    : `delete from admin_emails where lower(email) = lower('${STAFF}');`}`);

// A free member who can search (verified, so never locked out), nothing counted yet
sql(`update search_limits set per_window = 2, per_day = 3, per_week = 20 where plan = 'free';
  update search_limits set per_window = 15, per_day = 50, per_week = 200 where plan = 'plus';
  update app_settings set search_window_hours = 5 where id;
  insert into admin_emails (email) values ('${OWNER}') on conflict do nothing;
  update admin_emails set role = 'owner' where lower(email) = lower('${OWNER}');
  update profiles set subscription_tier = 'FREE', is_verified = true, is_paused = false, account_created = now(), ${CONSENTED}
   where id = '${me}';
  update profiles set ${CONSENTED} where email in ('${OWNER}', '${STAFF}');
  delete from search_usage where user_id = '${me}';`);
const bonus = Number(sql(`select search_bonus from profiles where id = '${me}';`));
const DAY = 3 + bonus;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// India time, as members in India see it
const newPage = async (viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
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
const token = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith('-auth-token')))).access_token);
// As the signed-in person (their access token), or a visitor (no token)
const call = (page, path, body, signedIn = true) => page.evaluate(async ([url, anon, body, signedIn]) => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
  const auth = signedIn && key ? JSON.parse(localStorage.getItem(key)).access_token : anon;
  const r = await fetch(url, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, text, json };
}, [`${API}${path}`, ANON, body, signedIn]);
const line = (page) => page.getByTestId('search-allowance');
const lineSays = async (page, re, ms = 15000) => {
  const ok = await line(page).filter({ hasText: re }).first().waitFor({ timeout: ms }).then(() => true, () => false);
  return { ok, said: await line(page).innerText().catch(() => '(none)') };
};
const search = async (page, prompt = 'someone kind who loves books') => {
  const box = page.getByTestId('find-match-box');
  await box.fill(prompt);
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 }).catch(() => null);
  await box.press('Enter');
  const res = await responded;
  await page.waitForTimeout(800);
  return res?.status() ?? null;
};
const closeModal = (page) => page.getByTestId('upgrade-modal').getByRole('button', { name: 'Close' }).first().click();
const reload = async (page) => {
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
};
const FRIDAY_6PM = /^Out of searches until (tomorrow at |Friday at )?6:00 pm$/;

try {
  // ---- 1. Every 5 hours ----------------------------------------------------------------------
  log(`1. Every 5 hours (free: 2 every 5 hours, ${DAY} a day, 20 a week)`);
  const page = await newPage();
  await signIn(page, MEMBER);
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  let l = await lineSays(page, /^2 searches every 5 hours$/);
  check(l.ok, `before searching: "${l.said}"`);
  check(await search(page) === 200, 'the first search goes ahead');
  l = await lineSays(page, /^1 search left until \d{1,2}:\d{2} [ap]m$/);
  check(l.ok, `then: "${l.said}"`);
  const resetsAt = sql(`select to_char((window_started_at + interval '5 hours') at time zone 'Asia/Kolkata', 'FMHH12:MI am')
                          from search_usage where user_id = '${me}';`).toLowerCase();
  check(l.said.endsWith(resetsAt), `5 hours after the first search (${resetsAt})`);
  check(await search(page) === 200, 'the second goes ahead');
  l = await lineSays(page, /^Out of searches until /);
  check(l.ok && l.said.endsWith(resetsAt), `then: "${l.said}"`);
  await page.getByTestId('find-match-box').fill('someone who reads');
  await page.getByTestId('find-match-box').press('Enter');
  const modal = page.getByTestId('upgrade-modal');
  check(await appears(modal.getByText("You've used your searches for now")), 'a third: "You\'ve used your searches for now"');
  check(await appears(modal.getByText(`You can search again at ${resetsAt}.`)), `"You can search again at ${resetsAt}."`);
  check(await appears(modal.getByText('Shaadi24+ gives you more searches.')), 'and Shaadi24+ gives more');
  await page.screenshot({ path: `${OUT}1-window.png` });
  await closeModal(page);
  const refused = await call(page, '/functions/v1/search', { mode: 'search', prompt: 'someone kind' });
  check(refused.status === 429 && refused.json?.code === 'LIMIT_REACHED' && refused.json?.allowance?.limited_by === 'window',
    `the server refuses a third (${refused.status}, by ${refused.json?.allowance?.limited_by}): ${refused.json?.error}`);
  check(sql(`select window_count || '/' || day_count || '/' || week_count || '/' || limited_by from search_usage where user_id = '${me}';`) === '2/2/2/window',
    'counted 2 in each, and what stopped the third');

  // ---- 2. 5 hours later --------------------------------------------------------------------------
  log('2. 5 hours later');
  sql(`update search_usage set window_started_at = now() - interval '5 hours 1 minute' where user_id = '${me}';`);
  await reload(page);
  l = await lineSays(page, /searches? (left|every)/);
  check(l.ok, `searches again: "${l.said}"`);
  check(await search(page) === 200, 'and a search goes ahead');
  check(sql(`select window_count || '/' || day_count from search_usage where user_id = '${me}';`) === '1/3', 'a new 5 hours, the day goes on');

  // ---- 3. The day --------------------------------------------------------------------------------
  log('3. The day');
  sql(`update search_usage set day_count = ${DAY}, window_count = 0, window_started_at = null where user_id = '${me}';`);
  await reload(page);
  l = await lineSays(page, /^Out of searches until midnight$/);
  check(l.ok, `used up: "${l.said}"`);
  await page.getByTestId('find-match-box').fill('someone who reads');
  await page.getByTestId('find-match-box').press('Enter');
  check(await appears(modal.getByText("You've used today's searches")), '"You\'ve used today\'s searches"');
  check(await appears(modal.getByText('You can search again at midnight.')), '"You can search again at midnight."');
  await closeModal(page);
  const byDay = await call(page, '/functions/v1/search', { mode: 'search', prompt: 'someone kind' });
  check(byDay.status === 429 && byDay.json?.allowance?.limited_by === 'day' && /today's searches.*midnight \(India time\)/.test(byDay.json?.error),
    `the server: "${byDay.json?.error}"`);

  // ---- 4. The week -------------------------------------------------------------------------------
  log('4. The week');
  check(sql(`select search_week_start('2026-10-09 12:29:00+00') = '2026-10-02 12:30:00+00'
               and search_week_start('2026-10-09 12:30:00+00') = '2026-10-09 12:30:00+00'
               and search_week_start('2026-10-12 06:00:00+00') = '2026-10-09 12:30:00+00';`) === 't',
    'the week starts on Friday at 6 pm India time (12:30 UTC)');
  sql(`update search_usage set day = (now() at time zone 'Asia/Kolkata')::date - 1, week_count = 20 where user_id = '${me}';`);
  await reload(page);
  l = await lineSays(page, FRIDAY_6PM);
  check(l.ok, `used up: "${l.said}"`);
  await page.getByTestId('find-match-box').fill('someone who reads');
  await page.getByTestId('find-match-box').press('Enter');
  check(await appears(modal.getByText("You've used this week's searches")), '"You\'ve used this week\'s searches"');
  check(await appears(modal.getByText(/You can search again (tomorrow at |on Friday at |at )6:00 pm\./)), 'again on Friday at 6 pm');
  await page.screenshot({ path: `${OUT}4-week.png` });
  await closeModal(page);
  const byWeek = await call(page, '/functions/v1/search', { mode: 'search', prompt: 'someone kind' });
  check(byWeek.status === 429 && byWeek.json?.allowance?.limited_by === 'week', `the server: "${byWeek.json?.error}"`);
  // The week before: a new week has begun
  sql(`update search_usage set week_started_at = search_week_start(now()) - interval '7 days' where user_id = '${me}';`);
  await reload(page);
  l = await lineSays(page, /searches? (left|every)/);
  check(l.ok, `a new week: "${l.said}"`);
  check(await search(page) === 200, 'and a search goes ahead');

  // ---- 5. Settings --------------------------------------------------------------------------------
  log('5. Settings');
  await page.getByText('Settings', { exact: true }).first().click();
  const usage = page.getByTestId('search-usage');
  check(await appears(usage), 'Settings shows the AI searches');
  check((await usage.getByTestId('usage-window').innerText()).includes('1 of 2 used'), `every 5 hours: ${(await usage.getByTestId('usage-window').innerText()).replace(/\s+/g, ' ')}`);
  check(/Resets at \d{1,2}:\d{2} [ap]m/.test(await usage.getByTestId('usage-window').innerText()), 'with when it resets');
  const dayRow = (await usage.getByTestId('usage-day').innerText()).replace(/\s+/g, ' ');
  check(dayRow.includes(`1 of ${DAY} used`) && dayRow.includes('Resets at midnight'), `today: ${dayRow}`);
  const weekRow = (await usage.getByTestId('usage-week').innerText()).replace(/\s+/g, ' ');
  check(weekRow.includes('1 of 20 used') && /Resets (tomorrow at |Friday at |today at )6:00 pm/.test(weekRow), `this week: ${weekRow}`);
  check(await usage.getByRole('progressbar').count() === 3, 'a bar for each');
  check(await page.getByTestId('subscription-settings').getByText(/Free plan: 15 likes a day, and the AI searches below/).isVisible(), 'the plan says so');
  await page.screenshot({ path: `${OUT}5-settings.png`, fullPage: true });
  await accessible(page, 'Settings');
  // On a phone too
  const phone = await newPage({ width: 390, height: 844 });
  await signIn(phone, MEMBER);
  await phone.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await phone.getByRole('button', { name: 'Menu', exact: true }).first().click();
  await phone.getByRole('button', { name: /^Settings/ }).filter({ visible: true }).first().click();
  const phoneUsage = phone.getByTestId('search-usage');
  check(await appears(phoneUsage), 'on a phone too');
  const fits = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(fits, 'and fits the screen');
  await phone.screenshot({ path: `${OUT}5-settings-phone.png`, fullPage: true });
  await accessible(phone, 'Settings on a phone');
  await phone.context().close();

  // ---- 6. Shaadi24+ ---------------------------------------------------------------------------------
  log('6. Shaadi24+');
  sql(`update profiles set subscription_tier = 'PRO' where id = '${me}';`);
  await page.getByText('Find Match', { exact: true }).first().click();
  await reload(page);
  l = await lineSays(page, /^14 searches left until /);
  check(l.ok, `its own numbers: "${l.said}"`);
  check(await page.getByTestId('earn-searches').count() === 0, 'no offer to earn more');
  sql(`update search_usage set window_count = 15 where user_id = '${me}';`);
  await reload(page);
  await page.getByTestId('find-match-box').fill('someone who reads');
  await page.getByTestId('find-match-box').press('Enter');
  check(await appears(modal.getByText("You've used your searches for now")), 'at a limit: "You\'ve used your searches for now"');
  check(await modal.getByText('Shaadi24+ gives you more searches.').count() === 0, 'with no offer to buy Shaadi24+');
  await closeModal(page);

  // ---- 7. Admin ---------------------------------------------------------------------------------
  log('7. Admin → Search insights → Search limits');
  const admin = await newPage({ width: 1440, height: 900 });
  await signIn(admin, OWNER);
  await admin.getByText('Admin', { exact: true }).first().click({ timeout: 20000 });
  const sidebar = admin.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  await sidebar.getByRole('button', { name: /^Search insights/ }).click();
  const card = admin.getByTestId('search-limits');
  check(await appears(card), 'the Search limits card');
  check(await card.getByTestId('limit-free-per_window').inputValue() === '2' && await card.getByTestId('limit-plus-per_week').inputValue() === '200',
    'the numbers, in boxes for an owner');
  const stopped = await card.getByTestId('limits-stopped').innerText();
  check(/a limit stopped \d+ member/.test(stopped) && !stopped.includes('No one'), `who a limit stopped: "${stopped}"`);
  await accessible(admin, 'Search insights');
  // Shaadi24+ below free: refused
  await card.getByTestId('limit-plus-per_day').fill('2');
  check(await appears(card.getByTestId('limits-error').getByText('Shaadi24+ should get at least as many searches as free accounts.')), 'Shaadi24+ below free: refused');
  check(await card.getByTestId('save-limits').isDisabled(), 'and Save is off');
  await card.getByTestId('limit-plus-per_day').fill('60');
  await card.getByTestId('limit-free-per_window').fill('4');
  await card.getByTestId('limit-free-per_week').fill('');   // no limit, for both
  await card.getByTestId('limit-plus-per_week').fill('');
  await card.getByTestId('limit-hours').fill('4');
  check(await appears(card.getByText('Every 4 hours')), 'the row follows the hours');
  await card.getByTestId('save-limits').click();
  check(await appears(admin.getByText('Search limits saved. They apply to the next search.')), 'saved');
  check(sql(`select string_agg(plan || ':' || coalesce(per_window::text, '-') || '/' || coalesce(per_day::text, '-') || '/' || coalesce(per_week::text, '-'), ' ' order by plan)
               from search_limits;`) === 'free:4/3/- plus:15/60/-', 'in the database (empty: no limit)');
  check(sql(`select search_window_hours from app_settings limit 1;`) === '4', 'and the hours');
  check(sql(`select count(*) from admin_audit where action = 'set_search_limits' and created_at > now() - interval '5 minutes';`) !== '0', 'in the audit log');
  await admin.screenshot({ path: `${OUT}7-admin.png`, fullPage: true });
  // A member sees the new numbers
  sql(`update profiles set subscription_tier = 'FREE' where id = '${me}';
       update search_usage set window_count = 0, window_started_at = null, day_count = 0, week_count = 0 where user_id = '${me}';`);
  await reload(page);
  l = await lineSays(page, /^\d searches left today$|^4 searches every 4 hours$/);
  check(l.ok, `a member sees them at once: "${l.said}"`);

  // A Content admin: sees them, can't change them
  sql(`insert into admin_emails (email) values ('${STAFF}') on conflict do nothing;
       update admin_emails set role = 'content' where lower(email) = lower('${STAFF}');`);
  const staff = await newPage({ width: 1440, height: 900 });
  await signIn(staff, STAFF);
  await staff.getByText('Admin', { exact: true }).first().click({ timeout: 20000 });
  await staff.getByTestId('admin-sidebar').getByRole('button', { name: /^Search insights/ }).click();
  const staffCard = staff.getByTestId('search-limits');
  check(await appears(staffCard.getByText('Only owners can change these.')), 'a Content admin: "Only owners can change these."');
  check(await staffCard.locator('input').count() === 0 && await staffCard.getByTestId('limit-free-per_window').innerText() === '4', 'the numbers, without boxes');
  check(await staffCard.getByTestId('limit-free-per_week').innerText() === 'No limit', '"No limit" for an empty one');
  const notOwner = await call(staff, '/rest/v1/rpc/admin_set_search_limits', { p_settings: { plans: { free: { per_window: 100 } } } });
  check(notOwner.status >= 400 && notOwner.text.includes('Forbidden'), `the database refuses them (${notOwner.status})`);
  await accessible(staff, 'Search insights, read-only');
  await staff.context().close();
  await admin.context().close();

  // ---- 8. Members and visitors --------------------------------------------------------------------------
  log('8. Members and visitors');
  const asMember = await call(page, '/rest/v1/rpc/admin_search_limits', {});
  check(asMember.status >= 400 && asMember.text.includes('Forbidden'), `a member can't read the settings (${asMember.status})`);
  const setAsMember = await call(page, '/rest/v1/rpc/admin_set_search_limits', { p_settings: { window_hours: 24 } });
  check(setAsMember.status >= 400, `nor change them (${setAsMember.status})`);
  const useUp = await call(page, '/rest/v1/rpc/consume_search', { p_user_id: staffId });
  check(useUp.status >= 400, `nor use up someone's search (${useUp.status})`);
  const theirs = await call(page, '/rest/v1/rpc/search_allowance', { p_user: staffId, p_consume: false });
  check(theirs.status >= 400, `nor read someone's counts (${theirs.status})`);
  const rows = await page.evaluate(async ([api, anon, tok]) => {
    const r = await fetch(`${api}/rest/v1/search_usage?select=*`, { headers: { apikey: anon, Authorization: `Bearer ${tok}` } });
    return { status: r.status, text: await r.text() };
  }, [API, ANON, await token(page)]);
  check(rows.status >= 400 || rows.text === '[]', `nor the table (${rows.status})`);
  const own = await call(page, '/rest/v1/rpc/my_search_allowance', {});
  check(own.status === 200 && own.json?.plan === 'free', 'their own, yes');
  const visitor = await call(page, '/rest/v1/rpc/my_search_allowance', {}, false);
  check(visitor.status >= 400 || visitor.text === 'null', `a visitor: nothing (${visitor.status} ${visitor.text.slice(0, 60)})`);
  const visitorAdmin = await call(page, '/rest/v1/rpc/admin_search_limits', {}, false);
  check(visitorAdmin.status >= 400, `nor the settings (${visitorAdmin.status})`);
  await page.context().close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  cleanup();
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
