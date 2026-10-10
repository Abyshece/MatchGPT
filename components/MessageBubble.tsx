import React from 'react';
import DateProposalCard from './DateProposalCard';
import { IconAlert, IconCheck, IconUser } from '../constants';
import type { Message } from '../lib/chatService';
import { looksLikeMoneyAsk } from '../lib/scamWarning';

// ============================================================================
// MessageBubble
//
// Single message in a chat. Renders differently based on whether it's from
// the current user (right-aligned, dark) or the other party (left, light).
//
// Read receipts respect both parties' settings — caller passes `showReceipts`
// false if either side has them disabled.
//
// A message from the other person that asks for money or payment details gets
// a safety note under it, with Report (lib/scamWarning.ts).
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showReceipts: boolean;
  showAvatar: boolean;       // false when this message is from same sender as previous (less clutter)
  otherPhoto?: string;
  onAcceptDate?: (msgId: string) => void;
  onDeclineDate?: (msgId: string) => void;
  onReport?: () => void;
}

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message, isMine, showReceipts, showAvatar, otherPhoto,
  onAcceptDate, onDeclineDate, onReport,
}) => {
  const isDateProposal = message.messageType === 'date_proposal';

  // Date proposals get a special card layout
  if (isDateProposal) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-1`}>
        <div className="max-w-[85%] sm:max-w-[70%]">
          <DateProposalCard
            content={message.content}
            isMine={isMine}
            timestamp={message.createdAt}
            onAccept={onAcceptDate ? () => onAcceptDate(message.id) : undefined}
            onDecline={onDeclineDate ? () => onDeclineDate(message.id) : undefined}
          />
          {isMine && showReceipts && (
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 text-right pr-1 flex items-center justify-end gap-1">
              {message.readAt ? (
                <><span className="text-blue-500"><IconCheck className="w-3 h-3" /></span> Read</>
              ) : (
                <>Sent</>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 px-1 gap-2 items-end`}>
      {/* Other person's avatar (left side only, only on first message in cluster) */}
      {!isMine && (
        <div className="w-7 h-7 flex-shrink-0">
          {showAvatar && otherPhoto ? (
            <img src={otherPhoto} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : showAvatar ? (
            <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-500 flex items-center justify-center [&_svg]:w-4 [&_svg]:h-4"><IconUser /></div>
          ) : null}
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[65%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isMine
              ? 'bg-blue-500 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
          }`}
        >
          {message.content}
        </div>

        {!isMine && looksLikeMoneyAsk(message.content) && (
          <div role="note" data-testid="scam-warning"
            className="mt-1 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <span aria-hidden="true" className="flex-none mt-px [&>svg]:w-4 [&>svg]:h-4"><IconAlert /></span>
            <span className="min-w-0">
              Never send money or share bank, UPI or card details with someone you haven't met. Shaadi24 never asks for them.
              {onReport && (
                <> <button type="button" onClick={onReport} className="font-semibold underline underline-offset-2">Report</button></>
              )}
            </span>
          </div>
        )}

        {/* Timestamp + read receipt */}
        <div className={`text-[10px] mt-0.5 px-1 flex items-center gap-1 ${
          isMine ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'
        }`}>
          <span>{formatTime(message.createdAt)}</span>
          {isMine && showReceipts && (
            message.readAt ? (
              <span className="text-blue-500 flex items-center gap-0.5"><IconCheck className="w-3 h-3" /> Read</span>
            ) : (
              <span>Sent</span>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
