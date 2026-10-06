// Error reports (lib/errorReports.ts, migration …_phase10_error_reports), against the local stack:
//  1. The members' app (BASE_URL, with VITE_MEMBERS_ON_WEB=true), signed out:
//     an uncaught error and a failed promise are reported once each, with
//     emails, phone numbers and ids blanked out, the screen, the app version
//     and the browser, sent with the public key; noise (a dropped network,
//     ResizeObserver) isn't reported; a loop of errors sends no more than 10
//  2. The same error after a reload adds up on one row
//  3. Signed in: the tab people were on, and still the public key, never the
//     member's sign-in; a screen that fails to draw shows "Something went
//     wrong" and is reported
//  4. The Android app (bridge stand-in, as android-app.mjs): reported as Android
//  5. The website (WEBSITE_URL): reported as the website, with its page
//  6. Admin → Errors on the website: each error once with how often; its stack
//     opens; Mark fixed hides it (in the audit log) and "Show the ones marked
//     fixed" shows it again
// It empties the local error_reports table first, after listing what the
// tests before it left there (errors the app really hit).
// Usage: ANON_KEY=… node error-reports.mjs <admin email> <member email>
//   (onboarded, password TestPass!2026; DB_CONTAINER, BASE_URL, WEBSITE_URL, REPO_ROOT)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WEBSITE = process.env.WEBSITE_URL || 'http://localhost:3002';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const ANON = (process.env.ANON_KEY || '').trim();
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER || !ANON) { console.error('usage: ANON_KEY=… node error-reports.mjs <admin email> <member email>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const VERSION = JSON.parse(fs.readFileSync(`${REPO}/package.json`, 'utf8')).version;
const OUT = new URL('./.shots/error-reports/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => `'${s.replace(/'/g, "''")}'`;
const rows = (where = 'true') => JSON.parse(sql(`select coalesce(json_agg(e order by e.id), '[]') from error_reports e where ${where};`));
async function rowFor(message, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await pause(250)) {
    const [row] = rows(`message = ${quote(message)}`);
    if (row) return row;
  }
  return null;
}

// What the tests before this one ran into
const earlier = sql(`select platform || ' ' || coalesce(screen, '-') || ' (' || times || 'x): ' || left(message, 140)
                       from error_reports order by last_seen_at desc limit 25;`);
log(earlier ? `errors reported before this test:\n${earlier}` : 'no errors reported before this test');
sql(`delete from error_reports;`);

// What the Android app's native side provides (as android-app.mjs)
const STANDIN = `
  window.androidBridge = { postMessage(json) {
    const call = JSON.parse(json);
    if (call.pluginId === 'Console' || call.type === 'js.error' || call.callbackId === '-1' || call.methodName === 'addListener') return;
    setTimeout(() => window.Capacitor.fromNative({ callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data: {} }));
  } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'minimizeApp', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
  ] };`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let current = null;
async function open(url, { android = false, viewport = { width: 412, height: 915 }, colorScheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  if (android) {
    await ctx.addInitScript({ content: STANDIN });
    await ctx.addInitScript({ path: BRIDGE });
  }
  const page = await ctx.newPage();
  page.sent = [];  // the reports this page sent
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/rpc/report_error')) page.sent.push({ auth: r.headers().authorization, apikey: r.headers().apikey, body: r.postDataJSON() });
  });
  current = page;
  if (url) await page.goto(url);
  return page;
}
// Thrown outside any handler, as a bug in a click or a timer would be
const throwLater = (page, message, name = 'Error') => page.evaluate(([m, n]) => {
  setTimeout(() => { const e = new (window[n] || Error)(m); throw e; });
}, [message, name]);
const rejectLater = (page, message, name = 'Error') => page.evaluate(([m, n]) => { Promise.reject(new (window[n] || Error)(m)); }, [message, name]);
const sentWith = (page, message) => page.sent.filter((s) => s.body?.p_message === message);
// The page's requests arrive while the test waits, not during a database query
async function sentOnce(page, message) {
  for (const end = Date.now() + 5000; Date.now() < end && !sentWith(page, message).length; await pause(100));
  return sentWith(page, message)[0];
}

try {
  log('1. The members\' app, signed out');
  let page = await open(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().waitFor({ timeout: 20000 });
  await pause(1500);
  const ownErrors = page.sent.map((s) => s.body?.p_message);
  check(ownErrors.length === 0, `the app reports nothing of its own while it starts${ownErrors.length ? `: ${ownErrors.join(' | ')}` : ''}`);

  const BOOM = "Test: couldn't draw the card for priya.sharma@example.com, +91 98765 43210, profile 3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab";
  const BOOM_SENT = "Test: couldn't draw the card for [email], [number], profile [id]";
  await throwLater(page, BOOM);
  let row = await rowFor(BOOM_SENT);
  check(row !== null, 'an uncaught error is reported, with the email, phone number and id blanked out');
  check(row && !/priya|98765|3f2b8c1e/.test(`${row.message} ${row.stack}`) && row.stack?.includes('[email]'), 'its stack is blanked out too');
  check(row?.platform === 'web' && row?.screen === 'landing' && row?.app_version === VERSION && /Chrome/.test(row?.user_agent ?? ''),
    `with the platform (${row?.platform}), screen (${row?.screen}), app version (${row?.app_version}) and browser`);
  const first = await sentOnce(page, BOOM_SENT);
  check(first?.auth === `Bearer ${ANON}` && first?.apikey === ANON, 'sent with the public key');
  check(row && Object.keys(row).every((k) => ['id', 'fingerprint', 'day', 'first_seen_at', 'last_seen_at', 'times', 'platform', 'app_version',
    'screen', 'message', 'stack', 'user_agent', 'fixed_at'].includes(k)), 'nothing in the row says who (no account, no address)');

  await rejectLater(page, 'Test: a promise nobody waited for', 'TypeError');
  check(await rowFor('TypeError: Test: a promise nobody waited for') !== null, 'a failed promise nobody handled is reported, with its kind');

  await throwLater(page, 'ResizeObserver loop completed with undelivered notifications.');
  await rejectLater(page, 'Failed to fetch', 'TypeError');
  await rejectLater(page, 'The operation was aborted.', 'AbortError');
  await throwLater(page, BOOM);
  await pause(1500);
  check(rows(`message ~ '(ResizeObserver|Failed to fetch|aborted)'`).length === 0, 'noise isn\'t reported (ResizeObserver, a dropped network, a cancelled request)');
  check(sentWith(page, BOOM_SENT).length === 1, 'the same error twice on one page is sent once');

  for (let i = 1; i <= 12; i++) await throwLater(page, `Test: loop ${i}`);
  await pause(2000);
  check(page.sent.length === 10 && rows(`message like 'Test: loop %'`).length === 8, `a loop of errors sends no more than 10 from a page (${page.sent.length} sent)`);

  log('2. The same error after a reload');
  await page.reload();
  await page.getByRole('button', { name: 'Sign in' }).first().waitFor({ timeout: 20000 });
  await throwLater(page, BOOM);
  await pause(1500);
  const same = rows(`message = ${quote(BOOM_SENT)}`);
  check(same.length === 1 && same[0].times === 2, `it adds up on one row (${same.length} row, ${same[0]?.times} times)`);
  await page.context().close();

  log('3. Signed in');
  sql(`update profiles set is_paused = false where email = '${MEMBER}';`);
  page = await open(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(MEMBER);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 20000 });
  const menu = async (label) => {
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
    await pause(800);
  };
  await menu('Matches');
  await throwLater(page, 'Test: on the Matches tab');
  row = await rowFor('Test: on the Matches tab');
  check(row?.screen === 'matches', `the tab people were on (${row?.screen})`);
  const memberToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
  });
  const signedIn = await sentOnce(page, 'Test: on the Matches tab');
  check(memberToken && signedIn?.auth === `Bearer ${ANON}` && !JSON.stringify(signedIn).includes(memberToken),
    'signed in, it still goes with the public key, never the member\'s sign-in');

  // A screen whose code fails: lazyScreen doesn't reload (it just did), so the error screen shows
  await page.route(/\/components\/HelpCenter\.tsx/, (r) => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("Test: the Help Center failed to draw");' }));
  await page.evaluate(() => sessionStorage.setItem('matchgpt_reloaded_for_update', String(Date.now())));
  await menu('Settings');
  await page.getByRole('button', { name: 'Help Center' }).click();
  check(await appears(page.getByRole('heading', { name: 'Something went wrong' })), 'a screen that fails shows "Something went wrong"');
  row = await rowFor('Test: the Help Center failed to draw');
  check(row?.screen === 'help', `and is reported, with the screen (${row?.screen})`);
  await page.screenshot({ path: `${OUT}1-something-went-wrong.png` });
  await page.context().close();

  log('4. The Android app');
  page = await open(BASE, { android: true });
  await page.getByRole('button', { name: 'Sign in' }).first().waitFor({ timeout: 20000 });
  await throwLater(page, 'Test: from the Android app');
  row = await rowFor('Test: from the Android app');
  check(row?.platform === 'android' && row?.screen === 'landing', `reported as Android (${row?.platform}, on ${row?.screen})`);
  await page.context().close();

  log('5. The website');
  page = await open(WEBSITE);
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 20000 });
  await throwLater(page, 'Test: from the website');
  row = await rowFor('Test: from the website');
  check(row?.platform === 'web' && row?.screen === 'website home', `reported as the website, with its page (${row?.screen})`);
  await page.context().close();

  log('6. Admin → Errors');
  const waiting = Number(sql(`select count(distinct fingerprint) from error_reports where fixed_at is null;`));
  page = await open(`${WEBSITE}/admin`, { viewport: { width: 1280, height: 900 } });
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(ADMIN);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByText('Admin Panel').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^errors$/i }).click();
  await page.getByTestId('admin-error').first().waitFor({ timeout: 15000 });
  check(await page.getByTestId('admin-error').count() === waiting, `each error once (${await page.getByTestId('admin-error').count()} of ${waiting})`);
  const item = page.getByTestId('admin-error').filter({ hasText: BOOM_SENT });
  check(await item.getByText('2 times').isVisible(), 'with how often it happened ("2 times")');
  check(await item.getByText(`Website ${VERSION}`).isVisible() && await item.getByText('on landing').isVisible(), 'where and on which version');
  await item.getByRole('button', { name: new RegExp(BOOM_SENT.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  check(await appears(item.locator('pre')) && (await item.locator('pre').textContent()).includes('[email]'), 'its stack opens');
  await page.screenshot({ path: `${OUT}2-admin-errors.png` });

  const audited = Number(sql(`select count(*) from admin_audit where action = 'mark_error_fixed';`));
  await item.getByRole('button', { name: 'Mark fixed' }).click();
  check(await appears(page.getByText('Marked fixed. It comes back if it happens again.')), 'Mark fixed says it comes back if it happens again');
  await pause(1000);
  check(await page.getByTestId('admin-error').filter({ hasText: BOOM_SENT }).count() === 0
    && await page.getByTestId('admin-error').count() === waiting - 1, 'and it leaves the list');
  check(Number(sql(`select count(*) from admin_audit where action = 'mark_error_fixed';`)) === audited + 1
    && rows(`message = ${quote(BOOM_SENT)} and fixed_at is not null`).length === 1, 'in the audit log, and marked in the database');
  await page.getByLabel('Show the ones marked fixed').check();
  await page.getByTestId('admin-error').filter({ hasText: BOOM_SENT }).first().waitFor({ timeout: 10000 });
  check(await page.getByTestId('admin-error').filter({ hasText: BOOM_SENT }).getByText('marked fixed').isVisible()
    && await page.getByTestId('admin-error').count() === waiting, '"Show the ones marked fixed" shows it again, marked fixed');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.getByText('Admin Panel').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^errors$/i }).click();
  await page.getByTestId('admin-error').first().waitFor({ timeout: 15000 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'at phone width nothing is wider than the screen');
  await page.screenshot({ path: `${OUT}3-admin-errors-phone-dark.png`, fullPage: true });
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await current?.screenshot({ path: `${OUT}FAILED.png` }).catch(() => {});
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
