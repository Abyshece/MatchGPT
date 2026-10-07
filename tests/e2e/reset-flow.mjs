// Forgot password on the website, by the email's link: request a reset → link
// from the email (Mailpit) → "Set a new password" screen → save → log out → log
// in with the new password (old one fails). The code in the same email is
// tested by reset-code-flow.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { PRIVACY_VERSION, TERMS_VERSION } from './fixtures.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const SERVICE = process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';  // local CLI default
const OUT = new URL('./.shots/shots-reset/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const email = `reset_${Date.now()}@shaadigpt.dev`;
const OLD = 'OldPass!2026', NEW = 'NewPass!2026';

// An existing, fully set-up account with Terms accepted.
const r = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: OLD, email_confirm: true }),
});
const user = await r.json();
await fetch(`${API}/rest/v1/profiles?id=eq.${user.id}`, {
  method: 'PATCH',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Reset Tester', gender: 'Female', interested_in: 'Men', onboarding_complete: true,
    terms_accepted_at: new Date().toISOString(), privacy_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, rules_reminded_at: new Date().toISOString(),
    profile_nudged_at: new Date().toISOString(),  // the free-searches pop-up shown already
    // the answers every member gives (lib/profileRewards.ts)
    profile_created_for: 'Myself', date_of_birth: '1995-06-15', marital_status: 'Never Married',
    height: `5' 5" (165 cm)`, country: 'India', state: 'Maharashtra', city: 'Mumbai', religion: 'Hindu',
    mother_tongue: 'Marathi', education_level: "Bachelor's", occupation: 'Software Professional',
    description: 'Kind, curious and close to family. Testing Shaadi24.' }),
});

async function resetLink() {
  for (let i = 0; i < 20; i++) {
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    if (messages.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
      const link = (m.HTML || m.Text).match(/href="([^"]*type=recovery[^"]*)"/)?.[1] ?? m.Text.match(/(http\S*type=recovery\S*)/)?.[1];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('no reset email arrived');
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
const signIn = async (password) => {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
};
let ok = false;
try {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.getByRole('button', { name: /Forgot/i }).first().click();
  await page.locator('input[type=email]').fill(email);
  await page.getByRole('button', { name: /Send Code/ }).click();
  await page.getByText(/we've emailed it a code/).waitFor({ timeout: 10000 });
  const link = await resetLink();
  log('reset link redirects to:', new URL(link).searchParams.get('redirect_to'));

  const t0 = Date.now();
  const trace = [];
  page.on('console', (m) => trace.push(`+${Date.now() - t0}ms console.${m.type()}: ${m.text().slice(0, 160)}`));
  page.on('request', (rq) => { if (rq.url().includes(':54321')) trace.push(`+${Date.now() - t0}ms -> ${rq.method()} ${rq.url().slice(22, 100)}`); });
  page.on('requestfinished', (rq) => { if (rq.url().includes(':54321')) trace.push(`+${Date.now() - t0}ms <- done ${rq.url().slice(22, 80)}`); });
  page.on('requestfailed', (rq) => trace.push(`+${Date.now() - t0}ms !! failed ${rq.url().slice(22, 80)} ${rq.failure()?.errorText}`));
  await page.goto(link);
  try { await page.getByText('Set a new password').waitFor({ timeout: 15000 }); }
  catch (e) { fs.writeFileSync(OUT + 'trace.txt', trace.join('\n')); throw e; }
  await page.screenshot({ path: `${OUT}1-set-new-password.png` });
  await page.getByPlaceholder('At least 8 characters').fill(NEW);
  await page.locator('input[autocomplete=new-password]').nth(1).fill(NEW);
  await page.getByRole('button', { name: /Save new password/ }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}2-back-in-app.png` });
  log('new password saved, back in the app');

  await page.getByTitle('Sign out').click();
  await signIn(OLD);
  await page.getByText(/Invalid login credentials/i).waitFor({ timeout: 10000 });
  log('old password rejected');
  await page.locator('input[type=password]').fill(NEW);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  log('new password works');

  // An expired/used link: open the same link again → error message, no password screen.
  await page.getByTitle('Sign out').click();
  await page.goto(link);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}3-used-link.png` });
  if (await page.getByText('Set a new password').isVisible()) throw new Error('used link still opened the password screen');
  log('used link shows:', (await page.locator('body').innerText()).match(/[^\n]*request a new link[^\n]*/)?.[0] ?? '(no message)');
  ok = true;
  log('PASS');
} catch (e) {
  log('FAIL', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  await browser.close();
  process.exit(ok ? 0 : 1);
}
