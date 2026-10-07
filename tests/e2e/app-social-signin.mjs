// Signing in with Google and Apple inside the phone apps (lib/socialSignIn.ts,
// NativeSignInButtons), in Chromium with stand-ins for Capacitor's Android and
// iOS bridges. The phone's sign-in sheets (the SocialLogin plugin) are played
// here. Supabase's ID-token sign-in can't check a token Google or Apple
// didn't sign, so when a sheet "succeeds" that one call is answered with a
// real session of the local stack, after checking what the app sent (the
// sheet's token, and a nonce whose SHA-256 the sheet got). Everything else is
// real: Supabase's own answer when a provider is off, the new account's
// consent and profile steps, the name Apple gives once, and Apple's one-time
// code exchanged by apple-sign-in against the Apple stand-in (store-standin.cjs).
//  Android: Google only, with the web client; a new account → consent; an
//    existing one → home; closing the sheet; Google not set up for the app;
//    Supabase refusing the token; Google off in Supabase
//  iPhone: Apple, first; a new account → its name in the profile form, the
//    token kept for deleting the account; closing Apple's sheet; Apple off in
//    Supabase; Apple off in Supabase → no buttons; with an iOS client ID
//    (BASE_IOS_GOOGLE, a build with VITE_GOOGLE_IOS_CLIENT_ID): Apple then
//    Google, and Google's sign-in uses the iOS client
//  The website: none of these buttons
//  They're on the welcome screen (LandingView); its email button opens the
//  sign-in popup, which doesn't repeat them
// Usage: SERVICE_ROLE_KEY=… node app-social-signin.mjs <onboarded email>   (password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { agreeToTerms } from './fixtures.mjs';

const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const BASE_IOS_GOOGLE = process.env.BASE_IOS_GOOGLE || 'http://localhost:3001';
const IOS_CLIENT_ID = process.env.IOS_CLIENT_ID || '1095396009529-iosclientfortests.apps.googleusercontent.com';
const WEB_CLIENT_ID = '1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde.apps.googleusercontent.com';
const STANDIN = process.env.STANDIN_URL || 'http://127.0.0.1:8790';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};
const [EMAIL] = process.argv.slice(2);
if (!EMAIL || !SERVICE) { console.error('usage: SERVICE_ROLE_KEY=… node app-social-signin.mjs <onboarded email>'); process.exit(2); }
const OUT = new URL('./.shots/social-signin/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const j = (r) => r.json().catch(() => ({}));
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const b64url = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');

// ---- Accounts ------------------------------------------------------------------------------

const admin = (path, init = {}) => fetch(`${SUPABASE}/auth/v1/admin/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
}).then(j);
async function newAccount(label, metadata = {}) {
  const email = `${label}_${Date.now()}@example.com`;
  const u = await admin('users', { method: 'POST', body: JSON.stringify({ email, password: 'TestPass!2026', email_confirm: true, user_metadata: metadata }) });
  return { id: u.id, email, sub: `${label}-${Date.now()}` };
}
// The session Supabase would give this account
const sessionFor = (email) => fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'TestPass!2026' }),
}).then(j);
const linkApple = (acct) => sql(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values ('${acct.sub}', '${acct.id}', jsonb_build_object('sub', '${acct.sub}', 'email', '${acct.email}', 'email_verified', true), 'apple', now(), now(), now());`);
const appleCode = async (sub) => (await fetch(`${STANDIN}/__appleid/code`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub, email: 'x@privaterelay.appleid.com' }),
}).then(j)).code;

// ---- The phone: Capacitor's bridge, with the SocialLogin plugin played here --------------------

const SOCIAL_METHODS = ['initialize', 'login', 'logout', 'isLoggedIn', 'getAuthorizationCode', 'refresh', 'decodeIdToken', 'getPluginVersion'];
function standin(platform) {
  const send = platform === 'android'
    ? `window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
         if (call.pluginId === 'Console' || call.type === 'js.error') return; answer(call); } };`
    : `window.webkit = { messageHandlers: { bridge: { postMessage(call) {
         if (call.pluginId === 'Console' || call.type !== 'message') return; answer(call); } } } };`;
  const own = platform === 'android'
    ? `{ name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] }`
    : `{ name: 'SystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }, { name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] }`;
  return `
    function answer(call) {
      if (call.callbackId === '-1' || call.methodName === 'addListener') return;
      const reply = call.pluginId === 'SocialLogin' ? window.__social({ method: call.methodName, options: call.options })
        : Promise.resolve({ data: {} });
      reply.then((r) => window.Capacitor.fromNative(Object.assign(
        { callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: !r.error },
        r.error ? { error: r.error } : { data: r.data || {} })));
    }
    ${send}
    window.Capacitor = { PluginHeaders: [
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' },
                               { name: 'minimizeApp', rtype: 'promise' }, { name: 'getInfo', rtype: 'promise' }] },
      { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
      ${own},
      { name: 'SocialLogin', methods: ${JSON.stringify(SOCIAL_METHODS.map((name) => ({ name, rtype: 'promise' })))} },
    ] };
  `;
}

const CANCEL = {
  android: { message: 'Google Sign-In cancelled by user', code: 'USER_CANCELLED' },
  google: { message: 'The user canceled the sign-in flow.' },
  apple: { message: 'The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)' },
};

// The plugin's native side: the phone's sign-in sheets
function pluginSide(phone) {
  return async ({ method, options }) => {
    phone.calls.push({ method, options });
    if (method === 'initialize') return { data: {} };
    if (method === 'logout') return { data: {} };
    if (method !== 'login') return { data: {} };
    const { provider, options: o } = options;
    if (phone.sheet === 'cancel') return { error: phone.platform === 'android' ? CANCEL.android : CANCEL[provider] };
    if (phone.sheet === 'misconfigured') return { error: { message: '[28444] Developer console is not set up correctly.' } };
    const acct = phone.account;
    phone.idToken = `${b64url({ alg: 'RS256', kid: 'standin' })}.${b64url({
      iss: provider === 'apple' ? 'https://appleid.apple.com' : 'https://accounts.google.com',
      aud: provider === 'apple' ? 'com.shaadi24.app' : phone.platform === 'ios' ? IOS_CLIENT_ID : WEB_CLIENT_ID,
      sub: acct.sub, email: acct.email, nonce: o.nonce, exp: Math.floor(Date.now() / 1000) + 600,
    })}.c2lnbmF0dXJl`;
    if (provider === 'google') {
      return { data: { provider: 'google', result: { responseType: 'online', idToken: phone.idToken, accessToken: { token: 'ya29.standin' },
        profile: { email: acct.email, givenName: 'Aarav', familyName: 'Mehta', name: 'Aarav Mehta', id: acct.sub, imageUrl: '' } } } };
    }
    return { data: { provider: 'apple', result: { idToken: phone.idToken, accessToken: { token: phone.appleCode || '' },
      authorizationCode: phone.appleCode || undefined,
      profile: { user: acct.sub, email: acct.email, givenName: phone.appleName?.[0] ?? '', familyName: phone.appleName?.[1] ?? '' } } } };
  };
}

const newPhone = (platform, over = {}) => ({ platform, calls: [], sheet: 'ok', supabase: 'ok', providers: { google: true, apple: true }, ...over });
const called = (phone, method) => phone.calls.filter((c) => c.method === method);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// Opens the app on a phone (signed out), at its sign-in popup
async function openApp(phone, base = BASE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.exposeFunction('__social', pluginSide(phone));
  await ctx.addInitScript({ content: standin(phone.platform) });
  await ctx.addInitScript({ path: BRIDGE[phone.platform] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  phone.idTokenCalls = [];
  phone.appleSignInCalls = [];
  // Which providers Supabase has on
  await page.route('**/auth/v1/settings', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.external = { ...body.external, ...phone.providers };
    await route.fulfill({ response: res, json: body });
  });
  // The ID-token sign-in: checked, then answered with the account's real session
  await page.route('**/auth/v1/token?grant_type=id_token', async (route) => {
    const sent = JSON.parse(route.request().postData() || '{}');
    phone.idTokenCalls.push(sent);
    if (phone.supabase === 'ok') {
      const session = await sessionFor(phone.account.email);
      return route.fulfill({ status: 200, headers: { 'x-supabase-api-version': '2024-01-01' }, json: session });
    }
    if (phone.supabase === 'audience') {
      return route.fulfill({ status: 400, headers: { 'x-supabase-api-version': '2024-01-01' },
        json: { code: 'validation_failed', message: `Unacceptable audience in id_token: [${IOS_CLIENT_ID}]` } });
    }
    return route.continue();  // the real answer (the providers are off in the local stack)
  });
  page.on('request', (r) => { if (r.url().includes('/functions/v1/apple-sign-in')) phone.appleSignInCalls.push(r.postData() || ''); });
  await page.goto(base);
  await emailButton(page).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);  // the providers check
  return { ctx, page };
}

const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
};
// On the welcome screen: the phone's sign-ins, then email (the sign-in popup)
const emailButton = (page) => page.getByRole('button', { name: 'Sign in or create account' });
const google = (page) => page.getByTestId('signin-google');
const apple = (page) => page.getByTestId('signin-apple');
const errorBox = (page) => page.locator('.text-red-700');
const home = (page) => page.getByTestId('find-match-box');
const consent = (page) => page.getByRole('heading', { name: 'Before you start' });
// What the app sent Supabase matches the sheet: its token, and the nonce the sheet got the SHA-256 of
function sentRight(phone, provider) {
  const sent = phone.idTokenCalls.at(-1) || {};
  const login = called(phone, 'login').at(-1)?.options || {};
  return sent.provider === provider && sent.id_token === phone.idToken && typeof sent.nonce === 'string' && sent.nonce.length >= 32
    && /^[0-9a-f]{64}$/.test(login.options?.nonce || '') && sha256hex(sent.nonce) === login.options.nonce;
}

try {
  // ======================================================================================
  log('1. Android: Google');
  let phone = newPhone('android', { account: await newAccount('google_new', { full_name: 'Aarav Mehta', name: 'Aarav Mehta' }) });
  let { ctx, page } = await openApp(phone);
  check(await google(page).isVisible() && !(await apple(page).isVisible()), 'Android offers Google, not Apple');
  check(await page.locator('.popup-backdrop').count() === 0, 'on the welcome screen itself, no popup to open first');
  await page.screenshot({ path: `${OUT}1-android-buttons.png` });
  await google(page).click();
  check(await appears(consent(page), 15000), 'a new Google account is signed in, and goes on to accept the Terms');
  const init = called(phone, 'initialize')[0]?.options || {};
  check(init.google?.webClientId === WEB_CLIENT_ID && init.google?.mode === 'online' && !init.apple,
    `the plugin is set up with the web client only (${JSON.stringify(init)})`);
  const login = called(phone, 'login')[0]?.options || {};
  check(login.provider === 'google' && login.options?.forcePrompt === true && !login.options?.scopes,
    'Google\'s sheet: always the account chooser, no extra scopes');
  check(sentRight(phone, 'google'), 'Supabase got the sheet\'s ID token and the nonce behind its hash');
  check(called(phone, 'logout').some((c) => c.options?.provider === 'google'), 'Google\'s own sign-in is cleared afterwards');
  await page.screenshot({ path: `${OUT}2-android-consent.png` });
  await agreeToTerms(page);
  const nameField = page.getByPlaceholder("As you'd like it shown");
  check(await appears(nameField, 15000) && (await nameField.inputValue()) === 'Aarav Mehta', 'the profile form starts from the Google name');
  await ctx.close();

  phone = newPhone('android', { account: { email: EMAIL, sub: 'existing-google' } });
  ({ ctx, page } = await openApp(phone));
  await google(page).click();
  check(await appears(home(page), 20000), 'an existing account signs in with Google straight to the app');
  await ctx.close();

  log('2. Android: when it doesn\'t work');
  phone = newPhone('android', { sheet: 'cancel', account: { email: EMAIL, sub: 'x' } });
  ({ ctx, page } = await openApp(phone));
  await google(page).click();
  await page.waitForTimeout(800);
  check(!(await errorBox(page).isVisible()) && await google(page).isEnabled() && phone.idTokenCalls.length === 0,
    'closing Google\'s sheet: no error, nothing sent, the buttons work again');
  phone.sheet = 'misconfigured';
  await google(page).click();
  check(await appears(errorBox(page).getByText('Google sign-in isn\'t set up for this app yet. Please continue with email.'), 5000),
    'Google not set up for the app (28444) → says so, email still there');
  await page.screenshot({ path: `${OUT}3-android-not-set-up.png` });
  phone.sheet = 'ok';
  phone.supabase = 'audience';
  await google(page).click();
  check(await appears(errorBox(page).getByText('Google sign-in isn\'t set up for this app yet. Please continue with email.'), 5000),
    'Supabase refusing the token\'s client → says so');
  phone.supabase = 'real';
  await google(page).click();
  check(await appears(errorBox(page).getByText('Google sign-in isn\'t switched on yet. Please continue with email.'), 5000),
    'Supabase\'s real answer with Google off → "isn\'t switched on yet"');
  await ctx.close();
  phone = newPhone('android', { providers: { google: false, apple: false } });
  ({ ctx, page } = await openApp(phone));
  check(!(await google(page).isVisible()) && await emailButton(page).isVisible(),
    'Google off in Supabase → only email');
  await ctx.close();

  // ======================================================================================
  log('3. iPhone: Apple');
  const priya = await newAccount('apple_new');
  linkApple(priya);
  phone = newPhone('ios', { account: priya, appleName: ['Priya', 'Sharma'], appleCode: await appleCode(priya.sub) });
  ({ ctx, page } = await openApp(phone));
  check(await apple(page).isVisible() && !(await google(page).isVisible()),
    'an iPhone build without an iOS client offers Apple only (no Google)');
  const bg = await apple(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  check(bg === 'rgb(0, 0, 0)', `Apple's button is black (${bg})`);
  await page.screenshot({ path: `${OUT}4-ios-apple.png` });
  await apple(page).click();
  check(await appears(consent(page), 15000), 'a new Apple account is signed in, and goes on to accept the Terms');
  const iosInit = called(phone, 'initialize')[0]?.options || {};
  check(JSON.stringify(iosInit) === '{"apple":{}}', `the plugin is set up for Apple only (${JSON.stringify(iosInit)})`);
  const appleLogin = called(phone, 'login')[0]?.options || {};
  check(appleLogin.provider === 'apple' && appleLogin.options?.scopes?.join() === 'email,name', 'Apple\'s sheet asks for the email and name');
  check(sentRight(phone, 'apple'), 'Supabase got Apple\'s ID token and the nonce behind its hash');
  const metaName = await until(() => sql(`select raw_user_meta_data->>'full_name' from auth.users where id = '${priya.id}';`) === 'Priya Sharma');
  check(metaName, 'the name Apple gave is kept on the account');
  const keptToken = await until(() => sql(`select count(*) from apple_sign_in_tokens where user_id = '${priya.id}';`) === '1', 10000);
  check(keptToken && phone.appleSignInCalls.length === 1 && phone.appleSignInCalls[0].includes(phone.appleCode),
    'Apple\'s one-time code went to the server, which kept the token for deleting the account');
  await agreeToTerms(page);
  const iosName = page.getByPlaceholder("As you'd like it shown");
  check(await appears(iosName, 15000) && (await iosName.inputValue()) === 'Priya Sharma', 'the profile form starts from the name Apple gave');
  await page.screenshot({ path: `${OUT}5-ios-profile-name.png` });
  await ctx.close();

  log('4. iPhone: when it doesn\'t work');
  phone = newPhone('ios', { sheet: 'cancel', account: { email: EMAIL, sub: 'x' } });
  ({ ctx, page } = await openApp(phone));
  await apple(page).click();
  await page.waitForTimeout(800);
  check(!(await errorBox(page).isVisible()) && await apple(page).isEnabled() && phone.idTokenCalls.length === 0,
    'closing Apple\'s sheet (error 1001): no error, nothing sent');
  phone.sheet = 'ok';
  phone.supabase = 'real';
  await apple(page).click();
  check(await appears(errorBox(page).getByText('Apple sign-in isn\'t switched on yet. Please continue with email.'), 5000),
    'Supabase\'s real answer with Apple off → "isn\'t switched on yet"');
  await ctx.close();
  phone = newPhone('ios', { providers: { google: true, apple: false } });
  ({ ctx, page } = await openApp(phone, BASE_IOS_GOOGLE));
  check(!(await apple(page).isVisible()) && !(await google(page).isVisible()),
    'Apple off in Supabase → an iPhone offers neither (Apple asks for Apple wherever Google is)');
  await ctx.close();

  log('5. iPhone: Apple and Google (a build with an iOS client)');
  phone = newPhone('ios', { account: { email: EMAIL, sub: 'existing-google-ios' } });
  ({ ctx, page } = await openApp(phone, BASE_IOS_GOOGLE));
  const order = await page.locator('[data-testid^="signin-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
  check(order.join() === 'signin-apple,signin-google', `Apple first, then Google (${order.join(', ')})`);
  await page.screenshot({ path: `${OUT}6-ios-both.png` });
  await emailButton(page).click();
  await page.getByRole('button', { name: /Continue with Email/ }).waitFor();
  check(await page.locator('.popup-backdrop [data-testid^="signin-"]').count() === 0, 'the email popup doesn\'t repeat them');
  await page.getByRole('button', { name: 'Close' }).click();
  await google(page).click();
  check(await appears(home(page), 20000), 'Google on an iPhone signs the existing account in');
  const both = called(phone, 'initialize')[0]?.options || {};
  check(both.google?.iOSClientId === IOS_CLIENT_ID && both.apple && !both.google?.webClientId,
    `the plugin is set up with the iOS client and Apple (${JSON.stringify(both)})`);
  check(sentRight(phone, 'google'), 'Supabase got the ID token and nonce');
  await ctx.close();

  log('6. The website');
  const site = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const web = await site.newPage();
  await web.goto(BASE);
  await web.getByRole('button', { name: 'Sign in' }).first().click();
  await web.getByRole('button', { name: /Continue with Email/ }).waitFor();
  check(!(await apple(web).isVisible()) && !(await google(web).isVisible()), 'no phone sign-in buttons on the website');
  await site.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
