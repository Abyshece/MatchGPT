import React from 'react';
import DateProposalCard from './DateProposalCard';
import { IconAlert, IconCheck, IconPhone, IconUser } from '../constants';
import { formatPhone, type Message } from '../lib/chatService';
import { WARNING_TEXT, type ChatWarning } from '../lib/scamWarning';

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
//
// A number shared with "Share my number" is a card: Call, WhatsApp and Copy
// for the person it was shared with, with a safety line.
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showReceipts: boolean;
  showAvatar: boolean;       // false when this message is from same sender as previous (less clutter)
  otherPhoto?: string;
  otherName?: string;
  onAcceptDate?: (msgId: string) => void;
  onDeclineDate?: (msgId: string) => void;
  onReport?: () => void;
  warning?: ChatWarning | null;  // a note under the message (chatWarnings in lib/scamWarning.ts)
}

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message, isMine, showReceipts, showAvatar, otherPhoto, otherName,
  onAcceptDate, onDeclineDate, onReport, warning,
}) => {
  const isDateProposal = message.messageType === 'date_proposal';

  if (message.messageType === 'contact') {
    return <ContactCard message={message} isMine={isMine} showReceipts={showReceipts} otherName={otherName} onReport={onReport} />;
  }

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

        {!isMine && warning && (
          <div role="note" data-testid={warning === 'off_platform' ? 'off-platform-warning' : 'scam-warning'} data-kind={warning}
            className="mt-1 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <span aria-hidden="true" className="flex-none mt-px [&>svg]:w-4 [&>svg]:h-4"><IconAlert /></span>
            <span className="min-w-0">
              {WARNING_TEXT[warning]}
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

const ContactCard: React.FC<{
  message: Message; isMine: boolean; showReceipts: boolean; otherName?: string; onReport?: () => void;
}> = ({ message, isMine, showReceipts, otherName, onReport }) => {
  const [copied, setCopied] = React.useState(false);
  const phone = message.content;
  const digits = phone.replace(/\D/g, '');
  const copy = () => {
    void navigator.clipboard?.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, () => undefined);
  };
  const action = 'flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-zinc-800';
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3 px-1`}>
      <div className="max-w-[85%] sm:max-w-[70%] w-72 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3" data-testid="contact-card" data-mine={isMine}>
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <span aria-hidden="true" className="[&>svg]:w-3.5 [&>svg]:h-3.5"><IconPhone /></span>
          {isMine ? 'You shared your number' : `${otherName ?? 'They'} shared their number`}
        </p>
        <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white tabular-nums select-all" data-testid="contact-number">{formatPhone(phone)}</p>
        {!isMine && (
          <>
            <div className="mt-2 flex gap-2">
              <a href={`tel:${phone}`} className={action}>Call</a>
              <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className={action}>WhatsApp</a>
              <button type="button" onClick={copy} className={action}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              Never send money or share an OTP, whoever asks.
              {onReport && <> <button type="button" onClick={onReport} className="font-semibold underline underline-offset-2">Report</button></>}
            </p>
          </>
        )}
        <div className="text-[10px] mt-1 text-gray-500 dark:text-gray-400 flex items-center gap-1 justify-end">
          <span>{formatTime(message.createdAt)}</span>
          {isMine && showReceipts && (message.readAt ? <span className="text-blue-500 flex items-center gap-0.5"><IconCheck className="w-3 h-3" /> Read</span> : <span>Sent</span>)}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
