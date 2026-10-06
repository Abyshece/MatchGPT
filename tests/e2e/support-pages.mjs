// The pages the stores link to, and help inside the app, in Chromium against
// the local stack:
//   - /support (the stores' Support URL): how to reach us, the common
//     questions (they open), links to Terms, Privacy and account deletion;
//     fits a phone, light and dark, no cookie banner over it
//   - /privacy and /terms open the Privacy Policy and the Terms; Back goes to
//     the home page, and so does the address; #privacy still works
//   - Settings → Support: Help Center, Contact support (an email), Terms and
//     Privacy; the version shown is package.json's
//   - the Help Center: the answers, and Contact Support writes an email; the
//     Android app's names only Google Play (no other store, no website
//     payments, no links out to the website's pages)
//   - Settings → Download my data: a JSON file of the account's data on the
//     website, the share sheet in the Android app (bridge stand-in)
// Usage: node support-pages.mjs <email of an account with a finished profile>   (BASE_URL, REPO_ROOT)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const ANDROID_BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const [EMAIL] = process.argv.slice(2);
if (!EMAIL) { console.error('usage: node support-pages.mjs <email of an account with a finished profile>'); process.exit(2); }
const VERSION = JSON.parse(fs.readFileSync(`${REPO}/package.json`, 'utf8')).version;
const OUT = new URL('./.shots/support/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const path = (page) => new URL(page.url()).pathname;

async function open(url, { colorScheme = 'light', width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(`${BASE}${url}`);
  return { ctx, page };
}

// Capacitor's Android bridge: Filesystem and Share answer as on a phone, the rest with nothing
const ANDROID = `
  window.__native = [];
  window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
    if (call.pluginId === 'Console' || call.type === 'js.error') return;
    window.__native.push(call);
    if (call.callbackId === '-1' || call.methodName === 'addListener') return;
    const data = call.pluginId === 'Filesystem' ? { uri: 'file:///data/user/0/com.shaadi24.app/cache/' + call.options.path } : {};
    setTimeout(() => window.Capacitor.fromNative({ callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data }), 10);
  } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'getInfo', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
    { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
    { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }, { name: 'canShare', rtype: 'promise' }] },
  ] };`;

async function signIn(ctx) {
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return page;
}
const settings = (page) => page.getByText('Settings', { exact: true }).first().click()
  .then(() => page.getByRole('heading', { name: 'Settings & Preferences' }).waitFor());

try {
  log('== /support');
  let { ctx, page } = await open('/support');
  check(await appears(page.getByRole('heading', { name: 'Help & Support' }), 15000), 'the support page opens');
  check(await page.title() === 'Shaadi24 Help & Support', `its title (${await page.title()})`);
  const contact = page.getByTestId('support-contact');
  check(/^mailto:support@shaadi24\.com/.test(await contact.locator('a').first().getAttribute('href') || ''), 'the support address, as an email link');
  check(await contact.locator('a[href="mailto:privacy@shaadi24.com"]').count() === 1, 'the privacy address');
  check(/review every report within 24 hours/.test(await contact.innerText()), 'how reports are handled');
  const questions = page.locator('details');
  check(await questions.count() === 14, `14 questions (${await questions.count()})`);
  check(!(await page.getByText(/search 3 times a day/).isVisible()), 'answers start closed');
  await page.getByText('Is Shaadi24 free?').click();
  check(await appears(page.getByText(/search 3 times a day, send 15 likes a day/)), 'a question opens to its answer');
  await page.getByText('My data, and deleting my account').click();
  const mine = questions.filter({ hasText: 'My data, and deleting my account' });
  check(await mine.locator('a[href="/delete-account"]').count() === 1 && await mine.locator('a[href="/privacy"]').count() === 1,
    'the website\'s answers link to its Delete account page and Privacy Policy');
  const nav = page.locator('nav');
  check(await nav.locator('a[href="/terms"]').count() === 1 && await nav.locator('a[href="/privacy"]').count() === 1
    && await nav.locator('a[href="/delete-account"]').count() === 1, 'links to Terms, Privacy and account deletion');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, `fits a phone (${width}px wide)`);
  check(!(await page.getByText(/We use cookies/).isVisible()), 'no cookie banner over it');
  await page.screenshot({ path: `${OUT}1-support.png`, fullPage: true });
  await nav.getByText('Privacy Policy').click();
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' }), 15000) && path(page) === '/privacy', 'its Privacy link opens the policy');
  await ctx.close();

  ({ ctx, page } = await open('/support', { colorScheme: 'dark' }));
  await page.getByRole('heading', { name: 'Help & Support' }).waitFor({ timeout: 15000 });
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('main').parentElement).backgroundColor);
  check(bg === 'rgb(25, 25, 25)', `dark mode follows the phone (${bg})`);
  await page.screenshot({ path: `${OUT}2-support-dark.png` });
  await ctx.close();

  log('== /privacy and /terms');
  ({ ctx, page } = await open('/privacy'));
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' }), 15000) && await appears(page.getByText(/Document version: privacy-v/)),
    '/privacy opens the Privacy Policy');
  await page.getByRole('button', { name: 'Back' }).click();
  check(await appears(page.getByRole('button', { name: 'Sign in' }).first()) && path(page) === '/', `Back goes to the home page (${path(page)})`);
  await page.goto(`${BASE}/terms/`);
  check(await appears(page.getByRole('heading', { name: 'Terms of Service' }), 15000) && await appears(page.getByText(/Document version: terms-v/)),
    '/terms opens the Terms (with or without a slash at the end)');
  await page.getByRole('button', { name: 'Back' }).click();
  check(await appears(page.getByRole('button', { name: 'Sign in' }).first()) && path(page) === '/', 'and back home');
  await page.goto(`${BASE}/#privacy`);
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' }), 15000), '#privacy still opens the policy');
  await ctx.close();

  log('== Settings and the Help Center (website)');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  page = await signIn(ctx);
  await settings(page);
  check(await page.getByText(`Shaadi24 • v${VERSION}`).isVisible(), `the version is package.json's (${VERSION})`);
  const mail = page.getByRole('link', { name: /Contact support/ });
  check(/^mailto:support@shaadi24\.com\?subject=/.test(await mail.getAttribute('href') || ''), 'Contact support writes an email');
  await page.getByRole('button', { name: 'Terms of Service' }).click();
  check(await appears(page.getByRole('heading', { name: 'Terms of Service' })), 'Terms of Service opens');
  await page.getByRole('button', { name: 'Back' }).click();
  await settings(page);
  await page.getByRole('button', { name: 'Privacy Policy' }).click();
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' })), 'Privacy Policy opens');
  await page.getByRole('button', { name: 'Back' }).click();
  await settings(page);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: /Download my data/ }).click(),
  ]);
  const name = download.suggestedFilename();
  const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  check(/^shaadi24-my-data-\d{4}-\d{2}-\d{2}\.json$/.test(name), `Download my data saves a file (${name})`);
  check(!!data.export_metadata?.format_version && JSON.stringify(data).includes(EMAIL), `with the account's data (format ${data.export_metadata?.format_version})`);
  check(await appears(page.getByText('Your data is saved.')), 'and says so');
  await page.screenshot({ path: `${OUT}3-settings.png`, fullPage: true });

  await page.getByRole('button', { name: 'Help Center' }).click();
  await page.getByRole('heading', { name: 'Help Center' }).waitFor();
  check(/^mailto:support@shaadi24\.com/.test(await page.getByRole('link', { name: 'Contact Support' }).getAttribute('href') || ''),
    'the Help Center\'s Contact Support writes an email');
  await page.getByRole('button', { name: 'How do I report or block someone?' }).click();
  check(await appears(page.getByText(/We review every report within 24 hours/)), 'its questions open to their answers');
  check(!(await page.getByText(/voice intro|Brooklyn|travel mode/).isVisible()), 'nothing the app doesn\'t do');
  await page.getByRole('button', { name: 'My data, and deleting my account' }).click();
  check(await page.locator('a[href="/delete-account"]').count() === 1, 'on the website it links to the Delete account page');
  await page.screenshot({ path: `${OUT}4-help-center.png`, fullPage: true });
  await ctx.close();

  log('== Download my data in the Android app');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript({ content: ANDROID });
  await ctx.addInitScript({ path: ANDROID_BRIDGE });
  page = await signIn(ctx);
  await settings(page);
  await page.getByRole('button', { name: /Download my data/ }).click();
  check(await appears(page.getByText('Your data is saved.'), 15000), 'the app says it\'s saved');
  const calls = await page.evaluate(() => window.__native.filter((c) => ['Filesystem', 'Share'].includes(c.pluginId)));
  const write = calls.find((c) => c.methodName === 'writeFile');
  const share = calls.find((c) => c.methodName === 'share');
  let written = {};
  try { written = JSON.parse(write?.options.data || '{}'); } catch { /* checked below */ }
  check(/^shaadi24-my-data-.*\.json$/.test(write?.options.path || '') && write.options.directory === 'CACHE'
    && JSON.stringify(written).includes(EMAIL), 'the file is written to the app\'s cache');
  check(share?.options.files?.[0] === `file:///data/user/0/com.shaadi24.app/cache/${write?.options.path}`, 'and handed to the share sheet');

  await page.getByRole('button', { name: 'Help Center' }).click();
  await page.getByRole('heading', { name: 'Help Center' }).waitFor();
  for (const q of ['How do I cancel Shaadi24+?', 'Can I get a refund?', 'My data, and deleting my account']) {
    await page.getByRole('button', { name: q }).click();
  }
  const help = await page.locator('main').innerText();
  check(/Google Play/.test(help) && !/App Store|iPhone|Apple refunds|website|Razorpay/.test(help),
    'the Android app\'s Help Center names only Google Play');
  check(await page.locator('main a[href^="/"]').count() === 0, 'and has no links out to the website\'s pages');
  await page.screenshot({ path: `${OUT}5-android-help.png`, fullPage: true });
  await ctx.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
