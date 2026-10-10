// Spotlight and Super Interest (lib/boosts.ts, components/BoostsView.tsx,
// SuperInterestSheet.tsx, AdminPacksCard.tsx), in Chromium with stand-ins for
// Capacitor's Android and iOS bridges: the purchase plugin's calls go to the
// Google Play / App Store stand-in (store-standin.cjs), and the real
// store-billing function checks every purchase. Shaadi24+ for everyone off.
//  1. Android: Menu → Spotlight shows Google Play's prices; buying a Spotlight
//     (the member's id goes with it) adds it, Google's purchase is consumed,
//     and it starts at once: "On now", about 24 hours left
//  2. Search: a man in the same city searches; the member comes first, marked
//     Spotlight, and the Spotlight counts the search
//  3. Super Interest from a profile: none left, so 5 are bought ("Save ₹46");
//     a rude note is refused; one is sent with a note; the man (no Shaadi24+)
//     sees who sent it and the note in Likes You, and is notified
//  4. A pack paid for later (a pending payment) is added by Google's notification
//     and isn't added twice when the app next opens
//  5. Refunds: Google voids the Spotlight, which ends; the Super Interests
//     refunded are taken back
//  6. iPhone: 1 Super Interest bought with the App Store (the transaction is
//     finished once added); Apple's refund takes it back
//  7. The website: Spotlight is bought in the app
//  8. Admin → Finance → Test purchases: the packs sold
// Usage: node boosts.mjs <admin email> <member email> <other member email>
//   (password TestPass!2026; the stand-in on STORE_STANDIN, the functions
//   served with its settings; ANON_KEY)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY;
const STORE = process.env.STORE_STANDIN || 'http://127.0.0.1:8790';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};
const [ADMIN, MEMBER, OTHER] = process.argv.slice(2);
if (!ADMIN || !MEMBER || !OTHER || !ANON) {
  console.error('usage: ANON_KEY=… node boosts.mjs <admin email> <member email> <other member email>');
  process.exit(2);
}
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/boosts/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const store = (path, body) => fetch(`${STORE}${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}).then((r) => r.json());
const until = async (fn, ms = 10000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await fn()) return true;
  return false;
};

const me = sql(`select id from profiles where email = '${MEMBER}';`);
const him = sql(`select id from profiles where email = '${OTHER}';`);
const searcher = sql(`select id from profiles where email = '${ADMIN}';`);
const [cityBefore, stateBefore] = sql(`select coalesce(city, '') || '|' || coalesce(state, '') from profiles where id = '${searcher}';`).split('|');
const credits = (kind) => Number(sql(`select coalesce((select balance from member_credits where user_id = '${me}' and kind = '${kind}'), 0);`));
const cleanup = () => sql(`
  delete from payments where user_id = '${me}' and product_id is not null;
  delete from member_credits where user_id = '${me}';
  delete from spotlights where user_id = '${me}';
  delete from likes where liker_id = '${me}' and liked_id = '${him}';
  delete from likes where liker_id = '${searcher}' and liked_id = '${me}';
  delete from push_queue where user_id = '${him}' and event_type = 'super_like';`);
cleanup();
const hobbiesBefore = sql(`select coalesce(hobbies, '') from profiles where id = '${him}';`);
const verifiedBefore = sql(`select coalesce(is_verified::text, 'false') from profiles where id = '${searcher}';`);
sql(`update app_settings set pro_for_all = false;
     update profiles set subscription_tier = 'FREE' where id in ('${me}', '${him}');
     update profiles set is_paused = false where id = '${me}';
     update profiles set hobbies = concat_ws(', ', nullif(hobbies, ''), 'zebracorn') where id = '${him}';
     update profiles set is_verified = true where id in ('${me}', '${searcher}');
     delete from search_usage where user_id in ('${me}', '${searcher}');`);

// ---- What the stores sell, and the bridges ---------------------------------------------

const PACKS = [
  ['spotlight_24h', 'Spotlight (24 hours)', 149], ['super_interest_1', '1 Super Interest', 49], ['super_interest_5', '5 Super Interests', 199],
];
const products = (prefix) => PACKS.map(([id, title, rupees]) => ({
  identifier: `${prefix}${id}`, title, description: title, price: rupees, priceString: `₹${rupees}.00`,
  currencyCode: 'INR', currencySymbol: '₹', isFamilyShareable: false, discounts: [], introductoryPrice: null,
}));

const PURCHASE_METHODS = ['getProducts', 'getProduct', 'purchaseProduct', 'getPurchases', 'restorePurchases',
  'manageSubscriptions', 'acknowledgePurchase', 'consumePurchase', 'isBillingSupported', 'removeAllListeners'];
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
      if (call.callbackId === '-1' || call.methodName === 'addListener') return;
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
  `;
}

// The store's side of the purchase plugin, for packs (subscriptions: app-purchases.mjs)
function storeSide(platform, state) {
  return async (call) => {
    const o = call.options || {};
    state.calls.push({ method: call.methodName, options: o });
    switch (call.methodName) {
      case 'getProducts':
        return { data: { products: o.productType === 'inapp' ? state.products.filter((p) => o.productIdentifiers.includes(p.identifier)) : [] } };
      case 'purchaseProduct': {
        if (platform === 'android') {
          const p = await store('/__google/buyitem', { userId: o.appAccountToken, product: o.productIdentifier, pending: state.pendingNext });
          const tx = { transactionId: p.orderId ?? p.purchaseToken, purchaseToken: p.purchaseToken, orderId: p.orderId,
            productIdentifier: o.productIdentifier, purchaseState: state.pendingNext ? '2' : '1', isAcknowledged: false };
          state.unconsumed.push(tx);
          state.bought.push({ product: o.productIdentifier, token: p.purchaseToken });
          if (state.pendingNext) { state.pendingNext = false; return { error: { message: 'Purchase is pending' } }; }
          return { data: tx };
        }
        const a = await store('/__apple/buyitem', { userId: o.appAccountToken, product: o.productIdentifier });
        state.unfinished.push(a.transactionId);
        return { data: { transactionId: a.transactionId, productIdentifier: o.productIdentifier, jwsRepresentation: a.jws } };
      }
      case 'getPurchases':
        if (o.productType !== 'inapp') return { data: { purchases: [] } };
        return { data: { purchases: platform === 'android' ? state.unconsumed : [] } };
      case 'consumePurchase':
        state.unconsumed = state.unconsumed.filter((t) => t.purchaseToken !== o.purchaseToken);
        return { data: {} };
      case 'acknowledgePurchase':
        state.unfinished = state.unfinished.filter((id) => id !== o.purchaseToken);
        return { data: {} };
      default:
        return { data: {} };
    }
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function signIn(page, email) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
}

async function appPage(platform, state, email = MEMBER) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  if (platform) {
    await ctx.exposeFunction('__store', storeSide(platform, state));
    await ctx.addInitScript({ content: standin(platform) });
    await ctx.addInitScript({ path: BRIDGE[platform] });
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await signIn(page, email);
  return page;
}
const openMenuItem = (page, text) => page.getByText(text, { exact: true }).first().click();

// A search as the man would make it, through the search function
async function searchAs(email) {
  const auth = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
  }).then((r) => r.json());
  return fetch(`${API}/functions/v1/search`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'search', prompt: '' }),
  }).then((r) => r.json());
}

try {
  log('1. Android: Spotlight');
  const a = { products: products(''), calls: [], unconsumed: [], unfinished: [], bought: [], pendingNext: false };
  let page = await appPage('android', a);
  await openMenuItem(page, 'Spotlight');
  const card = page.getByTestId('spotlight-card');
  await card.getByRole('button', { name: /Get Spotlight/ }).waitFor({ timeout: 15000 });
  check((await card.innerText()).includes('₹149.00'), "Google Play's price: ₹149.00");
  check((await page.getByTestId('super-interest-card').innerText()).includes('Save ₹46'), '5 Super Interests: "Save ₹46"');
  await page.screenshot({ path: `${OUT}1-spotlight.png` });
  await card.getByRole('button', { name: /Get Spotlight/ }).click();
  await page.getByTestId('spotlight-left').waitFor({ timeout: 15000 });
  const bought = a.calls.find((c) => c.method === 'purchaseProduct')?.options;
  check(bought?.productIdentifier === 'spotlight_24h' && bought.productType === 'inapp' && bought.appAccountToken === me
    && bought.autoAcknowledgePurchases === false, `bought spotlight_24h for this account, finished only once added (${JSON.stringify(bought)})`);
  const spotToken = a.bought.find((b) => b.product === 'spotlight_24h')?.token;
  const atGoogle = spotToken ? await store(`/__google/item/${encodeURIComponent(spotToken)}`) : {};
  check(atGoogle.consumed === true, 'consumed at Google, so it can be bought again');
  check(/23 h 5\d min left|24 h 0 min left/.test(await page.getByTestId('spotlight-left').innerText()) && (await card.innerText()).includes('On now'),
    `on now: ${await page.getByTestId('spotlight-left').innerText()}`);
  check(sql(`select count(*) || '|' || coalesce(sum(amount), 0) || '|' || max(mode) from payments where user_id = '${me}' and product_id = 'spotlight_24h';`) === '1|14900|test',
    'the charge is recorded once: ₹149, a test purchase');
  await page.screenshot({ path: `${OUT}2-spotlight-on.png` });

  log('2. Search: Spotlight first, marked');
  sql(`update profiles set city = (select city from profiles where id = '${me}'), state = (select state from profiles where id = '${me}') where id = '${searcher}';`);
  const result = await searchAs(ADMIN);
  const first = result.candidates?.[0];
  const mine = result.candidates?.find((c) => c.id === me);
  check(!!mine, `the member is in the man's results (${result.candidates?.length ?? result.error} results)`);
  if (mine) {
    check(mine.compatibilityScore < 50 || (first?.id === me && first.spotlight === true),
      `first and marked Spotlight (score ${mine.compatibilityScore}; first: ${first?.name})`);
  }
  check(await until(() => sql(`select views from spotlights where user_id = '${me}' and ends_at > now();`) === '1'), 'the Spotlight counted the search');

  log('3. Super Interest');
  const hisName = sql(`select split_part(trim(name), ' ', 1) from profiles where id = '${him}';`);
  // A word only his profile has, for her to find him by
  await openMenuItem(page, 'Find Match');
  await page.getByTestId('find-match-box').fill('zebracorn');
  await page.getByTestId('find-match-box').press('Enter');
  const hisFullName = sql(`select trim(name) from profiles where id = '${him}';`);
  // By his id: other test members share his name
  const hisCard = page.getByTestId('results-grid').locator(`[data-candidate-id="${him}"]`);
  await hisCard.waitFor({ timeout: 20000 });
  await hisCard.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}3-his-profile.png` });
  const siButton = page.getByRole('button', { name: `Send ${hisFullName} a Super Interest` });
  check(await siButton.waitFor({ timeout: 15000 }).then(() => true, () => false), 'his profile has a Super Interest button');
  await siButton.click();
  const sheet = page.getByTestId('super-interest-sheet');
  await sheet.waitFor();
  await sheet.getByRole('button', { name: /5 Super Interests/ }).waitFor({ timeout: 10000 });
  check((await sheet.getByTestId('super-interest-allowance').innerText()).includes('no Super Interests'), 'none yet: the packs to buy');
  await page.screenshot({ path: `${OUT}3-super-interest-buy.png` });
  await sheet.getByRole('button', { name: /5 Super Interests/ }).click();
  await sheet.getByRole('button', { name: 'Send Super Interest' }).waitFor({ timeout: 15000 });
  check(credits('super_interest') === 5 && (await sheet.getByTestId('super-interest-allowance').innerText()).includes('You have 5'), '5 added');
  await sheet.getByRole('textbox').fill('you are a bitch');
  await sheet.getByRole('button', { name: 'Send Super Interest' }).click();
  check(await sheet.getByRole('alert').filter({ hasText: /kind and respectful/ }).waitFor({ timeout: 10000 }).then(() => true, () => false)
    && credits('super_interest') === 5, 'a rude note is refused, nothing used');
  await sheet.getByRole('textbox').fill('Namaste! We both love trekking. Would love to talk.');
  await page.screenshot({ path: `${OUT}4-super-interest-note.png` });
  await sheet.getByRole('button', { name: 'Send Super Interest' }).click();
  await page.getByText(`Super Interest sent to ${hisFullName}`).waitFor({ timeout: 10000 });
  check(sql(`select super_source || '|' || note from likes where liker_id = '${me}' and liked_id = '${him}';`) === 'credit|Namaste! We both love trekking. Would love to talk.'
    && credits('super_interest') === 4, 'sent with a bought one (4 left), the note saved');
  check(/sent you a Super Interest/.test(sql(`select title from push_queue where user_id = '${him}' and event_type = 'super_like' order by created_at desc limit 1;`)),
    'he is notified');

  const hp = await appPage(null, null, OTHER);
  await openMenuItem(hp, 'Likes You');
  const note = hp.getByTestId('super-interest-note').first();
  check(await note.waitFor({ timeout: 15000 }).then(() => true, () => false) && (await note.innerText()).includes('trekking'),
    'Likes You (no Shaadi24+): her note');
  const herName = sql(`select split_part(trim(name), ' ', 1) from profiles where id = '${me}';`);
  check((await hp.locator('main').innerText()).includes(herName), `and who sent it (${herName}), not blurred`);
  await hp.screenshot({ path: `${OUT}5-likes-you.png` });
  await hp.context().close();

  log('4. A payment that went through later');
  a.pendingNext = true;
  await openMenuItem(page, 'Spotlight');
  await page.getByTestId('super-interest-card').getByRole('button', { name: /^1 Super Interest/ }).click();
  await page.getByText(/Waiting for the payment/).waitFor({ timeout: 10000 });
  check(credits('super_interest') === 4, 'pending: nothing added yet');
  const pending = a.unconsumed.find((t) => t.purchaseState === '2');
  await store(`/__google/payitem/${encodeURIComponent(pending.purchaseToken)}`, {});
  check(await until(() => credits('super_interest') === 5), "Google's notification adds it once paid");
  pending.purchaseState = '1';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(2500);
  check(credits('super_interest') === 5 && a.calls.some((c) => c.method === 'consumePurchase' && c.options.purchaseToken === pending.purchaseToken),
    'the app sends it again on opening: not added twice, and finished');

  log('5. Refunds');
  await store(`/__google/refunditem/${encodeURIComponent(spotToken)}`, {});
  check(await until(() => sql(`select count(*) from spotlights where user_id = '${me}' and ends_at > now();`) === '0'),
    'the Spotlight refunded ends');
  const fiveToken = a.bought.find((b) => b.product === 'super_interest_5')?.token;
  await store(`/__google/refunditem/${encodeURIComponent(fiveToken)}`, {});
  check(await until(() => credits('super_interest') === 0), 'the 5 refunded are taken back (5 − 5)');
  await page.context().close();

  log('6. iPhone');
  const i = { products: products('shaadi24_'), calls: [], unconsumed: [], unfinished: [], bought: [] };
  page = await appPage('ios', i);
  await openMenuItem(page, 'Spotlight');
  const siCard = page.getByTestId('super-interest-card');
  await siCard.getByRole('button', { name: /^1 Super Interest/ }).waitFor({ timeout: 15000 });
  await siCard.getByRole('button', { name: /^1 Super Interest/ }).click();
  check(await until(() => credits('super_interest') === 1), 'App Store: 1 Super Interest added');
  check(await until(() => i.unfinished.length === 0) && i.calls.some((c) => c.method === 'acknowledgePurchase'), 'the transaction is finished');
  const appleTx = sql(`select store_order_id from payments where user_id = '${me}' and product_id = 'super_interest_1' and provider = 'app_store';`);
  check(sql(`select amount from payments where store_order_id = '${appleTx}';`) === '4900', "Apple's price recorded: ₹49");
  await store(`/__apple/refunditem/${appleTx}`, {});
  check(await until(() => credits('super_interest') === 0), "Apple's refund takes it back");
  await page.context().close();

  log('7. The website');
  page = await appPage(null, null);
  await openMenuItem(page, 'Spotlight');
  await page.getByTestId('spotlight-card').waitFor({ timeout: 15000 });
  check(/bought in the Shaadi24 app \(₹149\)/.test(await page.getByTestId('spotlight-card').innerText()), 'Spotlight is bought in the app (₹149)');
  await page.context().close();

  log('8. Admin → Finance');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const ap = await ctx.newPage();
  await signIn(ap, ADMIN);
  await ap.getByText('Admin', { exact: true }).first().click();
  await ap.getByTestId('admin-sidebar').getByRole('button', { name: /^Finance/ }).click();
  await ap.getByRole('button', { name: 'Test purchases' }).click();
  const packs = ap.getByTestId('finance-packs');
  await packs.waitFor({ timeout: 15000 });
  await ap.waitForTimeout(800);
  const t = await packs.innerText();
  check(/Packs sold\s*4/.test(t) && t.includes('Spotlight (24 hours)') && /Super Interests sent\s*[1-9]/.test(t), `4 packs sold, a Super Interest sent (${t.split('\n').slice(0, 10).join(' | ')})`);
  await packs.screenshot({ path: `${OUT}6-admin-finance.png` });
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL', e.message.split('\n').slice(0, 6).join('\n'));
} finally {
  cleanup();
  sql(`update app_settings set pro_for_all = true;
       update profiles set city = nullif('${cityBefore}', ''), state = nullif('${stateBefore}', '') where id = '${searcher}';
       update profiles set hobbies = nullif('${hobbiesBefore.replace(/'/g, "''")}', '') where id = '${him}';
       update profiles set is_verified = ${verifiedBefore === 'true'} where id = '${searcher}';`);
  await browser.close();
}
log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
