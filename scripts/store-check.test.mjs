// scripts/store-check.mjs against a stand-in for the App Store Connect API.
// Run: node --test scripts/
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED, checkSubscriptions, indiaPrices } from './store-check.mjs';

// Answers by path, like App Store Connect for one app
// (inGroup: each subscription's group, by index; all in the first by default.
// A price is a customer price, or a list of { price, start } for a change.)
function standIn({ subscriptions, groups = ['Shaadi24+'], groupNames = [{ name: 'Shaadi24+', locale: 'en-GB' }], details = {}, groupsStatus, inGroup = [] }) {
  return async (method, path) => {
    assert.equal(method, 'GET');
    if (path.startsWith('/v1/apps?')) return { data: [{ id: 'app1', type: 'apps' }] };
    if (path.startsWith('/v1/apps/app1/subscriptionGroups')) {
      if (groupsStatus) throw Object.assign(new Error(`App Store Connect answered ${groupsStatus}: Forbidden`), { status: groupsStatus });
      return {
        data: groups.map((referenceName, g) => ({
          id: `g${g}`, type: 'subscriptionGroups', attributes: { referenceName },
          relationships: { subscriptions: { data: subscriptions.map((_, i) => ({ type: 'subscriptions', id: `s${i}` })).filter((_, i) => (inGroup[i] ?? 0) === g) } },
        })),
        included: [
          ...subscriptions.map((s, i) => ({ id: `s${i}`, type: 'subscriptions', attributes: s })),
          ...groupNames.map((l, i) => ({ id: `l${i}`, type: 'subscriptionGroupLocalizations', attributes: l })),
        ],
      };
    }
    const av = /^\/v1\/subscriptionAvailabilities\/av-(s\d+)\/availableTerritories/.exec(path);
    if (av) return { data: (details[av[1]]?.territories ?? []).map((id) => ({ type: 'territories', id })), links: {} };
    const m = /^\/v1\/subscriptions\/(s\d+)\/(\w+)/.exec(path);
    const d = details[m?.[1]] ?? {};
    if (m?.[2] === 'prices') {
      const list = d.price === undefined ? [] : Array.isArray(d.price) ? d.price : [{ price: d.price, start: null }];
      return {
        data: [
          ...list.map((p, i) => ({ id: `p${i}`, type: 'subscriptionPrices', attributes: { startDate: p.start, preserved: false },
            relationships: { subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: `pp${i}` } },
              territory: { data: { type: 'territories', id: 'IND' } } } })),
          // Prices elsewhere, when the whole list is asked for
          ...(path.includes('filter[territory]') ? [] : (d.pricedIn ?? d.territories ?? []).filter((t) => t !== 'IND')
            .map((t) => ({ id: `p-${t}`, type: 'subscriptionPrices', relationships: { territory: { data: { type: 'territories', id: t } } } }))),
        ],
        included: [
          ...list.map((p, i) => ({ id: `pp${i}`, type: 'subscriptionPricePoints', attributes: { customerPrice: p.price } })),
          ...(list.length ? [{ id: 'IND', type: 'territories', attributes: { currency: 'INR' } }] : []),
        ],
      };
    }
    if (m?.[2] === 'pricePoints') {
      // Two pages, as Apple pages them
      const points = (d.points ?? []).map((customerPrice, i) => ({ id: `pt${i}`, type: 'subscriptionPricePoints', attributes: { customerPrice } }));
      const second = path.includes('cursor=2');
      return second ? { data: points.slice(2), links: {} }
        : { data: points.slice(0, 2), links: { next: `https://api.appstoreconnect.apple.com${path}&cursor=2` } };
    }
    if (m?.[2] === 'subscriptionAvailability') {
      if (!d.territories) throw Object.assign(new Error('App Store Connect answered 404: Not Found'), { status: 404 });
      return { data: { id: `av-${m[1]}`, type: 'subscriptionAvailabilities', attributes: { availableInNewTerritories: true } } };
    }
    if (m?.[2] === 'subscriptionLocalizations') {
      return { data: (d.names ?? []).map((n) => ({ type: 'subscriptionLocalizations', attributes: n })) };
    }
    if (m?.[2] === 'appStoreReviewScreenshot') {
      return { data: d.screenshot ? { type: 'subscriptionAppStoreReviewScreenshots', attributes: { assetDeliveryState: { state: d.screenshot } } } : null };
    }
    throw new Error(`unexpected ${path}`);
  };
}

const full = (price) => ({ price, territories: ['IND', 'USA'], names: [{ locale: 'en-GB', name: 'Shaadi24+', description: 'Unlimited searches' }], screenshot: 'COMPLETE' });

test('all four subscriptions ready: says so, with prices and names', async () => {
  const { ready, lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: [
        { productId: 'shaadi24_plus_weekly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_WEEK' },
        { productId: 'shaadi24_plus_monthly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_MONTH' },
        { productId: 'shaadi24_plus_quarterly', state: 'APPROVED', subscriptionPeriod: 'THREE_MONTHS' },
        { productId: 'shaadi24_plus_halfyearly', state: 'WAITING_FOR_REVIEW', subscriptionPeriod: 'SIX_MONTHS' },
      ],
      details: { s0: full('499'), s1: full('999'), s2: full('1999'), s3: full('2999') },
    }),
  });
  assert.equal(ready, true);
  const text = lines.join('\n');
  assert.match(text, /✓ shaadi24_plus_weekly \(1 week\): ready to submit; India price 499 INR; sold in 2 countries or regions, India included; shown as "Shaadi24\+" \(en-GB\); review screenshot uploaded\./);
  assert.match(text, /✓ shaadi24_plus_monthly \(1 month\): ready to submit; India price 999 INR/);
  assert.match(text, /✓ shaadi24_plus_quarterly \(3 months\): approved; India price 1999 INR/);
  assert.match(text, /✓ shaadi24_plus_halfyearly \(6 months\): waiting for review; India price 2999 INR/);
  assert.match(text, /All are ready/);
  assert.match(text, /Paid Apps agreement/);
  assert.doesNotMatch(text, /⚠|Also there/);
});

const FOUR = [
  { productId: 'shaadi24_plus_weekly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_WEEK' },
  { productId: 'shaadi24_plus_monthly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_MONTH' },
  { productId: 'shaadi24_plus_quarterly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'THREE_MONTHS' },
  { productId: 'shaadi24_plus_halfyearly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'SIX_MONTHS' },
];

test('a price that differs from the Terms, two groups and a subscription the app does not sell: warns about each', async () => {
  const { ready, lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: [...FOUR, { productId: 'shaadi24_plus_yearly', state: 'MISSING_METADATA', subscriptionPeriod: 'ONE_YEAR' }],
      groups: ['Shaadi24+', 'Shaadi24 weekly'],
      inGroup: [1, 0, 0, 0, 0],
      details: { s0: { ...full('349'), points: ['349.0', '399.0', '449.0', '499.0'] }, s1: full('999'), s2: full('1999'),
        s3: { ...full('3499'), points: ['2499.0', '2899.0', '3099.0', '3499.0'] } },
    }),
  });
  assert.equal(ready, true, 'the App Store still gives them to the app');
  const text = lines.join('\n');
  assert.match(text, /⚠ Prices that differ from the Terms: shaadi24_plus_weekly is 349 INR, the Terms say 499 \(499 is one of Apple's India prices\); shaadi24_plus_halfyearly is 3499 INR, the Terms say 2999 \(Apple has no 2999 in India; the nearest are 2899 and 3099\)\./);
  assert.match(text, /⚠ They're in different groups \(Shaadi24 weekly, Shaadi24\+\)/);
  assert.match(text, /Also there, but not sold by the app: shaadi24_plus_yearly \(missing metadata\)\./);
});

test('a new price set to start later: shows both, and compares the new one with the Terms', async () => {
  const { lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: FOUR,
      details: { s0: full([{ price: '349', start: null }, { price: '499', start: '2099-01-01' }]), s1: full('999'), s2: full('1999'), s3: full('2999') },
    }),
  });
  const text = lines.join('\n');
  assert.match(text, /✓ shaadi24_plus_weekly \(1 week\): ready to submit; India price 349 INR, 499 INR from 2099-01-01;/);
  assert.doesNotMatch(text, /⚠/);
});

test("the India price in effect: the latest that has started", () => {
  const response = (list) => ({
    data: list.map(([, start], i) => ({ attributes: { startDate: start }, relationships: { subscriptionPricePoint: { data: { id: `pp${i}` } } } })),
    included: list.map(([price], i) => ({ id: `pp${i}`, type: 'subscriptionPricePoints', attributes: { customerPrice: price } })),
  });
  assert.deepEqual(indiaPrices(response([['349.0', null], ['449.0', '2026-10-08']]), '2026-10-09'),
    { currency: 'INR', now: 449, next: null, nextStart: null });
  assert.deepEqual(indiaPrices(response([['449', '2026-10-10']]), '2026-10-09'),
    { currency: 'INR', now: null, next: 449, nextStart: '2026-10-10' });
  assert.deepEqual(indiaPrices({ data: [], included: [] }), { currency: 'INR', now: null, next: null, nextStart: null });
});

test('the prices it expects are the Terms\' (lib/billingService.ts DEFAULT_PLANS)', () => {
  const source = fs.readFileSync(new URL('../lib/billingService.ts', import.meta.url), 'utf8');
  const terms = Object.fromEntries([...source.matchAll(/\{ id: '(\w+)', name: '[^']*', amount: (\d+), currency: 'INR'/g)]
    .map(([, id, paise]) => [`shaadi24_plus_${id}`, Number(paise) / 100]));
  assert.deepEqual(Object.fromEntries(EXPECTED.map((w) => [w.productId, w.price])), terms);
});

test('one missing, one missing metadata, a wrong length and a wrong ID: not ready, and says what is missing', async () => {
  const { ready, lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: [
        { productId: 'shaadi24_plus_monthly', state: 'MISSING_METADATA', subscriptionPeriod: 'ONE_WEEK' },
        { productId: 'shaadi24plus_quarterly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'THREE_MONTHS' },
      ],
      groupNames: [],
      details: { s0: { names: [] } },
    }),
  });
  assert.equal(ready, false);
  const text = lines.join('\n');
  assert.match(text, /no display name yet/);
  assert.match(text, /✗ shaadi24_plus_monthly \(1 week\): missing metadata; its length is 1 week, but the app sells it as 1 month; no price for India yet; no countries chosen yet \(Availability\); no display name or description yet; no review screenshot yet\./);
  assert.match(text, /✗ shaadi24_plus_quarterly: not in App Store Connect \(found: shaadi24_plus_monthly, shaadi24plus_quarterly\)\. The product ID must match exactly\./);
  assert.match(text, /✗ shaadi24_plus_weekly: not in App Store Connect/);
  assert.match(text, /Coming soon/);
});

test('sold, but not in India: says so', async () => {
  const { lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({ subscriptions: FOUR, details: { s0: { ...full('499'), territories: ['USA'] }, s1: full('999'), s2: full('1999'), s3: full('2999') } }),
  });
  assert.match(lines.join('\n'), /shaadi24_plus_weekly \(1 week\): ready to submit; India price 499 INR; sold in 1 country or region, but not India;/);
});

test('sold in countries without a price: names them', async () => {
  const { lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({ subscriptions: FOUR, details: {
      s0: { ...full('499'), territories: ['IND', 'DEU', 'USA', 'GBR'], pricedIn: ['IND', 'USA'] },
      s1: full('999'), s2: full('1999'), s3: full('2999') } }),
  });
  assert.match(lines.join('\n'), /shaadi24_plus_weekly \(1 week\): ready to submit; India price 499 INR; sold in 4 countries or regions, India included; 2 of them without a price \(DEU, GBR\);/);
  assert.doesNotMatch(lines.join('\n'), /shaadi24_plus_monthly[^\n]*without a price/);
});

test('no groups yet', async () => {
  const { ready, lines } = await checkSubscriptions({ bundleId: 'com.shaadi24.app', call: standIn({ subscriptions: [], groups: [], groupNames: [] }) });
  assert.equal(ready, false);
  assert.match(lines[0], /No subscription groups yet/);
});

test('a key without access to subscriptions: says which role it needs', async () => {
  const { ready, lines } = await checkSubscriptions({ bundleId: 'com.shaadi24.app', call: standIn({ subscriptions: [], groupsStatus: 403 }) });
  assert.equal(ready, false);
  assert.match(lines[0], /App Manager or Admin role/);
});
