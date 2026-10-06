// Tests for googlePlay.ts and appleStore.ts (what the stores' answers mean
// for us, and Apple's signatures). Run from the repo root:
//   deno test --no-config --allow-env --allow-net supabase/functions/_shared/stores_test.ts
import * as x509 from 'npm:@peculiar/x509@1.12.3';
import { googleState, moneyToMinor, type GoogleSubscription } from './googlePlay.ts';
import {
  APPLE_ROOT_CA_G3, applePriceToMinor, appleState, AppleJwsError, verifyAppleJws, type AppleTransaction,
} from './appleStore.ts';

function assertEquals(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected ${e}\n  actual   ${a}`);
}

const NOW = new Date('2026-10-03T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

// ---- Google Play ---------------------------------------------------------------------

const google = (over: Partial<GoogleSubscription> = {}, item: Record<string, unknown> = {}): GoogleSubscription => ({
  startTime: at(-10),
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-1' },
  ...over,
  lineItems: [{
    productId: 'shaadi24_plus',
    expiryTime: at(20),
    latestSuccessfulOrderId: 'GPA.1111-2222-3333-44444',
    autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: 'INR', units: '999' } },
    offerDetails: { basePlanId: 'monthly' },
    offerPhase: { basePrice: {} },
    ...item,
  }],
});

Deno.test('Google: an active subscription', () => {
  const s = googleState(google(), NOW);
  assertEquals([s.status, s.productId, s.basePlanId, s.mode, s.currentStart, s.currentEnd, s.trialEndsAt],
    ['active', 'shaadi24_plus', 'monthly', 'live', at(-10), at(20), null]);
  assertEquals([s.orderId, s.price, s.userId, s.autoRenew, s.cancelAtPeriodEnd, s.needsAcknowledgement, s.endedAt],
    ['GPA.1111-2222-3333-44444', { amount: 99900, currency: 'INR' }, 'user-1', true, false, false, null]);
});

Deno.test('Google: the free trial charges nothing and ends at the expiry', () => {
  const s = googleState(google({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', testPurchase: {} },
    { offerPhase: { freeTrial: {} }, latestSuccessfulOrderId: undefined, expiryTime: at(7) }), NOW);
  assertEquals([s.status, s.trialEndsAt, s.currentStart, s.currentEnd, s.orderId, s.price, s.mode, s.needsAcknowledgement],
    ['authenticated', at(7), null, null, null, null, 'test', true]);
});

Deno.test('Google: cancelled by the person keeps Pro until the period ends', () => {
  const s = googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, {
    autoRenewingPlan: { autoRenewEnabled: false, recurringPrice: { currencyCode: 'INR', units: '999' } },
  }), NOW);
  assertEquals([s.status, s.cancelAtPeriodEnd, s.autoRenew, s.currentEnd], ['active', true, false, at(20)]);
  const ended = googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }, { expiryTime: at(-1) }), NOW);
  assertEquals([ended.status, ended.endedAt], ['expired', at(-1)], 'and ends with it');
});

Deno.test('Google: grace period, on hold, paused, pending, expired', () => {
  const grace = googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }, { expiryTime: at(-1) }), NOW);
  assertEquals([grace.status, grace.currentEnd], ['pending', at(7)], 'grace: Pro for up to a week from now');
  assertEquals(googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }), NOW).status, 'halted');
  assertEquals(googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_PAUSED' }), NOW).status, 'paused');
  assertEquals(googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }), NOW).status, 'created');
  assertEquals(googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, { expiryTime: at(-2) }), NOW).endedAt, at(-2));
  assertEquals(googleState(google({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED' }), NOW).status, 'expired');
  assertEquals(googleState(google({ subscriptionState: 'SOMETHING_NEW' }), NOW).status, 'expired', 'unknown: no Pro');
});

Deno.test('Google: a change of plan names the purchase it replaced', () => {
  const s = googleState(google({ linkedPurchaseToken: 'old-token' }, { offerDetails: { basePlanId: 'yearly' } }), NOW);
  assertEquals([s.linkedPurchaseToken, s.basePlanId], ['old-token', 'yearly']);
});

Deno.test("Google's money in the currency's smallest unit", () => {
  assertEquals(moneyToMinor({ currencyCode: 'INR', units: '999' }), { amount: 99900, currency: 'INR' });
  assertEquals(moneyToMinor({ currencyCode: 'USD', units: '11', nanos: 990_000_000 }), { amount: 1199, currency: 'USD' });
  assertEquals(moneyToMinor({ currencyCode: 'JPY', units: '1500' }), { amount: 1500, currency: 'JPY' });
  assertEquals(moneyToMinor(undefined), null);
});

// ---- App Store -------------------------------------------------------------------------

const tx = (over: Partial<AppleTransaction> = {}): AppleTransaction => ({
  transactionId: '2000000000000002',
  originalTransactionId: '2000000000000001',
  bundleId: 'com.shaadi24.app',
  productId: 'shaadi24_plus_monthly',
  purchaseDate: NOW.getTime() - 10 * DAY,
  expiresDate: NOW.getTime() + 20 * DAY,
  environment: 'Production',
  type: 'Auto-Renewable Subscription',
  price: 999000,
  currency: 'INR',
  appAccountToken: 'user-1',
  ...over,
});

Deno.test('Apple: an active subscription', () => {
  const s = appleState(tx(), null, NOW);
  assertEquals([s.status, s.mode, s.currentStart, s.currentEnd, s.orderId, s.price, s.userId, s.autoRenew, s.cancelAtPeriodEnd],
    ['active', 'live', at(-10), at(20), '2000000000000002', { amount: 99900, currency: 'INR' }, 'user-1', null, false]);
});

Deno.test('Apple: the free trial (introductory offer) charges nothing', () => {
  const s = appleState(tx({ offerType: 1, offerDiscountType: 'FREE_TRIAL', price: 0, environment: 'Sandbox', expiresDate: NOW.getTime() + 7 * DAY }), null, NOW);
  assertEquals([s.status, s.trialEndsAt, s.currentEnd, s.orderId, s.price, s.mode], ['authenticated', at(7), null, null, null, 'test']);
});

Deno.test('Apple: renewal off, grace period, billing retry, expired', () => {
  const off = appleState(tx(), { originalTransactionId: '1', autoRenewStatus: 0 }, NOW);
  assertEquals([off.status, off.autoRenew, off.cancelAtPeriodEnd], ['active', false, true]);
  const lapsed = tx({ expiresDate: NOW.getTime() - DAY });
  const grace = appleState(lapsed, { originalTransactionId: '1', autoRenewStatus: 1, isInBillingRetryPeriod: true, gracePeriodExpiresDate: NOW.getTime() + 5 * DAY }, NOW);
  assertEquals([grace.status, grace.currentEnd], ['pending', at(5)]);
  assertEquals(appleState(lapsed, { originalTransactionId: '1', autoRenewStatus: 1, isInBillingRetryPeriod: true }, NOW).status, 'halted');
  const expired = appleState(lapsed, { originalTransactionId: '1', autoRenewStatus: 0 }, NOW);
  assertEquals([expired.status, expired.endedAt], ['expired', at(-1)]);
});

Deno.test('Apple: refunded or revoked: no Pro, not even a trial', () => {
  const s = appleState(tx({ revocationDate: NOW.getTime() - 1000 }), null, NOW);
  assertEquals([s.status, s.endedAt], ['cancelled', new Date(NOW.getTime() - 1000).toISOString()]);
  const t = appleState(tx({ revocationDate: NOW.getTime(), offerType: 1, offerDiscountType: 'FREE_TRIAL', price: 0 }), null, NOW);
  assertEquals([t.status, t.trialEndsAt], ['cancelled', null]);
});

Deno.test("Apple's price (thousandths) in the currency's smallest unit", () => {
  assertEquals(applePriceToMinor(999000, 'INR'), { amount: 99900, currency: 'INR' });
  assertEquals(applePriceToMinor(11990, 'USD'), { amount: 1199, currency: 'USD' });
  assertEquals(applePriceToMinor(1500000, 'JPY'), { amount: 1500, currency: 'JPY' });
  assertEquals(applePriceToMinor(undefined, 'INR'), null);
});

// ---- Apple's signatures -------------------------------------------------------------------

x509.cryptoProvider.set(crypto);
const ALG384 = { name: 'ECDSA', namedCurve: 'P-384', hash: 'SHA-384' };
const ALG256 = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const mark = (oid: string) => new x509.Extension(oid, false, new Uint8Array([5, 0]));
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json64 = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

interface Chain { certs: string[]; leafKey: CryptoKey }

async function chain(opts: { marks?: boolean; leafValid?: [Date, Date]; signLeafWith?: 'root' } = {}): Promise<Chain> {
  const rk = await crypto.subtle.generateKey(ALG384, true, ['sign', 'verify']) as CryptoKeyPair;
  const ik = await crypto.subtle.generateKey(ALG384, true, ['sign', 'verify']) as CryptoKeyPair;
  const lk = await crypto.subtle.generateKey(ALG256, true, ['sign', 'verify']) as CryptoKeyPair;
  const from = new Date(NOW.getTime() - 365 * DAY);
  const to = new Date(NOW.getTime() + 3650 * DAY);
  const marks = opts.marks ?? true;
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'CN=Test Root', notBefore: from, notAfter: to, keys: rk, signingAlgorithm: ALG384,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: 'CN=Test Intermediate', issuer: root.subject, notBefore: from, notAfter: to,
    signingKey: rk.privateKey, publicKey: ik.publicKey, signingAlgorithm: ALG384,
    extensions: [new x509.BasicConstraintsExtension(true, 0, true), ...(marks ? [mark('1.2.840.113635.100.6.2.1')] : [])],
  });
  const [lFrom, lTo] = opts.leafValid ?? [from, to];
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: '03', subject: 'CN=Test Leaf', issuer: intermediate.subject, notBefore: lFrom, notAfter: lTo,
    signingKey: opts.signLeafWith === 'root' ? rk.privateKey : ik.privateKey, publicKey: lk.publicKey, signingAlgorithm: ALG384,
    extensions: marks ? [mark('1.2.840.113635.100.6.11.1')] : [],
  });
  return { certs: [leaf, intermediate, root].map((c) => b64(c.rawData)), leafKey: lk.privateKey };
}

async function jws(c: Chain, payload: unknown, header: Record<string, unknown> = {}) {
  const h = json64({ alg: 'ES256', x5c: c.certs, ...header });
  const p = json64(payload);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, c.leafKey, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

async function refused(token: string, why: RegExp, label: string) {
  try {
    await verifyAppleJws(token);
  } catch (e) {
    if (!(e instanceof AppleJwsError) || !why.test(e.message)) throw new Error(`${label}: wrong error ${e}`);
    return;
  }
  throw new Error(`${label}: accepted`);
}

Deno.test("Apple's signatures: a good chain passes, everything else is refused", async () => {
  const good = await chain();
  Deno.env.set('APPLE_ROOT_CERTIFICATES', good.certs[2]);
  try {
    const payload = { transactionId: '1', bundleId: 'com.shaadi24.app', signedDate: NOW.getTime() };
    assertEquals(await verifyAppleJws(await jws(good, payload)), payload, 'good');

    const token = await jws(good, payload);
    const [h, , s] = token.split('.');
    await refused(`${h}.${json64({ ...payload, transactionId: '2' })}.${s}`, /Bad signature/, 'changed payload');
    await refused(token.slice(0, -4) + 'AAAA', /Bad signature/, 'changed signature');

    const lookAlike = await chain();
    await refused(await jws(lookAlike, payload), /Not signed by Apple/, 'another root');
    // Apple's root at the end, but the rest is someone else's
    await refused(await jws({ ...lookAlike, certs: [lookAlike.certs[0], lookAlike.certs[1], good.certs[2]] }, payload),
      /Bad certificate chain/, "another chain under Apple's root");
    const skipped = await chain({ signLeafWith: 'root' });
    Deno.env.set('APPLE_ROOT_CERTIFICATES', `${good.certs[2]},${skipped.certs[2]}`);
    await refused(await jws(skipped, payload), /Bad certificate chain/, 'leaf not signed by the intermediate');
    const unmarked = await chain({ marks: false });
    Deno.env.set('APPLE_ROOT_CERTIFICATES', `${good.certs[2]},${unmarked.certs[2]}`);
    await refused(await jws(unmarked, payload), /Not an App Store signing certificate/, "without Apple's marks");
    const stale = await chain({ leafValid: [new Date(NOW.getTime() - 100 * DAY), new Date(NOW.getTime() - 50 * DAY)] });
    Deno.env.set('APPLE_ROOT_CERTIFICATES', `${good.certs[2]},${stale.certs[2]}`);
    await refused(await jws(stale, payload), /not valid at signing time/, 'leaf expired when signed');
    assertEquals((await verifyAppleJws<{ signedDate: number }>(await jws(stale, { ...payload, signedDate: NOW.getTime() - 60 * DAY }))).signedDate,
      NOW.getTime() - 60 * DAY, 'signed while the leaf was valid: fine later');

    await refused(await jws(good, payload, { alg: 'HS256' }), /Unexpected JWS header/, 'another algorithm');
    await refused(await jws({ ...good, certs: good.certs.slice(0, 2) }, payload), /Unexpected JWS header/, 'a short chain');
    await refused('not.a.jws', /Unreadable JWS/, 'garbage');
    await refused('abc', /Not a JWS/, 'not three parts');
  } finally {
    Deno.env.delete('APPLE_ROOT_CERTIFICATES');
  }
});

Deno.test('The built-in root is Apple Root CA - G3', async () => {
  const cert = new x509.X509Certificate(Uint8Array.from(atob(APPLE_ROOT_CA_G3), (c) => c.charCodeAt(0)));
  const sha256 = new Uint8Array(await crypto.subtle.digest('SHA-256', cert.rawData));
  assertEquals([...sha256].map((b) => b.toString(16).padStart(2, '0')).join(':').toUpperCase(),
    '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79', 'fingerprint');
  assertEquals([cert.subject, cert.notAfter.toISOString().slice(0, 10)],
    ['CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US', '2039-04-30']);
});
