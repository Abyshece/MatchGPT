// ============================================================================
// financeService: the money, for the admin Finance tab
//
// Wraps the admin-only admin_finance_summary() (subscribers, recurring
// revenue, money by month and seller) and admin_list_payments() (every
// charge, with who paid), and turns charges into a CSV for the accounts.
// Amounts are in the currency's smallest unit (paise for INR). Months follow
// the calendar in India (Asia/Kolkata), as the database counts them.
// ============================================================================

import { supabase } from './supabase';
import type { Database } from './database.types';

export type FinanceMode = 'live' | 'test';
export type Seller = 'google_play' | 'app_store' | 'razorpay';

/** Every seller, in a fixed order: the chart gives each its colour by this order. */
export const SELLERS: Seller[] = ['google_play', 'app_store', 'razorpay'];

export const SELLER_LABEL: Record<Seller, string> = {
  google_play: 'Google Play',
  app_store: 'App Store',
  razorpay: 'Website',
};

export const isSeller = (s: string | null | undefined): s is Seller => SELLERS.includes(s as Seller);

export interface MoneyTotals {
  gross: number;    // what customers paid
  refunds: number;  // given back
  fees: number;     // kept by the seller (Razorpay's actual fee; the stores' commission, estimated)
  net: number;      // what's left for us
  charges: number;
}

export interface FinanceMonth extends MoneyTotals {
  month: string;  // 'YYYY-MM'
  by_provider: Partial<Record<Seller, MoneyTotals>>;
}

export interface FinanceSummary {
  currency: 'INR';
  mode: FinanceMode;
  time_zone: string;
  generated_at: string;
  subscribers: {
    total: number;
    paying: number;
    in_trial: number;
    ending: number;  // cancelled, still active until the period ends
    by_provider: Partial<Record<Seller, number>>;
    by_plan: Record<string, number>;
  };
  mrr: number;
  cancelled_last_30_days: number;
  months: FinanceMonth[];  // oldest first; the last is this month
  all_time: MoneyTotals;
  // Charges in other currencies (people paying abroad through a store), all time
  other_currencies: Record<string, Omit<MoneyTotals, 'fees'>>;
}

export type Charge = Database['public']['Functions']['admin_list_payments']['Returns'][number];

export async function fetchFinanceSummary(
  months: number, mode: FinanceMode,
): Promise<{ summary: FinanceSummary | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_finance_summary', { p_months: months, p_mode: mode });
  if (error) return { summary: null, error: error.message };
  return { summary: data as unknown as FinanceSummary, error: null };
}

export interface ChargeFilter {
  mode: FinanceMode;
  seller: Seller | null;
  from: string | null;  // ISO timestamps; `to` is exclusive
  to: string | null;
}

export async function fetchCharges(
  filter: ChargeFilter, limit: number, offset = 0,
): Promise<{ charges: Charge[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_payments', {
    p_mode: filter.mode,
    ...(filter.seller ? { p_provider: filter.seller } : {}),
    ...(filter.from ? { p_from: filter.from } : {}),
    ...(filter.to ? { p_to: filter.to } : {}),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { charges: [], error: error.message };
  return { charges: data ?? [], error: null };
}

/** Every charge the filter matches, a thousand at a time (for the export). */
export async function fetchAllCharges(filter: ChargeFilter): Promise<{ charges: Charge[]; error: string | null }> {
  const PAGE = 1000;
  const all: Charge[] = [];
  for (;;) {
    const { charges, error } = await fetchCharges(filter, PAGE, all.length);
    if (error) return { charges: [], error };
    all.push(...charges);
    if (charges.length < PAGE) return { charges: all, error: null };
  }
}

// ---- Months in India time -------------------------------------------------------------

export const INDIA_TZ = 'Asia/Kolkata';

/** The month ('YYYY-MM') it is in India. */
export function indiaMonth(date = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: INDIA_TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

/** A month some months later (or earlier, for a negative count). */
export function addMonths(month: string, count: number): string {
  const [y, m] = month.split('-').map(Number);
  const n = y * 12 + (m - 1) + count;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
}

/** When a month ('YYYY-MM') starts and ends, at midnight in India. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01T00:00:00+05:30`, to: `${addMonths(month, 1)}-01T00:00:00+05:30` };
}

const monthDate = (month: string) => new Date(`${month}-15T12:00:00Z`);

/** "Oct" or, with the year, "Oct 2026"; long: "October 2026". */
export function monthLabel(month: string, style: 'short' | 'year' | 'long' = 'year'): string {
  return monthDate(month).toLocaleDateString('en-IN', {
    month: style === 'long' ? 'long' : 'short',
    ...(style === 'short' ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** A charge's time in India: "3 Oct 2026, 9:41 pm". */
export function indiaTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: INDIA_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ---- Rupees ---------------------------------------------------------------------------

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/**
 * Paise as short rupees, the Indian way: "₹999", "₹10.2K", "₹1.2L", "₹3.4Cr".
 * (Not Intl's compact notation: browsers disagree on it, and some write a
 * thousand as "T".)
 */
export function rupeesCompact(paise: number): string {
  const rupees = paise / 100;
  const a = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (Math.round(a) < 1000) return `${sign}₹${Math.round(a)}`;
  const [size, unit] = a >= 0.9995e7 ? [1e7, 'Cr'] : a >= 0.9995e5 ? [1e5, 'L'] : [1e3, 'K'];
  return `${sign}₹${Number((a / size).toFixed(1)).toLocaleString('en-IN', { maximumFractionDigits: 1 })}${unit}`;
}

/** Paise as whole rupees, Indian style ("₹84,915"); from a lakh up, short ("₹1.2L"). */
export function rupeesShort(paise: number): string {
  return Math.abs(paise) >= 1_00_000_00 ? rupeesCompact(paise) : whole.format(Math.round(paise / 100));
}

// ---- The export ------------------------------------------------------------------------

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD', 'UGX', 'PYG', 'XAF', 'XOF']);

/** An amount in the smallest unit as a plain number in the currency: 84915 INR → "849.15". */
function units(minor: number | null, currency: string): string {
  if (minor === null) return '';
  return ZERO_DECIMAL.has(currency) ? String(minor) : (minor / 100).toFixed(2);
}

/** A time in India as "2026-10-03 21:41", which spreadsheets read as a date. */
function indiaStamp(iso: string | null): string {
  if (!iso) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: INDIA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export const STATUS_LABEL: Record<string, string> = {
  captured: 'Paid',
  refunded: 'Refunded',
  failed: 'Failed',
  authorized: 'Authorised',
  created: 'Started',
};

export function chargeStatus(c: Pick<Charge, 'status' | 'refunded_amount' | 'amount'>): string {
  if (c.status === 'captured' && c.refunded_amount > 0) return c.refunded_amount >= c.amount ? 'Refunded' : 'Partly refunded';
  return STATUS_LABEL[c.status] ?? c.status;
}

// A cell. Text that a spreadsheet would run as a formula (a name like
// "=HYPERLINK(…)") is kept as text with a leading apostrophe; a plain
// negative amount stays a number.
function cell(value: string | number | boolean | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS: [string, (c: Charge) => string | number | boolean | null][] = [
  ['Date (India time)', (c) => indiaStamp(c.paid_at)],
  ['Order ID', (c) => c.order_id],
  ['Seller', (c) => (isSeller(c.provider) ? (c.provider === 'razorpay' ? 'Website (Razorpay)' : SELLER_LABEL[c.provider]) : c.provider)],
  ['Plan', (c) => c.plan_id],
  ['Status', (c) => chargeStatus(c)],
  ['Currency', (c) => c.currency],
  ['Amount', (c) => units(c.amount, c.currency)],
  ['Fee', (c) => units(c.fee_amount, c.currency)],
  ['Fee estimated', (c) => (c.fee_amount === null ? '' : c.fee_estimated ? 'yes' : 'no')],
  ['Refunded', (c) => units(c.refunded_amount, c.currency)],
  ['Refunded on (India time)', (c) => indiaStamp(c.refunded_at)],
  ['Net', (c) => units(c.net_amount, c.currency)],
  ['Customer name', (c) => c.user_name],
  ['Customer email', (c) => c.user_email],
  ['Customer ID', (c) => c.user_id],
  ['Payment method', (c) => c.method],
  ['Mode', (c) => c.mode],
  ['Charge ID', (c) => c.id],
];

/** The charges as CSV (with a byte-order mark, so Excel reads names in any script). */
export function chargesCsv(charges: Charge[]): string {
  const lines = [CSV_COLUMNS.map(([name]) => cell(name)).join(',')];
  for (const c of charges) lines.push(CSV_COLUMNS.map(([, get]) => cell(get(c))).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
