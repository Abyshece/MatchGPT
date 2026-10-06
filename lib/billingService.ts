// ============================================================================
// billingService: Shaadi24+ subscriptions
//
// Shaadi24+ is sold only inside the phone apps, through Google Play and the
// App Store (lib/storePurchases.ts; the server checks each purchase with the
// store). The app reads its own subscription and payments directly: row
// access rules let each member read only theirs, and nobody can write them.
// ============================================================================

import { supabase } from './supabase';
import type { Tables } from './database.types';

export type PlanId = 'monthly' | 'yearly';

export interface BillingPlan {
  id: PlanId;
  name: string;
  amount: number;  // paise
  currency: string;
  period: 'monthly' | 'yearly';
}

export type Subscription = Tables<'subscriptions'>;
// What members may read of their own payments (not the fees we paid)
const MY_PAYMENT_COLUMNS = 'id,user_id,subscription_id,provider,store_order_id,amount,currency,status,method,paid_at,refunded_amount,refunded_at,created_at';
export type Payment = Pick<Tables<'payments'>,
  'id' | 'user_id' | 'subscription_id' | 'provider' | 'store_order_id' | 'amount' | 'currency' | 'status' | 'method'
  | 'paid_at' | 'refunded_amount' | 'refunded_at' | 'created_at'>;

// The prices in the Terms (the stores show their own, in the buyer's currency)
export const DEFAULT_PLANS: BillingPlan[] = [
  { id: 'monthly', name: 'Shaadi24+ monthly', amount: 99900, currency: 'INR', period: 'monthly' },
  { id: 'yearly', name: 'Shaadi24+ yearly', amount: 999900, currency: 'INR', period: 'yearly' },
];

// What Shaadi24+ adds (each is enforced by the server): the daily limits
// lifted, which takes a subscription...
const UNLIMITED = [
  'Unlimited AI searches (free: 3 a day)',
  'Unlimited likes (free: 15 a day)',
];
// ...and the features, which are also everyone's while "Shaadi24+ for
// everyone" is on (useAuth().proForAll; app_settings)
const FEATURES = [
  'See everyone who liked you',
  'Super Likes, to stand out',
  'Every search filter: religion, community, height and more',
  'Compatibility reports: why you match',
  'Propose dates in chat',
  'Refresh your Standouts any time',
];

/** What buying Shaadi24+ adds right now. */
export function proBenefits(proForAll: boolean): string[] {
  return proForAll ? UNLIMITED : [...UNLIMITED, ...FEATURES];
}

/** Said under the benefits while Shaadi24+'s features are everyone's. */
export const FEATURES_FREE_NOW = 'Likes You, Super Likes, every filter, compatibility reports and date proposals are free for everyone right now.';

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
  provider === 'google_play' ? 'Google Play' : provider === 'app_store' ? 'App Store' : (provider ?? '');

export const periodWord = (period: BillingPlan['period']) => (period === 'yearly' ? 'year' : 'month');

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
