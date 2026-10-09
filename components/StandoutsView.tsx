import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { loadStandouts, refreshStandouts } from '../lib/standoutsService';
import MatchCard from './MatchCard';
import ProfileModal from './ProfileModal';
import UpgradeModal from './UpgradeModal';
import MatchCelebrationModal from './MatchCelebrationModal';
import { IconStar, IconZap, IconClock } from '../constants';
import type { MatchCandidate } from '../types';
import { firstCelebration } from '../lib/matchCelebration';

// ============================================================================
// StandoutsView
//
// 5 curated daily picks. The server chooses them the first time the user
// opens this tab each day and keeps them in the `standouts` table; later
// visits the same day show the same picks.
//
// Day rolls over at 00:00 UTC.
// ============================================================================

interface StandoutsViewProps {
  onNavigateToMatches?: (matchId: string) => void;
}

const StandoutsView: React.FC<StandoutsViewProps> = ({ onNavigateToMatches }) => {
  const { profile, session, hasPro } = useAuth();
  const { showToast } = useToast();

  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  // Today's picks were chosen and have all been liked since (when none are left)
  const [allLiked, setAllLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [matchCelebration, setMatchCelebration] = useState<{ matchId: string; candidate: MatchCandidate } | null>(null);

  const userId = session?.user.id;
  const fetchStandouts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { candidates, computed, error } = await loadStandouts();
    setLoading(false);
    if (error) {
      showToast(`Couldn't load standouts: ${error}`, 'error');
      return;
    }
    setCandidates(candidates);
    setAllLiked(candidates.length === 0 && !computed);
  }, [userId, showToast]);

  useEffect(() => { fetchStandouts(); }, [fetchStandouts]);

  if (!profile || !session?.user.id) {
    return <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  const isPro = hasPro;

  // Hours until standouts refresh (midnight UTC)
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const hoursUntilRefresh = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));

  const handleMatched = (matchId: string, candidate: MatchCandidate) => {
    setSelectedCandidate(null);
    if (firstCelebration(matchId)) setMatchCelebration({ matchId, candidate });
  };

  // Liked: the pick leaves today's list (the server leaves it out from now on)
  const dropPick = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    setAllLiked(true);  // shown only once none are left
  };

  const handleManualRefresh = async () => {
    if (!isPro) {
      setShowUpgradeModal(true);
      return;
    }
    setRefreshing(true);
    const { candidates, error } = await refreshStandouts();
    setRefreshing(false);
    if (error) {
      showToast(`Couldn't refresh: ${error}`, 'error');
      return;
    }
    setCandidates(candidates);
    setAllLiked(false);
    showToast('Standouts refreshed', 'success');
  };

  return (
    // No scroll anchoring: a liked pick's place is taken by the next one
    <div className="h-full overflow-y-auto [overflow-anchor:none]">
      <div className="max-w-6xl mx-auto py-8 px-6 lg:px-12">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-1 flex items-center gap-2">
              <span className="text-yellow-500"><IconStar /></span> Daily Standouts
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hand-picked profiles based on what matters most to you. Refreshes every 24 hours.
            </p>
          </div>
        </div>

        {/* Refresh / countdown pill */}
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700">
            <IconClock /> Next refresh in {hoursUntilRefresh}h
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50 ${
              isPro
                ? 'plus-soft text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700'
                : 'bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-zinc-700'
            }`}
          >
            {refreshing ? (
              <>
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Refreshing…
              </>
            ) : (
              <><IconZap /> Refresh now {!isPro && '(Pro)'}</>
            )}
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800">
            <div className="mb-4 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-12 [&>svg]:h-12" aria-hidden="true"><IconStar /></div>
            {allLiked ? (
              <>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">You've liked all of today's picks</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  New Standouts come tomorrow. The people you liked are in Search History → Liked profiles.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No standouts yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  Complete more of your profile to get high-quality daily picks. We curate these based on your preferences.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Featured top pick */}
            <div className="mb-6 relative">
              <div className="absolute -top-2 left-4 z-10 plus-solid text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
                <IconStar /> Top Pick of the Day
              </div>
              <div className="md:max-w-md mx-auto">
                <MatchCard
                  key={candidates[0].id}
                  candidate={candidates[0]}
                  onClick={() => setSelectedCandidate(candidates[0])}
                  onMatched={handleMatched}
                  onLiked={() => dropPick(candidates[0].id)}
                  onLimitReached={() => setShowUpgradeModal(true)}
                />
              </div>
            </div>

            {/* Remaining picks */}
            {candidates.length > 1 && (
              <>
                <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Also today</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {candidates.slice(1).map((c) => (
                    <MatchCard
                      key={c.id}
                      candidate={c}
                      onClick={() => setSelectedCandidate(c)}
                      onMatched={handleMatched}
                      onLiked={() => dropPick(c.id)}
                      onLimitReached={() => setShowUpgradeModal(true)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Footer note */}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-8">
              Standouts are scored across 70+ profile attributes and curated daily. Come back tomorrow for fresh picks.
            </p>
          </>
        )}
      </div>

      {/* Profile modal */}
      {selectedCandidate && (
        <ProfileModal
          candidate={selectedCandidate}
          isPro={isPro}
          onClose={() => setSelectedCandidate(null)}
          onUpgrade={() => { setSelectedCandidate(null); setShowUpgradeModal(true); }}
          onMatched={handleMatched}
          onLiked={dropPick}
        />
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <UpgradeModal
          reason="pro_feature"
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* Match celebration */}
      {matchCelebration && (
        <MatchCelebrationModal
          matchedWith={matchCelebration.candidate}
          matchId={matchCelebration.matchId}
          onClose={() => setMatchCelebration(null)}
          onChat={(matchId) => {
            setMatchCelebration(null);
            if (onNavigateToMatches) {
              onNavigateToMatches(matchId);
            }
          }}
        />
      )}
    </div>
  );
};

export default StandoutsView;
