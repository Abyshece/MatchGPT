// ============================================================================
// billing Edge Function: MatchGPT+ subscriptions through Razorpay
//
// For the signed-in user (the function checks the access token itself):
//   POST { action: 'config' }
//     → { enabled, mode, keyId, trialDays, trialEligible, plans: [{ id, name, amount, currency, period }] }
//     enabled is false until the Razorpay keys are set (see _shared/razorpay.ts).
//   POST { action: 'subscribe', plan: 'monthly' | 'yearly' }
//     → { subscriptionId, keyId, planName, amount, trialEndsAt, prefill }
//     Creates the Razorpay subscription that Checkout then asks the user to
//     approve. First-time subscribers get the free trial (PRO_TRIAL_DAYS).
//   POST { action: 'verify', razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
//     → { status, pro, renewsAt, trialEndsAt, duplicate }
//     After Checkout: checks Razorpay's signature and turns Pro on straight
//     away (the webhook confirms the same later). duplicate: the user already
//     had MatchGPT+ (two checkouts at once), so this one was cancelled and
//     refunded.
//   POST { action: 'cancel' }
//     → { status, proUntil }
//     A paid subscription stops at the end of the period paid for. One in its
//     free trial is cancelled now (nothing is charged) and keeps the trial;
//     one whose last charge failed is cancelled now, so Razorpay stops trying.
//   POST { action: 'refresh' }
//     → { ok }
//     Re-reads the user's open subscriptions from Razorpay (Settings calls it).
//
// Deployed with JWT verification off; the function checks the user itself.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import {
  checkoutSignatureOk, planRequest, razorpay, razorpayConfig, RazorpayError, subscriptionRequest,
  type BillingPlan, type RazorpayConfig, type RazorpayPayment, type RazorpaySubscription,
} from '../_shared/razorpay.ts';
import { errorText, getUserId, rest, serviceConfigured } from '../_shared/serviceRest.ts';
import {
  applySubscription, cancelDuplicates, findSubscription, LIVE_STATUSES, OPEN_STATUSES, recordPayment,
  type SubscriptionRow,
} from '../_shared/billing.ts';

const TRIAL_DAYS = Math.max(0, Math.min(30, Math.floor(Number(Deno.env.get('PRO_TRIAL_DAYS') ?? 7) || 0)));

interface Me {
  id: string;
  name: string | null;
  email: string | null;
  is_banned: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

async function currentSubscription(userId: string, mode: string): Promise<SubscriptionRow | null> {
  const rows = await rest<SubscriptionRow[]>(
    `subscriptions?user_id=eq.${userId}&provider=eq.razorpay&mode=eq.${mode}&status=in.(${LIVE_STATUSES.join(',')})` +
      `&order=created_at.desc&limit=1&select=*`,
  );
  return rows[0] ?? null;
}

// MatchGPT+ bought in one of the phone apps: the store bills it, so it's
// managed (and cancelled) there
async function storeSubscription(userId: string): Promise<string | null> {
  const [row] = await rest<{ provider: string }[]>(
    `subscriptions?user_id=eq.${userId}&provider=neq.razorpay&status=in.(${LIVE_STATUSES.join(',')})&limit=1&select=provider`,
  );
  return row ? (row.provider === 'app_store' ? 'the App Store' : 'Google Play') : null;
}

// One free trial per person: only if they have never had a subscription go through
async function trialEligible(userId: string): Promise<boolean> {
  const rows = await rest<unknown[]>(
    `subscriptions?user_id=eq.${userId}&status=not.in.(created,expired)&select=id&limit=1`,
  );
  return rows.length === 0;
}

async function activePlans(): Promise<(BillingPlan & Record<string, unknown>)[]> {
  return await rest(`billing_plans?is_active=is.true&order=amount.asc&select=*`);
}

// The Razorpay plan for one of ours, created the first time it's needed (per mode).
async function razorpayPlanId(cfg: RazorpayConfig, plan: BillingPlan & Record<string, unknown>): Promise<string> {
  const column = cfg.mode === 'live' ? 'razorpay_plan_id_live' : 'razorpay_plan_id_test';
  if (typeof plan[column] === 'string' && plan[column]) return plan[column] as string;
  const created = await razorpay<{ id: string }>(cfg, 'POST', '/plans', planRequest(plan));
  // Keep the first one saved if two requests got here together
  const saved = await rest<unknown[]>(`billing_plans?id=eq.${plan.id}&${column}=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ [column]: created.id }),
  });
  if (saved.length > 0) return created.id;
  const [again] = await rest<Record<string, string>[]>(`billing_plans?id=eq.${plan.id}&select=${column}`);
  return again[column];
}

async function config(cfg: RazorpayConfig | null, me: Me): Promise<Response> {
  const plans = (await activePlans()).map(({ id, name, amount, currency, period }) => ({ id, name, amount, currency, period }));
  return json({
    enabled: !!cfg && plans.length > 0,
    mode: cfg?.mode ?? null,
    keyId: cfg?.keyId ?? null,
    trialDays: TRIAL_DAYS,
    trialEligible: TRIAL_DAYS > 0 && (await trialEligible(me.id)),
    plans,
  });
}

async function subscribe(cfg: RazorpayConfig, me: Me, body: Record<string, unknown>): Promise<Response> {
  const planId = body.plan === 'monthly' || body.plan === 'yearly' ? body.plan : null;
  if (!planId) return json({ error: 'Choose a plan.', code: 'BAD_PLAN' }, 400);
  if (await currentSubscription(me.id, cfg.mode)) {
    return json({ error: 'You already have MatchGPT+.', code: 'ALREADY_SUBSCRIBED' }, 409);
  }
  const store = await storeSubscription(me.id);
  if (store) return json({ error: `You already have MatchGPT+ through ${store}.`, code: 'ALREADY_SUBSCRIBED' }, 409);
  const plan = (await activePlans()).find((p) => p.id === planId);
  if (!plan) return json({ error: 'That plan is not available.', code: 'BAD_PLAN' }, 400);

  const trialDays = TRIAL_DAYS > 0 && (await trialEligible(me.id)) ? TRIAL_DAYS : 0;
  const now = Date.now();
  const create = async (razorpayPlan: string) => {
    const request = subscriptionRequest({ razorpayPlanId: razorpayPlan, plan, userId: me.id, trialDays, now });
    return { request, sub: await razorpay<RazorpaySubscription>(cfg, 'POST', '/subscriptions', request) };
  };
  const savedPlan = await razorpayPlanId(cfg, plan);
  let created: Awaited<ReturnType<typeof create>>;
  try {
    created = await create(savedPlan);
  } catch (e) {
    // The saved plan isn't in this Razorpay account (keys from another account,
    // or deleted in the Dashboard): make a new one and try once more
    if (!(e instanceof RazorpayError) || e.status !== 400 || !/does not exist/i.test(e.message)) throw e;
    const column = cfg.mode === 'live' ? 'razorpay_plan_id_live' : 'razorpay_plan_id_test';
    await rest(`billing_plans?id=eq.${plan.id}&${column}=eq.${encodeURIComponent(savedPlan)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [column]: null }),
    });
    created = await create(await razorpayPlanId(cfg, { ...plan, [column]: null }));
  }
  const { request, sub } = created;
  const startAt = (request as { start_at?: number }).start_at;
  const trialEndsAt = startAt ? new Date(startAt * 1000).toISOString() : null;
  await rest('subscriptions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: me.id, plan_id: plan.id, mode: cfg.mode, razorpay_subscription_id: sub.id,
      status: 'created', trial_ends_at: trialEndsAt,
    }),
  });
  return json({
    subscriptionId: sub.id,
    keyId: cfg.keyId,
    planName: plan.name,
    amount: plan.amount,
    trialEndsAt,
    prefill: { name: me.name ?? '', email: me.email ?? '' },
  });
}

async function verify(cfg: RazorpayConfig, me: Me, body: Record<string, unknown>): Promise<Response> {
  const paymentId = text(body.razorpay_payment_id);
  const subscriptionId = text(body.razorpay_subscription_id);
  const signature = text(body.razorpay_signature);
  if (!paymentId || !subscriptionId || !signature) return json({ error: 'Missing payment details.' }, 400);

  const row = await findSubscription(subscriptionId);
  if (!row || row.user_id !== me.id) return json({ error: 'Subscription not found.' }, 404);
  if (!(await checkoutSignatureOk(cfg.keySecret, paymentId, row.razorpay_subscription_id, signature))) {
    return json({ error: "The payment couldn't be confirmed.", code: 'BAD_SIGNATURE' }, 400);
  }

  const entity = await razorpay<RazorpaySubscription>(cfg, 'GET', `/subscriptions/${row.razorpay_subscription_id}`);
  // Checkout succeeded, so it's approved even if Razorpay hasn't caught up yet
  if (entity.status === 'created') entity.status = 'authenticated';
  await applySubscription(row, entity, new Date());

  // Without a trial the approval is the first charge: save it for the payment history
  try {
    const payment = await razorpay<RazorpayPayment>(cfg, 'GET', `/payments/${paymentId}`);
    if (payment.status === 'captured' && payment.invoice_id) await recordPayment(cfg, row, payment);
  } catch (e) {
    console.warn('[billing] first payment not saved:', errorText(e));
  }
  // Two checkouts at once and this was the second (the webhook may have stopped it already)
  const stopped = await cancelDuplicates(cfg, me.id);
  const duplicate = stopped.includes(row.razorpay_subscription_id) || entity.status === 'cancelled';

  const [profile] = await rest<{ subscription_tier: string; subscription_renews_at: string | null }[]>(
    `profiles?id=eq.${me.id}&select=subscription_tier,subscription_renews_at`,
  );
  return json({
    status: duplicate ? 'cancelled' : entity.status,
    pro: profile?.subscription_tier === 'PRO',
    renewsAt: profile?.subscription_renews_at ?? null,
    trialEndsAt: duplicate ? null : row.trial_ends_at,
    duplicate,
  });
}

async function cancel(cfg: RazorpayConfig, me: Me): Promise<Response> {
  const row = await currentSubscription(me.id, cfg.mode);
  if (!row) {
    const store = await storeSubscription(me.id);
    if (store) {
      const where = store === 'Google Play' ? 'the Play Store app (Payments & subscriptions)' : 'your iPhone (Settings → your name → Subscriptions)';
      return json({ error: `Your MatchGPT+ is billed by ${store}. Cancel it in ${where}.`, code: 'STORE_SUBSCRIPTION' }, 409);
    }
    return json({ error: "You don't have a subscription to cancel.", code: 'NO_SUBSCRIPTION' }, 404);
  }
  // Nothing charged yet (free trial): cancel now and keep the trial. Last
  // charge failed: cancel now, so Razorpay stops retrying it. Otherwise keep
  // Pro to the end of the period paid for.
  const immediately = row.status === 'authenticated' || row.status === 'pending';
  const entity = await razorpay<RazorpaySubscription>(
    cfg, 'POST', `/subscriptions/${row.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: !immediately },
  );
  await applySubscription(row, entity, new Date(), { cancel_at_period_end: !immediately });
  const [profile] = await rest<{ subscription_renews_at: string | null }[]>(
    `profiles?id=eq.${me.id}&select=subscription_renews_at`,
  );
  return json({ status: entity.status, proUntil: profile?.subscription_renews_at ?? null });
}

async function refresh(cfg: RazorpayConfig, me: Me): Promise<Response> {
  const rows = await rest<SubscriptionRow[]>(
    `subscriptions?user_id=eq.${me.id}&provider=eq.razorpay&mode=eq.${cfg.mode}&status=in.(${OPEN_STATUSES.join(',')})` +
      `&order=created_at.desc&limit=3&select=*`,
  );
  for (const row of rows) {
    const entity = await razorpay<RazorpaySubscription>(cfg, 'GET', `/subscriptions/${row.razorpay_subscription_id}`);
    await applySubscription(row, entity, new Date());
  }
  await cancelDuplicates(cfg, me.id);
  return json({ ok: true });
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!serviceConfigured()) {
    console.error('[billing] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server not configured' }, 500);
  }

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Please sign in again.', code: 'UNAUTHENTICATED' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  try {
    const [me] = await rest<Me[]>(`profiles?id=eq.${userId}&select=id,name,email,is_banned`);
    if (!me) return json({ error: 'Finish setting up your profile first.', code: 'NO_PROFILE' }, 403);

    const cfg = razorpayConfig();
    if (body.action === 'config') return await config(cfg, me);
    if (!cfg) return json({ error: 'MatchGPT+ is coming soon.', code: 'BILLING_OFF' }, 503);
    if (me.is_banned) return json({ error: 'This account is suspended.', code: 'BANNED' }, 403);

    switch (body.action) {
      case 'subscribe': return await subscribe(cfg, me, body);
      case 'verify': return await verify(cfg, me, body);
      case 'cancel': return await cancel(cfg, me);
      case 'refresh': return await refresh(cfg, me);
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    console.error('[billing] failed:', errorText(e));
    const status = e instanceof RazorpayError && e.status < 500 ? 502 : 500;
    return json({ error: 'Something went wrong with the payment service. Please try again.' }, status);
  }
}));
