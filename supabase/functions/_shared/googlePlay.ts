// ============================================================================
// Google Play: Shaadi24+ bought in the Android app
//
// The GOOGLE_PLAY_SERVICE_ACCOUNT secret holds the JSON key of a Google Cloud
// service account that Play Console (Users and permissions) lets "View
// financial data" and "Manage orders and subscriptions". With it we read a
// purchase's state from the Play Developer API and acknowledge new purchases
// (Google refunds unacknowledged ones after three days).
//
// ANDROID_PACKAGE_NAME: the app's package name (default com.shaadi24.app).
// GOOGLE_PLAY_API_BASE: only for local testing against a stand-in.
// ============================================================================

import { forgetGoogleAccessToken, googleAccessToken, serviceAccountFrom, type ServiceAccount } from './googleAuth.ts';

export interface GooglePlayConfig {
  account: ServiceAccount;
  packageName: string;
  apiBase: string;
}

export function googlePlayConfig(): GooglePlayConfig | null {
  const account = serviceAccountFrom('GOOGLE_PLAY_SERVICE_ACCOUNT');
  if (!account) return null;
  return {
    account,
    packageName: Deno.env.get('ANDROID_PACKAGE_NAME') || 'com.shaadi24.app',
    apiBase: (Deno.env.get('GOOGLE_PLAY_API_BASE') || 'https://androidpublisher.googleapis.com').replace(/\/+$/, ''),
  };
}

export class GooglePlayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

async function api<T>(cfg: GooglePlayConfig, method: string, path: string, body: unknown = {}): Promise<T> {
  const call = async () => fetch(`${cfg.apiBase}/androidpublisher/v3/applications/${encodeURIComponent(cfg.packageName)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await googleAccessToken(cfg.account, PLAY_SCOPE)}`,
      'Content-Type': 'application/json',
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  let res = await call();
  if (res.status === 401) {
    // Google stopped accepting our token: sign in afresh, once
    await res.body?.cancel();
    forgetGoogleAccessToken(cfg.account, PLAY_SCOPE);
    res = await call();
  }
  const text = await res.text();
  if (!res.ok) throw new GooglePlayError(`Google Play ${method} ${path.split('/tokens/')[0]}: ${res.status} ${text.slice(0, 300)}`, res.status);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---- A subscription purchase (Play Developer API, subscriptionsv2) ---------------

interface Money {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}

export interface GoogleSubscription {
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  canceledStateContext?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean; recurringPrice?: Money };
    offerDetails?: { basePlanId?: string; offerId?: string; offerTags?: string[] };
    offerPhase?: { freeTrial?: Record<string, unknown>; introductoryPrice?: Record<string, unknown>; basePrice?: Record<string, unknown> };
  }[];
}

export const getSubscription = (cfg: GooglePlayConfig, purchaseToken: string) =>
  api<GoogleSubscription>(cfg, 'GET', `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);

export const acknowledgeSubscription = (cfg: GooglePlayConfig, productId: string, purchaseToken: string) =>
  api<unknown>(cfg, 'POST',
    `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`);

// Stops the renewals for good (the account is being deleted); the period paid for runs out as usual
export const cancelSubscription = (cfg: GooglePlayConfig, purchaseToken: string) =>
  api<unknown>(cfg, 'POST', `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:cancel`, {
    cancellationContext: { cancellationType: 'DEVELOPER_REQUESTED_STOP_PAYMENTS' },
  });

// ---- A one-time product purchase (Spotlight, Super Interests) ---------------------------

export interface GoogleProductPurchase {
  purchaseTimeMillis?: string;
  purchaseState?: number;          // 0 purchased, 1 cancelled, 2 pending (some UPI and cash payments)
  consumptionState?: number;       // 0 not consumed yet, 1 consumed
  orderId?: string;
  purchaseType?: number;           // 0 a test purchase (license testers), 1 promo code, 2 rewarded
  acknowledgementState?: number;
  obfuscatedExternalAccountId?: string;
  quantity?: number;
}

export const getProductPurchase = (cfg: GooglePlayConfig, productId: string, purchaseToken: string) =>
  api<GoogleProductPurchase>(cfg, 'GET', `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`);

// Consuming acknowledges the purchase and lets the person buy the pack again
export const consumeProductPurchase = (cfg: GooglePlayConfig, productId: string, purchaseToken: string) =>
  api<unknown>(cfg, 'POST', `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`);

// ---- Our view of it --------------------------------------------------------------------

export interface StoreState {
  // Our subscription statuses (see the phase 11 billing migration):
  // authenticated = in the free trial, active, pending = in the grace period
  // after a failed renewal (still Pro), halted = on hold (no Pro), paused,
  // created = payment not finished, expired, cancelled = revoked or refunded
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'paused' | 'expired' | 'cancelled';
  productId: string | null;
  basePlanId: string | null;
  mode: 'test' | 'live';
  trialEndsAt: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  autoRenew: boolean | null;
  cancelAtPeriodEnd: boolean;
  endedAt: string | null;
  // The latest charge: null while in the free trial
  orderId: string | null;
  price: { amount: number; currency: string } | null;
  userId: string | null;          // the Shaadi24 account the app passed with the purchase
  linkedPurchaseToken: string | null;  // the purchase this one replaced (a plan change)
  needsAcknowledgement: boolean;
}

// Money → the currency's smallest unit (₹999 → 99900)
export function moneyToMinor(m: Money | undefined): { amount: number; currency: string } | null {
  if (!m?.currencyCode) return null;
  const units = Number(m.units ?? 0);
  const nanos = Number(m.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  const digits = ZERO_DECIMAL.has(m.currencyCode) ? 0 : 2;
  return { amount: Math.round((units + nanos / 1e9) * 10 ** digits), currency: m.currencyCode };
}

export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'PYG', 'XAF', 'XOF']);

export function googleState(sub: GoogleSubscription, now = new Date()): StoreState {
  const item = sub.lineItems?.[0] ?? {};
  const expiry = item.expiryTime ?? null;
  const inTrial = !!item.offerPhase?.freeTrial;
  const autoRenew = item.autoRenewingPlan?.autoRenewEnabled ?? null;
  const notExpired = !!expiry && Date.parse(expiry) > now.getTime();

  let status: StoreState['status'];
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
    case 'SUBSCRIPTION_STATE_CANCELED':  // cancelled by the user: Pro until the period ends
      status = notExpired ? (inTrial ? 'authenticated' : 'active') : 'expired';
      break;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      status = 'pending';
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      status = 'halted';
      break;
    case 'SUBSCRIPTION_STATE_PAUSED':
      status = 'paused';
      break;
    case 'SUBSCRIPTION_STATE_PENDING':
      status = 'created';
      break;
    default:  // EXPIRED, PENDING_PURCHASE_CANCELED, unknown
      status = 'expired';
  }

  // In the grace period after a failed renewal the period has run out but Pro
  // goes on; Google says when it ends (recovered, or on hold). Keep Pro a week
  // past now so a lost notification can't run it on for ever.
  const graceEnd = new Date(Math.max(expiry ? Date.parse(expiry) : 0, now.getTime() + 7 * 86_400_000)).toISOString();

  const orderId = item.latestSuccessfulOrderId ?? sub.latestOrderId ?? null;
  return {
    status,
    productId: item.productId ?? null,
    basePlanId: item.offerDetails?.basePlanId ?? null,
    mode: sub.testPurchase ? 'test' : 'live',
    trialEndsAt: inTrial ? expiry : null,
    currentStart: inTrial ? null : sub.startTime ?? null,
    currentEnd: inTrial ? null : status === 'pending' ? graceEnd : expiry,
    autoRenew,
    cancelAtPeriodEnd: autoRenew === false || sub.subscriptionState === 'SUBSCRIPTION_STATE_CANCELED',
    endedAt: status === 'expired' ? expiry ?? now.toISOString() : null,
    orderId: inTrial ? null : orderId,
    price: inTrial ? null : moneyToMinor(item.autoRenewingPlan?.recurringPrice),
    userId: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: sub.linkedPurchaseToken ?? null,
    needsAcknowledgement: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}
