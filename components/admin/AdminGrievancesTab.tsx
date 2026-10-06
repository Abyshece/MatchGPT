import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/useToast';
import { useNow } from '../../lib/useNow';
import type { Tables } from '../../lib/database.types';
import { GRIEVANCE_CATEGORIES } from '../../lib/grievances';

// ============================================================================
// AdminGrievancesTab: complaints to the Grievance Officer (GrievancesView's
// form; submit_grievance() in the database), the most urgent first, each with
// the deadline the law sets: 2 hours for intimate images and impersonation,
// 36 hours for unlawful content, a month for payments, 7 days for the rest.
// Answer by email, then record what was done here (the audit log keeps it).
// ============================================================================

type Grievance = Tables<'grievances'>;

const label = (category: string) => GRIEVANCE_CATEGORIES.find((c) => c.value === category)?.label ?? category;

function dueIn(dueAt: string, now: number): { text: string; overdue: boolean } {
  const minutes = Math.round((Date.parse(dueAt) - now) / 60_000);
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs}m` : abs < 48 * 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${Math.floor(abs / 1440)}d`;
  return minutes < 0 ? { text: `${span} overdue`, overdue: true } : { text: `due in ${span}`, overdue: false };
}

const AdminGrievancesTab: React.FC<{ onAuditUpdate: () => void }> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const now = useNow();
  const [rows, setRows] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_grievances', { p_open_only: !showClosed });
    setLoading(false);
    if (error) {
      showToast(`Couldn't load the complaints: ${error.message}`, 'error');
      return;
    }
    setRows((data ?? []) as Grievance[]);
  }, [showClosed, showToast]);

  useEffect(() => { load(); }, [load]);

  const update = async (g: Grievance, status: 'in_progress' | 'resolved' | 'rejected') => {
    if ((status === 'resolved' || status === 'rejected') && !note.trim()) {
      showToast('Write what was done (it goes in the record).', 'error');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('admin_update_grievance', { p_id: g.id, p_status: status, p_resolution: note.trim() || undefined });
    setBusy(false);
    if (error) {
      showToast(`Couldn't save: ${error.message}`, 'error');
      return;
    }
    showToast(status === 'in_progress' ? 'Marked in progress.' : `${g.ticket} closed.`, 'success');
    setNote('');
    setOpen(null);
    onAuditUpdate();
    load();
  };

  return (
    <div className="space-y-4" data-testid="admin-grievances">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-xl">
          Complaints to the Grievance Officer, the most urgent first. Answer each by email, then record here what was done.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="w-4 h-4" />
          Show closed ones
        </label>
      </div>

      {loading ? (
        <div className="h-24 rounded-xl bg-gray-50 dark:bg-zinc-800/50 animate-pulse" aria-hidden="true" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 p-10 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">📮</div>
          <p className="font-semibold text-gray-900 dark:text-white">No open complaints</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">All caught up.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((g) => {
            const closed = g.status === 'resolved' || g.status === 'rejected';
            const due = dueIn(g.due_at, now);
            return (
              <li key={g.id} data-testid="admin-grievance" className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <button type="button" onClick={() => { setOpen(open === g.id ? null : g.id); setNote(''); }}
                  className="w-full flex items-start justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">{g.ticket} · {label(g.category)}</span>
                    <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400 break-words">
                      {g.name} · {g.email}{g.on_behalf ? ' · for someone else' : ''} · {new Date(g.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </span>
                  </span>
                  <span className={`flex-none text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                    closed ? 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                      : due.overdue ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'}`}>
                    {closed ? g.status : due.text}
                  </span>
                </button>
                {open === g.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-3 text-sm">
                    {g.about && <p className="text-gray-700 dark:text-gray-300"><strong>About:</strong> {g.about}</p>}
                    <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{g.details}</p>
                    {g.phone && <p className="text-gray-600 dark:text-gray-400">Phone: {g.phone}</p>}
                    {g.resolution && <p className="text-gray-700 dark:text-gray-300"><strong>Done:</strong> {g.resolution}</p>}
                    {!closed && (
                      <>
                        <label htmlFor={`note-${g.id}`} className="block text-xs font-bold text-gray-600 dark:text-gray-300">What was done (kept in the record; tell the complainant by email too)</label>
                        <textarea id={`note-${g.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white" />
                        <div className="flex flex-wrap justify-end gap-2">
                          {g.status === 'open' && (
                            <button type="button" disabled={busy} onClick={() => update(g, 'in_progress')}
                              className="px-3 py-1.5 text-xs font-bold rounded border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-200">In progress</button>
                          )}
                          <button type="button" disabled={busy} onClick={() => update(g, 'rejected')}
                            className="px-3 py-1.5 text-xs font-bold rounded border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-200">Close: no action</button>
                          <button type="button" disabled={busy} onClick={() => update(g, 'resolved')}
                            className="px-3 py-1.5 text-xs font-bold rounded bg-green-600 hover:bg-green-700 text-white">Resolved</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AdminGrievancesTab;
