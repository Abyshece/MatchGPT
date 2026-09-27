import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useAuth } from '../lib/AuthContext';
import Sidebar from './Sidebar';
import MatchCelebrationModal from './MatchCelebrationModal';
import { subscribeToNewMatches } from '../lib/chatService';
import { supabase } from '../lib/supabase';
import { IconMenu, IconEdit } from '../constants';
import type { MatchCandidate } from '../types';

// ============================================================================
// Dashboard (Phase 6 Batch 3 — code-splitting)
//
// All sub-views are now lazy-loaded. The initial bundle only contains:
//   - Sidebar, MatchCelebrationModal, AuthContext, supabase client
//
// Each tab loads its code chunk on first navigation. After that, the chunk
// is cached in the browser. Result: initial bundle drops from ~587KB to
// ~50-80KB; first paint is dramatically faster.
//
// React.lazy + Suspense handles the loading state. We show a small spinner
// during chunk fetch (usually <100ms on a warm cache, <1s cold).
// ============================================================================

// Lazy-load every sub-view. Vite produces a separate JS chunk per import().
const SearchView = lazy(() => import('./SearchView'));
const HistoryView = lazy(() => import('./HistoryView'));
const LikesView = lazy(() => import('./LikesView'));
const MatchesView = lazy(() => import('./MatchesView'));
const StandoutsView = lazy(() => import('./StandoutsView'));
const ProfileView = lazy(() => import('./ProfileView'));
const SettingsView = lazy(() => import('./SettingsView'));
const HelpCenter = lazy(() => import('./HelpCenter'));
const AdminView = lazy(() => import('./admin/AdminView'));

type Tab = 'search' | 'history' | 'likes' | 'matches' | 'standouts' | 'profile' | 'settings' | 'help' | 'admin';

interface DashboardProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  themeMode?: 'system' | 'light' | 'dark';
  onSetTheme?: (mode: 'system' | 'light' | 'dark') => void;
}

// Small inline spinner shown while a sub-view chunk loads
const TabLoader: React.FC = () => (
  <div className="flex items-center justify-center h-full">
    <div className="flex flex-col items-center gap-3">
      <div className="w-6 h-6 border-2 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
      <div className="text-xs text-gray-400">Loading…</div>
    </div>
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({ isDarkMode, onToggleDarkMode, themeMode, onSetTheme }) => {
  const { profile, session } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [pendingMatchOpenId, setPendingMatchOpenId] = useState<string | null>(null);
  const [matchCelebration, setMatchCelebration] = useState<{ matchId: string; candidate: MatchCandidate } | null>(null);
  // Bumping this forces SearchView to remount, clearing prompt + results.
  // Used by the pencil "new chat" icon in the topbar.
  const [searchResetKey, setSearchResetKey] = useState(0);

  // Global new-match subscription (works regardless of which tab is active)
  useEffect(() => {
    if (!session?.user.id) return;
    const myId = session.user.id;

    const cleanup = subscribeToNewMatches(myId, async (event) => {
      const otherId = event.userAId === myId ? event.userBId : event.userAId;

      // Other people's rows aren't readable from `profiles` (own row only);
      // public_profiles is the safe, read-only subset.
      const { data: row } = await supabase
        .from('public_profiles')
        .select('id, name, age, location, photo_urls, hidden_fields, subscription_tier, is_verified')
        .eq('id', otherId)
        .single();

      if (!row) return;

      const candidate: MatchCandidate = {
        id: row.id,
        name: row.name ?? '',
        age: row.age ?? 0,
        location: row.location ?? '',
        compatibilityScore: 0,
        tags: [],
        bio: '',
        imageUrls: row.photo_urls ?? [],
        hiddenFields: row.hidden_fields ?? [],
        subscriptionTier: (row.subscription_tier as 'FREE' | 'PRO') ?? 'FREE',
        isPremium: row.subscription_tier === 'PRO',
        isVerified: row.is_verified ?? false,
      };

      setMatchCelebration({ matchId: event.matchId, candidate });
    });

    return cleanup;
  }, [session?.user.id]);

  const handleNavigateToMatches = useCallback((matchId: string) => {
    setPendingMatchOpenId(matchId);
    setActiveTab('matches');
    setIsMobileMenuOpen(false);
  }, []);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919]">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  const handleTabChange = (tab: Tab) => {
    if (tab !== 'matches') {
      setPendingMatchOpenId(null);
    }
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-white dark:bg-[#191919] overflow-hidden relative font-sans">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-white/50 backdrop-blur-[10px] z-[60] md:hidden animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar
        isOpen={isMobileMenuOpen}
        setIsOpen={setIsMobileMenuOpen}
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeTab={activeTab === 'help' ? 'settings' : activeTab}
        onTabChange={handleTabChange}
        isDarkMode={isDarkMode}
        onToggleDarkMode={onToggleDarkMode}
      />

      <main className="flex-1 flex flex-col h-full relative bg-white dark:bg-[#191919] min-w-0 overflow-hidden">
        <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 z-20 bg-white dark:bg-[#191919]">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors mr-2"
          >
            <IconMenu />
          </button>
          <div className="font-bold text-gray-700 dark:text-gray-100 text-lg flex-1">
            <span className="md:hidden">MatchGPT</span>
            <span className="hidden md:block capitalize">
              {activeTab === 'search' ? 'Find Match'
                : activeTab === 'profile' ? 'My Profile'
                : activeTab === 'history' ? 'Search History'
                : activeTab === 'likes' ? 'Likes You'
                : activeTab === 'matches' ? 'Matches'
                : activeTab === 'standouts' ? 'Standouts'
                : activeTab === 'help' ? 'Help Center'
                : activeTab === 'admin' ? 'Admin'
                : 'Settings'}
            </span>
          </div>
          {/* Pencil icon — only on the Find Match tab. Resets the search input
              and results to start a fresh "new chat" exactly like ChatGPT. */}
          {activeTab === 'search' && (
            <button
              onClick={() => setSearchResetKey((k) => k + 1)}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-2 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title="New search"
              aria-label="New search"
            >
              <IconEdit />
            </button>
          )}
        </div>

        <div className="flex-1 relative overflow-hidden">
          <Suspense fallback={<TabLoader />}>
            {activeTab === 'search' && <SearchView key={searchResetKey} onNavigateToMatches={handleNavigateToMatches} onNavigateToProfile={() => setActiveTab('profile')} />}
            {activeTab === 'history' && (
              <HistoryView
                onOpenInSearch={(saved) => {
                  // Stash both prompt + filters; SearchView reads them on mount
                  // and auto-runs the search (same channel used by landing flow).
                  sessionStorage.setItem('shaadigpt_pending_prompt', saved.prompt);
                  sessionStorage.setItem('shaadigpt_pending_filters', JSON.stringify(saved.filters));
                  // Bump the key to force a fresh SearchView mount so its useEffect fires
                  setSearchResetKey((k) => k + 1);
                  setActiveTab('search');
                }}
              />
            )}
            {activeTab === 'likes' && <LikesView />}
            {activeTab === 'matches' && <MatchesView initialMatchId={pendingMatchOpenId} />}
            {activeTab === 'standouts' && <StandoutsView onNavigateToMatches={handleNavigateToMatches} />}
            {activeTab === 'profile' && <ProfileView />}
            {activeTab === 'settings' && (
              <SettingsView
                isDarkMode={isDarkMode}
                onToggleDarkMode={onToggleDarkMode}
                themeMode={themeMode}
                onSetTheme={onSetTheme}
                onNavigate={(t: string) => setActiveTab(t as Tab)}
              />
            )}
            {activeTab === 'help' && <HelpCenter />}
            {activeTab === 'admin' && <AdminView />}
          </Suspense>
        </div>
      </main>

      {/* Global match celebration */}
      {matchCelebration && (
        <MatchCelebrationModal
          matchedWith={matchCelebration.candidate}
          matchId={matchCelebration.matchId}
          onClose={() => setMatchCelebration(null)}
          onChat={(matchId) => {
            setMatchCelebration(null);
            handleNavigateToMatches(matchId);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
