// ============================================================================
// Fixes for what other matrimony apps' members complain about, part 3:
// preferences and search (20261011090000_preferences_and_search.sql)
//
//   1. Near misses: a search that finds fewer than 5 shows people who miss
//      one thing by a little, saying what ("Height 6'2"")
//   2. Saved searches: "Save this search" keeps it with a daily alert; the
//      alert (the cron job, with its secret) finds new members who fit, sends
//      one notification, and Search History shows them without a search
//   3. Partner preferences: set in My Profile; search starts from them (a
//      filter the member sets replaces its preference); Standouts put people
//      who fit first; their own alert; members can't write what the alerts
//      found
//   4. "Family from (state)" and "Profile managed by" filters
//   5. Up to 10 saved searches
//
// Usage: node review-fixes-3.mjs <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B) { console.error('usage: node review-fixes-3.mjs <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/review-fixes-3/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const PASSWORD = 'TestPass!2026';

const token = async (email) => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
};
const call = async (path, init, jwt) => {
  const r = await fetch(`${API}${path}`, {
    ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const fn = (body, jwt, headers = {}) => call('/functions/v1/search', { method: 'POST', body: JSON.stringify(body), headers }, jwt);

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
// Members A can find, not liked, matched or blocked either way, active, with
// a name nobody else has
const pool = sql(`select p.id || '|' || p.name || '|' || p.age from profiles p, profiles me
  where me.id = '${A}' and p.onboarding_complete and p.name <> '' and p.id not in ('${A}', '${B}')
    and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false) and not coalesce(p.settings_incognito, false)
    and coalesce(p.last_active_at, p.account_created) > now() - interval '50 days'
    and public.gender_preference_fits(me.interested_in, p.gender) and public.gender_preference_fits(p.interested_in, me.gender)
    and not exists (select 1 from likes l where (l.liker_id = '${A}' and l.liked_id = p.id) or (l.liker_id = p.id and l.liked_id = '${A}'))
    and not exists (select 1 from matches m where (m.user_a_id = p.id and m.user_b_id = '${A}') or (m.user_b_id = p.id and m.user_a_id = '${A}'))
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = '${A}') or (b.blocked_id = p.id and b.blocker_id = '${A}'))
    and not exists (select 1 from passed_profiles x where x.user_id = '${A}' and x.passed_id = p.id)
    and coalesce(p.hidden_fields, '{}') = '{}'
    and (select count(*) from profiles q where q.name = p.name) = 1
  order by p.account_created limit 5;`).split('\n').map((r) => { const [id, name, age] = r.split('|'); return { id, name, age: Number(age) }; });
if (pool.length < 5) { console.error('needs five more members A can find'); process.exit(2); }
const [P1, P2, P3, P4, P5] = pool;
const ids = pool.map((p) => `'${p.id}'`).join(',');
// What the test changes, to put back
const before = sql(`select id || '|' || coalesce(religion, '') || '|' || coalesce(height, '') || '|' || coalesce(family_state, '')
  || '|' || coalesce(profile_created_for, '') from profiles where id in (${ids});`).split('\n').map((r) => r.split('|'));
const q = (v) => (v ? `'${v.replace(/'/g, "''")}'` : 'null');
const restore = before.map(([id, religion, height, familyState, createdFor]) =>
  `update profiles set religion = ${q(religion)}, height = ${q(height)}, family_state = ${q(familyState)}, profile_created_for = ${q(createdFor)} where id = '${id}';`).join('\n');
const cleanup = () => sql(`${restore}
  delete from saved_searches where user_id = '${A}';
  delete from partner_preferences where user_id = '${A}';
  delete from standouts where user_id = '${A}';
  delete from push_queue where user_id = '${A}' and event_type = 'search_alert';
  delete from search_usage where user_id = '${A}';
  delete from search_prompt_cache;`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const newContext = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  return ctx;
};
const signIn = async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL_A);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return page;
};
const cronSecret = sql(`select decrypted_secret from vault.decrypted_secrets where name = 'send_push_cron_secret';`);
const runAlerts = () => fn({ mode: 'alerts' }, null, { 'x-cron-secret': cronSecret });

try {
  cleanup();
  const jwt = await token(EMAIL_A);
  const search = async (prompt, filters = {}) => {
    // A free account has a few searches a window: these checks don't count
    sql(`delete from search_usage where user_id = '${A}';`);
    const r = await fn({ mode: 'search', prompt, filters, limit: 50 }, jwt);
    if (r.status !== 200) log('  search:', r.status, JSON.stringify(r.json).slice(0, 200));
    return { ids: (r.json?.candidates ?? []).map((c) => c.id), near: r.json?.nearMisses ?? [], json: r.json };
  };

  log('== 1. Near misses');
  // Nobody is taller than 6'2" here; P2 is 6'2", and P3 6'4" (in the alert below, later)
  sql(`update profiles set height = '6'' 2" (188 cm)' where id = '${P2.id}';
       update profiles set height = '5'' 6" (168 cm)' where id = '${P3.id}';`);
  const tall = await search(`taller than 6'2"`);
  check(tall.ids.length === 0, 'nobody is taller than 6\'2"');
  const p2 = tall.near.find((c) => c.id === P2.id);
  check(p2?.missed === `Height 6'2"`, `${P2.name} is a near miss: ${p2?.missed}`);
  check(!tall.near.some((c) => c.id === P3.id), `${P3.name} (5'6") isn't close`);
  const many = await search('');
  check(many.ids.length >= 5 && many.near.length === 0, 'no near misses when 5 or more fit');

  const app = await newContext();
  const pa = await signIn(app);
  sql(`delete from search_usage where user_id = '${A}';`);
  await pa.getByTestId('find-match-box').fill(`taller than 6'2"`);
  await pa.getByRole('button', { name: 'Search', exact: true }).click();
  const nearSection = pa.getByTestId('near-misses');
  check(await appears(pa.getByText('Nobody fits everything yet'), 20000), '"Nobody fits everything yet"');
  const nearCard = nearSection.getByTestId('match-card').filter({ has: pa.locator('h3', { hasText: P2.name }) });
  check(await appears(nearCard.getByTestId('near-miss-note')), `${P2.name}'s card is under "Close to what you asked"`);
  check((await nearCard.getByTestId('near-miss-note').innerText()).includes(`Height 6'2"`), 'saying what misses');
  await pa.screenshot({ path: `${OUT}1-near-misses.png`, fullPage: true });

  log('== 2. Saved searches and their alerts');
  await pa.getByTestId('save-search').first().click();
  const saveModal = pa.getByTestId('save-search-modal');
  check(await appears(saveModal), 'Save this search');
  check(await saveModal.getByRole('textbox').inputValue() === `taller than 6'2"`, 'named after the search');
  check(await saveModal.getByTestId('save-search-alerts').isChecked(), 'the alert is on');
  await pa.screenshot({ path: `${OUT}2-save-search.png` });
  await saveModal.getByRole('button', { name: 'Save', exact: true }).click();
  check(await appears(pa.getByText("Saved. It's in Search History.")), 'saved');
  const saved = sql(`select id || '|' || name || '|' || alerts || '|' || (filters ? 'usePreferences') from saved_searches where user_id = '${A}';`).split('|');
  check(saved[1] === `taller than 6'2"` && saved[2] === 'true', 'in the database, alert on');
  // A new member who fits: P3 grows to 6'4" and "joins" after the search was last looked at
  sql(`update profiles set height = '6'' 4" (193 cm)' where id = '${P3.id}';
       update saved_searches set checked_at = (select listed_at from profiles where id = '${P3.id}') - interval '1 second' where id = '${saved[0]}';`);
  const unauth = await fn({ mode: 'alerts' }, null, { 'x-cron-secret': 'wrong' });
  check(unauth.status === 401, 'the alerts need the cron secret');
  const run = await runAlerts();
  check(run.status === 200 && run.json?.notified >= 1, `the daily alerts run (${JSON.stringify(run.json)})`);
  const found = sql(`select array_to_string(new_ids, ',') || '|' || (plan is not null) from saved_searches where id = '${saved[0]}';`).split('|');
  check(found[0] === P3.id, `it found ${P3.name}, and only them`);
  check(found[1] === 'true', 'Gemini\'s reading of the search is kept for next time');
  const push = sql(`select title || '|' || body || '|' || (data->>'saved_search') from push_queue where user_id = '${A}' and event_type = 'search_alert' order by created_at desc limit 1;`);
  check(push === `New members for you|1 new member fits “taller than 6'2"”.|${saved[0]}`, `one notification: ${push}`);
  const again = await runAlerts();
  check(again.json?.notified === 0 && sql(`select count(*) from push_queue where user_id = '${A}' and event_type = 'search_alert';`) === '1',
    'running again finds nobody new: no second notification');
  // A member can't write what the alerts found
  const forged = await call(`/rest/v1/saved_searches?id=eq.${saved[0]}`, { method: 'PATCH', body: JSON.stringify({ new_ids: [P1.id, P2.id] }) }, jwt);
  check(forged.status >= 400 && sql(`select array_to_string(new_ids, ',') from saved_searches where id = '${saved[0]}';`) === P3.id,
    `members can't change who the alert found (${forged.status})`);
  // Search History: "1 new", without a search
  await pa.getByText('Search History', { exact: true }).first().click();
  const row = pa.getByTestId('saved-search').filter({ hasText: `taller than 6'2"` });
  check(await appears(row.getByTestId('saved-search-new')), 'Search History: the saved search says "1 new"');
  await pa.screenshot({ path: `${OUT}2-history.png` });
  const usedBefore = sql(`select count(*) from search_usage where user_id = '${A}';`);
  await row.getByTestId('saved-search-new').click();
  const newMatches = pa.getByTestId('new-matches');
  check(await appears(newMatches.locator('h3', { hasText: P3.name }), 15000), `the new member, ${P3.name}`);
  check(sql(`select count(*) from search_usage where user_id = '${A}';`) === usedBefore, 'looking doesn\'t use a search');
  await pa.screenshot({ path: `${OUT}2-new-matches.png` });
  await newMatches.getByRole('button', { name: 'Close' }).click();
  check(await row.getByTestId('saved-search-new').waitFor({ state: 'detached', timeout: 8000 }).then(() => true, () => false),
    'once looked at, "new" goes');
  check(sql(`select seen_at >= alerted_at from saved_searches where id = '${saved[0]}';`) === 't', 'seen');
  // Someone else's saved search can't be opened
  const jwtB = await token(EMAIL_B);
  const other = await fn({ mode: 'alert_matches', id: saved[0] }, jwtB);
  check(other.status === 404, 'another member can\'t see this search\'s new members');
  // The bell turns the alert off
  await row.getByTestId('saved-search-alerts').click();
  check(await appears(pa.getByText(`No more alerts for “taller than 6'2"”`)), 'the bell turns the alert off');
  check(sql(`select alerts from saved_searches where id = '${saved[0]}';`) === 'f', 'off in the database');

  log('== 3. Partner preferences');
  await pa.getByText('My Profile', { exact: true }).first().click();
  const card = pa.getByTestId('partner-prefs');
  check(await appears(card), 'My Profile: Partner preferences');
  await card.getByTestId('edit-partner-prefs').click();
  const modal = pa.getByTestId('partner-prefs-modal');
  await modal.getByLabel('Youngest').selectOption('24');
  await modal.getByLabel('Oldest').selectOption('34');
  await modal.getByRole('button', { name: 'Parsi', exact: true }).click();
  await modal.getByRole('button', { name: 'Never Married', exact: true }).click();
  await pa.screenshot({ path: `${OUT}3-preferences.png` });
  await modal.getByRole('button', { name: 'Save preferences' }).click();
  check(await appears(card.getByText('Age 24–34')), 'saved: the card says "Age 24–34"');
  check(sql(`select age_min || '|' || age_max || '|' || array_to_string(religions, ',') || '|' || array_to_string(marital_statuses, ',') || '|' || alerts
    from partner_preferences where user_id = '${A}';`) === '24|34|Parsi|Never Married|true', 'in the database');
  const forgedPrefs = await call(`/rest/v1/partner_preferences?user_id=eq.${A}`, { method: 'PATCH', body: JSON.stringify({ new_ids: [P1.id] }) }, jwt);
  check(forgedPrefs.status >= 400, `members can't write the preferences' alert results (${forgedPrefs.status})`);

  // Search starts from them: only Parsi (P1 and P4 here); someone who hasn't said is left out
  sql(`update partner_preferences set age_min = null, age_max = null, marital_statuses = '{}' where user_id = '${A}';
       update profiles set religion = 'Parsi' where id in ('${P1.id}', '${P4.id}');
       update profiles set religion = 'Hindu' where id = '${P5.id}';`);
  const withPrefs = await search('', { usePreferences: true });
  check(withPrefs.json?.usedPreferences === true && withPrefs.ids.length > 0 && withPrefs.ids.every((id) => [P1.id, P4.id].includes(id))
    && withPrefs.ids.includes(P1.id), `with the preferences: ${withPrefs.ids.length} found, all Parsi`);
  // P5, the only one whose family is from Sikkim, is Hindu
  sql(`update profiles set family_state = 'Sikkim' where id = '${P5.id}';`);
  check(!(await search('', { usePreferences: true, familyState: 'Sikkim' })).ids.includes(P5.id), 'with them, not someone Hindu');
  check((await search('', { familyState: 'Sikkim' })).ids.includes(P5.id), 'without them: they are found');
  const asked = await search('', { usePreferences: true, religion: 'Hindu', familyState: 'Sikkim' });
  check(asked.ids.includes(P5.id), 'a religion the member picks in the filters replaces the preference');
  // The filter panel offers them
  await pa.getByText('Find Match', { exact: true }).first().click();
  await pa.getByRole('button', { name: 'Open filters' }).click();
  const prefsRow = pa.getByTestId('filter-preferences');
  check(await appears(prefsRow.getByText('Use my partner preferences')), 'the filters: "Use my partner preferences"');
  check(await appears(prefsRow.getByText('Parsi')), 'with what they are');
  await pa.screenshot({ path: `${OUT}3-filters.png` });
  await pa.getByRole('button', { name: 'Apply filters' }).click();

  // Standouts: who fits comes first (here, P1's age)
  sql(`update partner_preferences set religions = '{}', age_min = ${P1.age}, age_max = ${P1.age} where user_id = '${A}';
       delete from standouts where user_id = '${A}';`);
  const fitting = (await search('', { ageRange: [P1.age, P1.age] })).ids;
  const picks = ((await fn({ mode: 'standouts' }, jwt)).json?.candidates ?? []);
  // (an age that isn't shown isn't held against anyone)
  const fits = picks.map((c) => c.age === P1.age || !c.age);
  const firstMiss = fits.indexOf(false);
  check(picks.length > 0 && (firstMiss === -1 || fits.slice(firstMiss).every((f) => !f)), 'Standouts: everyone who fits comes before anyone who doesn\'t');
  check(fits.filter(Boolean).length >= Math.min(picks.length, fitting.length), `as many who fit as there are (${fits.filter(Boolean).length})`);
  check(picks.every((c) => !('prefMisses' in c)), 'how many preferences someone misses isn\'t sent');

  // Their own alert
  sql(`update partner_preferences set age_min = null, age_max = null, religions = '{Parsi}',
         checked_at = (select least(p1.listed_at, p4.listed_at) from profiles p1, profiles p4 where p1.id = '${P1.id}' and p4.id = '${P4.id}') - interval '1 second'
       where user_id = '${A}';
       delete from push_queue where user_id = '${A}' and event_type = 'search_alert';`);
  await runAlerts();
  const prefNew = sql(`select array_to_string(new_ids, ',') from partner_preferences where user_id = '${A}';`).split(',');
  check(prefNew.includes(P1.id) && prefNew.includes(P4.id) && !prefNew.includes(P5.id), 'the preferences\' alert: the Parsi members, not the Hindu one');
  check(sql(`select body from push_queue where user_id = '${A}' and event_type = 'search_alert';`).endsWith('fit your partner preferences.'),
    'its notification');
  await pa.getByText('Search History', { exact: true }).first().click();
  check(await appears(pa.getByTestId('prefs-new')), 'Search History: new members for the partner preferences');
  await app.close();

  log('== 4. Family from (state), and who manages the profile');
  sql(`delete from partner_preferences where user_id = '${A}';
       update profiles set family_state = 'Goa', profile_created_for = 'Daughter' where id = '${P1.id}';
       update profiles set family_state = 'Goa', profile_created_for = 'Myself' where id = '${P2.id}';
       update profiles set family_state = 'Kerala' where id = '${P3.id}';`);
  const goa = await search('', { familyState: 'Goa' });
  check(goa.ids.includes(P1.id) && goa.ids.includes(P2.id) && !goa.ids.includes(P3.id), 'Family from Goa');
  const parents = await search('', { familyState: 'Goa', managedBy: 'Parents' });
  check(parents.ids.includes(P1.id) && !parents.ids.includes(P2.id), 'Managed by parents');
  const self = await search('', { familyState: 'Goa', managedBy: 'Self' });
  check(self.ids.includes(P2.id) && !self.ids.includes(P1.id), 'Managed by themselves');
  check(goa.json?.candidates?.find((c) => c.id === P1.id)?.familyState === 'Goa', 'the profile shows the family\'s home state');

  log('== 5. Up to 10 saved searches');
  sql(`delete from saved_searches where user_id = '${A}';`);
  const add = (n) => call('/rest/v1/saved_searches', { method: 'POST', body: JSON.stringify({ user_id: A, name: `Search ${n}` }) }, jwt);
  for (let n = 1; n <= 10; n++) await add(n);
  const eleventh = await add(11);
  check(sql(`select count(*) from saved_searches where user_id = '${A}';`) === '10' && /10 saved searches/.test(JSON.stringify(eleventh.json)),
    'the 11th is refused, saying why');
  const sneaky = await call('/rest/v1/saved_searches', { method: 'POST', body: JSON.stringify({ user_id: B, name: 'For B' }) }, jwt);
  check(sneaky.status >= 400, 'nobody saves searches for someone else');
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  cleanup();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
