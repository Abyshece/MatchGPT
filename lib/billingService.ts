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
import { plusSearchesText, type PlanLimits } from './searchLimits';

// A plan's id is also its length (billing_plans: id and period)
export type PlanId = 'weekly' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type PlanPeriod = PlanId;

export interface BillingPlan {
  id: PlanId;
  name: string;
  amount: number;  // paise
  currency: string;
  period: PlanPeriod;
}

/** How long each plan runs: in words, and in weeks (for the price a week) */
export const PERIODS: Record<PlanPeriod, { label: string; every: string; weeks: number }> = {
  weekly: { label: '1 week', every: 'week', weeks: 1 },
  monthly: { label: '1 month', every: 'month', weeks: 52 / 12 },
  quarterly: { label: '3 months', every: '3 months', weeks: 13 },
  halfyearly: { label: '6 months', every: '6 months', weeks: 26 },
  yearly: { label: '1 year', every: 'year', weeks: 52 },
};

export type Subscription = Tables<'subscriptions'>;
// What members may read of their own payments (not the fees we paid)
const MY_PAYMENT_COLUMNS = 'id,user_id,subscription_id,provider,store_order_id,amount,currency,status,method,paid_at,refunded_amount,refunded_at,created_at';
export type Payment = Pick<Tables<'payments'>,
  'id' | 'user_id' | 'subscription_id' | 'provider' | 'store_order_id' | 'amount' | 'currency' | 'status' | 'method'
  | 'paid_at' | 'refunded_amount' | 'refunded_at' | 'created_at'>;

// The prices in the Terms (the stores show their own, in the buyer's currency):
// the plans on sale, shortest first
export const DEFAULT_PLANS: BillingPlan[] = [
  { id: 'weekly', name: 'Shaadi24+ 1 week', amount: 49900, currency: 'INR', period: 'weekly' },
  { id: 'monthly', name: 'Shaadi24+ 1 month', amount: 99900, currency: 'INR', period: 'monthly' },
  { id: 'quarterly', name: 'Shaadi24+ 3 months', amount: 199900, currency: 'INR', period: 'quarterly' },
  { id: 'halfyearly', name: 'Shaadi24+ 6 months', amount: 299900, currency: 'INR', period: 'halfyearly' },
];

/** A plan's name, for subscriptions of any plan (yearly is no longer sold) */
export const planName = (id: string | null | undefined) =>
  DEFAULT_PLANS.find((p) => p.id === id)?.name ?? (id === 'yearly' ? 'Shaadi24+ 1 year' : 'Shaadi24+');

/** The Terms' prices in words: "₹499 a week, ₹999 a month, ₹1,999 for 3 months and ₹2,999 for 6 months" */
export function pricesInWords(): string {
  const each = DEFAULT_PLANS.map((p) => p.period === 'weekly' || p.period === 'monthly'
    ? `${formatRupees(p.amount)} a ${PERIODS[p.period].every}`
    : `${formatRupees(p.amount)} for ${PERIODS[p.period].label}`);
  return `${each.slice(0, -1).join(', ')} and ${each[each.length - 1]}`;
}

// What Shaadi24+ adds (each is enforced by the server): more searches and
// unlimited likes, which take a subscription...
export interface ProBenefit {
  key: 'searches' | 'likes' | 'likes-you' | 'super-likes' | 'filters' | 'reports' | 'dates' | 'standouts';
  title: string;
  detail?: string;
}
// (searches: more of them, as many as Admin → Search insights sets; lib/searchLimits.ts)
const limitsLifted = (plans?: { free: PlanLimits; plus: PlanLimits }, hours?: number): ProBenefit[] => [
  { key: 'searches', ...plusSearchesText(plans, hours) },
  { key: 'likes', title: 'Unlimited likes', detail: 'Free: 15 a day' },
];
// ...and the features, which are also everyone's while "Shaadi24+ for
// everyone" is on (useAuth().proForAll; app_settings)
const FEATURES: ProBenefit[] = [
  { key: 'likes-you', title: 'See everyone who liked you' },
  { key: 'super-likes', title: 'Super Likes, to stand out' },
  { key: 'filters', title: 'Every search filter', detail: 'Religion, community, height and more' },
  { key: 'reports', title: 'Compatibility reports', detail: 'Why you match' },
  { key: 'dates', title: 'Propose dates in chat' },
  { key: 'standouts', title: 'Refresh your Standouts any time' },
];

/** What buying Shaadi24+ adds right now (with the search limits the server has, when they're known). */
export function proBenefits(proForAll: boolean, plans?: { free: PlanLimits; plus: PlanLimits }, hours?: number): ProBenefit[] {
  return proForAll ? limitsLifted(plans, hours) : [...limitsLifted(plans, hours), ...FEATURES];
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
