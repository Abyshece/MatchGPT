import React from 'react';
import DateProposalCard from './DateProposalCard';
import { IconCheck } from '../constants';
import type { Message } from '../lib/chatService';

// ============================================================================
// MessageBubble
//
// Single message in a chat. Renders differently based on whether it's from
// the current user (right-aligned, dark) or the other party (left, light).
//
// Read receipts respect both parties' settings — caller passes `showReceipts`
// false if either side has them disabled.
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showReceipts: boolean;
  showAvatar: boolean;       // false when this message is from same sender as previous (less clutter)
  otherPhoto?: string;
  onAcceptDate?: (msgId: string) => void;
  onDeclineDate?: (msgId: string) => void;
}

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message, isMine, showReceipts, showAvatar, otherPhoto,
  onAcceptDate, onDeclineDate,
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
            <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-xs">👤</div>
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
