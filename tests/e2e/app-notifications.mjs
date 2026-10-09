// Notifications inside the phone apps (lib/nativePush.ts, NotificationOffer,
// Settings), in Chromium with stand-ins for Capacitor's Android and iOS
// bridges. Their Firebase Messaging plugin is played here: the phone's
// permission, its token, the channels, and notifications arriving or tapped.
// The real database records each phone (register_push_device).
//  Android: the offer to turn notifications on; yes → the phone's question,
//    the token signed up, the three channels; opening the app again signs it
//    up again quietly; Settings on/off (off sticks); a notification while the
//    app is open → a toast, but not for the chat on screen; tapping one opens
//    its chat, or Likes You; a tap that launched the app opens its chat once
//    signed in; signing out takes the phone off; "Not now"; notifications
//    blocked in the phone's settings; an app without Firebase → "coming soon"
//  iPhone: yes → signed up as an iPhone; blocked → where to allow them
// Usage: node app-notifications.mjs <email> <other email>   (onboarded, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};
const [EMAIL, OTHER] = process.argv.slice(2);
if (!EMAIL || !OTHER) { console.error('usage: node app-notifications.mjs <email> <other email>'); process.exit(2); }
const OUT = new URL('./.shots/notifications/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const other = sql(`select id from profiles where email = '${OTHER}';`);
const otherName = sql(`select name from profiles where id = '${other}';`);
const [lo, hi] = [me, other].sort();
const devices = () => sql(`select platform || '|' || token || '|' || coalesce(app_version, '') from push_devices where user_id = '${me}' order by updated_at;`)
  .split('\n').filter(Boolean);
function reset() {
  sql(`delete from push_devices where user_id = '${me}';
       delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
       delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
       update profiles set is_paused = false, settings_theme = 'system' where id = '${me}';`);
}

// ---- The phone: Capacitor's bridge, with the Firebase Messaging plugin played here ----------

const FCM_METHODS = ['checkPermissions', 'requestPermissions', 'isSupported', 'getToken', 'deleteToken', 'getDeliveredNotifications',
  'removeDeliveredNotifications', 'removeAllDeliveredNotifications', 'subscribeToTopic', 'unsubscribeFromTopic', 'createChannel',
  'deleteChannel', 'listChannels', 'removeAllListeners'];
function standin(platform) {
  const send = platform === 'android'
    ? `window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
         if (call.pluginId === 'Console' || call.type === 'js.error') return; answer(call); } };`
    : `window.webkit = { messageHandlers: { bridge: { postMessage(call) {
         if (call.pluginId === 'Console' || call.type !== 'message') return; answer(call); } } } };`;
  const own = platform === 'android'
    ? `{ name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] }`
    : `{ name: 'SystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }, { name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] }`;
  return `
    window.__native = [];
    function deliver(callbackId, methodName, data, save) {
      window.Capacitor.fromNative({ callbackId, pluginId: 'FirebaseMessaging', methodName, save: !!save, success: true, data });
    }
    function answer(call) {
      window.__native.push(call);
      if (call.pluginId === 'FirebaseMessaging' && call.methodName === 'addListener') {
        // Taps are kept until the app listens (as the plugin does)
        if (call.options.eventName === 'notificationActionPerformed' && window.__pendingTap) {
          const tap = window.__pendingTap;
          window.__pendingTap = null;
          setTimeout(() => deliver(call.callbackId, 'addListener', tap, true), 50);
        }
        return;
      }
      if (call.callbackId === '-1' || call.methodName === 'addListener') return;
      const reply = call.pluginId === 'FirebaseMessaging' ? window.__fcm(call)
        : call.pluginId === 'App' && call.methodName === 'getInfo'
          ? Promise.resolve({ data: { id: 'com.shaadi24.app', name: 'Shaadi24', version: '1.0', build: '7' } })
          : Promise.resolve({ data: {} });
      reply.then((r) => window.Capacitor.fromNative(Object.assign(
        { callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: !r.error },
        r.error ? { error: r.error } : { data: r.data || {} })));
    }
    ${send}
    window.Capacitor = { PluginHeaders: [
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' },
                               { name: 'minimizeApp', rtype: 'promise' }, { name: 'getInfo', rtype: 'promise' }] },
      { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
      ${own},
      { name: 'FirebaseMessaging', methods: ${JSON.stringify(FCM_METHODS.map((name) => ({ name, rtype: 'promise' })))}
          .concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
    ] };
    // A notification arriving or tapped, as the plugin reports them
    window.__fire = (eventName, data) => {
      const l = window.__native.filter((c) => c.pluginId === 'FirebaseMessaging' && c.methodName === 'addListener'
        && c.options.eventName === eventName).pop();
      if (!l) return false;
      deliver(l.callbackId, 'addListener', data, true);
      return true;
    };
  `;
}

// The plugin's native side: the phone's permission and its token
function pluginSide(phone) {
  return async (call) => {
    const o = call.options || {};
    phone.calls.push({ method: call.methodName, options: o });
    switch (call.methodName) {
      case 'checkPermissions':
        return { data: { receive: phone.permission } };
      case 'requestPermissions':
        phone.asked++;
        if (phone.permission === 'prompt') phone.permission = phone.answer;
        return { data: { receive: phone.permission } };
      case 'getToken':
        if (phone.noFirebase) {
          return { error: { message: phone.platform === 'ios'
            ? 'Firebase is not configured: GoogleService-Info.plist is missing from the app bundle.'
            : 'Default FirebaseApp is not initialized in this process com.shaadi24.app. Make sure to call FirebaseApp.initializeApp(Context) first.',
            ...(phone.platform === 'ios' ? { code: 'UNAVAILABLE' } : {}) } };
        }
        return { data: { token: phone.token } };
      case 'deleteToken':
        phone.deleted++;
        phone.token = `${phone.platform}-token-${++phone.serial}-${'x'.repeat(40)}`;
        return { data: {} };
      default:
        return { data: {} };
    }
  };
}

const newPhone = (platform, over = {}) => ({
  platform, permission: 'prompt', answer: 'granted', noFirebase: false, asked: 0, deleted: 0, serial: 1, calls: [],
  token: `${platform}-token-1-${'x'.repeat(40)}`, ...over,
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// Opens the app on this phone: what the app keeps on the phone (its storage,
// the session) stays from the last time, as on a real phone
async function openApp(phone, { pendingTap = null } = {}) {
  // A tablet-sized screen keeps the sidebar open
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...(phone.storage ? { storageState: phone.storage } : {}) });
  await ctx.exposeFunction('__fcm', pluginSide(phone));
  await ctx.addInitScript({ content: standin(phone.platform) });
  if (pendingTap) await ctx.addInitScript((tap) => { window.__pendingTap = tap; }, pendingTap);
  await ctx.addInitScript({ path: BRIDGE[phone.platform] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  page.rpcs = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/rest\/v1\/rpc\/((?:un)?register_push_device)/);
    if (m) page.rpcs.push({ fn: m[1], body: r.postData() || '' });
  });
  await page.goto(BASE);
  const home = page.getByTestId('find-match-box');
  await home.or(page.getByRole('button', { name: 'Sign in' })).first().waitFor({ timeout: 20000 });
  if (!(await home.isVisible())) await signInOn(page);
  return { ctx, page };
}

async function closeApp(ctx, phone) {
  phone.storage = await ctx.storageState();
  await ctx.close();
}

async function signInOn(page) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  // Find Match, or a chat if a tapped notification opened one straight away
  await page.getByTestId('find-match-box').or(page.getByPlaceholder(/^Message /)).first().waitFor({ timeout: 20000 });
}

const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
};
// Whether something shows up within the time (isVisible doesn't wait)
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const offer = (page) => page.getByTestId('notification-offer');
const openSettings = async (page) => {
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByTestId(/^phone-push-(toggle|unavailable|denied)$/).first().waitFor({ timeout: 10000 });
};
const toggle = (page) => page.getByTestId('phone-push-toggle');
const called = (phone, method) => phone.calls.filter((c) => c.method === method);

let matchId;
try {
  reset();
  // Matched before the app opens (a match made while it's open shows "It's a match!")
  matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  // ======================================================================================
  log('1. Android: turning notifications on');
  let phone = newPhone('android');
  let { ctx, page } = await openApp(phone);
  await offer(page).waitFor({ timeout: 8000 });
  await page.screenshot({ path: `${OUT}1-offer.png` });
  check(phone.asked === 0 && called(phone, 'getToken').length === 0, "the app offers first; the phone isn't asked yet and no token is made");
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByText(/Notifications are on/).waitFor({ timeout: 8000 });
  check(phone.asked === 1, "yes → the phone's own question");
  let rows = await until(() => devices().length === 1 && devices());
  check(rows && rows[0] === `android|${phone.token}|1.0 (7)`, `the phone is signed up for this account: ${rows?.[0]?.slice(0, 40)}…`);
  const channels = called(phone, 'createChannel').map((c) => `${c.options.id}:${c.options.importance}`).sort();
  check(channels.join(',') === 'likes:3,matches:4,messages:4', `channels: ${channels.join(', ')}`);
  check(!(await offer(page).isVisible().catch(() => false)), 'the offer is gone');
  await page.screenshot({ path: `${OUT}2-on.png` });

  // Opening the app again: signed up again quietly (a token can change)
  const firstUpdate = sql(`select updated_at from push_devices where user_id = '${me}';`);
  await closeApp(ctx, phone);
  ({ ctx, page } = await openApp(phone));
  await until(() => sql(`select updated_at from push_devices where user_id = '${me}';`) !== firstUpdate);
  check(sql(`select updated_at from push_devices where user_id = '${me}';`) !== firstUpdate && phone.asked === 1,
    'opening the app again signs the phone up again, without asking');
  check(!(await offer(page).isVisible().catch(() => false)), 'and offers nothing');

  // ======================================================================================
  log('2. Settings: on and off');
  await openSettings(page);
  check(await toggle(page).getAttribute('aria-checked') === 'true', 'Settings: notifications on this phone are on');
  await page.screenshot({ path: `${OUT}3-settings-on.png` });
  await toggle(page).click();
  await until(async () => (await toggle(page).getAttribute('aria-checked')) === 'false');
  check(devices().length === 0 && phone.deleted === 1, 'off: the phone is taken off and its token dropped');
  await closeApp(ctx, phone);
  ({ ctx, page } = await openApp(phone));
  await page.waitForTimeout(1500);
  check(devices().length === 0, 'off stays off when the app opens again');
  await openSettings(page);
  check(await toggle(page).getAttribute('aria-checked') === 'false', 'Settings shows it off');
  await toggle(page).click();
  await until(() => devices().length === 1);
  check(devices()[0]?.includes(phone.token) && phone.token.includes('-token-2-'), 'on again: signed up with the new token');

  // ======================================================================================
  log('3. Notifications while the app is open, and taps');
  await page.evaluate((m) => window.__fire('notificationReceived', { notification: {
    title: '💬 Priya sent you a message', body: 'Open Shaadi24 to read it', data: { event_type: 'new_message', match_id: m } } }), matchId);
  check(await appears(page.getByText('💬 Priya sent you a message'), 4000), 'a notification while the app is open shows as a toast');
  await page.screenshot({ path: `${OUT}4-toast.png` });
  await page.evaluate((m) => window.__fire('notificationActionPerformed', { actionId: 'tap', notification: {
    title: 'x', body: 'y', data: { event_type: 'new_message', match_id: m, deep_link: '/matches' } } }), matchId);
  check(await appears(page.getByPlaceholder(`Message ${otherName}…`), 8000), `tapping a message notification opens the chat with ${otherName}`);
  await page.screenshot({ path: `${OUT}5-tapped-chat.png` });
  await page.waitForTimeout(3500);  // the earlier toast goes
  await page.evaluate((m) => window.__fire('notificationReceived', { notification: {
    title: '💬 From the open chat', body: 'Open Shaadi24 to read it', data: { event_type: 'new_message', match_id: m } } }), matchId);
  await page.waitForTimeout(800);
  check(!(await page.getByText('💬 From the open chat').isVisible().catch(() => false)), "no toast for the chat that's on screen");
  await page.evaluate(() => window.__fire('notificationActionPerformed', { actionId: 'tap', notification: {
    title: '⭐ Someone sent you a Super Interest', body: 'Open Likes You to see their profile.', data: { event_type: 'super_like', deep_link: '/likes' } } }));
  check(await appears(page.getByRole('heading', { name: /Likes You/ }), 8000), 'tapping a Super Interest opens Likes You');

  // ======================================================================================
  log('4. Signing out');
  const before = phone.deleted;
  await page.getByTitle(/Log out|Sign out/).or(page.getByRole('button', { name: /Log out|Sign out/ })).first().click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
  check(devices().length === 0 && phone.deleted === before + 1, 'signing out takes the phone off and drops its token');
  const unregister = page.rpcs.find((r) => r.fn === 'unregister_push_device');
  check(!!unregister && unregister.body.includes(phone.token.replace(/-token-\d+-/, '-token-2-')), 'with the token it had');
  await closeApp(ctx, phone);

  // A tap that launched the app: opens its chat once signed in
  ({ ctx, page } = await openApp(phone, { pendingTap: { actionId: 'tap', notification: {
    title: "It's a match! 🎉", body: 'Say hello!', data: { event_type: 'new_match', match_id: matchId } } } }));
  check(await appears(page.getByPlaceholder(`Message ${otherName}…`), 10000), 'a tap that opened the app opens its chat after sign-in');
  await closeApp(ctx, phone);

  // ======================================================================================
  log('5. Not now, blocked, and an app without Firebase');
  sql(`delete from push_devices where user_id = '${me}';`);
  phone = newPhone('android');
  ({ ctx, page } = await openApp(phone));
  await offer(page).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Not now' }).click();
  check(!(await offer(page).isVisible().catch(() => false)) && phone.asked === 0, '"Not now": the offer goes, the phone is not asked');
  await closeApp(ctx, phone);
  ({ ctx, page } = await openApp(phone));
  await page.waitForTimeout(1500);
  check(!(await offer(page).isVisible().catch(() => false)), 'and stays away when the app opens again');
  await openSettings(page);
  check(await toggle(page).getAttribute('aria-checked') === 'false', 'Settings still offers the switch');
  await closeApp(ctx, phone);

  phone = newPhone('android', { permission: 'denied' });
  ({ ctx, page } = await openApp(phone));
  await page.waitForTimeout(1500);
  check(!(await offer(page).isVisible().catch(() => false)), 'blocked in the phone settings: no offer');
  await openSettings(page);
  check(await appears(page.getByTestId('phone-push-denied').getByText(/Settings → Apps → Shaadi24 → Notifications/)), 'Settings says where to allow them on Android');
  await page.screenshot({ path: `${OUT}6-denied.png` });
  await closeApp(ctx, phone);

  phone = newPhone('android', { noFirebase: true });
  ({ ctx, page } = await openApp(phone));
  await offer(page).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Turn on' }).click();
  check(await appears(page.getByText('Notifications are coming to the app soon.'), 8000), 'an app without Firebase: "coming soon"');
  await openSettings(page);
  check(await appears(page.getByTestId('phone-push-unavailable')) && devices().length === 0, 'Settings too, and nothing signed up');
  await closeApp(ctx, phone);

  // ======================================================================================
  log('6. iPhone');
  phone = newPhone('ios');
  ({ ctx, page } = await openApp(phone));
  await offer(page).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByText(/Notifications are on/).waitFor({ timeout: 8000 });
  rows = devices();
  check(rows.length === 1 && rows[0].startsWith(`ios|${phone.token}|`), 'an iPhone is signed up as an iPhone');
  check(called(phone, 'createChannel').length === 0, 'no Android channels on an iPhone');
  await closeApp(ctx, phone);
  sql(`delete from push_devices where user_id = '${me}';`);
  phone = newPhone('ios', { permission: 'denied' });
  ({ ctx, page } = await openApp(phone));
  await openSettings(page);
  check(await appears(page.getByTestId('phone-push-denied').getByText(/Settings → Notifications → Shaadi24/)), 'blocked: where to allow them on an iPhone');
  await closeApp(ctx, phone);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  reset();
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
