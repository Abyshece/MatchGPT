import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  CUSTOMER_FILTERS, CUSTOMER_SORTS, customersCsv, fetchCustomers, place, signInLabel, storeLabel,
  type CustomerFilter, type CustomerRow, type CustomerSort,
} from '../../lib/adminCustomers';
import { belowMarriageAge, minimumAge } from '../../lib/legalAge';
import { saveTextFile } from '../../lib/saveFile';
import { MemberPanel } from './MemberPanel';
import { Pill, ago, dash, date, planPill, profileCell, verificationPill } from './adminUi';

// ============================================================================
// Admin → Customers: every member, one row each with everything about them
// (lib/adminCustomers.ts). The name stays in view while the row scrolls
// sideways. Search, filters, sorting, 50 to a page, and every match as a CSV.
// A row opens the member: all of it grouped, and the actions (verify, ban or
// unban, correct the date of birth), each kept in the audit log.
// ============================================================================

const PAGE = 50;

// The row's cells, after the name (in the CSV too, with more)
const COLUMNS: { label: string; cell: (r: CustomerRow) => React.ReactNode; right?: boolean }[] = [
  { label: 'Phone', cell: (r) => dash(r.phone) },
  { label: 'Gender', cell: (r) => dash(r.gender) },
  { label: 'Age', cell: (r) => dash(r.age), right: true },
  { label: 'Born', cell: (r) => date(r.date_of_birth) },
  { label: 'For', cell: (r) => dash(r.created_for) },
  { label: 'Marital status', cell: (r) => dash(r.marital_status) },
  { label: 'Height', cell: (r) => (r.height_cm ? `${r.height_cm} cm` : '—'), right: true },
  { label: 'Location', cell: (r) => dash(place(r)) },
  { label: 'Religion', cell: (r) => dash(r.religion) },
  { label: 'Community', cell: (r) => dash(r.caste) },
  { label: 'Mother tongue', cell: (r) => dash(r.mother_tongue) },
  { label: 'Education', cell: (r) => dash(r.education) },
  { label: 'Occupation', cell: (r) => dash(r.occupation) },
  { label: 'Income', cell: (r) => dash(r.income) },
  { label: 'Joined', cell: (r) => date(r.joined) },
  { label: 'Last active', cell: (r) => ago(r.last_active) },
  { label: 'Sign-in', cell: (r) => signInLabel(r.sign_in) },
  { label: 'Phones', cell: (r) => (r.phones.length ? r.phones.join(', ') : '—') },
  { label: 'Verified', cell: verificationPill },
  { label: 'Plan', cell: planPill },
  { label: 'Renews', cell: (r) => (r.renews ? `${date(r.renews)}${r.store ? ` · ${storeLabel(r.store)}` : ''}` : '—') },
  { label: 'Profile', cell: profileCell },
  { label: 'Photos', cell: (r) => r.photos, right: true },
  { label: 'Likes sent', cell: (r) => r.likes_sent, right: true },
  { label: 'Likes got', cell: (r) => r.likes_received, right: true },
  { label: 'Matches', cell: (r) => r.matches, right: true },
  { label: 'Messages', cell: (r) => r.messages, right: true },
  { label: 'Reported', cell: (r) => (r.reports ? <Pill tone="red">{r.reports}</Pill> : 0), right: true },
  { label: 'Blocked by', cell: (r) => r.blocked_by, right: true },
  { label: 'Status', cell: (r) => (r.banned ? <Pill tone="red">Banned</Pill> : r.paused ? <Pill>Paused</Pill> : <Pill tone="green">Active</Pill>) },
];

const AdminCustomersTab: React.FC<{ onAuditUpdate: () => void }> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>('all');
  const [sort, setSort] = useState<CustomerSort>('joined');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<CustomerRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (q: string, f: CustomerFilter, s: CustomerSort, p: number) => {
    const res = await fetchCustomers({ query: q, filter: f, sort: s, limit: PAGE, offset: p * PAGE });
    if (res.error) {
      showToast(`Couldn't load customers: ${res.error}`, 'error');
      setRows([]);
      return;
    }
    setRows(res.rows);
    setTotal(res.total);
    setOpen((o) => (o ? res.rows.find((r) => r.id === o.id) ?? o : o));
  }, [showToast]);

  // Searching waits for a pause in typing
  useEffect(() => {
    const t = setTimeout(() => { void load(query, filter, sort, page); }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, filter, sort, page, load]);

  const reload = () => { void load(query, filter, sort, page); onAuditUpdate(); };

  const exportCsv = async () => {
    setExporting(true);
    const all: CustomerRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const res = await fetchCustomers({ query, filter, sort, limit: 1000, offset });
      if (res.error) {
        showToast(`Couldn't export: ${res.error}`, 'error');
        setExporting(false);
        return;
      }
      all.push(...res.rows);
      if (res.rows.length < 1000) break;
    }
    const name = `shaadi24-customers-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    if (await saveTextFile(name, customersCsv(all), 'text/csv;charset=utf-8')) showToast(`Exported ${all.length} customers`, 'success');
    setExporting(false);
  };

  const from = total === 0 ? 0 : page * PAGE + 1;
  const to = Math.min(total, (page + 1) * PAGE);

  return (
    <div data-testid="customers">
      {/* Search, sort, export */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Search name, email, phone or city"
          aria-label="Search customers"
          className="flex-1 min-w-[220px] h-9 px-3 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600"
        />
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as CustomerSort); setPage(0); }}
          aria-label="Sort customers"
          className="h-9 px-2 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          {CUSTOMER_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || total === 0}
          className="h-9 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3" role="group" aria-label="Show">
        {CUSTOMER_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); setPage(0); }}
            className={`flex-none h-7 px-2.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f.id
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* The table */}
      <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-auto max-h-[70vh] bg-white dark:bg-zinc-900" data-testid="customers-table">
        <table className="min-w-max w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-zinc-800/95 text-gray-500 dark:text-zinc-400">
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-gray-50 dark:bg-zinc-800 text-left font-medium px-3 py-2 border-b border-r border-gray-200 dark:border-zinc-700">Member</th>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className={`font-medium px-3 py-2 border-b border-gray-200 dark:border-zinc-700 whitespace-nowrap ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-gray-500 dark:text-zinc-400">No customers match.</td></tr>
            ) : rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpen(r)}
                className="group cursor-pointer border-b border-gray-100 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/60"
              >
                <th scope="row" className="sticky left-0 bg-white dark:bg-zinc-900 group-hover:bg-gray-50 dark:group-hover:bg-zinc-800 text-left font-normal px-3 py-2 border-r border-gray-100 dark:border-zinc-800 max-w-[260px]">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(r); }} className="block text-left w-full">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 dark:text-white truncate">{r.name ?? '(no name)'}</span>
                      {belowMarriageAge(r.gender, r.age) && <Pill tone="red">Under {minimumAge(r.gender)}</Pill>}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-zinc-400 truncate">{r.email}</span>
                  </button>
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.label} className={`px-3 py-2 whitespace-nowrap text-gray-700 dark:text-zinc-300 ${c.right ? 'text-right tabular-nums' : ''}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pages */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-zinc-400">
        <span data-testid="customers-count">{total === 0 ? 'No customers' : `${from}–${to} of ${total.toLocaleString()}`}</span>
        <span className="flex gap-1.5">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">Previous</button>
          <button type="button" disabled={to >= total} onClick={() => setPage((p) => p + 1)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800">Next</button>
        </span>
      </div>

      {open && <MemberPanel member={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
};

// ============================================================================
// One member: everything, grouped, and what can be done
// ============================================================================

export default AdminCustomersTab;
