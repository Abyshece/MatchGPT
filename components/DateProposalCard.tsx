import React from 'react';
import { IconCheck, IconX } from '../constants';

// ============================================================================
// DateProposalCard
//
// Pro-only structured date proposal. Stored as a regular `messages` row
// with message_type='date_proposal' and content being a JSON-encoded
// payload: { activity, location, datetime, notes? }
//
// Falls back to plain text if parsing fails.
// ============================================================================

interface DateProposalCardProps {
  content: string;     // JSON-encoded payload
  isMine: boolean;
  timestamp: string;
  onAccept?: () => void;
  onDecline?: () => void;
}

interface DateProposalPayload {
  activity: string;
  location: string;
  datetime: string;     // ISO string
  notes?: string;
  status?: 'pending' | 'accepted' | 'declined';
}

const DateProposalCard: React.FC<DateProposalCardProps> = ({
  content, isMine, onAccept, onDecline,
}) => {
  let payload: DateProposalPayload | null = null;
  try {
    payload = JSON.parse(content) as DateProposalPayload;
  } catch {
    // fallback rendering below
  }

  if (!payload || !payload.activity) {
    return (
      <div className={`px-3.5 py-2 rounded-2xl text-sm border ${
        isMine
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800 rounded-br-md'
          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800 rounded-bl-md'
      }`}>
        <div className="font-bold text-xs uppercase tracking-wider mb-1">📅 Date proposal</div>
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    );
  }

  const dt = new Date(payload.datetime);
  const dateStr = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const status = payload.status ?? 'pending';

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${
      status === 'accepted'
        ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
        : status === 'declined'
          ? 'border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-800'
          : 'border-pink-300 bg-gradient-to-br from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 dark:border-pink-700'
    }`}>
      <div className="p-4">
        <div className="text-[10px] uppercase font-bold tracking-widest text-pink-600 dark:text-pink-400 mb-2 flex items-center gap-1.5">
          📅 Date Proposal
          {status === 'accepted' && <span className="text-green-600 dark:text-green-400">· Accepted</span>}
          {status === 'declined' && <span className="text-gray-400">· Declined</span>}
        </div>

        <h4 className="font-bold text-gray-900 dark:text-white text-base mb-2">{payload.activity}</h4>

        <div className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-base">📍</span>
            <span>{payload.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base">🗓️</span>
            <span>{dateStr} at {timeStr}</span>
          </div>
          {payload.notes && (
            <div className="flex items-start gap-2 pt-1">
              <span className="text-base mt-0.5">💭</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 italic">{payload.notes}</span>
            </div>
          )}
        </div>

        {/* Action buttons — only show on incoming pending proposals */}
        {!isMine && status === 'pending' && onAccept && onDecline && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={onDecline}
              className="flex-1 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-800 flex items-center justify-center gap-1"
            >
              <IconX /> Decline
            </button>
            <button
              onClick={onAccept}
              className="flex-1 py-2 bg-pink-500 text-white rounded-lg text-xs font-bold hover:bg-pink-600 shadow-sm flex items-center justify-center gap-1"
            >
              <IconCheck className="w-4 h-4" /> Accept
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DateProposalCard;
