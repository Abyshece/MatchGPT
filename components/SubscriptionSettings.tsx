import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNow } from '../lib/useNow';
import { useToast } from '../lib/useToast';
import {
  cancelSubscription, formatDate, formatMoney, formatRupees, getBillingConfig, getMySubscription, listMyPayments,
  periodWord, refreshSubscription, sellerName, DEFAULT_PLANS,
  type BillingConfig, type Payment, type Subscription,
} from '../lib/billingService';
import {
  manageStoreSubscription, restoreStorePurchases, startStoreSync, storeManageHint, storeName, storePlatform,
} from '../lib/storePurchases';
import UpgradeModal from './UpgradeModal';

// ============================================================================
// SubscriptionSettings: the MatchGPT+ part of Settings
//
// Shows the plan and what happens next (trial end, renewal, end date) and the
// payments. Who bills it decides what can be done here: a website (Razorpay)
// subscription can be cancelled here, with Razorpay's invoices; one bought in
// a phone app is managed in that store (the app opens the store's page; the
// website says where). In the apps there's Restore purchases too. On opening,
// the subscription is caught up with Razorpay or the store, in case a
// notification was missed.
// ============================================================================

const OPEN = ['authenticated', 'active', 'pending', 'halted', 'paused'];

const SubscriptionSettings: React.FC = () => {
  const { session, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id;
  const platform = storePlatform();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const load = useCallback(async () => {
    if (!userId) return;
    const [s, p] = await Promise.all([getMySubscription(userId), listMyPayments(userId)]);
    setSub(s);
    setPayments(p);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // The website's prices and Razorpay; the apps sell through the store
      const cfg = platform ? null : await getBillingConfig().catch(() => null);
      if (cancelled) return;
      setConfig(cfg);
      await load();
      setLoading(false);
      const open = await getMySubscription(userId);
      if (platform) {
        // Catch up with the store, then show the result
        await startStoreSync(userId, { force: true });
      } else if (cfg?.enabled && open && open.provider === 'razorpay' && OPEN.includes(open.status)) {
        await refreshSubscription().catch(() => null);
      } else {
        return;
      }
      if (cancelled) return;
      await Promise.all([load(), refreshProfile()]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const plans = config?.plans?.length ? config.plans : DEFAULT_PLANS;
  const plan = sub ? plans.find((p) => p.id === sub.plan_id) : undefined;
  const price = plan ? `${formatRupees(plan.amount)}/${periodWord(plan.period)}` : '';
  const isPro = profile?.subscriptionTier === 'PRO';
  const store = sub && sub.provider !== 'razorpay' ? sub.provider : null;
  const storeLabel = storeName(store);
  // The store's own page opens from the app that bought it
  const manageHere = !!store && ((store === 'google_play' && platform === 'android') || (store === 'app_store' && platform === 'ios'));
  const live = !!sub && ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(sub.status);
  const inTrial = !!sub?.trial_ends_at && Date.parse(sub.trial_ends_at) > now && !sub.current_end;
  const canCancel = !store && !!sub && ['authenticated', 'active', 'pending'].includes(sub.status) && !sub.cancel_at_period_end;
  const planName = plan?.name ?? 'MatchGPT+';

  const doCancel = async () => {
    setBusy(true);
    try {
      const result = await cancelSubscription();
      await Promise.all([load(), refreshProfile()]);
      setConfirmCancel(false);
      showToast(result.proUntil ? `Cancelled. MatchGPT+ stays on until ${formatDate(result.proUntil)}.` : 'Cancelled.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't cancel. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const manage = async () => {
    try {
      await manageStoreSubscription();
    } catch {
      showToast(`Couldn't open ${storeLabel}. You can manage it ${storeManageHint(store)}.`, 'error');
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const r = await restoreStorePurchases(true);
      await Promise.all([load(), refreshProfile()]);
      showToast(r.pro ? 'MatchGPT+ restored.' : r.restored ? 'Checked: none of your purchases is active now.' : 'No MatchGPT+ purchase found to restore.',
        r.pro ? 'success' : 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't restore purchases. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  let status: React.ReactNode;
  if (loading) {
    status = <span className="text-gray-400">Loading…</span>;
  } else if (sub && store && live) {
    // Bought in a phone app: the store bills it and runs the renewals
    const manageWhere = manageHere ? '' : ` Manage it ${storeManageHint(store)}.`;
    if (sub.status === 'authenticated' && inTrial) {
      status = <>Free trial until <strong>{formatDate(sub.trial_ends_at)}</strong>, then billed by {storeLabel}{sub.cancel_at_period_end ? '; it won\'t renew' : ''}.{manageWhere}</>;
    } else if (sub.status === 'active' && sub.cancel_at_period_end) {
      status = <>Won't renew. MatchGPT+ stays on until <strong>{formatDate(sub.current_end)}</strong>.{manageWhere}</>;
    } else if (sub.status === 'active') {
      status = <>Renews on <strong>{formatDate(sub.current_end)}</strong>, billed by {storeLabel}.{manageWhere}</>;
    } else if (sub.status === 'pending') {
      status = <>Your last payment didn't go through. {storeLabel} is trying again, and you keep MatchGPT+ meanwhile; please update your payment method {storeManageHint(store)}.</>;
    } else if (sub.status === 'halted') {
      status = <>Payments failed, so MatchGPT+ is off. Update your payment method {storeManageHint(store)} and it comes back.</>;
    } else {
      status = <>Paused in {storeLabel}; it starts again on its own.{manageWhere}</>;
    }
  } else if (sub && sub.status === 'cancelled' && inTrial) {
    status = <>Trial cancelled; you won't be charged. MatchGPT+ stays on until <strong>{formatDate(sub.trial_ends_at)}</strong>.</>;
  } else if (sub && !store && sub.cancel_at_period_end && ['active', 'pending'].includes(sub.status)) {
    status = <>Cancelled. MatchGPT+ stays on until <strong>{formatDate(sub.current_end)}</strong>.</>;
  } else if (sub && !store && ['authenticated', 'active'].includes(sub.status) && inTrial) {
    status = <>Free trial until <strong>{formatDate(sub.trial_ends_at)}</strong>, then {price}.</>;
  } else if (sub && !store && sub.status === 'active') {
    status = <>{price}. Renews on <strong>{formatDate(sub.current_end)}</strong>.</>;
  } else if (sub && !store && sub.status === 'authenticated') {
    status = <>{price}. Your first payment is being confirmed.</>;
  } else if (sub && !store && sub.status === 'pending') {
    status = <>Your last payment didn't go through. Razorpay will try again, and you keep MatchGPT+ meanwhile. Razorpay's email explains how to update your payment method.</>;
  } else if (sub && !store && sub.status === 'halted') {
    status = <>Payments failed, so MatchGPT+ has ended. Subscribe again to get it back.</>;
  } else if (isPro) {
    status = <>MatchGPT+ is on for your account.</>;
  } else {
    status = <>Free plan: 3 AI searches and 15 likes a day.</>;
  }

  const showUpgradeButton = !loading && !isPro && !(store && live);

  return (
    <div className="space-y-3" data-testid="subscription-settings">
      <div className="flex items-start justify-between gap-4 px-2 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{isPro || (store && live) ? planName : 'Free'}</span>
            {isPro && <span className="text-[10px] font-bold uppercase tracking-wide bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded">Active</span>}
            {store && live && <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">{sellerName(store)}</span>}
            {sub?.mode === 'test' && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Test</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{status}</p>
        </div>
        {showUpgradeButton && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="flex-shrink-0 text-xs font-bold px-3 py-2 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:opacity-90"
          >
            Get MatchGPT+
          </button>
        )}
        {store && live && manageHere && (
          <button
            onClick={manage}
            className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Manage subscription
          </button>
        )}
        {canCancel && !confirmCancel && (
          <button
            onClick={() => setConfirmCancel(true)}
            className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            {sub?.status === 'authenticated' ? 'Cancel trial' : 'Cancel subscription'}
          </button>
        )}
      </div>

      {confirmCancel && sub && (
        <div className="mx-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 p-3">
          <p className="text-sm text-gray-800 dark:text-gray-200">
            {sub.status === 'authenticated'
              ? <>Cancel your trial? You won't be charged, and MatchGPT+ stays on until {formatDate(sub.trial_ends_at) || 'the trial ends'}.</>
              : sub.status === 'pending'
                ? <>Cancel MatchGPT+? Your last payment didn't go through; cancelling stops Razorpay from trying again, and MatchGPT+ ends now.</>
                : <>Cancel MatchGPT+? You keep it until {formatDate(sub.current_end)}; it won't renew.</>}
          </p>
          <div className="flex gap-2 justify-end mt-3">
            <button onClick={() => setConfirmCancel(false)} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300">
              Keep it
            </button>
            <button onClick={doCancel} disabled={busy} className="text-xs font-bold px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="px-2">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Payments</div>
          <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
            {payments.map((p) => {
              const refundedAll = p.status === 'refunded' || p.refunded_amount >= p.amount;
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    {formatDate(p.paid_at)}
                    {p.provider !== 'razorpay' && <span className="ml-2 text-xs text-gray-400">{sellerName(p.provider)}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={p.status === 'captured' && !refundedAll ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 line-through'}>
                      {formatMoney(p.amount, p.currency)}
                    </span>
                    {refundedAll
                      ? <span className="text-xs text-gray-500">refunded</span>
                      : p.refunded_amount > 0
                        ? <span className="text-xs text-gray-500">{formatMoney(p.refunded_amount, p.currency)} refunded</span>
                        : p.status !== 'captured' && <span className="text-xs text-gray-500">{p.status}</span>}
                    {p.invoice_url && (
                      <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        Invoice
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {platform && !loading && (
        <div className="px-2">
          <button onClick={restore} disabled={busy} className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40">
            {busy ? 'Checking…' : 'Restore purchases'}
          </button>
        </div>
      )}

      {showUpgrade && (
        <UpgradeModal
          reason="pro_feature"
          onClose={() => {
            setShowUpgrade(false);
            load();
          }}
        />
      )}
    </div>
  );
};

export default SubscriptionSettings;
