// Forgot password → a code by email → a new password, all inside the app
// (Auth's code step, SetNewPassword), in the Android app (a stand-in for
// Capacitor's Android bridge, as in android-app.mjs) and on the website:
//   - the email has the code (supabase/templates/recovery.html); the app asks
//     for it, refuses a wrong one, and with the right one asks for the new
//     password; the new password works and the old one doesn't
//   - an address without an account gets the same answer and no email
//   - a used code is refused; "Send a new code" waits a minute
// Usage: SERVICE_ROLE_KEY=… node reset-code-flow.mjs   (MAILPIT_URL, BASE_URL, REPO_ROOT)
import { chromium } from 'playwright';

const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is required'); process.exit(2); }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const j = (r) => r.json().catch(() => ({}));
const OLD = 'OldPass!2026x';
const NEW = 'NewPass!2026y';

async function newAccount(label) {
  const email = `${label}_${Date.now()}@example.com`;
  await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: OLD, email_confirm: true }),
  });
  return email;
}
const signsIn = async (email, password) => (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
})).status === 200;
const mails = async (email) => (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then(j)).messages ?? [];
// The code in the newest email to this address
async function codeFor(email, before = 0) {
  for (let i = 0; i < 40; i++) {
    const list = await mails(email);
    if (list.length > before) {
      const m = await fetch(`${MAILPIT}/api/v1/message/${list[0].ID}`).then(j);
      return { subject: m.Subject, code: (m.Text || '').match(/\b(\d{6,10})\b/)?.[1], text: m.Text || '' };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {};
}

// Capacitor's Android bridge, answering every plugin call (as in android-app.mjs)
const ANDROID = `
  window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
    if (call.pluginId === 'Console' || call.type === 'js.error' || call.callbackId === '-1' || call.methodName === 'addListener') return;
    setTimeout(() => window.Capacitor.fromNative({ callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data: {} })); } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'getInfo', rtype: 'promise' }] },
    { name: 'SplashScreen', methods: [{ name: 'hide', rtype: 'promise' }] },
    { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
  ] };`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

async function resetOn(label, android) {
  log(`== ${label}`);
  const email = await newAccount(android ? 'reset_app' : 'reset_web');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (android) {
    await ctx.addInitScript({ content: ANDROID });
    await ctx.addInitScript({ path: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js` });
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  // The website's cookie banner first, as a visitor would (the apps have none)
  if (!android) await page.getByRole('button', { name: 'Reject non-essential' }).click({ timeout: 8000 }).catch(() => {});
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: 'Forgot Password?' }).click();
  await page.locator('input[type=email]').fill(email);
  await page.getByRole('button', { name: 'Send Code' }).click();
  const step = page.getByTestId('reset-code');
  check(await appears(step) && await appears(page.getByText(`If an account exists for ${email}, we've emailed it a code.`)),
    'asks for the code from the email');
  check(await page.getByText(/Send again in \d+s/).isVisible(), '"Send a new code" waits a minute');
  const { subject, code, text } = await codeFor(email);
  check(subject === 'Your MatchGPT password reset code' && /^\d{6}$/.test(code || ''), `the email has the code (${subject}: ${code})`);
  check(/follow this link/.test(text), '…and, for the website, the link');
  await page.screenshot({ path: `${OUT}${android ? 'app' : 'web'}-1-code.png` });

  await step.locator('input').fill(code === '000000' ? '111111' : '000000');
  await step.getByRole('button', { name: 'Continue' }).click();
  check(await appears(page.getByText("That code isn't right or has expired. Check the email, or send a new code.")), 'a wrong code is refused');
  await step.locator('input').fill(code);
  await step.getByRole('button', { name: 'Continue' }).click();
  check(await appears(page.getByRole('heading', { name: 'Set a new password' }), 10000), 'the right code → "Set a new password", in the app');
  await page.getByPlaceholder('At least 8 characters').fill(NEW);
  await page.locator('input[type=password]').nth(1).fill(NEW);
  await page.getByRole('button', { name: 'Save new password' }).click();
  check(await appears(page.getByText('Password updated'), 8000), 'the new password is saved');
  check(await signsIn(email, NEW) && !(await signsIn(email, OLD)), 'the new password works; the old one doesn\'t');
  const used = await fetch(`${SUPABASE}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'recovery', email, token: code }),
  });
  check(used.status >= 400, `the code can't be used again (${used.status})`);
  await page.screenshot({ path: `${OUT}${android ? 'app' : 'web'}-2-after.png` });
  await ctx.close();
}

const OUT = new URL('./.shots/reset-code/', import.meta.url).pathname;
(await import('node:fs')).mkdirSync(OUT, { recursive: true });

try {
  await resetOn('Android app', true);
  await resetOn('Website', false);

  log('== An address without an account');
  const nobody = `nobody_${Date.now()}@example.com`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: 'Forgot Password?' }).click();
  await page.locator('input[type=email]').fill(nobody);
  await page.getByRole('button', { name: 'Send Code' }).click();
  check(await appears(page.getByText(`If an account exists for ${nobody}, we've emailed it a code.`)), 'the same answer, so nobody learns who has an account');
  await page.waitForTimeout(1500);
  check((await mails(nobody)).length === 0, '…and no email is sent');
  await ctx.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
