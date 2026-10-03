// ============================================================================
// Store subscriptions and charges in our tables, shared by the store-billing
// function (the app reports a purchase), store-notifications (the stores
// report renewals, cancellations, refunds) and delete-account. Pro itself is
// set by the database: sync_pro_status() after every change.
//
// A purchase belongs to the MatchGPT account the app passed with it (Google's
// obfuscatedExternalAccountId, Apple's appAccountToken: our user id), so a
// purchase can't be replayed to give Pro to someone else. If that account has
// since been deleted, whoever restores the purchase (the person paying for it)
// takes it over.
//
// STORE_FEE_PERCENT_GOOGLE_PLAY / STORE_FEE_PERCENT_APP_STORE: the stores'
// commission, for the estimated fees in the finance figures (default 15).
// ============================================================================

import {
  acknowledgeSubscription, cancelSubscription, getSubscription, googlePlayConfig, googleState,
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

interface StoreSubscriptionRow {
  id: string;
  user_id: string | null;
  store_updated_at: string | null;
  current_end: string | null;
}

const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW = 'id,user_id,store_updated_at,current_end';

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

const findRow = async (provider: StoreProvider, storeId: string) =>
  (await rest<StoreSubscriptionRow[]>(
    `subscriptions?provider=eq.${provider}&store_subscription_id=eq.${enc(storeId)}&select=${ROW}`,
  ))[0] ?? null;

// Whose purchase this is. `caller`: the signed-in user reporting it (null for
// store notifications). A purchase made for another account that still
// exists, or already saved for one, is refused.
async function ownerOf(existing: StoreSubscriptionRow | null, tagged: string | null, caller: string | null): Promise<string | null> {
  let owner = existing?.user_id ?? null;
  if (!owner && tagged && UUID.test(tagged)) {
    const [p] = await rest<{ id: string }[]>(`profiles?id=eq.${tagged.toLowerCase()}&select=id`);
    owner = p?.id ?? null;
  }
  if (caller && owner && owner !== caller) {
    throw new StorePurchaseError('This purchase belongs to another MatchGPT account.', 'OTHER_ACCOUNT');
  }
  return owner ?? caller;
}

// Saves a store's view of one subscription as of `at`, unless we already have
// newer news. A row keeps the owner it was saved with.
async function saveSubscription(
  provider: StoreProvider, storeId: string, existing: StoreSubscriptionRow | null, userId: string | null,
  planId: string, state: StoreState, at: Date,
): Promise<StoreSubscriptionRow> {
  if (existing?.store_updated_at && Date.parse(existing.store_updated_at) > at.getTime()) {
    if (existing.user_id || !userId) return existing;
    // Newer news is saved already, but the subscription has no account (its
    // own was deleted): it's this one's now
    const [row] = await rest<StoreSubscriptionRow[]>(`subscriptions?id=eq.${existing.id}&user_id=is.null&select=${ROW}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, updated_at: new Date().toISOString() }),
    });
    return row ?? existing;
  }

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
    // Unknown when the app reports an Apple purchase: keep what notifications said
    ...(state.autoRenew === null ? {} : { auto_renew: state.autoRenew, cancel_at_period_end: state.cancelAtPeriodEnd }),
    ended_at: state.endedAt,
    store_updated_at: at.toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const [row] = await rest<StoreSubscriptionRow[]>(`subscriptions?id=eq.${existing.id}&select=${ROW}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, ...(existing.user_id || !userId ? {} : { user_id: userId }) }),
    });
    return row;
  }
  const [row] = await rest<StoreSubscriptionRow[]>(`subscriptions?on_conflict=provider,store_subscription_id&select=${ROW}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ...fields, user_id: userId }),
  });
  return row;
}

// The charge behind a state, once per store order, with the store's
// estimated commission. Never overwritten: a refunded charge stays refunded.
async function saveCharge(provider: StoreProvider, row: StoreSubscriptionRow, state: StoreState, paidAt: Date): Promise<void> {
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
      paid_at: paidAt.toISOString(),
    }),
  });
}

/** Marks a store charge refunded (the stores refund whole charges). False if we don't have it. */
export async function refundCharge(provider: StoreProvider, orderId: string, refundedAt: Date): Promise<boolean> {
  const [p] = await rest<{ id: string; amount: number; refunded_at: string | null }[]>(
    `payments?provider=eq.${provider}&store_order_id=eq.${enc(orderId)}&select=id,amount,refunded_at`,
  );
  if (!p) return false;
  await rest(`payments?id=eq.${p.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'refunded', refunded_amount: p.amount, refunded_at: p.refunded_at ?? refundedAt.toISOString() }),
  });
  return true;
}

const syncPro = async (userId: string | null) => {
  if (userId) await rpc('sync_pro_status', { p_user_id: userId });
};

// ---- Google Play ----------------------------------------------------------------------

/**
 * Reads a purchase from Google Play and saves it: the subscription, its latest
 * charge, the plan it replaced (a change of plan), and the owner's Pro.
 * Acknowledges a new purchase. What Google returns is the state now, so it
 * always wins over what we had. `eventAt`: when the store reported the change
 * (a notification's time), used as the date of a new charge. Returns the owner.
 */
export async function applyGooglePurchase(
  cfg: GooglePlayConfig, purchaseToken: string, caller: string | null, eventAt = new Date(),
): Promise<string | null> {
  const now = new Date();
  const sub = await getSubscription(cfg, purchaseToken);
  const state = googleState(sub, now);
  const plan = await storePlan('google_play', state.productId, state.basePlanId);
  if (!plan) throw new StorePurchaseError(`Not a MatchGPT+ product: ${state.productId}/${state.basePlanId}`, 'UNKNOWN_PRODUCT');
  const existing = await findRow('google_play', purchaseToken);
  const userId = await ownerOf(existing, state.userId, caller);

  const row = await saveSubscription('google_play', purchaseToken, existing, userId, plan.id, state, now);
  await saveCharge('google_play', row, state, eventAt);

  // A change of plan replaces the old purchase: close it
  if (state.linkedPurchaseToken) {
    await rest(
      `subscriptions?provider=eq.google_play&store_subscription_id=eq.${enc(state.linkedPurchaseToken)}&status=not.in.(expired,cancelled)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired', ended_at: now.toISOString(), cancel_at_period_end: false, updated_at: now.toISOString() }),
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
  await syncPro(row.user_id);
  return row.user_id;
}

// ---- App Store ------------------------------------------------------------------------

/**
 * Saves an App Store transaction (already verified): the subscription, the
 * charge (or its refund), and the owner's Pro. `renewal`: Apple's renewal
 * record when there is one (notifications carry it). `at`: when this was
 * true (a notification's signing time); by default the transaction's own
 * time, so an older transaction the app reports can't undo newer news.
 * Returns the owner.
 */
export async function applyAppleTransaction(
  tx: AppleTransaction, renewal: AppleRenewalInfo | null, caller: string | null, at?: Date,
): Promise<string | null> {
  if (tx.bundleId !== appleBundleId()) throw new StorePurchaseError(`Another app's purchase: ${tx.bundleId}`, 'WRONG_APP');
  if (tx.type && tx.type !== 'Auto-Renewable Subscription') throw new StorePurchaseError(`Not a subscription: ${tx.type}`, 'UNKNOWN_PRODUCT');
  const state = appleState(tx, renewal);
  const plan = await storePlan('app_store', state.productId, null);
  if (!plan) throw new StorePurchaseError(`Not a MatchGPT+ product: ${state.productId}`, 'UNKNOWN_PRODUCT');
  const existing = await findRow('app_store', tx.originalTransactionId);
  const userId = await ownerOf(existing, state.userId, caller);

  if (tx.revocationDate) {
    await refundCharge('app_store', tx.transactionId, new Date(tx.revocationDate));
    // A period refunded after it ran out changes nothing now
    if (tx.expiresDate && tx.expiresDate <= tx.revocationDate) {
      await syncPro(existing?.user_id ?? null);
      return existing?.user_id ?? null;
    }
  }
  const when = at ?? new Date(Math.max(tx.purchaseDate ?? 0, tx.revocationDate ?? 0) || Date.now());
  const row = await saveSubscription('app_store', tx.originalTransactionId, existing, userId, plan.id, state, when);
  if (!tx.revocationDate) await saveCharge('app_store', row, state, new Date(tx.purchaseDate ?? when.getTime()));
  await syncPro(row.user_id);
  return row.user_id;
}

// ---- Deleting an account ------------------------------------------------------------------

/**
 * Before an account is deleted: stops the renewals of its Google Play
 * subscriptions (people can also cancel in the Play Store). Apple doesn't let
 * apps cancel: App Store subscriptions that would still renew are returned,
 * for the app to point the person to their Apple subscriptions.
 */
export async function stopStoreRenewals(userId: string): Promise<{ provider: StoreProvider; stopped: boolean }[]> {
  const rows = await rest<{ provider: StoreProvider; store_subscription_id: string; auto_renew: boolean | null }[]>(
    `subscriptions?user_id=eq.${userId}&provider=in.(google_play,app_store)&status=in.(authenticated,active,pending,halted,paused)` +
      `&select=provider,store_subscription_id,auto_renew`,
  );
  const cfg = googlePlayConfig();
  const result: { provider: StoreProvider; stopped: boolean }[] = [];
  for (const r of rows) {
    if (r.auto_renew === false) continue;
    let stopped = false;
    if (r.provider === 'google_play' && cfg) {
      try {
        await cancelSubscription(cfg, r.store_subscription_id);
        stopped = true;
      } catch (e) {
        console.warn('[store] stopping a Google Play subscription failed:', errorText(e));
      }
    }
    result.push({ provider: r.provider, stopped });
  }
  return result;
}
