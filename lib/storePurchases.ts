// ============================================================================
// storePurchases: Shaadi24+ bought inside the phone apps
//
// Shaadi24+ is sold only here, through the stores' own billing (Google Play
// Billing and the App Store), as the stores require for digital
// subscriptions. The store takes the payment; the
// store-billing edge function checks every purchase with the store before
// turning Pro on, and the stores' notifications keep it current afterwards
// (store-notifications). Each purchase carries the user's id, so it can't be
// claimed by another account.
//
// On Android the purchase plugin picks the plan's first offer that Google
// lists; Google's own payment sheet always shows the exact terms. On iPhone a
// free trial set up in App Store Connect applies by itself to people who
// haven't had one.
// ============================================================================

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type SKProductDiscount, type Transaction } from '@capgo/native-purchases';
import { reportError } from './errorReports';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { PlanId, PlanPeriod } from './billingService';

export type StorePlatform = 'android' | 'ios';

/** The store this app sells through, or null on the website. */
export function storePlatform(): StorePlatform | null {
  const p = Capacitor.getPlatform();
  return Capacitor.isNativePlatform() && (p === 'android' || p === 'ios') ? p : null;
}

export const storeName = (provider: string | null | undefined) =>
  provider === 'app_store' || provider === 'ios' ? 'the App Store' : 'Google Play';

// Where people manage (and cancel) a store subscription themselves
export const storeManageHint = (provider: string | null | undefined) =>
  provider === 'app_store' || provider === 'ios'
    ? 'on your iPhone: Settings → your name → Subscriptions'
    : 'in the Play Store app: your profile picture → Payments & subscriptions → Subscriptions';

export class StoreError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function callStore<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('store-billing', { body });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    let code = 'FAILED';
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
      if (typeof details?.code === 'string') code = details.code;
    }
    throw new StoreError(message, code);
  }
  return data as T;
}

interface StorePlanConfig {
  id: PlanId;
  name: string;
  amount: number;
  currency: string;
  period: PlanPeriod;
  googleProductId: string | null;
  googleBasePlanId: string | null;
  appleProductId: string | null;
}

/** A plan as the store sells it to this person: the store's own price and terms. */
export interface StoreOffer {
  planId: PlanId;
  period: PlanPeriod;
  price: string;          // the store's price text, e.g. "₹999.00"
  amount: number;         // the same in currency units
  currency: string;
  freeTrial: string | null;  // e.g. "1-week free trial" (iPhone, for people who haven't had one)
  buy: { productIdentifier: string; planIdentifier?: string };
}

/** What the server now has for the signed-in user. */
export interface StoreStanding {
  pro: boolean;
  status: string | null;
  plan: string | null;
  renewsAt: string | null;
  trialEndsAt: string | null;
}

const UNITS = ['day', 'week', 'month', 'year'];

function trialText(intro: SKProductDiscount | null | undefined): string | null {
  // paymentMode 0 = free trial (StoreKit 2)
  if (!intro || (intro.paymentMode !== 0 && intro.price !== 0)) return null;
  const count = (intro.subscriptionPeriod?.numberOfUnits || 1) * (intro.numberOfPeriods || 1);
  const unit = UNITS[intro.subscriptionPeriod?.unit ?? 0] ?? 'day';
  return `${count}-${unit} free trial`;
}

/** The plans the store will sell here, with its prices. Empty if the store has none set up. */
export async function loadStoreOffers(): Promise<StoreOffer[]> {
  const platform = storePlatform();
  if (!platform) return [];
  const { plans } = await callStore<{ plans: StorePlanConfig[] }>({ action: 'config' });

  if (platform === 'android') {
    const ids = [...new Set(plans.map((p) => p.googleProductId).filter((id): id is string => !!id))];
    if (!ids.length) return [];
    const { products } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.SUBS });
    const offers = plans.flatMap((plan) => {
      // One entry per base plan and offer; the base plan's has no offer id
      const base = (products ?? []).find((p) =>
        p.planIdentifier === plan.googleProductId && p.identifier === plan.googleBasePlanId && !p.offerId);
      if (!base || !plan.googleProductId || !plan.googleBasePlanId) return [];
      return [{
        planId: plan.id, period: plan.period, price: base.priceString, amount: base.price, currency: base.currencyCode,
        freeTrial: null, buy: { productIdentifier: plan.googleProductId, planIdentifier: plan.googleBasePlanId },
      }];
    });
    reportMissing('Google Play', plans.filter((p) => !offers.some((o) => o.planId === p.id)).map((p) => `${p.googleProductId}/${p.googleBasePlanId}`), plans.length);
    return offers;
  }

  const ids = plans.map((p) => p.appleProductId).filter((id): id is string => !!id);
  if (!ids.length) return [];
  const { products } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.SUBS });
  const offers = plans.flatMap((plan) => {
    const product = (products ?? []).find((p) => p.identifier === plan.appleProductId);
    if (!product) return [];
    return [{
      planId: plan.id, period: plan.period, price: product.priceString, amount: product.price, currency: product.currencyCode,
      freeTrial: trialText(product.introductoryPrice), buy: { productIdentifier: product.identifier },
    }];
  });
  reportMissing('The App Store', ids.filter((id) => !offers.some((o) => o.buy.productIdentifier === id)), ids.length);
  return offers;
}

// When the store holds back plans the server lists (not set up there yet, an
// agreement not active, not sold in the buyer's country), Admin → Errors says
// which, so "Coming soon" in the app has a reason someone can see
function reportMissing(store: string, missing: string[], asked: number) {
  if (missing.length) {
    reportError(new Error(`${store} returned ${asked - missing.length} of ${asked} Shaadi24+ plans; missing: ${missing.join(', ')}`), 'Shaadi24+ plans');
  }
}

/** Sends a store purchase to the server, which checks it and turns Pro on. */
export async function reportPurchase(tx: Transaction): Promise<StoreStanding> {
  const platform = storePlatform();
  if (platform === 'android') {
    if (!tx.purchaseToken) throw new StoreError("Google Play didn't return the purchase. Please try Restore purchases.", 'NO_TOKEN');
    return await callStore<StoreStanding>({ action: 'verify', platform, purchaseToken: tx.purchaseToken });
  }
  if (platform === 'ios') {
    if (!tx.jwsRepresentation) throw new StoreError("The App Store didn't return the purchase. Please try Restore purchases.", 'NO_TOKEN');
    return await callStore<StoreStanding>({ action: 'verify', platform, jws: tx.jwsRepresentation });
  }
  throw new StoreError('Purchases are made in the Shaadi24 app.', 'NOT_APP');
}

export type PurchaseOutcome =
  | { status: 'done'; standing: StoreStanding }
  | { status: 'cancelled' }
  | { status: 'pending' }      // waiting for payment (some UPI and cash methods) or a parent's approval
  | { status: 'restored'; standing: StoreStanding & { restored: number } };  // they had already bought it

/** Opens the store's payment sheet for a plan, then has the server check the purchase. */
export async function buyOffer(offer: StoreOffer, userId: string): Promise<PurchaseOutcome> {
  let tx: Transaction;
  try {
    tx = await NativePurchases.purchaseProduct({
      ...offer.buy,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: userId,
    });
  } catch (e) {
    const { code, message = '' } = (e ?? {}) as { code?: string; message?: string };
    if (code === 'USER_CANCELED' || /user ?cancel/i.test(message)) return { status: 'cancelled' };
    if (/pending/i.test(message)) return { status: 'pending' };
    if (code === 'ITEM_ALREADY_OWNED') return { status: 'restored', standing: await restoreStorePurchases(true) };
    throw new StoreError(message || 'The purchase did not go through. Please try again.', code || 'STORE_FAILED');
  }
  return { status: 'done', standing: await reportPurchase(tx) };
}

/**
 * Sends every purchase the store still has to the server. `interactive`: the
 * person pressed Restore purchases (the App Store may ask them to sign in).
 * Otherwise only purchases made for `userId` are sent, quietly.
 */
export async function restoreStorePurchases(interactive: boolean, userId?: string): Promise<StoreStanding & { restored: number }> {
  const platform = storePlatform();
  if (!platform) throw new StoreError('Purchases are made in the Shaadi24 app.', 'NOT_APP');
  if (interactive && platform === 'ios') await NativePurchases.restorePurchases().catch(() => {});
  const { purchases = [] } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
    ...(interactive || !userId ? {} : { appAccountToken: userId }),
  });
  if (platform === 'android') {
    const purchaseTokens = purchases.filter((p) => p.purchaseToken && p.purchaseState !== '2').map((p) => p.purchaseToken as string);
    return await callStore({ action: 'restore', platform, purchaseTokens });
  }
  const jws = purchases.map((p) => p.jwsRepresentation).filter((j): j is string => !!j);
  return await callStore({ action: 'restore', platform, jws });
}

/** The store's own page for the person's subscriptions (to change plan or cancel). */
export const manageStoreSubscription = () => NativePurchases.manageSubscriptions();

/**
 * A change of plan waiting for the next renewal: on iPhone, a switch between
 * plans of different lengths starts when the current one renews (Apple's
 * rule; all four are on the same level). Read from the App Store on the
 * phone. Google Play switches at once, so there's never one waiting there.
 */
export async function pendingPlanChange(): Promise<{ planId: PlanId } | null> {
  if (storePlatform() !== 'ios') return null;
  const { purchases = [] } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS, onlyCurrentEntitlements: true });
  const next = purchases
    .map((p) => p.renewalInfo?.willAutoRenew !== false ? p.renewalInfo?.autoRenewProductId : undefined)
    .find((id, i) => !!id && id !== purchases[i].productIdentifier);
  if (!next) return null;
  const { plans } = await callStore<{ plans: StorePlanConfig[] }>({ action: 'config' });
  const plan = plans.find((p) => p.appleProductId === next);
  return plan ? { planId: plan.id } : null;
}

// ---- Keeping the server in step from the app ------------------------------------------

const SYNC_KEY = 'matchgpt_store_sync';
const SYNC_EVERY_MS = 6 * 3600_000;
let listener: Promise<PluginListenerHandle | null> | null = null;

/**
 * For a signed-in user in the app: now and then, sends the store's current
 * purchases to the server (in case a store notification was lost), and on
 * iPhone passes on renewals and refunds the App Store delivers while the app
 * runs. Never throws; true once the server has been sent the purchases.
 */
export async function startStoreSync(userId: string, opts: { force?: boolean } = {}): Promise<boolean> {
  const platform = storePlatform();
  if (!platform) return false;
  if (platform === 'ios' && !listener) {
    listener = NativePurchases.addListener('transactionUpdated', (tx) => {
      reportPurchase(tx).catch((e) => console.warn('[store] update not sent:', e));
    }).catch(() => null);
  }
  let last = 0;
  try {
    last = Number(localStorage.getItem(`${SYNC_KEY}:${userId}`)) || 0;
  } catch { /* storage unavailable */ }
  if (!opts.force && Date.now() - last < SYNC_EVERY_MS) return false;
  try {
    await restoreStorePurchases(false, userId);
    try {
      localStorage.setItem(`${SYNC_KEY}:${userId}`, String(Date.now()));
    } catch { /* storage unavailable */ }
    return true;
  } catch (e) {
    console.warn('[store] sync failed:', e);
    return false;
  }
}

/** Stops listening for App Store updates (on sign-out). */
export async function stopStoreSync(): Promise<void> {
  const l = listener;
  listener = null;
  if (l) await (await l)?.remove().catch(() => {});
}
