import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNow } from '../lib/useNow';
import { useToast } from '../lib/useToast';
import {
  chargeName, formatDate, formatMoney, getMySubscription, listMyPayments, sellerName, planName as nameOfPlan,
  type Payment, type Subscription,
} from '../lib/billingService';
import {
  manageStoreSubscription, pendingPlanChange, restoreStorePurchases, startStoreSync, storeManageHint, storeName, storePlatform,
} from '../lib/storePurchases';
import { PERIODS, type PlanId } from '../lib/billingService';
import UpgradeModal from './UpgradeModal';
import ChangePlanModal from './ChangePlanModal';
import { DAILY_LIMITS } from '../lib/profileService';
import { useSearchAllowance } from '../lib/searchLimits';
import SearchUsage from './SearchUsage';

// ============================================================================
// SubscriptionSettings: the Shaadi24+ part of Settings
//
// Shows the plan and what happens next (trial end, renewal, end date, a change
// of plan waiting for the renewal), Change plan (ChangePlanModal), the AI
// searches used against each limit (SearchUsage) and the payments. Shaadi24+ is bought in the phone apps, so the store that sold it
// bills it and manages it: the app opens the store's page, and anywhere else
// this says where. In the apps there's Restore purchases too, and on opening
// the subscription is caught up with the store, in case a notification was
// missed.
// ============================================================================

const SubscriptionSettings: React.FC = () => {
  const { session, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id;
  const { allowance } = useSearchAllowance(userId, `${profile?.subscriptionTier}:${profile?.searchBonus}`);
  const platform = storePlatform();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState<PlanId | null>(null);   // iPhone: the plan from the next renewal
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
      await load();
      if (cancelled) return;
      setLoading(false);
      if (!platform) return;
      // In the apps: catch up with the store, then show the result
      await startStoreSync(userId, { force: true });
      if (cancelled) return;
      await Promise.all([load(), refreshProfile()]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isPro = profile?.subscriptionTier === 'PRO';
  const store = sub && (sub.provider === 'google_play' || sub.provider === 'app_store') ? sub.provider : null;
  const storeLabel = storeName(store);
  // The store's own page opens from the app that bought it
  const manageHere = !!store && ((store === 'google_play' && platform === 'android') || (store === 'app_store' && platform === 'ios'));
  const live = !!sub && ['authenticated', 'active', 'pending', 'halted', 'paused'].includes(sub.status);
  const inTrial = !!sub?.trial_ends_at && Date.parse(sub.trial_ends_at) > now && !sub.current_end;
  const planName = sub ? nameOfPlan(sub.plan_id) : 'Shaadi24+';
  // Change plan: a store subscription that's on, in the app of the store that bills it
  const canChange = manageHere && !!sub && ['authenticated', 'active'].includes(sub.status) && !!sub.plan_id && sub.plan_id in PERIODS;

  // iPhone: a change of plan waiting for the renewal (Apple starts a plan of
  // another length then); read from the App Store again after a change
  const [pendingCheck, setPendingCheck] = useState(0);
  const watchPending = manageHere && platform === 'ios' && live;
  useEffect(() => {
    if (!watchPending) return;
    let on = true;
    pendingPlanChange()
      .then((p) => { if (on) setPending(p?.planId ?? null); })
      .catch(() => { /* the App Store didn't answer: nothing shown */ });
    return () => { on = false; };
  }, [watchPending, pendingCheck, sub?.plan_id]);
  const pendingPlan = watchPending && pending && pending !== sub?.plan_id ? pending : null;

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
      showToast(r.pro ? 'Shaadi24+ restored.' : r.restored ? 'Checked: none of your purchases is active now.' : 'No Shaadi24+ purchase found to restore.',
        r.pro ? 'success' : 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't restore purchases. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  };

  let status: React.ReactNode;
  if (loading) {
    status = <span className="text-gray-500 dark:text-gray-400">Loading…</span>;
  } else if (sub && store && live) {
    // Bought in a phone app: the store bills it and runs the renewals
    const manageWhere = manageHere ? '' : ` Manage it ${storeManageHint(store)}.`;
    if (sub.status === 'authenticated' && inTrial) {
      status = <>Free trial until <strong>{formatDate(sub.trial_ends_at)}</strong>, then billed by {storeLabel}{sub.cancel_at_period_end ? '; it won\'t renew' : ''}.{manageWhere}</>;
    } else if (sub.status === 'active' && sub.cancel_at_period_end) {
      status = <>Won't renew. Shaadi24+ stays on until <strong>{formatDate(sub.current_end)}</strong>.{manageWhere}</>;
    } else if (sub.status === 'active') {
      status = <>Renews on <strong>{formatDate(sub.current_end)}</strong>, billed by {storeLabel}.{manageWhere}</>;
    } else if (sub.status === 'pending') {
      status = <>Your last payment didn't go through. {storeLabel} is trying again, and you keep Shaadi24+ meanwhile; please update your payment method {storeManageHint(store)}.</>;
    } else if (sub.status === 'halted') {
      status = <>Payments failed, so Shaadi24+ is off. Update your payment method {storeManageHint(store)} and it comes back.</>;
    } else {
      status = <>Paused in {storeLabel}; it starts again on its own.{manageWhere}</>;
    }
  } else if (sub && sub.status === 'cancelled' && inTrial) {
    status = <>Trial cancelled; you won't be charged. Shaadi24+ stays on until <strong>{formatDate(sub.trial_ends_at)}</strong>.</>;
  } else if (isPro) {
    status = <>Shaadi24+ is on for your account.</>;
  } else {
    status = <>Free plan: {DAILY_LIMITS.FREE.likes} likes a day, and the AI searches below.
      {(profile?.searchBonus ?? 0) < 6 && allowance?.day.limit !== null && <> Each profile section you complete adds a search a day.</>}</>;
  }

  const showUpgradeButton = !loading && !isPro && !(store && live);

  return (
    <div className="space-y-3" data-testid="subscription-settings">
      <div className="flex items-start justify-between gap-4 px-2 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{isPro || (store && live) ? planName : 'Free'}</span>
            {isPro && <span className="text-[10px] font-bold uppercase tracking-wide plus-solid px-1.5 py-0.5 rounded">Active</span>}
            {store && live && <span className="text-[10px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">{sellerName(store)}</span>}
            {sub?.mode === 'test' && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">Test</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            {status}
            {pendingPlan && sub && (
              <span data-testid="pending-plan">
                {' '}Switches to <strong>{PERIODS[pendingPlan].label}</strong>
                {sub.current_end || sub.trial_ends_at ? <> on <strong>{formatDate(sub.current_end ?? sub.trial_ends_at)}</strong></> : null}.
              </span>
            )}
          </p>
        </div>
        {showUpgradeButton && (
          <button
            onClick={() => setShowUpgrade(true)}
            className="flex-shrink-0 text-xs font-bold px-3 py-2 rounded-lg plus-solid hover:opacity-90"
          >
            Get Shaadi24+
          </button>
        )}
        {store && live && manageHere && (
          <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {canChange && (
              <button
                onClick={() => setChanging(true)}
                className="text-xs font-bold px-3 py-2 rounded-lg plus-solid hover:opacity-90"
              >
                Change plan
              </button>
            )}
            <button
              onClick={manage}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              Manage subscription
            </button>
          </div>
        )}
      </div>

      <SearchUsage allowance={allowance} />

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
                    {p.product_id && <span className="ml-2">{chargeName(p.product_id)}</span>}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{sellerName(p.provider)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={p.status === 'captured' && !refundedAll ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 line-through'}>
                      {formatMoney(p.amount, p.currency)}
                    </span>
                    {refundedAll
                      ? <span className="text-xs text-gray-500">refunded</span>
                      : p.refunded_amount > 0
                        ? <span className="text-xs text-gray-500">{formatMoney(p.refunded_amount, p.currency)} refunded</span>
                        : p.status !== 'captured' && <span className="text-xs text-gray-500">{p.status}</span>}
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

      {changing && sub?.plan_id && (
        <ChangePlanModal
          current={sub.plan_id as PlanId}
          renewsAt={sub.current_end ?? sub.trial_ends_at}
          onClose={() => setChanging(false)}
          onChanged={() => {
            void Promise.all([load(), refreshProfile()]);
            setPendingCheck((n) => n + 1);
          }}
        />
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
