// ============================================================================
// Fixes for what other matrimony apps' members complain about, part 5:
// payments and reliability (20261013090000_payments_and_reliability.sql)
//
//   1. A reminder before Shaadi24+ charges again: 3 days before (1 day for a
//      weekly plan), and before a free trial ends; with the price, the store
//      and where to cancel; once; never for a plan that's cancelled
//   2. Your week: the numbers (people they blocked don't count), the card on
//      Find Match, × puts it away until next week, the Monday notification
//   3. Report a problem: from Settings, with the screen, version and device;
//      the team is told, answers in Admin → Errors, the member gets a message
//      and reads the answer in My requests; only their own; 5 a day
//   4. The oldest app that still works: anyone can read it, only the owner
//      sets it, an older phone app shows "Please update", the website never
//   5. Download my data has the problem reports
//
// Usage: node review-fixes-5.mjs <admin (the owner)> <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_ADMIN, EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_ADMIN || !EMAIL_A || !EMAIL_B) { console.error('usage: node review-fixes-5.mjs <admin> <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/review-fixes-5/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const PASSWORD = 'TestPass!2026';
const VERSION = JSON.parse(fs.readFileSync(`${REPO}/package.json`, 'utf8')).version;

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
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text };
};
const rpc = (name, args, jwt) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }, jwt);

const ADMIN = sql(`select id from auth.users where email = '${EMAIL_ADMIN}';`);
const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const started = sql('select now();');
const TAG = `rf5-${Date.now()}`;
const minBuildWas = sql('select min_app_build from app_settings limit 1;');
const cleanup = () => sql(`
  delete from subscriptions where store_subscription_id like 'rf5-%';
  delete from problem_reports where user_id in ('${A}', '${B}') and created_at >= '${started}';
  delete from likes where liker_id = '${B}' and liked_id = '${A}' and created_at >= '${started}';
  delete from blocks where blocker_id = '${A}' and blocked_id = '${B}' and created_at >= '${started}';
  delete from member_messages where user_id in ('${A}', '${B}') and created_at >= '${started}';
  delete from admin_messages where kind = 'support' and created_at >= '${started}';
  delete from push_queue where created_at >= '${started}';
  delete from admin_audit where action in ('set_min_app_build', 'answer_problem', 'close_problem') and created_at >= '${started}';
  update app_settings set min_app_build = ${minBuildWas || 0};`);
const messagesTo = (who) => JSON.parse(sql(`select coalesce(json_agg(json_build_object('title', m.title, 'body', m.body, 'target', m.cta_target, 'label', m.cta_label) order by mm.created_at), '[]')
  from member_messages mm join admin_messages m on m.id = mm.message_id where mm.user_id = '${who}' and mm.created_at >= '${started}';`));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const signIn = async (email, viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return { ctx, page };
};

// Capacitor's Android bridge, so the website runs as the Android app: plugin
// calls answer at once, listeners wait
const ANDROID = `
  window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
    if (call.pluginId === 'Console' || call.type === 'js.error' || call.callbackId === '-1' || call.methodName === 'addListener') return;
    setTimeout(() => window.Capacitor.fromNative({ callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data: {} }), 10); } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'getInfo', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
  ] };`;
const androidApp = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript({ content: ANDROID });
  await ctx.addInitScript({ path: BRIDGE });
  const page = await ctx.newPage();
  await page.goto(BASE);
  return { ctx, page };
};

let subs = 0;
const subscription = (user, plan, status, fields) => sql(`
  insert into subscriptions (user_id, plan_id, mode, status, provider, store_subscription_id, auto_renew, ${Object.keys(fields).join(', ')})
  values ('${user}', '${plan.id}', 'test', '${status}', '${plan.provider}', '${TAG}-${++subs}', true, ${Object.values(fields).join(', ')})
  returning id;`).split('\n')[0];
const remind = () => Number(sql('select public.renewal_reminders();'));
const istDay = (interval) => sql(`select to_char((now() + interval '${interval}') at time zone 'Asia/Kolkata', 'FMDD Mon');`);

try {
  cleanup();
  sql(`update profiles set ${CONSENTED}, settings_push_notifs = true, last_active_at = now(), is_paused = false where id in ('${A}', '${B}', '${ADMIN}');
       update app_settings set min_app_build = 0;`);
  const jwtA = await token(EMAIL_A);
  const jwtB = await token(EMAIL_B);
  const jwtAdmin = await token(EMAIL_ADMIN);
  let r;

  log('== 1. A reminder before Shaadi24+ charges again');
  check(sql(`select string_agg(jobname || ' ' || schedule, ', ' order by jobname) from cron.job where jobname in ('renewal-reminders', 'your-week');`)
    === 'renewal-reminders 37 4 * * *, your-week 43 3 * * 1', 'daily at 10:07 and Mondays at 09:13, India time');
  check(sql(`select public.plan_price_words(99900, 'INR', 'monthly') || ' | ' || public.plan_price_words(199900, 'INR', 'quarterly')
    || ' | ' || public.plan_price_words(49900, 'INR', 'weekly');`) === '₹999 a month | ₹1,999 for 3 months | ₹499 a week', 'prices in words');
  check((await rpc('renewal_reminders', {}, jwtA)).status >= 400, 'members can\'t send reminders');

  const monthly = subscription(A, { id: 'monthly', provider: 'google_play' }, 'active', { current_end: "now() + interval '2 days 6 hours'" });
  const weekly = subscription(B, { id: 'weekly', provider: 'app_store' }, 'active', { current_end: "now() + interval '2 days'" });
  subscription(B, { id: 'monthly', provider: 'google_play' }, 'active', { current_end: "now() + interval '2 days'", cancel_at_period_end: 'true' });
  subscription(B, { id: 'halfyearly', provider: 'google_play' }, 'active', { current_end: "now() + interval '1 hour'" });
  subscription(B, { id: 'yearly', provider: 'google_play' }, 'active', { current_end: "now() + interval '10 days'" });
  check(remind() === 1, 'one reminder due: the monthly plan, 2 days ahead');
  let msgs = messagesTo(A);
  check(msgs.length === 1 && msgs[0].title === `Shaadi24+ renews on ${istDay('2 days 6 hours')}`
    && msgs[0].body === '₹999 a month, charged by Google Play. To stop it, cancel in the Play Store → Payments & subscriptions before then.',
  `A: "${msgs[0]?.title}: ${msgs[0]?.body}"`);
  check(sql(`select count(*) from push_queue where user_id = '${A}' and event_type = 'admin_message' and title like 'Shaadi24+ renews on%';`) === '1',
    'and a notification');
  check(messagesTo(B).length === 0, 'none for B: a weekly plan 2 days ahead, one that is cancelled, one too close, one too far');
  check(remind() === 0, 'run again: nothing more');

  sql(`update subscriptions set current_end = now() + interval '20 hours' where id = '${weekly}';`);
  check(remind() === 1, 'the weekly plan, a day ahead');
  msgs = messagesTo(B);
  check(msgs.length === 1 && msgs[0].body === '₹499 a week, charged by the App Store. To stop it, cancel in iPhone Settings → your name → Subscriptions before then.',
    `B: "${msgs[0]?.body}"`);

  sql(`update subscriptions set current_end = now() + interval '32 days' where id = '${monthly}';`);
  subscription(A, { id: 'quarterly', provider: 'google_play' }, 'authenticated', { trial_ends_at: "now() + interval '30 hours'" });
  check(remind() === 1, 'a free trial ending');
  msgs = messagesTo(A);
  check(msgs.length === 2 && msgs[1].title === `Your free trial ends on ${istDay('30 hours')}`
    && msgs[1].body === 'Then Shaadi24+ is ₹1,999 for 3 months, charged by Google Play. To stop it, cancel in the Play Store → Payments & subscriptions before then.',
  `A: "${msgs[1]?.title}: ${msgs[1]?.body}"`);
  sql(`update subscriptions set current_end = now() + interval '2 days' where id = '${monthly}';`);
  check(remind() === 1, 'the next renewal of the same plan gets its own reminder');
  sql(`delete from subscriptions where store_subscription_id like 'rf5-%';`);

  log('== 2. Your week');
  check(sql(`select public.week_words('{"likes":3,"matches":1,"messages":0,"standouts":0,"new_near":12}');`)
    === '3 likes, 1 new match and 12 new members near you', 'in words');
  check(sql(`select coalesce(public.week_words('{"likes":0,"matches":0,"messages":0,"standouts":0,"new_near":0}'), 'none');`) === 'none',
    'a week with nothing says nothing');
  r = await rpc('my_week', {});
  check(r.status >= 400 || r.json === null, `signed out: nothing (${r.status})`);
  sql(`delete from likes where liker_id = '${B}' and liked_id = '${A}';
       insert into likes (liker_id, liked_id) values ('${B}', '${A}');`);
  const week = (await rpc('my_week', {}, jwtA)).json;
  const likes = Number(sql(`select count(*) from likes l where l.liked_id = '${A}' and l.created_at > now() - interval '7 days'
    and not exists (select 1 from blocks b where (b.blocker_id = '${A}' and b.blocked_id = l.liker_id) or (b.blocked_id = '${A}' and b.blocker_id = l.liker_id));`));
  check(week && week.likes === likes && likes >= 1 && ['matches', 'messages', 'standouts', 'new_near'].every((k) => Number.isInteger(week[k])),
    `A's week: ${JSON.stringify(week)}`);
  sql(`insert into blocks (blocker_id, blocked_id, reason) values ('${A}', '${B}', 'other');`);
  check((await rpc('my_week', {}, jwtA)).json?.likes === likes - 1, "a like from someone A blocked doesn't count");
  sql(`delete from blocks where blocker_id = '${A}' and blocked_id = '${B}';`);

  const a = await signIn(EMAIL_A);
  const card = a.page.getByTestId('your-week');
  check(await appears(card, 10000), 'the card is on Find Match');
  check(await card.getByTestId('your-week-part').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()) === `${likes} ${likes === 1 ? 'like' : 'likes'}`,
    'likes first, with the number');
  await a.page.screenshot({ path: `${OUT}1-your-week.png` });
  await card.locator('[data-key="likes"] button').click();
  check(await appears(a.page.getByRole('heading', { name: /Likes/ }), 8000), 'tapping likes opens Likes');
  await a.page.getByRole('button', { name: /^Find Match/ }).first().click();
  await card.getByRole('button', { name: 'Hide until next week' }).click();
  check(!(await appears(card, 1500)), '× puts it away');
  await a.page.reload();
  await a.page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  check(!(await appears(card, 2500)), 'still away after reopening');
  const seen = await a.page.evaluate((id) => localStorage.getItem(`shaadi24_week_seen:${id}`), A);
  check(/^\d{4}-W\d{2}$/.test(seen ?? ''), `until next week (${seen})`);

  const sent = Number(sql('select public.send_your_week();'));
  const push = sql(`select title || ' | ' || body || ' | ' || (data->>'deep_link') from push_queue where user_id = '${A}' and event_type = 'your_week';`);
  check(sent >= 1 && push.startsWith(`Your week on Shaadi24 | ${likes} like`) && push.endsWith('. | /search'),
    `Monday's notification: "${push}"`);
  sql(`update profiles set settings_push_notifs = false where id = '${A}'; delete from push_queue where event_type = 'your_week';`);
  sql('select public.send_your_week();');
  check(sql(`select count(*) from push_queue where user_id = '${A}' and event_type = 'your_week';`) === '0', 'none with notifications off');
  sql(`update profiles set settings_push_notifs = true where id = '${A}'; delete from push_queue where event_type = 'your_week';`);

  log('== 3. Report a problem');
  await a.page.getByRole('button', { name: /^Settings/ }).first().click();
  await a.page.getByTestId('report-problem').click();
  const modal = a.page.getByTestId('report-problem-modal');
  check(await appears(modal), 'Settings → Support → Report a problem');
  await modal.getByTestId('report-problem-details').fill('Broken');
  await modal.getByTestId('report-problem-send').click();
  check(await appears(modal.getByText(/at least 10 characters/)), 'a few words are asked for');
  const words = `The photo upload spins forever on My Profile (${TAG})`;
  await modal.getByTestId('report-problem-details').fill(words);
  await a.page.screenshot({ path: `${OUT}2-report-a-problem.png` });
  await modal.getByTestId('report-problem-send').click();
  await modal.waitFor({ state: 'detached', timeout: 10000 });
  check(await appears(a.page.getByText(/We'll look into it and answer in My requests/)), 'thanked');
  const row = JSON.parse(sql(`select json_build_object('id', id, 'screen', screen, 'version', app_version, 'platform', platform, 'device', device, 'status', status)
    from problem_reports where user_id = '${A}' and details = '${words}';`) || 'null');
  check(row?.status === 'open' && row.version === VERSION && row.platform === 'web' && !!row.screen && /Mozilla|Chrome/.test(row.device ?? ''),
    `kept with the screen (${row?.screen}), version ${row?.version}, ${row?.platform}, the browser`);
  check(sql(`select count(*) from push_queue where user_id = '${ADMIN}' and event_type = 'admin_problem';`) === '1', 'the team is told');
  const mine = a.page.getByTestId('my-request').filter({ hasText: 'Problem you reported' }).first();
  check(await appears(mine) && await mine.getByText('Being looked into').isVisible(), 'My requests: "Being looked into"');

  r = await call('/rest/v1/problem_reports?select=id,details', { method: 'GET' }, jwtB);
  check(r.status === 200 && !r.json.some((x) => x.id === row?.id), "B can't see A's problem");
  r = await call('/rest/v1/problem_reports?select=answered_by', { method: 'GET' }, jwtA);
  check(r.status >= 400, "nor can A see who on the team answered");
  r = await call('/rest/v1/problem_reports', { method: 'POST', body: JSON.stringify({ user_id: A, details: 'Written directly to the table' }) }, jwtA);
  check(r.status >= 400, `members can't write to the table directly (${r.status})`);
  check((await rpc('admin_list_problems', {}, jwtA)).status === 403, 'nor list everyone\'s problems');
  check((await rpc('admin_answer_problem', { p_id: row?.id, p_answer: 'Me' }, jwtA)).status === 403, 'nor answer them');
  for (let i = 0; i < 4; i++) await rpc('report_problem', { p_details: `Another problem number ${i} (${TAG})` }, jwtA);
  r = await rpc('report_problem', { p_details: `One problem too many (${TAG})` }, jwtA);
  check(r.status >= 400 && /several problems today/.test(r.text), 'five a day');
  sql(`delete from problem_reports where user_id = '${A}' and details like 'Another problem number %';`);

  const admin = await signIn(EMAIL_ADMIN, { width: 1400, height: 1000 });
  await admin.page.getByText('Admin', { exact: true }).first().click();
  await admin.page.getByTestId('admin-sidebar').getByRole('button', { name: 'Errors', exact: true }).click();
  const problem = admin.page.getByTestId('admin-problem').filter({ hasText: TAG });
  check(await appears(problem, 15000), 'Admin → Errors lists it');
  check(await problem.getByText(`Website ${VERSION}`).isVisible().catch(() => false) || await problem.innerText().then((t) => t.includes(VERSION)),
    'with where and which version');
  await problem.getByTestId('admin-problem-answer').fill('Fixed: photos upload again. Please try once more.');
  await admin.page.screenshot({ path: `${OUT}3-admin-problem.png` });
  await problem.getByTestId('admin-problem-send').click();
  await admin.page.waitForTimeout(2000);
  check(sql(`select status from problem_reports where id = '${row?.id}';`) === 'answered', 'answered');
  msgs = messagesTo(A).filter((m) => m.title === "We've answered your problem report");
  check(msgs.length === 1 && msgs[0].target === 'requests' && msgs[0].label === 'Read it', 'A gets a message whose button opens My requests');
  check(sql(`select count(*) from admin_audit where action = 'answer_problem' and created_at >= '${started}';`) === '1', 'in the audit log');
  const mr = (await rpc('my_requests', {}, jwtA)).json;
  check(mr?.problems?.[0]?.answer === 'Fixed: photos upload again. Please try once more.' && !('answered_by' in (mr?.problems?.[0] ?? {})),
    'my_requests: the answer, without who wrote it');
  await a.page.reload();
  await a.page.getByRole('button', { name: /^Settings/ }).first().click();
  const answered = a.page.getByTestId('my-request').filter({ hasText: 'Problem you reported' }).first();
  check(await appears(answered.getByText('Answered'), 10000)
    && await answered.getByTestId('my-request-answer').innerText().then((t) => t.includes('Our answer:') && t.includes('photos upload again')),
  'A reads it in My requests');
  await a.page.screenshot({ path: `${OUT}4-answer-in-my-requests.png` });

  const other = (await rpc('report_problem', { p_details: `Something else entirely (${TAG})`, p_platform: 'android', p_app_version: '1.0.0' }, jwtB)).json;
  check((await rpc('admin_answer_problem', { p_id: other, p_answer: '' }, jwtAdmin)).status < 300
    && sql(`select status from problem_reports where id = '${other}';`) === 'closed' && messagesTo(B).every((m) => !/problem report/.test(m.title)),
  'closed without an answer: no message');

  log('== 4. The oldest app that still works');
  check((await rpc('app_config', {})).json?.min_app_build === 0, 'anyone can read it (0)');
  r = await rpc('admin_set_min_app_build', { p_build: 10203 }, jwtA);
  check(r.status === 403, `members can't set it (${r.status})`);
  const minCard = admin.page.getByTestId('admin-min-build');
  check(await appears(minCard), 'Admin → Errors: "Oldest app that still works"');
  await minCard.getByRole('spinbutton').fill('999999');
  await minCard.getByRole('button', { name: 'Save' }).click();
  check(await appears(admin.page.getByText('Apps older than build 999999 now ask to be updated.')), 'the owner raises it');
  check((await rpc('app_config', {})).json?.min_app_build === 999999, 'app_config says so');
  check(sql(`select details->>'min_app_build' from admin_audit where action = 'set_min_app_build' order by created_at desc limit 1;`) === '999999',
    'in the audit log');
  check((await rpc('admin_set_min_app_build', { p_build: -1 }, jwtAdmin)).status >= 400, 'a negative build is refused');

  const phone = await androidApp();
  const gate = phone.page.getByTestId('update-required');
  check(await appears(gate, 15000), 'an older Android app: "Please update Shaadi24"');
  check(await gate.getByRole('link', { name: 'Update now' }).getAttribute('href').then((h) => h.includes('play.google.com') && h.includes('com.shaadi24.app')),
    'Update now goes to Google Play');
  await phone.page.screenshot({ path: `${OUT}5-update-required.png` });
  await phone.ctx.close();
  await a.page.reload();
  await a.page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  check(!(await appears(a.page.getByTestId('update-required'), 2500)), 'the website never asks');

  await minCard.getByRole('spinbutton').fill('0');
  await minCard.getByRole('button', { name: 'Save' }).click();
  check(await appears(admin.page.getByText('Every version works again.')), 'back to 0');
  const phone2 = await androidApp();
  await phone2.page.waitForTimeout(4000);
  check(!(await phone2.page.getByTestId('update-required').isVisible().catch(() => false)), 'and the app opens as usual');
  await phone2.ctx.close();

  log('== 5. Download my data');
  const data = (await rpc('export_my_data', {}, jwtA)).json;
  check(data?.export_metadata?.format_version === '1.6', `format ${data?.export_metadata?.format_version}`);
  check(data?.problem_reports?.some((p) => p.details === words && p.answer?.startsWith('Fixed')) && data.problem_reports.every((p) => !('answered_by' in p)),
    'with the problem reports and our answers, not who wrote them');

  const appBuild = fs.readFileSync(`${REPO}/android/app/build.gradle`, 'utf8');
  check(/apply plugin: 'com\.google\.firebase\.crashlytics'/.test(appBuild), 'the Android app sends crash reports (Crashlytics)');
  await a.ctx.close();
  await admin.ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  try { cleanup(); } catch (e) { log('cleanup:', e.message.split('\n')[0]); }
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
