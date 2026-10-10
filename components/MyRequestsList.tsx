import React, { useEffect, useState } from 'react';
import { fetchMyRequests, type RequestRow, type RequestState } from '../lib/myRequests';
import VerificationRequestModal from './VerificationRequestModal';

// ============================================================================
// MyRequestsList (Settings → My requests): the member's verification requests,
// complaints and reports, newest first, with where each stands and the team's
// answer (lib/myRequests.ts). A verification that wasn't approved has Try again.
// ============================================================================

const PILL: Record<RequestState, string> = {
  waiting: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/40',
  done: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-900/40',
  declined: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40',
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const MyRequestsList: React.FC<{ onAddPhotos?: () => void; scrollTo?: boolean }> = ({ onAddPhotos, scrollTo }) => {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchMyRequests().then((r) => {
      if (!live) return;
      setRows(r.rows);
      setError(r.error);
    });
    return () => { live = false; };
  }, [reload]);

  // Opened from a message about a request: once the list is here (and the
  // sections above it have settled), scroll to it
  const loaded = rows !== null;
  useEffect(() => {
    if (!scrollTo || !loaded) return;
    const t = setTimeout(() => document.getElementById('my-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
    return () => clearTimeout(t);
  }, [scrollTo, loaded]);

  if (!rows) return <div className="h-16 rounded-lg bg-gray-100 dark:bg-zinc-800 animate-pulse" />;
  if (error) return <p className="text-sm text-red-600 dark:text-red-400 px-2">Couldn't load your requests. Please try again later.</p>;

  return (
    <div data-testid="my-requests">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 px-2 py-1">
          Nothing yet. When you ask for the Verified badge, make a complaint or report someone, it shows here, with our answer.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="py-3 px-2" data-testid="my-request" data-kind={r.kind} data-state={r.state}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{when(r.createdAt)}</p>
                </div>
                <span className={`flex-none text-[11px] font-semibold px-2 py-0.5 rounded-full border ${PILL[r.state]}`}>{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{r.detail}</p>
              {r.note && (
                <p className="mt-2 text-xs text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800/60 rounded-md px-3 py-2 whitespace-pre-wrap" data-testid="my-request-answer">
                  <span className="font-semibold">{r.kind === 'complaint' ? 'Our answer: ' : 'Note from our team: '}</span>{r.note}
                </p>
              )}
              {r.retry && (
                <button
                  type="button"
                  onClick={() => setVerifying(true)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:opacity-90"
                  data-testid="my-request-retry"
                >
                  Try again
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {verifying && (
        <VerificationRequestModal
          onClose={() => setVerifying(false)}
          onSubmitted={() => setReload((n) => n + 1)}
          onAddPhotos={onAddPhotos}
        />
      )}
    </div>
  );
};

export default MyRequestsList;
