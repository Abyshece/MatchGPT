import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useIsAdmin } from '../lib/useIsAdmin';
import { listLikesReceived } from '../lib/likesService';
import { listMatches } from '../lib/matchesService';
import VerificationRequestModal from './VerificationRequestModal';
import UpgradeModal from './UpgradeModal';
import {
  IconSearch, IconHistory, IconHeart, IconMessageCircle, IconStar, IconUser,
  IconX, IconZap, IconLogOut, IconSettings, IconChevronLeft, IconChevronRight,
  IconShield, IconClock,
} from '../constants';

type Tab = 'search' | 'history' | 'likes' | 'matches' | 'standouts' | 'profile' | 'settings' | 'admin';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  activeTab: Tab;
  onTabChange: (tab: Tab | 'profile' | 'settings') => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

// One place in the sidebar: a button, marked as the page that's showing
const SidebarItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
}> = ({ icon, label, count, active, collapsed, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-current={active ? 'page' : undefined}
    aria-label={collapsed ? `${label}${count ? ` (${count})` : ''}` : undefined}
    className={`w-full text-left relative group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 mb-1
      ${active
        ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100'
        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-200'}
      ${collapsed ? 'justify-center' : ''}`}
    title={collapsed ? `${label}${count ? ` (${count})` : ''}` : undefined}
  >
    <span className="flex-shrink-0 relative">
      {icon}
      {/* Red pulse dot on the icon when collapsed (sidebar narrow mode) */}
      {collapsed && count !== undefined && count > 0 && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#191919] animate-pulse" />
      )}
    </span>
    {!collapsed && (
      <>
        <span className="text-sm font-medium truncate animate-fade-in flex-1">{label}</span>
        {/* Red badge with count when expanded */}
        {count !== undefined && count > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 animate-pulse">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </>
    )}
    {collapsed && (
      <span aria-hidden="true" className="absolute left-full ml-3 px-2 py-1 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
        {label}{count ? ` (${count})` : ''}
      </span>
    )}
  </button>
);

const Sidebar: React.FC<SidebarProps> = ({
  isOpen, setIsOpen, isCollapsed, toggleCollapse,
  activeTab, onTabChange,
}) => {
  const { profile, session, signOut } = useAuth();
  const tier = profile?.subscriptionTier || 'FREE';
  const isPro = tier === 'PRO';
  const isAdmin = useIsAdmin() === true;
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [unreadMatches, setUnreadMatches] = useState(0);

  // Poll for new likes + unread messages every 30s so the red dots stay current.
  // (Light polling is fine; chat realtime handles instant in-room updates.)
  const refreshCounters = useCallback(async () => {
    if (!session?.user.id) return;
    const [likesRes, matchesRes] = await Promise.all([
      listLikesReceived(session.user.id),
      listMatches(session.user.id),
    ]);
    if (!likesRes.error) setLikesCount(likesRes.likes.length);
    if (!matchesRes.error) {
      const unread = matchesRes.matches.reduce((sum, m) => sum + (m.unreadCount || 0), 0);
      setUnreadMatches(unread);
    }
  }, [session?.user.id]);

  useEffect(() => {
    refreshCounters();
    const id = setInterval(refreshCounters, 30000);
    return () => clearInterval(id);
  }, [refreshCounters]);

  // Also refresh when user switches into the likes/matches tabs (clears badge fast)
  useEffect(() => {
    if (activeTab === 'likes' || activeTab === 'matches') {
      // Slight delay so the view's own fetch (which marks read) runs first
      const id = setTimeout(refreshCounters, 1500);
      return () => clearTimeout(id);
    }
  }, [activeTab, refreshCounters]);

  const item = (id: Tab, label: string, icon: React.ReactNode, count?: number) => (
    <SidebarItem
      icon={icon}
      label={label}
      count={count}
      active={activeTab === id}
      collapsed={isCollapsed}
      onSelect={() => { onTabChange(id); setIsOpen(false); }}
    />
  );

  return (
    <aside
      className={`fixed md:relative z-[70] h-full bg-white dark:bg-[#191919] border-r border-gray-200 dark:border-zinc-800 flex flex-col transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'md:w-20' : 'md:w-60'}
        w-60`}
    >
      <div className={`relative flex items-center mb-6 pt-6 pb-2 ${isCollapsed ? 'justify-center px-3' : 'px-6'}`}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3 select-none w-full">
            <span className="flex-shrink-0 text-2xl">💍</span>
            <span className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">MatchGPT</span>
          </div>
        ) : (
          <div onClick={toggleCollapse} className="text-2xl cursor-pointer">💍</div>
        )}
        <button
          onClick={() => setIsOpen(false)}
          aria-label="Close menu"
          className="md:hidden absolute right-4 top-1/2 -translate-y-1/2 mt-1.5 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded"
        >
          <IconX />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto overflow-x-hidden">
        {item('search', 'Find Match', <IconSearch />)}
        {item('history', 'Chat History', <IconHistory />)}
        {item('likes', 'Likes You', <IconHeart />, likesCount)}
        {item('matches', 'Matches', <IconMessageCircle />, unreadMatches)}
        {item('standouts', 'Standouts', <IconStar />)}
        {item('profile', 'My Profile', <IconUser />)}
        {item('settings', 'Settings', <IconSettings />)}
        {isAdmin && (
          <>
            <div className="my-3 mx-3 border-t border-gray-200 dark:border-zinc-800" />
            {item('admin', 'Admin', <span className="text-base">🛡️</span>)}
          </>
        )}
      </nav>

      <div className="mt-auto pt-4 pb-4 px-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#191919]">
        <button
          onClick={toggleCollapse}
          className="hidden md:flex w-full items-center justify-center p-2 mb-4 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>

        {/* GET VERIFIED TODAY — only shown if user is not verified */}
        {profile && !profile.isVerified && (
          <div
            onClick={() => setShowVerifyModal(true)}
            className={`rounded-lg border transition-all duration-300 mb-3 overflow-hidden group cursor-pointer ${
              profile.verificationStatus === 'pending'
                ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/20'
                : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/20'
            } ${isCollapsed ? 'p-2 flex justify-center items-center' : 'px-3 py-3'}`}
            title={isCollapsed ? (profile.verificationStatus === 'pending' ? 'Verification pending' : 'Get verified') : undefined}
          >
            {!isCollapsed ? (
              <div className={`flex items-center gap-2 font-bold text-xs uppercase tracking-wide ${
                profile.verificationStatus === 'pending'
                  ? 'text-yellow-700 dark:text-yellow-400'
                  : 'text-green-700 dark:text-green-400'
              }`}>
                {profile.verificationStatus === 'pending' ? (
                  <><IconClock /> Verification pending</>
                ) : (
                  <><IconShield /> Get verified today</>
                )}
              </div>
            ) : (
              <div className={profile.verificationStatus === 'pending'
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-green-600 dark:text-green-400'
              }>
                {profile.verificationStatus === 'pending' ? <IconClock /> : <IconShield />}
              </div>
            )}
          </div>
        )}

        {/* MatchGPT+: free accounts get the upgrade; Pro accounts go to their subscription in Settings */}
        {profile && (
          <div
            onClick={() => (isPro ? onTabChange('settings') : setShowUpgradeModal(true))}
            className={`rounded-lg border cursor-pointer transition-all duration-300 mb-3 overflow-hidden group bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-blue-100 dark:border-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/20 ${
              isCollapsed ? 'p-2 flex justify-center items-center' : 'px-3 py-3'
            }`}
            title={isCollapsed ? (isPro ? 'MatchGPT+ active' : 'Get MatchGPT+') : undefined}
          >
            {!isCollapsed ? (
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">
                <IconZap /> {isPro ? 'MatchGPT+ active' : 'Get MatchGPT+'}
              </div>
            ) : (
              <div className="text-blue-600 dark:text-blue-400">
                <IconZap />
              </div>
            )}
          </div>
        )}

        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-2' : 'gap-3'} mt-2`}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{profile?.name || 'You'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{profile?.email || ''}</div>
            </div>
          )}
          <button
            onClick={signOut}
            className={`flex items-center justify-center rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${isCollapsed ? 'p-2 w-full' : 'p-2'}`}
            title="Sign out"
          >
            <IconLogOut />
          </button>
        </div>
      </div>

      {/* Opened from the boxes above (both render into <body>) */}
      {showVerifyModal && (
        <VerificationRequestModal onClose={() => setShowVerifyModal(false)} />
      )}
      {showUpgradeModal && (
        <UpgradeModal reason="pro_feature" onClose={() => setShowUpgradeModal(false)} />
      )}
    </aside>
  );
};

export default Sidebar;
