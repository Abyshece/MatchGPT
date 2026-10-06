// Shaadi24+ bought in the phone apps, on the server: the store-billing and
// store-notifications functions against the local stack and the Google Play
// and App Store stand-in (tests/e2e/store-standin.cjs; see its header for the
// functions' env). Calls the functions the way the apps do (no browser), as
// two onboarded accounts (password TestPass!2026) and two new ones it makes.
//  1. The plans' store products; sign-in needed
//  2. Google Play, monthly with the free trial: checked with Google and
//     acknowledged, Pro in the trial, nothing charged; another account can't
//     claim it; a made-up purchase is refused
//  3. The trial ends and Google charges (notification): the charge with the
//     store's estimated fee; a repeated notification and a wrong secret
//     change nothing
//  4. A failed renewal: grace period keeps Pro, on hold ends it, recovered
//     brings it back with a new charge; renewal turned off keeps Pro
//  5. Refunded in Play Console: the charge refunded, Pro ends
//  6. A new purchase, then a change to yearly: the old purchase closes
//  7. Restore purchases: the account's own come back, another's are skipped
//  8. App Store, yearly: checked by Apple's signature; a look-alike chain, a
//     changed payload, another app's purchase, another account's and a
//     non-subscription are refused
//  9. App Store notifications: renewal, renewal off and on (an older report
//     from the app doesn't undo it), billing retry in the grace period,
//     recovery, a refund of an earlier period and of the current one, a
//     production purchase running out; repeated, forged, TEST and other apps'
// 10. Finance: the summary and the list of charges add up (live and test),
//     admins only; people read their own payments but not the fees
// 11. Deleting an account stops its Google Play renewal and reports the App
//     Store one; later notifications still work; someone restoring the
//     deleted account's purchase takes it over
// 12. Google refusing our own sign-in: the purchase isn't called invalid, and
//     a notification is sent back to be retried, then handled
//
//   ANON_KEY=<from `npx supabase status`> node tests/e2e/store-billing.mjs <email> <other email>
import { execSync } from 'node:child_process';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const STORE = process.env.STORE_STANDIN || 'http://127.0.0.1:8790';
const RTDN_SECRET = process.env.GOOGLE_RTDN_SECRET || 'rtdn_local';
const ANON = process.env.ANON_KEY;
const [EMAIL, OTHER] = process.argv.slice(2);
const PASSWORD = 'TestPass!2026';
if (!ANON || !EMAIL || !OTHER) {
  console.error('usage: ANON_KEY=… node tests/e2e/store-billing.mjs <email> <other email>');
  process.exit(2);
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -F '|'`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const enc = encodeURIComponent;
const DAY = 86_400_000;
const near = (iso, ms, slackMs = 120_000) => !!iso && Math.abs(Date.parse(iso) - ms) < slackMs;

// ---- Calls ----------------------------------------------------------------------------

async function signIn(email) {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  }).then((x) => x.json());
  if (!r.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(r)}`);
  return r.access_token;
}

async function newAccount(tag) {
  const email = `store_${tag}_${Date.now()}@shaadigpt.dev`;
  await fetch(`${SUPABASE}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  sql(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where email = '${email}';`);
  const token = await signIn(email);
  return { email, token, id: sql(`select id from auth.users where email = '${email}';`) };
}

async function fn(name, token, body) {
  const res = await fetch(`${SUPABASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text };
}

async function rest(token, path, init = {}) {
  const res = await fetch(`${SUPABASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json };
}
const rpc = (token, name, args) => rest(token, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

const store = (path, body) => fetch(`${STORE}${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}).then((r) => r.json());

// ---- Reading our tables -----------------------------------------------------------------

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const other = sql(`select id from profiles where email = '${OTHER}';`);
const reset = (id) => sql(`delete from payments where user_id = '${id}';
  delete from subscriptions where user_id = '${id}';
  update profiles set subscription_tier = 'FREE', subscription_renews_at = null where id = '${id}';`);
const tier = (id) => sql(`select subscription_tier from profiles where id = '${id}';`);
const renewsAt = (id) => sql(`select subscription_renews_at from profiles where id = '${id}';`);
function subRow(provider, storeId) {
  const r = sql(`select status, plan_id, mode, coalesce(user_id::text, ''), coalesce(trial_ends_at::text, ''),
      coalesce(current_end::text, ''), cancel_at_period_end, coalesce(auto_renew::text, ''), coalesce(store_product_id, '')
    from subscriptions where provider = '${provider}' and store_subscription_id = '${storeId.replace(/'/g, "''")}';`);
  if (!r) return null;
  const [status, plan, mode, userId, trialEnds, currentEnd, cancelAtEnd, autoRenew, product] = r.split('|');
  return { status, plan, mode, userId, trialEnds, currentEnd, cancelAtEnd: cancelAtEnd === 't', autoRenew, product };
}
function payments(where) {
  const r = sql(`select provider, store_order_id, amount, currency, status,
      coalesce(fee_amount, -1), fee_estimated, refunded_amount, coalesce(refunded_at::text, ''), paid_at, coalesce(user_id::text, '')
    from payments where ${where} order by paid_at, created_at;`);
  return r ? r.split('\n').map((line) => {
    const [provider, orderId, amount, currency, status, fee, feeEstimated, refunded, refundedAt, paidAt, userId] = line.split('|');
    return { provider, orderId, amount: +amount, currency, status, fee: +fee, feeEstimated: feeEstimated === 't', refunded: +refunded, refundedAt, paidAt, userId };
  }) : [];
}

const payload = (jws) => JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString());

// =========================================================================================

reset(me);
reset(other);
const tokenA = await signIn(EMAIL);
const tokenB = await signIn(OTHER);

log('1. Plans and their store products');
{
  const r = await fn('store-billing', tokenA, { action: 'config' });
  const monthly = r.body?.plans?.find((p) => p.id === 'monthly');
  const yearly = r.body?.plans?.find((p) => p.id === 'yearly');
  check(r.status === 200 && r.body.googlePlay === true, 'config answers, Google Play set up');
  check(monthly?.googleProductId === 'shaadi24_plus' && monthly?.googleBasePlanId === 'monthly' &&
    monthly?.appleProductId === 'shaadi24_plus_monthly' && monthly?.amount === 99900, 'monthly: shaadi24_plus/monthly, shaadi24_plus_monthly, ₹999');
  check(yearly?.googleBasePlanId === 'yearly' && yearly?.appleProductId === 'shaadi24_plus_yearly', 'yearly: shaadi24_plus/yearly, shaadi24_plus_yearly');
  const anon = await fn('store-billing', null, { action: 'config' });
  check(anon.status === 401, `not signed in: refused (${anon.status})`);
}

log('2. Google Play: monthly with the free trial');
const trial = await store('/__google/purchase', { userId: me, basePlan: 'monthly', trial: true });
{
  const r = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: trial.purchaseToken });
  check(r.status === 200 && r.body.pro === true && r.body.status === 'authenticated' && r.body.plan === 'monthly',
    `verified: Pro in the trial (${r.status} ${r.text.slice(0, 120)})`);
  check(near(r.body?.trialEndsAt, Date.now() + 7 * DAY), 'the trial ends in 7 days');
  const row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'authenticated' && row.mode === 'test' && row.userId === me && row.product === 'shaadi24_plus',
    'saved: google_play, in the trial, test mode, this account');
  check(payments(`user_id = '${me}'`).length === 0, 'nothing charged in the trial');
  check(tier(me) === 'PRO', 'Pro on');
  const g = await store(`/__google/purchase/${enc(trial.purchaseToken)}`);
  check(g.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', 'acknowledged with Google');

  const theirs = await fn('store-billing', tokenB, { action: 'verify', platform: 'android', purchaseToken: trial.purchaseToken });
  check(theirs.status === 400 && theirs.body?.code === 'OTHER_ACCOUNT', `another account can't claim it (${theirs.body?.code})`);
  check(tier(other) === 'FREE', 'and gets no Pro');
  const fake = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: 'made-up-token' });
  check(fake.status === 400 && fake.body?.code === 'INVALID_PURCHASE', `a made-up purchase is refused (${fake.body?.code})`);
  const empty = await fn('store-billing', tokenA, { action: 'verify', platform: 'android' });
  check(empty.status === 400, 'a missing purchase is refused');
}

log('2b. Reported twice at once');
{
  const verify = (token, purchaseToken) => fn('store-billing', token, { action: 'verify', platform: 'android', purchaseToken });
  const p = await store('/__google/purchase', { userId: me, basePlan: 'monthly' });
  const [r1, r2] = await Promise.all([verify(tokenA, p.purchaseToken), verify(tokenA, p.purchaseToken)]);
  check(r1.status === 200 && r2.status === 200 && sql(`select count(*) from subscriptions where store_subscription_id = '${p.purchaseToken}';`) === '1',
    'the app and a retry together: both fine, one subscription');
  check(payments(`store_order_id = '${p.orderId}'`).length === 1, 'one charge');
  // A purchase with no account on it (bought outside the app), claimed by two at once
  const q = await store('/__google/purchase', { basePlan: 'monthly' });
  const [x, y] = await Promise.all([verify(tokenA, q.purchaseToken), verify(tokenB, q.purchaseToken)]);
  const winner = x.status === 200 ? me : other;
  check([x.status, y.status].sort().join() === '200,400' && [x, y].some((r) => r.body?.code === 'OTHER_ACCOUNT') &&
    subRow('google_play', q.purchaseToken)?.userId === winner, 'claimed by two accounts at once: the first keeps it');
  await store(`/__google/expire/${enc(p.purchaseToken)}`, {});
  await store(`/__google/expire/${enc(q.purchaseToken)}`, {});
  check(tier(other) === 'FREE' && tier(me) === 'PRO', '(both expired again; the trial goes on)');
  const both = `'${p.purchaseToken}', '${q.purchaseToken}'`;
  sql(`delete from payments where subscription_id in (select id from subscriptions where store_subscription_id in (${both}));
    delete from subscriptions where store_subscription_id in (${both});`);
}

log('3. The trial ends and Google charges');
{
  const r = await store(`/__google/renew/${enc(trial.purchaseToken)}`, {});
  check(r.notified?.status === 200, `notification handled (${r.notified?.status} ${r.notified?.text})`);
  const row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'active' && near(row.currentEnd, Date.parse(r.purchase.lineItems[0].expiryTime), 2000), 'active, renews in a month');
  const p = payments(`user_id = '${me}'`);
  check(p.length === 1 && p[0].provider === 'google_play' && p[0].amount === 99900 && p[0].currency === 'INR' &&
    p[0].status === 'captured' && p[0].orderId === r.purchase.lineItems[0].latestSuccessfulOrderId, 'the charge: ₹999, its Google order');
  check(p[0]?.fee === 14985 && p[0].feeEstimated, "Google's fee estimated at 15% (₹149.85)");
  check(tier(me) === 'PRO' && near(renewsAt(me), Date.parse(row.currentEnd), 2000), 'Pro until the new period ends');

  const again = await store('/__google/resend', {});
  check(again.status === 200 && /already handled/.test(again.text), `the same notification again: ${again.text}`);
  check(payments(`user_id = '${me}'`).length === 1, 'still one charge');
  const forged = await fetch(`${SUPABASE}/functions/v1/store-notifications?provider=google&secret=wrong`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  check(forged.status === 403, `a wrong secret is refused (${forged.status})`);
}

log('4. A failed renewal, recovered; renewal turned off');
{
  await store(`/__google/grace/${enc(trial.purchaseToken)}`, {});
  let row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'pending' && tier(me) === 'PRO', 'grace period: Pro stays');
  check(Date.parse(renewsAt(me)) > Date.now() + 6 * DAY, 'for up to a week');
  await store(`/__google/hold/${enc(trial.purchaseToken)}`, {});
  row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'halted' && tier(me) === 'FREE', 'on hold: Pro ends');
  await store(`/__google/recover/${enc(trial.purchaseToken)}`, {});
  row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'active' && tier(me) === 'PRO', 'recovered: Pro again');
  check(payments(`user_id = '${me}'`).length === 2, 'and a second charge');
  await store(`/__google/cancel/${enc(trial.purchaseToken)}`, {});
  row = subRow('google_play', trial.purchaseToken);
  check(row?.status === 'active' && row.cancelAtEnd && row.autoRenew === 'false' && tier(me) === 'PRO',
    'renewal turned off: Pro until the period ends');
}

log('5. Refunded in Play Console');
{
  const r = await store(`/__google/refund/${enc(trial.purchaseToken)}`, {});
  check(r.notified?.status === 200, `voided purchase handled (${r.notified?.text})`);
  const p = payments(`user_id = '${me}' and store_order_id = '${r.orderId}'`)[0];
  check(p?.status === 'refunded' && p.refunded === 99900 && !!p.refundedAt, 'the charge refunded in full');
  check(payments(`user_id = '${me}' and status = 'captured'`).length === 1, 'the earlier charge stays');
  check(subRow('google_play', trial.purchaseToken)?.status === 'expired' && tier(me) === 'FREE', 'revoked: Pro ends');
}

log('6. A new purchase, then a change to yearly');
const monthly = await store('/__google/purchase', { userId: me, basePlan: 'monthly' });
let yearlyToken;
{
  const r = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: monthly.purchaseToken });
  check(r.status === 200 && r.body.pro && r.body.status === 'active', 'monthly, charged at once');
  check(payments(`store_order_id = '${monthly.orderId}'`)[0]?.amount === 99900, 'its charge');
  const change = await store(`/__google/change/${enc(monthly.purchaseToken)}`, { basePlan: 'yearly' });
  yearlyToken = change.purchaseToken;
  const v = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: yearlyToken });
  check(v.status === 200 && v.body.pro && v.body.plan === 'yearly', 'the yearly purchase verified');
  check(subRow('google_play', monthly.purchaseToken)?.status === 'expired', 'the monthly one it replaced is closed');
  const p = payments(`store_order_id = '${change.orderId}'`)[0];
  check(p?.amount === 999900 && p.fee === 149985, 'yearly charge ₹9,999, fee ₹1,499.85');
}

log('7. Restore purchases');
{
  const theirs = await store('/__google/purchase', { userId: other, basePlan: 'monthly' });
  const b = await fn('store-billing', tokenB, { action: 'verify', platform: 'android', purchaseToken: theirs.purchaseToken });
  check(b.status === 200 && tier(other) === 'PRO', 'the other account buys its own');
  sql(`update subscriptions set status = 'halted' where store_subscription_id = '${yearlyToken}';`);
  sql(`select sync_pro_status('${me}');`);
  check(tier(me) === 'FREE', '(our copy made stale: Pro off)');
  const r = await fn('store-billing', tokenA, {
    action: 'restore', platform: 'android', purchaseTokens: [yearlyToken, trial.purchaseToken, theirs.purchaseToken, 'made-up'],
  });
  check(r.status === 200 && r.body.restored === 2 && r.body.pro === true && r.body.plan === 'yearly',
    `restored 2 of 4 (${r.text.slice(0, 120)})`);
  check(subRow('google_play', yearlyToken)?.status === 'active' && tier(me) === 'PRO', 'the yearly one is live again');
  check(subRow('google_play', theirs.purchaseToken)?.userId === other, "the other account's stays theirs");
  await store(`/__google/expire/${enc(yearlyToken)}`, {});
  check(tier(me) === 'FREE', 'yearly ran out: Free');
}

log('8. App Store: yearly');
const yearlyApple = await store('/__apple/purchase', { userId: me, product: 'shaadi24_plus_yearly' });
const firstTx = payload(yearlyApple.jws);
{
  const r = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: yearlyApple.jws });
  check(r.status === 200 && r.body.pro && r.body.status === 'active' && r.body.plan === 'yearly', `verified (${r.text.slice(0, 100)})`);
  const row = subRow('app_store', yearlyApple.originalTransactionId);
  check(row?.status === 'active' && row.mode === 'test' && row.userId === me && near(row.currentEnd, firstTx.expiresDate, 2000),
    'saved: app_store, sandbox = test mode, a year');
  const p = payments(`store_order_id = '${yearlyApple.transactionId}'`)[0];
  check(p?.provider === 'app_store' && p.amount === 999900 && p.fee === 149985 && near(p.paidAt, firstTx.purchaseDate, 2000),
    'the charge: ₹9,999 at the purchase time, fee estimated');

  const lookAlike = await store('/__apple/sign', { payload: firstTx, chain: 'other' });
  const r1 = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: lookAlike.jws });
  check(r1.status === 400 && r1.body?.code === 'INVALID_PURCHASE', 'signed by a look-alike chain: refused');
  const [h, , s] = yearlyApple.jws.split('.');
  const changed = Buffer.from(JSON.stringify({ ...firstTx, appAccountToken: other })).toString('base64url');
  const r2 = await fn('store-billing', tokenB, { action: 'verify', platform: 'ios', jws: `${h}.${changed}.${s}` });
  check(r2.status === 400 && r2.body?.code === 'INVALID_PURCHASE', 'a changed payload: refused');
  const otherApp = await store('/__apple/sign', { payload: { ...firstTx, bundleId: 'com.example.other', originalTransactionId: '1999' } });
  const r3 = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: otherApp.jws });
  check(r3.status === 400 && r3.body?.code === 'WRONG_APP', "another app's purchase: refused");
  const r4 = await fn('store-billing', tokenB, { action: 'verify', platform: 'ios', jws: yearlyApple.jws });
  check(r4.status === 400 && r4.body?.code === 'OTHER_ACCOUNT', "another account's: refused");
  const consumable = await store('/__apple/sign', { payload: { ...firstTx, type: 'Consumable', originalTransactionId: '1998' } });
  const r5 = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: consumable.jws });
  check(r5.status === 400 && r5.body?.code === 'UNKNOWN_PRODUCT', 'not a subscription: refused');
  check(tier(other) === 'PRO' && sql(`select count(*) from subscriptions where store_subscription_id in ('1998', '1999');`) === '0',
    'none of them saved');
}

log('9. App Store notifications');
const orig = yearlyApple.originalTransactionId;
{
  const renewed = await store(`/__apple/renew/${orig}`, {});
  check(renewed.notified?.status === 200, `DID_RENEW handled (${renewed.notified?.text})`);
  check(payments(`provider = 'app_store' and user_id = '${me}'`).length === 2, 'a second charge');

  await store(`/__apple/autorenew/${orig}?on=0`, {});
  let row = subRow('app_store', orig);
  check(row?.cancelAtEnd && row.autoRenew === 'false' && row.status === 'active', 'renewal turned off: ends at the period end');
  const old = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: yearlyApple.jws });
  const latest = await store(`/__apple/latest/${orig}`);
  const now = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: latest.jws });
  row = subRow('app_store', orig);
  check(old.status === 200 && now.status === 200 && row.cancelAtEnd && near(row.currentEnd, payload(latest.jws).expiresDate, 2000),
    "the app's own (older) reports don't undo it");
  await store(`/__apple/autorenew/${orig}?on=1`, {});
  check(subRow('app_store', orig)?.cancelAtEnd === false, 'turned back on');

  // The same delivery twice
  const fixed = { notificationType: 'DID_CHANGE_RENEWAL_STATUS', subtype: 'AUTO_RENEW_ENABLED', notificationUUID: crypto.randomUUID(),
    data: { bundleId: 'com.shaadi24.app', environment: 'Sandbox', signedTransactionInfo: latest.jws } };
  const d1 = await store('/__apple/notify', { payload: fixed });
  const d2 = await store('/__apple/notify', { payload: fixed });
  check(d1.status === 200 && d2.status === 200 && /already handled/.test(d2.text), `a repeated delivery: ${d2.text}`);

  await store(`/__apple/fail/${orig}?grace=1`, {});
  row = subRow('app_store', orig);
  check(row?.status === 'pending' && tier(me) === 'PRO', 'billing retry in the grace period: Pro stays');
  const recovered = await store(`/__apple/renew/${orig}`, {});
  check(subRow('app_store', orig)?.status === 'active' && tier(me) === 'PRO', 'recovered');
  check(payments(`provider = 'app_store' and user_id = '${me}'`).length === 3, 'a third charge');

  const early = await store(`/__apple/refund/${orig}?tx=${yearlyApple.transactionId}`, {});
  check(early.notified?.status === 200, 'refund of the first (ended) period handled');
  check(payments(`store_order_id = '${yearlyApple.transactionId}'`)[0]?.status === 'refunded', 'that charge refunded');
  check(subRow('app_store', orig)?.status === 'active' && tier(me) === 'PRO', 'the current period carries on');
  const current = await store(`/__apple/refund/${orig}`, {});
  check(payments(`store_order_id = '${recovered.transactionId}'`)[0]?.refunded === 999900, 'refund of the current charge');
  check(current.notified?.status === 200 && subRow('app_store', orig)?.status === 'cancelled' && tier(me) === 'FREE',
    'the current period refunded: Pro ends');

  const prod = await store('/__apple/purchase', { userId: me, product: 'shaadi24_plus_monthly', environment: 'Production' });
  const v = await fn('store-billing', tokenA, { action: 'verify', platform: 'ios', jws: prod.jws });
  check(v.status === 200 && v.body.pro && subRow('app_store', prod.originalTransactionId)?.mode === 'live', 'a production purchase: live mode');
  await store(`/__apple/expire/${prod.originalTransactionId}`, {});
  check(subRow('app_store', prod.originalTransactionId)?.status === 'expired' && tier(me) === 'FREE', 'it runs out: Free');

  const forged = await store('/__apple/notify', { payload: { notificationType: 'DID_RENEW', data: { signedTransactionInfo: latest.jws } }, chain: 'other' });
  check(forged.status === 400, `a forged notification is refused (${forged.status})`);
  const test = await store('/__apple/notify', { payload: { notificationType: 'TEST' } });
  check(test.status === 200 && /test/.test(test.text), "Apple's TEST notification answered");
  const elsewhere = await store('/__apple/notify', { payload: { notificationType: 'DID_RENEW', data: { bundleId: 'com.example.other' } } });
  check(elsewhere.status === 200 && /another app/.test(elsewhere.text), "another app's notification ignored");
}

log('10. Finance');
{
  const denied = await rpc(tokenB, 'admin_finance_summary', { p_months: 3 });
  check(denied.status >= 400 && /Admins only/.test(JSON.stringify(denied.body)), 'not an admin: refused');
  const deniedList = await rpc(tokenB, 'admin_list_payments', {});
  check(deniedList.status >= 400, 'the list too');

  const wasAdmin = sql(`select count(*) from admin_emails where lower(email) = lower('${EMAIL}');`) === '1';
  if (!wasAdmin) sql(`insert into admin_emails (email, notes) values ('${EMAIL}', 'store-billing test');`);
  try {
    // What the totals should be, worked out here from every charge
    const rows = sql(`select p.provider, p.amount, p.refunded_amount, coalesce(p.fee_amount, 0), coalesce(s.mode, 'live'),
        p.currency, to_char(p.paid_at, 'YYYY-MM'), p.id
      from payments p left join subscriptions s on s.id = p.subscription_id where p.status in ('captured', 'refunded');`)
      .split('\n').filter(Boolean).map((l) => {
        const [provider, amount, refunded, fee, mode, currency, month, id] = l.split('|');
        return { provider, amount: +amount, refunded: +refunded, fee: +fee, mode, currency, month, id };
      });
    // The stores give back their commission on what they refund
    const net = (r) => (r.amount - r.refunded) - (r.amount > 0 ? Math.round(r.fee * (r.amount - r.refunded) / r.amount) : 0);
    for (const mode of ['test', 'live']) {
      const mine = rows.filter((r) => r.mode === mode && r.currency === 'INR');
      const want = { gross: 0, refunds: 0, net: 0, charges: mine.length };
      for (const r of mine) { want.gross += r.amount; want.refunds += r.refunded; want.net += net(r); }
      const s = await rpc(tokenA, 'admin_finance_summary', { p_months: 12, p_mode: mode });
      const all = s.body?.all_time;
      check(s.status === 200 && s.body.mode === mode && all?.gross === want.gross && all?.refunds === want.refunds &&
        all?.net === want.net && all?.charges === want.charges,
        `${mode}: all-time gross ₹${want.gross / 100}, refunds ₹${want.refunds / 100}, net ₹${want.net / 100} (${JSON.stringify(all)})`);
      const thisMonth = new Date().toISOString().slice(0, 7);
      const m = s.body?.months?.find((x) => x.month === thisMonth);
      const inMonth = mine.filter((r) => r.month === thisMonth);
      const fees = inMonth.reduce((t, r) => t + (r.amount - r.refunded - net(r)), 0);
      check(m && m.gross === inMonth.reduce((t, r) => t + r.amount, 0) && m.fees === fees && s.body.months.length === 12,
        `${mode}: this month's gross and fees, 12 months listed`);
      if (mode === 'test') {
        const gp = m?.by_provider?.google_play;
        check(gp && gp.gross === inMonth.filter((r) => r.provider === 'google_play').reduce((t, r) => t + r.amount, 0), 'split by seller');
      }
    }
    const list = await rpc(tokenA, 'admin_list_payments', { p_mode: 'test', p_limit: 5000 });
    const byId = new Map((list.body ?? []).map((r) => [r.order_id, r]));
    const firstApple = byId.get(yearlyApple.transactionId);
    check(firstApple?.net_amount === 0 && firstApple.refunded_amount === 999900 && firstApple.user_email === EMAIL
      && firstApple.provider === 'app_store', 'a refunded store charge: net 0 (the store returns its fee), with who bought it');
    const live = await rpc(tokenA, 'admin_list_payments', { p_mode: 'live' });
    check(live.status === 200 && live.body.every((r) => r.mode === 'live') && live.body.some((r) => r.provider === 'app_store'),
      'live only: the production purchase');
    const google = await rpc(tokenA, 'admin_list_payments', { p_provider: 'google_play', p_limit: 2 });
    check(google.status === 200 && google.body.length === 2 && google.body.every((r) => r.provider === 'google_play'), 'one seller, a page of 2');
  } finally {
    if (!wasAdmin) sql(`delete from admin_emails where email = '${EMAIL}';`);
  }

  const own = await rest(tokenA, `payments?select=id,provider,amount,refunded_amount,store_order_id&user_id=eq.${me}`);
  check(own.status === 200 && own.body.length === payments(`user_id = '${me}'`).length, 'people read their own payments');
  const fees = await rest(tokenA, 'payments?select=fee_amount');
  check(fees.status === 401 || fees.status === 403, `but not the fees (${fees.status})`);
  const star = await rest(tokenA, 'payments?select=*');
  check(star.status === 401 || star.status === 403, `nor select * (${star.status})`);
  const theirs = await rest(tokenB, `payments?select=id&user_id=eq.${me}`);
  check(theirs.status === 200 && theirs.body.length === 0, "nor anyone else's");
}

log('11. Deleting an account with store subscriptions');
{
  const c = await newAccount('del');
  const g = await store('/__google/purchase', { userId: c.id, basePlan: 'monthly' });
  const a = await store('/__apple/purchase', { userId: c.id, product: 'shaadi24_plus_monthly' });
  const v1 = await fn('store-billing', c.token, { action: 'verify', platform: 'android', purchaseToken: g.purchaseToken });
  const v2 = await fn('store-billing', c.token, { action: 'verify', platform: 'ios', jws: a.jws });
  check(v1.status === 200 && v2.status === 200 && tier(c.id) === 'PRO', 'a new account buys in both stores');
  const del = await fn('delete-account', c.token, { confirmation: 'Delete' });
  check(del.status === 200 && del.body?.success && del.body.details?.app_store_renews === true,
    `deleted; the App Store renewal is reported (${del.text.slice(0, 160)})`);
  const gs = await store(`/__google/purchase/${enc(g.purchaseToken)}`);
  check(gs.cancelledByDeveloper === true && gs.lineItems[0].autoRenewingPlan.autoRenewEnabled === false, 'the Google Play renewal stopped');
  check(subRow('google_play', g.purchaseToken)?.userId === '' && payments(`store_order_id = '${g.orderId}'`)[0]?.userId === '',
    'its records stay, without the account');

  const renewal = await store(`/__apple/renew/${a.originalTransactionId}`, {});
  check(renewal.notified?.status === 200 && payments(`store_order_id = '${renewal.transactionId}'`)[0]?.userId === '',
    'a later renewal is still recorded');
  const d = await newAccount('new');
  const latest = await store(`/__apple/latest/${a.originalTransactionId}`);
  const r = await fn('store-billing', d.token, { action: 'restore', platform: 'ios', jws: [latest.jws] });
  check(r.status === 200 && r.body.restored === 1 && r.body.pro && subRow('app_store', a.originalTransactionId)?.userId === d.id,
    "whoever restores the deleted account's purchase takes it over");
  sql(`delete from payments where user_id = '${d.id}'; delete from subscriptions where user_id = '${d.id}';`);
  sql(`delete from auth.users where id = '${d.id}';`);
}

log("12. Google refusing our sign-in is our problem, not the purchase's");
{
  const p = await store('/__google/purchase', { userId: me, basePlan: 'monthly' });
  await store('/__google/signin', { ok: false });
  const v = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: p.purchaseToken });
  check(v.status === 500 && v.body?.code !== 'INVALID_PURCHASE', `the purchase isn't called invalid; "please try again" (${v.status} ${v.body?.code ?? ''})`);
  const n = await store(`/__google/renew/${enc(p.purchaseToken)}`, {});
  check(n.notified?.status >= 500, `a notification meanwhile goes back to Pub/Sub to be retried, not dropped (${n.notified?.status})`);
  await store('/__google/signin', { ok: true });
  const again = await store('/__google/resend', {});
  check(again.status === 200 && subRow('google_play', p.purchaseToken)?.userId === me, 'redelivered once the sign-in works: handled');
  const v2 = await fn('store-billing', tokenA, { action: 'verify', platform: 'android', purchaseToken: p.purchaseToken });
  check(v2.status === 200 && tier(me) === 'PRO', 'and the purchase goes through');
  await store(`/__google/expire/${enc(p.purchaseToken)}`, {});
}

reset(me);
reset(other);
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
