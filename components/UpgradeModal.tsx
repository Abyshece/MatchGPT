import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX, IconZap, IconCheck } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { FEATURES_FREE_NOW, proBenefits, formatDate } from '../lib/billingService';
import { isNativeApp } from '../lib/nativeApp';
import { storeName, storePlatform } from '../lib/storePurchases';
import StoreBadges from './StoreBadges';
import StoreUpgrade from './StoreUpgrade';

// ============================================================================
// UpgradeModal: MatchGPT+
//
// MatchGPT+ is sold only inside the phone apps, through Google Play or the App
// Store (StoreUpgrade). Anywhere else it says so, with where to get the apps.
// Rendered into <body>, so it isn't trapped inside the sidebar.
// ============================================================================

interface UpgradeModalProps {
  reason: 'daily_limit' | 'pro_feature' | 'compatibility_report';
  resetInHours?: number;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ reason, resetInHours, onClose }) => {
  const { profile, proForAll } = useAuth();
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ trialEndsAt: string | null; renewsAt: string | null } | null>(null);

  const inApp = isNativeApp();
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const alreadyPro = profile?.subscriptionTier === 'PRO' && !done;
  const store = storeName(storePlatform());

  const headline =
    reason === 'daily_limit' ? "You've used today's free searches"
      : reason === 'compatibility_report' ? 'Unlock the Compatibility Report'
        : 'Get MatchGPT+';
  const subtitle =
    reason === 'daily_limit' ? `Wait ${resetInHours ?? 24}h, or get MatchGPT+ for unlimited searches.`
      : reason === 'compatibility_report' ? 'See exactly which traits align and where there might be friction.'
        : 'More searches, more likes, more ways to stand out.';

  const closeButton = (label: string) => (
    <button onClick={onClose} className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-lg hover:opacity-90">
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center sm:p-4 popup-backdrop animate-fade-in"
      onClick={paying ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto border border-gray-200 dark:border-zinc-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={paying}
          className="absolute top-3 right-3 z-30 p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/20 disabled:opacity-40"
          aria-label="Close"
        >
          <IconX />
        </button>

        <div className="bg-gradient-to-br from-yellow-500 via-orange-500 to-pink-500 px-6 pt-7 pb-6 text-center text-white">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <IconZap />
          </div>
          <h2 id="upgrade-title" className="text-2xl font-bold mb-1">
            {done ? 'Welcome to MatchGPT+' : alreadyPro ? 'You have MatchGPT+' : headline}
          </h2>
          <p className="text-sm text-white/90">
            {done || alreadyPro ? 'Unlimited searches and likes, Super Likes and more.' : subtitle}
          </p>
        </div>

        <div className="p-6">
          {done ? (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300 text-center mb-5">
                {done.trialEndsAt
                  ? <>Your free trial runs until <strong>{formatDate(done.trialEndsAt)}</strong>. {store} charges you after that, unless you cancel there before.</>
                  : done.renewsAt
                    ? <>Paid until <strong>{formatDate(done.renewsAt)}</strong>; it renews automatically through {store}. See it in Settings.</>
                    : <>You can see your subscription in Settings.</>}
              </p>
              {closeButton('Start exploring')}
            </>
          ) : alreadyPro ? (
            closeButton('Close')
          ) : inApp ? (
            <>
              <StoreUpgrade paying={paying} setPaying={setPaying} onPurchased={setDone} onClose={onClose} />
              <button
                onClick={onClose}
                disabled={paying}
                className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-1 py-2 disabled:opacity-40"
              >
                Maybe later
              </button>
            </>
          ) : (
            <>
              <ul className="space-y-2 mb-6">
                {proBenefits(proForAll).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-green-500 flex-shrink-0 mt-0.5"><IconCheck className="w-4 h-4" /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {proForAll && <p className="-mt-4 mb-6 text-xs text-gray-500 dark:text-gray-400">{FEATURES_FREE_NOW}</p>}
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
                MatchGPT+ is bought in the MatchGPT app, on Android or iPhone.
              </p>
              <StoreBadges className="mb-6" />
              {closeButton('Close')}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UpgradeModal;
