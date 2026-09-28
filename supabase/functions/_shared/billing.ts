// ============================================================================
// Keeping our subscriptions and payments in step with Razorpay (used by the
// billing, razorpay-webhook and delete-account functions). Pro itself is set
// by the database: sync_pro_status() after every change.
// ============================================================================

import {
  paymentFields, razorpay, subscriptionFields,
  type RazorpayConfig, type RazorpayPayment, type RazorpaySubscription,
} from './razorpay.ts';
import { errorText, rest, rpc } from './serviceRest.ts';

export interface SubscriptionRow {
  id: string;
  user_id: string | null;
  plan_id: 'monthly' | 'yearly';
  mode: 'test' | 'live';
  razorpay_subscription_id: string;
  status: string;
  trial_ends_at: string | null;
  current_start: string | null;
  current_end: string | null;
  cancel_at_period_end: boolean;
  razorpay_updated_at: string | null;
  live_since: string | null;  // set by the database when it first goes through
  created_at: string;
}

// Subscriptions that can still charge or give Pro
export const OPEN_STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'];
// Subscriptions that give (or will give) Pro: one per person
export const LIVE_STATUSES = ['authenticated', 'active', 'pending', 'paused'];

interface RazorpayInvoice {
  id: string;
  status: string;
  payment_id?: string | null;
}

export async function findSubscription(razorpayId: string): Promise<SubscriptionRow | null> {
  const rows = await rest<SubscriptionRow[]>(
    `subscriptions?razorpay_subscription_id=eq.${encodeURIComponent(razorpayId)}&select=*`,
  );
  return rows[0] ?? null;
}

// Applies Razorpay's view of a subscription (as of `at`) to our row, unless we
// already have a newer one, then updates the owner's Pro status.
export async function applySubscription(
  row: SubscriptionRow,
  entity: RazorpaySubscription,
  at: Date,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Razorpay's event times are whole seconds; compare at that precision
  const atSecond = Math.floor(at.getTime() / 1000) * 1000;
  if (row.razorpay_updated_at && Date.parse(row.razorpay_updated_at) > atSecond) return;
  await rest(`subscriptions?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      ...subscriptionFields(entity),
      ...extra,
      razorpay_updated_at: new Date(atSecond).toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (row.user_id) await rpc('sync_pro_status', { p_user_id: row.user_id });
}

// Saves (or updates) a charge, with a link to Razorpay's invoice when there is one.
export async function recordPayment(cfg: RazorpayConfig, row: SubscriptionRow, payment: RazorpayPayment): Promise<void> {
  // A late webhook carries an older copy of the payment: once we've refunded
  // it, it stays refunded
  const [saved] = await rest<{ status: string }[]>(
    `payments?razorpay_payment_id=eq.${encodeURIComponent(payment.id)}&select=status`,
  );
  const status = saved?.status === 'refunded' ? 'refunded' : payment.status;
  let invoiceUrl: string | null = null;
  if (payment.invoice_id && status === 'captured') {
    try {
      const invoice = await razorpay<{ short_url?: string | null }>(cfg, 'GET', `/invoices/${payment.invoice_id}`);
      invoiceUrl = invoice?.short_url ?? null;
    } catch (e) {
      console.warn('[billing] invoice link not available:', errorText(e));
    }
  }
  await rest('payments?on_conflict=razorpay_payment_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      ...paymentFields(payment),
      status,
      ...(invoiceUrl ? { invoice_url: invoiceUrl } : {}),
      user_id: row.user_id,
      subscription_id: row.id,
    }),
  });
}

// Refunds whatever a subscription has charged (for one that shouldn't exist).
async function refundCharges(cfg: RazorpayConfig, row: SubscriptionRow): Promise<void> {
  const invoices = await razorpay<{ items?: RazorpayInvoice[] }>(
    cfg, 'GET', `/invoices?subscription_id=${encodeURIComponent(row.razorpay_subscription_id)}`,
  );
  for (const invoice of invoices?.items ?? []) {
    if (invoice.status !== 'paid' || !invoice.payment_id) continue;
    const payment = await razorpay<RazorpayPayment>(cfg, 'GET', `/payments/${invoice.payment_id}`);
    if (payment.status !== 'captured') continue;
    await razorpay(cfg, 'POST', `/payments/${payment.id}/refund`, {
      notes: { reason: 'Second MatchGPT+ subscription, cancelled automatically' },
    });
    await rest('payments?on_conflict=razorpay_payment_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...paymentFields(payment), status: 'refunded', user_id: row.user_id, subscription_id: row.id }),
    });
  }
}

// One live subscription per person. If two checkouts were finished at once
// (say, in two tabs), keep the one that went through first; cancel the others
// now and refund what they charged. Safe to repeat, and every caller picks
// the same one to keep. Returns the Razorpay ids of those stopped.
export async function cancelDuplicates(cfg: RazorpayConfig, userId: string): Promise<string[]> {
  const rows = await rest<SubscriptionRow[]>(
    `subscriptions?user_id=eq.${userId}&mode=eq.${cfg.mode}&status=in.(${LIVE_STATUSES.join(',')})` +
      `&order=live_since.asc.nullslast,created_at.asc,id.asc&select=*`,
  );
  const stopped: string[] = [];
  for (const row of rows.slice(1)) {
    const id = row.razorpay_subscription_id;
    try {
      let entity = await razorpay<RazorpaySubscription>(cfg, 'GET', `/subscriptions/${id}`);
      if (entity.status === 'completed' || entity.status === 'expired') {
        // Already over at Razorpay (our copy was behind): just catch up
        await applySubscription(row, entity, new Date());
        continue;
      }
      if (entity.status !== 'cancelled') {
        entity = await razorpay<RazorpaySubscription>(cfg, 'POST', `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: false });
      }
      // Our row changes last, so a failure part-way is picked up next time.
      // No trial to keep either (a cancelled trial gives Pro until it ends).
      await refundCharges(cfg, row);
      await applySubscription(row, entity, new Date(), { trial_ends_at: null });
      stopped.push(id);
      console.warn(`[billing] ${id} was a second subscription for ${userId}: cancelled, charges refunded`);
    } catch (e) {
      console.error(`[billing] second subscription ${id} for ${userId} not stopped yet:`, errorText(e));
    }
  }
  return stopped;
}

// Before an account is deleted: stop every subscription that could still
// charge. Returns the problems (the account must not be deleted while a
// subscription might keep charging).
export async function cancelAllSubscriptions(cfg: RazorpayConfig | null, userId: string): Promise<string[]> {
  const rows = await rest<SubscriptionRow[]>(
    `subscriptions?user_id=eq.${userId}&status=in.(${OPEN_STATUSES.join(',')})&select=*`,
  );
  const problems: string[] = [];
  for (const row of rows) {
    if (row.status === 'created') continue;  // checkout never finished: it expires by itself
    if (!cfg || row.mode !== cfg.mode) {
      // Test-mode subscriptions never charge real money
      if (row.mode === 'test') continue;
      problems.push(`${row.razorpay_subscription_id}: live keys not set`);
      continue;
    }
    try {
      const entity = await razorpay<RazorpaySubscription>(
        cfg, 'POST', `/subscriptions/${row.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: false },
      );
      await applySubscription(row, entity, new Date());
    } catch (e) {
      problems.push(`${row.razorpay_subscription_id}: ${errorText(e)}`);
    }
  }
  return problems;
}
