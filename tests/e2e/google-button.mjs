// Google's own sign-in button (lib/googleSignIn.ts, GoogleSignInButton), with
// a stand-in for Google's library: Google's real button can't be loaded here.
// Checks: the button replaces the classic one, Google gets the hashed nonce,
// Supabase gets Google's token and the plain nonce, success signs in, errors
// and a library that won't load are shown.
// Run against a dev server started with
// VITE_GOOGLE_CLIENT_ID=test-client.apps.googleusercontent.com (BASE_URL, default
// http://localhost:3001), as an onboarded account (password TestPass!2026).
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const EMAIL = process.argv[2];
const OUT = new URL('./.shots/shots-google/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

// Stand-in for https://accounts.google.com/gsi/client
const FAKE_GIS = `window.google = { accounts: { id: {
  initialize(cfg) { window.__gis = cfg; },
  renderButton(el, opts) {
    window.__gisButton = opts;
    const b = document.createElement('button');
    b.textContent = 'Continue with Google';
    b.setAttribute('data-fake-google', '1');
    b.style.cssText = 'width:' + opts.width + 'px;height:40px;border:1px solid #dadce0;border-radius:4px;background:#fff';
    b.onclick = () => window.__gis.callback({ credential: 'header.payload.signature' });
    el.appendChild(b);
  },
} } };`;

// A real session for the test user, to stand in for what Supabase returns
const session = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: 'TestPass!2026' }),
}).then((r) => r.json());
if (!session.access_token) throw new Error('could not sign the test user in');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function openAuth({ gis = 'fake', token = 'ok' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const sent = [];
  await ctx.route('https://accounts.google.com/gsi/client', (route) =>
    gis === 'fake' ? route.fulfill({ contentType: 'text/javascript', body: FAKE_GIS }) : route.abort());
  await ctx.route(`${SUPABASE}/auth/v1/token?grant_type=id_token`, async (route) => {
    sent.push(JSON.parse(route.request().postData() || '{}'));
    if (token === 'ok') await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) });
    else await route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 400, error_code: 'bad_oauth_callback', msg: 'Bad ID token' }) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  return { ctx, page, sent };
}

try {
  log('1. the button, and signing in with it');
  const a = await openAuth();
  const google = a.page.locator('[data-fake-google]');
  await google.waitFor({ timeout: 10000 });
  await a.page.screenshot({ path: `${OUT}1-auth.png` });
  check(await a.page.getByRole('button', { name: 'Continue with Google' }).count() === 1, "Google's button replaces the classic one");
  const cfg = await a.page.evaluate(() => ({ ...window.__gis, callback: typeof window.__gis.callback, button: window.__gisButton }));
  check(cfg.client_id === 'test-client.apps.googleusercontent.com' && cfg.ux_mode === 'popup' && /^[0-9a-f]{64}$/.test(cfg.nonce),
    `Google gets the client ID, popup mode and a hashed nonce (${cfg.nonce?.slice(0, 12)}…)`);
  check(cfg.button.text === 'continue_with' && cfg.button.width >= 200 && cfg.button.width <= 400, `button: ${JSON.stringify(cfg.button)}`);
  await google.click();
  await a.page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  const body = a.sent[0] || {};
  const hashed = crypto.createHash('sha256').update(body.nonce || '').digest('hex');
  check(body.provider === 'google' && body.id_token === 'header.payload.signature', "Supabase gets Google's token");
  check(hashed === cfg.nonce, 'Supabase gets the plain nonce that matches the hashed one Google got');
  check(true, 'signed in: the search page is showing');
  await a.page.screenshot({ path: `${OUT}2-signed-in.png` });
  await a.ctx.close();

  log('2. Supabase refuses the token');
  const b = await openAuth({ token: 'bad' });
  await b.page.locator('[data-fake-google]').click();
  await b.page.getByText('Bad ID token').waitFor({ timeout: 10000 });
  check(true, 'the error is shown in the sign-in box');
  await b.page.screenshot({ path: `${OUT}3-error.png` });
  await b.ctx.close();

  log("3. Google's library can't load");
  const c = await openAuth({ gis: 'blocked' });
  await c.page.getByText(/Google sign-in couldn't load/).waitFor({ timeout: 15000 });
  check(await c.page.getByRole('button', { name: /Continue with Email/ }).isVisible(), 'says so, and email sign-in is still there');
  await c.page.screenshot({ path: `${OUT}4-blocked.png` });
  await c.ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
