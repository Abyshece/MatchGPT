// MatchGPT+ with Razorpay, against the local stack and the Razorpay stand-in
// (tests/e2e/razorpay-standin.cjs; see its header for the functions' env), as
// one onboarded account (password TestPass!2026). Razorpay's Checkout window is
// replaced by a stand-in that approves at once (or closes, when told to).
//  1. Free account: sidebar "Get MatchGPT+", plans and the 7-day trial
//  2. Closing Checkout changes nothing
//  3. Trial: Pro at once, until the trial ends; Settings shows it
//  4. Trial ends and Razorpay charges (webhook): renews monthly, payment + invoice
//  5. A repeated webhook is ignored, a forged one refused
//  6. Cancel: Pro until the period ends, then Free (webhook)
//  7. Second time: no trial, yearly plan charged at once
//  8. Failed renewal keeps Pro while Razorpay retries; cancelling then stops
//     it at once (no more attempts) and ends Pro
//  9. Two checkouts at once, paid: the one that goes through second is
//     cancelled and refunded, and its popup says so; a late webhook with the
//     old state changes nothing; Settings shows the first and the refund
// 10. Two checkouts at once in the trial: the second is cancelled, nothing to
//     refund; cancelling the trial in Settings keeps Pro until it ends
// 11. A renewal fails until Razorpay gives up (halted): Free
// 12. Without Razorpay keys the plans say "coming soon"
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';  // `docker ps` shows the name
const STANDIN = process.env.RAZORPAY_STANDIN || 'http://127.0.0.1:8788';
const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_local';
const RAZORPAY_AUTH = `Basic ${Buffer.from('rzp_test_local:local_secret').toString('base64')}`;
const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/shots-billing/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const hook = (path) => fetch(`${STANDIN}${path}`, { method: 'POST' }).then((r) => r.json());
const standin = (path) => fetch(`${STANDIN}${path}`, { headers: { Authorization: RAZORPAY_AUTH } }).then((r) => r.json());
const day = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const reset = () => sql(`delete from payments where user_id = '${me}';
  delete from subscriptions where user_id = '${me}';
  update profiles set subscription_tier = 'FREE', subscription_renews_at = null, account_created = now(),
    daily_search_count = 0 where id = '${me}';`);
reset();
const latest = () => sql(`select status || '|' || coalesce(to_char(trial_ends_at, 'YYYY-MM-DD'), '-') || '|' ||
  coalesce(to_char(current_end, 'YYYY-MM-DD'), '-') || '|' || cancel_at_period_end || '|' || mode || '|' || razorpay_subscription_id
  from subscriptions where user_id = '${me}' order by created_at desc limit 1;`).split('|');
const tier = () => sql(`select subscription_tier || '|' || coalesce(to_char(subscription_renews_at, 'YYYY-MM-DD'), '-') from profiles where id = '${me}';`);
const statusOf = (subId) => sql(`select status from subscriptions where razorpay_subscription_id = '${subId}';`);
const refundCalls = async () => (await fetch(`${STANDIN}/__stats`).then((r) => r.json())).calls.filter((c) => c.path?.endsWith('/refund')).length;

const FAKE_CHECKOUT = `window.Razorpay = function (options) {
  this.on = function () {};
  this.open = function () {
    window.__checkout = { key: options.key, subscription_id: options.subscription_id, prefill: options.prefill };
    if (window.__closeCheckout) { setTimeout(function () { options.modal.ondismiss(); }, 50); return; }
    var approve = function () {
      fetch('${STANDIN}/__authorize/' + options.subscription_id, { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (r) { options.handler(r); });
    };
    // Held open (like a second tab's Checkout) until the test releases it
    if (window.__holdCheckout) { window.__releaseCheckout = approve; return; }
    approve();
  };
};`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function signIn({ billingOff = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  await ctx.route('https://checkout.razorpay.com/v1/checkout.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_CHECKOUT }));
  if (billingOff) {
    await ctx.route(`${SUPABASE}/functions/v1/billing`, (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.action !== 'config') return route.continue();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        enabled: false, mode: null, keyId: null, trialDays: 7, trialEligible: true, plans: [] }) });
    });
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  // The signed-in user's headers, to call the billing function directly (a second tab)
  const auth = {};
  page.on('request', (r) => {
    if (!r.url().startsWith(`${SUPABASE}/rest/v1/`)) return;
    const h = r.headers();
    if (h.apikey) auth.apikey = h.apikey;
    if (h.authorization && h.authorization !== `Bearer ${h.apikey}`) auth.authorization = h.authorization;
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  return { ctx, page, auth };
}

const billing = (auth, body) => fetch(`${SUPABASE}/functions/v1/billing`, {
  method: 'POST',
  headers: { apikey: auth.apikey, Authorization: auth.authorization, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const openSettings = async (page) => {
  await page.getByText('Settings', { exact: true }).first().click();
  const section = page.getByTestId('subscription-settings');
  await section.waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);  // it re-reads the subscription from Razorpay
  return section;
};

try {
  let { ctx, page, auth } = await signIn();

  log('1. free account: the sidebar button, plans and trial');
  const sidebarButton = page.locator('aside').getByText('Get MatchGPT+');
  check(await sidebarButton.isVisible(), 'sidebar shows "Get MatchGPT+"');
  await sidebarButton.click();
  let dialog = page.getByRole('dialog');
  const trialButton = dialog.getByRole('button', { name: 'Start 7-day free trial' });
  await trialButton.waitFor({ timeout: 10000 });
  const text = await dialog.innerText();
  check(['₹999', '₹9,999', 'SAVE 17%', 'Unlimited AI searches', 'Test mode: no real money is charged'].every((t) => text.includes(t)),
    'monthly ₹999, yearly ₹9,999 (save 17%), the features, test mode');
  await page.screenshot({ path: `${OUT}1-plans.png` });

  log('2. closing Checkout');
  await page.evaluate(() => { window.__closeCheckout = true; });
  await trialButton.click();
  await page.waitForTimeout(1500);
  check(await trialButton.isVisible() && !(await dialog.getByText(/went wrong|couldn't/i).count()), 'back to the plans, no error');
  check(tier() === 'FREE|-', 'still Free');
  await page.evaluate(() => { window.__closeCheckout = false; });

  log('3. free trial');
  await trialButton.click();
  await dialog.getByText('Welcome to MatchGPT+').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}3-welcome.png` });
  const [status, trialEnd, , , mode, subId] = latest();
  check(status === 'authenticated' && trialEnd === day(7) && mode === 'test', `subscription approved, trial until ${trialEnd} (test mode)`);
  check(tier() === `PRO|${day(7)}`, `Pro until the trial ends (${tier()})`);
  const checkout = await page.evaluate(() => window.__checkout);
  check(checkout.key === 'rzp_test_local' && checkout.prefill.email === EMAIL, 'Checkout got the key id and the user\'s email');
  await dialog.getByRole('button', { name: 'Start exploring' }).click();
  check(await page.locator('aside').getByText('MatchGPT+ active').isVisible(), 'sidebar now says "MatchGPT+ active"');
  let section = await openSettings(page);
  check((await section.innerText()).includes(`Free trial until`) && await section.getByRole('button', { name: 'Cancel trial' }).isVisible(),
    'Settings: "Free trial until …" and "Cancel trial"');
  await page.screenshot({ path: `${OUT}3-settings-trial.png` });
  await sleep(1500);
  check(Number(sql(`select count(*) from billing_events where razorpay_subscription_id = '${subId}';`)) >= 1, 'Razorpay\'s webhook was received');

  log('4. the trial ends and Razorpay charges');
  const charged = await hook(`/__charge/${subId}`);
  check(charged.sent.every((s) => s.status === 200), `webhooks accepted: ${charged.sent.map((s) => `${s.event} ${s.status}`).join(', ')}`);
  const [s4, , end4] = latest();
  check(s4 === 'active' && [day(30), day(31)].includes(end4), `active, paid for a month (until ${end4})`);
  const pay = sql(`select amount || '|' || status || '|' || (invoice_url like 'https://rzp.io/i/%') from payments where user_id = '${me}';`);
  check(pay === '99900|captured|true', `payment saved with its invoice (${pay})`);
  await page.reload();
  section = await openSettings(page);
  const s4text = await section.innerText();
  check(s4text.includes('Renews on') && s4text.includes('₹999') && await section.getByRole('link', { name: 'Invoice' }).isVisible(),
    'Settings: "Renews on …", the ₹999 payment and its invoice link');
  await page.screenshot({ path: `${OUT}4-settings-active.png` });

  log('5. repeated and forged webhooks');
  const events = sql(`select count(*) from billing_events;`);
  const again = await hook('/__resend');
  check(again.status === 200 && again.reply.includes('duplicate'), 'the same delivery again is skipped');
  check(sql(`select count(*) from billing_events;`) === events && sql(`select count(*) from payments where user_id = '${me}';`) === '1', 'nothing recorded twice');
  const forged = await fetch(`${SUPABASE}/functions/v1/razorpay-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'f'.repeat(64) },
    body: JSON.stringify({ event: 'subscription.cancelled', created_at: 0, payload: {} }),
  });
  check(forged.status === 400, `a webhook with a wrong signature is refused (${forged.status})`);

  log('6. cancel');
  await section.getByRole('button', { name: 'Cancel subscription' }).click();
  await section.getByRole('button', { name: 'Yes, cancel' }).click();
  await section.getByText(/Cancelled\. MatchGPT\+ stays on until/).waitFor({ timeout: 10000 });
  const [s6, , end6, cancelled6] = latest();
  const tier6 = tier();
  check(s6 === 'active' && cancelled6 === 'true' && tier6 === `PRO|${end6}`, `still Pro until ${end6}, won't renew (${s6}, cancel at period end: ${cancelled6}, ${tier6})`);
  await page.screenshot({ path: `${OUT}6-cancelled.png` });
  await hook(`/__end/${subId}?days_ago=4`);
  await sleep(500);
  check(latest()[0] === 'cancelled' && tier() === 'FREE|-', 'at the end of the period: Free again');
  await page.reload();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  check(await page.locator('aside').getByText('Get MatchGPT+').isVisible(), 'sidebar is back to "Get MatchGPT+"');

  log('7. second subscription: no trial, yearly');
  await page.locator('aside').getByText('Get MatchGPT+').click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Subscribe for ₹999/month' }).waitFor({ timeout: 10000 });
  check(true, 'no second trial: "Subscribe for ₹999/month"');
  await dialog.getByRole('radio', { name: /Yearly/ }).click();
  await dialog.getByRole('button', { name: 'Subscribe for ₹9,999/year' }).click();
  await dialog.getByText('Welcome to MatchGPT+').waitFor({ timeout: 15000 });
  check((await dialog.innerText()).includes('Paid until'), 'welcome says "Paid until …"');
  const [s7, trial7, end7, , , sub7] = latest();
  check(s7 === 'active' && trial7 === '-' && [day(365), day(366)].includes(end7), `active at once, paid for a year (until ${end7})`);
  await sleep(1500);
  const pay7 = sql(`select count(*) || '|' || coalesce(max(amount), 0) from payments p join subscriptions s on s.id = p.subscription_id where s.razorpay_subscription_id = '${sub7}';`);
  check(pay7 === '1|999900', `the ₹9,999 charge is saved once (${pay7})`);
  check(tier() === `PRO|${end7}`, `Pro until ${end7}`);
  await dialog.getByRole('button', { name: 'Start exploring' }).click();

  log('8. failed renewal, then cancelled');
  await hook(`/__fail/${sub7}`);
  check(latest()[0] === 'pending' && tier().startsWith('PRO|'), 'renewal failed: still Pro while Razorpay retries');
  section = await openSettings(page);
  check((await section.innerText()).includes("Your last payment didn't go through"), 'Settings says the payment failed');
  await section.getByRole('button', { name: 'Cancel subscription' }).click();
  check((await section.innerText()).includes('stops Razorpay from trying again, and MatchGPT+ ends now'), 'the confirmation says it stops now');
  await page.screenshot({ path: `${OUT}8-cancel-pending.png` });
  await section.getByRole('button', { name: 'Yes, cancel' }).click();
  await section.getByText(/Free plan/).waitFor({ timeout: 10000 });
  const rz8 = (await fetch(`${STANDIN}/__subs`).then((r) => r.json())).find((x) => x.id === sub7);
  check(latest()[0] === 'cancelled' && tier() === 'FREE|-' && rz8.status === 'cancelled' && !rz8.has_scheduled_changes,
    `cancelled at once, no more attempts, Free (ours ${latest()[0]}, Razorpay ${rz8.status}, ${tier()})`);

  log('9. two checkouts at once, paid');
  await page.reload();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  const tab1 = await billing(auth, { action: 'subscribe', plan: 'monthly' });
  check(tab1.status === 200 && tab1.body.trialEndsAt === null, `"tab 1" opens Checkout, no trial (${tab1.status})`);
  await page.evaluate(() => { window.__holdCheckout = true; });
  await page.locator('aside').getByText('Get MatchGPT+').click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Subscribe for ₹999/month' }).click();
  await page.waitForFunction(() => typeof window.__releaseCheckout === 'function', null, { timeout: 10000 });
  const tab2 = await page.evaluate(() => window.__checkout.subscription_id);
  const verified1 = await billing(auth, { action: 'verify', ...(await hook(`/__authorize/${tab1.body.subscriptionId}`)) });
  check(verified1.status === 200 && verified1.body.duplicate === false && verified1.body.status === 'active',
    `"tab 1" goes through first (${verified1.status} ${verified1.body.status})`);
  await page.evaluate(() => window.__releaseCheckout());
  await dialog.getByText('You already have MatchGPT+').waitFor({ timeout: 15000 });
  check((await dialog.innerText()).includes("so you won't pay twice"), 'the second popup: "You already have MatchGPT+", cancelled, refunded');
  await page.screenshot({ path: `${OUT}9-already-have.png` });
  await sleep(2000);  // Razorpay's webhooks for both
  check(statusOf(tab1.body.subscriptionId) === 'active' && statusOf(tab2) === 'cancelled',
    `ours: the first active, the second cancelled (${statusOf(tab1.body.subscriptionId)}, ${statusOf(tab2)})`);
  const rz9 = (await fetch(`${STANDIN}/__subs`).then((r) => r.json())).find((x) => x.id === tab2);
  check(rz9.status === 'cancelled', `Razorpay: the second cancelled (${rz9.status})`);
  const [pay9, pay9Status] = sql(`select p.razorpay_payment_id || '|' || p.status from payments p join subscriptions s on s.id = p.subscription_id
    where s.razorpay_subscription_id = '${tab2}';`).split('|');
  const rzPay9 = await standin(`/v1/payments/${pay9}`);
  check(pay9Status === 'refunded' && rzPay9.status === 'refunded', `its ₹999 refunded (ours ${pay9Status}, Razorpay ${rzPay9.status})`);
  const end9 = sql(`select to_char(current_end, 'YYYY-MM-DD') from subscriptions where razorpay_subscription_id = '${tab1.body.subscriptionId}';`);
  check(tier() === `PRO|${end9}`, `Pro from the first one (${tier()})`);
  const nowSec = Math.floor(Date.now() / 1000);
  const lateBody = JSON.stringify({
    entity: 'event', account_id: 'acc_local', event: 'subscription.charged', contains: ['subscription', 'payment'],
    payload: { subscription: { entity: { ...rz9, status: 'active', ended_at: null } }, payment: { entity: { ...rzPay9, status: 'captured' } } },
    created_at: nowSec - 30,
  });
  const late = await fetch(`${SUPABASE}/functions/v1/razorpay-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Razorpay-Event-Id': `evt_late_${nowSec}`,
      'X-Razorpay-Signature': crypto.createHmac('sha256', WEBHOOK_SECRET).update(lateBody).digest('hex'),
    },
    body: lateBody,
  });
  const payAfter = sql(`select status from payments where razorpay_payment_id = '${pay9}';`);
  check(late.status === 200 && statusOf(tab2) === 'cancelled' && payAfter === 'refunded',
    `a late webhook with the old state changes nothing (${late.status}, ${statusOf(tab2)}, ${payAfter})`);
  await page.keyboard.press('Escape');
  section = await openSettings(page);
  const s9 = await section.innerText();
  check(s9.includes('Renews on') && s9.includes('refunded'), 'Settings: the first one renews; the second charge shows as refunded');
  await page.screenshot({ path: `${OUT}9-settings.png` });

  log('10. two checkouts at once in the trial');
  reset();  // never subscribed: the trial again
  const refundsBefore = await refundCalls();
  const monthly = await billing(auth, { action: 'subscribe', plan: 'monthly' });
  const yearly = await billing(auth, { action: 'subscribe', plan: 'yearly' });
  check(!!monthly.body.trialEndsAt && !!yearly.body.trialEndsAt, 'both start with the trial');
  const vYearly = await billing(auth, { action: 'verify', ...(await hook(`/__authorize/${yearly.body.subscriptionId}`)) });
  const vMonthly = await billing(auth, { action: 'verify', ...(await hook(`/__authorize/${monthly.body.subscriptionId}`)) });
  check(vYearly.body.duplicate === false && vMonthly.body.duplicate === true, 'the yearly went through first; the monthly is the second');
  await sleep(2000);
  const [ym, mm] = [statusOf(yearly.body.subscriptionId), statusOf(monthly.body.subscriptionId)];
  check(ym === 'authenticated' && mm === 'cancelled', `ours: yearly in trial, monthly cancelled (${ym}, ${mm})`);
  check(await refundCalls() === refundsBefore, 'nothing to refund');
  check(tier() === `PRO|${day(7)}`, `Pro until the trial ends (${tier()})`);
  await page.reload();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  section = await openSettings(page);
  check((await section.innerText()).includes('₹9,999/year'), 'Settings shows the yearly trial');
  await section.getByRole('button', { name: 'Cancel trial' }).click();
  await section.getByRole('button', { name: 'Yes, cancel' }).click();
  await section.getByText(/Trial cancelled; you won't be charged/).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}10-trial-cancelled.png` });
  const rz10 = (await fetch(`${STANDIN}/__subs`).then((r) => r.json())).find((x) => x.id === yearly.body.subscriptionId);
  const s10 = statusOf(yearly.body.subscriptionId);
  check(s10 === 'cancelled' && rz10.status === 'cancelled' && tier() === `PRO|${day(7)}`,
    `trial cancelled: nothing charged, Pro until it ends (${s10}, Razorpay ${rz10.status}, ${tier()})`);

  log('11. a renewal fails until Razorpay gives up');
  reset();
  const h = (await billing(auth, { action: 'subscribe', plan: 'monthly' })).body.subscriptionId;
  await billing(auth, { action: 'verify', ...(await hook(`/__authorize/${h}`)) });
  await hook(`/__charge/${h}`);
  await hook(`/__fail/${h}`);
  check(statusOf(h) === 'pending' && tier().startsWith('PRO|'), 'charged, then a renewal failed: still Pro while Razorpay retries');
  await hook(`/__halt/${h}`);
  check(statusOf(h) === 'halted' && tier() === 'FREE|-', `retries used up: Free (${tier()})`);
  await ctx.close();

  log('12. no Razorpay keys');
  ({ ctx, page } = await signIn({ billingOff: true }));
  await page.locator('aside').getByText('Get MatchGPT+').click();
  dialog = page.getByRole('dialog');
  const soon = dialog.getByRole('button', { name: 'Coming soon' });
  await soon.waitFor({ timeout: 10000 });
  check(await soon.isDisabled() && await dialog.getByText('MatchGPT+ is coming soon.').isVisible(), '"Coming soon", and the button is off');
  await page.screenshot({ path: `${OUT}12-coming-soon.png` });
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  reset();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
