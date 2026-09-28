// Stand-in for Razorpay, for trying MatchGPT+ locally without an account.
// Answers the API calls the billing functions make (plans, subscriptions,
// cancel, payments, refunds, invoices) and sends signed webhooks the way
// Razorpay does.
// Test hooks (no auth) drive what would happen on Razorpay's side:
//   POST /__authorize/<sub>        the customer approves in Checkout; returns what
//                                  Checkout hands the page (ids + signature)
//   POST /__charge/<sub>           a charge: the first after a trial, or a renewal
//   POST /__fail/<sub>             a renewal fails (pending)
//   POST /__halt/<sub>             retries used up (halted)
//   POST /__end/<sub>?days_ago=N   a cancelled subscription reaches its end
//   POST /__resend                 the last webhook again (same event id)
//   GET  /__subs, GET /__stats
//
//   node tests/e2e/razorpay-standin.cjs     # :8788, keys rzp_test_local / local_secret
//   # serve the functions with an env file containing:
//   #   RAZORPAY_KEY_ID=rzp_test_local
//   #   RAZORPAY_KEY_SECRET=local_secret
//   #   RAZORPAY_WEBHOOK_SECRET=whsec_local
//   #   RAZORPAY_API_BASE=http://<docker gateway, e.g. 172.18.0.1>:8788/v1
//   npx supabase functions serve --env-file <that file>
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8788);
const KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_local';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'local_secret';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_local';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://127.0.0.1:54321/functions/v1/razorpay-webhook';

const plans = new Map();
const subs = new Map();
const payments = new Map();
const invoices = new Map();
const calls = [];
let lastWebhook = null;

const newId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex').slice(0, 14)}`;
const now = () => Math.floor(Date.now() / 1000);
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

function addPeriod(unix, period) {
  const d = new Date(unix * 1000);
  if (period === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return Math.floor(d.getTime() / 1000);
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}
const fail = (res, status, description) => send(res, status, { error: { code: 'BAD_REQUEST_ERROR', description } });

function newPayment(sub, { amount, status, withInvoice }) {
  const payment = {
    id: newId('pay'), entity: 'payment', amount, currency: 'INR', status, method: 'card',
    invoice_id: null, description: 'Recurring Payment via Subscription', created_at: now(),
  };
  if (withInvoice) {
    const invoice = {
      id: newId('inv'), entity: 'invoice', subscription_id: sub.id, payment_id: payment.id, status: 'paid',
      amount, short_url: `https://rzp.io/i/${crypto.randomBytes(4).toString('hex')}`,
    };
    invoices.set(invoice.id, invoice);
    payment.invoice_id = invoice.id;
  }
  payments.set(payment.id, payment);
  return payment;
}

// A successful charge for the next period
function charge(sub) {
  const plan = plans.get(sub.plan_id);
  const start = sub.current_end && sub.current_end > now() ? sub.current_end : now();
  sub.status = 'active';
  sub.current_start = start;
  sub.current_end = addPeriod(start, plan.period);
  sub.charge_at = sub.current_end;
  sub.paid_count += 1;
  sub.remaining_count = sub.total_count - sub.paid_count;
  return newPayment(sub, { amount: plan.item.amount, status: 'captured', withInvoice: true });
}

async function webhook(event, sub, payment, eventId = newId('evt'), rawBody = null) {
  const body = rawBody ?? JSON.stringify({
    entity: 'event', account_id: 'acc_local', event,
    contains: payment ? ['subscription', 'payment'] : ['subscription'],
    payload: { subscription: { entity: { ...sub } }, ...(payment ? { payment: { entity: payment } } : {}) },
    created_at: now(),
  });
  lastWebhook = { event, eventId, body };
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': hmac(WEBHOOK_SECRET, body), 'X-Razorpay-Event-Id': eventId },
    body,
  }).catch((e) => ({ status: 0, text: () => Promise.resolve(String(e)) }));
  const text = await res.text();
  calls.push({ webhook: event, status: res.status, reply: text.slice(0, 200) });
  return { event, status: res.status, reply: text.slice(0, 200) };
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const body = await readBody(req);

  // ---- test hooks ----
  if (parts[0] && parts[0].startsWith('__')) {
    const sub = subs.get(parts[1]);
    switch (parts[0]) {
      case '__stats': return send(res, 200, { calls, subs: subs.size, payments: payments.size });
      case '__subs': return send(res, 200, [...subs.values()]);
      case '__resend': return send(res, 200, lastWebhook
        ? await webhook(lastWebhook.event, null, null, lastWebhook.eventId, lastWebhook.body) : { none: true });
    }
    if (!sub) return fail(res, 404, 'no such subscription');
    const sent = [];
    switch (parts[0]) {
      case '__authorize': {
        if (sub.status !== 'created') return fail(res, 400, `subscription is ${sub.status}`);
        const trial = sub.start_at && sub.start_at > now();
        let payment;
        if (trial) {
          // the small card check, refunded
          sub.status = 'authenticated';
          payment = newPayment(sub, { amount: 500, status: 'refunded', withInvoice: false });
        } else {
          payment = charge(sub);
        }
        sub.customer_id = sub.customer_id || newId('cust');
        send(res, 200, {
          razorpay_payment_id: payment.id,
          razorpay_subscription_id: sub.id,
          razorpay_signature: hmac(KEY_SECRET, `${payment.id}|${sub.id}`),
        });
        // Razorpay's webhooks follow a moment later
        setTimeout(async () => {
          await webhook('subscription.authenticated', trial ? sub : { ...sub, status: 'authenticated' });
          if (!trial) {
            await webhook('subscription.activated', sub);
            await webhook('subscription.charged', sub, payment);
          }
        }, 300);
        return;
      }
      case '__charge': {
        const first = sub.status === 'authenticated';
        const payment = charge(sub);
        if (first) sent.push(await webhook('subscription.activated', sub));
        sent.push(await webhook('subscription.charged', sub, payment));
        break;
      }
      case '__fail': {
        sub.status = 'pending';
        sub.auth_attempts += 1;
        const payment = newPayment(sub, { amount: plans.get(sub.plan_id).item.amount, status: 'failed', withInvoice: false });
        sent.push(await webhook('subscription.pending', sub, payment));
        break;
      }
      case '__halt':
        sub.status = 'halted';
        sent.push(await webhook('subscription.halted', sub));
        break;
      case '__end': {
        const daysAgo = Number(url.searchParams.get('days_ago') || 0);
        sub.status = 'cancelled';
        if (daysAgo) sub.current_end = now() - daysAgo * 86_400;
        sub.ended_at = sub.current_end || now();
        sent.push(await webhook('subscription.cancelled', sub));
        break;
      }
      default: return fail(res, 404, 'unknown hook');
    }
    return send(res, 200, { status: sub.status, sent });
  }

  // ---- Razorpay's API (Basic auth) ----
  const auth = req.headers.authorization || '';
  calls.push({ method: req.method, path: url.pathname });
  if (auth !== `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`) {
    return send(res, 401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
  }
  const [v1, resource, id, action] = parts;
  if (v1 !== 'v1') return fail(res, 404, 'The requested URL was not found on the server.');

  if (resource === 'plans' && req.method === 'POST') {
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(body.period) || !body.item?.amount) return fail(res, 400, 'bad plan');
    const plan = { id: newId('plan'), entity: 'plan', interval: body.interval, period: body.period, item: body.item, notes: body.notes };
    plans.set(plan.id, plan);
    return send(res, 200, plan);
  }
  if (resource === 'subscriptions' && req.method === 'POST' && !id) {
    const allowed = ['plan_id', 'total_count', 'quantity', 'customer_notify', 'start_at', 'expire_by', 'notes', 'addons', 'offer_id', 'end_at'];
    const extra = Object.keys(body).filter((k) => !allowed.includes(k));
    if (extra.length) return fail(res, 400, `${extra.join(', ')} is/are not required and should not be sent`);
    if (!plans.has(body.plan_id)) return fail(res, 400, 'The id provided does not exist');
    if (!Number.isInteger(body.total_count) || body.total_count < 1) return fail(res, 400, 'The total count must be at least 1.');
    if (body.start_at && body.start_at < now()) return fail(res, 400, 'start_at cannot be lesser than the current time.');
    const sub = {
      id: newId('sub'), entity: 'subscription', plan_id: body.plan_id, customer_id: null, status: 'created',
      current_start: null, current_end: null, ended_at: null, quantity: body.quantity ?? 1, notes: body.notes ?? {},
      charge_at: body.start_at ?? null, start_at: body.start_at ?? null, end_at: null, auth_attempts: 0,
      total_count: body.total_count, paid_count: 0, customer_notify: body.customer_notify ?? true,
      created_at: now(), expire_by: body.expire_by ?? null, short_url: 'https://rzp.io/i/standin',
      has_scheduled_changes: false, change_scheduled_at: null, source: 'api', offer_id: null, remaining_count: body.total_count,
    };
    subs.set(sub.id, sub);
    return send(res, 200, sub);
  }
  if (resource === 'subscriptions' && id) {
    const sub = subs.get(id);
    if (!sub) return fail(res, 400, 'The id provided does not exist');
    if (req.method === 'GET' && !action) return send(res, 200, sub);
    if (req.method === 'POST' && action === 'cancel') {
      if (!['authenticated', 'active', 'pending', 'halted', 'paused'].includes(sub.status)) {
        return fail(res, 400, `Subscription is not cancellable in ${sub.status} status.`);
      }
      if (body.cancel_at_cycle_end === true || body.cancel_at_cycle_end === 1) {
        sub.has_scheduled_changes = true;  // stays active until the period ends
      } else {
        sub.status = 'cancelled';
        sub.ended_at = now();
      }
      return send(res, 200, sub);
    }
  }
  if (resource === 'payments' && id && req.method === 'GET' && !action) {
    return payments.has(id) ? send(res, 200, payments.get(id)) : fail(res, 400, 'The id provided does not exist');
  }
  if (resource === 'payments' && id && req.method === 'POST' && action === 'refund') {
    const payment = payments.get(id);
    if (!payment) return fail(res, 400, 'The id provided does not exist');
    if (payment.status !== 'captured') return fail(res, 400, 'The payment has been fully refunded already');
    payment.status = 'refunded';
    payment.amount_refunded = payment.amount;
    return send(res, 200, {
      id: newId('rfnd'), entity: 'refund', amount: payment.amount, currency: 'INR', payment_id: id,
      notes: body.notes ?? {}, status: 'processed', created_at: now(),
    });
  }
  if (resource === 'invoices' && !id && req.method === 'GET') {
    const subId = url.searchParams.get('subscription_id');
    const items = [...invoices.values()].filter((i) => !subId || i.subscription_id === subId);
    return send(res, 200, { entity: 'collection', count: items.length, items });
  }
  if (resource === 'invoices' && id && req.method === 'GET') {
    return invoices.has(id) ? send(res, 200, invoices.get(id)) : fail(res, 400, 'The id provided does not exist');
  }
  return fail(res, 404, 'The requested URL was not found on the server.');
}).listen(PORT, '0.0.0.0', () => console.log(`Razorpay stand-in on :${PORT}, webhooks to ${WEBHOOK_URL}`));
