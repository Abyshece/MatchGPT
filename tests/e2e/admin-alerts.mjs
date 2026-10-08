// Admins hear about new reports and verification requests (migration
// …_phase10_admin_alerts), against the local stack:
//   - a report queues one notification for each admin, in general words (the
//     reason, never names), with its own title when someone may be under age;
//     nothing for whoever reported, for other members, or for an admin with
//     notifications off
//   - a verification request queues one; updating it while it waits doesn't
//   - send-push takes the alert to an admin's Android phone on its "admin"
//     channel (the FCM stand-in in store-standin.cjs)
//   - in the Android app (bridge stand-in): an admin's phone gets the "Admin
//     alerts" channel, a member's doesn't; tapping an alert opens Admin →
//     Reports
//   - on the website: a clicked notification (passed on by the service
//     worker) opens Admin → Verifications; one that opened the site (?push=)
//     too, and the address is tidied
// The local send-push cron job is paused while it runs (and put back).
// Usage: ANON_KEY=… node admin-alerts.mjs <admin email> <email A> <email B>
//   (onboarded, password TestPass!2026; DB_CONTAINER, BASE_URL, REPO_ROOT, STORE_STANDIN)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const STANDIN = process.env.STORE_STANDIN || 'http://127.0.0.1:8790';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const ANDROID_BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [ADMIN, EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!ADMIN || !EMAIL_A || !EMAIL_B || !ANON) { console.error('usage: ANON_KEY=… node admin-alerts.mjs <admin email> <email A> <email B>'); process.exit(2); }
const OUT = new URL('./.shots/admin-alerts/', import.meta.url).pathname;
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
const cronSecret = sql(`select decrypted_secret from vault.decrypted_secrets where name = 'send_push_cron_secret';`);
const sendPush = () => fetch(`${API}/functions/v1/send-push`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret }, body: '{}',
}).then((r) => r.json().catch(() => null));
const sentTo = async (token) => (await fetch(`${STANDIN}/__fcm/messages`).then((r) => r.json())).filter((m) => m.message.token === token);

const id = (email) => sql(`select id from auth.users where email = '${email}';`);
const [ADMIN_ID, A, B] = [id(ADMIN), id(EMAIL_A), id(EMAIL_B)];
const everyone = `('${ADMIN_ID}', '${A}', '${B}')`;
const alerts = (who) => sql(`select event_type || '|' || title || '|' || body || '|' || data::text from push_queue
                             where user_id = '${who}' and event_type like 'admin_%' order by created_at;`).split('\n').filter(Boolean)
  .map((l) => { const [type, title, body, ...data] = l.split('|'); return { type, title, body, data: JSON.parse(data.join('|')) }; });
const ADMIN_TOKEN = `admin-phone-${'a'.repeat(40)}`;

function reset() {
  sql(`delete from push_queue where user_id in ${everyone};
       delete from push_devices where user_id in ${everyone} or token = '${ADMIN_TOKEN}';
       delete from reports where reporter_id in ${everyone};
       delete from verification_requests where user_id in ${everyone} and status = 'pending';
       update profiles set settings_push_notifs = true, is_banned = false where id in ${everyone};
       insert into admin_emails (email) select '${ADMIN}' where not exists (select 1 from admin_emails where lower(email) = lower('${ADMIN}'));
       delete from admin_emails where lower(email) in (lower('${EMAIL_A}'), lower('${EMAIL_B}'));`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
// The Admin tab that's open (its button is underlined), once there is one
// The admin section shown (its sidebar button is the current page)
const adminTabOpen = (page, tab, ms = 15000) => page.waitForFunction((t) => !!document.querySelector(`[data-section="${t}"][aria-current="page"]`),
  tab, { timeout: ms }).then(() => true, () => false);

async function signInOnPage(page, email) {
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
}

// Capacitor's Android bridge; the Firebase Messaging plugin answers as on a phone, taps are played here
const ANDROID = `
  window.__native = [];
  function answer(call) {
    window.__native.push(call);
    if (call.callbackId === '-1' || call.methodName === 'addListener') return;
    let data = {};
    if (call.pluginId === 'FirebaseMessaging' && call.methodName === 'checkPermissions') data = { receive: 'granted' };
    if (call.pluginId === 'FirebaseMessaging' && call.methodName === 'getToken') data = { token: '${ADMIN_TOKEN}' };
    setTimeout(() => window.Capacitor.fromNative({ callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data }), 10);
  }
  window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
    if (call.pluginId === 'Console' || call.type === 'js.error') return; answer(call); } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'getInfo', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
    { name: 'FirebaseMessaging', methods: ['checkPermissions', 'requestPermissions', 'getToken', 'deleteToken', 'createChannel', 'removeAllListeners']
        .map((name) => ({ name, rtype: 'promise' })).concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
  ] };
  window.__tap = (data) => {
    const l = window.__native.filter((c) => c.pluginId === 'FirebaseMessaging' && c.methodName === 'addListener'
      && c.options.eventName === 'notificationActionPerformed').pop();
    if (!l) return false;
    window.Capacitor.fromNative({ callbackId: l.callbackId, pluginId: 'FirebaseMessaging', methodName: 'addListener', save: true, success: true,
      data: { actionId: 'tap', notification: { id: '1', title: 'x', body: 'y', data } } });
    return true;
  };`;

sql(`select cron.alter_job((select jobid from cron.job where jobname = 'send-push'), active := false);`);
try {
  reset();
  const [jwtAdmin, jwtA] = [await signIn(ADMIN), await signIn(EMAIL_A)];

  log('== A report');
  let r = await rest(jwtA, 'POST', 'reports', { reporter_id: A, reported_id: B, reason: 'harassment', details: 'Rude messages from Test' });
  check(r.status === 201, `A reports B (${r.status})`);
  let got = alerts(ADMIN_ID);
  check(got.length === 1 && got[0].type === 'admin_report' && got[0].title === '🚩 New report to review'
    && got[0].body === 'Reason: Harassment or threats. Open Admin → Reports.', `the admin is told: "${got[0]?.title} ${got[0]?.body}"`);
  check(got[0]?.data.admin_tab === 'reports' && got[0]?.data.report_id === r.body?.[0]?.id && got[0]?.data.deep_link === '/admin',
    'with what to open');
  check(!JSON.stringify(got).includes('Rude messages') && !JSON.stringify(got).includes(sql(`select name from profiles where id = '${B}';`)),
    'no names, no details');
  check(alerts(A).length === 0 && alerts(B).length === 0, 'members aren\'t told');

  r = await rest(jwtA, 'POST', 'reports', { reporter_id: A, reported_id: B, reason: 'underage' });
  got = alerts(ADMIN_ID);
  check(got.length === 2 && got[1].title === '🚨 Report: someone may be under age' && got[1].body === 'Reason: Underage user. Open Admin → Reports.',
    `someone maybe under age gets its own title ("${got[1]?.title}")`);

  r = await rest(jwtAdmin, 'POST', 'reports', { reporter_id: ADMIN_ID, reported_id: B, reason: 'spam' });
  check(r.status === 201 && alerts(ADMIN_ID).length === 2, 'an admin who reports isn\'t told about their own report');

  sql(`update profiles set settings_push_notifs = false where id = '${ADMIN_ID}';`);
  await rest(jwtA, 'POST', 'reports', { reporter_id: A, reported_id: B, reason: 'spam' });
  check(alerts(ADMIN_ID).length === 2, 'an admin with notifications off isn\'t told');
  sql(`update profiles set settings_push_notifs = true where id = '${ADMIN_ID}';`);

  log('== A verification request');
  const links = { p_linkedin_url: 'https://linkedin.com/in/a-test', p_instagram_url: 'https://instagram.com/a.test', p_facebook_url: '', p_twitter_url: '', p_user_notes: '' };
  r = await rest(jwtA, 'POST', 'rpc/submit_verification_request', links);
  check(r.status === 200, `A asks to be verified (${r.status})`);
  got = alerts(ADMIN_ID).filter((x) => x.type === 'admin_verification');
  check(got.length === 1 && got[0].title === '🪪 New verification request' && got[0].data.admin_tab === 'verifications',
    `the admin is told: "${got[0]?.title}"`);
  await rest(jwtA, 'POST', 'rpc/submit_verification_request', { ...links, p_twitter_url: 'https://x.com/a_test' });
  check(alerts(ADMIN_ID).filter((x) => x.type === 'admin_verification').length === 1, 'updating the waiting request doesn\'t ask again');

  log('== To the admin\'s phone');
  await fetch(`${STANDIN}/__fcm/reset`, { method: 'POST' });  // only this run's messages
  r = await rest(jwtAdmin, 'POST', 'rpc/register_push_device', { p_token: ADMIN_TOKEN, p_platform: 'android', p_app_version: '1.0.0 (10000)' });
  check(r.status === 204 || r.status === 200, `the admin's phone signs up (${r.status})`);
  await sendPush();
  const sent = await sentTo(ADMIN_TOKEN);
  const report = sent.find((m) => m.message.data?.event_type === 'admin_report');
  check(!!report && report.message.android.notification.channel_id === 'admin' && report.message.data.admin_tab === 'reports',
    `sent on Android's "admin" channel (${report?.message.android.notification.channel_id})`);
  check(sent.some((m) => m.message.data?.event_type === 'admin_verification' && m.message.android.notification.channel_id === 'admin'),
    'the verification request too');

  log('== In the Android app');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript({ content: ANDROID });
  await ctx.addInitScript({ path: ANDROID_BRIDGE });
  let page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await signInOnPage(page, ADMIN);
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  const channelMade = () => page.evaluate(() => window.__native.some((c) => c.methodName === 'createChannel' && c.options.id === 'admin'));
  check(await appears(page.getByText('Admin', { exact: true })) && await page.waitForFunction(() =>
    window.__native.some((c) => c.methodName === 'createChannel' && c.options.id === 'admin'), null, { timeout: 8000 }).then(() => true, () => false),
  'an admin\'s phone gets the "Admin alerts" channel');
  const channel = await page.evaluate(() => window.__native.find((c) => c.methodName === 'createChannel' && c.options.id === 'admin')?.options);
  check(channel?.name === 'Admin alerts', `named "${channel?.name}"`);
  check(await page.evaluate(() => window.__tap({ event_type: 'admin_report', admin_tab: 'reports', deep_link: '/admin' })), 'an alert is tapped');
  check(await adminTabOpen(page, 'reports'), 'it opens Admin → Reports');
  await page.screenshot({ path: `${OUT}1-android-reports.png` });
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript({ content: ANDROID });
  await ctx.addInitScript({ path: ANDROID_BRIDGE });
  page = await ctx.newPage();
  await page.goto(BASE);
  await signInOnPage(page, EMAIL_A);
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  check(!(await channelMade()), 'a member\'s phone doesn\'t');
  await ctx.close();

  log('== On the website');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  page = await ctx.newPage();
  await page.goto(BASE);
  await signInOnPage(page, ADMIN);
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
    data: { type: 'push_click', data: { event_type: 'admin_verification', admin_tab: 'verifications', deep_link: '/admin' } },
  })));
  check(await adminTabOpen(page, 'verifications'), 'a clicked alert opens Admin → Verifications');
  await page.screenshot({ path: `${OUT}2-web-verifications.png` });
  const push = encodeURIComponent(JSON.stringify({ event_type: 'admin_report', admin_tab: 'reports', deep_link: '/admin' }));
  await page.goto(`${BASE}/?push=${push}`);
  check(await adminTabOpen(page, 'reports', 20000) && !page.url().includes('push='),
    `one that opened the site opens Admin → Reports, and the address is tidied (${new URL(page.url()).search || 'no query'})`);
  await ctx.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  reset();
  sql(`select cron.alter_job((select jobid from cron.job where jobname = 'send-push'), active := true);`);
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
