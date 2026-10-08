import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  CUSTOMER_FILTERS, CUSTOMER_SORTS, customersCsv, fetchCustomers, place, profilePercent, signInLabel, storeLabel,
  type CustomerFilter, type CustomerRow, type CustomerSort,
} from '../../lib/adminCustomers';
import { banUser, correctDateOfBirth, unbanUser, verifyUser } from '../../lib/adminService';
import { belowMarriageAge, minimumAge } from '../../lib/legalAge';
import { saveTextFile } from '../../lib/saveFile';
import { BanModal, DateOfBirthModal } from './MemberModals';

// ============================================================================
// Admin → Customers: every member, one row each with everything about them
// (lib/adminCustomers.ts). The name stays in view while the row scrolls
// sideways. Search, filters, sorting, 50 to a page, and every match as a CSV.
// A row opens the member: all of it grouped, and the actions (verify, ban or
// unban, correct the date of birth), each kept in the audit log.
// ============================================================================

const PAGE = 50;

const date = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));

const Pill: React.FC<{ tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue'; children: React.ReactNode }> = ({ tone = 'gray', children }) => (
  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${{
    gray: 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300',
    green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  }[tone]}`}>{children}</span>
);

const planPill = (r: CustomerRow) =>
  r.tier === 'PRO' ? <Pill tone="blue">Shaadi24+{r.plan ? ` · ${r.plan}` : ''}</Pill> : <Pill>Free</Pill>;

const verificationPill = (r: CustomerRow) =>
  r.verified ? <Pill tone="green">Verified</Pill>
    : r.verification === 'pending' ? <Pill tone="amber">Waiting</Pill>
      : r.verification === 'rejected' ? <Pill tone="red">Rejected</Pill> : <Pill>No</Pill>;

const profileCell = (r: CustomerRow) => (
  <span className="inline-flex items-center gap-2">
    <span className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
      <span className="block h-full bg-gray-900 dark:bg-white" style={{ width: `${profilePercent(r)}%` }} />
    </span>
    <span>{profilePercent(r)}% · {r.sections_done}/6</span>
  </span>
);

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

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-gray-500 dark:text-zinc-400">{label}</span>
    <span className="text-right text-gray-900 dark:text-zinc-100 min-w-0 break-words">{children}</span>
  </div>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-5">
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1">{title}</h3>
    <div className="divide-y divide-gray-100 dark:divide-zinc-800">{children}</div>
  </section>
);

const MemberPanel: React.FC<{ member: CustomerRow; onClose: () => void; onChanged: () => void }> = ({ member: m, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [banning, setBanning] = useState(false);
  const [dob, setDob] = useState(false);
  const who = m.name ?? m.email;
  const basics = { id: m.id, name: m.name, email: m.email, age: m.age, gender: m.gender, date_of_birth: m.date_of_birth };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !banning && !dob) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, banning, dob]);

  const act = async (run: () => Promise<{ error: string | null }>, done: string) => {
    setBusy(true);
    const { error } = await run();
    setBusy(false);
    if (error) {
      showToast(error, 'error');
      return false;
    }
    showToast(done, 'success');
    onChanged();
    return true;
  };

  return (
    <>
    <div className="fixed inset-0 z-[300] flex justify-end bg-black/20 dark:bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={who}
        data-testid="member-panel"
        className="h-full w-full max-w-md bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{who}</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{m.email}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">✕</button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {verificationPill(m)} {planPill(m)}
            {m.banned && <Pill tone="red">Banned</Pill>}
            {m.paused && <Pill>Paused</Pill>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {!m.verified && (
              <button type="button" disabled={busy} onClick={() => { if (confirm(`Mark ${who} as verified?`)) void act(() => verifyUser(m.id), `Verified ${who}`); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Verify</button>
            )}
            <button type="button" disabled={busy} onClick={() => setDob(true)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Date of birth</button>
            {m.banned ? (
              <button type="button" disabled={busy} onClick={() => { if (confirm(`Unban ${who}? They'll be able to use Shaadi24 again immediately.`)) void act(() => unbanUser(m.id), `Unbanned ${who}`); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Unban</button>
            ) : (
              <button type="button" disabled={busy} onClick={() => setBanning(true)} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">Ban</button>
            )}
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(m.id); showToast('Member ID copied', 'success'); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Copy ID</button>
          </div>
        </div>

        <div className="px-5 pb-8">
          {m.ban_reason && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Banned: “{m.ban_reason}”</p>}
          <Group title="About">
            <Field label="Gender">{dash(m.gender)}</Field>
            <Field label="Age">{m.age != null ? `${m.age} (born ${date(m.date_of_birth)})` : '—'}</Field>
            <Field label="Profile for">{dash(m.created_for)}</Field>
            <Field label="Marital status">{dash(m.marital_status)}</Field>
            <Field label="Height">{m.height_cm ? `${m.height_cm} cm` : '—'}</Field>
            <Field label="Location">{dash(place(m))}</Field>
            <Field label="Phone">{dash(m.phone)}</Field>
          </Group>
          <Group title="Background">
            <Field label="Religion">{dash(m.religion)}</Field>
            <Field label="Community">{dash(m.caste)}</Field>
            <Field label="Mother tongue">{dash(m.mother_tongue)}</Field>
            <Field label="Education">{dash(m.education)}</Field>
            <Field label="Occupation">{dash(m.occupation)}</Field>
            <Field label="Income">{dash(m.income)}</Field>
          </Group>
          <Group title="Account">
            <Field label="Joined">{date(m.joined)}</Field>
            <Field label="Last active">{ago(m.last_active)}</Field>
            <Field label="Sign-in">{signInLabel(m.sign_in)}{m.sign_in === 'email' ? (m.email_confirmed ? ' · confirmed' : ' · not confirmed') : ''}</Field>
            <Field label="Phones">{m.phones.length ? m.phones.join(', ') : '—'}</Field>
            <Field label="Plan">{m.tier === 'PRO' ? `Shaadi24+ ${m.plan ?? ''}${m.store ? ` · ${storeLabel(m.store)}` : ''}` : 'Free'}</Field>
            <Field label="Renews">{date(m.renews)}</Field>
            <Field label="Marketing emails">{m.marketing ? 'Yes' : 'No'}</Field>
          </Group>
          <Group title="Profile and activity">
            <Field label="Profile">{profileCell(m)}</Field>
            <Field label="Photos">{m.photos}</Field>
            <Field label="Likes sent / received">{m.likes_sent} / {m.likes_received}</Field>
            <Field label="Matches">{m.matches}</Field>
            <Field label="Messages sent">{m.messages}</Field>
            <Field label="Today">{m.searches_today} searches · {m.likes_today} likes</Field>
            <Field label="Reported / blocked by">{m.reports} / {m.blocked_by}</Field>
          </Group>
        </div>
      </aside>
    </div>

      {banning && (
        <BanModal
          user={basics}
          onCancel={() => setBanning(false)}
          onConfirm={async (reason) => { setBanning(false); await act(() => banUser(m.id, reason), `Banned ${who}`); }}
        />
      )}
      {dob && (
        <DateOfBirthModal
          user={basics}
          saving={busy}
          onCancel={() => setDob(false)}
          onConfirm={async (dateOfBirth, note) => {
            setBusy(true);
            const { error } = await correctDateOfBirth(m.id, dateOfBirth, note);
            setBusy(false);
            if (error) return error;
            setDob(false);
            showToast(`Date of birth corrected for ${who}`, 'success');
            onChanged();
            return null;
          }}
        />
      )}
    </>
  );
};

export default AdminCustomersTab;
