// ============================================================================
// Razorpay, for the billing functions (billing, razorpay-webhook, delete-account)
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET  API keys (Razorpay Dashboard → Account &
//                                         Settings → API Keys). rzp_test_… keys take
//                                         test payments, rzp_live_… keys real ones.
//   RAZORPAY_WEBHOOK_SECRET               the secret entered when adding the webhook
//                                         in Razorpay (Accounts & Settings → Webhooks)
//   PRO_TRIAL_DAYS                        optional: free trial for first-time
//                                         subscribers, in days (default 7, 0 = none)
//   RAZORPAY_API_BASE                     only for local testing against a stand-in
// Until the keys are set, billing is off: the website says Pro is coming soon.
// ============================================================================

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: 'test' | 'live';
  apiBase: string;
}

type Env = { get(name: string): string | undefined };

export function razorpayConfig(env: Env = Deno.env): RazorpayConfig | null {
  const keyId = env.get('RAZORPAY_KEY_ID')?.trim() ?? '';
  const keySecret = env.get('RAZORPAY_KEY_SECRET')?.trim() ?? '';
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: env.get('RAZORPAY_WEBHOOK_SECRET')?.trim() ?? '',
    mode: keyId.startsWith('rzp_live_') ? 'live' : 'test',
    apiBase: (env.get('RAZORPAY_API_BASE') || 'https://api.razorpay.com/v1').replace(/\/+$/, ''),
  };
}

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// One call to Razorpay's API (Basic auth with the key id and secret).
export async function razorpay<T>(
  cfg: RazorpayConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${cfg.keyId}:${cfg.keySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    const reason = (data as any)?.error?.description ?? text.slice(0, 200);
    throw new RazorpayError(`${method} ${path.split('?')[0]}: ${res.status} ${reason}`, res.status);
  }
  return data as T;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares without stopping at the first difference.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Checkout's proof that the customer approved the subscription:
// HMAC-SHA256 of "<payment id>|<subscription id>" with the key secret. The
// subscription id must be the one saved on the server, not Checkout's.
export async function checkoutSignatureOk(
  keySecret: string, paymentId: string, subscriptionId: string, signature: string,
): Promise<boolean> {
  return timingSafeEqual(await hmacSha256Hex(keySecret, `${paymentId}|${subscriptionId}`), signature);
}

// A webhook's X-Razorpay-Signature: HMAC-SHA256 of the raw body with the webhook secret.
export async function webhookSignatureOk(webhookSecret: string, rawBody: string, signature: string): Promise<boolean> {
  return timingSafeEqual(await hmacSha256Hex(webhookSecret, rawBody), signature);
}

// ---- Razorpay's entities (the parts used here) ----------------------------------

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  ended_at: number | null;
  start_at?: number | null;
  charge_at?: number | null;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  invoice_id?: string | null;
  created_at: number;
}

export interface BillingPlan {
  id: 'monthly' | 'yearly';
  name: string;
  amount: number;  // paise
  currency: string;
  period: 'monthly' | 'yearly';
  total_count: number;
}

const STATUSES = new Set([
  'created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired', 'paused',
]);

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

// Our subscriptions row fields from Razorpay's subscription.
export function subscriptionFields(s: RazorpaySubscription): Record<string, string | null> {
  return {
    ...(STATUSES.has(s.status) ? { status: s.status } : {}),
    current_start: iso(s.current_start),
    current_end: iso(s.current_end),
    ended_at: iso(s.ended_at),
  };
}

// Our payments row fields from Razorpay's payment.
export function paymentFields(p: RazorpayPayment): Record<string, string | number | null> {
  return {
    razorpay_payment_id: p.id,
    razorpay_invoice_id: p.invoice_id ?? null,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    method: p.method ?? null,
    paid_at: iso(p.created_at) ?? new Date().toISOString(),
  };
}

// POST /plans body for one of our plans.
export function planRequest(plan: BillingPlan) {
  return {
    period: plan.period,
    interval: 1,
    item: { name: plan.name, amount: plan.amount, currency: plan.currency, description: 'MatchGPT+ subscription' },
    notes: { matchgpt_plan: plan.id },
  };
}

// POST /subscriptions body. With a trial, billing starts when it ends (the
// customer approves the mandate now, with a small refunded check).
export function subscriptionRequest(opts: {
  razorpayPlanId: string; plan: BillingPlan; userId: string; trialDays: number; now: number;
}) {
  const nowSec = Math.floor(opts.now / 1000);
  return {
    plan_id: opts.razorpayPlanId,
    total_count: opts.plan.total_count,
    quantity: 1,
    customer_notify: true,  // Razorpay emails the customer about charges
    ...(opts.trialDays > 0 ? { start_at: nowSec + opts.trialDays * 86_400 } : {}),
    expire_by: nowSec + 2 * 3600,  // the checkout must be finished within 2 hours
    notes: { user_id: opts.userId, plan: opts.plan.id },
  };
}
