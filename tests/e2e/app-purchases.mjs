// Shaadi24+ bought inside the phone apps (lib/storePurchases.ts,
// components/StoreUpgrade.tsx, Settings), in Chromium with stand-ins for
// Capacitor's Android and iOS bridges. The purchase plugin's calls are
// answered by the Google Play / App Store stand-in (store-standin.cjs), and
// the real store-billing function on the local stack checks every purchase.
// As one onboarded account (password TestPass!2026).
//  Android: Google Play's four plans side by side (1 week, 1 month, 3 months,
//    6 months), each with its full price first, the price a week under it and
//    what it saves; 3 months chosen to start with; the terms; an offer entry
//    ignored; closing the payment sheet; buying monthly (the account's id goes
//    with it; Pro on);
//    the app catching up with the store at sign-in; Settings: billed by
//    Google Play, Manage subscription, the payment, Restore purchases; a
//    pending payment; nothing on sale yet → "coming soon"
//  iPhone: the free trial and Apple's terms; buying 6 months in the trial; a
//    renewal the App Store delivers while the app runs; Settings; deleting the
//    account warns that the App Store subscription carries on
// Usage: node app-purchases.mjs <email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const STORE = process.env.STORE_STANDIN || 'http://127.0.0.1:8790';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node app-purchases.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/purchases/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const store = (path, body) => fetch(`${STORE}${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}).then((r) => r.json());

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const reset = () => sql(`delete from payments where user_id = '${me}';
  delete from subscriptions where user_id = '${me}';
  update profiles set subscription_tier = 'FREE', subscription_renews_at = null, account_created = now(),
    daily_search_count = 0, is_paused = false, settings_theme = 'system', ${CONSENTED} where id = '${me}';`);
const tier = () => sql(`select subscription_tier from profiles where id = '${me}';`);
const subOf = (provider) => sql(`select status || '|' || plan_id from subscriptions
  where user_id = '${me}' and provider = '${provider}' order by created_at desc limit 1;`);

// ---- What the store would sell -------------------------------------------------------

const product = (over) => ({
  title: 'Shaadi24+', description: 'Unlimited searches and likes', currencyCode: 'INR', currencySymbol: '₹',
  isFamilyShareable: false, subscriptionGroupIdentifier: '21500001', discounts: [], introductoryPrice: null, ...over,
});
const base = (plan, price, priceString, numberOfUnits, unit) => product({ identifier: plan, planIdentifier: 'shaadi24_plus',
  offerId: null, offerToken: `base-${plan}`, price, priceString, subscriptionPeriod: { numberOfUnits, unit } });
const ANDROID_PRODUCTS = [
  base('weekly', 349, '₹349.00', 1, 1),
  base('monthly', 999, '₹999.00', 1, 2),
  product({ identifier: 'monthly', planIdentifier: 'shaadi24_plus', offerId: 'free-trial', offerToken: 'trial-monthly', price: 999,
    priceString: '₹999.00', subscriptionPeriod: { numberOfUnits: 1, unit: 2 } }),
  base('quarterly', 1999, '₹1,999.00', 3, 2),
  base('halfyearly', 2999, '₹2,999.00', 6, 2),
];
const WEEK_FREE = { identifier: '', type: 0, price: 0, priceString: '₹0.00', currencySymbol: '₹', currencyCode: 'INR',
  paymentMode: 0, numberOfPeriods: 1, subscriptionPeriod: { numberOfUnits: 1, unit: 1 } };
const apple = (plan, price, priceString, numberOfUnits, unit) => product({ identifier: `shaadi24_plus_${plan}`, price, priceString,
  subscriptionPeriod: { numberOfUnits, unit }, introductoryPrice: WEEK_FREE });
const IOS_PRODUCTS = [
  apple('weekly', 349, '₹349.00', 1, 1),
  apple('monthly', 999, '₹999.00', 1, 2),
  apple('quarterly', 1999, '₹1,999.00', 3, 2),
  apple('halfyearly', 2999, '₹2,999.00', 6, 2),
];

// ---- The bridges ------------------------------------------------------------------------

const PURCHASE_METHODS = ['getProducts', 'getProduct', 'purchaseProduct', 'getPurchases', 'restorePurchases',
  'manageSubscriptions', 'acknowledgePurchase', 'isBillingSupported', 'removeAllListeners'];
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
    window.__native = [];
    function answer(call) {
      window.__native.push(call);
      if (call.callbackId === '-1' || call.methodName === 'addListener') return;  // listeners wait for events
      const reply = call.pluginId === 'NativePurchases' ? window.__store(call) : Promise.resolve({ data: {} });
      reply.then((r) => window.Capacitor.fromNative(Object.assign(
        { callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: !r.error },
        r.error ? { error: r.error } : { data: r.data || {} })));
    }
    ${send}
    window.Capacitor = { PluginHeaders: [
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' },
                               { name: 'minimizeApp', rtype: 'promise' }] },
      { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
      ${own},
      { name: 'NativePurchases', methods: ${JSON.stringify(PURCHASE_METHODS.map((name) => ({ name, rtype: 'promise' })))}
          .concat([{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }]) },
    ] };
    // A transaction the App Store delivers while the app runs
    window.__transactionUpdated = (tx) => {
      const l = window.__native.find((c) => c.pluginId === 'NativePurchases' && c.methodName === 'addListener'
        && c.options.eventName === 'transactionUpdated');
      if (!l) return false;
      window.Capacitor.fromNative({ callbackId: l.callbackId, pluginId: 'NativePurchases', methodName: 'addListener',
        save: true, success: true, data: tx });
      return true;
    };
  `;
}

// The store's side of the purchase plugin
function storeSide(platform, state) {
  return async (call) => {
    const o = call.options || {};
    state.calls.push({ method: call.methodName, options: o });
    switch (call.methodName) {
      case 'getProducts':
        return { data: { products: state.products } };
      case 'purchaseProduct': {
        const next = state.next;
        state.next = null;
        if (next === 'cancel') {
          return { error: platform === 'android' ? { message: 'Purchase is not purchased', code: 'USER_CANCELED' } : { message: 'User cancelled' } };
        }
        if (next === 'pending') return { error: { message: platform === 'android' ? 'Purchase is pending' : 'Transaction pending' } };
        if (platform === 'android') {
          const p = await store('/__google/purchase', { userId: o.appAccountToken, basePlan: o.planIdentifier, test: true });
          state.owned.push(p.purchaseToken);
          return { data: { transactionId: p.purchaseToken, purchaseToken: p.purchaseToken, orderId: p.orderId,
            productIdentifier: o.productIdentifier, purchaseState: '1', isAcknowledged: false, appAccountToken: o.appAccountToken } };
        }
        const a = await store('/__apple/purchase', { userId: o.appAccountToken, product: o.productIdentifier, trial: state.trial });
        state.owned.push(a.originalTransactionId);
        return { data: { transactionId: a.transactionId, productIdentifier: o.productIdentifier, jwsRepresentation: a.jws,
          purchaseDate: new Date().toISOString(), isActive: true, willCancel: null } };
      }
      case 'getPurchases': {
        if (platform === 'android') {
          return { data: { purchases: state.owned.map((t) => ({ purchaseToken: t, transactionId: t, purchaseState: '1', productIdentifier: 'shaadi24_plus' })) } };
        }
        const purchases = [];
        for (const orig of state.owned) {
          const l = await store(`/__apple/latest/${orig}`);
          purchases.push({ transactionId: l.transactionId, jwsRepresentation: l.jws, productIdentifier: 'shaadi24_plus_halfyearly', willCancel: null });
        }
        return { data: { purchases } };
      }
      default:
        return { data: {} };
    }
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function appPage(platform, state) {
  // A tablet-sized screen keeps the sidebar open (the phone layouts are checked by android-app / ios-app)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.exposeFunction('__store', storeSide(platform, state));
  await ctx.addInitScript({ content: standin(platform) });
  await ctx.addInitScript({ path: BRIDGE[platform] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  state.functions = [];
  page.on('request', (r) => {
    const m = r.url().match(/\/functions\/v1\/([\w-]+)/);
    if (m) state.functions.push({ name: m[1], body: r.postData() || '' });
  });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return page;
}

const openMenuItem = (page, text) => page.getByText(text, { exact: true }).first().click();

const callsTo = (state, method) => state.calls.filter((c) => c.method === method);

try {
  // ======================================================================================
  log('1. Android');
  reset();
  const a = { products: ANDROID_PRODUCTS, owned: [], calls: [], next: null };
  let page = await appPage('android', a);
  await page.waitForTimeout(1500);
  const firstSync = callsTo(a, 'getPurchases')[0];
  check(firstSync?.options.productType === 'subs' && firstSync.options.appAccountToken === me,
    'signed in: the app asks Google Play for this account\'s purchases');

  await openMenuItem(page, 'Get Shaadi24+');
  await page.getByTestId('plan-cards').waitFor({ timeout: 15000 });
  const sheet = page.locator('[role=dialog]');
  const cards = sheet.getByTestId('plan-cards');
  const cardText = (name) => cards.getByRole('radio', { name }).innerText().then((t) => t.replace(/\s+/g, ' '));
  check(await sheet.getByRole('radio').count() === 4, 'four plans (the monthly offer entry is not a plan of its own)');
  check(await cardText(/1 week/) === 'Try it 1 week ₹349.00 ₹349/wk', `1 week: ${await cardText(/1 week/)}`);
  check(await cardText(/1 month/) === 'Save 34% 1 month ₹999.00 ₹231/wk', `1 month: ${await cardText(/1 month/)}`);
  check(await cardText(/3 months/) === 'Save 56% 3 months ₹1,999.00 ₹154/wk', `3 months: ${await cardText(/3 months/)}`);
  check(await cardText(/6 months/) === 'Save 67% 6 months ₹2,999.00 ₹115/wk', `6 months: ${await cardText(/6 months/)}`);
  check(await cards.getByRole('radio', { name: /3 months/ }).getAttribute('aria-checked') === 'true'
    && await sheet.getByRole('button', { name: 'Get 3 months for ₹1,999.00' }).isVisible(), '3 months chosen to start with');
  // The price charged stands out more than the price a week (App Review 3.1.2)
  const sizes = await cards.getByRole('radio', { name: /3 months/ }).evaluate((el) => {
    const size = (re) => [...el.querySelectorAll('div')].filter((d) => d.children.length === 0 && re.test(d.textContent))
      .map((d) => parseFloat(getComputedStyle(d).fontSize))[0];
    return { total: size(/^₹1,999\.00$/), week: size(/\/wk$/) };
  });
  check(sizes.total > sizes.week, `the full price is bigger than the price a week (${sizes.total}px, ${sizes.week}px)`);
  await cards.getByRole('radio', { name: /1 month/ }).click();
  check(await sheet.getByRole('button', { name: 'Get 1 month for ₹999.00' }).isVisible(), '1 month chosen: "Get 1 month for ₹999.00"');
  check(await sheet.getByText(/charged to your Google Play account/).isVisible() && await sheet.getByText(/renews automatically/).isVisible(),
    "Google Play's terms: who charges, that it renews, where to cancel");
  check(await sheet.getByRole('button', { name: 'Terms of Use' }).isVisible() && await sheet.getByRole('button', { name: 'Privacy Policy' }).isVisible()
    && await sheet.getByRole('button', { name: 'Restore purchases' }).isVisible(), 'Terms of Use, Privacy Policy and Restore purchases');
  check(!(await sheet.getByText(/free trial/i).isVisible().catch(() => false)), 'no trial promised on Android (Google shows the terms)');
  await page.screenshot({ path: `${OUT}android-1-plans.png` });

  a.next = 'cancel';
  await sheet.getByRole('button', { name: 'Get 1 month for ₹999.00' }).click();
  await page.waitForTimeout(800);
  check(await sheet.locator('[role=alert]').count() === 0 && await sheet.getByRole('button', { name: /^Get / }).isEnabled(),
    'closing the payment sheet: no error, still on the plans');

  await sheet.getByRole('button', { name: 'Get 1 month for ₹999.00' }).click();
  await page.getByText('Welcome to Shaadi24+').waitFor({ timeout: 15000 });
  const bought = callsTo(a, 'purchaseProduct').at(-1)?.options;
  check(bought?.productIdentifier === 'shaadi24_plus' && bought.planIdentifier === 'monthly' && bought.productType === 'subs'
    && bought.appAccountToken === me, `bought shaadi24_plus / monthly for this account (${JSON.stringify(bought)})`);
  check(a.functions.some((f) => f.name === 'store-billing' && f.body.includes('"verify"')) && !a.functions.some((f) => f.name === 'billing'),
    'the purchase went to store-billing to be checked (never Razorpay)');
  check(subOf('google_play') === 'active|monthly' && tier() === 'PRO', 'checked with Google: Pro on, monthly');
  check(await sheet.getByText(/renews automatically through Google Play/).isVisible(), 'the welcome says Google Play renews it');
  await page.screenshot({ path: `${OUT}android-2-welcome.png` });
  await sheet.getByRole('button', { name: 'Start exploring' }).click();

  await openMenuItem(page, 'Settings');
  const settings = page.getByTestId('subscription-settings');
  await settings.getByText(/billed by Google Play/).waitFor({ timeout: 15000 });
  check(await settings.getByText('Google Play', { exact: true }).first().isVisible(), 'Settings: billed by Google Play');
  await settings.getByRole('button', { name: 'Manage subscription' }).click();
  await page.waitForTimeout(300);
  check(callsTo(a, 'manageSubscriptions').length === 1, "Manage subscription opens Google Play's page");
  check(await settings.getByText('₹999').first().isVisible(), 'the payment is listed');
  const before = callsTo(a, 'getPurchases').length;
  await settings.getByRole('button', { name: 'Restore purchases' }).click();
  await page.getByText('Shaadi24+ restored.').waitFor({ timeout: 15000 });
  const restoreCall = callsTo(a, 'getPurchases').at(-1);
  check(callsTo(a, 'getPurchases').length > before && !('appAccountToken' in restoreCall.options), 'Restore purchases: every purchase on this Google account');
  await page.screenshot({ path: `${OUT}android-3-settings.png` });

  // A pending payment, then nothing on sale
  await store(`/__google/expire/${encodeURIComponent(a.owned[0])}`, {});
  check(tier() === 'FREE', '(the subscription ran out)');
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await openMenuItem(page, 'Get Shaadi24+');
  await page.locator('[role=dialog]').getByText('₹999.00').first().waitFor({ timeout: 15000 });
  a.next = 'pending';
  await page.locator('[role=dialog]').getByRole('button', { name: /^Get / }).click();
  await page.getByText(/waiting to go through/).waitFor({ timeout: 10000 });
  check(tier() === 'FREE', 'a pending payment: told it turns on once Google Play confirms; no Pro yet');
  await page.locator('[role=dialog]').getByRole('button', { name: 'Close' }).click();
  a.products = [];
  await openMenuItem(page, 'Get Shaadi24+');
  await page.getByText('Shaadi24+ is coming to the app soon.').waitFor({ timeout: 15000 });
  check(true, 'nothing on sale in Google Play yet: "coming to the app soon"');
  await page.context().close();

  // ======================================================================================
  log('2. iPhone');
  reset();
  const i = { products: IOS_PRODUCTS, owned: [], calls: [], next: null, trial: true };
  page = await appPage('ios', i);
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.__native.some((c) => c.pluginId === 'NativePurchases' && c.methodName === 'addListener'
    && c.options.eventName === 'transactionUpdated')), 'the app listens for App Store updates');
  await openMenuItem(page, 'Get Shaadi24+');
  const isheet = page.locator('[role=dialog]');
  await isheet.getByText('₹999.00').first().waitFor({ timeout: 15000 });
  check(await isheet.getByText(/1-week free trial for new subscribers, then ₹1,999\.00 every 3 months/).isVisible()
    && await isheet.getByRole('button', { name: 'Start your 1-week free trial' }).isVisible(), 'the free trial, then the price (3 months)');
  check(await isheet.getByText(/charged to your Apple ID/).isVisible() && await isheet.getByText(/at least 24 hours before/).isVisible(),
    "Apple's terms: Apple ID, renews unless turned off 24 hours before");
  await isheet.getByRole('radio', { name: /6 months/ }).click();
  check(await isheet.getByRole('radio', { name: /6 months/ }).getAttribute('aria-checked') === 'true'
    && await isheet.getByText(/then ₹2,999\.00 every 6 months/).isVisible(), '6 months chosen: the trial, then ₹2,999.00 every 6 months');
  await page.waitForTimeout(300);  // the highlight's colour change
  await page.screenshot({ path: `${OUT}ios-1-plans.png` });
  await isheet.getByRole('button', { name: 'Start your 1-week free trial' }).click();
  await page.getByText('Welcome to Shaadi24+').waitFor({ timeout: 15000 });
  const ibought = callsTo(i, 'purchaseProduct').at(-1)?.options;
  check(ibought?.productIdentifier === 'shaadi24_plus_halfyearly' && ibought.appAccountToken === me, 'bought shaadi24_plus_halfyearly for this account');
  check(subOf('app_store') === 'authenticated|halfyearly' && tier() === 'PRO', "checked by Apple's signature: Pro on, in the trial");
  check(await isheet.getByText(/Your free trial runs until/).isVisible() && await isheet.getByText(/the App Store charges you after that/).isVisible(),
    'the welcome says when the trial ends and that the App Store charges after');
  await isheet.getByRole('button', { name: 'Start exploring' }).click();

  // The trial ends and the App Store renews while the app runs
  const orig = i.owned[0];
  const renewal = await store(`/__apple/renew/${orig}`, {});
  const delivered = await page.evaluate((jws) => window.__transactionUpdated({ transactionId: 'x', jwsRepresentation: jws }), renewal.jws);
  await page.waitForTimeout(2000);
  check(delivered && i.functions.filter((f) => f.name === 'store-billing' && f.body.includes('"verify"')).length >= 2,
    'a renewal the App Store delivers is passed on to the server');
  check(subOf('app_store') === 'active|halfyearly' && sql(`select count(*) from payments where user_id = '${me}';`) === '1', 'now active, the charge recorded');

  await openMenuItem(page, 'Settings');
  const isettings = page.getByTestId('subscription-settings');
  await isettings.getByText(/billed by the App Store/).waitFor({ timeout: 15000 });
  await isettings.getByRole('button', { name: 'Manage subscription' }).click();
  await page.waitForTimeout(300);
  check(callsTo(i, 'manageSubscriptions').length === 1, "Settings: billed by the App Store; Manage subscription opens Apple's page");
  await page.screenshot({ path: `${OUT}ios-2-settings.png` });

  await page.getByRole('button', { name: 'Delete Account' }).click();
  await page.getByText('I need a break', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  const note = page.getByTestId('delete-subscription-note');
  await note.waitFor({ timeout: 10000 });
  check(await note.getByText("Your Shaadi24+ subscription won't stop by itself.").isVisible()
    && await note.getByRole('button', { name: 'Manage subscription' }).isVisible(),
    "deleting the account: warned that the App Store keeps charging until it's cancelled, with a way to cancel");
  await page.screenshot({ path: `${OUT}ios-3-delete.png` });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.context().close();
} catch (e) {
  failures++;
  log('ERROR', e.message);
} finally {
  reset();
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
