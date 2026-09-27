import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { listLikesReceived } from '../lib/likesService';
import { isProEffective } from '../lib/profileService';
import LikedYouCard from './LikedYouCard';
import ProfileModal from './ProfileModal';
import UpgradeModal from './UpgradeModal';
import MatchCelebrationModal from './MatchCelebrationModal';
import { IconZap } from '../constants';
import type { LikeReceived } from '../lib/likesService';
import type { MatchCandidate } from '../types';

// ============================================================================
// LikesView — restyled to match the legacy MatchGPT design (see Item 1):
//   - "Likes You (N)" header with sort dropdown on the right (Pro only)
//   - Cream/yellow gradient upsell banner with circular ⚡ icon and black
//     "Upgrade to Pro" pill button (Free users only)
//   - Free users see heavily blurred cards with yellow circular ⚡ icon and
//     white "UPGRADE TO SEE" pill centered — handled inside LikedYouCard.
//   - Grid is 4 columns on xl viewports to match Item 3.
// ============================================================================

type SortOption = 'Recent' | 'Last Active' | 'Nearby';

const LikesView: React.FC = () => {
  const { profile, session } = useAuth();
  const { showToast } = useToast();

  const [likes, setLikes] = useState<LikeReceived[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [matchCelebration, setMatchCelebration] = useState<{ matchId: string; candidate: MatchCandidate } | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('Recent');

  const fetchLikes = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    const { likes, error } = await listLikesReceived(session.user.id);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load likes: ${error}`, 'error');
      return;
    }
    setLikes(likes);
  }, [session?.user.id, showToast]);

  useEffect(() => { fetchLikes(); }, [fetchLikes]);

  if (!profile) {
    return <div className="p-12 text-center text-gray-400">Loading…</div>;
  }

  const isPro = isProEffective(profile);

  const handleMatched = (matchId: string, candidate: MatchCandidate) => {
    setSelectedCandidate(null);
    setMatchCelebration({ matchId, candidate });
    setTimeout(fetchLikes, 500);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto py-8 px-6 lg:px-12">
        <div className="flex justify-between items-center mb-8 border-b border-gray-100 dark:border-zinc-800 pb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Likes You {!loading && `(${likes.length})`}
          </h1>
          {isPro && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-200 border-none outline-none cursor-pointer focus:ring-0 hover:underline"
              >
                <option value="Recent" className="dark:bg-zinc-900">Recent</option>
                <option value="Last Active" className="dark:bg-zinc-900">Last Active</option>
                <option value="Nearby" className="dark:bg-zinc-900">Nearby</option>
              </select>
            </div>
          )}
        </div>

        {!isPro && !loading && likes.length > 0 && (
          <div className="mb-8 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-orange-100 dark:border-orange-900/30 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex-shrink-0 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                <IconZap />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">See who liked you</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Upgrade to MatchGPT Pro to reveal all {likes.length} {likes.length === 1 ? 'person' : 'people'} and sort them.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 whitespace-nowrap h-12 px-6 rounded-full font-bold shadow-md transition-colors"
            >
              Upgrade to Pro
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : likes.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800 border-dashed">
            <div className="text-5xl mb-4">💌</div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No likes yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Complete your profile and start liking others. The more active you are, the more visible you become.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {likes.map((like) => (
              <LikedYouCard
                key={like.likeId}
                like={like}
                isPro={isPro}
                onView={(c) => setSelectedCandidate(c)}
                onUpgrade={() => setShowUpgradeModal(true)}
                onMatched={handleMatched}
              />
            ))}
          </div>
        )}
      </div>

      {selectedCandidate && (
        <ProfileModal
          candidate={selectedCandidate}
          isPro={isPro}
          onClose={() => setSelectedCandidate(null)}
          onUpgrade={() => { setSelectedCandidate(null); setShowUpgradeModal(true); }}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal
          reason="pro_feature"
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {matchCelebration && (
        <MatchCelebrationModal
          matchedWith={matchCelebration.candidate}
          matchId={matchCelebration.matchId}
          onClose={() => setMatchCelebration(null)}
          onChat={() => {
            setMatchCelebration(null);
            showToast('Open Matches tab to chat', 'info');
          }}
        />
      )}
    </div>
  );
};

export default LikesView;
