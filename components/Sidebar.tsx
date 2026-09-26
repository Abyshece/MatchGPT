import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useIsAdmin } from '../lib/useIsAdmin';
import { listLikesReceived } from '../lib/likesService';
import { listMatches } from '../lib/matchesService';
import VerificationRequestModal from './VerificationRequestModal';
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

const Sidebar: React.FC<SidebarProps> = ({
  isOpen, setIsOpen, isCollapsed, toggleCollapse,
  activeTab, onTabChange,
}) => {
  const { profile, session, signOut } = useAuth();
  const tier = profile?.subscriptionTier || 'FREE';
  const isPro = tier === 'PRO';
  const isAdmin = useIsAdmin() === true;
  const [showVerifyModal, setShowVerifyModal] = useState(false);
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

  const SidebarItem = ({
    icon, label, id, count,
  }: { icon: React.ReactNode; label: string; id: Tab; count?: number }) => (
    <div
      onClick={() => { onTabChange(id); setIsOpen(false); }}
      className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 mb-1
        ${activeTab === id
          ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-100'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-200'}
        ${isCollapsed ? 'justify-center' : ''}`}
      title={isCollapsed ? `${label}${count ? ` (${count})` : ''}` : undefined}
    >
      <span className="flex-shrink-0 relative">
        {icon}
        {/* Red pulse dot on the icon when collapsed (sidebar narrow mode) */}
        {isCollapsed && count !== undefined && count > 0 && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-[#191919] animate-pulse" />
        )}
      </span>
      {!isCollapsed && (
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
      {isCollapsed && (
        <div className="absolute left-full ml-3 px-2 py-1 bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity shadow-lg">
          {label}{count ? ` (${count})` : ''}
        </div>
      )}
    </div>
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
            <span className="text-xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">ShaadiGPT</span>
          </div>
        ) : (
          <div onClick={toggleCollapse} className="text-2xl cursor-pointer">💍</div>
        )}
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden absolute right-4 top-1/2 -translate-y-1/2 mt-1.5 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded"
        >
          <IconX />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto overflow-x-hidden">
        <SidebarItem icon={<IconSearch />} label="Find Match" id="search" />
        <SidebarItem icon={<IconHistory />} label="Chat History" id="history" />
        <SidebarItem icon={<IconHeart />} label="Likes You" id="likes" count={likesCount} />
        <SidebarItem icon={<IconMessageCircle />} label="Matches" id="matches" count={unreadMatches} />
        <SidebarItem icon={<IconStar />} label="Standouts" id="standouts" />
        <SidebarItem icon={<IconUser />} label="My Profile" id="profile" />
        <SidebarItem icon={<IconSettings />} label="Settings" id="settings" />
        {isAdmin && (
          <>
            <div className={`my-3 mx-3 border-t border-gray-200 dark:border-zinc-800 ${isCollapsed ? '' : ''}`} />
            <SidebarItem
              icon={<span className="text-base">🛡️</span>}
              label="Admin"
              id="admin"
            />
          </>
        )}
      </nav>

      <div className="mt-auto pt-4 pb-4 px-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-[#191919]">
        <button
          onClick={toggleCollapse}
          className="hidden md:flex w-full items-center justify-center p-2 mb-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>

        {/* GET VERIFIED TODAY — only shown if user is not verified */}
        {profile && !profile.isVerified && (
          <div
            onClick={() => {
              if (profile.verificationStatus !== 'pending') setShowVerifyModal(true);
            }}
            className={`rounded-lg border transition-all duration-300 mb-3 overflow-hidden group ${
              profile.verificationStatus === 'pending'
                ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800 cursor-default'
                : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/20 cursor-pointer'
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

        {/* GET SHAADIGPT+ CTA — hidden while the product is free for everyone.
            (See PRO_FOR_ALL in profileService.ts.) Re-enable this block when
            paid Pro tier launches. */}

        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-2' : 'gap-3'} mt-2`}>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{profile?.name || 'You'}</div>
              <div className="text-xs text-gray-400 truncate">{profile?.email || ''}</div>
            </div>
          )}
          <button
            onClick={signOut}
            className={`flex items-center justify-center rounded-lg transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${isCollapsed ? 'p-2 w-full' : 'p-2'}`}
            title="Sign out"
          >
            <IconLogOut />
          </button>
        </div>
      </div>

      {/* Verification modal — opened from the GET VERIFIED TODAY box */}
      {showVerifyModal && (
        <VerificationRequestModal onClose={() => setShowVerifyModal(false)} />
      )}
    </aside>
  );
};

export default Sidebar;
