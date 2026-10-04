// Stand-in for Google Play and the App Store, for trying MatchGPT+ bought in
// the phone apps locally, without store accounts; and for Firebase Cloud
// Messaging, which sends the apps' notifications.
//
// Google Play: answers the calls the store functions make (the service
// account's sign-in, checked like Google does; subscriptionsv2 get and cancel;
// acknowledge) and sends Real-time developer notifications the way Pub/Sub
// pushes them.
// App Store: makes a certificate chain like Apple's (root → intermediate →
// leaf, with Apple's marks) and signs transactions, renewal records and server
// notifications with it, the way Apple does.
//
// Test hooks (no auth). <token>: a Google purchase token; <orig>: an Apple
// original transaction id.
//   POST /__google/purchase {userId, basePlan, trial, test}  a purchase in the app
//                                         → {purchaseToken, orderId}
//   POST /__google/renew/<token>          the next period is charged (RENEWED)
//   POST /__google/cancel/<token>         renewal turned off (CANCELED)
//   POST /__google/grace/<token>          a renewal failed: grace period (IN_GRACE_PERIOD)
//   POST /__google/hold/<token>           still failing: on hold (ON_HOLD)
//   POST /__google/recover/<token>        payment fixed: charged again (RECOVERED)
//   POST /__google/expire/<token>         the period ran out (EXPIRED)
//   POST /__google/refund/<token>         the latest charge refunded and the
//                                         subscription revoked (voided purchase)
//   POST /__google/change/<token> {basePlan}  a change of plan: a new purchase
//                                         replacing this one → {purchaseToken, orderId}
//   POST /__google/resend                 the last notification again (same message id)
//   POST /__google/signin {ok}            ok false: the Play service account's sign-in is
//                                         refused, and the tokens it was given stop working
//   GET  /__google/purchase/<token>       what Google would answer
//   POST /__apple/purchase {userId, product, trial, environment}  a purchase in the app
//                                         → {jws, transactionId, originalTransactionId}
//   POST /__apple/renew/<orig>            the next period is charged (DID_RENEW) → {jws, transactionId}
//   POST /__apple/autorenew/<orig>?on=0|1 renewal turned off / on (DID_CHANGE_RENEWAL_STATUS)
//   POST /__apple/fail/<orig>?grace=1     a renewal failed (DID_FAIL_TO_RENEW, with
//                                         or without a grace period)
//   POST /__apple/expire/<orig>           the period ran out (EXPIRED)
//   POST /__apple/refund/<orig>?tx=<id>   a charge refunded (REFUND; default the latest)
//   POST /__apple/notify {payload}        signs and sends any notification payload
//   POST /__apple/sign {payload, chain}   signs any payload (chain "other": a look-alike
//                                         chain that isn't Apple's) → {jws}
//   GET  /__apple/latest/<orig>           the latest transaction, signed → {jws}
//   GET  /__calls                         every Google API call so far
// Sign in with Apple (appleid.apple.com): /appleid/auth/token exchanges an app's
// one-time code, /appleid/auth/revoke ends it; both check the client secret
// (a JWT signed with the stand-in's Sign in with Apple key).
//   POST /__appleid/code {sub, email}     a sign-in in the app → {code}
//   GET  /__appleid/state                 codes, refresh tokens (revoked or not), calls
//   POST /__appleid/mode {mode}           ok, or down (Apple answers 503)
// Firebase Cloud Messaging: messages:send with the Firebase service account's
// sign-in. Phone tokens starting dead- are unregistered, busy- get "unavailable",
// notatoken- aren't tokens, other-project- belong to another project.
//   GET  /__fcm/messages                  the messages accepted so far
//   POST /__fcm/reset                     forgets them; mode back to ok
//   POST /__fcm/mode {mode}               ok, denied (the API is off for the project)
//                                         or signin (the service account's sign-in fails,
//                                         and the tokens it was given stop working)
//
//   npm i --no-save @peculiar/x509
//   node tests/e2e/store-standin.cjs      # :8790; writes store-standin.env
//   # serve the functions with that file's lines added to their env file:
//   #   GOOGLE_PLAY_SERVICE_ACCOUNT  a service account whose sign-in goes to the stand-in
//   #   GOOGLE_PLAY_API_BASE         http://<docker gateway, e.g. 172.18.0.1>:8790
//   #   GOOGLE_RTDN_SECRET           rtdn_local
//   #   APPLE_ROOT_CERTIFICATES      the stand-in's root certificate
//   #   FIREBASE_SERVICE_ACCOUNT     a Firebase service account whose sign-in goes here
//   #   FCM_API_BASE                 http://<docker gateway>:8790
//   #   APPLE_TEAM_ID, APPLE_SIGNIN_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY  a Sign in with Apple key
//   #   APPLE_ID_API_BASE            http://<docker gateway>:8790/appleid
//   # Settings: PORT, GATEWAY (the address the functions reach this on),
//   # NOTIFY_URL (store-notifications), KEYS_FILE (keeps the keys across
//   # restarts), ENV_OUT.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const x509 = require('@peculiar/x509');

x509.cryptoProvider.set(crypto.webcrypto);
const subtle = crypto.webcrypto.subtle;

const PORT = Number(process.env.PORT || 8790);
const GATEWAY = process.env.GATEWAY || '172.18.0.1';
const NOTIFY_URL = process.env.NOTIFY_URL || 'http://127.0.0.1:54321/functions/v1/store-notifications';
const RTDN_SECRET = process.env.GOOGLE_RTDN_SECRET || 'rtdn_local';
const PACKAGE = process.env.ANDROID_PACKAGE_NAME || 'com.matchgpt.app';
const BUNDLE = process.env.APPLE_BUNDLE_ID || 'com.matchgpt.app';
const KEYS_FILE = process.env.KEYS_FILE || path.join(process.cwd(), 'store-standin.keys.json');
const ENV_OUT = process.env.ENV_OUT || path.join(process.cwd(), 'store-standin.env');

const DAY = 86_400_000;
const PRICES = { monthly: 99900, yearly: 999900 };           // paise
const APPLE_PRODUCTS = { matchgpt_plus_monthly: 'monthly', matchgpt_plus_yearly: 'yearly' };

const b64 = (buf) => Buffer.from(buf).toString('base64');
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const json64url = (v) => b64url(Buffer.from(JSON.stringify(v)));
const randomDigits = (n) => Array.from(crypto.randomBytes(n), (b) => b % 10).join('');
const iso = (ms) => new Date(ms).toISOString();
const addPeriod = (ms, plan) => {
  const d = new Date(ms);
  if (plan === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
};

// ---- Keys: Google's service account, Apple's chains -------------------------------

const ALG384 = { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' };
const ALG256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };

async function makeChain(label, withAppleMarks) {
  const rk = await subtle.generateKey(ALG384, true, ['sign', 'verify']);
  const ik = await subtle.generateKey(ALG384, true, ['sign', 'verify']);
  const lk = await subtle.generateKey(ALG256, true, ['sign', 'verify']);
  const from = new Date(Date.now() - 400 * DAY);
  const to = new Date(Date.now() + 3650 * DAY);
  const mark = (oid) => (withAppleMarks ? [new x509.Extension(oid, false, new Uint8Array([5, 0]))] : []);
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: `CN=${label} Root CA - G3, O=Test`, notBefore: from, notAfter: to, keys: rk,
    signingAlgorithm: ALG384, extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: `CN=${label} Worldwide Developer Relations CA - G6, O=Test`, issuer: root.subject,
    notBefore: from, notAfter: to, signingKey: rk.privateKey, publicKey: ik.publicKey, signingAlgorithm: ALG384,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true), ...mark('1.2.840.113635.100.6.2.1')],
  });
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '03', subject: `CN=${label} Prod ECC Mac App Store and iTunes Store Receipt Signing, O=Test`,
    issuer: intermediate.subject, notBefore: from, notAfter: to, signingKey: ik.privateKey, publicKey: lk.publicKey,
    signingAlgorithm: ALG384, extensions: mark('1.2.840.113635.100.6.11.1'),
  });
  return {
    x5c: [leaf, intermediate, root].map((c) => b64(c.rawData)),
    leafKey: b64(await subtle.exportKey('pkcs8', lk.privateKey)),
  };
}

// The developer's Sign in with Apple key (a .p8: EC P-256)
function appleSigninKey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    public_key: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

async function loadKeys() {
  try {
    const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (!keys.appleSignin) {
      keys.appleSignin = appleSigninKey();
      fs.writeFileSync(KEYS_FILE, JSON.stringify(keys), { mode: 0o600 });
    }
    return keys;
  } catch {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keys = {
      google: {
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        public_key: publicKey.export({ type: 'spki', format: 'pem' }),
      },
      apple: await makeChain('Test Apple', true),
      // Looks like Apple's (same marks) but isn't from the trusted root
      other: await makeChain('Look-alike', true),
      appleSignin: appleSigninKey(),
    };
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys), { mode: 0o600 });
    return keys;
  }
}

// ---- State ---------------------------------------------------------------------------

const google = new Map();   // purchase token → purchase
const apple = new Map();    // original transaction id → subscription
const calls = [];
const tokens = new Map();   // access tokens handed out → their scope
let playSignin = true;      // false: the Play account's sign-in is refused
let lastPubsub = null;
let KEYS;

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, text: await res.text() };
}

// ---- Google Play -------------------------------------------------------------------------

// The OAuth token endpoint: checks the service account's signed assertion
function googleToken(raw) {
  const params = new URLSearchParams(raw);
  const assertion = params.get('assertion') || '';
  const [h, p, s] = assertion.split('.');
  const ok = params.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && h && p && s &&
    crypto.verify('sha256', Buffer.from(`${h}.${p}`), KEYS.google.public_key, Buffer.from(s, 'base64url'));
  if (!ok) return [400, { error: 'invalid_grant', error_description: 'Invalid JWT signature.' }];
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const nowSec = Math.floor(Date.now() / 1000);
  const scopes = {
    'play-billing@matchgpt-test.iam.gserviceaccount.com': 'https://www.googleapis.com/auth/androidpublisher',
    [FIREBASE_ACCOUNT]: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  if (!scopes[claims.iss] || claims.scope !== scopes[claims.iss] ||
      claims.aud !== `http://${GATEWAY}:${PORT}/token` || !(claims.exp > nowSec) || claims.iat > nowSec + 60) {
    return [400, { error: 'invalid_grant', error_description: 'Bad claims' }];
  }
  if (claims.iss !== FIREBASE_ACCOUNT && !playSignin) {
    return [400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }];
  }
  if (claims.iss === FIREBASE_ACCOUNT && fcm.mode === 'signin') {
    return [400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }];
  }
  const token = `ya29.local-${crypto.randomBytes(12).toString('hex')}`;
  tokens.set(token, claims.scope);
  return [200, { access_token: token, expires_in: 3599, token_type: 'Bearer' }];
}

const newOrderId = () => `GPA.${randomDigits(4)}-${randomDigits(4)}-${randomDigits(4)}-${randomDigits(5)}`;

// What subscriptionsv2.get answers
function googleResource(g) {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    regionCode: 'IN',
    startTime: iso(g.startTime),
    subscriptionState: g.state,
    ...(g.linkedPurchaseToken ? { linkedPurchaseToken: g.linkedPurchaseToken } : {}),
    acknowledgementState: g.acknowledged ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: g.userId ? { obfuscatedExternalAccountId: g.userId } : undefined,
    ...(g.test ? { testPurchase: {} } : {}),
    ...(g.state === 'SUBSCRIPTION_STATE_CANCELED' ? { canceledStateContext: { userInitiatedCancellation: {} } } : {}),
    lineItems: [{
      productId: 'matchgpt_plus',
      expiryTime: iso(g.expiryTime),
      ...(g.orders.length ? { latestSuccessfulOrderId: g.orders[g.orders.length - 1] } : {}),
      autoRenewingPlan: {
        autoRenewEnabled: g.autoRenew,
        recurringPrice: { currencyCode: 'INR', units: String(PRICES[g.basePlan] / 100) },
      },
      offerDetails: { basePlanId: g.basePlan, ...(g.inTrial ? { offerId: 'free-trial' } : {}) },
      offerPhase: g.inTrial ? { freeTrial: {} } : { basePrice: {} },
    }],
  };
}

async function rtdn(notification) {
  const message = {
    version: '1.0',
    packageName: PACKAGE,
    eventTimeMillis: String(Date.now()),
    ...notification,
  };
  const messageId = randomDigits(16);
  lastPubsub = {
    message: { data: b64(Buffer.from(JSON.stringify(message))), messageId, message_id: messageId, publishTime: iso(Date.now()) },
    subscription: 'projects/matchgpt-test/subscriptions/play-rtdn',
  };
  return await post(`${NOTIFY_URL}?provider=google&secret=${RTDN_SECRET}`, lastPubsub);
}

const subNote = (token, type) => ({ subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken: token, subscriptionId: 'matchgpt_plus' } });

function newGooglePurchase({ userId, basePlan = 'monthly', trial = false, test = true, linkedPurchaseToken }) {
  const now = Date.now();
  const token = `${crypto.randomBytes(20).toString('base64url')}.AO-J1O${crypto.randomBytes(30).toString('base64url')}`;
  const g = {
    userId, basePlan, test, linkedPurchaseToken, startTime: now, acknowledged: false, autoRenew: true,
    state: 'SUBSCRIPTION_STATE_ACTIVE', inTrial: !!trial,
    expiryTime: trial ? now + 7 * DAY : addPeriod(now, basePlan),
    orders: trial ? [] : [newOrderId()],
  };
  google.set(token, g);
  return { token, g };
}

async function googleHook(action, token, body, res) {
  if (action === 'purchase') {
    const { token: t, g } = newGooglePurchase(body);
    return send(res, 200, { purchaseToken: t, orderId: g.orders[0] ?? null });
  }
  if (action === 'signin') {
    playSignin = body.ok !== false;
    if (!playSignin) {
      for (const [t, scope] of tokens) if (scope === 'https://www.googleapis.com/auth/androidpublisher') tokens.delete(t);
    }
    return send(res, 200, { ok: playSignin });
  }
  if (action === 'resend') {
    if (!lastPubsub) return send(res, 404, { error: 'nothing sent yet' });
    const r = await post(`${NOTIFY_URL}?provider=google&secret=${RTDN_SECRET}`, lastPubsub);
    return send(res, 200, r);
  }
  const g = google.get(token);
  if (!g) return send(res, 404, { error: 'no such purchase' });
  const now = Date.now();
  let type;
  switch (action) {
    case 'renew':
    case 'recover': {
      // The period (or trial) has just ended and the next one is charged
      const first = g.orders[0] ?? newOrderId();
      g.orders.push(g.orders.length === 0 ? first : `${first.split('..')[0]}..${g.orders.length - 1}`);
      g.inTrial = false;
      g.expiryTime = addPeriod(now, g.basePlan);
      g.state = 'SUBSCRIPTION_STATE_ACTIVE';
      type = action === 'renew' ? 2 : 1;
      break;
    }
    case 'cancel':
      g.autoRenew = false;
      g.state = 'SUBSCRIPTION_STATE_CANCELED';
      type = 3;
      break;
    case 'grace':
      g.state = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
      g.expiryTime = now - 1000;
      type = 6;
      break;
    case 'hold':
      g.state = 'SUBSCRIPTION_STATE_ON_HOLD';
      g.expiryTime = now - 1000;
      type = 5;
      break;
    case 'expire':
      g.state = 'SUBSCRIPTION_STATE_EXPIRED';
      g.expiryTime = now - 1000;
      type = 13;
      break;
    case 'refund': {
      const orderId = g.orders[g.orders.length - 1];
      g.state = 'SUBSCRIPTION_STATE_EXPIRED';
      g.expiryTime = now - 1000;
      g.autoRenew = false;
      const r = await rtdn({ voidedPurchaseNotification: { purchaseToken: token, orderId, productType: 1, refundType: 1 } });
      return send(res, 200, { orderId, notified: r });
    }
    case 'change': {
      const { token: t, g: next } = newGooglePurchase({ userId: g.userId, basePlan: body.basePlan || 'yearly', test: g.test, linkedPurchaseToken: token });
      g.state = 'SUBSCRIPTION_STATE_EXPIRED';
      g.expiryTime = now - 1000;
      return send(res, 200, { purchaseToken: t, orderId: next.orders[0] });
    }
    default:
      return send(res, 404, { error: `unknown hook ${action}` });
  }
  const r = await rtdn(subNote(token, type));
  return send(res, 200, { notified: r, purchase: googleResource(g) });
}

function googleApi(method, url, auth, res) {
  const m = url.pathname.match(/^\/androidpublisher\/v3\/applications\/([^/]+)\/purchases\/(subscriptionsv2|subscriptions)\/(?:([^/]+)\/)?tokens\/([^/:]+)(?::(\w+))?$/);
  calls.push({ method, path: url.pathname, ok: !!m });
  if (!auth.startsWith('Bearer ') || tokens.get(auth.slice(7)) !== 'https://www.googleapis.com/auth/androidpublisher') return send(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
  if (!m || decodeURIComponent(m[1]) !== PACKAGE) return send(res, 404, { error: { code: 404, message: 'Not found' } });
  const [, , kind, productId, rawToken, verb] = m;
  const token = decodeURIComponent(rawToken);
  const g = google.get(token);
  if (!g) return send(res, 400, { error: { code: 400, message: 'The purchase token is no longer valid.', status: 'INVALID_ARGUMENT' } });
  if (kind === 'subscriptionsv2' && method === 'GET' && !verb) return send(res, 200, googleResource(g));
  if (kind === 'subscriptionsv2' && method === 'POST' && verb === 'cancel') {
    g.autoRenew = false;
    if (g.state === 'SUBSCRIPTION_STATE_ACTIVE') g.state = 'SUBSCRIPTION_STATE_CANCELED';
    g.cancelledByDeveloper = true;
    return send(res, 200, {});
  }
  if (kind === 'subscriptions' && method === 'POST' && verb === 'acknowledge' && productId === 'matchgpt_plus') {
    g.acknowledged = true;
    return send(res, 200, undefined);
  }
  return send(res, 404, { error: { code: 404, message: 'Not found' } });
}

// ---- App Store -------------------------------------------------------------------------

async function sign(payload, chain = 'apple') {
  const keys = KEYS[chain];
  const key = await subtle.importKey('pkcs8', Buffer.from(keys.leafKey, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = json64url({ alg: 'ES256', x5c: keys.x5c });
  const body = json64url(payload);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

function appleTx(a, t) {
  return {
    transactionId: t.id,
    originalTransactionId: a.orig,
    webOrderLineItemId: t.webOrder,
    bundleId: BUNDLE,
    productId: a.product,
    subscriptionGroupIdentifier: '21500001',
    purchaseDate: t.purchaseDate,
    originalPurchaseDate: a.started,
    expiresDate: t.expiresDate,
    quantity: 1,
    type: 'Auto-Renewable Subscription',
    ...(a.userId ? { appAccountToken: a.userId } : {}),
    inAppOwnershipType: 'PURCHASED',
    signedDate: Date.now(),
    environment: a.environment,
    transactionReason: t.reason,
    storefront: 'IND',
    storefrontId: '143467',
    price: t.trial ? 0 : (PRICES[APPLE_PRODUCTS[a.product]] / 100) * 1000,
    currency: 'INR',
    ...(t.trial ? { offerType: 1, offerDiscountType: 'FREE_TRIAL' } : {}),
    ...(t.revocationDate ? { revocationDate: t.revocationDate, revocationReason: 0 } : {}),
  };
}

function appleRenewal(a) {
  const latest = a.txs[a.txs.length - 1];
  return {
    originalTransactionId: a.orig,
    autoRenewProductId: a.product,
    productId: a.product,
    autoRenewStatus: a.autoRenew ? 1 : 0,
    environment: a.environment,
    signedDate: Date.now(),
    recentSubscriptionStartDate: a.started,
    renewalDate: latest.expiresDate,
    ...(a.billingRetry ? { isInBillingRetryPeriod: true } : {}),
    ...(a.graceUntil ? { gracePeriodExpiresDate: a.graceUntil } : {}),
  };
}

async function appleNotify(a, notificationType, subtype, tx) {
  const payload = {
    notificationType,
    ...(subtype ? { subtype } : {}),
    notificationUUID: crypto.randomUUID(),
    data: {
      appAppleId: 6700000001,
      bundleId: BUNDLE,
      bundleVersion: '1',
      environment: a.environment,
      signedTransactionInfo: await sign(appleTx(a, tx ?? a.txs[a.txs.length - 1])),
      signedRenewalInfo: await sign(appleRenewal(a)),
      status: 1,
    },
    version: '2.0',
    signedDate: Date.now(),
  };
  return await post(`${NOTIFY_URL}?provider=apple`, { signedPayload: await sign(payload) });
}

const newTxId = () => `2000000${randomDigits(9)}`;

async function appleHook(action, orig, url, body, res) {
  if (action === 'purchase') {
    const now = Date.now();
    const product = body.product || 'matchgpt_plus_monthly';
    const id = newTxId();
    const a = {
      orig: id, userId: body.userId, product, environment: body.environment || 'Sandbox', started: now, autoRenew: true,
      txs: [{ id, webOrder: randomDigits(12), purchaseDate: now, reason: 'PURCHASE', trial: !!body.trial,
        expiresDate: body.trial ? now + 7 * DAY : addPeriod(now, APPLE_PRODUCTS[product]) }],
    };
    apple.set(id, a);
    return send(res, 200, { jws: await sign(appleTx(a, a.txs[0])), transactionId: id, originalTransactionId: id });
  }
  if (action === 'sign') return send(res, 200, { jws: await sign(body.payload, body.chain === 'other' ? 'other' : 'apple') });
  if (action === 'notify') {
    const payload = { notificationUUID: crypto.randomUUID(), version: '2.0', signedDate: Date.now(), ...body.payload };
    return send(res, 200, await post(`${NOTIFY_URL}?provider=apple`, { signedPayload: await sign(payload, body.chain === 'other' ? 'other' : 'apple') }));
  }
  const a = apple.get(orig);
  if (!a) return send(res, 404, { error: 'no such subscription' });
  const now = Date.now();
  const latest = a.txs[a.txs.length - 1];
  let r;
  switch (action) {
    case 'latest':
      return send(res, 200, { jws: await sign(appleTx(a, latest)), transactionId: latest.id });
    case 'renew': {
      // The period (or trial) has just ended and the next one is charged
      latest.expiresDate = Math.min(latest.expiresDate, now - 1);
      const tx = { id: newTxId(), webOrder: randomDigits(12), purchaseDate: now, reason: 'RENEWAL', trial: false,
        expiresDate: addPeriod(now, APPLE_PRODUCTS[a.product]) };
      a.txs.push(tx);
      a.billingRetry = false;
      a.graceUntil = null;
      r = await appleNotify(a, 'DID_RENEW', a.wasFailing ? 'BILLING_RECOVERY' : undefined);
      a.wasFailing = false;
      return send(res, 200, { notified: r, jws: await sign(appleTx(a, tx)), transactionId: tx.id });
    }
    case 'autorenew':
      a.autoRenew = url.searchParams.get('on') === '1';
      r = await appleNotify(a, 'DID_CHANGE_RENEWAL_STATUS', a.autoRenew ? 'AUTO_RENEW_ENABLED' : 'AUTO_RENEW_DISABLED');
      break;
    case 'fail':
      latest.expiresDate = Math.min(latest.expiresDate, now - 1000);
      a.billingRetry = true;
      a.wasFailing = true;
      a.graceUntil = url.searchParams.get('grace') === '1' ? now + 6 * DAY : null;
      r = await appleNotify(a, 'DID_FAIL_TO_RENEW', a.graceUntil ? 'GRACE_PERIOD' : undefined);
      break;
    case 'expire':
      latest.expiresDate = Math.min(latest.expiresDate, now - 1000);
      a.billingRetry = false;
      a.graceUntil = null;
      a.autoRenew = false;
      r = await appleNotify(a, 'EXPIRED', 'VOLUNTARY');
      break;
    case 'refund': {
      const tx = a.txs.find((t) => t.id === (url.searchParams.get('tx') || latest.id));
      if (!tx) return send(res, 404, { error: 'no such transaction' });
      tx.revocationDate = now;
      r = await appleNotify(a, 'REFUND', undefined, tx);
      return send(res, 200, { notified: r, transactionId: tx.id });
    }
    default:
      return send(res, 404, { error: `unknown hook ${action}` });
  }
  return send(res, 200, { notified: r });
}

// ---- Firebase Cloud Messaging ---------------------------------------------------------------

const FIREBASE_ACCOUNT = 'firebase-adminsdk@matchgpt-test.iam.gserviceaccount.com';
const fcm = { messages: [], mode: 'ok' };

const fcmError = (code, status, message, errorCode) => ({
  error: { code, message, status, details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] },
});

// POST /v1/projects/<project>/messages:send, answered the way FCM does
function fcmSend(project, auth, raw, res) {
  if (!auth.startsWith('Bearer ') || tokens.get(auth.slice(7)) !== 'https://www.googleapis.com/auth/firebase.messaging') {
    return send(res, 401, fcmError(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.', 'THIRD_PARTY_AUTH_ERROR'));
  }
  if (project !== 'matchgpt-test' || fcm.mode === 'denied') {
    return send(res, 403, fcmError(403, 'PERMISSION_DENIED', `Firebase Cloud Messaging API has not been used in project ${project} before or it is disabled.`));
  }
  const message = (JSON.parse(raw || '{}') || {}).message || {};
  const token = String(message.token || '');
  // FCM's own checks on the message
  const badData = Object.entries(message.data || {}).find(([, v]) => typeof v !== 'string');
  if (badData) return send(res, 400, fcmError(400, 'INVALID_ARGUMENT', `Invalid value at 'message.data[0].value' (${badData[0]})`, 'INVALID_ARGUMENT'));
  if (!message.notification?.title || !message.android?.notification?.channel_id || !message.apns?.headers) {
    return send(res, 400, fcmError(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.', 'INVALID_ARGUMENT'));
  }
  if (token.startsWith('dead-')) return send(res, 404, fcmError(404, 'NOT_FOUND', 'Requested entity was not found.', 'UNREGISTERED'));
  if (token.startsWith('busy-')) return send(res, 503, fcmError(503, 'UNAVAILABLE', 'The service is currently unavailable.', 'UNAVAILABLE'));
  if (token.startsWith('notatoken-')) {
    return send(res, 400, fcmError(400, 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token', 'INVALID_ARGUMENT'));
  }
  if (token.startsWith('other-project-')) return send(res, 403, fcmError(403, 'PERMISSION_DENIED', 'SenderId mismatch', 'SENDER_ID_MISMATCH'));
  const name = `projects/${project}/messages/0:${Date.now()}%${crypto.randomBytes(8).toString('hex')}`;
  fcm.messages.push({ name, at: new Date().toISOString(), message });
  return send(res, 200, { name });
}

// ---- Sign in with Apple (appleid.apple.com) -------------------------------------------------

const APPLE_TEAM = 'TEAM123456';
const APPLE_SIGNIN_KEY_ID = 'KEY1234567';
const appleid = { codes: new Map(), refresh: new Map(), calls: [], mode: 'ok' };

// The client secret: an ES256 JWT from the team's key, for this app
function appleClientOk(params) {
  const secret = params.get('client_secret') || '';
  const [h, p, sig] = secret.split('.');
  if (!h || !p || !sig || params.get('client_id') !== BUNDLE) return false;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    const nowSec = Math.floor(Date.now() / 1000);
    return header.alg === 'ES256' && header.kid === APPLE_SIGNIN_KEY_ID &&
      claims.iss === APPLE_TEAM && claims.sub === BUNDLE && claims.aud === 'https://appleid.apple.com' &&
      claims.exp > nowSec && claims.iat <= nowSec + 60 && claims.exp - claims.iat <= 15_777_000 &&
      crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: KEYS.appleSignin.public_key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig, 'base64url'));
  } catch {
    return false;
  }
}

function appleidApi(path, raw, res) {
  const params = new URLSearchParams(raw);
  appleid.calls.push({ path, grant_type: params.get('grant_type'), token_type_hint: params.get('token_type_hint') });
  if (appleid.mode === 'down') return send(res, 503, {});
  if (!appleClientOk(params)) return send(res, 400, { error: 'invalid_client' });
  if (path === '/auth/token') {
    const code = appleid.codes.get(params.get('code') || '');
    if (params.get('grant_type') !== 'authorization_code' || !code || code.used || code.expires < Date.now()) {
      return send(res, 400, { error: 'invalid_grant', error_description: 'The code has expired or has been revoked.' });
    }
    code.used = true;
    const refresh = `r${crypto.randomBytes(16).toString('hex')}.0.mrxv.${crypto.randomBytes(8).toString('hex')}`;
    appleid.refresh.set(refresh, { sub: code.sub, revoked: false });
    const nowSec = Math.floor(Date.now() / 1000);
    const idToken = `${json64url({ kid: 'stand-in', alg: 'ES256' })}.${json64url({
      iss: 'https://appleid.apple.com', aud: BUNDLE, exp: nowSec + 600, iat: nowSec, sub: code.sub,
      email: code.email, email_verified: true, is_private_email: /privaterelay/.test(code.email || ''),
    })}.${b64url(crypto.randomBytes(64))}`;
    return send(res, 200, {
      access_token: `a${crypto.randomBytes(16).toString('hex')}.0.mrxv.${crypto.randomBytes(8).toString('hex')}`,
      token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, id_token: idToken,
    });
  }
  if (path === '/auth/revoke') {
    const t = appleid.refresh.get(params.get('token') || '');
    if (t) t.revoked = true;
    return send(res, 200);  // Apple answers 200 for tokens it doesn't know too
  }
  return send(res, 404, { error: 'not found' });
}

// ---- Server -----------------------------------------------------------------------------

async function main() {
  KEYS = await loadKeys();
  const account = {
    type: 'service_account',
    project_id: 'matchgpt-test',
    client_email: 'play-billing@matchgpt-test.iam.gserviceaccount.com',
    private_key: KEYS.google.private_key,
    token_uri: `http://${GATEWAY}:${PORT}/token`,
  };
  const firebaseAccount = { ...account, client_email: FIREBASE_ACCOUNT };
  const env = [
    `GOOGLE_PLAY_SERVICE_ACCOUNT=${JSON.stringify(account)}`,
    `FIREBASE_SERVICE_ACCOUNT=${JSON.stringify(firebaseAccount)}`,
    `FCM_API_BASE=http://${GATEWAY}:${PORT}`,
    `GOOGLE_PLAY_API_BASE=http://${GATEWAY}:${PORT}`,
    `GOOGLE_RTDN_SECRET=${RTDN_SECRET}`,
    `APPLE_ROOT_CERTIFICATES=${KEYS.apple.x5c[2]}`,
    `APPLE_TEAM_ID=${APPLE_TEAM}`,
    `APPLE_SIGNIN_KEY_ID=${APPLE_SIGNIN_KEY_ID}`,
    // The .p8's text on one line, its line breaks written as \n
    `APPLE_SIGNIN_PRIVATE_KEY=${KEYS.appleSignin.private_key.trim().replace(/\n/g, '\\n')}`,
    `APPLE_ID_API_BASE=http://${GATEWAY}:${PORT}/appleid`,
  ].join('\n');
  fs.writeFileSync(ENV_OUT, `${env}\n`, { mode: 0o600 });

  http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const raw = await readBody(req);
      if (url.pathname === '/token' && req.method === 'POST') {
        const [status, body] = googleToken(raw);
        return send(res, status, body);
      }
      if (url.pathname.startsWith('/androidpublisher/')) return googleApi(req.method, url, req.headers.authorization || '', res);
      if (url.pathname === '/__calls') return send(res, 200, calls);
      const sendPath = url.pathname.match(/^\/v1\/projects\/([^/]+)\/messages:send$/);
      if (sendPath && req.method === 'POST') return fcmSend(sendPath[1], req.headers.authorization || '', raw, res);
      const appleidPath = url.pathname.match(/^\/appleid(\/auth\/(?:token|revoke))$/);
      if (appleidPath && req.method === 'POST') return appleidApi(appleidPath[1], raw, res);
      if (url.pathname === '/__appleid/code' && req.method === 'POST') {
        const { sub, email } = JSON.parse(raw || '{}');
        const code = `c${crypto.randomBytes(16).toString('hex')}.0.mrxv.${crypto.randomBytes(12).toString('base64url')}`;
        appleid.codes.set(code, { sub, email, used: false, expires: Date.now() + 5 * 60_000 });
        return send(res, 200, { code });
      }
      if (url.pathname === '/__appleid/state') {
        return send(res, 200, {
          codes: [...appleid.codes].map(([code, c]) => ({ code, ...c })),
          refreshTokens: [...appleid.refresh].map(([token, t]) => ({ token, ...t })),
          calls: appleid.calls,
        });
      }
      if (url.pathname === '/__appleid/mode' && req.method === 'POST') {
        appleid.mode = JSON.parse(raw || '{}').mode || 'ok';
        return send(res, 200, { mode: appleid.mode });
      }
      if (url.pathname === '/__fcm/messages') return send(res, 200, fcm.messages);
      if (url.pathname === '/__fcm/reset' && req.method === 'POST') {
        fcm.messages = [];
        fcm.mode = 'ok';
        return send(res, 200, {});
      }
      if (url.pathname === '/__fcm/mode' && req.method === 'POST') {
        fcm.mode = JSON.parse(raw || '{}').mode || 'ok';
        // A broken sign-in: the tokens already handed out stop working too
        if (fcm.mode === 'signin') {
          for (const [t, scope] of tokens) if (scope === 'https://www.googleapis.com/auth/firebase.messaging') tokens.delete(t);
        }
        return send(res, 200, { mode: fcm.mode });
      }
      const hook = url.pathname.match(/^\/__(google|apple)\/(\w+)(?:\/(.+))?$/);
      if (hook) {
        const body = raw ? JSON.parse(raw) : {};
        const [, store, action, id] = hook;
        if (store === 'google' && action === 'purchase' && req.method === 'GET') {
          const g = google.get(decodeURIComponent(id || ''));
          return g ? send(res, 200, { ...googleResource(g), cancelledByDeveloper: !!g.cancelledByDeveloper }) : send(res, 404, {});
        }
        return store === 'google'
          ? await googleHook(action, decodeURIComponent(id || ''), body, res)
          : await appleHook(action, decodeURIComponent(id || ''), url, body, res);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      console.error(e);
      send(res, 500, { error: String(e) });
    }
  }).listen(PORT, () => {
    console.log(`store stand-in on :${PORT}; settings for the functions written to ${ENV_OUT}`);
  });
}

main();
