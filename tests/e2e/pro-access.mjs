// One rule for Shaadi24+ (migration …_phase10_pro_access), against the local stack:
//   - while "Shaadi24+ for everyone" is on, free accounts get every Shaadi24+
//     feature on the server: Super Likes, date proposals, who liked them, the
//     Shaadi24+ filters, compatibility reports, refreshing Standouts
//   - the switch can only be read by signed-in members and changed by admins
//     (has_pro and app_settings stay out of reach)
//   - turned off, each of those is refused or held back for free accounts,
//     and a subscriber still gets them; the daily limits apply either way
//   - in the website: Likes You, the filters and Super Like follow the switch,
//     and admins turn it off and on in Admin → Dashboard (in the audit log)
// The switch is put back as it was.
// Usage: ANON_KEY=… node pro-access.mjs <admin email> <email A> <email B>
//   (onboarded, password TestPass!2026, B verified; DB_CONTAINER, BASE_URL)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [ADMIN, EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!ADMIN || !EMAIL_A || !EMAIL_B || !ANON) { console.error('usage: ANON_KEY=… node pro-access.mjs <admin email> <email A> <email B>'); process.exit(2); }
const OUT = new URL('./.shots/pro-access/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

async function signIn(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass!2026' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed for ${email}`);
  return j.access_token;
}
const rest = async (jwt, method, path, body) => {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const search = async (jwt, body) => {
  const r = await fetch(`${API}/functions/v1/search`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const nameB = sql(`select name from profiles where id = '${B}';`);
const [lo, hi] = [A, B].sort();
const wasOn = sql(`select pro_for_all from app_settings;`) === 't';
const tierA = sql(`select subscription_tier from profiles where id = '${A}';`);
const tierB = sql(`select subscription_tier from profiles where id = '${B}';`);
const verifiedA = sql(`select is_verified from profiles where id = '${A}';`) === 't';
const setSwitch = (on) => sql(`update app_settings set pro_for_all = ${on};`);
const clearAB = () => sql(`delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
  delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
  delete from likes where (liker_id = '${A}' and liked_id = '${B}') or (liker_id = '${B}' and liked_id = '${A}');`);
// Both free (another test may have left one with Shaadi24+), with fresh daily counters so the limits
// don't get in the way
sql(`update profiles set subscription_tier = 'FREE', daily_like_count = 0, daily_search_count = 0 where id in ('${A}', '${B}');
     insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;`);
clearAB();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
try {
  const jwtA = await signIn(EMAIL_A);
  const jwtB = await signIn(EMAIL_B);
  const jwtAdmin = await signIn(ADMIN);
  const superLike = () => rest(jwtA, 'POST', 'likes', { liker_id: A, liked_id: B, is_super_like: true });
  const propose = (matchId) => rest(jwtA, 'POST', 'messages', {
    match_id: matchId, sender_id: A, message_type: 'date_proposal',
    content: JSON.stringify({ activity: 'Coffee', location: 'Bandra', datetime: '2026-10-10T17:00:00Z', status: 'pending' }),
  });
  const likesOfB = async () => (await rest(jwtB, 'POST', 'rpc/get_likes_received', { p_user_id: B })).body ?? [];
  const searchB = () => search(jwtB, { mode: 'search', prompt: '', filters: { religion: 'Hindu' } });

  log('1. The switch: read by members, changed by admins only');
  setSwitch(true);
  check((await rest(jwtA, 'POST', 'rpc/pro_for_all', {})).body === true, 'a member reads the switch: on');
  const hasPro = await rest(jwtA, 'POST', 'rpc/has_pro', { p_user: A });
  check(hasPro.status >= 400, `has_pro isn't callable from the app (${hasPro.status})`);
  const write = await rest(jwtA, 'PATCH', 'app_settings?id=eq.true', { pro_for_all: false });
  check(write.status >= 400 || (Array.isArray(write.body) && write.body.length === 0), 'a member can\'t change app_settings directly');
  const notAdmin = await rest(jwtA, 'POST', 'rpc/admin_set_pro_for_all', { p_on: false });
  check(notAdmin.status >= 400 && sql(`select pro_for_all from app_settings;`) === 't', 'a member can\'t use the admin switch');
  const anon = await fetch(`${API}/rest/v1/rpc/pro_for_all`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: '{}' });
  check(anon.status >= 400, `signed out, the switch isn't readable (${anon.status})`);

  log('2. Switch on: free accounts get every Shaadi24+ feature');
  let r = await superLike();
  check(r.status === 201, `a free account Super Likes (${r.status})`);
  let likes = await likesOfB();
  check(likes.length === 1 && likes[0].liker_id === A && !!likes[0].liker_name && Array.isArray(likes[0].liker_photos),
    'Likes You shows who it was, with their name and photos');
  clearAB();
  let matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  r = await propose(matchId);
  check(r.status === 201, `a free account proposes a date (${r.status})`);
  r = await searchB();
  check(r.status === 200 && r.body.candidates.length > 0 && r.body.candidates.every((c) => c.religion === 'Hindu'),
    `the religion filter applies (${r.body?.candidates?.length} people, all Hindu)`);
  check(r.body?.candidates?.some((c) => c.compatibilityReport?.length > 0), 'results come with compatibility reports');
  r = await search(jwtB, { mode: 'standouts', refresh: true });
  check(r.status === 200, `a free account refreshes Standouts (${r.status})`);

  log('3. Switch off (by an admin): held back for free accounts');
  const audited = () => Number(sql(`select count(*) from admin_audit where action = 'set_pro_for_all' and details->>'on' = 'false';`));
  const auditedBefore = audited();
  r = await rest(jwtAdmin, 'POST', 'rpc/admin_set_pro_for_all', { p_on: false });
  check(r.status < 300 && sql(`select pro_for_all from app_settings;`) === 'f', 'an admin turns it off');
  check(audited() === auditedBefore + 1, 'the audit log has it');
  check((await rest(jwtA, 'POST', 'rpc/pro_for_all', {})).body === false, 'members read: off');
  clearAB();
  r = await superLike();
  check(r.status >= 400 && /Super Likes are a Pro feature/.test(JSON.stringify(r.body)), `Super Like refused for a free account (${r.status})`);
  check(sql(`select count(*) from likes where liker_id = '${A}' and liked_id = '${B}';`) === '0', 'nothing was saved');
  r = await rest(jwtA, 'POST', 'likes', { liker_id: A, liked_id: B, is_super_like: false });
  check(r.status === 201, 'an ordinary like still goes through');
  likes = await likesOfB();
  check(likes.length === 1 && likes[0].like_id && likes[0].liker_id === null && likes[0].liker_name === null && likes[0].liker_photos === null
    && likes[0].liker_description === null, 'Likes You: the like comes without who it was (no id, name, photos or text)');
  const cards = await rest(jwtB, 'POST', 'rpc/get_profile_cards', { p_ids: [likes[0].liker_id].filter(Boolean) });
  check(!(cards.body ?? []).length, 'so there is nothing to look them up by');
  clearAB();
  matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  r = await propose(matchId);
  check(r.status >= 400 && /Date proposals are a Shaadi24\+ feature/.test(JSON.stringify(r.body)), `date proposal refused (${r.status})`);
  r = await rest(jwtA, 'POST', 'messages', { match_id: matchId, sender_id: A, content: 'Hi! How was your weekend?' });
  check(r.status === 201, 'ordinary messages still go through');
  r = await searchB();
  check(r.status === 200 && r.body.candidates.some((c) => c.religion && c.religion !== 'Hindu'),
    'the religion filter is left out for a free account');
  check(r.body?.candidates?.length > 0 && r.body.candidates.every((c) => Array.isArray(c.compatibilityReport) && c.compatibilityReport.length === 0),
    'results come without compatibility reports');
  r = await search(jwtB, { mode: 'standouts', refresh: true });
  check(r.status === 403 && r.body?.code === 'PRO_ONLY', `refreshing Standouts refused (${r.status} ${r.body?.code})`);
  r = await search(jwtB, { mode: 'standouts' });
  check(r.status === 200 && r.body.candidates.every((c) => c.compatibilityReport.length === 0), "today's Standouts still show, without reports");

  log('4. Switch off, a subscriber: everything');
  sql(`update profiles set subscription_tier = 'PRO' where id = '${B}';`);
  clearAB();
  sql(`insert into likes (liker_id, liked_id) values ('${A}', '${B}');`);
  likes = await likesOfB();
  check(likes.length === 1 && likes[0].liker_id === A && !!likes[0].liker_name, 'a subscriber sees who liked them');
  r = await searchB();
  check(r.status === 200 && r.body.candidates.every((c) => c.religion === 'Hindu') && r.body.candidates.some((c) => c.compatibilityReport.length > 0),
    'a subscriber gets the filter and the reports');
  r = await search(jwtB, { mode: 'standouts', refresh: true });
  check(r.status === 200, 'a subscriber refreshes Standouts');
  sql(`update profiles set subscription_tier = '${tierB}' where id = '${B}';`);

  log('5. In the website');
  clearAB();
  setSwitch(true);
  sql(`update profiles set is_verified = true where id = '${A}';
       insert into likes (liker_id, liked_id) values ('${B}', '${A}');`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  const signInPage = async (p, email) => {
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Sign in' }).first().click();
    await p.getByRole('button', { name: /Continue with Email/ }).click();
    await p.locator('input[type=email]').fill(email);
    await p.locator('input[type=password]').fill('TestPass!2026');
    await p.locator('form').getByRole('button', { name: /Log In/i }).click();
    await p.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  };
  const lockedFilters = async () => {
    await page.getByRole('button', { name: 'Open filters' }).click();
    await page.getByText('Mother tongue').first().waitFor({ timeout: 10000 });
    const n = await page.getByRole('button', { name: /: unlock with Shaadi24\+$/ }).count();
    await page.keyboard.press('Escape');
    await page.locator('aside button[aria-label="Close"]').first().click().catch(() => {});
    return n;
  };
  await signInPage(page, EMAIL_A);
  const unlocked = await lockedFilters();
  check(unlocked === 0, `switch on: no filter is locked (${unlocked})`);
  await page.getByRole('button', { name: /Likes You/ }).first().click();
  check(await appears(page.getByText(nameB)), `switch on: Likes You shows ${nameB}`);
  check(!(await page.getByText('Upgrade to See').first().isVisible().catch(() => false)), 'switch on: nothing to upgrade for');
  await page.screenshot({ path: `${OUT}1-likes-on.png` });

  const admin = await ctx.browser().newContext({ viewport: { width: 1280, height: 900 } });
  await admin.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const adminPage = await admin.newPage();
  adminPage.on('dialog', (d) => d.accept());
  await signInPage(adminPage, ADMIN);
  await adminPage.getByRole('button', { name: 'Admin' }).first().click();
  const sw = adminPage.getByRole('switch', { name: 'Shaadi24+ for everyone' });
  await sw.waitFor({ timeout: 10000 });
  check(await sw.getAttribute('aria-checked') === 'true', 'Admin → Dashboard: the switch shows on');
  await sw.click();
  check(await appears(adminPage.getByText('Shaadi24+ is for subscribers only now')), 'turning it off (after confirming) says so');
  check(await sw.getAttribute('aria-checked') === 'false' && sql(`select pro_for_all from app_settings;`) === 'f', 'and it is off');
  check(await appears(adminPage.getByText('turned Shaadi24+ for everyone off')), 'the recent admin actions list it');
  await adminPage.screenshot({ path: `${OUT}2-admin-off.png` });

  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  const locked = await lockedFilters();
  check(locked === 12, `switch off: the 12 Shaadi24+ filters are locked (${locked})`);
  await page.getByRole('button', { name: /Likes You/ }).first().click();
  check(await appears(page.getByText('Upgrade to See')), 'switch off: Likes You asks to upgrade');
  check(!(await page.getByText(nameB).first().isVisible().catch(() => false)), `and doesn't show ${nameB}`);
  await page.screenshot({ path: `${OUT}3-likes-off.png` });

  await sw.click();
  check(await appears(adminPage.getByText('Shaadi24+ is on for everyone')), 'an admin turns it back on');
  check(sql(`select pro_for_all from app_settings;`) === 't', 'and it is on');
  await admin.close();
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  clearAB();
  setSwitch(wasOn);
  sql(`update profiles set subscription_tier = '${tierB}' where id = '${B}';
       update profiles set subscription_tier = '${tierA}', is_verified = ${verifiedA} where id = '${A}';
       update profiles set daily_like_count = 0, daily_search_count = 0 where id in ('${A}', '${B}');`);
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
