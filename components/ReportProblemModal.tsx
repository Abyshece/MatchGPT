import React, { useState } from 'react';
import { reportProblem } from '../lib/problemReports';
import { IconX } from '../constants';

// ============================================================================
// ReportProblemModal (Settings → Support → Report a problem): what went wrong,
// in the member's words. The screen, the app's version and the kind of device
// go with it, so the team can find it (lib/problemReports.ts).
// ============================================================================

const ReportProblemModal: React.FC<{ onClose: () => void; onSent: () => void }> = ({ onClose, onSent }) => {
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (details.trim().length < 10) {
      setError('Please tell us a little more (at least 10 characters).');
      return;
    }
    setSending(true);
    const { error: sendError } = await reportProblem(details);
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center sm:p-4 popup-backdrop animate-fade-in" onClick={onClose}>
      <form
        onSubmit={send}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-problem-title"
        data-testid="report-problem-modal"
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="report-problem-title" className="text-lg font-bold text-gray-900 dark:text-white">Report a problem</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              What went wrong, and what were you trying to do? We'll answer in Settings → My requests.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">
            <IconX />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>
        )}

        <label htmlFor="problem-details" className="sr-only">What went wrong</label>
        <textarea
          id="problem-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="For example: I tapped Send on a message and nothing happened."
          data-testid="report-problem-details"
          className="mt-4 w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-zinc-800"
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Sent with the screen you were on, the app's version and the kind of phone or browser. Please don't include
          passwords or bank details.
        </p>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending}
            data-testid="report-problem-send"
            className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReportProblemModal;
