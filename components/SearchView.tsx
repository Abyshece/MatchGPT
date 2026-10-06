import React, { useState, useCallback, useEffect, useRef, useMemo, Suspense } from 'react';
import { lazyScreen } from '../lib/lazyScreen';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { searchProfiles, SearchError } from '../lib/searchService';
import { saveSearch } from '../lib/searchHistoryService';
import { computeSearchAllowance, computeVerificationStatus } from '../lib/profileService';
import { profileCompletion } from '../lib/profileCompletion';
import MatchCard from './MatchCard';
import ProfileModal from './ProfileModal';
import VerificationBanner from './VerificationBanner';
import UpgradeModal from './UpgradeModal';
import MatchCelebrationModal from './MatchCelebrationModal';
import { IconX, IconCheck } from '../constants';
import type { MatchCandidate, FilterOptions } from '../types';
import { firstCelebration } from '../lib/matchCelebration';

// The filter panel carries the long answer lists; it loads the first time it's opened
const FilterPanel = lazyScreen(() => import('./FilterPanel'));

// ============================================================================
// SearchView (Phase 5 update)
//
// Adds match celebration modal handling — when a like causes a mutual match,
// the celebration appears.
// ============================================================================

interface SearchViewProps {
  onNavigateToMatches?: (matchId: string) => void;
  onNavigateToProfile?: () => void;
}

const DEFAULT_FILTERS: FilterOptions = {
  isOnline: false,
  isVerified: false,
  isPremium: false,
};

const EXAMPLE_PROMPTS = [
  'Find a match near me',
  'Marathi-speaking engineer in Pune',
  'Never married, vegetarian, under 30',
  'Show me all online matches',
  'Find coffee lovers',
  'Find an ambitious introvert',
  'Most compatible matches',
];

function countActiveFilters(f: FilterOptions): number {
  let n = 0;
  if (f.ageRange && (f.ageRange[0] !== 21 || f.ageRange[1] !== 45)) n++;
  if (f.neighborhood) n++;
  if (f.religion) n++;
  if (f.educationLevel) n++;
  if (f.datingIntention) n++;
  if (f.familyPlans) n++;
  if (f.children) n++;
  if (f.drinking) n++;
  if (f.smoking) n++;
  if (f.politics) n++;
  if (f.motherTongue) n++;
  if (f.caste) n++;
  if (f.maritalStatus) n++;
  if (f.manglik) n++;
  if (f.dietaryPreferences) n++;
  if (f.country) n++;
  if (f.state) n++;
  if (f.heightRange) n++;
  if (f.ethnicity) n++;
  if (f.isVerified) n++;
  if (f.isPremium) n++;
  if (f.hasInstagram) n++;
  if (f.hasLinkedin) n++;
  return n;
}

// The profile sections that each add a free search a day (lib/profileRewards.ts)
const MAX_SECTIONS = 6;

const SearchView: React.FC<SearchViewProps> = ({ onNavigateToMatches, onNavigateToProfile }) => {
  const { profile, profileRow, session, refreshProfile, hasPro } = useAuth();
  const { showToast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [results, setResults] = useState<MatchCandidate[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  // What the server understood from the prompt, shown above the results
  const [understood, setUnderstood] = useState<{ labels: string[]; byAi: boolean } | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<MatchCandidate | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterPanelLoaded, setFilterPanelLoaded] = useState(false);
  useEffect(() => { if (showFilterPanel) setFilterPanelLoaded(true); }, [showFilterPanel]);
  const [matchCelebration, setMatchCelebration] = useState<{ matchId: string; candidate: MatchCandidate } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Track whether we've already consumed the pending prompt this session so we
  // don't re-trigger on every re-render of SearchView.
  const pendingPromptConsumed = useRef(false);

  // Ref-based handle so the useEffect below can call into handleSearch without
  // creating a stale-closure problem (handleSearch is recreated on every render
  // due to useCallback deps, but the ref always points to the current one).
  const autoRunSearchRef = useRef<((p: string) => void) | null>(null);

  // On mount: if the user landed here via the landing-page flow OR clicked a
  // saved search in History, they have a prompt (and optionally filters)
  // stashed in sessionStorage. Read, pre-fill, and auto-run.
  useEffect(() => {
    if (pendingPromptConsumed.current) return;
    const pending = sessionStorage.getItem('shaadigpt_pending_prompt');
    const pendingFiltersRaw = sessionStorage.getItem('shaadigpt_pending_filters');
    if (pending && pending.trim()) {
      pendingPromptConsumed.current = true;
      sessionStorage.removeItem('shaadigpt_pending_prompt');
      sessionStorage.removeItem('shaadigpt_pending_filters');
      setPrompt(pending);
      if (pendingFiltersRaw) {
        try {
          const f = JSON.parse(pendingFiltersRaw) as FilterOptions;
          setFilters(f);
        } catch {
          // Corrupt JSON — fall back to defaults already in state
        }
      }
      setTimeout(() => {
        autoRunSearchRef.current?.(pending);
      }, 400);
    }
  }, []);

  // Every hook runs before the "Loading…" return below, on every render: React
  // requires the same hooks in the same order (the profile can arrive while
  // this screen is showing)
  const userId = session?.user.id;
  const allowance = profile ? computeSearchAllowance(profile) : null;
  const verification = profile ? computeVerificationStatus(profile) : null;
  const isLockedOut = verification?.isLockedOut ?? false;
  const searchAllowed = allowance?.allowed ?? false;
  const activeFilterCount = countActiveFilters(filters);

  // Profile completion percentage — the same figure as My Profile. Drives the
  // banner at top of dashboard.
  const { completionPercentage, estimatedMinutes } = useMemo(
    () => (profile ? profileCompletion(profile, profileRow?.photo_urls?.length ?? 0) : { completionPercentage: 0, estimatedMinutes: 0 }),
    [profile, profileRow],
  );

  const showCompletionBanner = !!profile && completionPercentage < 100 && !bannerDismissed;

  const handleSearch = useCallback(async (overridePrompt?: string) => {
    if (!userId) return;
    const effectivePrompt = (overridePrompt ?? prompt).trim();
    if (!effectivePrompt && activeFilterCount === 0) {
      showToast('Type a prompt or set some filters', 'info');
      return;
    }
    if (isLockedOut) {
      showToast('Verify your account to search', 'error');
      return;
    }
    if (!searchAllowed) {
      setShowUpgradeModal(true);
      return;
    }

    const hadSearched = hasSearched;
    setSearching(true);
    setHasSearched(true);

    try {
      // The server runs the search, leaves out people already liked and
      // counts it toward today's limit. Everyone gets the list of 50.
      const output = await searchProfiles(effectivePrompt, filters, 50);

      setResults(output.candidates);
      setUnderstood({ labels: output.understood, byAi: output.understoodBy === 'ai' });

      saveSearch(userId, effectivePrompt, filters, output.candidates, output.poolSize)
        .catch((e) => console.warn('[SearchView] saveSearch failed:', e));

      // Picks up the new search count
      await refreshProfile();

      if (output.candidates.length === 0) {
        showToast(`No matches found in pool of ${output.totalEligible}`, 'info');
      } else {
        showToast(`Found ${output.candidates.length} matches`, 'success');
      }
    } catch (e: unknown) {
      if (e instanceof SearchError && e.code === 'LIMIT_REACHED') {
        // Already used up (e.g. in another tab): back to how it was, plus the upgrade prompt
        setHasSearched(hadSearched);
        setShowUpgradeModal(true);
        await refreshProfile();
      } else {
        showToast(e instanceof Error ? e.message : 'Search failed', 'error');
      }
    } finally {
      setSearching(false);
    }
  }, [prompt, filters, userId, searchAllowed, isLockedOut, activeFilterCount, hasSearched, refreshProfile, showToast]);

  // Keep the ref pointed at the latest handleSearch so the mount-effect can call it
  useEffect(() => {
    autoRunSearchRef.current = handleSearch;
  }, [handleSearch]);

  if (!profile || !userId || !allowance || !verification) {
    return <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  const handleExampleClick = (ex: string) => setPrompt(ex);

  const handleMatched = (matchId: string, candidate: MatchCandidate) => {
    // Close any open profile modal first, then celebrate
    setSelectedCandidate(null);
    if (firstCelebration(matchId)) setMatchCelebration({ matchId, candidate });
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Profile completion banner — full-width, dismissible. Encourages users to
          finish their profile because a 100% profile leads to more accurate matches. */}
      {showCompletionBanner && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border-b border-rose-200 dark:border-rose-900/30 px-4 py-3 animate-fade-in">
          {/* One row on wider screens; on a phone the button goes under the text, in line with it */}
          <div className="max-w-6xl mx-auto flex items-start sm:items-center gap-3">
            <div className="mt-0.5 sm:mt-0 w-5 h-5 bg-rose-100 dark:bg-rose-800 text-rose-600 dark:text-rose-300 rounded-full flex items-center justify-center font-bold text-xs flex-none" aria-hidden="true">
              !
            </div>
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <p className="flex-1 min-w-0 text-sm text-rose-800 dark:text-rose-200 font-medium">
                Your profile is only <strong>{completionPercentage}%</strong> complete (~{estimatedMinutes} min to finish).
                {(profile?.searchBonus ?? 0) < MAX_SECTIONS
                  ? ' Each section you complete adds a free AI search a day.'
                  : ' A complete profile leads to more accurate matches.'}
              </p>
              <button
                onClick={() => {
                  if (onNavigateToProfile) onNavigateToProfile();
                }}
                className="self-start sm:self-auto flex-none text-xs bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 rounded-full font-bold transition-colors shadow-sm whitespace-nowrap"
              >
                Complete now →
              </button>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="flex-none -mr-1 p-1 text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 rounded-full transition-colors"
              aria-label="Dismiss banner"
            >
              <div className="transform scale-75"><IconX /></div>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto py-8 px-6 lg:px-12">
        {isLockedOut && <VerificationBanner verification={verification} />}

        {/* Search header — sparkle hero on landing, simple title once searched */}
        {!hasSearched ? (
          <div className="text-center mb-10 animate-fade-in">
            <div className="text-6xl mb-4">✨</div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
              Find your meaningful match
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Search by personality, interests, or vibe.
            </p>
          </div>
        ) : (
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Find your match</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Describe who you're looking for. Our algorithm scores every profile across 70+ attributes.
            </p>
          </div>
        )}

        {/* Quick filter suggestion pills — only shown post-search to refine results.
            Toggles common filters (Online, Verified, Has Instagram, Non-Smoker).
            Active ones disappear from this row and reappear as removable chips below the pill. */}
        {hasSearched && (
          <div className="flex flex-wrap justify-center gap-2 mb-3 animate-fade-in">
            {[
              { key: 'isOnline', label: 'Online Now', icon: <div className="w-2 h-2 bg-green-500 rounded-full" />, active: filters.isOnline },
              { key: 'isVerified', label: 'Verified Only', icon: <IconCheck className="w-3 h-3" />, active: filters.isVerified },
              { key: 'hasInstagram', label: 'Has Instagram', icon: <span>📷</span>, active: filters.hasInstagram },
              { key: 'hasLinkedin', label: 'Has LinkedIn', icon: <span>💼</span>, active: filters.hasLinkedin },
            ].filter((s) => !s.active).map((s) => (
              <button
                key={s.key}
                onClick={() => setFilters((prev) => ({ ...prev, [s.key]: true }))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md border border-gray-200 dark:border-zinc-700 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap active:scale-95"
              >
                <span className="opacity-70 flex items-center [&>svg]:w-3 [&>svg]:h-3">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Pill-shaped prompt input — filter button on left, textarea in middle, send on right.
            Inspired by the legacy Shaadi24 search bar with rounded-[32px] container and soft drop shadow. */}
        <div className={`
          w-full relative flex items-center gap-2 bg-white dark:bg-zinc-800 border rounded-[32px] p-1.5 mb-4 transition-all duration-300 ease-out
          ${hasSearched
            ? 'shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] border-gray-300 dark:border-zinc-600'
            : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)] border-gray-200 dark:border-zinc-700'
          }
          focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.12)]
        `}>
          {/* Filter button (inside pill, left) */}
          <button
            onClick={() => setShowFilterPanel(true)}
            className={`ml-1 w-9 h-9 flex-none flex items-center justify-center rounded-full transition-all relative ${
              activeFilterCount > 0
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-700'
            }`}
            title="Filters"
            aria-label="Open filters"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Textarea (its test id tells it apart from the welcome screen's box in the tests) */}
          <textarea
            data-testid="find-match-box"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch();
              }
            }}
            disabled={searching || isLockedOut}
            placeholder="Describe your ideal match…"
            rows={1}
            style={{ minHeight: '44px' }}
            className="w-full max-h-40 bg-transparent border-0 focus:ring-0 resize-none py-3 px-2 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:text-sm placeholder:font-normal focus:outline-none leading-relaxed text-sm overflow-hidden"
          />

          {/* Send button (inside pill, right) */}
          <button
            onClick={() => handleSearch()}
            disabled={(!prompt.trim() && activeFilterCount === 0) || searching || isLockedOut}
            className={`mr-1 w-9 h-9 flex-none flex items-center justify-center rounded-full transition-all duration-200 ${
              ((!prompt.trim() && activeFilterCount === 0) || searching || isLockedOut)
                ? 'bg-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 shadow-sm'
            }`}
            aria-label="Search"
            title="Search"
          >
            {searching ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white dark:border-black/30 dark:border-t-black rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        {/* Daily allowance: the day's free searches left (3, plus one for each
            profile section completed). Subtle until you're running low. */}
        <div className="flex items-center justify-center gap-3 mb-2 flex-wrap text-[11px]">
          <span className={`font-medium ${
            !allowance.allowed
              ? 'text-red-600 dark:text-red-400'
              : allowance.remaining === 1
                ? 'text-yellow-700 dark:text-yellow-400'
                : 'text-gray-500 dark:text-gray-400'
          }`}>
            {!allowance.allowed
              ? <>Daily limit reached · resets in {allowance.resetInHours}h</>
              : allowance.isPro
                ? <>Unlimited searches</>
                : <>{allowance.remaining} of {allowance.limit} searches remaining today</>}
          </span>
          {!allowance.isPro && allowance.bonus < MAX_SECTIONS && onNavigateToProfile && (
            <button
              type="button"
              onClick={onNavigateToProfile}
              data-testid="earn-searches"
              className="font-semibold text-amber-700 dark:text-amber-300 hover:underline"
            >
              Earn more: fill in your profile
            </button>
          )}
        </div>

        {/* Remove isPremium chip — Pro tier hidden during free period.
            Active filter chips below show only filters that exist. */}
        {hasSearched && activeFilterCount > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-6 animate-fade-in">
            {filters.isOnline && (
              <FilterChip label="Online" onRemove={() => setFilters((p) => ({ ...p, isOnline: false }))} />
            )}
            {filters.isVerified && (
              <FilterChip label="Verified" onRemove={() => setFilters((p) => ({ ...p, isVerified: false }))} />
            )}
            {filters.hasInstagram && (
              <FilterChip label="Has Instagram" onRemove={() => setFilters((p) => ({ ...p, hasInstagram: false }))} />
            )}
            {filters.hasLinkedin && (
              <FilterChip label="Has LinkedIn" onRemove={() => setFilters((p) => ({ ...p, hasLinkedin: false }))} />
            )}
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-red-500 hover:underline ml-1 self-center"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Trending Near You — landing state only */}
        {!hasSearched && (
          <div className="mt-8 mb-10 animate-fade-in">
            <p className="text-center text-[11px] uppercase font-bold text-gray-500 dark:text-gray-400 tracking-widest mb-4">
              Trending near you
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExampleClick(ex)}
                  className="px-5 py-2 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {hasSearched && (
          <div className="mt-8">
            {!searching && understood && understood.labels.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mb-6 animate-fade-in" data-testid="understood">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
                  {understood.byAi ? '✨ Understood by AI:' : 'Understood:'}
                </span>
                {understood.labels.map((label) => (
                  <span key={label} className="px-2.5 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-xs rounded-full font-medium">
                    {label}
                  </span>
                ))}
              </div>
            )}
            {searching ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No matches found</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  {activeFilterCount > 0
                    ? 'Try loosening your filters, or check that you\'ve completed enough of your profile to be matched.'
                    : 'Try a less specific prompt, or check that you\'ve completed enough of your profile to be matched.'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 mb-6">
                  <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <span className="text-lg">✨</span> Results for you
                  </h2>
                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 text-xs font-bold">
                    {results.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {results.map((c) => (
                    <MatchCard
                      key={c.id}
                      candidate={c}
                      onClick={() => setSelectedCandidate(c)}
                      onMatched={handleMatched}
                      onLimitReached={() => setShowUpgradeModal(true)}
                      onLiked={() => {
                        // Animate-out then remove from results array (Item 2)
                        setTimeout(() => {
                          setResults((prev) => prev.filter((r) => r.id !== c.id));
                        }, 700);
                      }}
                      onReject={(id) => {
                        // Same animate-out behavior for reject (Item 3)
                        setTimeout(() => {
                          setResults((prev) => prev.filter((r) => r.id !== id));
                        }, 700);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Profile modal */}
      {selectedCandidate && (
        <ProfileModal
          candidate={selectedCandidate}
          isPro={hasPro}
          onClose={() => setSelectedCandidate(null)}
          onUpgrade={() => { setSelectedCandidate(null); setShowUpgradeModal(true); }}
          onMatched={handleMatched}
        />
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <UpgradeModal
          reason={!allowance.allowed ? 'daily_limit' : 'pro_feature'}
          resetInHours={allowance.resetInHours}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* Filter panel */}
      {filterPanelLoaded && (
        <Suspense fallback={null}>
          <FilterPanel
            isOpen={showFilterPanel}
            initialFilters={filters}
            isPro={hasPro}
            onApply={(f) => setFilters(f)}
            onClose={() => setShowFilterPanel(false)}
            onUpgrade={() => { setShowFilterPanel(false); setShowUpgradeModal(true); }}
          />
        </Suspense>
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
            } else {
              showToast('Chat coming in Batch 3', 'info');
            }
          }}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// FilterChip — small removable pill rendered below the prompt input when an
// active filter is applied. Matches the legacy Shaadi24 design (green pill).
// ----------------------------------------------------------------------------
const FilterChip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <button
    onClick={onRemove}
    className="px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[11px] font-medium border border-green-100 dark:border-green-900/30 flex items-center gap-1 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors group"
    title="Remove filter"
  >
    {label}
    <span className="opacity-60 group-hover:opacity-100 text-[10px]">×</span>
  </button>
);

export default SearchView;
