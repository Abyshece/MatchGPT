import React, { useState } from 'react';
import { PageHeader, InfoSection, Button } from './NotionUI';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { updateSettings, setPauseStatus } from '../lib/profileService';
import { deleteAccount } from '../lib/deleteAccountService';
import PushNotifSetup from './PushNotifSetup';
import BlockedPeopleList from './BlockedPeopleList';
import SubscriptionSettings from './SubscriptionSettings';
import { getMySubscription, type Subscription } from '../lib/billingService';
import { manageStoreSubscription, storeManageHint, storePlatform } from '../lib/storePurchases';
import { downloadMyData } from '../lib/myDataService';
import { SUPPORT_EMAIL } from './helpTopics';
import {
  IconMoon, IconSun, IconUser, IconLogOut, IconChevronRight, IconTrash, IconX,
} from '../constants';
import type { UserSettings } from '../types';

interface SettingsViewProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  themeMode?: 'system' | 'light' | 'dark';        // current theme mode setting
  onSetTheme?: (mode: 'system' | 'light' | 'dark') => void;  // set + persist
  onNavigate?: (tab: string) => void;
}

const DELETE_REASONS = [
  'I met someone on MatchGPT',
  `I'm not happy with the matches`,
  'I need a break from dating',
  'Privacy concerns',
  'Other',
];

const SettingsView: React.FC<SettingsViewProps> = ({
  isDarkMode,
  onToggleDarkMode,
  themeMode = 'system',
  onSetTheme,
  onNavigate,
}) => {
  const { profile, profileRow, settings, session, signOut, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'REASON' | 'CONFIRM'>('REASON');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  // A subscription that would keep renewing: what deleting does to it
  const [renewing, setRenewing] = useState<Subscription | null>(null);
  const [downloading, setDownloading] = useState(false);

  if (!settings || !profile) {
    return <div className="p-12 text-center text-gray-400">Loading…</div>;
  }

  const updateOne = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!session?.user.id) return;
    const next = { ...settings, [key]: value };
    const result = await updateSettings(session.user.id, next);
    if (result.error) {
      showToast(`Couldn't save: ${result.error}`, 'error');
      return;
    }
    await refreshProfile();
  };

  const togglePause = async (paused: boolean) => {
    if (!session?.user.id) return;
    const { error } = await setPauseStatus(session.user.id, paused);
    if (error) {
      showToast(`Couldn't save: ${error}`, 'error');
      return;
    }
    showToast(paused ? 'Profile paused. You are hidden from search.' : 'Profile visible again.', 'success');
    await refreshProfile();
  };

  const handleDownloadData = async () => {
    setDownloading(true);
    try {
      if (await downloadMyData()) showToast('Your data is saved.', 'success');
    } catch (e) {
      showToast(`Couldn't download your data: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  // Terms and Privacy open as pages of their own (App.tsx follows the address)
  const openLegal = (page: 'terms' | 'privacy') => {
    window.location.hash = '';
    window.location.hash = page;
  };

  const handleDeleteClick = () => {
    setShowDeleteModal(true);
    setDeleteStep('REASON');
    setDeleteReason('');
    setDeleteConfirmationInput('');
    setRenewing(null);
    if (session?.user.id) {
      getMySubscription(session.user.id).then((s) => {
        const renews = !!s && ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(s.status)
          && !s.cancel_at_period_end && s.auto_renew !== false;
        setRenewing(renews ? s : null);
      }).catch(() => {});
    }
  };

  const handleFinalDelete = async () => {
    if (!session?.user.id) return;
    if (deleteConfirmationInput !== 'Delete') return;
    setDeleting(true);
    const result = await deleteAccount({
      reason: deleteReason || undefined,
      confirmation: 'Delete',
    });
    setDeleting(false);
    if (!result.success) {
      showToast(`Couldn't delete: ${result.error}`, 'error');
      return;
    }
    setShowDeleteModal(false);
    showToast(result.appStoreRenews
      ? `Account deleted. Your App Store subscription is still on: cancel it ${storeManageHint('app_store')}.`
      : 'Account deleted. Goodbye 👋', result.appStoreRenews ? 'info' : 'success');
    // AuthContext picks up the session-cleared state and redirects to Auth
  };

  const SettingsToggle = ({
    label, description, checked, onChange,
  }: { label: string; description?: string; checked: boolean; onChange: (val: boolean) => void }) => (
    <div
      className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/30 px-2 rounded transition-colors cursor-pointer"
      onClick={() => onChange(!checked)}
    >
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white">{label}</h4>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200 ${checked ? 'left-6' : 'left-1'}`} />
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="max-w-3xl mx-auto py-12 px-6 animate-fade-in">
        <PageHeader title="Settings & Preferences" />

        <div className="space-y-8">
          <InfoSection title="Account">
            <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-500">
                  <IconUser />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{profile.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{profile.email}</p>
                </div>
              </div>
              <Button variant="secondary" className="text-xs h-8" onClick={() => onNavigate?.('profile')}>Edit Profile</Button>
            </div>
          </InfoSection>

          <InfoSection title="MatchGPT+">
            <SubscriptionSettings />
          </InfoSection>

          <InfoSection title="Privacy & Visibility">
            <SettingsToggle
              label="Pause my profile"
              description="Hide me from search and Standouts. Your matches and chats keep working."
              checked={profileRow?.is_paused ?? false}
              onChange={togglePause}
            />
            <SettingsToggle label="Incognito Mode" description="Only show my profile to people I've liked." checked={settings.incognito} onChange={(v) => updateOne('incognito', v)} />
            <SettingsToggle label="Active Status" description="Show when you are online." checked={settings.showOnline} onChange={(v) => updateOne('showOnline', v)} />
            <SettingsToggle label="Read Receipts" description="Let matches know when you've read messages." checked={settings.readReceipts} onChange={(v) => updateOne('readReceipts', v)} />
            <button
              onClick={handleDownloadData}
              disabled={downloading}
              className="w-full flex items-center justify-between py-3 px-2 rounded text-left hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors disabled:opacity-60"
            >
              <span className="flex-1 pr-4">
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{downloading ? 'Preparing your data…' : 'Download my data'}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">A copy of everything MatchGPT holds about you, as a file.</span>
              </span>
              <IconChevronRight />
            </button>
          </InfoSection>

          <InfoSection title="Blocked people">
            {session && <BlockedPeopleList userId={session.user.id} />}
          </InfoSection>

          <InfoSection title="Notifications">
            <PushNotifSetup />
            <SettingsToggle
              label="Push Notifications enabled"
              description="Master switch. Disable to stop all push notifications across all your devices."
              checked={settings.pushNotifs}
              onChange={(v) => updateOne('pushNotifs', v)}
            />
          </InfoSection>

          <InfoSection title="Appearance">
            <div className="py-2 px-2">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                {isDarkMode ? <IconMoon /> : <IconSun />} Theme
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'dark', 'system'] as const).map((mode) => {
                  const isSelected = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => onSetTheme?.(mode) ?? onToggleDarkMode()}
                      className={`py-2.5 px-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                          : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg">
                          {mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '💻'}
                        </span>
                        <span>{mode}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 px-1">
                {themeMode === 'system' ? 'Follows your device setting.' : `Always ${themeMode}, on every device.`}
              </p>
            </div>
          </InfoSection>

          <InfoSection title="Support">
            <button
              onClick={() => onNavigate?.('help')}
              className="w-full flex items-center justify-between py-3 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded text-left"
            >
              <span>Help Center</span>
              <IconChevronRight />
            </button>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('MatchGPT help')}`}
              className="w-full flex items-center justify-between py-3 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded text-left"
            >
              <span>Contact support <span className="text-gray-400 dark:text-gray-500">· {SUPPORT_EMAIL}</span></span>
              <IconChevronRight />
            </a>
            <button
              onClick={() => openLegal('terms')}
              className="w-full flex items-center justify-between py-3 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded text-left"
            >
              <span>Terms of Service</span>
              <IconChevronRight />
            </button>
            <button
              onClick={() => openLegal('privacy')}
              className="w-full flex items-center justify-between py-3 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded text-left"
            >
              <span>Privacy Policy</span>
              <IconChevronRight />
            </button>
          </InfoSection>

          <div className="pt-8 border-t border-gray-100 dark:border-zinc-800 mt-8">
            <button
              onClick={signOut}
              className="w-full py-3 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 mb-4 flex items-center justify-center gap-2"
            >
              <IconLogOut /> Sign Out
            </button>
            <button
              onClick={handleDeleteClick}
              className="w-full py-3 text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
            >
              Delete Account
            </button>
            <p className="text-center text-[10px] text-gray-400 mt-2">MatchGPT • v{__APP_VERSION__}</p>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden p-6 border border-gray-200 dark:border-zinc-800 relative">
            <button onClick={() => setShowDeleteModal(false)} aria-label="Close" className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white"><IconX /></button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4"><IconTrash /></div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Account</h3>
            </div>

            {deleteStep === 'REASON' ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                  We're sorry to see you go. Please tell us why:
                </p>
                <div className="space-y-2">
                  {DELETE_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        deleteReason === reason
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50'
                          : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="deleteReason"
                        value={reason}
                        checked={deleteReason === reason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{reason}</span>
                    </label>
                  ))}
                </div>
                <div className="pt-4 flex gap-3">
                  <Button variant="ghost" onClick={() => setShowDeleteModal(false)} className="flex-1 justify-center">Cancel</Button>
                  <Button
                    onClick={() => setDeleteStep('CONFIRM')}
                    disabled={!deleteReason}
                    className="flex-1 justify-center"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 rounded-lg text-sm text-red-800 dark:text-red-200">
                  <p className="font-bold mb-1">⚠ Warning: This action cannot be undone.</p>
                  <p className="text-xs leading-relaxed">
                    Your account, profile, photos, matches, messages, likes, and all other data will be permanently deleted.
                    Anyone who matched with you will lose access to your conversations.
                    You will need to sign up again from scratch if you want to use MatchGPT in the future.
                  </p>
                </div>
                {renewing && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 p-4 rounded-lg text-xs leading-relaxed text-amber-900 dark:text-amber-100" data-testid="delete-subscription-note">
                    {renewing.provider === 'app_store' ? (
                      <>
                        <p className="font-bold mb-1">Your MatchGPT+ subscription won't stop by itself.</p>
                        <p>
                          It's billed by the App Store, which only you can cancel. Cancel it first {storeManageHint('app_store')},
                          or the App Store keeps charging you after your account is gone.
                        </p>
                        {storePlatform() === 'ios' && (
                          <button type="button" onClick={() => manageStoreSubscription().catch(() => {})} className="mt-2 font-semibold underline">
                            Manage subscription
                          </button>
                        )}
                      </>
                    ) : renewing.provider === 'google_play' ? (
                      <p>Deleting your account also stops your Google Play subscription from renewing. Google doesn't refund the rest of the period.</p>
                    ) : (
                      <p>Deleting your account cancels your MatchGPT+ subscription straight away; nothing more is charged.</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Type "Delete" to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmationInput}
                    onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                    placeholder="Delete"
                    className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={() => setShowDeleteModal(false)} className="flex-1 justify-center">Cancel</Button>
                  <Button
                    onClick={handleFinalDelete}
                    disabled={deleteConfirmationInput !== 'Delete' || deleting}
                    className="flex-1 justify-center bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-900/50 disabled:cursor-not-allowed border-none shadow-md"
                  >
                    {deleting ? 'Deleting…' : 'Permanently Delete'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsView;
