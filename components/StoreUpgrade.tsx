import React, { useEffect, useState } from 'react';
import { IconCheck, IconZap } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { FEATURES_FREE_NOW, proBenefits, type PlanId } from '../lib/billingService';
import {
  buyOffer, loadStoreOffers, restoreStorePurchases, storeName, storePlatform, type StoreOffer,
} from '../lib/storePurchases';

// ============================================================================
// StoreUpgrade: the Shaadi24+ plans inside the phone apps
//
// Prices come from the store (in the person's own currency); the store's
// payment sheet takes the payment, and the server checks the purchase before
// Pro turns on (lib/storePurchases.ts). Shows what the stores require next to
// an auto-renewing subscription: its length and price, that it renews until
// cancelled, where to cancel, Restore purchases, and the Terms and Privacy
// Policy. Until the store has the products, it says Shaadi24+ is coming soon.
// ============================================================================

interface StoreUpgradeProps {
  paying: boolean;
  setPaying: (paying: boolean) => void;
  onPurchased: (result: { trialEndsAt: string | null; renewsAt: string | null }) => void;
  onClose: () => void;
}

const per = (period: StoreOffer['period']) => (period === 'yearly' ? 'year' : 'month');

function perMonth(offer: StoreOffer): string | null {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 })
      .format(offer.amount / 12);
  } catch {
    return null;
  }
}

// Terms and Privacy open as pages of their own (App.tsx follows the address)
function openLegal(page: 'terms' | 'privacy', close: () => void) {
  close();
  window.location.hash = '';
  window.location.hash = page;
}

const StoreUpgrade: React.FC<StoreUpgradeProps> = ({ paying, setPaying, onPurchased, onClose }) => {
  const { session, refreshProfile, proForAll } = useAuth();
  const platform = storePlatform();
  const [offers, setOffers] = useState<StoreOffer[] | null>(null);
  const [planId, setPlanId] = useState<PlanId>('monthly');
  const [note, setNote] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let live = true;
    loadStoreOffers()
      .then((o) => { if (live) setOffers(o); })
      .catch(() => { if (live) setOffers([]); });
    return () => { live = false; };
  }, []);

  const offer = offers?.find((o) => o.planId === planId) ?? offers?.[0];
  const monthly = offers?.find((o) => o.period === 'monthly');
  const yearly = offers?.find((o) => o.period === 'yearly');
  const saving = monthly && yearly && monthly.currency === yearly.currency && monthly.amount > 0
    ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;
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

  const available = !!offers && offers.length > 0;

  return (
    <>
      {available && (
        <div className="grid grid-cols-2 gap-2 mb-5" role="radiogroup" aria-label="Plan">
          {offers.map((o) => {
            const selected = o.planId === offer?.planId;
            const monthlyPrice = o.period === 'yearly' ? perMonth(o) : null;
            return (
              <button
                key={o.planId}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPlanId(o.planId)}
                disabled={busy}
                className={`relative rounded-2xl border-2 px-3 py-3 text-left transition-colors ${
                  selected
                    ? 'border-gray-900 dark:border-white bg-white/80 dark:bg-white/10'
                    : 'border-gray-200/80 dark:border-zinc-700 bg-white/40 dark:bg-zinc-800/40 hover:border-gray-300 dark:hover:border-zinc-600'
                }`}
              >
                {o.period === 'yearly' && saving > 0 && (
                  <span className="absolute -top-2.5 right-2 text-[10px] font-bold plus-solid px-1.5 py-0.5 rounded">
                    SAVE {saving}%
                  </span>
                )}
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{o.period === 'yearly' ? 'Yearly' : 'Monthly'}</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {o.price}
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400"> /{per(o.period)}</span>
                </div>
                {monthlyPrice && <div className="text-[11px] text-gray-500 dark:text-gray-400">{monthlyPrice} a month</div>}
              </button>
            );
          })}
        </div>
      )}

      <ul className="space-y-2 mb-6">
        {proBenefits(proForAll).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="text-gray-900 dark:text-white flex-shrink-0 mt-0.5"><IconCheck className="w-4 h-4" /></span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {proForAll && <p className="-mt-4 mb-6 text-xs text-gray-500 dark:text-gray-400">{FEATURES_FREE_NOW}</p>}

      {note && (
        <p
          role={note.kind === 'error' ? 'alert' : 'status'}
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            note.kind === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200'
          }`}
        >
          {note.text}
        </p>
      )}

      <button
        onClick={buy}
        disabled={!available || busy}
        className="w-full plus-solid font-bold py-3.5 rounded-2xl shadow-lg hover:opacity-90 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <IconZap />
        {!offers ? 'Loading…' : !available ? 'Coming soon' : paying ? `Opening ${store}…` : `Subscribe for ${offer?.price}/${per(offer!.period)}`}
      </button>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-3 leading-relaxed">
        {!offers ? ' ' : !available ? 'Shaadi24+ is coming to the app soon.' : (
          <>
            {offer?.freeTrial && <>{offer.freeTrial[0].toUpperCase() + offer.freeTrial.slice(1)} for new subscribers, then {offer.price}/{per(offer.period)}. </>}
            {platform === 'ios'
              ? <>Payment is charged to your Apple ID when you confirm. Shaadi24+ renews automatically at the same price each {per(offer!.period)} unless you turn it off at least 24 hours before the period ends; manage it in your App Store account settings. </>
              : <>Payment is charged to your Google Play account. Shaadi24+ renews automatically each {per(offer!.period)} until you cancel, which you can do any time in Google Play's Subscriptions. </>}
            <button type="button" onClick={() => openLegal('terms', onClose)} className="underline">Terms of Use</button>
            {' · '}
            <button type="button" onClick={() => openLegal('privacy', onClose)} className="underline">Privacy Policy</button>
          </>
        )}
      </p>

      {available && (
        <button
          type="button"
          onClick={restore}
          disabled={busy}
          className="w-full text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mt-3 py-2 disabled:opacity-40"
        >
          {restoring ? 'Restoring…' : 'Restore purchases'}
        </button>
      )}
    </>
  );
};

export default StoreUpgrade;
