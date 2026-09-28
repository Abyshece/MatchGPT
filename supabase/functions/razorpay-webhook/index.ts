// ============================================================================
// razorpay-webhook Edge Function
//
// Razorpay calls this when a subscription changes: approved (a trial starts),
// activated, charged (each renewal), pending (a renewal failed and is being
// retried), halted, cancelled, completed, paused, resumed. It checks the
// X-Razorpay-Signature header against RAZORPAY_WEBHOOK_SECRET, skips
// deliveries it has handled before (X-Razorpay-Event-Id), updates the
// subscription and its payments, and the database updates the user's Pro.
// If a person ends up with two live subscriptions (two checkouts at once),
// the second is cancelled and refunded.
//
// Add it in Razorpay (Accounts & Settings → Webhooks), once for test mode and
// once for live mode:
//   URL     https://<project>.supabase.co/functions/v1/razorpay-webhook
//   Secret  the same value as the RAZORPAY_WEBHOOK_SECRET secret
//   Events  subscription.* (authenticated, activated, charged, pending, halted,
//           cancelled, completed, updated, paused, resumed)
//
// Deployed with JWT verification off: Razorpay signs its requests instead.
// ============================================================================

import {
  razorpayConfig, webhookSignatureOk,
  type RazorpayConfig, type RazorpayPayment, type RazorpaySubscription,
} from '../_shared/razorpay.ts';
import { errorText, rest, serviceConfigured } from '../_shared/serviceRest.ts';
import { applySubscription, cancelDuplicates, findSubscription, recordPayment } from '../_shared/billing.ts';

interface RazorpayEvent {
  event: string;
  created_at: number;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function handleSubscriptionEvent(cfg: RazorpayConfig, event: RazorpayEvent, entity: RazorpaySubscription) {
  let row = await findSubscription(entity.id);
  if (!row) {
    // Created by the billing function but not saved: its notes say whose it is
    const notes = (entity.notes && !Array.isArray(entity.notes) ? entity.notes : {}) as Record<string, string>;
    const plan = notes.plan === 'monthly' || notes.plan === 'yearly' ? notes.plan : null;
    const [owner] = notes.user_id ? await rest<{ id: string }[]>(`profiles?id=eq.${encodeURIComponent(notes.user_id)}&select=id`) : [];
    if (!owner || !plan) {
      console.warn(`[razorpay-webhook] ${event.event} for a subscription that isn't MatchGPT's (${entity.id})`);
      return;
    }
    await rest('subscriptions?on_conflict=razorpay_subscription_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: owner.id, plan_id: plan, mode: cfg.mode, razorpay_subscription_id: entity.id,
        trial_ends_at: entity.start_at && entity.start_at > event.created_at ? new Date(entity.start_at * 1000).toISOString() : null,
      }),
    });
    row = await findSubscription(entity.id);
    if (!row) return;
  }

  await applySubscription(row, entity, new Date(event.created_at * 1000));
  const payment = event.payload?.payment?.entity;
  if (payment?.id) await recordPayment(cfg, row, payment);
  if (row.user_id) await cancelDuplicates(cfg, row.user_id);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const cfg = razorpayConfig();
  if (!cfg || !cfg.webhookSecret || !serviceConfigured()) {
    console.error('[razorpay-webhook] not configured: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET');
    return json({ error: 'Not configured' }, 503);
  }

  const raw = await req.text();
  if (!(await webhookSignatureOk(cfg.webhookSecret, raw, req.headers.get('x-razorpay-signature') ?? ''))) {
    return json({ error: 'Invalid signature' }, 400);
  }
  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const entity = event.payload?.subscription?.entity;
  const eventId = req.headers.get('x-razorpay-event-id') || `${event.event}:${entity?.id ?? ''}:${event.created_at}`;
  const seen = await rest<unknown[]>(`billing_events?id=eq.${encodeURIComponent(eventId)}&select=id`);
  if (seen.length > 0) return json({ ok: true, duplicate: true });

  try {
    if (typeof event.event === 'string' && event.event.startsWith('subscription.') && entity?.id) {
      await handleSubscriptionEvent(cfg, event, entity);
    }
    await rest('billing_events', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ id: eventId, event: String(event.event), razorpay_subscription_id: entity?.id ?? null }),
    });
    return json({ ok: true });
  } catch (e) {
    // Razorpay retries deliveries that fail
    console.error(`[razorpay-webhook] ${event.event} failed:`, errorText(e));
    return json({ error: 'Failed' }, 500);
  }
});
