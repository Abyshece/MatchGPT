// ============================================================================
// Store subscriptions and charges in our tables, shared by the store-billing
// function (the app reports a purchase) and store-notifications (the stores
// report renewals, cancellations, refunds). Pro itself is set by the
// database: sync_pro_status() after every change.
//
// A purchase belongs to the MatchGPT account the app passed with it (Google's
// obfuscatedExternalAccountId, Apple's appAccountToken: our user id), so a
// purchase can't be replayed to give Pro to someone else.
//
// STORE_FEE_PERCENT_GOOGLE_PLAY / STORE_FEE_PERCENT_APP_STORE: the stores'
// commission, for the estimated fees in the finance figures (default 15).
// ============================================================================

import {
  acknowledgeSubscription, getSubscription, googleState,
  type GooglePlayConfig, type StoreState,
} from './googlePlay.ts';
import { appleBundleId, appleState, type AppleRenewalInfo, type AppleTransaction } from './appleStore.ts';
import { errorText, rest, rpc } from './serviceRest.ts';

export type StoreProvider = 'google_play' | 'app_store';

export class StorePurchaseError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

interface PlanRow {
  id: 'monthly' | 'yearly';
  google_product_id: string | null;
  google_base_plan_id: string | null;
  apple_product_id: string | null;
}

export interface StoreSubscriptionRow {
  id: string;
  user_id: string | null;
  plan_id: string;
  status: string;
  store_updated_at: string | null;
}

const enc = encodeURIComponent;

async function storePlan(provider: StoreProvider, productId: string | null, basePlanId: string | null): Promise<PlanRow | null> {
  const plans = await rest<PlanRow[]>('billing_plans?select=id,google_product_id,google_base_plan_id,apple_product_id');
  const matches = plans.filter((p) => provider === 'google_play'
    ? p.google_product_id === productId && (!basePlanId || p.google_base_plan_id === basePlanId)
    : p.apple_product_id === productId);
  return matches.length === 1 ? matches[0] : null;
}

export function storeFeePercent(provider: StoreProvider): number {
  const v = Number(Deno.env.get(provider === 'google_play' ? 'STORE_FEE_PERCENT_GOOGLE_PLAY' : 'STORE_FEE_PERCENT_APP_STORE') ?? 15);
  return Number.isFinite(v) && v >= 0 && v <= 50 ? v : 15;
}

// Saves a store's view of one subscription as of `at`, unless we already have
// newer news. A row keeps the owner it was first saved with.
async function saveSubscription(
  provider: StoreProvider, storeId: string, userId: string | null, planId: string, state: StoreState, at: Date,
): Promise<StoreSubscriptionRow> {
  const [existing] = await rest<StoreSubscriptionRow[]>(
    `subscriptions?provider=eq.${provider}&store_subscription_id=eq.${enc(storeId)}&select=id,user_id,plan_id,status,store_updated_at`,
  );
  if (existing?.store_updated_at && Date.parse(existing.store_updated_at) > at.getTime()) return existing;

  const fields = {
    provider,
    store_subscription_id: storeId,
    store_product_id: state.productId,
    plan_id: planId,
    mode: state.mode,
    status: state.status,
    trial_ends_at: state.trialEndsAt,
    current_start: state.currentStart,
    current_end: state.currentEnd,
    cancel_at_period_end: state.cancelAtPeriodEnd,
    auto_renew: state.autoRenew,
    ended_at: state.endedAt,
    store_updated_at: at.toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const [row] = await rest<StoreSubscriptionRow[]>(`subscriptions?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, ...(existing.user_id || !userId ? {} : { user_id: userId }) }),
    });
    return row;
  }
  const [row] = await rest<StoreSubscriptionRow[]>('subscriptions?on_conflict=provider,store_subscription_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ...fields, user_id: userId }),
  });
  return row;
}

// The charge behind a state, once per store order, with the store's
// estimated commission. Never overwritten: a refunded charge stays refunded.
async function saveCharge(provider: StoreProvider, row: StoreSubscriptionRow, state: StoreState, paidAt: string): Promise<void> {
  if (!state.orderId || !state.price || state.status === 'created') return;
  await rest('payments?on_conflict=provider,store_order_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      provider,
      store_order_id: state.orderId,
      user_id: row.user_id,
      subscription_id: row.id,
      amount: state.price.amount,
      currency: state.price.currency,
      status: 'captured',
      method: provider,
      fee_amount: Math.round((state.price.amount * storeFeePercent(provider)) / 100),
      fee_estimated: true,
      paid_at: paidAt,
    }),
  });
}

/** Marks a store charge refunded (the stores refund whole charges). False if we don't have it. */
export async function refundCharge(provider: StoreProvider, orderId: string, refundedAt: string): Promise<boolean> {
  const [p] = await rest<{ id: string; amount: number }[]>(
    `payments?provider=eq.${provider}&store_order_id=eq.${enc(orderId)}&select=id,amount`,
  );
  if (!p) return false;
  await rest(`payments?id=eq.${p.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'refunded', refunded_amount: p.amount, refunded_at: refundedAt }),
  });
  return true;
}

export const syncPro = async (userId: string | null) => {
  if (userId) await rpc('sync_pro_status', { p_user_id: userId });
};

// Whose purchase this is. `caller`: the signed-in user reporting it (null for
// store notifications). A purchase made for another account, or one already
// saved for another account, is refused.
async function ownerOf(provider: StoreProvider, storeId: string, tagged: string | null, caller: string | null): Promise<string | null> {
  const [saved] = await rest<{ user_id: string | null }[]>(
    `subscriptions?provider=eq.${provider}&store_subscription_id=eq.${enc(storeId)}&select=user_id`,
  );
  const owner = saved?.user_id ?? tagged ?? null;
  if (caller && owner && owner !== caller) {
    throw new StorePurchaseError('This purchase belongs to another MatchGPT account.', 'OTHER_ACCOUNT');
  }
  return owner ?? caller;
}

// ---- Google Play ----------------------------------------------------------------------

/**
 * Reads a purchase from Google Play and saves it: the subscription, its latest
 * charge, the plan it replaced (a change of plan), and the owner's Pro.
 * Acknowledges a new purchase. `at`: when the news is from (a notification's
 * time; now for the app's report).
 */
export async function applyGooglePurchase(
  cfg: GooglePlayConfig, purchaseToken: string, caller: string | null, at = new Date(),
): Promise<{ row: StoreSubscriptionRow; state: StoreState; userId: string | null }> {
  const sub = await getSubscription(cfg, purchaseToken);
  const state = googleState(sub);
  const plan = await storePlan('google_play', state.productId, state.basePlanId);
  if (!plan) throw new StorePurchaseError(`Not a MatchGPT+ product: ${state.productId}/${state.basePlanId}`, 'UNKNOWN_PRODUCT');
  const userId = await ownerOf('google_play', purchaseToken, state.userId, caller);

  const row = await saveSubscription('google_play', purchaseToken, userId, plan.id, state, at);
  await saveCharge('google_play', row, state, at.toISOString());

  // A change of plan replaces the old purchase: close it
  if (state.linkedPurchaseToken) {
    await rest(
      `subscriptions?provider=eq.google_play&store_subscription_id=eq.${enc(state.linkedPurchaseToken)}&status=not.in.(expired,cancelled)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', ended_at: at.toISOString(), cancel_at_period_end: false, updated_at: new Date().toISOString() }),
      },
    );
  }
  if (state.needsAcknowledgement && state.productId && !['created', 'expired', 'cancelled'].includes(state.status)) {
    try {
      await acknowledgeSubscription(cfg, state.productId, purchaseToken);
    } catch (e) {
      // The app acknowledges too; Google allows three days
      console.warn('[store] acknowledging failed:', errorText(e));
    }
  }
  await syncPro(row.user_id ?? userId);
  return { row, state, userId: row.user_id ?? userId };
}

// ---- App Store ------------------------------------------------------------------------

/**
 * Saves an App Store transaction (already verified): the subscription, the
 * charge (or its refund), and the owner's Pro. `renewal`: Apple's renewal
 * record when there is one (notifications carry it).
 */
export async function applyAppleTransaction(
  tx: AppleTransaction, renewal: AppleRenewalInfo | null, caller: string | null, at?: Date,
): Promise<{ row: StoreSubscriptionRow; state: StoreState; userId: string | null }> {
  if (tx.bundleId !== appleBundleId()) throw new StorePurchaseError(`Another app's purchase: ${tx.bundleId}`, 'WRONG_APP');
  if (tx.type && tx.type !== 'Auto-Renewable Subscription') throw new StorePurchaseError(`Not a subscription: ${tx.type}`, 'UNKNOWN_PRODUCT');
  const state = appleState(tx, renewal);
  const plan = await storePlan('app_store', state.productId, null);
  if (!plan) throw new StorePurchaseError(`Not a MatchGPT+ product: ${state.productId}`, 'UNKNOWN_PRODUCT');
  const userId = await ownerOf('app_store', tx.originalTransactionId, state.userId, caller);

  const when = at ?? new Date(Math.max(tx.signedDate ?? 0, renewal?.signedDate ?? 0) || Date.now());
  const row = await saveSubscription('app_store', tx.originalTransactionId, userId, plan.id, state, when);
  if (tx.revocationDate) {
    await refundCharge('app_store', tx.transactionId, new Date(tx.revocationDate).toISOString());
  } else {
    await saveCharge('app_store', row, state, new Date(tx.purchaseDate ?? when.getTime()).toISOString());
  }
  await syncPro(row.user_id ?? userId);
  return { row, state, userId: row.user_id ?? userId };
}
