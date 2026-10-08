import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '../constants';
import { PERIODS, formatDate, type PlanId } from '../lib/billingService';
import { PlanCards, PlanSaving, StoreTerms, useStoreUpgrade } from './StoreUpgrade';

// ============================================================================
// ChangePlanModal: Settings → Shaadi24+ → Change plan, for a subscriber in the
// app of the store that bills them. The four plans with theirs marked, what
// the chosen one saves, and when the change happens. Buying another of the
// plans is how both stores change a plan, and neither charges twice:
//   - App Store: the plans are on one level, so a plan of another length
//     starts when the current one renews (Apple's rule), charged then.
//   - Google Play: the plans are base plans of one subscription, so Google
//     switches with the subscription's default replacement mode, set in Play
//     Console (docs/store/README.md: "Charge at the next billing date"); the
//     server closes the old purchase (linkedPurchaseToken).
// ============================================================================

interface ChangePlanModalProps {
  current: PlanId;
  renewsAt: string | null;    // when the current period ends
  onClose: () => void;
  onChanged: () => void;      // the change went through: Settings reads it again
}

const ChangePlanModal: React.FC<ChangePlanModalProps> = ({ current, renewsAt, onClose, onChanged }) => {
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ planId: PlanId; renewsAt: string | null } | null>(null);
  const store = useStoreUpgrade({
    paying, setPaying, current,
    onPurchased: (r) => {
      if (store.offer) setDone({ planId: store.offer.planId, renewsAt: r.renewsAt });
      onChanged();
    },
  });

  const close = () => { if (!paying) onClose(); };
  const onEscape = useEffectEvent(() => close());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const ios = store.platform === 'ios';
  const chosen = store.offer;
  const label = chosen ? PERIODS[chosen.period].label : '';
  const when = renewsAt ? formatDate(renewsAt) : null;

  // When the change happens, as the store does it
  const timing = ios
    ? `Apple moves you to the new plan when your current one renews${when ? ` on ${when}` : ''}, and charges its price then. Nothing is charged today.`
    : "Google Play shows the price and when you'll be charged before you confirm. What's left of your current plan isn't lost.";

  const doneText = done && (ios
    ? <>Your plan changes to <strong className="text-gray-900 dark:text-white">{PERIODS[done.planId].label}</strong>{when ? <> on <strong className="text-gray-900 dark:text-white">{when}</strong></> : null}, when your current one renews. Until then nothing changes.</>
    : <>You're now on <strong className="text-gray-900 dark:text-white">{PERIODS[done.planId].label}</strong>.{done.renewsAt ? <> It renews on <strong className="text-gray-900 dark:text-white">{formatDate(done.renewsAt)}</strong>.</> : null}</>);

  const buttonLabel = done ? 'Done'
    : !store.offers ? 'Loading…'
      : !store.available || !chosen ? 'Not available right now'
        : store.paying ? `Opening ${store.store}…`
          : `Switch to ${label} · ${chosen.price}`;

  return createPortal(
    <div data-popup className="fixed inset-0 z-[500] flex items-center justify-center popup-backdrop p-3 sm:p-4 animate-fade-in" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-plan-title"
        data-testid="change-plan"
        className="relative w-full max-w-md max-h-full sm:max-h-[min(820px,92vh)] rounded-[28px] bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
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
          <div className="pt-9 text-center">
            <h2 id="change-plan-title" className="text-[22px] leading-snug font-bold">{done ? 'Plan changed' : 'Change your plan'}</h2>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-zinc-400">
              {done ? doneText : 'The longer the plan, the less you pay a week.'}
            </p>
          </div>
          {!done && (
            <div className="mt-6">
              <PlanCards offers={store.offers} chosen={chosen?.planId} busy={store.busy} onPick={store.pick} current={current} />
              <PlanSaving offer={chosen} offers={store.offers} />
              {store.available && <p className="mt-2 text-xs text-gray-600 dark:text-zinc-300 text-center" data-testid="change-timing">{timing}</p>}
            </div>
          )}
        </div>

        <div className="flex-none px-6 pt-3 pb-4 border-t border-gray-100 dark:border-zinc-800 space-y-3">
          {store.note && !done && (
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
          {!done && store.available && <StoreTerms offer={chosen} platform={store.platform} onClose={onClose} />}
          <button
            type="button"
            onClick={done ? onClose : store.buy}
            disabled={!done && (!store.available || !chosen || store.busy)}
            data-testid="change-plan-button"
            className="w-full rounded-full plus-solid font-semibold text-base py-3.5 hover:opacity-90 active:scale-[0.99] transition disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ChangePlanModal;
