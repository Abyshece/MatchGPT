// scripts/store-check.mjs against a stand-in for the App Store Connect API.
// Run: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscriptions } from './store-check.mjs';

// Answers by path, like App Store Connect for one app
function standIn({ subscriptions, groups = ['Shaadi24+'], groupNames = [{ name: 'Shaadi24+', locale: 'en-GB' }], details = {}, groupsStatus }) {
  return async (method, path) => {
    assert.equal(method, 'GET');
    if (path.startsWith('/v1/apps?')) return { data: [{ id: 'app1', type: 'apps' }] };
    if (path.startsWith('/v1/apps/app1/subscriptionGroups')) {
      if (groupsStatus) throw Object.assign(new Error(`App Store Connect answered ${groupsStatus}: Forbidden`), { status: groupsStatus });
      return {
        data: groups.map((referenceName, i) => ({ id: `g${i}`, type: 'subscriptionGroups', attributes: { referenceName } })),
        included: [
          ...subscriptions.map((s, i) => ({ id: `s${i}`, type: 'subscriptions', attributes: s })),
          ...groupNames.map((l, i) => ({ id: `l${i}`, type: 'subscriptionGroupLocalizations', attributes: l })),
        ],
      };
    }
    const m = /^\/v1\/subscriptions\/(s\d+)\/(\w+)/.exec(path);
    const d = details[m?.[1]] ?? {};
    if (m?.[2] === 'prices') {
      return d.price ? { data: [{ id: 'p', type: 'subscriptionPrices' }], included: [
        { id: 'pp', type: 'subscriptionPricePoints', attributes: { customerPrice: d.price } },
        { id: 'IND', type: 'territories', attributes: { currency: 'INR' } }] } : { data: [], included: [] };
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

const full = (price) => ({ price, names: [{ locale: 'en-GB', name: 'Shaadi24+', description: 'Unlimited searches' }], screenshot: 'COMPLETE' });

test('both subscriptions ready: says so, with prices and names', async () => {
  const { ready, lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: [
        { productId: 'shaadi24_plus_monthly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_MONTH' },
        { productId: 'shaadi24_plus_yearly', state: 'APPROVED', subscriptionPeriod: 'ONE_YEAR' },
      ],
      details: { s0: full('999'), s1: full('9999') },
    }),
  });
  assert.equal(ready, true);
  const text = lines.join('\n');
  assert.match(text, /✓ shaadi24_plus_monthly \(1 month\): ready to submit; India price 999 INR; shown as "Shaadi24\+" \(en-GB\); review screenshot uploaded\./);
  assert.match(text, /✓ shaadi24_plus_yearly \(1 year\): approved; India price 9999 INR/);
  assert.match(text, /Paid Apps agreement/);
});

test('one missing, one missing metadata, a wrong length and a wrong ID: not ready, and says what is missing', async () => {
  const { ready, lines } = await checkSubscriptions({
    bundleId: 'com.shaadi24.app',
    call: standIn({
      subscriptions: [
        { productId: 'shaadi24_plus_monthly', state: 'MISSING_METADATA', subscriptionPeriod: 'ONE_WEEK' },
        { productId: 'shaadi24plus_yearly', state: 'READY_TO_SUBMIT', subscriptionPeriod: 'ONE_YEAR' },
      ],
      groupNames: [],
      details: { s0: { names: [] } },
    }),
  });
  assert.equal(ready, false);
  const text = lines.join('\n');
  assert.match(text, /no display name yet/);
  assert.match(text, /✗ shaadi24_plus_monthly \(1 week\): missing metadata; its length is 1 week, but the app sells it as 1 month; no price for India yet; no display name or description yet; no review screenshot yet\./);
  assert.match(text, /✗ shaadi24_plus_yearly: not in App Store Connect \(found: shaadi24_plus_monthly, shaadi24plus_yearly\)\. The product ID must match exactly\./);
  assert.match(text, /Coming soon/);
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
