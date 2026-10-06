import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../lib/useToast';
import {
  fetchReports, updateReport, banUser,
} from '../../lib/adminService';
import type { ReportRow } from '../../lib/adminService';

// ============================================================================
// AdminReportsTab
//
// List of pending reports with three actions per row:
//   1. Dismiss — close the report, no action taken (e.g. invalid report)
//   2. Resolve — close the report, action taken
//   3. Ban reported user — bans + auto-resolves report
// ============================================================================

interface AdminReportsTabProps {
  onAuditUpdate: () => void;
}

const AdminReportsTab: React.FC<AdminReportsTabProps> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    report: ReportRow;
    action: 'dismiss' | 'resolve' | 'ban';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { reports, error } = await fetchReports(filter);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load: ${error}`, 'error');
      return;
    }
    setReports(reports);
  }, [filter, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (notes: string) => {
    if (!actionModal) return;
    const { report, action } = actionModal;
    setActioningId(report.id);

    let error: string | null = null;

    if (action === 'ban') {
      // First ban the user
      const banResult = await banUser(report.reported_id, notes || `Banned via report ${report.id}: ${report.reason}`);
      if (banResult.error) {
        setActioningId(null);
        showToast(`Couldn't ban: ${banResult.error}`, 'error');
        return;
      }
      // Then resolve the report
      const updateResult = await updateReport(report.id, 'resolved', `User banned. ${notes}`);
      error = updateResult.error;
    } else if (action === 'dismiss') {
      const result = await updateReport(report.id, 'dismissed', notes);
      error = result.error;
    } else if (action === 'resolve') {
      const result = await updateReport(report.id, 'resolved', notes);
      error = result.error;
    }

    setActioningId(null);
    setActionModal(null);

    if (error) {
      showToast(`Couldn't update: ${error}`, 'error');
      return;
    }

    showToast(`Report ${action === 'ban' ? 'resolved (user banned)' : action + 'd'}`, 'success');
    onAuditUpdate();
    load();
  };

  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
            filter === 'pending'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700'
          }`}
        >
          Pending only
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
            filter === 'all'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700'
          }`}
        >
          All reports
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-zinc-800 rounded-lg p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700">
          <div className="text-4xl mb-2">✨</div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">No {filter === 'pending' ? 'pending ' : ''}reports</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Either everyone's playing nice, or you've caught up. Nice work.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-gray-200 dark:border-zinc-700">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                      r.status === 'pending'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                        : r.status === 'resolved'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    <span className="font-bold">{r.reporter_name ?? r.reporter_email ?? 'Anonymous'}</span>
                    <span className="text-gray-500 dark:text-gray-400"> reported </span>
                    <span className="font-bold">{r.reported_name ?? r.reported_email ?? 'a user'}</span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    <span className="font-bold uppercase tracking-wider">{r.reason}</span>
                    {r.details && <span className="ml-2 italic">"{r.details}"</span>}
                  </div>
                  {r.admin_notes && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 italic bg-gray-50 dark:bg-zinc-900/50 px-2 py-1 rounded">
                      Admin notes: {r.admin_notes}
                    </div>
                  )}
                </div>
              </div>

              {r.status === 'pending' && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => setActionModal({ report: r, action: 'dismiss' })}
                    disabled={actioningId === r.id}
                    className="px-3 py-1.5 text-xs font-bold border border-gray-300 dark:border-zinc-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => setActionModal({ report: r, action: 'resolve' })}
                    disabled={actioningId === r.id}
                    className="px-3 py-1.5 text-xs font-bold border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                  >
                    Mark resolved
                  </button>
                  <button
                    onClick={() => setActionModal({ report: r, action: 'ban' })}
                    disabled={actioningId === r.id}
                    className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded hover:bg-red-700 shadow-sm disabled:opacity-50"
                  >
                    🚫 Ban user
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action confirmation modal */}
      {actionModal && (
        <ActionModal
          report={actionModal.report}
          action={actionModal.action}
          onCancel={() => setActionModal(null)}
          onConfirm={handleAction}
        />
      )}
    </div>
  );
};

// ============================================================================
// ActionModal — confirmation dialog with optional notes
// ============================================================================

const ActionModal: React.FC<{
  report: ReportRow;
  action: 'dismiss' | 'resolve' | 'ban';
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}> = ({ report, action, onCancel, onConfirm }) => {
  const [notes, setNotes] = useState('');

  const title = action === 'ban' ? `Ban ${report.reported_name ?? 'user'}?` :
                action === 'resolve' ? 'Mark report as resolved?' :
                'Dismiss this report?';

  const description = action === 'ban' ?
    'The user will be banned and unable to use MatchGPT. Their profile will be hidden from search. They can be unbanned later via the Users tab.' :
    action === 'resolve' ? 'Use this when you took action without banning (e.g. warning sent, content removed).' :
    'Use this if the report is invalid or no action is warranted.';

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>

        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
          {action === 'ban' ? 'Ban reason' : 'Notes (optional)'}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={action === 'ban' ? 'Why are you banning this user?' : 'Optional notes for the audit log'}
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={action === 'ban' && !notes.trim()}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 ${
              action === 'ban' ? 'bg-red-600 hover:bg-red-700' :
              action === 'resolve' ? 'bg-green-600 hover:bg-green-700' :
              'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            {action === 'ban' ? 'Ban user' :
             action === 'resolve' ? 'Mark resolved' :
             'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminReportsTab;
