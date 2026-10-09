import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  isPushSupported, getPermissionState, isCurrentlySubscribed,
  subscribeToPush, unsubscribeFromPush,
} from '../lib/pushService';
import { isNativeApp } from '../lib/nativeApp';
import { nativePushState, turnOffNativePush, turnOnNativePush, type PushState } from '../lib/nativePush';
import { Capacitor } from '@capacitor/core';

// Small inline bell icon (since IconBell isn't in constants yet)
const IconBell: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

// ============================================================================
// PushNotifSetup
//
// Embedded in SettingsView. Shows current push state for THIS device and lets
// the user enable or disable. Each device subscribes independently — disabling
// here doesn't affect their phone subscription. In the phone apps it's the
// phone's own notifications (PhonePushSetup, lib/nativePush.ts).
// ============================================================================

// forAdmins: the website's admin panel, where they bring admin alerts
const PushNotifSetup: React.FC<{ forAdmins?: boolean }> = ({ forAdmins = false }) =>
  (isNativeApp() ? <PhonePushSetup /> : <WebPushSetup forAdmins={forAdmins} />);

const WebPushSetup: React.FC<{ forAdmins: boolean }> = ({ forAdmins }) => {
  const { session } = useAuth();
  const { showToast } = useToast();

  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Check current state on mount
  useEffect(() => {
    const supp = isPushSupported();
    setSupported(supp);
    if (!supp) return;
    setPermission(getPermissionState());
    isCurrentlySubscribed().then(setSubscribed);
  }, []);

  if (!supported) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2 px-1">
        Push notifications aren't supported on this browser.
        {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
          <> On iOS, add Shaadi24 to your home screen first (Share → Add to Home Screen).</>
        )}
      </div>
    );
  }

  const handleEnable = async () => {
    if (!session?.user.id) return;
    setBusy(true);
    const result = await subscribeToPush(session.user.id);
    setBusy(false);

    if (!result.success) {
      showToast(`Couldn't enable: ${result.error}`, 'error');
      return;
    }

    setSubscribed(true);
    setPermission('granted');
    showToast('Push notifications enabled', 'success');
  };

  const handleDisable = async () => {
    if (!session?.user.id) return;
    setBusy(true);
    const result = await unsubscribeFromPush(session.user.id);
    setBusy(false);

    if (!result.success) {
      showToast(`Couldn't disable: ${result.error}`, 'error');
      return;
    }

    setSubscribed(false);
    showToast('Push notifications disabled', 'info');
  };

  // Permission was denied at the OS/browser level — user needs to fix it themselves
  if (permission === 'denied') {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
        <IconBell />
        <div>
          <p className="font-bold mb-1">Notifications are blocked</p>
          <p>To enable, click the lock icon next to the URL → Site settings → Notifications → Allow. Then refresh.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/30 px-2 rounded transition-colors cursor-pointer"
      onClick={subscribed ? handleDisable : handleEnable}
    >
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
          <IconBell /> {forAdmins ? 'Alerts in this browser' : 'Push notifications on this device'}
        </h4>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {forAdmins
            ? 'A notification for each new report and verification request.'
            : subscribed
              ? 'You\'ll get pushes for new matches, Super Interests, and messages.'
              : 'Get notified about new matches, Super Interests, and messages.'}
        </p>
      </div>
      <button
        disabled={busy}
        role="switch"
        aria-checked={subscribed}
        aria-label={forAdmins ? 'Alerts in this browser' : 'Push notifications on this device'}
        className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 disabled:opacity-50 ${
          subscribed ? 'bg-blue-500' : 'bg-gray-300 dark:bg-zinc-600'
        }`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${subscribed ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
};

// ---- In the phone apps ------------------------------------------------------------

const PhonePushSetup: React.FC = () => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const check = () => nativePushState(userId).then((s) => { if (live) setState(s); });
    check();
    // Back from the phone's settings, the answer may have changed
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { live = false; document.removeEventListener('visibilitychange', onShow); };
  }, [userId]);

  if (!userId || state === null) return null;

  if (state === 'unavailable') {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 py-2 px-1" data-testid="phone-push-unavailable">
        Notifications on your phone are coming to the app soon.
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 rounded-lg p-3 text-xs text-yellow-800 dark:text-yellow-300 flex items-start gap-2" data-testid="phone-push-denied">
        <IconBell />
        <div>
          <p className="font-bold mb-1">Notifications are off for Shaadi24</p>
          <p>
            To get them, allow notifications for Shaadi24 in your phone's settings
            {Capacitor.getPlatform() === 'ios' ? ' (Settings → Notifications → Shaadi24).' : ' (Settings → Apps → Shaadi24 → Notifications).'}
          </p>
        </div>
      </div>
    );
  }

  const on = state === 'on';
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        await turnOffNativePush(userId);
        setState('off');
        showToast('Notifications are off on this phone', 'info');
        return;
      }
      const result = await turnOnNativePush(userId);
      setState(result === 'on' ? 'on' : result === 'denied' ? 'denied' : result === 'unavailable' ? 'unavailable' : 'off');
      if (result === 'on') showToast('Notifications are on', 'success');
      else if (result === 'failed') showToast("Couldn't turn notifications on. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      data-testid="phone-push-toggle"
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void toggle(); } }}
      className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/30 px-2 rounded transition-colors cursor-pointer"
    >
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
          <IconBell /> Notifications on this phone
        </h4>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          {on
            ? "You'll be notified about new matches, Super Interests and messages."
            : 'Get notified about new matches, Super Interests and messages.'}
        </p>
      </div>
      <span
        aria-hidden="true"
        className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${busy ? 'opacity-50' : ''} ${
          on ? 'bg-blue-500' : 'bg-gray-300 dark:bg-zinc-600'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${on ? 'left-5' : 'left-0.5'}`} />
      </span>
    </div>
  );
};

export default PushNotifSetup;
