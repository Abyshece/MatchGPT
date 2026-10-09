import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX, IconCheck } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { FEATURES_FREE_NOW, proBenefits, formatDate } from '../lib/billingService';
import { limitTitle, whenText, type SearchAllowance } from '../lib/searchLimits';
import { DAILY_LIMITS } from '../lib/profileService';
import { isNativeApp } from '../lib/nativeApp';
import { APPLE_APP_ID } from '../lib/storeLinks';
import StoreBadges from './StoreBadges';
import { PlanCards, PlanSaving, StoreTerms, buyLabel, useStoreUpgrade } from './StoreUpgrade';

// ============================================================================
// UpgradeModal: Shaadi24+
//
// A plain card in the app's own colours (white, or dark in dark mode) over the
// blurred page, clear of the screen's edges like every popup: the Shaadi24
// logo and what the moment calls for (a search limit used up, with when the
// next search can be; the day's likes used up; a Shaadi24+ feature), the plans in a list (1 week, 1 month,
// 3 months, 6 months; StoreUpgrade) with what the chosen one saves, what
// Shaadi24+ adds, and the button with the store's terms, which stay at the
// bottom while the rest scrolls.
//
// Shaadi24+ is sold only inside the phone apps, through Google Play or the App
// Store. Anywhere else it says so, with where to get the apps. Rendered into
// <body>, so it isn't trapped inside the sidebar.
// ============================================================================

interface UpgradeModalProps {
  reason: 'search_limit' | 'like_limit' | 'pro_feature' | 'compatibility_report';
  limit?: SearchAllowance | null;   // search_limit: which limit, and when the next search can be
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ reason, limit, onClose }) => {
  const { profile, proForAll } = useAuth();
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ trialEndsAt: string | null; renewsAt: string | null } | null>(null);
  const inApp = isNativeApp();
  const store = useStoreUpgrade({ paying, setPaying, onPurchased: setDone });

  // (not while the store's payment sheet is open)
  const close = () => { if (!paying) onClose(); };
  const onEscape = useEffectEvent(() => close());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const alreadyPro = profile?.subscriptionTier === 'PRO' && !done;
  const selling = inApp && !done && !alreadyPro;
  const searchLimit = reason === 'search_limit' && !done;
  const nextSearch = limit?.next_search_at ? `You can search again ${whenText(limit.next_search_at)}.` : '';

  const headline = done ? 'Welcome to Shaadi24+'
    : searchLimit ? limitTitle(limit?.limited_by ?? null)
      : alreadyPro ? 'You have Shaadi24+'
        : reason === 'like_limit' ? "You've used today's likes"
          : reason === 'compatibility_report' ? 'See exactly why you match'
            : 'Find your life partner sooner';
  const subtitle = done ? 'More searches, unlimited likes, 3 Super Interests a week and more.'
    : searchLimit
      ? alreadyPro
        ? nextSearch || 'Your searches come back soon.'
        : [nextSearch,
            limit?.limited_by === 'day' && (profile?.searchBonus ?? 0) < 6 ? 'Each profile section you complete adds a search a day.' : '',
            'Shaadi24+ gives you more searches.'].filter(Boolean).join(' ')
      : alreadyPro ? 'More searches, unlimited likes, 3 Super Interests a week and more.'
        : reason === 'like_limit' ? `Free accounts get ${DAILY_LIMITS.FREE.likes} likes a day; more come tomorrow. Shaadi24+ has unlimited likes.`
          : reason === 'compatibility_report' ? 'Which traits align, and where there might be friction.'
            : 'More searches, unlimited likes and every feature.';

  const button = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="upgrade-button"
      className="w-full rounded-full plus-solid font-semibold text-base py-3.5 hover:opacity-90 active:scale-[0.99] transition disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );

  return createPortal(
    // A card over the blurred page, clear of the edges (data-popup keeps it
    // clear of the iPhone's notch and home bar too)
    <div
      data-popup
      className="fixed inset-0 z-[500] flex items-center justify-center popup-backdrop p-3 sm:p-4 animate-fade-in"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        data-testid="upgrade-modal"
        className="relative w-full max-w-md max-h-full sm:max-h-[min(860px,92vh)] rounded-[28px] bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          disabled={paying}
          className="absolute right-3 top-3 z-10 w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 disabled:opacity-40 [&>svg]:w-5 [&>svg]:h-5"
          aria-label="Close"
        >
          <IconX />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 pb-6">
          {/* The Shaadi24 logo, and what the moment calls for */}
          <div className="pt-9 text-center">
            <div className="inline-flex items-center gap-2 select-none">
              <span className="text-3xl" aria-hidden="true">💍</span>
              <span className="text-xl font-bold tracking-tight">Shaadi24+</span>
            </div>
            <h2 id="upgrade-title" className="mt-5 text-[22px] leading-snug font-bold">{headline}</h2>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-zinc-400">{subtitle}</p>
          </div>

          {selling && (
            <div className="mt-6">
              <PlanCards offers={store.offers} chosen={store.offer?.planId} busy={store.busy} onPick={store.pick} />
              <PlanSaving offer={store.offer} offers={store.offers} />
            </div>
          )}

          {done && (
            <p className="mt-6 text-sm text-gray-600 dark:text-zinc-300 text-center">
              {done.trialEndsAt
                ? <>Your free trial runs until <strong className="text-gray-900 dark:text-white">{formatDate(done.trialEndsAt)}</strong>. {store.store} charges you after that, unless you cancel there before.</>
                : done.renewsAt
                  ? <>Paid until <strong className="text-gray-900 dark:text-white">{formatDate(done.renewsAt)}</strong>; it renews automatically through {store.store}. See it in Settings.</>
                  : <>You can see your subscription in Settings.</>}
            </p>
          )}

          {/* What it adds */}
          {!done && !alreadyPro && (
            <div className="mt-6 pt-5 border-t border-gray-100 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400">What you get</h3>
              <ul className="mt-3 space-y-2.5">
                {proBenefits(proForAll, limit?.plans, limit?.window.hours).map((b) => (
                  <li key={b.key} className="flex gap-3 text-sm">
                    <span className="flex-none mt-0.5 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true"><IconCheck /></span>
                    <span className="min-w-0">
                      <span className="font-medium">{b.title}</span>
                      {b.detail && <span className="block text-gray-500 dark:text-zinc-400">{b.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {proForAll && <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400">{FEATURES_FREE_NOW}</p>}
            </div>
          )}

          {!inApp && !done && !alreadyPro && (
            <div className="mt-6 text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-zinc-200 mb-3">Shaadi24+ is bought in the Shaadi24 app, on Android or iPhone.</p>
              <StoreBadges className="justify-center" />
            </div>
          )}
        </div>

        {/* The button and the store's terms, always in view */}
        <div className="flex-none px-6 pt-3 pb-4 border-t border-gray-100 dark:border-zinc-800 space-y-3">
          {selling ? (
            <>
              {store.note && (
                <p
                  role={store.note.kind === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    store.note.kind === 'error'
                      ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-100'
                  }`}
                >
                  {store.note.text}
                </p>
              )}
              {store.available
                ? <StoreTerms offer={store.offer} platform={store.platform} onClose={onClose} />
                : store.offers && <p className="text-xs text-gray-500 dark:text-zinc-400 text-center">Shaadi24+ is coming to the app soon.</p>}
              {button(buyLabel(store), store.buy, !store.available || store.busy)}
              {store.available && (
                <button
                  type="button"
                  onClick={store.restore}
                  disabled={store.busy}
                  className="w-full text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white py-1 disabled:opacity-40"
                >
                  {store.restoring ? 'Restoring…' : 'Restore purchases'}
                </button>
              )}
              {store.available && (
                // An offer code (the website's banner, Admin → Offers) is redeemed in the store itself
                <a
                  href={store.platform === 'ios'
                    ? `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}`
                    : 'https://play.google.com/redeem'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  Have an offer code? Redeem it
                </a>
              )}
            </>
          ) : (
            button(done ? 'Start exploring' : 'Close', onClose)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UpgradeModal;
