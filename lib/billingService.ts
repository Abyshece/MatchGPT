// ============================================================================
// billingService: MatchGPT+ subscriptions (Razorpay)
//
// The `billing` edge function talks to Razorpay (supabase/functions/billing).
// The browser reads its own subscription and payments directly: row access
// rules let each user read only theirs, and nobody can write them.
// ============================================================================

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Tables } from './database.types';
import type { CheckoutResponse } from './razorpayCheckout';

export type PlanId = 'monthly' | 'yearly';

export interface BillingPlan {
  id: PlanId;
  name: string;
  amount: number;  // paise
  currency: string;
  period: 'monthly' | 'yearly';
}

export interface BillingConfig {
  enabled: boolean;           // false until the Razorpay keys are set on the server
  mode: 'test' | 'live' | null;
  keyId: string | null;
  trialDays: number;
  trialEligible: boolean;     // one free trial per person
  plans: BillingPlan[];
}

export type Subscription = Tables<'subscriptions'>;
// What people may read of their own payments (not the fees we paid)
const MY_PAYMENT_COLUMNS = 'id,user_id,subscription_id,provider,razorpay_payment_id,razorpay_invoice_id,invoice_url,store_order_id,amount,currency,status,method,paid_at,refunded_amount,refunded_at,created_at';
export type Payment = Omit<Tables<'payments'>, 'fee_amount' | 'fee_estimated'>;

// The prices in the Terms, shown until the server answers
export const DEFAULT_PLANS: BillingPlan[] = [
  { id: 'monthly', name: 'MatchGPT+ monthly', amount: 99900, currency: 'INR', period: 'monthly' },
  { id: 'yearly', name: 'MatchGPT+ yearly', amount: 999900, currency: 'INR', period: 'yearly' },
];

// What MatchGPT+ adds (each is enforced by the server, except the Likes You
// view while PRO_FOR_ALL is on)
export const PRO_FEATURES = [
  'Unlimited AI searches (free: 3 a day)',
  'Unlimited likes (free: 15 a day)',
  'Super Likes, to stand out',
  'Refresh your Standouts any time',
  'See everyone who liked you',
];

export class BillingError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function callBilling<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    let code = 'FAILED';
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
      if (typeof details?.code === 'string') code = details.code;
    }
    throw new BillingError(message, code);
  }
  return data as T;
}

export const getBillingConfig = () => callBilling<BillingConfig>({ action: 'config' });

export interface SubscribeResult {
  subscriptionId: string;
  keyId: string;
  planName: string;
  amount: number;
  trialEndsAt: string | null;
  prefill: { name: string; email: string };
}
export const startSubscription = (plan: PlanId) => callBilling<SubscribeResult>({ action: 'subscribe', plan });

export interface VerifyResult {
  status: string;
  pro: boolean;
  renewsAt: string | null;
  trialEndsAt: string | null;
  duplicate?: boolean;  // they already had MatchGPT+: this one was cancelled and refunded
}
export const confirmSubscription = (checkout: CheckoutResponse) =>
  callBilling<VerifyResult>({ action: 'verify', ...checkout });

export const cancelSubscription = () => callBilling<{ status: string; proUntil: string | null }>({ action: 'cancel' });

// Re-reads the user's subscriptions from Razorpay (in case a webhook was missed)
export const refreshSubscription = () => callBilling<{ ok: boolean }>({ action: 'refresh' });

const LIVE = ['authenticated', 'active', 'pending', 'paused'];

// The subscription to show: the live one if there is one, else the latest
// that got past checkout, or null
export async function getMySubscription(userId: string): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .not('status', 'in', '(created,expired)')
    .order('created_at', { ascending: false })
    .limit(5);
  return data?.find((s) => LIVE.includes(s.status)) ?? data?.[0] ?? null;
}

export async function listMyPayments(userId: string): Promise<Payment[]> {
  const { data } = await supabase
    .from('payments')
    .select(MY_PAYMENT_COLUMNS)
    .eq('user_id', userId)
    .order('paid_at', { ascending: false })
    .limit(24);
  return data ?? [];
}

// 99900 → "₹999", 999900 → "₹9,999"
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const digits = Number.isInteger(rupees) ? 0 : 2;  // ₹999, or ₹849.15 and ₹1,698.30
  return `${rupees < 0 ? '-' : ''}₹${Math.abs(rupees).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'PYG', 'XAF', 'XOF']);

// An amount in the currency's smallest unit, in any currency (store charges
// can be in the buyer's own): INR as formatRupees, others like "US$11.99"
export function formatMoney(minor: number, currency: string): string {
  if (currency === 'INR') return formatRupees(minor);
  const units = ZERO_DECIMAL.has(currency) ? minor : minor / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(units);
  } catch {
    return `${units} ${currency}`;
  }
}

// Who billed a subscription or charge
export const sellerName = (provider: string | null | undefined) =>
  provider === 'google_play' ? 'Google Play' : provider === 'app_store' ? 'App Store' : 'Razorpay';

export const periodWord = (period: BillingPlan['period']) => (period === 'yearly' ? 'year' : 'month');

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
