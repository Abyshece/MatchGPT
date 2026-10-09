import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { listMatches } from '../lib/matchesService';
import { subscribeToNewMatches } from '../lib/chatService';
import { supabase } from '../lib/supabase';
import ChatList from './ChatList';
import ChatWindow from './ChatWindow';
import UpgradeModal from './UpgradeModal';
import { BACK, useBackHandler } from '../lib/nativeApp';
import type { MatchSummary } from '../lib/matchesService';
import { IconMessageCircle } from '../constants';

// ============================================================================
// MatchesView
//
// Two-pane layout: left is ChatList of all matches, right is the active
// ChatWindow. On mobile, it stacks — the list shows by default and selecting
// a match swaps to the chat view.
//
// Auto-refreshes the match list when:
//   - A new match is created (realtime via subscribeToNewMatches)
//   - A new message arrives in any match (we re-fetch to update last message + unread)
// ============================================================================

interface MatchesViewProps {
  initialMatchId?: string | null;   // Deep-link: open a specific match on mount
}

const MatchesView: React.FC<MatchesViewProps> = ({ initialMatchId }) => {
  const { profile, settings, session, hasPro } = useAuth();
  const { showToast } = useToast();

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(initialMatchId ?? null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const userId = session?.user.id;

  const fetchMatches = useCallback(async () => {
    if (!userId) return;
    const { matches, error } = await listMatches(userId);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load matches: ${error}`, 'error');
      return;
    }
    setMatches(matches);
    // Auto-select first match if nothing's selected and we have matches (desktop only)
    if (matches.length > 0 && !selectedMatchId && initialMatchId === undefined) {
      // we don't auto-select — user picks
    }
  }, [userId, showToast, selectedMatchId, initialMatchId]);

  // Initial load
  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  // Apply deep-link if it arrives async after the initial render
  useEffect(() => {
    if (initialMatchId) setSelectedMatchId(initialMatchId);
  }, [initialMatchId]);

  // Realtime: refresh on new match
  useEffect(() => {
    if (!userId) return;
    const cleanup = subscribeToNewMatches(userId, () => {
      // Just re-fetch — simpler than splicing in
      fetchMatches();
    });
    return cleanup;
  }, [userId, fetchMatches]);

  // Realtime: also subscribe to all messages involving me to update last-message previews
  // We do this by listening at the match level via per-match subscriptions, but for the
  // *list* view we just refetch every 20s lightweight fallback. Real per-match realtime
  // happens inside ChatWindow.
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      // Lightweight refresh to keep last-message + unread counts current
      fetchMatches();
    }, 20000);
    return () => clearInterval(interval);
  }, [userId, fetchMatches]);

  // Also: subscribe to global INSERT on `messages` to refresh more responsively
  useEffect(() => {
    if (!userId) return;
    // Unique channel name — static names break when this effect re-runs because
    // the underlying channel is already joined and .on() can't be called again.
    const channelName = `global_messages_for_list:${userId}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          // We don't have an easy filter for "my matches" at the realtime layer,
          // so we just re-fetch. This is cheap (one RPC call).
          fetchMatches();
        }
      )
      .subscribe();

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [userId, fetchMatches]);

  // Android back button in a chat: back to the list of matches
  useBackHandler(BACK.PAGE, () => {
    if (!selectedMatchId) return false;
    setSelectedMatchId(null);
    return true;
  });

  if (!profile || !settings || !userId) {
    return <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  const isPro = hasPro;
  const myReadReceipts = settings.readReceipts;

  const selectedMatch = matches.find((m) => m.matchId === selectedMatchId) ?? null;

  const handleUnmatched = () => {
    // The match was unmatched — clear selection and refresh
    setSelectedMatchId(null);
    fetchMatches();
  };

  return (
    <div className="h-full flex bg-white dark:bg-[#191919]">
      {/* LEFT — chat list (always visible on desktop, hidden when chat selected on mobile) */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col ${
        selectedMatchId ? 'hidden md:flex' : 'flex'
      }`}>
        <div className="flex-none p-4 border-b border-gray-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Matches</h2>
          {!loading && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {matches.length === 0
                ? 'Like profiles to start matching'
                : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatList
            matches={matches}
            selectedMatchId={selectedMatchId}
            onSelect={setSelectedMatchId}
            myUserId={userId}
            loading={loading}
          />
        </div>
      </div>

      {/* RIGHT — chat window (or empty state) */}
      <div className={`flex-1 flex flex-col ${selectedMatchId ? 'flex' : 'hidden md:flex'}`}>
        {selectedMatch ? (
          <ChatWindow
            match={selectedMatch}
            isPro={isPro}
            myReadReceipts={myReadReceipts}
            onBack={() => setSelectedMatchId(null)}
            onUnmatched={handleUnmatched}
            onUpgrade={() => setShowUpgradeModal(true)}
          />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50/50 dark:bg-[#0f0f0f]">
            <div className="text-center max-w-sm px-6">
              <div className="mb-4 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-14 [&>svg]:h-14" aria-hidden="true"><IconMessageCircle /></div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {matches.length === 0 ? 'No matches yet' : 'Select a match to start chatting'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {matches.length === 0
                  ? 'Head to Find Match and start liking profiles. When two people like each other, you\'ll see the conversation here.'
                  : 'Pick a conversation from the left.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade modal for Pro features */}
      {showUpgradeModal && (
        <UpgradeModal
          reason="pro_feature"
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
};

export default MatchesView;
