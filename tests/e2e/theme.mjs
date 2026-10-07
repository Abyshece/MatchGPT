// Light or dark (App.tsx, Settings → Appearance): the app follows the phone
// until a member picks Light or Dark.
//  1. Signed out, the phone decides, even with a pick left on the phone by an
//     account; when the phone switches, the app does too, without a tap
//  2. Signed in on Automatic (the default), the phone decides
//  3. Settings → Appearance: Automatic first and chosen; Dark shows at once,
//     is kept on the account and opens dark next time, whatever the phone
//  4. Signed out after picking Dark: the phone decides again
//  5. Signed in again, the account's Dark is back; Automatic follows the phone
// Usage: node theme.mjs <email>   (an onboarded account, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
if (!EMAIL) { console.error('usage: node theme.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/theme/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from auth.users where email = '${EMAIL}';`);
sql(`update profiles set settings_theme = 'system', is_paused = false, ${CONSENTED} where id = '${me}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light' });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
const phone = async (colorScheme) => { await page.emulateMedia({ colorScheme }); await page.waitForTimeout(400); };
const choice = (name) => page.getByRole('button', { name, exact: true });

async function signIn() {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
}
async function openSettings() {
  await page.getByText('Settings', { exact: true }).first().click();
  await choice('Automatic').waitFor({ timeout: 10000 });
}
async function signOut() {
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}
const saved = () => sql(`select settings_theme from profiles where id = '${me}';`);

try {
  log('1. Signed out: the phone decides');
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('shaadigpt_theme_mode', 'dark'));  // left by an account
  await page.reload();
  await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  check(!(await dark()), 'phone light: the welcome screen is light, though an account had picked Dark');
  await page.screenshot({ path: `${OUT}1-welcome-light.png` });
  await phone('dark');
  check(await dark(), 'the phone turns dark: so does the welcome screen, without a tap');
  await page.screenshot({ path: `${OUT}2-welcome-dark.png` });
  await phone('light');
  check(!(await dark()), '... and light again with the phone');

  log('2. Signed in on Automatic: the phone decides');
  await signIn();
  check(!(await dark()), 'Automatic, phone light: light');
  await phone('dark');
  check(await dark(), 'Automatic: dark as soon as the phone is, without a tap');
  await phone('light');
  check(!(await dark()), 'Automatic: light again with the phone');

  log('3. Settings → Appearance');
  await openSettings();
  const order = (await page.locator('button[aria-pressed]').allInnerTexts())
    .map((t) => t.replace(/[^A-Za-z]+/g, ' ').trim()).filter((t) => ['Automatic', 'Light', 'Dark'].includes(t));
  check(order.join(',') === 'Automatic,Light,Dark', `Automatic first, then Light and Dark (${order.join(', ')})`);
  check(await choice('Automatic').getAttribute('aria-pressed') === 'true', 'Automatic is chosen');
  check(await page.getByText("Follows your phone's light or dark mode.").isVisible(), 'it says it follows the phone');
  await page.screenshot({ path: `${OUT}3-settings-automatic.png` });
  await choice('Dark').click();
  await page.waitForTimeout(300);
  check(await dark(), 'Dark: dark at once, though the phone is light');
  await page.waitForTimeout(1500);
  check(saved() === 'dark', `Dark is kept on the account (${saved()})`);
  check(await choice('Dark').getAttribute('aria-pressed') === 'true', 'Dark is shown as chosen');
  await page.screenshot({ path: `${OUT}4-settings-dark.png` });
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  check(await dark(), 'reopened: dark straight away');
  await phone('dark');
  await phone('light');
  check(await dark(), 'the phone switching doesn\'t undo the pick');

  log('4. Signed out after picking Dark: the phone decides again');
  await openSettings();
  await signOut();
  check(!(await dark()), 'signed out, phone light: light');
  await page.screenshot({ path: `${OUT}5-signed-out.png` });

  log('5. The account keeps its pick; Automatic follows the phone again');
  await signIn();
  check(await dark(), 'signed in again: the account\'s Dark is back');
  await openSettings();
  await choice('Automatic').click();
  await page.waitForTimeout(300);
  check(!(await dark()), 'Automatic: light at once, as the phone is');
  await page.waitForTimeout(1500);
  check(saved() === 'system', `Automatic is kept on the account (${saved()})`);
  await phone('dark');
  check(await dark(), 'and dark with the phone');
  await phone('light');
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` }).catch(() => {});
} finally {
  sql(`update profiles set settings_theme = 'system' where id = '${me}';`);
  await browser.close();
}
log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
