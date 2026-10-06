// Email sign-up with "Confirm email" ON (local stack configured for it; emails land
// in Mailpit): sign up → code screen → code from the email → verified → the
// consent screen, which keeps the Terms and emails answered on the sign-up form
// and asks only the declarations → step 1.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { agreeToTerms } from './fixtures.mjs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const OUT = new URL('./.shots/shots-confirm/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const email = `confirm_${Date.now()}@shaadigpt.dev`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function codeFromEmail() {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages = [] } = await r.json();
    if (messages.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const code = (m.Text || m.HTML || '').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('no code email arrived');
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
let ok = false;
try {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Create Account/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.getByPlaceholder('At least 8 characters').fill('TestPass!2026');
  await page.locator('input[type=checkbox]').nth(0).check();   // Terms
  await page.locator('input[type=checkbox]').nth(1).check();   // marketing opt-in
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click();
  await page.getByText('Check your inbox').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}1-code-screen.png` });
  const code = await codeFromEmail();
  log('code from email:', code);
  await page.getByPlaceholder('000000').fill(code);
  await page.getByRole('button', { name: /Verify Email/ }).click();
  await page.getByTestId('consent-terms-done').waitFor({ timeout: 15000 });
  if (!(await page.getByTestId('consent-marketing').isChecked())) throw new Error('the emails answer from the form was lost');
  await agreeToTerms(page);
  await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}2-step1.png` });
  const row = execSync(`docker exec ${DB} psql -U postgres -At -c "select p.terms_accepted_at is not null, p.marketing_consent, (select count(*) from public.consent_records c where c.user_id = p.id and c.event_type <> 'cookies_updated') from public.profiles p join auth.users u on u.id = p.id where u.email = '${email}'"`).toString().trim();
  log('terms recorded | marketing opt-in | consent rows:', row);
  if (row !== 't|t|6') throw new Error(`consent not recorded as expected: ${row}`);
  ok = true;
  log('PASS');
} catch (e) {
  log('FAIL', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  await browser.close();
  process.exit(ok ? 0 : 1);
}
