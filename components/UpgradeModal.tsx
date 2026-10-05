import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX, IconZap, IconCheck } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { useNow } from '../lib/useNow';
import {
  DEFAULT_PLANS, FEATURES_FREE_NOW, proBenefits, BillingError, confirmSubscription, formatDate, formatRupees, getBillingConfig,
  periodWord, startSubscription, type BillingConfig, type PlanId,
} from '../lib/billingService';
import { CheckoutClosed, openCheckout } from '../lib/razorpayCheckout';
import { isNativeApp } from '../lib/nativeApp';
import { storeName, storePlatform } from '../lib/storePurchases';
import StoreUpgrade from './StoreUpgrade';

// ============================================================================
// UpgradeModal: MatchGPT+ (Pro) plans
//
// On the website: monthly or yearly through Razorpay checkout; first-time
// subscribers start with the free trial. Until the Razorpay keys are set on
// the server, the plans show as "coming soon". Inside the phone apps, which
// may only sell through Google's and Apple's own billing, StoreUpgrade takes
// over (never Razorpay).
// Rendered into <body>, so it isn't trapped inside the sidebar.
// ============================================================================

interface UpgradeModalProps {
  reason: 'daily_limit' | 'pro_feature' | 'compatibility_report';
  resetInHours?: number;
  onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ reason, resetInHours, onClose }) => {
  const { profile, refreshProfile, proForAll } = useAuth();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [planId, setPlanId] = useState<PlanId>('monthly');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ trialEndsAt: string | null; renewsAt: string | null; duplicate: boolean; store?: boolean } | null>(null);
  const now = useNow();

  const inApp = isNativeApp();
  useEffect(() => {
    if (inApp) return;
    getBillingConfig().then(setConfig).catch(() => setConfig(null));
  }, [inApp]);

  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const plans = config?.plans?.length ? config.plans : DEFAULT_PLANS;
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const monthly = plans.find((p) => p.id === 'monthly');
  const yearly = plans.find((p) => p.id === 'yearly');
  const yearlySaving = monthly && yearly ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;
  const enabled = !inApp && !!config?.enabled;
  const loadingConfig = !inApp && !config;
  const trialDays = enabled && config.trialEligible ? config.trialDays : 0;
  const trialEnd = formatDate(new Date(now + trialDays * 86_400_000).toISOString());
  const price = `${formatRupees(plan.amount)}/${periodWord(plan.period)}`;
  const alreadyPro = profile?.subscriptionTier === 'PRO' && !done;

  const headline =
    reason === 'daily_limit' ? "You've used today's free searches"
      : reason === 'compatibility_report' ? 'Unlock the Compatibility Report'
        : 'Get MatchGPT+';
  const subtitle =
    reason === 'daily_limit' ? `Wait ${resetInHours ?? 24}h, or get MatchGPT+ for unlimited searches.`
      : reason === 'compatibility_report' ? 'See exactly which traits align and where there might be friction.'
        : 'More searches, more likes, more ways to stand out.';

  const subscribe = async () => {
    setError(null);
    setPaying(true);
    try {
      const sub = await startSubscription(plan.id);
      const checkout = await openCheckout({
        keyId: sub.keyId,
        subscriptionId: sub.subscriptionId,
        description: sub.trialEndsAt ? `${sub.planName}, free until ${formatDate(sub.trialEndsAt)}` : sub.planName,
        prefill: sub.prefill,
      });
      const result = await confirmSubscription(checkout);
      await refreshProfile();
      setDone({ trialEndsAt: result.trialEndsAt, renewsAt: result.renewsAt, duplicate: !!result.duplicate });
    } catch (e) {
      if (!(e instanceof CheckoutClosed)) {
        setError(e instanceof BillingError || e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

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
            {done ? (done.duplicate ? 'You already have MatchGPT+' : 'Welcome to MatchGPT+') : alreadyPro ? 'You have MatchGPT+' : headline}
          </h2>
          <p className="text-sm text-white/90">
            {done
              ? (done.duplicate ? 'Your plan carries on as before.' : 'Unlimited searches and likes, Super Likes and more are on.')
              : alreadyPro
                ? 'Unlimited searches and likes, Super Likes and more.'
                : subtitle}
          </p>
        </div>

        <div className="p-6">
          {done ? (
            <>
              <p className="text-sm text-gray-700 dark:text-gray-300 text-center mb-5">
                {done.duplicate
                  ? <>This second subscription was cancelled straight away, so you won't pay twice. Anything it charged is refunded.</>
                  : done.store
                    ? done.trialEndsAt
                      ? <>Your free trial runs until <strong>{formatDate(done.trialEndsAt)}</strong>. {storeName(storePlatform())} charges you after that, unless you cancel there before.</>
                      : done.renewsAt
                        ? <>Paid until <strong>{formatDate(done.renewsAt)}</strong>; it renews automatically through {storeName(storePlatform())}. See it in Settings.</>
                        : <>You can see your subscription in Settings.</>
                    : done.trialEndsAt
                      ? <>Your free trial runs until <strong>{formatDate(done.trialEndsAt)}</strong>. You'll be charged {price} then, unless you cancel in Settings before.</>
                      : done.renewsAt
                        ? <>Paid until <strong>{formatDate(done.renewsAt)}</strong>; it renews automatically. Manage it in Settings.</>
                        : <>You can manage your subscription in Settings.</>}
              </p>
              <button onClick={onClose} className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-lg hover:opacity-90">
                {done.duplicate ? 'Close' : 'Start exploring'}
              </button>
            </>
          ) : inApp && !alreadyPro ? (
            <>
              <StoreUpgrade
                paying={paying}
                setPaying={setPaying}
                onPurchased={(r) => setDone({ ...r, duplicate: false, store: true })}
                onClose={onClose}
              />
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
              {!alreadyPro && (
                <div className="grid grid-cols-2 gap-2 mb-5" role="radiogroup" aria-label="Plan">
                  {plans.map((p) => {
                    const selected = p.id === plan.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPlanId(p.id)}
                        disabled={paying}
                        className={`relative rounded-xl border-2 px-3 py-3 text-left transition-colors ${
                          selected
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10'
                            : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        {p.period === 'yearly' && yearlySaving > 0 && (
                          <span className="absolute -top-2.5 right-2 text-[10px] font-bold bg-green-600 text-white px-1.5 py-0.5 rounded">
                            SAVE {yearlySaving}%
                          </span>
                        )}
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {p.period === 'yearly' ? 'Yearly' : 'Monthly'}
                        </div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {formatRupees(p.amount)}
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400"> /{periodWord(p.period)}</span>
                        </div>
                        {p.period === 'yearly' && (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                            {formatRupees(Math.round(p.amount / 12 / 100) * 100)} a month
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <ul className="space-y-2 mb-6">
                {proBenefits(proForAll).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-green-500 flex-shrink-0 mt-0.5"><IconCheck className="w-4 h-4" /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {proForAll && <p className="-mt-4 mb-6 text-xs text-gray-500 dark:text-gray-400">{FEATURES_FREE_NOW}</p>}

              {error && (
                <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}

              {alreadyPro ? (
                <button onClick={onClose} className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-lg hover:opacity-90">
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={subscribe}
                    disabled={!enabled || paying}
                    className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 rounded-lg shadow-md hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <IconZap />
                    {loadingConfig
                      ? 'Loading…'
                      : !enabled
                        ? 'Coming soon'
                        : paying
                          ? 'Opening payment…'
                          : trialDays > 0 ? `Start ${trialDays}-day free trial` : `Subscribe for ${price}`}
                  </button>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-3 leading-relaxed">
                    {loadingConfig
                      ? ' '
                      : !enabled
                        ? 'MatchGPT+ is coming soon.'
                        : trialDays > 0
                          ? <>Free until {trialEnd}, then {price}. Cancel any time in Settings before then and you won't be charged.</>
                          : <>{price}, renews automatically. Cancel any time in Settings.</>}
                    {enabled && <> Payments by Razorpay; see the <a href="#terms" className="underline">Terms</a>.</>}
                  </p>
                  {config?.mode === 'test' && (
                    <p className="mt-2 text-center text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      Test mode: no real money is charged.
                    </p>
                  )}
                </>
              )}

              {!alreadyPro && (
                <button
                  onClick={onClose}
                  disabled={paying}
                  className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-3 py-2 disabled:opacity-40"
                >
                  Maybe later
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UpgradeModal;
