import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { PERIODS, type PlanId } from '../lib/billingService';
import { reportError } from '../lib/errorReports';
import {
  buyOffer, loadStoreOffers, restoreStorePurchases, storeName, storePlatform, type StoreOffer, type StorePlatform,
} from '../lib/storePurchases';

// ============================================================================
// StoreUpgrade: buying Shaadi24+ inside the phone apps (UpgradeModal lays it out)
//
// Prices come from the store (in the person's own currency); the store's
// payment sheet takes the payment, and the server checks the purchase before
// Pro turns on (lib/storePurchases.ts). The plans are listed one under
// another, each with its full price (what the store charges, the most
// prominent), the price a week, and what it saves on the shortest plan's
// price a week; under them, what the chosen plan saves in money
// (PlanSaving). Shows
// what the stores require next to an auto-renewing subscription: its length
// and price, that it renews until cancelled, where to cancel, Restore
// purchases, and the Terms and Privacy Policy. Until the store has the
// products, it says Shaadi24+ is coming soon.
// ============================================================================

// The plan picked to start with: three months, as most people take it
const FIRST_CHOICE: PlanId[] = ['quarterly', 'monthly', 'halfyearly', 'weekly'];
// Changing plan: the next longer one to start with (from 6 months, 3 months)
const LADDER: PlanId[] = ['weekly', 'monthly', 'quarterly', 'halfyearly'];
const changeChoice = (current: PlanId): PlanId[] => {
  const at = LADDER.indexOf(current);
  return at < 0 ? FIRST_CHOICE : [...LADDER.slice(at + 1), ...LADDER.slice(0, at).reverse()];
};

function money(amount: number, currency: string, digits: number): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: digits })
      .format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${currency}`;
  }
}

/** The price a week: "₹154/wk" (pennies only where they matter) */
function perWeek(offer: StoreOffer): number {
  return offer.amount / PERIODS[offer.period].weeks;
}

/** What each plan saves on the dearest price a week among them (usually the week's), in % */
function savings(offers: StoreOffer[]): Map<PlanId, number> {
  const base = Math.max(...offers.map(perWeek));
  return new Map(offers.map((o) => [o.planId, base > 0 && o.currency === offers[0].currency
    ? Math.round((1 - perWeek(o) / base) * 100) : 0]));
}

// Terms and Privacy open as pages of their own (App.tsx follows the address)
function openLegal(page: 'terms' | 'privacy', close: () => void) {
  close();
  window.location.hash = '';
  window.location.hash = page;
}

/**
 * The purchase: the store's offers, the chosen plan, buying and restoring.
 * `current`: changing plan, from this one (it can't be chosen); the stores
 * treat buying another of the plans as a change of plan.
 */
export function useStoreUpgrade({ paying, setPaying, onPurchased, current }: {
  paying: boolean;
  setPaying: (paying: boolean) => void;
  onPurchased: (result: { trialEndsAt: string | null; renewsAt: string | null }) => void;
  current?: PlanId;
}) {
  const { session, refreshProfile } = useAuth();
  const platform = storePlatform();
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  const [planId, setPlanId] = useState<PlanId | null>(null);
  const [note, setNote] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let live = true;
    loadStoreOffers()
      .then((o) => { if (live) setOffers(o); })
      .catch((e) => {
        // Asking the store failed: shown as "Coming soon", and Admin → Errors says why
        reportError(e, 'Shaadi24+ plans');
        if (live) setOffers([]);
      });
    return () => { live = false; };
  }, []);

  const offer = offers?.find((o) => o.planId === planId && o.planId !== current)
    ?? (current ? changeChoice(current) : FIRST_CHOICE).map((id) => offers?.find((o) => o.planId === id)).find(Boolean)
    ?? offers?.find((o) => o.planId !== current);
  const store = storeName(platform);
  const account = platform === 'ios' ? 'Apple ID' : 'Google account';
  const busy = paying || restoring;

  const finish = async (standing: { pro: boolean; trialEndsAt: string | null; renewsAt: string | null }, fallback: string) => {
    await refreshProfile();
    if (standing.pro) onPurchased({ trialEndsAt: standing.trialEndsAt, renewsAt: standing.renewsAt });
    else setNote({ kind: 'info', text: fallback });
  };

  const buy = async () => {
    if (!offer || !session) return;
    setNote(null);
    setPaying(true);
    try {
      const out = await buyOffer(offer, session.user.id);
      if (out.status === 'cancelled') return;
      if (out.status === 'pending') {
        setNote({ kind: 'info', text: `Your payment is waiting to go through. Shaadi24+ turns on as soon as ${store} confirms it.` });
        return;
      }
      await finish(out.standing, out.status === 'restored'
        ? `This ${account} already has Shaadi24+, but it isn't active now.`
        : `${store} took the payment, but Shaadi24+ isn't on yet. Try Restore purchases in a minute.`);
    } catch (e) {
      setNote({ kind: 'error', text: e instanceof Error ? e.message : 'The purchase did not go through. Please try again.' });
    } finally {
      setPaying(false);
    }
  };

  const restore = async () => {
    setNote(null);
    setRestoring(true);
    try {
      const r = await restoreStorePurchases(true);
      await finish(r, r.restored
        ? 'Your purchases were checked, but none of them is active now.'
        : `No Shaadi24+ purchase was found for this ${account}.`);
    } catch (e) {
      setNote({ kind: 'error', text: e instanceof Error ? e.message : "Couldn't restore purchases. Please try again." });
    } finally {
      setRestoring(false);
    }
  };

  return {
    platform, offers, offer, available: !!offers && offers.length > 0, note, busy, paying, restoring, store,
    pick: setPlanId, buy, restore,
  };
}

/** The plans, one under another: each with its full price (what the store charges), the price a week, and what it saves */
export const PlanCards: React.FC<{
  offers: StoreOffer[] | null; chosen: PlanId | undefined; busy: boolean; onPick: (id: PlanId) => void;
  current?: PlanId;   // changing plan: the one they have, marked and not to be picked
}> = ({
  offers, chosen, busy, onPick, current,
}) => {
  const saved = offers ? savings(offers) : null;

  if (!offers) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-[62px] rounded-2xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />)}
      </div>
    );
  }
  if (offers.length === 0) return null;

  return (
    <div role="radiogroup" aria-label="Plan" data-testid="plan-cards" className="space-y-2">
      {offers.map((o) => {
        const on = o.planId === chosen;
        const mine = o.planId === current;
        const save = saved?.get(o.planId) ?? 0;
        const week = perWeek(o);
        return (
          <button
            key={o.planId}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.planId)}
            disabled={busy || mine}
            className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
              on
                ? 'border-gray-900 dark:border-white bg-gray-50 dark:bg-zinc-800'
                : mine
                  ? 'border-dashed border-gray-300 dark:border-zinc-600 cursor-default'
                  : 'border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex-none w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                on ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-zinc-600'
              }`}
            >
              {on && <span className="w-2.5 h-2.5 rounded-full bg-gray-900 dark:bg-white" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{PERIODS[o.period].label}</span>
                {mine && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900">
                    Your plan
                  </span>
                )}
                {save > 0 && !mine && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    on ? 'plus-solid' : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-200'
                  }`}>
                    Save {save}%
                  </span>
                )}
              </span>
              <span className="block text-xs text-gray-500 dark:text-zinc-400">{money(week, o.currency, week >= 100 ? 0 : 2)}/wk</span>
            </span>
            <span className="flex-none text-[17px] font-bold whitespace-nowrap">{o.price}</span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * What the chosen plan saves, in money: 3 or 6 months against paying the
 * monthly price for as long ("You save ₹998: ₹1,999 instead of ₹2,997"), a
 * month against the weekly plan's price a week. Each says what it's compared
 * with; from the store's prices, so it's right in any currency.
 */
export const PlanSaving: React.FC<{ offer: StoreOffer | undefined; offers: StoreOffer[] | null }> = ({ offer, offers }) => {
  if (!offer || !offers || offers.length < 2) return null;
  const fmt = (x: number) => money(x, offer.currency, x >= 100 ? 0 : 2);
  const other = (id: PlanId) => offers.find((o) => o.planId === id && o.currency === offer.currency);
  const monthly = other('monthly');
  const weekly = other('weekly');

  let saved: string | null = null;
  let detail: React.ReactNode = 'The longer the plan, the less you pay a week.';
  if ((offer.period === 'quarterly' || offer.period === 'halfyearly') && monthly) {
    const months = Math.round(PERIODS[offer.period].weeks / PERIODS.monthly.weeks);
    const full = monthly.amount * months;
    if (full > offer.amount) {
      saved = `You save ${fmt(full - offer.amount)}`;
      detail = <>{fmt(offer.amount)} instead of <s>{fmt(full)}</s> ({fmt(monthly.amount)} a month for {months} months)</>;
    }
  } else if (offer.period === 'monthly' && weekly) {
    const week = Math.round(perWeek(offer) * 100) / 100;
    if (weekly.amount > week) {
      saved = `You save ${fmt(weekly.amount - week)} a week`;
      detail = <>{fmt(week)} a week instead of <s>{fmt(weekly.amount)}</s> with the 1-week plan</>;
    }
  }

  return (
    <div data-testid="plan-saving" aria-live="polite" className="mt-3 min-h-10 flex flex-col items-center justify-center text-center">
      {saved && <p className="text-sm font-semibold">{saved}</p>}
      <p className="text-xs text-gray-500 dark:text-zinc-400">{detail}</p>
    </div>
  );
};

/** What the stores require under the button: who charges, that it renews, where to cancel */
export const StoreTerms: React.FC<{ offer: StoreOffer | undefined; platform: StorePlatform | null; onClose: () => void }> = ({
  offer, platform, onClose,
}) => {
  if (!offer) return null;
  const every = PERIODS[offer.period].every;
  return (
    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-zinc-400 text-center">
      {offer.freeTrial && <>{offer.freeTrial[0].toUpperCase() + offer.freeTrial.slice(1)} for new subscribers, then {offer.price} every {every}. </>}
      {platform === 'ios'
        ? <>Payment is charged to your Apple ID when you confirm. Shaadi24+ renews automatically at the same price every {every} unless you turn it off at least 24 hours before the period ends; manage it in your App Store account settings. </>
        : <>Payment is charged to your Google Play account. Shaadi24+ renews automatically every {every} until you cancel, which you can do any time in Google Play's Subscriptions. </>}
      <button type="button" onClick={() => openLegal('terms', onClose)} className="underline text-gray-700 dark:text-zinc-200">Terms of Use</button>
      {' · '}
      <button type="button" onClick={() => openLegal('privacy', onClose)} className="underline text-gray-700 dark:text-zinc-200">Privacy Policy</button>
    </p>
  );
};

/** The button's words: "Get 3 months for ₹1,999.00", or the trial, or why it can't be bought yet */
export function buyLabel(u: ReturnType<typeof useStoreUpgrade>): string {
  if (!u.offers) return 'Loading…';
  if (!u.available || !u.offer) return 'Coming soon';
  if (u.paying) return `Opening ${u.store}…`;
  if (u.offer.freeTrial) return `Start your ${u.offer.freeTrial}`;
  return `Get ${PERIODS[u.offer.period].label} for ${u.offer.price}`;
}
