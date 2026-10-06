// The website, where members are sent to the apps (lib/website.ts,
// components/website/), against a dev server WITHOUT VITE_MEMBERS_ON_WEB
// (BASE_URL, default http://localhost:3002) and the local stack:
//  1. The home page: what Shaadi24 is, the store badges, the footer's pages;
//     no member sign-in, no search box, no cookie banner; at phone width in
//     dark mode nothing is wider than the screen
//  2. Terms and Privacy at /terms, /privacy and #privacy, back to the home page;
//     /support with the store badges
//  3. /admin: a sign-in for Shaadi24's team (no sign-up). A member who signs
//     in is told Shaadi24 is used in the app; an admin gets the admin panel,
//     with browser alerts and signing out
//  4. Admin alerts: one that opens the site (/?push=…) goes to its admin tab,
//     and so does one clicked while a page of the website is open
//  5. A member signed in on the website (an email link) sees who they are and
//     can delete the account from the home page
//  6. A password-reset link asks for the new password on the website
// Usage: node website.mjs <admin email> <member email>   (password TestPass!2026;
//   SERVICE_ROLE_KEY, DB_CONTAINER as the other tests; makes and deletes two accounts)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3002';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY || '';
const ANON = process.env.ANON_KEY || '';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER || !SERVICE || !ANON) {
  console.error('usage: SERVICE_ROLE_KEY=… ANON_KEY=… node website.mjs <admin email> <member email>');
  process.exit(2);
}
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/website/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const adminTabOpen = (page, tab, ms = 15000) => page.waitForFunction((t) => [...document.querySelectorAll('button')]
  .some((b) => b.textContent.trim() === t && b.className.includes('border-blue-500')), tab, { timeout: ms }).then(() => true, () => false);

const admin = (path, init = {}) => fetch(`${API}/auth/v1/admin/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
}).then((r) => r.json());
async function newAccount(tag) {
  const email = `website_${tag}_${Date.now()}@shaadigpt.dev`;
  const user = await admin('users', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) });
  sql(`update profiles set name = 'Website ${tag}', onboarding_complete = true, terms_accepted_at = now(), privacy_accepted_at = now()
       where id = '${user.id}';`);
  return { email, id: user.id };
}
const passwordWorks = async (email, password) => (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
}).then((r) => r.json())).access_token !== undefined;

async function adminSignIn(page, email) {
  await page.goto(`${BASE}/admin`);
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const made = [];
try {
  log('1. The home page');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  check(await appears(page.getByRole('heading', { name: "Find the person you'll marry, in your own words" })), 'the headline');
  check(await page.getByText('Google Play', { exact: true }).isVisible() && await page.getByText('App Store', { exact: true }).isVisible(),
    'Google Play and App Store badges');
  check(await page.getByText('Coming soon to').count() === 2, '"Coming soon" until the store addresses are set');
  check(await page.getByRole('heading', { level: 2 }).count() === 4, 'what Shaadi24 does, in four parts');
  const footer = await page.getByRole('navigation', { name: 'About Shaadi24' }).locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check(['/support', '/privacy', '/terms', '/delete-account', '/admin'].every((h) => footer.includes(h)), `the footer's pages (${footer.join(' ')})`);
  check(await page.getByRole('button', { name: /Sign in|Create Account/ }).count() === 0
    && await page.getByPlaceholder(/Describe your ideal match/).count() === 0, 'no member sign-in and no search box');
  await page.waitForTimeout(1500);
  check(!(await page.getByText('We respect your privacy').isVisible().catch(() => false)), 'no cookie banner');
  await page.screenshot({ path: `${OUT}1-home.png`, fullPage: true });
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('heading', { level: 1 }).waitFor();
  check(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark mode follows the phone');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `nothing wider than a phone's screen (${overflow}px)`);
  await page.screenshot({ path: `${OUT}2-home-phone-dark.png`, fullPage: true });
  await ctx.close();

  log('2. Terms, Privacy and Support');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/terms`);
  check(await appears(page.getByRole('heading', { name: 'Terms of Service' })), '/terms');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('heading', { level: 1, name: /Find the person/ }).waitFor();
  check(new URL(page.url()).pathname === '/', 'Back goes to the home page');
  await page.goto(`${BASE}/privacy`);
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' })), '/privacy');
  await page.goto(`${BASE}/#privacy`);
  check(await appears(page.getByRole('heading', { name: 'Privacy Policy' })), '#privacy (older links)');
  await page.goto(`${BASE}/support`);
  check(await appears(page.getByRole('heading', { name: 'Help & Support' })) && await page.getByText('Google Play', { exact: true }).isVisible(),
    '/support, with the store badges');
  check(await page.getByText(/on Android and iPhone/).isVisible(), 'it says Shaadi24 is on Android and iPhone');
  await ctx.close();

  log('3. /admin');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  check(await appears(page.getByText('Admin sign-in')) && await page.getByText(/For Shaadi24's team/).isVisible(), 'a sign-in for the team');
  check(await page.getByRole('button', { name: /Create Account/ }).count() === 0, 'no sign-up');
  await page.screenshot({ path: `${OUT}3-admin-sign-in.png` });
  await adminSignIn(page, MEMBER);
  check(await appears(page.getByTestId('not-an-admin')), 'a member: "Shaadi24 is used in the app"');
  check(await appears(page.getByTestId('not-an-admin').getByText('Google Play', { exact: true })), 'with the store badges');
  check(await page.getByText('Total Users').count() === 0, 'and no admin panel');
  await page.screenshot({ path: `${OUT}4-member-at-admin.png` });

  log('5. A member signed in on the website');
  await page.goto(BASE);
  const banner = page.getByTestId('site-signed-in');
  check(await appears(banner) && (await banner.innerText()).includes(MEMBER) && /used in the app/.test(await banner.innerText()),
    'the home page says who is signed in, and that Shaadi24 is used in the app');
  check(await appears(banner.getByRole('button', { name: 'Delete this account' })), 'a member can delete the account here');
  await banner.getByRole('button', { name: 'Sign out' }).click();
  check(await banner.waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false), 'signing out');
  await ctx.close();

  const leaving = await newAccount('delete');
  made.push(leaving.id);
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await adminSignIn(page, leaving.email);
  await page.getByTestId('not-an-admin').waitFor({ timeout: 15000 });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Delete this account' }).click();
  const form = page.getByTestId('site-delete-account');
  check(await form.getByRole('button', { name: 'Delete my account' }).isDisabled(), 'deleting waits for "Delete" to be typed');
  await form.getByLabel('Type Delete to confirm').fill('Delete');
  await form.getByRole('button', { name: 'Delete my account' }).click();
  check(await appears(page.getByTestId('site-account-deleted'), 20000), '"Your Shaadi24 account is deleted."');
  check(sql(`select count(*) from auth.users where id = '${leaving.id}';`) === '0', 'the account is gone');
  await page.screenshot({ path: `${OUT}5-deleted.png` });
  await ctx.close();

  log('3b. /admin as an admin');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await adminSignIn(page, ADMIN);
  check(await adminTabOpen(page, 'dashboard', 20000), 'the admin panel');
  check(await page.getByText(ADMIN).isVisible(), "the admin's email in the header");
  await page.getByRole('button', { name: 'Alerts' }).click();
  check(await appears(page.getByTestId('admin-alerts-setup').getByText('Alerts in this browser')), 'Alerts: a switch for alerts in this browser');
  await page.screenshot({ path: `${OUT}6-admin-panel.png` });

  log('4. Admin alerts');
  const push = (tab) => encodeURIComponent(JSON.stringify({ event_type: `admin_${tab === 'reports' ? 'report' : 'verification'}`, admin_tab: tab }));
  await page.goto(`${BASE}/?push=${push('reports')}`);
  check(await adminTabOpen(page, 'reports', 20000), 'one that opened the site opens Admin → Reports');
  check(new URL(page.url()).pathname === '/admin' && !page.url().includes('push='), `on /admin, the address tidied (${page.url()})`);
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
    data: { type: 'push_click', data: { event_type: 'admin_verification', admin_tab: 'verifications' } },
  })));
  check(await adminTabOpen(page, 'verifications'), 'one clicked with the panel open opens Admin → Verifications');
  await page.goto(BASE);
  check(await appears(page.getByTestId('site-signed-in').getByRole('link', { name: 'Admin panel' }))
    && await page.getByRole('button', { name: 'Delete this account' }).count() === 0, 'on the home page: a link to the panel, no deleting');
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
    data: { type: 'push_click', data: { event_type: 'admin_report', admin_tab: 'reports' } },
  })));
  check(await adminTabOpen(page, 'reports', 20000), 'one clicked on the home page goes to Admin → Reports');
  await page.getByRole('button', { name: 'Sign out' }).click();
  check(await appears(page.getByText('Admin sign-in')), 'signing out of the panel');
  await ctx.close();

  log('6. A password-reset link');
  const resetting = await newAccount('reset');
  made.push(resetting.id);
  const link = await admin('generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email: resetting.email }) });
  // The link signs in and comes back with the session in the address; it's
  // sent to the website here (the local sign-in returns to the members' app)
  const landed = new URL((await fetch(link.action_link, { redirect: 'manual' })).headers.get('location') ?? '');
  const target = `${BASE}/${landed.search}${landed.hash}`;
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(target);
  check(await appears(page.getByRole('heading', { name: 'Set a new password' }), 15000), 'the link asks for a new password');
  const fields = page.locator('input[type=password]');
  await fields.nth(0).fill('NewPass!2026');
  await fields.nth(1).fill('NewPass!2026');
  await page.getByRole('button', { name: 'Save new password' }).click();
  check(await appears(page.getByTestId('site-signed-in'), 15000), 'saved: the home page, signed in');
  check(await passwordWorks(resetting.email, 'NewPass!2026') && !(await passwordWorks(resetting.email, PASSWORD)), 'the new password works, the old one not');
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  for (const id of made) sql(`delete from auth.users where id = '${id}';`);
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
