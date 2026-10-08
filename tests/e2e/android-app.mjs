// The Android app's own behaviour (lib/nativeApp.ts), in Chromium with a
// stand-in for Capacitor's Android bridge: Capacitor's real bridge script
// runs, every call the app makes to Android is recorded, plugin calls are
// answered, and the back button can be pressed. Checks the launch screen,
// the bar colours, no cookie banner, email-only sign-in while Supabase has
// Google and Apple off (app-social-signin.mjs covers them), no Razorpay checkout,
// the notifications note, no share button, and the back button: popups first
// (sign-in, Shaadi24+, like, profile, filters, delete account, phone menu),
// then a chat, Terms, other tabs, and last the app goes to the background.
// Usage: node android-app.mjs <email>   (an onboarded account, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node android-app.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/android/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const [otherId, otherName] = sql(`select id || '|' || name from profiles where id <> '${me}' and onboarding_complete
  and name in (select name from profiles group by name having count(*) = 1)
  and not exists (select 1 from blocks b where (b.blocker_id = '${me}' and b.blocked_id = profiles.id)
                                          or (b.blocker_id = profiles.id and b.blocked_id = '${me}'))  -- Matches hides them
  and not coalesce(is_banned, false)
  order by name limit 1;`).split('|');
sql(`delete from likes where liker_id = '${me}';
     delete from matches where '${me}' in (user_a_id, user_b_id);
     insert into matches (user_a_id, user_b_id)  -- stored as the smaller id first
       values (least('${me}'::uuid, '${otherId}'::uuid), greatest('${me}'::uuid, '${otherId}'::uuid));
     update profiles set subscription_tier = 'FREE', account_created = now(), daily_search_count = 0,
       daily_like_count = 0, is_paused = false, settings_theme = 'system' where id = '${me}';
     delete from search_usage where user_id = '${me}';`);

// What the native side provides: the bridge, and the plugins this app uses
const STANDIN = `
  window.__native = [];
  window.androidBridge = {
    postMessage(json) {
      const call = JSON.parse(json);
      if (call.pluginId === 'Console' || call.type === 'js.error') return;
      window.__native.push(call);
      // Plugin methods answer straight away; listeners wait for their event
      if (call.callbackId !== '-1' && call.methodName !== 'addListener') {
        setTimeout(() => window.Capacitor.fromNative({
          callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data: {},
        }));
      }
    },
  };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' },
                             { name: 'minimizeApp', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
  ] };
  // Android's back button, delivered the way Capacitor does
  window.__pressBack = () => {
    const listener = window.__native.find((c) => c.pluginId === 'App' && c.methodName === 'addListener'
      && c.options.eventName === 'backButton');
    if (!listener) return false;
    window.Capacitor.fromNative({ callbackId: listener.callbackId, pluginId: 'App', methodName: 'addListener',
      save: true, success: true, data: { canGoBack: false } });
    return true;
  };
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function appPage(viewport, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme });
  await ctx.addInitScript({ content: STANDIN });
  await ctx.addInitScript({ path: BRIDGE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  return page;
}
const calls = (page, pluginId, methodName) =>
  page.evaluate(([p, m]) => window.__native.filter((c) => c.pluginId === p && c.methodName === m), [pluginId, methodName]);
const minimized = async (page) => (await calls(page, 'App', 'minimizeApp')).length;
async function back(page) {
  const pressed = await page.evaluate(() => window.__pressBack());
  await page.waitForTimeout(500);
  return pressed;
}
const popups = (page) => page.evaluate(() => [...document.querySelectorAll('.popup-backdrop, [data-popup]')]
  .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).opacity !== '0').length);

try {
  log('1. starting up, signed out');
  for (const scheme of ['light', 'dark']) {
    const page = await appPage({ width: 412, height: 915 }, scheme);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);  // the cookie banner would show after half a second
    check(await page.evaluate(() => document.documentElement.classList.contains('native-app')), `${scheme}: knows it's the app`);
    check(await page.evaluate(() => {
      const viewport = document.querySelector('meta[name="viewport"]').content;
      return /maximum-scale=1\.0, user-scalable=no/.test(viewport) && !viewport.includes('viewport-fit');
    }), `${scheme}: the app doesn't zoom`);
    check((await calls(page, 'SplashScreen', 'hide')).length >= 1, `${scheme}: launch screen hidden once drawn`);
    const theme = (await calls(page, 'AppWindow', 'setTheme')).at(-1)?.options;
    check(scheme === 'dark' ? theme?.dark === true && theme?.color === '#191919' : theme?.dark === false && theme?.color === '#ffffff',
      `${scheme}: status and gesture bars coloured ${JSON.stringify(theme)}`);
    if (scheme === 'dark') { await page.context().close(); continue; }

    check(!(await page.getByText('We respect your privacy').isVisible().catch(() => false)), 'no cookie banner');
    await page.screenshot({ path: `${OUT}1-landing.png` });
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Continue with Email/ }).waitFor();
    check(await page.getByText('Continue with Google').count() === 0, 'sign-in offers email only while Google is off in Supabase (never Google\'s web page)');
    await page.waitForTimeout(400);  // fade-in
    await page.screenshot({ path: `${OUT}2-sign-in.png` });
    check(await back(page), 'the app listens to the back button');
    check(await popups(page) === 0 && await minimized(page) === 0, 'back closes the sign-in popup (the app stays)');
    await page.getByRole('button', { name: 'Terms' }).click();
    await page.waitForTimeout(400);
    check(await page.getByRole('button', { name: 'Sign in' }).count() === 0, 'Terms open');
    await back(page);
    check(await page.getByRole('button', { name: 'Sign in' }).isVisible() && await minimized(page) === 0, 'back from Terms returns to the start');
    await back(page);
    check(await minimized(page) === 1, 'back with nothing to go back to puts the app in the background');
    await page.context().close();
  }

  log('2. signed in');
  const page = await appPage({ width: 1280, height: 860 });
  const billing = [];
  page.on('request', (r) => { if (r.url().includes('/functions/v1/billing')) billing.push(r.url()); });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  const box = page.getByTestId('find-match-box');
  await box.waitFor({ timeout: 15000 });

  await page.getByText('Get Shaadi24+', { exact: true }).click();
  check(await page.getByText('Shaadi24+ is coming to the app soon.').waitFor({ timeout: 8000 }).then(() => true, () => false),
    'Shaadi24+: "coming to the app soon", no Razorpay');
  check(billing.length === 0, 'the app never asks the Razorpay billing function');
  await page.screenshot({ path: `${OUT}3-shaadi24-plus.png` });
  await back(page);
  check(await popups(page) === 0, 'back closes Shaadi24+');

  await box.fill('someone kind');
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 });
  await box.press('Enter');
  check((await responded).status() === 200, 'search works');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Like', exact: true }).first().click();
  await page.getByText(/likes remaining today/).waitFor({ timeout: 5000 });
  // Back pressed in the first instant, while the popup is still fully faded out
  await page.evaluate(() => { document.querySelector('.popup-backdrop').style.opacity = '0'; });
  await back(page);
  check(await popups(page) === 0 && !(await page.getByText('Profile Details').first().isVisible().catch(() => false)),
    "back closes the like popup, even as it fades in (and doesn't open the card)");
  await page.locator('h3').first().click();
  await page.getByText('Profile Details').first().waitFor({ timeout: 5000 });
  check(await page.getByRole('button', { name: 'Share profile' }).count() === 0, 'no share button (no web address in the app)');
  await back(page);
  check(await popups(page) === 0, 'back closes the profile');
  await page.getByTitle('Filters').click();
  await page.getByText('Refine your search pool').waitFor({ timeout: 5000 });
  await back(page);
  check(await popups(page) === 0, 'back closes the filters');

  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByText('Notifications on your phone are coming to the app soon.').waitFor({ timeout: 5000 });
  check(true, 'Settings: notifications "coming to the app soon"');
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await page.waitForTimeout(400);
  await back(page);
  check(await popups(page) === 0, 'back closes "Delete Account"');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.waitForTimeout(600);
  check((await calls(page, 'AppWindow', 'setTheme')).at(-1)?.options?.dark === true, 'choosing Dark turns the bars dark');
  await page.screenshot({ path: `${OUT}4-settings-dark.png` });
  await page.getByRole('button', { name: 'Automatic', exact: true }).click();
  await back(page);
  check(await box.isVisible() && await minimized(page) === 0, 'back from Settings goes to Find Match');

  log('3. phone layout: menu and a chat');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(400);
  await page.locator('main button.md\\:hidden').first().click();
  await page.waitForTimeout(400);
  await back(page);
  check(await popups(page) === 0, 'back closes the menu');
  await page.locator('main button.md\\:hidden').first().click();
  await page.getByText('Matches', { exact: true }).first().click();
  await page.getByText(otherName).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}5-chat.png` });
  const chatOpen = () => page.evaluate(() => !!document.querySelector('textarea, input[placeholder*="essage"]'));
  check(await chatOpen(), `the chat with ${otherName} is open`);
  check(await page.getByText('Shift+Enter').count() === 0, 'no keyboard hint in the chat');
  await back(page);
  check(!(await chatOpen()) && await page.getByText(otherName).first().isVisible(), 'back returns to the list of matches');
  await back(page);
  check(await box.isVisible(), 'back again goes to Find Match');
  const before = await minimized(page);
  await back(page);
  check(await minimized(page) === before + 1, 'and from Find Match, back puts the app in the background');
} catch (e) {
  failures++;
  log('ERROR', e.message.split('\n')[0]);
}

await browser.close();
sql(`delete from matches where '${me}' in (user_a_id, user_b_id); delete from likes where liker_id = '${me}';`);
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
