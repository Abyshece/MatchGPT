import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { dismissNativePushOffer, shouldOfferNativePush, turnOnNativePush } from '../lib/nativePush';

// ============================================================================
// NotificationOffer: in the phone apps, asks once whether to turn on
// notifications, before the phone's own question (which can only be asked
// once, so it comes when someone has said yes here). "Not now" hides it for
// two weeks; Settings has the switch any time.
// ============================================================================

const NotificationOffer: React.FC = () => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    shouldOfferNativePush(userId).then((offer) => { if (live) setShow(offer); }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  if (!show || !userId) return null;

  const turnOn = async () => {
    setBusy(true);
    const result = await turnOnNativePush(userId).catch(() => 'failed' as const);
    setBusy(false);
    setShow(false);
    if (result === 'on') showToast("Notifications are on. We'll let you know about matches and messages.", 'success');
    else if (result === 'denied') showToast('Notifications are off. You can allow them in your phone\'s settings.', 'info');
    else if (result === 'unavailable') showToast('Notifications are coming to the app soon.', 'info');
    else showToast("Couldn't turn notifications on. You can try again in Settings.", 'error');
  };

  const notNow = () => {
    dismissNativePushOffer();
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="Notifications"
      data-testid="notification-offer"
      className="flex-none flex items-center gap-3 px-4 py-3 border-b border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-500/10"
    >
      <span className="text-xl" aria-hidden="true">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Turn on notifications?</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">Know when someone likes you, matches with you or sends a message.</p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch gap-1.5 flex-shrink-0">
        <button
          onClick={turnOn}
          disabled={busy}
          className="px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-60"
        >
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
        <button
          onClick={notNow}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-500/10"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

export default NotificationOffer;
