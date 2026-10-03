// Tests for razorpay.ts. Run from the repo root:
//   deno test --no-config supabase/functions/_shared/razorpay_test.ts
import {
  checkoutSignatureOk, hmacSha256Hex, paymentFields, planRequest, razorpay, razorpayConfig, RazorpayError,
  subscriptionFields, subscriptionRequest, timingSafeEqual, webhookSignatureOk, type BillingPlan,
} from './razorpay.ts';

function assertEquals(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected ${e}\n  actual   ${a}`);
}

const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
const monthly: BillingPlan = { id: 'monthly', name: 'MatchGPT+ monthly', amount: 99900, currency: 'INR', period: 'monthly', total_count: 120 };

Deno.test('config: off without keys; test or live from the key id', () => {
  assertEquals(razorpayConfig(env({})), null);
  assertEquals(razorpayConfig(env({ RAZORPAY_KEY_ID: 'rzp_test_x' })), null, 'secret missing');
  const test = razorpayConfig(env({ RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' }))!;
  assertEquals([test.mode, test.apiBase, test.webhookSecret], ['test', 'https://api.razorpay.com/v1', '']);
  const live = razorpayConfig(env({
    RAZORPAY_KEY_ID: ' rzp_live_x ', RAZORPAY_KEY_SECRET: 's', RAZORPAY_API_BASE: 'http://localhost:8788/v1/',
  }))!;
  assertEquals([live.mode, live.keyId, live.apiBase], ['live', 'rzp_live_x', 'http://localhost:8788/v1']);
});

Deno.test('HMAC-SHA256 matches the published test vector', async () => {
  assertEquals(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
});

Deno.test('checkout signature: payment id | our subscription id, with the key secret', async () => {
  const signature = await hmacSha256Hex('secret', 'pay_1|sub_1');
  assertEquals(await checkoutSignatureOk('secret', 'pay_1', 'sub_1', signature), true);
  assertEquals(await checkoutSignatureOk('secret', 'pay_1', 'sub_2', signature), false, 'another subscription');
  assertEquals(await checkoutSignatureOk('other', 'pay_1', 'sub_1', signature), false, 'another secret');
  assertEquals(await checkoutSignatureOk('secret', 'pay_1', 'sub_1', ''), false, 'no signature');
});

Deno.test('webhook signature covers the exact body', async () => {
  const body = '{"event":"subscription.charged"}';
  const signature = await hmacSha256Hex('whsec', body);
  assertEquals(await webhookSignatureOk('whsec', body, signature), true);
  assertEquals(await webhookSignatureOk('whsec', body + ' ', signature), false);
  assertEquals([timingSafeEqual('abc', 'abc'), timingSafeEqual('abc', 'abd'), timingSafeEqual('abc', 'ab')], [true, false, false]);
});

Deno.test('plan and subscription requests', () => {
  assertEquals(planRequest(monthly), {
    period: 'monthly', interval: 1,
    item: { name: 'MatchGPT+ monthly', amount: 99900, currency: 'INR', description: 'MatchGPT+ subscription' },
    notes: { matchgpt_plan: 'monthly' },
  });
  const now = Date.parse('2026-09-27T12:00:00Z');
  const withTrial = subscriptionRequest({ razorpayPlanId: 'plan_A', plan: monthly, userId: 'u1', trialDays: 7, now });
  assertEquals(withTrial, {
    plan_id: 'plan_A', total_count: 120, quantity: 1, customer_notify: true,
    start_at: now / 1000 + 7 * 86_400, expire_by: now / 1000 + 7200, notes: { user_id: 'u1', plan: 'monthly' },
  });
  assertEquals('start_at' in subscriptionRequest({ razorpayPlanId: 'plan_A', plan: monthly, userId: 'u1', trialDays: 0, now }), false,
    'no trial: billing starts when the customer approves');
});

Deno.test("Razorpay's subscription and payment become our rows", () => {
  assertEquals(subscriptionFields({
    id: 'sub_1', plan_id: 'plan_A', status: 'active', current_start: 1790500000, current_end: 1793178400, ended_at: null,
  }), { status: 'active', current_start: '2026-09-27T09:06:40.000Z', current_end: '2026-10-28T09:06:40.000Z', ended_at: null });
  assertEquals('status' in subscriptionFields({
    id: 'sub_1', plan_id: 'p', status: 'something_new', current_start: null, current_end: null, ended_at: null,
  }), false, 'an unknown status is not written');
  assertEquals(paymentFields({ id: 'pay_1', amount: 99900, currency: 'INR', status: 'captured', method: 'upi', invoice_id: 'inv_1', created_at: 1790500000 }), {
    razorpay_payment_id: 'pay_1', razorpay_invoice_id: 'inv_1', amount: 99900, currency: 'INR', status: 'captured',
    method: 'upi', paid_at: '2026-09-27T09:06:40.000Z', refunded_amount: 0,
  });
  const captured = { id: 'pay_2', amount: 99900, currency: 'INR', status: 'captured', created_at: 1790500000, fee: 2358 };
  assertEquals(paymentFields(captured).fee_amount, 2358, "Razorpay's fee");
  assertEquals(paymentFields({ ...captured, amount_refunded: 50000 }).refunded_amount, 50000, 'a part refunded');
  assertEquals(paymentFields({ ...captured, status: 'refunded', amount_refunded: 0 }).refunded_amount, 99900, 'refunded in full');
  assertEquals(paymentFields({ ...captured, amount_refunded: 500000 }).refunded_amount, 99900, 'never more than was paid');
});

Deno.test("API calls: Basic auth, JSON body; Razorpay's error description on failure", async () => {
  const cfg = razorpayConfig(env({ RAZORPAY_KEY_ID: 'rzp_test_k', RAZORPAY_KEY_SECRET: 's3' }))!;
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init! };
    return Promise.resolve(new Response('{"id":"sub_1"}'));
  };
  assertEquals(await razorpay(cfg, 'POST', '/subscriptions', { a: 1 }, ok as typeof fetch), { id: 'sub_1' });
  assertEquals(seen!.url, 'https://api.razorpay.com/v1/subscriptions');
  assertEquals((seen!.init.headers as Record<string, string>).Authorization, `Basic ${btoa('rzp_test_k:s3')}`);
  assertEquals(seen!.init.body, '{"a":1}');

  const bad = () => Promise.resolve(new Response('{"error":{"code":"BAD_REQUEST_ERROR","description":"The id provided does not exist"}}', { status: 400 }));
  try {
    await razorpay(cfg, 'GET', '/subscriptions/sub_x', undefined, bad as typeof fetch);
    throw new Error('should have failed');
  } catch (e) {
    assertEquals([e instanceof RazorpayError, (e as RazorpayError).status, (e as Error).message],
      [true, 400, 'GET /subscriptions/sub_x: 400 The id provided does not exist']);
  }
});
