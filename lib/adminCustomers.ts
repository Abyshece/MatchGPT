// ============================================================================
// Admin → Customers: every member in one row (admin_customers(), in
// supabase/migrations/…_admin_customers_and_verification_checks.sql), and
// the same as a CSV.
// ============================================================================

import { supabase } from './supabase';

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  gender: string | null;
  age: number | null;
  date_of_birth: string | null;
  created_for: string | null;
  marital_status: string | null;
  height_cm: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  religion: string | null;
  caste: string | null;
  mother_tongue: string | null;
  education: string | null;
  occupation: string | null;
  income: string | null;
  joined: string;
  last_active: string | null;
  sign_in: string | null;          // email, google, apple
  email_confirmed: boolean | null;
  phones: string[];                // android, ios, web (where notifications go)
  verified: boolean;
  verification: string | null;     // pending, approved, rejected
  tier: 'FREE' | 'PRO';
  renews: string | null;
  plan: string | null;
  plan_status: string | null;
  store: string | null;            // google_play, app_store
  sections_done: number;           // of 6
  answers: number;
  answers_total: number;
  photos: number;
  likes_sent: number;
  likes_received: number;
  matches: number;
  messages: number;
  reports: number;
  blocked_by: number;
  banned: boolean;
  ban_reason: string | null;
  paused: boolean;
  marketing: boolean;
  searches_today: number;
  likes_today: number;
}

export type CustomerFilter =
  | 'all' | 'new' | 'pro' | 'free' | 'verified' | 'pending' | 'unverified' | 'inactive' | 'incomplete' | 'paused' | 'banned';
export type CustomerSort = 'joined' | 'active' | 'name' | 'complete';

export const CUSTOMER_FILTERS: { id: CustomerFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New this week' },
  { id: 'pro', label: 'Shaadi24+' },
  { id: 'free', label: 'Free' },
  { id: 'verified', label: 'Verified' },
  { id: 'pending', label: 'Waiting for verification' },
  { id: 'unverified', label: 'Not verified' },
  { id: 'incomplete', label: 'Profile not complete' },
  { id: 'inactive', label: 'Inactive 30 days' },
  { id: 'paused', label: 'Paused' },
  { id: 'banned', label: 'Banned' },
];

export const CUSTOMER_SORTS: { id: CustomerSort; label: string }[] = [
  { id: 'joined', label: 'Newest first' },
  { id: 'active', label: 'Last active' },
  { id: 'name', label: 'Name' },
  { id: 'complete', label: 'Least complete profile' },
];

export async function fetchCustomers(opts: {
  query: string; filter: CustomerFilter; sort: CustomerSort; limit: number; offset: number;
}): Promise<{ rows: CustomerRow[]; total: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_customers', {
    p_query: opts.query, p_filter: opts.filter, p_sort: opts.sort, p_limit: opts.limit, p_offset: opts.offset,
  });
  if (error) return { rows: [], total: 0, error: error.message };
  const out = (data ?? { rows: [], total: 0 }) as unknown as { rows: CustomerRow[]; total: number };
  return { rows: out.rows ?? [], total: Number(out.total ?? 0), error: null };
}

// ---- How things read ---------------------------------------------------------------------

export const signInLabel = (provider: string | null) =>
  provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : provider === 'email' ? 'Email' : provider ?? '—';

export const storeLabel = (store: string | null) =>
  store === 'app_store' ? 'App Store' : store === 'google_play' ? 'Google Play' : store ?? '';

export const profilePercent = (row: Pick<CustomerRow, 'answers' | 'answers_total'>) =>
  row.answers_total > 0 ? Math.round((row.answers / row.answers_total) * 100) : 0;

export const place = (row: Pick<CustomerRow, 'city' | 'state' | 'country'>) =>
  [row.city, row.state, row.country].filter(Boolean).join(', ');

// ---- CSV ---------------------------------------------------------------------------------

const COLUMNS: [string, (r: CustomerRow) => unknown][] = [
  ['ID', (r) => r.id], ['Name', (r) => r.name], ['Email', (r) => r.email], ['Phone', (r) => r.phone],
  ['Gender', (r) => r.gender], ['Age', (r) => r.age], ['Date of birth', (r) => r.date_of_birth],
  ['Profile created for', (r) => r.created_for], ['Marital status', (r) => r.marital_status],
  ['Height (cm)', (r) => r.height_cm], ['City', (r) => r.city], ['State', (r) => r.state], ['Country', (r) => r.country],
  ['Religion', (r) => r.religion], ['Community', (r) => r.caste], ['Mother tongue', (r) => r.mother_tongue],
  ['Education', (r) => r.education], ['Occupation', (r) => r.occupation], ['Income', (r) => r.income],
  ['Joined', (r) => r.joined], ['Last active', (r) => r.last_active], ['Sign-in', (r) => signInLabel(r.sign_in)],
  ['Phones', (r) => r.phones.join(' ')], ['Verified', (r) => (r.verified ? 'yes' : 'no')], ['Verification', (r) => r.verification],
  ['Plan', (r) => (r.tier === 'PRO' ? `Shaadi24+ ${r.plan ?? ''}`.trim() : 'Free')], ['Store', (r) => storeLabel(r.store)],
  ['Renews', (r) => r.renews], ['Sections complete', (r) => `${r.sections_done}/6`], ['Profile %', (r) => profilePercent(r)],
  ['Photos', (r) => r.photos], ['Likes sent', (r) => r.likes_sent], ['Likes received', (r) => r.likes_received],
  ['Matches', (r) => r.matches], ['Messages sent', (r) => r.messages], ['Reported', (r) => r.reports],
  ['Blocked by', (r) => r.blocked_by], ['Banned', (r) => (r.banned ? 'yes' : 'no')], ['Paused', (r) => (r.paused ? 'yes' : 'no')],
  ['Marketing emails', (r) => (r.marketing ? 'yes' : 'no')],
];

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function customersCsv(rows: CustomerRow[]): string {
  return [COLUMNS.map(([h]) => h).join(','), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(','))].join('\n');
}
