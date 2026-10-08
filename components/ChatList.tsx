import React from 'react';
import { IconCheck, IconZap } from '../constants';
import type { MatchSummary } from '../lib/matchesService';

// ============================================================================
// ChatList
//
// Sidebar within MatchesView showing every active match. Click one to open
// the chat. Shows last message preview, unread count, and active highlight.
// ============================================================================

interface ChatListProps {
  matches: MatchSummary[];
  selectedMatchId: string | null;
  onSelect: (matchId: string) => void;
  myUserId: string;
  loading: boolean;
}

const formatTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ChatList: React.FC<ChatListProps> = ({
  matches, selectedMatchId, onSelect, myUserId, loading,
}) => {
  if (loading) {
    return (
      <div className="space-y-1 p-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-2 rounded-lg animate-pulse">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-800 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-gray-200 dark:bg-zinc-800 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-3">💬</div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">No matches yet</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Start liking people from the Find Match tab. When you both like each other, the chat opens here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {matches.map((m) => {
        const isSelected = m.matchId === selectedMatchId;
        const photo = m.otherUser.photos?.[0];
        const lastMsg = m.lastMessage;

        // Preview text — handle date proposals specially
        let preview: string;
        let previewItalic = false;
        if (!lastMsg) {
          preview = '👋 Say hello!';
          previewItalic = true;
        } else if (lastMsg.content.startsWith('{') && lastMsg.content.includes('activity')) {
          // Likely a date proposal
          try {
            const p = JSON.parse(lastMsg.content);
            preview = `📅 ${p.activity ?? 'Date proposal'}`;
          } catch { preview = lastMsg.content; }
        } else {
          preview = lastMsg.content;
        }

        const isFromMe = lastMsg?.senderId === myUserId;
        if (isFromMe && lastMsg && !previewItalic) {
          preview = `You: ${preview}`;
        }

        return (
          <button
            key={m.matchId}
            onClick={() => onSelect(m.matchId)}
            className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 dark:border-zinc-800 transition-colors ${
              isSelected
                ? 'bg-blue-50 dark:bg-blue-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'
            }`}
          >
            <div className="relative w-12 h-12 flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                {photo ? (
                  <img src={photo} alt={m.otherUser.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg">👤</div>
                )}
              </div>
              {/* Pro badge mini */}
              {m.otherUser.subscriptionTier === 'PRO' && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full plus-solid border-2 border-white dark:border-zinc-900 flex items-center justify-center">
                  <IconZap />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h4 className="font-bold text-gray-900 dark:text-white truncate text-sm">
                  {m.otherUser.name}
                </h4>
                {m.otherUser.isVerified && (
                  <span className="text-blue-500 flex-shrink-0"><IconCheck className="w-3 h-3" /></span>
                )}
                <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-auto flex-shrink-0">
                  {formatTime(lastMsg?.createdAt ?? m.matchedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <p className={`text-xs truncate flex-1 ${
                  m.unreadCount > 0
                    ? 'font-bold text-gray-900 dark:text-gray-100'
                    : previewItalic
                      ? 'italic text-gray-500 dark:text-gray-400'
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {preview}
                </p>
                {m.unreadCount > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                    {m.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ChatList;
