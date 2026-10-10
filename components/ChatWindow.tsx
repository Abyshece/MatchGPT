import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  listMessages, sendMessage, markRead, subscribeToMatch,
} from '../lib/chatService';
import { unmatch } from '../lib/matchesService';
import MessageBubble from './MessageBubble';
import BlockReportModal from './BlockReportModal';
import {
  IconChevronLeft, IconCheck, IconX, IconZap, IconFlag, IconBan, IconHeartOff, IconMore, IconUser, IconMessageCircle, IconCalendar, IconCoffee, IconUtensils, IconGlass, IconFootprints, IconFilm, IconPalette,
} from '../constants';
import { isNativeApp } from '../lib/nativeApp';
import { setOpenChat } from '../lib/nativePush';
import type { Message } from '../lib/chatService';
import type { MatchSummary } from '../lib/matchesService';

// ============================================================================
// ChatWindow
//
// The actual chat: header with other person's photo+name+menu, scrollable
// message thread, composer at bottom with Pro date-proposal button.
//
// Subscribes to Realtime for INSERT and UPDATE events on the messages table
// scoped to this match_id.
// ============================================================================

interface ChatWindowProps {
  match: MatchSummary;
  isPro: boolean;
  myReadReceipts: boolean;
  onBack: () => void;            // mobile only
  onUnmatched: () => void;
  onUpgrade: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  match, isPro, myReadReceipts, onBack, onUnmatched, onUpgrade,
}) => {
  const { session } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [composing, setComposing] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showBlockReport, setShowBlockReport] = useState<null | 'block' | 'report'>(null);
  const [showUnmatchConfirm, setShowUnmatchConfirm] = useState(false);
  const [showDateBuilder, setShowDateBuilder] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const userId = session?.user.id;
  const matchId = match.matchId;

  // A notification for this chat isn't shown while it's open (phone apps)
  useEffect(() => {
    setOpenChat(matchId);
    return () => setOpenChat(null);
  }, [matchId]);
  const otherPhoto = match.otherUser.photos?.[0];

  // ---- load messages on mount + when match changes ------------------------
  useEffect(() => {
    let mounted = true;
    if (!matchId || !userId) return;

    setLoading(true);
    listMessages(matchId).then(({ messages, error }) => {
      if (!mounted) return;
      if (error) {
        showToast(`Couldn't load chat: ${error}`, 'error');
        setLoading(false);
        return;
      }
      setMessages(messages);
      setLoading(false);
      // Mark messages as read on open — but ONLY if the user has read receipts
      // enabled. With receipts off, we leave read_at null so the sender never
      // sees "Read" on their side.
      if (myReadReceipts) {
        markRead(matchId);
      }
    });

    return () => { mounted = false; };
  }, [matchId, userId, showToast, myReadReceipts]);

  // ---- realtime subscription ----------------------------------------------
  useEffect(() => {
    if (!matchId || !userId) return;
    const cleanup = subscribeToMatch(
      matchId,
      (newMsg) => {
        setMessages((prev) => {
          // Avoid duplicates from optimistic-then-realtime races
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // If incoming message, mark read — only if receipts enabled
        if (newMsg.senderId !== userId && myReadReceipts) {
          markRead(matchId);
        }
      },
      (updatedMsg) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
        );
      }
    );
    return cleanup;
  }, [matchId, userId, myReadReceipts]);

  // ---- auto-scroll to bottom on new messages ------------------------------
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // ---- send a text message -------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!userId || !composing.trim() || sending) return;
    const content = composing.trim();
    setComposing('');
    setSending(true);

    const { message, error } = await sendMessage(matchId, userId, content, 'text');
    setSending(false);
    if (error || !message) {
      setComposing(content); // restore on error
      showToast(`Couldn't send: ${error}`, 'error');
      return;
    }
    // Optimistically add (realtime will dedupe)
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message];
    });
  }, [userId, composing, matchId, sending, showToast]);

  // ---- send a date proposal (Pro) -----------------------------------------
  const handleSendDateProposal = useCallback(async (payload: {
    activity: string; location: string; datetime: string; notes?: string;
  }) => {
    if (!userId) return;
    const content = JSON.stringify({ ...payload, status: 'pending' });
    setSending(true);
    const { message, error } = await sendMessage(matchId, userId, content, 'date_proposal');
    setSending(false);
    if (error || !message) {
      showToast(`Couldn't send proposal: ${error}`, 'error');
      return;
    }
    setMessages((prev) => prev.some((m) => m.id === message.id) ? prev : [...prev, message]);
    setShowDateBuilder(false);
    showToast('Date proposal sent', 'success');
  }, [userId, matchId, showToast]);

  // ---- accept / decline date proposal -------------------------------------
  const handleAcceptDate = async (msgId: string) => {
    const original = messages.find((m) => m.id === msgId);
    if (!original) return;
    let payload;
    try { payload = JSON.parse(original.content); } catch { return; }
    payload.status = 'accepted';
    // We can't mutate the existing message in DB without an extra schema field;
    // simpler: send a follow-up text message and update locally.
    const { error } = await sendMessage(matchId, userId!, `✅ Accepted: ${payload.activity}`, 'text');
    if (error) {
      showToast(`Couldn't accept: ${error}`, 'error');
      return;
    }
    showToast('Accepted!', 'success');
  };

  const handleDeclineDate = async (msgId: string) => {
    const original = messages.find((m) => m.id === msgId);
    if (!original) return;
    let payload;
    try { payload = JSON.parse(original.content); } catch { return; }
    const { error } = await sendMessage(matchId, userId!, `Sorry, ${payload.activity} doesn't work for me. Can we try another time?`, 'text');
    if (error) {
      showToast(`Couldn't decline: ${error}`, 'error');
      return;
    }
    showToast('Declined', 'info');
  };

  // ---- unmatch ------------------------------------------------------------
  const handleUnmatch = async () => {
    setShowUnmatchConfirm(false);
    const { error } = await unmatch(matchId);
    if (error) {
      showToast(`Couldn't unmatch: ${error}`, 'error');
      return;
    }
    showToast(`Unmatched ${match.otherUser.name}`, 'info');
    onUnmatched();
  };

  // ---- date proposal opener with paywall ----------------------------------
  const openDateBuilder = () => {
    if (!isPro) {
      onUpgrade();
      return;
    }
    setShowDateBuilder(true);
  };

  if (!userId) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#191919]">
      {/* Header */}
      <header className="flex items-center gap-3 p-3 border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to matches"
          className="md:hidden p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <IconChevronLeft />
        </button>

        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
          {otherPhoto ? (
            <img src={otherPhoto} alt={match.otherUser.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 [&_svg]:w-5 [&_svg]:h-5"><IconUser /></div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="font-bold text-gray-900 dark:text-white truncate">
              {match.otherUser.name}{match.otherUser.age ? `, ${match.otherUser.age}` : ''}
            </h3>
            {match.otherUser.isVerified && <span className="text-blue-500"><IconCheck className="w-3 h-3" /></span>}
            {match.otherUser.subscriptionTier === 'PRO' && <span className="text-gray-900 dark:text-white" title="Shaadi24+ member"><IconZap /></span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{match.otherUser.location}</p>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowOverflow((v) => !v)}
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={showOverflow}
            className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <span className="block w-5 h-5 [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true"><IconMore /></span>
          </button>
          {showOverflow && (
            <div
              className="absolute top-12 right-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden min-w-[180px] py-1 z-30"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { setShowOverflow(false); setShowBlockReport('report'); }}
                className="w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <span className="flex-none w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true"><IconFlag /></span> Report
              </button>
              <button
                onClick={() => { setShowOverflow(false); setShowUnmatchConfirm(true); }}
                className="w-full px-3 py-2 text-sm text-left text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center gap-2"
              >
                <span className="flex-none w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true"><IconHeartOff /></span> Unmatch
              </button>
              <button
                onClick={() => { setShowOverflow(false); setShowBlockReport('block'); }}
                className="w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              >
                <span className="flex-none w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true"><IconBan /></span> Block user
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50/50 dark:bg-[#0f0f0f]">
        {loading ? (
          <div className="space-y-2 max-w-md mx-auto py-8">
            <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-2xl w-1/2 animate-pulse" />
            <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-2xl w-2/3 ml-auto animate-pulse" />
            <div className="h-10 bg-gray-200 dark:bg-zinc-800 rounded-2xl w-3/5 animate-pulse" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 max-w-md mx-auto">
            <div className="mb-3 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-12 [&>svg]:h-12" aria-hidden="true"><IconMessageCircle /></div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
              You matched with {match.otherUser.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Say hello! Asking about something specific in their profile is a great way to start.
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showAvatar = !prev || prev.senderId !== m.senderId;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={m.senderId === userId}
                showReceipts={myReadReceipts}
                showAvatar={showAvatar}
                otherPhoto={otherPhoto}
                onAcceptDate={handleAcceptDate}
                onDeclineDate={handleDeclineDate}
                onReport={() => setShowBlockReport('report')}
              />
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <button
            onClick={openDateBuilder}
            disabled={sending}
            title={isPro ? 'Propose a date' : 'Propose a date (Shaadi24+)'}
            aria-label={isPro ? 'Propose a date' : 'Propose a date (Shaadi24+)'}
            className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full ${
              isPro
                ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/50'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400'
            }`}
          >
            <span aria-hidden="true" className="[&>svg]:w-5 [&>svg]:h-5"><IconCalendar /></span>
          </button>

          <textarea
            ref={composerRef}
            value={composing}
            onChange={(e) => setComposing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Message ${match.otherUser.name}…`}
            rows={1}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 border-0 rounded-2xl px-4 py-2.5 text-sm text-gray-900 dark:text-white resize-none outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !composing.trim()}
            aria-label="Send"
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-blue-500 text-white shadow-sm hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="text-lg leading-none" aria-hidden="true">→</span>
            )}
          </button>
        </div>
        {/* A keyboard hint; phones (and touch screens on the web) have no Shift+Enter */}
        {!isNativeApp() && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 text-center [@media(pointer:coarse)]:hidden">
            Press Enter to send, Shift+Enter for newline
          </p>
        )}
      </div>

      {/* Date proposal builder modal */}
      {showDateBuilder && (
        <DateProposalBuilder
          onSend={handleSendDateProposal}
          onClose={() => setShowDateBuilder(false)}
        />
      )}

      {/* Unmatch confirm */}
      {showUnmatchConfirm && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
          onClick={() => setShowUnmatchConfirm(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm p-6 border border-gray-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div aria-hidden="true" className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 [&>svg]:w-6 [&>svg]:h-6"><IconHeartOff /></div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Unmatch {match.otherUser.name}?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You both will no longer see this conversation. This can't be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowUnmatchConfirm(false)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUnmatch}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 shadow-sm"
              >
                Unmatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block / Report */}
      {showBlockReport && (
        <BlockReportModal
          mode={showBlockReport}
          targetId={match.otherUser.id}
          targetName={match.otherUser.name}
          onClose={() => setShowBlockReport(null)}
          onComplete={() => {
            setShowBlockReport(null);
            if (showBlockReport === 'block') {
              onUnmatched(); // blocking unmatches
            }
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// DateProposalBuilder — inline modal (kept in same file to keep batch small)
// ============================================================================

interface DateProposalBuilderProps {
  onSend: (payload: { activity: string; location: string; datetime: string; notes?: string }) => void;
  onClose: () => void;
}

const DATE_IDEAS: { label: string; icon: React.ReactNode }[] = [
  { label: 'Coffee', icon: <IconCoffee /> }, { label: 'Dinner', icon: <IconUtensils /> }, { label: 'Drinks', icon: <IconGlass /> },
  { label: 'Walk', icon: <IconFootprints /> }, { label: 'Movie', icon: <IconFilm /> }, { label: 'Activity', icon: <IconPalette /> },
];

const DateProposalBuilder: React.FC<DateProposalBuilderProps> = ({ onSend, onClose }) => {
  const [activity, setActivity] = useState('');
  const [location, setLocation] = useState('');
  const [datetimeLocal, setDatetimeLocal] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!activity.trim() || !location.trim() || !datetimeLocal) return;
    const datetime = new Date(datetimeLocal).toISOString();
    onSend({ activity: activity.trim(), location: location.trim(), datetime, notes: notes.trim() || undefined });
  };

  // default to tomorrow 7pm
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(19, 0, 0, 0);
  const defaultDate = tomorrow.toISOString().slice(0, 16);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><span aria-hidden="true" className="[&>svg]:w-5 [&>svg]:h-5"><IconCalendar /></span>Propose a date</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white">
            <IconX />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Activity</label>
            <input
              type="text"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g. Coffee at Blue Tokai"
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DATE_IDEAS.map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  onClick={() => setActivity(idea.label)}
                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 border border-pink-100 dark:border-pink-900/40 hover:bg-pink-100 dark:hover:bg-pink-900/30"
                >
                  <span aria-hidden="true" className="[&>svg]:w-3 [&>svg]:h-3">{idea.icon}</span>{idea.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Blue Tokai, Indiranagar"
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">When</label>
            <input
              type="datetime-local"
              value={datetimeLocal || defaultDate}
              onChange={(e) => setDatetimeLocal(e.target.value)}
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. They make great pour-over"
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500 resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-zinc-800 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!activity.trim() || !location.trim()}
            className="flex-1 py-2.5 bg-pink-500 text-white rounded-lg text-sm font-bold hover:bg-pink-600 shadow-sm disabled:opacity-50"
          >
            Send Proposal
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
