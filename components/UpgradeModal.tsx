import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX, IconSearch, IconHeart, IconEye, IconStar, IconHistory, IconMessageCircle, IconZap } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { FEATURES_FREE_NOW, proBenefits, formatDate, type ProBenefit } from '../lib/billingService';
import { isNativeApp } from '../lib/nativeApp';
import StoreBadges from './StoreBadges';
import { PlanCards, StoreTerms, buyLabel, useStoreUpgrade } from './StoreUpgrade';

// ============================================================================
// UpgradeModal: Shaadi24+
//
// A full-screen, dark page on a phone (a tall card on a wide screen): a
// photo with the headline, the plans side by side (1 week, 1 month, 3 months,
// 6 months; StoreUpgrade), what Shaadi24+ adds, and the button with the
// store's terms, which stay at the bottom while the rest scrolls.
//
// Shaadi24+ is sold only inside the phone apps, through Google Play or the App
// Store. Anywhere else it says so, with where to get the apps. Rendered into
// <body>, so it isn't trapped inside the sidebar.
// ============================================================================

interface UpgradeModalProps {
  reason: 'daily_limit' | 'pro_feature' | 'compatibility_report';
  resetInHours?: number;
  onClose: () => void;
}

// The photo at the top (public/images; docs/store/README.md says where it's from)
const HERO = '/images/paywall-hero.jpg';

const Sliders = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>
);
const Sparkles = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
  </svg>
);

const BENEFIT_ICON: Record<ProBenefit['key'], React.ReactNode> = {
  searches: <IconSearch />,
  likes: <IconHeart />,
  'likes-you': <IconEye />,
  'super-likes': <IconStar />,
  filters: <Sliders />,
  reports: <Sparkles />,
  dates: <IconMessageCircle />,
  standouts: <IconHistory />,
};

const UpgradeModal: React.FC<UpgradeModalProps> = ({ reason, resetInHours, onClose }) => {
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

  const headline = done ? 'Welcome to Shaadi24+'
    : alreadyPro ? 'You have Shaadi24+'
      : reason === 'daily_limit' ? "You've used today's free searches"
        : reason === 'compatibility_report' ? 'See exactly why you match'
          : 'Find your life partner sooner';
  const subtitle = done || alreadyPro ? 'Unlimited searches and likes, Super Likes and more.'
    : reason === 'daily_limit'
      ? (profile?.searchBonus ?? 0) < 6
        ? `Wait ${resetInHours ?? 24}h, complete more profile sections (each adds a free search a day), or search without limits with Shaadi24+.`
        : `Wait ${resetInHours ?? 24}h, or search without limits with Shaadi24+.`
      : reason === 'compatibility_report' ? 'Which traits align, and where there might be friction.'
        : 'Search, like and stand out without limits.';

  const button = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="upgrade-button"
      className="w-full rounded-full bg-white text-black font-semibold text-[17px] py-4 shadow-lg hover:bg-zinc-100 active:scale-[0.99] transition disabled:bg-white/25 disabled:text-white/70 disabled:shadow-none disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );

  return createPortal(
    // Full screen and dark on a phone (data-popup keeps it clear of the
    // iPhone's notch and home bar); a card over the blurred page on a wide
    // screen, like every popup
    <div
      data-popup
      className="fixed inset-0 z-[500] flex sm:items-center justify-center popup-backdrop max-sm:!bg-[#111] max-sm:!backdrop-blur-none sm:p-4 animate-fade-in"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        data-testid="upgrade-modal"
        className="relative w-full h-full sm:h-[min(880px,92vh)] sm:max-w-md sm:rounded-[28px] sm:border sm:border-white/10 bg-[#111] text-white flex flex-col overflow-hidden sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Shaadi24+, and the close button */}
        <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="w-10" aria-hidden="true" />
          <span className="flex items-center gap-1.5 text-[17px] font-bold tracking-tight [&>svg]:w-4 [&>svg]:h-4">
            <IconZap /> Shaadi24+
          </span>
          <button
            onClick={close}
            disabled={paying}
            className="w-10 h-10 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-40"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-6">
          {/* The photo, with the headline on it */}
          <div className="relative mt-4 rounded-2xl overflow-hidden aspect-[16/10] bg-zinc-900">
            <img src={HERO} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-center">
              <h2 id="upgrade-title" className="font-serif text-[27px] leading-[1.15] font-bold">{headline}</h2>
              <p className="mt-2 text-sm text-white/80">{subtitle}</p>
            </div>
          </div>

          {selling && (
            <div className="mt-5">
              <PlanCards offers={store.offers} chosen={store.offer?.planId} busy={store.busy} onPick={store.pick} />
            </div>
          )}

          {done && (
            <p className="mt-6 text-sm text-zinc-300 text-center">
              {done.trialEndsAt
                ? <>Your free trial runs until <strong className="text-white">{formatDate(done.trialEndsAt)}</strong>. {store.store} charges you after that, unless you cancel there before.</>
                : done.renewsAt
                  ? <>Paid until <strong className="text-white">{formatDate(done.renewsAt)}</strong>; it renews automatically through {store.store}. See it in Settings.</>
                  : <>You can see your subscription in Settings.</>}
            </p>
          )}

          {/* What it adds */}
          {!done && !alreadyPro && (
            <>
              <h3 className="mt-8 mb-2 font-serif text-xl font-bold text-center">What you get</h3>
              <ul>
                {proBenefits(proForAll).map((b) => (
                  <li key={b.key} className="flex items-center gap-4 py-3">
                    <span className="flex-none w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center text-white [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
                      {BENEFIT_ICON[b.key]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{b.title}</span>
                      {b.detail && <span className="block text-sm text-zinc-400">{b.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {proForAll && <p className="mt-2 text-sm text-zinc-400 text-center">{FEATURES_FREE_NOW}</p>}
            </>
          )}

          {!inApp && !done && !alreadyPro && (
            <div className="mt-8 text-center">
              <p className="text-sm font-medium text-zinc-200 mb-3">Shaadi24+ is bought in the Shaadi24 app, on Android or iPhone.</p>
              <StoreBadges className="justify-center" />
            </div>
          )}
        </div>

        {/* The button and the store's terms, always in view */}
        <div className="flex-none px-5 pt-3 pb-4 border-t border-white/10 bg-[#111] space-y-3">
          {selling ? (
            <>
              {store.note && (
                <p
                  role={store.note.kind === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    store.note.kind === 'error' ? 'bg-red-500/15 text-red-200' : 'bg-white/10 text-zinc-100'
                  }`}
                >
                  {store.note.text}
                </p>
              )}
              {store.available
                ? <StoreTerms offer={store.offer} platform={store.platform} onClose={onClose} />
                : store.offers && <p className="text-[11px] text-zinc-400 text-center">Shaadi24+ is coming to the app soon.</p>}
              {button(buyLabel(store), store.buy, !store.available || store.busy)}
              {store.available && (
                <button
                  type="button"
                  onClick={store.restore}
                  disabled={store.busy}
                  className="w-full text-xs font-semibold text-zinc-400 hover:text-white py-1 disabled:opacity-40"
                >
                  {store.restoring ? 'Restoring…' : 'Restore purchases'}
                </button>
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
