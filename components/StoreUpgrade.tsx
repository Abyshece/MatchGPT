import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { PERIODS, type PlanId } from '../lib/billingService';
import {
  buyOffer, loadStoreOffers, restoreStorePurchases, storeName, storePlatform, type StoreOffer, type StorePlatform,
} from '../lib/storePurchases';

// ============================================================================
// StoreUpgrade: buying Shaadi24+ inside the phone apps (UpgradeModal lays it out)
//
// Prices come from the store (in the person's own currency); the store's
// payment sheet takes the payment, and the server checks the purchase before
// Pro turns on (lib/storePurchases.ts). The plans sit side by side, each
// with its full price first (what the store charges) and the price a week
// under it, and what it saves on the shortest plan's price a week; under
// them, what the chosen plan saves in money (PlanSaving). Shows
// what the stores require next to an auto-renewing subscription: its length
// and price, that it renews until cancelled, where to cancel, Restore
// purchases, and the Terms and Privacy Policy. Until the store has the
// products, it says Shaadi24+ is coming soon.
// ============================================================================

// The plan picked to start with: three months, as most people take it
const FIRST_CHOICE: PlanId[] = ['quarterly', 'monthly', 'halfyearly', 'weekly'];

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

/** The purchase: the store's offers, the chosen plan, buying and restoring. */
export function useStoreUpgrade({ paying, setPaying, onPurchased }: {
  paying: boolean;
  setPaying: (paying: boolean) => void;
  onPurchased: (result: { trialEndsAt: string | null; renewsAt: string | null }) => void;
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
      .catch(() => { if (live) setOffers([]); });
    return () => { live = false; };
  }, []);

  const offer = offers?.find((o) => o.planId === planId)
    ?? FIRST_CHOICE.map((id) => offers?.find((o) => o.planId === id)).find(Boolean)
    ?? offers?.[0];
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

/** The plans, side by side (they scroll sideways on a phone) */
export const PlanCards: React.FC<{ offers: StoreOffer[] | null; chosen: PlanId | undefined; busy: boolean; onPick: (id: PlanId) => void }> = ({
  offers, chosen, busy, onPick,
}) => {
  const row = useRef<HTMLDivElement>(null);
  const saved = offers ? savings(offers) : null;

  // The chosen plan in view, in the middle, once the prices are in
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && row.current) row.current.scrollLeft = el.offsetLeft - (row.current.clientWidth - el.clientWidth) / 2;
  }, [offers]);

  if (!offers) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-hidden="true">
        {[1, 2, 3].map((i) => <div key={i} className="flex-none w-[9.25rem] h-[8.25rem] rounded-2xl bg-zinc-800/80 animate-pulse" />)}
      </div>
    );
  }
  if (offers.length === 0) return null;

  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label="Plan"
      data-testid="plan-cards"
      className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-5 px-5 py-1"
    >
      {offers.map((o) => {
        const on = o.planId === chosen;
        const save = saved?.get(o.planId) ?? 0;
        const week = perWeek(o);
        return (
          <button
            key={o.planId}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.planId)}
            disabled={busy}
            className={`snap-center flex-none w-[9.25rem] rounded-2xl border-2 overflow-hidden text-center transition-colors ${
              on ? 'border-white' : 'border-zinc-700 hover:border-zinc-500'
            }`}
          >
            <div className={`py-1.5 text-xs font-bold ${on ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-200'}`}>
              {save > 0 ? `Save ${save}%` : 'Try it'}
            </div>
            <div className="px-2 pt-3 pb-3.5">
              <div className="text-sm text-zinc-300">{PERIODS[o.period].label}</div>
              <div className="mt-1 text-[17px] font-bold text-white whitespace-nowrap">{o.price}</div>
              <div className="text-xs text-zinc-400">{money(week, o.currency, week >= 100 ? 0 : 2)}/wk</div>
            </div>
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
      {saved && <p className="text-sm font-semibold text-white">{saved}</p>}
      <p className="text-xs text-zinc-400">{detail}</p>
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
    <p className="text-[11px] leading-relaxed text-zinc-400 text-center">
      {offer.freeTrial && <>{offer.freeTrial[0].toUpperCase() + offer.freeTrial.slice(1)} for new subscribers, then {offer.price} every {every}. </>}
      {platform === 'ios'
        ? <>Payment is charged to your Apple ID when you confirm. Shaadi24+ renews automatically at the same price every {every} unless you turn it off at least 24 hours before the period ends; manage it in your App Store account settings. </>
        : <>Payment is charged to your Google Play account. Shaadi24+ renews automatically every {every} until you cancel, which you can do any time in Google Play's Subscriptions. </>}
      <button type="button" onClick={() => openLegal('terms', onClose)} className="underline text-zinc-200">Terms of Use</button>
      {' · '}
      <button type="button" onClick={() => openLegal('privacy', onClose)} className="underline text-zinc-200">Privacy Policy</button>
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
