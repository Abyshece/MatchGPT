// The website's account-deletion page (/delete-account; Google Play asks for
// one), in Chromium at phone width against the local stack:
//   - says what's deleted and kept, and how to do it in the app
//   - an address without an account gets the same answer and no email
//   - a code by email (supabase/templates/magic_link.html); a wrong code is
//     refused; "Delete" must be typed; the account is deleted by the real
//     delete-account function; the page keeps no session in the browser
//   - an account made with Google or Apple (no password) can use it too
//   - an App Store subscription that would renew: the page says to cancel it
// Usage: SERVICE_ROLE_KEY=… node delete-account-page.mjs   (MAILPIT_URL, BASE_URL, DB_CONTAINER)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is required'); process.exit(2); }
const OUT = new URL('./.shots/delete-page/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const j = (r) => r.json().catch(() => ({}));
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const admin = (path, init = {}) => fetch(`${SUPABASE}/auth/v1/admin/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
});
async function newAccount(label, withPassword = true) {
  const email = `${label}_${Date.now()}@example.com`;
  const u = await admin('users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true, ...(withPassword ? { password: 'TestPass!2026' } : {}) }) }).then(j);
  return { id: u.id, email };
}
const exists = async (id) => (await admin(`users/${id}`)).status === 200;
const mails = async (email) => (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(j)).messages ?? [];
async function codeFor(email) {
  for (let i = 0; i < 40; i++) {
    const list = await mails(email);
    if (list.length) {
      const m = await fetch(`${MAILPIT}/api/v1/message/${list[0].ID}`).then(j);
      return { subject: m.Subject, code: (m.Text || '').match(/\b(\d{6,10})\b/)?.[1] };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {};
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

async function open(colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(`${BASE}/delete-account`);
  await page.getByRole('heading', { name: 'Delete your MatchGPT account' }).waitFor({ timeout: 15000 });
  return { ctx, page };
}

async function deleteThrough(page, email, { wrongCodeFirst = false } = {}) {
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByTestId('delete-step-code').waitFor();
  const { subject, code } = await codeFor(email);
  if (wrongCodeFirst) {
    await page.getByPlaceholder('123456').fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    check(await appears(page.getByText("That code isn't right or has expired. Check the email, or send a new code.")), 'a wrong code is refused');
  }
  await page.getByPlaceholder('123456').fill(code || '');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByTestId('delete-step-confirm').waitFor({ timeout: 10000 });
  return { subject, code };
}

try {
  log('== The page');
  let { ctx, page } = await open();
  const text = await page.locator('main').innerText();
  check(/Settings → Delete Account/.test(text), 'says how to do it in the app');
  check(/What's deleted:/.test(text) && /What's kept:/.test(text) && /up to 7 years/.test(text) && /within 30 days/.test(text),
    'says what\'s deleted and what\'s kept');
  check(/apps\.apple\.com\/account\/subscriptions/.test(text), 'says App Store subscriptions are cancelled by the person');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, `fits a phone (${width}px wide)`);
  check(!(await page.getByText(/We use cookies/).isVisible()), 'no cookie banner over it');
  await page.screenshot({ path: `${OUT}1-page.png`, fullPage: true });

  log('== An address without an account');
  const nobody = `nobody_${Date.now()}@example.com`;
  await page.getByPlaceholder('you@example.com').fill(nobody);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  check(await appears(page.getByText(`If MatchGPT has an account for`)) && await page.getByText(nobody).isVisible(),
    'the same answer, so nobody learns who has an account');
  await page.waitForTimeout(1500);
  check((await mails(nobody)).length === 0, '…and no email is sent');
  await ctx.close();

  log('== Deleting an account with a password');
  const a = await newAccount('del_page');
  ({ ctx, page } = await open());
  const { subject } = await deleteThrough(page, a.email, { wrongCodeFirst: true });
  check(subject === 'Your MatchGPT code', `the email has the code (${subject})`);
  check(await page.getByText(`Signed in as ${a.email}.`).isVisible(), 'signed in with the code');
  const del = page.getByRole('button', { name: 'Delete my account permanently' });
  check(await del.isDisabled(), '"Delete" must be typed first');
  await page.getByPlaceholder('Delete').fill('Delete');
  await page.screenshot({ path: `${OUT}2-confirm.png` });
  await del.click();
  check(await appears(page.getByText('Your account has been deleted.'), 15000), 'deleted');
  check(!(await page.getByText(/App Store subscription is still on/).isVisible()), 'no App Store note without one');
  check(!(await exists(a.id)), 'the account is gone');
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')));
  check(stored.length === 0, 'the page kept no session in the browser');
  await page.screenshot({ path: `${OUT}3-done.png` });
  await ctx.close();

  log('== An account made with Google or Apple (no password), with an App Store subscription');
  const b = await newAccount('del_page_apple', false);
  sql(`insert into subscriptions (user_id, provider, store_subscription_id, store_product_id, plan_id, mode, status, current_start, current_end, auto_renew)
       values ('${b.id}', 'app_store', 'orig-${Date.now()}', 'matchgpt_plus_monthly', 'monthly', 'test', 'active', now(), now() + interval '20 days', true);`);
  ({ ctx, page } = await open('dark'));
  await deleteThrough(page, b.email);
  await page.getByPlaceholder('Delete').fill('Delete');
  await page.getByRole('button', { name: 'Delete my account permanently' }).click();
  check(await appears(page.getByText('Your account has been deleted.'), 15000) && !(await exists(b.id)), 'an account without a password is deleted too');
  check(await page.getByText(/Your App Store subscription is still on/).isVisible(), 'and is told to cancel the App Store subscription');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('main').parentElement).backgroundColor);
  check(bg === 'rgb(25, 25, 25)', `dark mode follows the phone (${bg})`);
  await page.screenshot({ path: `${OUT}4-dark-app-store.png` });
  await ctx.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
