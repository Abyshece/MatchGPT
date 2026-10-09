// ============================================================================
// A stand-in for the phone around the app (Capacitor's Android or iOS side),
// for browser tests that run the members' app as each phone sees it:
//   - Capacitor's real native-bridge.js runs (add BRIDGE[platform] after this)
//   - the plugins the app calls get a phone's answers: Play Store or App Store
//     plans and prices, notification permission and a token, the app version
//   - the store's payment sheet is closed by the person (nothing bought)
//   - window.__native lists every call; window.__links every link followed
//     (or opened outside the app); window.confirm answers Cancel unless
//     { confirm: true }
// Usage: await ctx.addInitScript({ content: standin('android') });
//        await ctx.addInitScript({ path: BRIDGE.android });
// ============================================================================

const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
export const BRIDGE = {
  android: `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`,
  ios: `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`,
};

const products = (platform) => {
  // Google Play: identifier = the base plan, planIdentifier = the subscription (as the plugin reports them)
  const p = (identifier, plan, price, priceString, months) => ({
    identifier, planIdentifier: platform === 'android' ? 'shaadi24_plus' : undefined, offerToken: `base-${plan}`,
    title: 'Shaadi24+', description: 'Unlimited searches and likes', currencyCode: 'INR', currencySymbol: '₹',
    price, priceString, subscriptionGroupIdentifier: '21500001', discounts: [], introductoryPrice: null,
    subscriptionPeriod: months ? { numberOfUnits: months, unit: 2 } : { numberOfUnits: 1, unit: 1 },
  });
  const id = (plan) => (platform === 'android' ? plan : `shaadi24_plus_${plan}`);
  return [p(id('weekly'), 'weekly', 499, '₹499.00', 0), p(id('monthly'), 'monthly', 999, '₹999.00', 1),
    p(id('quarterly'), 'quarterly', 1999, '₹1,999.00', 3), p(id('halfyearly'), 'halfyearly', 2999, '₹2,999.00', 6)];
};
const methods = (names) => JSON.stringify(names.map((name) => ({ name, rtype: name.endsWith('Listener') ? 'callback' : 'promise' })));
export function standin(platform, { confirm = false } = {}) {
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
    window.confirm = (text) => { (window.__confirms ||= []).push(String(text)); return ${confirm}; };
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
