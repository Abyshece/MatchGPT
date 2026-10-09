// Click-through: every button in the phone apps, one at a time.
//
// In Chromium at phone size, as the Android app and as the iPhone app (with
// Capacitor's real bridge script and a stand-in for the native side, like
// android-app.mjs and ios-app.mjs). From each screen (signed out: the welcome
// screen; signed in: every tab, search results, the menu) it finds every
// control a person can tap (buttons, links, tabs, switches, anything with a
// pointer cursor), taps it, and records what happened:
//   - a new screen or popup, a change on the screen, a request to the
//     server, a call to the phone (the store, notifications), a link out
//   - or nothing at all, which is worth a look
//   - and any error: a crash in the page, a console error, a failed request
// Screens and popups a tap opens are explored the same way, two taps deep.
// Final confirmations (Unmatch, Block, Submit Report, deleting the account)
// are never tapped; their dialogs are. window.confirm() is answered Cancel.
//
// Makes its own account (crawler_<time>@shaadigpt.dev) with a match and a
// message, and someone who liked it, so every screen has something on it.
//
// Usage: node click-through.mjs [android|ios|both] [maxDepth=2] [start screens, e.g. "Chat,Settings"]
// Writes .shots/click-through/<platform>.json and .md (every tap and what it did)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED, REQUIRED_DETAILS } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};
const which = process.argv[2] || 'both';
const MAX_DEPTH = Number(process.argv[3] || 2);
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const PLATFORMS = which === 'both' ? ['android', 'ios'] : [which];
const OUT = new URL('./.shots/click-through/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
const PASSWORD = 'TestPass!2026';
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is needed (to make the account)'); process.exit(2); }

// ---- The account --------------------------------------------------------------------

const EMAIL = `crawler_${Date.now()}@shaadigpt.dev`;
const made = await fetch(`${API}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
}).then((r) => r.json());
const me = made.id;
if (!me) { console.error('could not make the account', made); process.exit(1); }
const seed = sql(`select id from profiles where gender = 'Male' and onboarding_complete and array_length(photo_urls, 1) >= 2
  and email like 'seed_%' order by email limit 1;`);
sql(`update profiles p set
       (date_of_birth, height, religion, mother_tongue, description, photo_urls, job_title, education_level, hobbies,
        languages, dietary_preferences, smoking, drinking, marital_status)
     = (select s.date_of_birth, s.height, s.religion, s.mother_tongue, s.description, s.photo_urls, s.job_title,
               s.education_level, s.hobbies, s.languages, s.dietary_preferences, s.smoking, s.drinking, s.marital_status
          from profiles s where s.id = '${seed}')
     where p.id = '${me}';
     update profiles set name = 'Crawler Test', gender = 'Male', interested_in = 'Women', onboarding_complete = true,
       city = 'Mumbai', state = 'Maharashtra', country = 'India' where id = '${me}';
     update profiles set ${REQUIRED_DETAILS}, ${CONSENTED} where id = '${me}';`);
// Two women: one matched (with a message from her), one who liked him
const [her, fan] = sql(`select id from profiles where gender = 'Female' and onboarding_complete and not coalesce(is_banned, false)
  and not coalesce(is_paused, false) and email like 'seed_%' order by email limit 2;`).split('\n');
sql(`insert into matches (user_a_id, user_b_id) values (least('${me}'::uuid, '${her}'::uuid), greatest('${me}'::uuid, '${her}'::uuid));
     insert into messages (match_id, sender_id, content)
       select id, '${her}', 'Hi! Nice to meet you here.' from matches where '${me}' in (user_a_id, user_b_id);
     insert into likes (liker_id, liked_id) values ('${fan}', '${me}');`);
const freshen = () => sql(`delete from search_usage where user_id = '${me}';
  update profiles set daily_like_count = 0, daily_search_count = 0, is_paused = false where id = '${me}';`);
log(`account ${EMAIL}`);

// ---- The phone's side ------------------------------------------------------------------

const products = (platform) => {
  const p = (identifier, plan, price, priceString, months) => ({
    identifier, planIdentifier: platform === 'android' ? 'shaadi24_plus' : undefined, offerToken: `base-${plan}`,
    title: 'Shaadi24+', description: 'Unlimited searches and likes', currencyCode: 'INR', currencySymbol: '₹',
    price, priceString, subscriptionGroupIdentifier: '21500001', discounts: [], introductoryPrice: null,
    subscriptionPeriod: months ? { numberOfUnits: months, unit: 2 } : { numberOfUnits: 1, unit: 1 },
  });
  const id = (plan) => (platform === 'android' ? plan : `shaadi24_plus_${plan}`);
  return [p(id('weekly'), 'weekly', 499, '₹499.00', 0), p(id('monthly'), 'monthly', 999, '₹999.00', 1),
    p(id('quarterly'), 'quarterly', 1999, '₹1,999.00', 3), p(id('halfyearly'), 'halfyearly', 2999, '₹2,999.00', 6)]
    .map((x) => (platform === 'android' ? { ...x, identifier: x.identifier, planIdentifier: x.identifier } : x));
};
const methods = (names) => JSON.stringify(names.map((name) => ({ name, rtype: name.endsWith('Listener') ? 'callback' : 'promise' })));
function standin(platform) {
  const send = platform === 'android'
    ? `window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
         if (call.pluginId === 'Console' || call.type === 'js.error') return; answer(call); } };`
    : `window.webkit = { messageHandlers: { bridge: { postMessage(call) {
         if (call.pluginId === 'Console' || call.type !== 'message') return; answer(call); } } } };`;
  const bars = platform === 'android'
    ? `{ name: 'AppWindow', methods: ${methods(['setTheme'])} }`
    : `{ name: 'SystemBars', methods: ${methods(['setStyle', 'show', 'hide'])} }`;
  return `
    window.__native = [];
    const PRODUCTS = ${JSON.stringify(products(platform))};
    const REPLIES = {
      'NativePurchases.getProducts': { products: PRODUCTS },
      'NativePurchases.getPurchases': { purchases: [] },
      'NativePurchases.isBillingSupported': { isBillingSupported: true },
      'FirebaseMessaging.checkPermissions': { receive: 'granted' },
      'FirebaseMessaging.requestPermissions': { receive: 'granted' },
      'FirebaseMessaging.getToken': { token: 'click-through-' + 'x'.repeat(140) },  // as long as a real one
      'App.getInfo': { name: 'Shaadi24', id: 'com.shaadi24.app', build: '1', version: '1.0.0' },
    };
    // The store's payment sheet, closed by the person: nothing bought
    const ERRORS = {
      'NativePurchases.purchaseProduct': ${platform === 'android'
        ? `{ message: 'Purchase is not purchased', code: 'USER_CANCELED' }` : `{ message: 'User cancelled' }`},
    };
    function answer(call) {
      window.__native.push({ plugin: call.pluginId, method: call.methodName, at: Date.now() });
      // Listeners wait for events; the phone never answers removeListener (Capacitor passes it the listener)
      if (call.callbackId === '-1' || call.methodName === 'addListener' || call.methodName === 'removeListener') return;
      const key = call.pluginId + '.' + call.methodName;
      setTimeout(() => window.Capacitor.fromNative(Object.assign(
        { callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: !ERRORS[key] },
        ERRORS[key] ? { error: ERRORS[key] } : { data: REPLIES[key] || {} })));
    }
    ${send}
    window.Capacitor = { PluginHeaders: [
      { name: 'App', methods: ${methods(['addListener', 'removeListener', 'removeAllListeners', 'minimizeApp', 'getInfo', 'exitApp'])} },
      { name: 'SplashScreen', methods: ${methods(['show', 'hide'])} },
      ${bars},
      { name: 'NativePurchases', methods: ${methods(['getProducts', 'getProduct', 'purchaseProduct', 'getPurchases', 'restorePurchases',
        'manageSubscriptions', 'acknowledgePurchase', 'isBillingSupported', 'addListener', 'removeListener', 'removeAllListeners'])} },
      { name: 'FirebaseMessaging', methods: ${methods(['checkPermissions', 'requestPermissions', 'getToken', 'deleteToken',
        'createChannel', 'addListener', 'removeListener', 'removeAllListeners'])} },
      { name: 'SocialLogin', methods: ${methods(['initialize', 'login', 'logout', 'isLoggedIn', 'getAuthorizationCode', 'refresh'])} },
    ] };
    window.confirm = (text) => { (window.__confirms ||= []).push(String(text)); return false; };
    // Links a tap follows (or that open outside the app: a new window, the mail app)
    window.__links = [];
    // (caught on the way down: popups stop clicks from bubbling up; followed unless prevented)
    window.addEventListener('click', (e) => {
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (a && !a.getAttribute('href').startsWith('#')) setTimeout(() => { if (!e.defaultPrevented) window.__links.push(a.href); });
    }, true);
    const open = window.open;
    window.open = function (url, ...rest) { window.__links.push(String(url)); return open.call(window, url, ...rest); };
    window.alert = (text) => { (window.__alerts ||= []).push(String(text)); };
    localStorage.setItem('shaadigpt_cookie_consent_shown', '1');
  `;
}

// ---- Looking at the page ------------------------------------------------------------------

// Runs in the page: the controls in the top layer (the popup on top, else the page)
const FIND = () => {
  const showing = (el) => {
    const s = getComputedStyle(el);
    return el.getClientRects().length > 0 && s.visibility !== 'hidden' && s.pointerEvents !== 'none';
  };
  const z = (el) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
  const popups = [...document.querySelectorAll('.popup-backdrop, [data-popup], [role=dialog]')].filter(showing);
  const top = popups.reduce((t, el) => (!t || z(el) >= z(t) ? el : t), null);
  const scope = document.body;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Only the first two of a list of look-alikes (result cards, likes, picks)
  const laterInList = (el) => {
    for (let a = el; a && a.parentElement && a !== document.body; a = a.parentElement) {
      const sibs = [...a.parentElement.children].filter((x) => x.tagName === a.tagName && x.className === a.className);
      if (sibs.length >= 4 && typeof a.className === 'string' && a.className.length > 20) return sibs.indexOf(a) >= 2;
    }
    return false;
  };
  // Can a finger reach it: on screen, the topmost thing where it is; off
  // screen, in the popup on top (or anywhere, when there's no popup)
  const reachable = (el, r) => {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cy >= 0 && cy <= vh && cx >= 0 && cx <= vw) {
      const at = document.elementFromPoint(cx, cy);
      return !!at && (el === at || el.contains(at));
    }
    return top ? top.contains(el) : true;
  };
  for (const old of document.querySelectorAll('[data-ct]')) old.removeAttribute('data-ct');
  const SEL = 'button, a[href], [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=menuitem], [role=option], [role=link], input[type=checkbox], input[type=radio], select, summary, label[for]';
  const all = [...scope.querySelectorAll('*')];
  const found = [];
  for (const el of all) {
    const tappable = el.matches(SEL) || (getComputedStyle(el).cursor === 'pointer' && !el.parentElement?.closest(SEL)
      && getComputedStyle(el.parentElement || el).cursor !== 'pointer');
    if (!tappable) continue;
    // Typing boxes are for typing, not tapping (and so are their labels)
    const TYPING = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), [contenteditable=true]';
    if (el.matches(TYPING)) continue;
    if (el.tagName === 'LABEL' && (el.control?.matches(TYPING) || el.querySelector(TYPING))) continue;
    if (el.closest('[aria-hidden=true], [inert]') || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    if (!showing(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.left >= vw) continue;  // off-screen drawers
    if (!reachable(el, r) || laterInList(el)) continue;
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('alt')
      || el.querySelector('img')?.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('href') || el.tagName)
      .replace(/\s+/g, ' ').trim().slice(0, 70);
    const role = el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'SELECT' ? 'select'
      : el.tagName === 'INPUT' ? el.type : el.tagName === 'BUTTON' ? 'button' : 'tappable');
    found.push({ el, role, name });
  }
  const seen = new Map();
  return found.map(({ el, role, name }) => {
    const key = `${role}|${name}`;
    const nth = seen.get(key) || 0;
    seen.set(key, nth + 1);
    const id = `${key}|${nth}`;
    el.setAttribute('data-ct', id);
    return { id, role, name, nth, href: el.getAttribute('href') || null, inPopup: !!top && top.contains(el) };
  });
};

// Runs in the page: what's on the screen, to tell whether a tap changed anything
const SNAP = () => {
  const showing = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
    && getComputedStyle(el).pointerEvents !== 'none';
  // Popups and drawers on screen, by name (the menu drawer has none: "Menu")
  const popups = [...document.querySelectorAll('.popup-backdrop, [data-popup], [role=dialog]')].filter(showing)
    .map((el) => (el.getAttribute('aria-label') || el.querySelector('h1, h2, h3, [id$=title]')?.innerText || el.innerText.slice(0, 40)
      || 'Menu').replace(/\s+/g, ' ').trim().slice(0, 50));
  const header = document.querySelector('header h1, main h1, h1')?.innerText?.trim() || '';
  const states = [...document.querySelectorAll('[aria-checked], [aria-pressed], [aria-expanded], [aria-selected], input, select, textarea')]
    .map((el) => `${el.getAttribute('aria-checked')}${el.getAttribute('aria-pressed')}${el.getAttribute('aria-expanded')}${el.getAttribute('aria-selected')}${el.value ?? ''}${el.checked ?? ''}`).join(',');
  const scrolls = [...document.querySelectorAll('*')].filter((el) => el.scrollTop > 0).map((el) => Math.round(el.scrollTop)).join(',');
  // The photos showing (a carousel or a thumbnail changes only which)
  const photos = [...document.images].filter((i) => i.getClientRects().length).map((i) => i.currentSrc || i.src).join('|');
  let text = document.body.innerText;
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  let s = 0;
  for (let i = 0; i < states.length; i++) s = (s * 31 + states.charCodeAt(i)) | 0;
  return { url: location.pathname + location.hash, header, popups, text: h, states: s, scrolls, photos, focus: document.activeElement?.tagName,
    textLen: text.length, native: (window.__native || []).length, confirms: (window.__confirms || []).length,
    links: (window.__links || []).length };
};

// The screen as a key: which tab and which popups (however it was reached)
const keyOf = (snap) => `${snap.header}|${JSON.stringify(snap.popups)}`;
// Of controls that repeat (an Edit button on every row, the options of a
// list), a few stand for the rest
const sample = (controls) => controls.filter((c) => (['radio', 'option', 'menuitem'].includes(c.role) ? c.nth < 1 : c.nth < 3)
  && controls.filter((x) => x.role === c.role && ['radio', 'option'].includes(c.role)).indexOf(c) < 4);

// ---- The run --------------------------------------------------------------------------------

const DENY = /^(Unmatch|Block|Submit Report|Delete (my )?account( permanently| forever)?|Yes, delete.*|Delete forever|Delete everything)$/i;
const NOISE = /\/rest\/v1\/rpc\/(touch_last_active|heartbeat)|\/realtime\/|\/auth\/v1\/token|\/storage\/v1\/object\/public/;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function runPlatform(platform) {
  const screen = platform === 'ios' ? { width: 393, height: 852 } : { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: screen, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: standin(platform) });
  await ctx.addInitScript({ path: BRIDGE[platform] });
  const page = await ctx.newPage();
  const events = { errors: [], requests: [], failed: [], popups: [], files: 0, downloads: 0 };
  page.on('pageerror', (e) => events.errors.push(`page error: ${e.message.split('\n')[0]}`));
  page.on('console', (m) => { if (m.type() === 'error') events.errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('request', (r) => {
    const u = r.url();
    if ((u.includes(':54321') || u.includes('/functions/')) && !NOISE.test(u) && r.method() !== 'OPTIONS') {
      events.requests.push(`${r.method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`);
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !NOISE.test(r.url())) events.failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`);
  });
  ctx.on('page', (p) => { events.popups.push(p.url()); p.close().catch(() => {}); });
  page.on('filechooser', () => { events.files++; });
  page.on('download', (d) => { events.downloads++; d.cancel().catch(() => {}); });

  const results = [];
  const explored = new Set();
  const settle = async (ms = 700) => {
    await page.waitForTimeout(ms);
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
  };
  const signedIn = () => page.getByTestId('find-match-box').isVisible().catch(() => false);
  const signIn = async () => {
    await page.goto(BASE);
    await page.waitForTimeout(800);
    if (await page.getByRole('button', { name: 'Sign in' }).first().isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Sign in' }).first().click();
      await page.getByRole('button', { name: /Continue with Email/ }).click();
      await page.locator('input[type=email]').fill(EMAIL);
      await page.locator('input[type=password]').fill(PASSWORD);
      await page.locator('form').getByRole('button', { name: /Log In/i }).click();
    }
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    await settle(500);
  };
  const signOutFully = async () => {
    await page.goto(BASE);
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k); });
    await page.goto(BASE);
    await settle(800);
  };
  const menu = async (label) => {
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
    await settle();
  };
  const search = async () => {
    freshen();
    await menu('Find Match');
    const box = page.getByTestId('find-match-box');
    await box.fill('someone kind');
    await box.press('Enter');
    await page.getByTestId('results-grid').waitFor({ timeout: 20000 });
    await settle(800);
  };

  // Where each exploration starts
  const ROOTS = [
    { name: 'Welcome (signed out)', open: async () => { await signOutFully(); } },
    { name: 'Find Match', open: async () => { await signIn(); await menu('Find Match'); } },
    { name: 'Search results', open: async () => { await signIn(); await search(); } },
    { name: 'Menu', open: async () => { await signIn(); await page.getByRole('button', { name: 'Menu', exact: true }).first().click(); await settle(); } },
    { name: 'Search History', open: async () => { await signIn(); await menu('Search History'); } },
    { name: 'Likes You', open: async () => { await signIn(); await menu('Likes You'); } },
    { name: 'Matches', open: async () => { await signIn(); await menu('Matches'); } },
    // A chat opens inside Matches (the same header), so it starts here too
    { name: 'Chat', fresh: true, open: async () => {
      await signIn(); await menu('Matches');
      await page.getByRole('button', { name: /Nice to meet you here/ }).first().click(); await settle();
    } },
    { name: 'Standouts', open: async () => { await signIn(); await menu('Standouts'); } },
    { name: 'My Profile', open: async () => { await signIn(); await menu('My Profile'); } },
    { name: 'Settings', open: async () => { await signIn(); await menu('Settings'); } },
  ];

  // Bring the page to a screen: the root, then the taps on the way
  const replay = async (root, path) => {
    freshen();
    await root.open();
    for (const step of path) {
      const controls = await page.evaluate(FIND);
      const c = controls.find((x) => x.id === step.id) || controls.find((x) => x.role === step.role && x.name === step.name);
      if (!c) return false;
      await tap(c);
      await settle();
    }
    return true;
  };
  const tap = async (c) => {
    const loc = page.locator(`[data-ct="${c.id.replace(/"/g, '\\"')}"]`).first();
    if (c.role === 'select') {
      const values = await loc.evaluate((s) => [...s.options].map((o) => o.value));
      const current = await loc.inputValue();
      const next = values.find((v) => v !== current && v !== '') ?? values[0];
      await loc.selectOption(next);
      return;
    }
    await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    // Something else on top of it (a sheet, a sticky bar): a finger can't reach it
    await loc.click({ timeout: 3000 }).catch((e) => {
      throw new Error(/intercepts pointer events|not visible|outside of the viewport/.test(e.message) ? 'covered by something else' : e.message.split('\n')[0]);
    });
  };

  const explore = async (root, path, depth) => {
    if (!(await replay(root, path))) { log(`  could not get back to ${root.name} › ${path.map((p) => p.name).join(' › ')}`); return; }
    const where = [root.name, ...path.map((p) => p.name)].join(' › ');
    const before0 = await page.evaluate(SNAP);
    const controls = sample(await page.evaluate(FIND));
    // (a start screen that looks like another one, a chat inside Matches, is its own)
    const key = path.length === 0 && root.fresh ? root.name : keyOf(before0);
    if (explored.has(key)) return;
    explored.add(key);
    log(`${platform}: ${where} — ${controls.length} controls`);
    await page.screenshot({ path: `${OUT}${platform}-${explored.size}.png` });
    const children = [];
    for (const c of controls) {
      if (c.inPopup && DENY.test(c.name)) { results.push({ where, ...c, outcome: 'skipped (final confirmation)' }); continue; }
      // Back on this screen first, if the last tap left it
      const now = await page.evaluate(SNAP).catch(() => null);
      if (!now || now.header !== before0.header || JSON.stringify(now.popups) !== JSON.stringify(before0.popups) || now.url !== before0.url) {
        if (!(await replay(root, path))) break;
      }
      const list = await page.evaluate(FIND);
      const target = list.find((x) => x.id === c.id);
      if (!target) { results.push({ where, ...c, outcome: 'gone before its turn' }); continue; }
      const before = await page.evaluate(SNAP);
      const mark = { errors: events.errors.length, requests: events.requests.length, failed: events.failed.length,
        popups: events.popups.length, files: events.files, downloads: events.downloads };
      const nativeBefore = before.native;
      let tapError = null;
      try { await tap(target); } catch (e) { tapError = e.message.split('\n')[0]; }
      await settle();
      const after = await page.evaluate(SNAP).catch(() => null);
      const native = await page.evaluate((n) => (window.__native || []).slice(n).map((x) => `${x.plugin}.${x.method}`), nativeBefore).catch(() => []);
      const confirms = await page.evaluate((n) => (window.__confirms || []).slice(n), before.confirms).catch(() => []);
      const links = await page.evaluate((n) => (window.__links || []).slice(n), before.links).catch(() => []);
      const what = [];
      let opened = [];
      if (tapError) what.push(`could not tap: ${tapError}`);
      if (after) {
        if (after.url !== before.url) what.push(`page → ${after.url}`);
        if (after.header !== before.header) what.push(`screen → ${after.header || '(none)'}`);
        opened = after.popups.filter((p) => !before.popups.includes(p));
        const closed = before.popups.filter((p) => !after.popups.includes(p));
        if (opened.length) what.push(`opened: ${opened.join(' + ')}`);
        if (closed.length) what.push(`closed: ${closed.join(' + ')}`);
        if (!opened.length && !closed.length && after.header === before.header) {
          if (after.text !== before.text) what.push(`changed the screen (${after.textLen - before.textLen >= 0 ? '+' : ''}${after.textLen - before.textLen} chars)`);
          else if (after.states !== before.states) what.push('changed a control');
          else if (after.photos !== before.photos) what.push('changed the photo');
          else if (after.scrolls !== before.scrolls) what.push('scrolled');
        }
      }
      const reqs = events.requests.slice(mark.requests);
      if (reqs.length) what.push(`server: ${[...new Set(reqs)].slice(0, 4).join(', ')}`);
      if (native.length) what.push(`phone: ${[...new Set(native)].join(', ')}`);
      for (const l of [...new Set(links)]) {
        what.push(l.startsWith('mailto:') ? `opens the mail app (${l.slice(7, 40)})` : l.startsWith(BASE) ? `link: ${l.slice(BASE.length) || '/'}` : `opens outside the app: ${l}`);
      }
      if (events.files > mark.files) what.push('photo picker');
      if (events.downloads > mark.downloads) what.push('download');
      if (confirms.length) what.push(`asked: "${confirms[0].slice(0, 60)}" (answered Cancel)`);
      const errors = [...events.errors.slice(mark.errors), ...events.failed.slice(mark.failed)];
      const outcome = what.length ? what.join('; ') : 'NOTHING HAPPENED';
      results.push({ where, ...c, outcome, errors });
      if (errors.length || !what.length) log(`  ${!what.length ? '??' : '!!'} ${c.role} "${c.name}": ${outcome}${errors.length ? ` | ${errors.join(' | ')}` : ''}`);
      // A new screen or popup: explore it later
      if (after && depth < MAX_DEPTH && (after.header !== before.header || opened.length > 0)) {
        children.push({ id: c.id, role: c.role, name: c.name });
      }
    }
    for (const child of children) await explore(root, [...path, child], depth + 1);
  };

  for (const root of ROOTS.filter((r) => !ONLY || ONLY.includes(r.name))) {
    try { await explore(root, [], 0); } catch (e) { log(`  ${root.name} stopped: ${e.message.split('\n')[0]}`); }
  }
  await ctx.close();
  return results;
}

const all = {};
try {
  for (const platform of PLATFORMS) {
    log(`== ${platform}`);
    all[platform] = await runPlatform(platform);
    const r = all[platform];
    fs.writeFileSync(`${OUT}${platform}.json`, JSON.stringify(r, null, 1));
    const lines = [`# Click-through: ${platform}`, '', `${r.length} taps on ${new Set(r.map((x) => x.where)).size} screens`, ''];
    let where = null;
    for (const x of r) {
      if (x.where !== where) { where = x.where; lines.push('', `## ${where}`, ''); }
      lines.push(`- ${x.errors?.length ? '❌' : x.outcome === 'NOTHING HAPPENED' ? '⚠️' : '✓'} ${x.role} **${x.name}**: ${x.outcome}${x.errors?.length ? ` — ${x.errors.join(' | ')}` : ''}`);
    }
    fs.writeFileSync(`${OUT}${platform}.md`, lines.join('\n'));
    const bad = r.filter((x) => x.errors?.length).length;
    const quiet = r.filter((x) => x.outcome === 'NOTHING HAPPENED').length;
    log(`${platform}: ${r.length} taps, ${bad} with errors, ${quiet} with no visible effect`);
  }
} finally {
  await browser.close();
  // The account goes (its rows go with it)
  await fetch(`${API}/auth/v1/admin/users/${me}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {});
}
