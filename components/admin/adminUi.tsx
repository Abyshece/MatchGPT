import React from 'react';
import { profilePercent, type CustomerRow } from '../../lib/adminCustomers';

// ============================================================================
// Small pieces the admin sections share: dates, "3h ago", pills
// ============================================================================

export const date = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function ago(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));

export const Pill: React.FC<{ tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue'; children: React.ReactNode }> = ({ tone = 'gray', children }) => (
  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${{
    gray: 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  }[tone]}`}>{children}</span>
);

export const planPill = (r: CustomerRow) =>
  r.tier === 'PRO' ? <Pill tone="blue">Shaadi24+{r.plan ? ` · ${r.plan}` : ''}</Pill> : <Pill>Free</Pill>;

export const verificationPill = (r: CustomerRow) =>
  r.verified ? <Pill tone="green">Verified</Pill>
    : r.verification === 'pending' ? <Pill tone="amber">Waiting</Pill>
      : r.verification === 'rejected' ? <Pill tone="red">Rejected</Pill> : <Pill>No</Pill>;

export const profileCell = (r: CustomerRow) => (
  <span className="inline-flex items-center gap-2">
    <span className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
      <span className="block h-full bg-gray-900 dark:bg-white" style={{ width: `${profilePercent(r)}%` }} />
    </span>
    <span>{profilePercent(r)}% · {r.sections_done}/6</span>
  </span>
);
