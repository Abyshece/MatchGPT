import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNow } from '../lib/useNow';
import { useToast } from '../lib/useToast';
import { loadHistory, deleteSearch, clearHistory } from '../lib/searchHistoryService';
import { useSearchAllowance } from '../lib/searchLimits';
import { listMyLikesDetailed, withdrawInterest, likeUser } from '../lib/likesService';
import MatchCard from './MatchCard';
import ProfileModal from './ProfileModal';
import UpgradeModal from './UpgradeModal';
import SavedSearchesList from './SavedSearchesList';
import { IconSearch, IconTrash, IconClock, IconHistory, IconHeart } from '../constants';
import type { SavedSearch } from '../lib/searchHistoryService';
import type { MyLikeEntry } from '../lib/likesService';
import type { MatchCandidate } from '../types';

// ============================================================================
// HistoryView
//
// Two tabs:
//   - Searches: the searches the member saved, with their daily alerts and
//     the new members found (SavedSearchesList), then past search prompts
//     the user can click to re-run
//   - Liked: every interest the user has sent, with Today/Week/All filter;
//     one that hasn't become a match can be withdrawn, and one nobody
//     answered in 14 days has expired and can be sent again
// ============================================================================

type HistoryTab = 'searches' | 'liked';
type TimeFilter = 'today' | 'week' | 'all';

interface HistoryViewProps {
  // Opens the Find Match tab and runs the saved search there
  onOpenInSearch: (saved: SavedSearch) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ onOpenInSearch }) => {
  const { profile, session, hasPro } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<HistoryTab>('searches');
  const [history, setHistory] = useState<SavedSearch[]>([]);
  const [liked, setLiked] = useState<MyLikeEntry[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<'search_limit' | 'pro_feature' | null>(null);
  const { allowance } = useSearchAllowance(session?.user.id, `${profile?.subscriptionTier}:${profile?.searchBonus}`);
  const now = useNow();

  const fetchHistory = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    const { searches, error } = await loadHistory(session.user.id);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load history: ${error}`, 'error');
      return;
    }
    setHistory(searches);
  }, [session?.user.id, showToast]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Fetch liked profiles when user opens the Liked tab (lazy)
  const fetchLiked = useCallback(async () => {
    if (!session?.user.id) return;
    setLikedLoading(true);
    const { entries, error } = await listMyLikesDetailed(session.user.id);
    setLikedLoading(false);
    if (error) {
      showToast(`Couldn't load likes: ${error}`, 'error');
      return;
    }
    setLiked(entries);
  }, [session?.user.id, showToast]);

  useEffect(() => {
    if (tab === 'liked') fetchLiked();
  }, [tab, fetchLiked]);

  // Apply time filter to liked entries
  const filteredLiked = useMemo(() => {
    if (timeFilter === 'all') return liked;
    const cutoff = timeFilter === 'today'
      ? now - 24 * 60 * 60 * 1000
      : now - 7 * 24 * 60 * 60 * 1000;
    return liked.filter((e) => new Date(e.likedAt).getTime() >= cutoff);
  }, [liked, timeFilter, now]);

  // Take back an interest that hasn't become a match
  const handleWithdraw = async (entry: MyLikeEntry) => {
    if (!window.confirm(`Withdraw your interest in ${entry.candidate.name}? They won't be told.`)) return;
    if (!session?.user.id) return;
    const out = await withdrawInterest(session.user.id, entry.candidate.id);
    if (!out.withdrawn) {
      if (out.reason === 'matched') {
        setLiked((prev) => prev.map((e) => (e.likeId === entry.likeId ? { ...e, matched: true } : e)));
        showToast(`You and ${entry.candidate.name} have already matched`, 'info');
      } else {
        showToast(`Couldn't withdraw${out.error ? `: ${out.error}` : ''}`, 'error');
      }
      return;
    }
    setLiked((prev) => prev.filter((e) => e.likeId !== entry.likeId));
    showToast(`Interest in ${entry.candidate.name} withdrawn`, 'success');
  };

  // An interest nobody answered in time: send another
  const handleSendAgain = async (entry: MyLikeEntry) => {
    if (!session?.user.id) return;
    const out = await likeUser(session.user.id, entry.candidate.id);
    if (!out.success) {
      showToast(out.error ?? "Couldn't send it", 'error');
      return;
    }
    setLiked((prev) => prev.map((e) => (e.likeId === entry.likeId
      ? { ...e, expired: false, matched: out.matched, likedAt: new Date().toISOString() } : e)));
    showToast(out.matched ? `It's a match with ${entry.candidate.name}!` : `Interest sent to ${entry.candidate.name} again`, 'success');
  };

  const handleRerun = useCallback((saved: SavedSearch) => {
    if (!profile) return;
    if (allowance && !allowance.allowed) {
      setUpgradeReason('search_limit');
      return;
    }
    onOpenInSearch(saved);
  }, [profile, allowance, onOpenInSearch]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this saved search?')) return;
    const { error } = await deleteSearch(id);
    if (error) {
      showToast(`Couldn't delete: ${error}`, 'error');
      return;
    }
    showToast('Deleted', 'success');
    setHistory((prev) => prev.filter((s) => s.id !== id));
  };

  const handleClearAll = async () => {
    if (!session?.user.id) return;
    if (!window.confirm(`Clear all ${history.length} saved searches? This can't be undone.`)) return;
    const { error } = await clearHistory(session.user.id);
    if (error) {
      showToast(`Couldn't clear: ${error}`, 'error');
      return;
    }
    showToast('History cleared', 'success');
    setHistory([]);
  };

  if (!profile) {
    return <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  const formatRelativeTime = (iso: string) => {
    const ms = now - new Date(iso).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };

  const filterSummary = (f: SavedSearch['filters']): string => {
    const parts: string[] = [];
    if (f.ageRange) parts.push(`age ${f.ageRange[0]}–${f.ageRange[1]}`);
    if (f.neighborhood) parts.push(`in ${f.neighborhood}`);
    if (f.religion) parts.push(f.religion);
    if (f.educationLevel) parts.push(f.educationLevel);
    if (f.datingIntention) parts.push(f.datingIntention);
    if (f.familyPlans) parts.push(f.familyPlans);
    if (f.isVerified) parts.push('verified only');
    if (f.isPremium) parts.push('Pro only');
    return parts.length === 0 ? 'No filters' : parts.join(' · ');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto py-8 px-6 lg:px-12">
        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-zinc-800" role="tablist" aria-label="Search History">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'searches'}
            onClick={() => setTab('searches')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'searches'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <IconHistory /> Searches
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'liked'}
            onClick={() => setTab('liked')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === 'liked'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <IconHeart /> Interests sent
          </button>
        </div>

        {tab === 'liked' ? (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-1">Interests you sent</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Everyone you've sent an interest to. You can withdraw one that hasn't become a match.{' '}
                  {liked.length === 0 ? '' : `${filteredLiked.length} of ${liked.length} shown.`}
                </p>
              </div>
              {liked.length > 0 && (
                <div className="inline-flex rounded-full bg-gray-100 dark:bg-zinc-800 p-1 text-xs font-bold">
                  {(['today', 'week', 'all'] as TimeFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTimeFilter(f)}
                      className={`px-3 py-1.5 rounded-full transition-colors capitalize ${
                        timeFilter === f
                          ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      {f === 'today' ? 'Today' : f === 'week' ? 'This week' : 'All time'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {likedLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : liked.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800">
                <div className="mb-4 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-12 [&>svg]:h-12" aria-hidden="true"><IconHeart /></div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No likes yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  Profiles you like will appear here. Start exploring from Find Match.
                </p>
              </div>
            ) : filteredLiked.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800">
                <div className="mb-4 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-12 [&>svg]:h-12" aria-hidden="true"><IconClock /></div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No likes in this window</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Try switching to "All time".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredLiked.map((entry) => (
                  <div key={entry.likeId} className="flex flex-col gap-2" data-testid="sent-interest">
                    <MatchCard
                      candidate={entry.candidate}
                      onClick={() => setSelectedCandidate(entry.candidate)}
                      showLikeButton={false}
                    />
                    {entry.matched ? (
                      <p className="text-xs font-semibold text-center text-green-700 dark:text-green-400 py-1.5">
                        Matched: say hello in Messages
                      </p>
                    ) : entry.expired ? (
                      <div className="text-center" data-testid="expired-interest">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">No reply in time: this interest has expired.</p>
                        <button
                          type="button"
                          onClick={() => handleSendAgain(entry)}
                          className="mt-1 w-full text-xs font-semibold py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800"
                        >
                          Send again
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleWithdraw(entry)}
                        data-testid="withdraw-interest"
                        className="text-xs font-semibold py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:text-red-600 hover:border-red-200 dark:hover:text-red-400 dark:hover:border-red-900/60 transition-colors"
                      >
                        Withdraw interest
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-1">Search History</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Re-run any past search with one click. Results will reflect your current candidate pool.
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <SavedSearchesList
          onRun={(prompt, filters) => handleRerun({ id: '', prompt, filters, resultIds: [], poolSize: 0, createdAt: '' })}
          onOpenProfile={setSelectedCandidate}
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800">
            <div className="text-5xl mb-4"><IconHistory /></div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No searches yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Run a search from the "Find Match" tab and it'll show up here.
            </p>
          </div>
        ) : (
          <>
            {/* History list */}
            <div className="space-y-2 mb-8">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600"
                  onClick={() => handleRerun(s)}
                >
                  <div className="w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                    <IconSearch />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {s.prompt || <span className="italic text-gray-500 dark:text-gray-400">(no prompt)</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1"><IconClock /> {formatRelativeTime(s.createdAt)}</span>
                      <span>·</span>
                      <span>{s.resultIds.length} matches found</span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline truncate">{filterSummary(s.filters)}</span>
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete this search"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
          </>
        )}
      </div>

      {selectedCandidate && (
        <ProfileModal
          candidate={selectedCandidate}
          isPro={hasPro}
          onClose={() => setSelectedCandidate(null)}
          onUpgrade={() => { setSelectedCandidate(null); setUpgradeReason('pro_feature'); }}
        />
      )}

      {upgradeReason && (
        <UpgradeModal
          reason={upgradeReason}
          limit={allowance}
          onClose={() => setUpgradeReason(null)}
        />
      )}
    </div>
  );
};

export default HistoryView;
