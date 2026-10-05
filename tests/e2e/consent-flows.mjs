// Two more new-user paths against the local stack:
//  B. A Google-style sign-up: account created by the auth server (no password, name in
//     metadata, no Terms answer), signed in by a link that returns with #access_token —
//     the same way the app receives a Google sign-in. Expect: consent screen → step 1
//     with the name filled in.
//  C. An existing, fully set-up account that never accepted the Terms (like the live
//     accounts): expect the consent screen once, then straight to the main app.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';  // local CLI default
const SEED_EMAIL = process.argv[2] || 'seed_aanyasharma_22@shaadigpt.dev';
const OUT = new URL('./.shots/shots-consent/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function admin(path, body) {
  const r = await fetch(`${API}/auth/v1/admin/${path}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;

async function scenario(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Pretend the cookie banner was already answered so it doesn't cover buttons.
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().startsWith(API) && !r.url().includes('/realtime/')) {
      let b = ''; try { b = (await r.text()).slice(0, 160); } catch {}
      problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')} ${b}`);
    }
  });
  let n = 0;
  const shot = async (s) => page.screenshot({ path: `${OUT}${name[0]}${String(++n).padStart(2, '0')}-${s}.png` });
  log('SCENARIO', name);
  try {
    await fn(page, shot);
    log('  PASS');
  } catch (e) {
    failures++;
    log('  FAIL', e.message.split('\n')[0]);
    await shot('FAILED');
  }
  for (const p of [...new Set(problems)]) log('  browser problem:', p);
  await ctx.close();
}

await scenario('B Google-style new user', async (page, shot) => {
  const email = `google_like_${Date.now()}@shaadigpt.dev`;
  await admin('users', { email, email_confirm: true, user_metadata: { full_name: 'Priya Google', name: 'Priya Google' } });
  const link = await admin('generate_link', { type: 'magiclink', email, redirect_to: BASE });
  await page.goto(link.action_link ?? link.properties.action_link);
  await page.getByText('Before you start').waitFor({ timeout: 15000 });
  await shot('consent-screen');
  const cont = page.getByRole('button', { name: /Continue/ });
  if (await cont.isEnabled()) throw new Error('Continue is enabled before ticking the Terms box');
  await page.locator('input[type=checkbox]').first().check();
  await cont.click();
  await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
  const name = await page.getByPlaceholder("As you'd like it shown").inputValue();
  await shot('step1-name-prefilled');
  if (name !== 'Priya Google') throw new Error(`name not prefilled (got "${name}")`);
  log('  consent recorded, step 1 shows name:', name);
});

await scenario('C Existing account without Terms', async (page, shot) => {
  // An earlier run accepted them: back to never having answered
  const reset = await fetch(`${API}/rest/v1/profiles?email=eq.${encodeURIComponent(SEED_EMAIL)}`, {
    method: 'PATCH',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms_accepted_at: null, privacy_accepted_at: null }),
  });
  if (!reset.ok) throw new Error(`resetting the account's Terms: ${reset.status} ${await reset.text()}`);
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(SEED_EMAIL);
  await page.locator('input[type=password]').fill('SeedUser!2024');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByText('Before you start').waitFor({ timeout: 15000 });
  await shot('consent-screen');
  await page.locator('input[type=checkbox]').first().check();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  await shot('main-app');
  // Reload: the consent screen must not come back.
  await page.reload();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  if (await page.getByText('Before you start').isVisible()) throw new Error('consent screen came back after reload');
});

await browser.close();
log(failures ? `${failures} scenario(s) failed` : 'all scenarios passed');
process.exit(failures ? 1 : 0);
