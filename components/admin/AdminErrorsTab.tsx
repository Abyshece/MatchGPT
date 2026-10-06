import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { useNow } from '../../lib/useNow';
import { fetchErrorReports, markErrorFixed, type ErrorReportRow } from '../../lib/adminService';

// ============================================================================
// AdminErrorsTab: what went wrong in the app and on the website
//
// Each error once (all the days it happened together), most recent first,
// with how often, where, on which version and device, and its stack.
// "Mark fixed" hides it until it happens again (lib/errorReports.ts sends
// them; nothing in them says who it happened to).
// ============================================================================

const PLATFORM: Record<string, string> = { web: 'Website', android: 'Android', ios: 'iPhone' };

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

const AdminErrorsTab: React.FC<{ onAuditUpdate: () => void }> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const now = useNow();
  const [errors, setErrors] = useState<ErrorReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFixed, setShowFixed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { errors: rows, error } = await fetchErrorReports(showFixed);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load the errors: ${error}`, 'error');
      return;
    }
    setErrors(rows);
  }, [showFixed, showToast]);

  useEffect(() => { load(); }, [load]);

  const fixed = async (row: ErrorReportRow) => {
    setBusy(row.id);
    const { error } = await markErrorFixed(row.id);
    setBusy(null);
    if (error) {
      showToast(`Couldn't mark it fixed: ${error}`, 'error');
      return;
    }
    showToast('Marked fixed. It comes back if it happens again.', 'success');
    onAuditUpdate();
    load();
  };

  return (
    <div data-testid="admin-errors">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
          Errors the app and the website reported, most recent first. They say where and on which device, never who:
          emails, phone numbers and ids are blanked out before they're sent.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} />
          Show the ones marked fixed
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      ) : errors.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400" data-testid="admin-errors-empty">
          No errors{showFixed ? '' : ' waiting'}. Nothing has gone wrong lately.
        </div>
      ) : (
        <ul className="space-y-2">
          {errors.map((e) => (
            <li key={e.id} className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4" data-testid="admin-error">
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                  aria-expanded={open === e.id}
                  className="min-w-0 text-left"
                >
                  <div className="font-mono text-sm text-gray-900 dark:text-white break-words">{e.message}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>{PLATFORM[e.platform] ?? e.platform}{e.app_version ? ` ${e.app_version}` : ''}</span>
                    {e.screen && <span>on {e.screen}</span>}
                    <span>{e.times === 1 ? 'once' : `${e.times} times`}{e.days > 1 ? ` over ${e.days} days` : ''}</span>
                    <span>last {ago(e.last_seen_at, now)}</span>
                    {e.fixed_at && <span className="text-green-700 dark:text-green-400">marked fixed</span>}
                  </div>
                </button>
                {!e.fixed_at && (
                  <button
                    onClick={() => fixed(e)}
                    disabled={busy === e.id}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {busy === e.id ? 'Saving…' : 'Mark fixed'}
                  </button>
                )}
              </div>
              {open === e.id && (
                <div className="mt-3 space-y-2">
                  {e.stack && (
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words bg-gray-50 dark:bg-zinc-900 text-gray-700 dark:text-gray-300 rounded p-3 max-h-72 overflow-auto">{e.stack}</pre>
                  )}
                  {e.user_agent && <p className="text-xs text-gray-500 dark:text-gray-400 break-words">{e.user_agent}</p>}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    First seen {new Date(e.first_seen_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminErrorsTab;
