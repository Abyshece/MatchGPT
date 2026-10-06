import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { blockUser, reportUser, REPORT_REASONS } from '../lib/blocksService';
import type { ReportReason } from '../lib/blocksService';
import { IconX } from '../constants';

interface BlockReportModalProps {
  mode: 'block' | 'report';
  targetId: string;
  targetName: string;
  onClose: () => void;
  onComplete: () => void;
}

const BlockReportModal: React.FC<BlockReportModalProps> = ({
  mode, targetId, targetName, onClose, onComplete,
}) => {
  const { session } = useAuth();
  const { showToast } = useToast();

  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const handleBlock = async () => {
    if (!session?.user.id) return;
    setBusy(true);
    const { error } = await blockUser(session.user.id, targetId, details || undefined);
    setBusy(false);
    if (error) {
      showToast(`Couldn't block: ${error}`, 'error');
      return;
    }
    showToast(`Blocked ${targetName}`, 'success');
    onComplete();
  };

  const handleReport = async () => {
    if (!session?.user.id) return;
    setBusy(true);
    const { error } = await reportUser(session.user.id, targetId, reason, details || undefined);
    setBusy(false);
    if (error) {
      showToast(`Couldn't submit report: ${error}`, 'error');
      return;
    }
    showToast(`Report submitted. Thank you for keeping Shaadi24 safe.`, 'success');
    onComplete();
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <IconX />
        </button>

        <div className="p-6">
          <div className="text-center mb-5">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center text-2xl ${
              mode === 'block' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
            }`}>
              {mode === 'block' ? '🚫' : '🚩'}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {mode === 'block' ? `Block ${targetName}?` : `Report ${targetName}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {mode === 'block'
                ? 'They will no longer see your profile, and you won\'t see theirs. Any existing match will be ended.'
                : 'Please tell us what\'s wrong. Reports are reviewed by our team.'}
            </p>
          </div>

          {mode === 'report' && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Reason</label>
              <div className="space-y-1.5">
                {REPORT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      reason === r.value
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={(e) => setReason(e.target.value as ReportReason)}
                      className="text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
              {mode === 'block' ? 'Reason (optional)' : 'Details (optional)'}
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={mode === 'block' ? 'Why are you blocking this user?' : 'Tell us more about what happened.'}
              rows={3}
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={mode === 'block' ? handleBlock : handleReport}
              disabled={busy}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 ${
                mode === 'block'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
              }`}
            >
              {busy ? 'Submitting…' : mode === 'block' ? 'Block' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockReportModal;
