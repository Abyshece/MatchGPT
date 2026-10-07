// ============================================================================
// Shaadi24+ in App Store Connect: are the subscriptions the app sells there,
// and ready for the app to show? (.github/workflows/store-check.yml runs this;
// Actions → App Store check → Run workflow.)
//
// The iPhone app asks the App Store for the products in billing_plans
// (shaadi24_plus_monthly and shaadi24_plus_yearly) and says "Coming soon"
// while it gets none back. The App Store, TestFlight included, gives them
// once each has its price, a name and description, and the review
// screenshot ("Ready to Submit" or later), and the Paid Apps agreement is
// active. Apple's API doesn't show agreements, so that one is left to the
// owner (Business → Agreements).
//
// Uses the TestFlight upload's API key: ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY,
// BUNDLE_ID. Writes what it found to $GITHUB_STEP_SUMMARY when that's set.
// ============================================================================

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { client } from './testflight-testers.mjs';

/** What the app sells (billing_plans.apple_product_id) and for how long. */
export const EXPECTED = [
  { productId: 'shaadi24_plus_monthly', period: 'ONE_MONTH' },
  { productId: 'shaadi24_plus_yearly', period: 'ONE_YEAR' },
];

// The states in which the App Store gives a subscription to the app
const READY = new Set(['READY_TO_SUBMIT', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_BINARY_APPROVAL', 'APPROVED']);

const words = (value) => String(value ?? '?').toLowerCase().replace(/_/g, ' ');
const PERIODS = { ONE_WEEK: '1 week', ONE_MONTH: '1 month', TWO_MONTHS: '2 months', THREE_MONTHS: '3 months', SIX_MONTHS: '6 months', ONE_YEAR: '1 year' };
const period = (p) => PERIODS[p] ?? words(p);

async function tryRead(what, read) {
  try {
    return { value: await read() };
  } catch (e) {
    return { error: `couldn't read ${what} (${e.message})` };
  }
}

/**
 * Checks each expected subscription. Returns { ready, lines }: ready when
 * every one is there in a state the App Store gives to the app; lines say
 * what was found and what's missing, in words.
 */
export async function checkSubscriptions({ call, bundleId, expected = EXPECTED }) {
  const lines = [];
  const apps = await call('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId,name`);
  const app = apps?.data?.[0];
  if (!app) return { ready: false, lines: [`No app with the bundle ID ${bundleId} in App Store Connect.`] };

  let groups;
  try {
    groups = await call('GET', `/v1/apps/${app.id}/subscriptionGroups?include=subscriptions,subscriptionGroupLocalizations&limit=50&limit[subscriptions]=50`);
  } catch (e) {
    if (e.status === 403) {
      return { ready: false, lines: [`The API key can't read subscriptions (${e.message}). It needs the App Manager or Admin role.`] };
    }
    throw e;
  }
  const included = groups?.included ?? [];
  const subscriptions = included.filter((r) => r.type === 'subscriptions');
  const groupNames = (groups?.data ?? []).map((g) => g.attributes?.referenceName).filter(Boolean);
  const groupLocalizations = included.filter((r) => r.type === 'subscriptionGroupLocalizations');

  lines.push(groupNames.length
    ? `Subscription groups: ${groupNames.join(', ')}${groupLocalizations.length
      ? ` (shown to people as ${groupLocalizations.map((l) => `"${l.attributes?.name}" in ${l.attributes?.locale}`).join(', ')})`
      : ' (no display name yet: add one under the group\'s App Store localization)'}`
    : 'No subscription groups yet (Monetization → Subscriptions).');

  let ready = groupNames.length > 0;
  for (const want of expected) {
    const sub = subscriptions.find((s) => s.attributes?.productId === want.productId);
    if (!sub) {
      ready = false;
      const others = subscriptions.map((s) => s.attributes?.productId).filter(Boolean);
      lines.push(`✗ ${want.productId}: not in App Store Connect${others.length ? ` (found: ${others.join(', ')})` : ''}. The product ID must match exactly.`);
      continue;
    }
    const a = sub.attributes ?? {};
    const okState = READY.has(a.state);
    if (!okState) ready = false;
    const notes = [];
    if (a.subscriptionPeriod && a.subscriptionPeriod !== want.period) {
      notes.push(`its length is ${period(a.subscriptionPeriod)}, but the app sells it as ${period(want.period)}`);
    }

    const price = await tryRead('its prices', () => call('GET', `/v1/subscriptions/${sub.id}/prices?filter[territory]=IND&include=subscriptionPricePoint,territory&limit=10`));
    if (price.error) notes.push(price.error);
    else {
      const point = (price.value?.included ?? []).find((r) => r.type === 'subscriptionPricePoints');
      const territory = (price.value?.included ?? []).find((r) => r.type === 'territories');
      notes.push(point ? `India price ${point.attributes?.customerPrice} ${territory?.attributes?.currency ?? 'INR'}` : 'no price for India yet');
    }

    const localizations = await tryRead('its names', () => call('GET', `/v1/subscriptions/${sub.id}/subscriptionLocalizations?limit=50`));
    if (localizations.error) notes.push(localizations.error);
    else {
      const list = localizations.value?.data ?? [];
      notes.push(list.length
        ? `shown as ${list.map((l) => `"${l.attributes?.name}" (${l.attributes?.locale}${l.attributes?.description ? '' : ', no description'})`).join(', ')}`
        : 'no display name or description yet');
    }

    const screenshot = await tryRead('its review screenshot', () => call('GET', `/v1/subscriptions/${sub.id}/appStoreReviewScreenshot`));
    if (screenshot.error) notes.push(screenshot.error);
    else {
      const shot = screenshot.value?.data;
      const state = shot?.attributes?.assetDeliveryState?.state;
      notes.push(!shot ? 'no review screenshot yet' : state && state !== 'COMPLETE' ? `review screenshot ${words(state)}` : 'review screenshot uploaded');
    }

    lines.push(`${okState ? '✓' : '✗'} ${want.productId} (${period(a.subscriptionPeriod)}): ${words(a.state)}; ${notes.join('; ')}.`);
  }

  lines.push(ready
    ? 'Both are ready, so the App Store gives them to the app, TestFlight included, once the Paid Apps agreement is active (Business → Agreements; Apple\'s API doesn\'t show it).'
    : 'Until each shows ✓, the app says Shaadi24+ is "Coming soon". "Missing metadata" means a price, a name and description, or the review screenshot is still missing.');
  return { ready, lines };
}

async function main() {
  const { ASC_ISSUER_ID: issuerId, ASC_KEY_ID: keyId, ASC_KEY: key, BUNDLE_ID: bundleId = 'com.shaadi24.app' } = process.env;
  if (!issuerId || !keyId || !key) {
    console.log('::warning::No App Store Connect API key here (APP_STORE_CONNECT_* secrets), so nothing was checked.');
    return;
  }
  const result = await checkSubscriptions({ call: client({ issuerId, keyId, key }), bundleId });
  for (const line of result.lines) console.log(line);
  if (!result.ready) console.log('::warning::Shaadi24+ isn\'t ready in App Store Connect yet: see the summary.');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Shaadi24+ in App Store Connect\n${result.lines.map((l) => `- ${l}`).join('\n')}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.log(`::error::${e.message}`);
    process.exit(1);
  });
}
