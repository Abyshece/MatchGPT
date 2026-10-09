import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { hasLiked, likeUser } from '../lib/likesService';
import {
  buyPack, fetchBoosts, listPrice, loadPackOffers, SUPER_INTEREST_NOTE_MAX, type Boosts, type PackOffer,
} from '../lib/boosts';
import { storePlatform } from '../lib/storePurchases';
import { IconStar } from '../constants';
import type { MatchCandidate } from '../types';

// ============================================================================
// Super Interest (lib/boosts.ts): a like with a short note that goes to the
// top of the other person's Likes You and shows who sent it, even to members
// without Shaadi24+. Shaadi24+ includes 3 a week; more are bought here, in the
// phone apps (1 or 5 at a time).
// ============================================================================

const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long' });

const SuperInterestSheet: React.FC<{
  candidate: MatchCandidate;
  onClose: () => void;
  onSent: (matchId: string | null) => void;
  onUpgrade?: () => void;
}> = ({ candidate, onClose, onSent, onUpgrade }) => {
  const { session, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [boosts, setBoosts] = useState<Boosts | null>(null);
  const [offers, setOffers] = useState<PackOffer[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;
  const inApp = !!storePlatform();

  const load = useCallback(async () => {
    const b = await fetchBoosts();
    setBoosts(b);
    if (b && inApp) {
      setOffers(await loadPackOffers(b.products.filter((p) => p.kind === 'super_interest')).catch(() => []));
    }
  }, [inApp]);
  useEffect(() => { void load(); }, [load]);

  const si = boosts?.super_interest;
  const canSend = !!si && (si.free_left > 0 || si.credits > 0);
  const name = candidate.name || 'them';

  const send = async () => {
    if (!userId) return;
    setBusy('send');
    setError(null);
    const result = await likeUser(userId, candidate.id, true, note);
    setBusy(null);
    if (!result.success) {
      if (result.code === 'NO_SUPER_INTEREST') await load();
      setError(result.error ?? 'Could not send it. Please try again.');
      return;
    }
    showToast(`Super Interest sent to ${name} ⭐`, 'success');
    void refreshProfile();
    onSent(result.matched && result.matchId ? result.matchId : null);
  };

  const buy = async (offer: PackOffer) => {
    if (!userId) return;
    setBusy(offer.pack.id);
    setError(null);
    try {
      const outcome = await buyPack(offer, userId);
      if (outcome.status === 'pending') showToast('Waiting for the payment. Your Super Interests are added once it goes through.', 'info');
      if (outcome.status === 'done') showToast(`${offer.pack.quantity === 1 ? 'Super Interest' : `${offer.pack.quantity} Super Interests`} added`, 'success');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The purchase did not go through.');
    } finally {
      setBusy(null);
    }
  };

  const single = offers.find((o) => o.pack.quantity === 1);
  const cheapest = boosts?.products.find((p) => p.kind === 'super_interest' && p.quantity === 1);
  const allowance = !si ? '…'
    : si.free_left > 0 ? `${si.free_left} of ${si.free_per_week} free this week with Shaadi24+${si.credits ? `, and ${si.credits} bought` : ''}`
    : si.credits > 0 ? `You have ${si.credits} Super Interest${si.credits === 1 ? '' : 's'}`
    : si.free_per_week > 0 && si.next_free_at ? `This week's 3 are used. The next free one comes on ${weekday(si.next_free_at)}.`
    : 'You have no Super Interests yet.';

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center popup-backdrop animate-fade-in"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="si-title" data-testid="super-interest-sheet"
        className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center" aria-hidden="true">
            <IconStar />
          </span>
          <div className="min-w-0">
            <h2 id="si-title" className="text-lg font-bold text-gray-900 dark:text-white">Super Interest for {name}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Goes to the top of {name}'s Likes You with your note, and shows who you are even without Shaadi24+.
            </p>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          A note (optional)
          <textarea value={note} onChange={(e) => { setNote(e.target.value.slice(0, SUPER_INTEREST_NOTE_MAX)); setError(null); }} rows={3}
            placeholder={`What made you want to know ${name}?`}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-base text-gray-900 dark:text-white" />
          <span className="block text-right text-xs text-gray-400">{note.length}/{SUPER_INTEREST_NOTE_MAX}</span>
        </label>

        <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="super-interest-allowance">{allowance}</p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {canSend ? (
          <button type="button" onClick={send} disabled={!!busy}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-50">
            {busy === 'send' ? 'Sending…' : 'Send Super Interest'}
          </button>
        ) : boosts && inApp && offers.length > 0 ? (
          <div className="space-y-2">
            {offers.map((o) => {
              const save = single && o.pack.quantity > 1
                ? Math.round(((single.pack.amount * o.pack.quantity - o.pack.amount) / 100)) : 0;
              return (
                <button key={o.pack.id} type="button" onClick={() => buy(o)} disabled={!!busy}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 hover:border-amber-500 disabled:opacity-50">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {o.pack.quantity === 1 ? '1 Super Interest' : `${o.pack.quantity} Super Interests`}
                    {save > 0 && <span className="ml-2 text-xs font-semibold text-green-700 dark:text-green-400">Save ₹{save}</span>}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">{busy === o.pack.id ? '…' : o.price}</span>
                </button>
              );
            })}
          </div>
        ) : boosts ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {inApp ? 'Super Interests are not on sale yet.' : `Super Interests are bought in the Shaadi24 app${cheapest ? ` (${listPrice(cheapest)} each)` : ''}.`}
          </p>
        ) : null}

        {boosts && !canSend && si?.free_per_week === 0 && onUpgrade && (
          <button type="button" onClick={onUpgrade} className="w-full text-sm font-semibold text-gray-900 dark:text-white underline">
            Shaadi24+ includes 3 Super Interests a week
          </button>
        )}
        <button type="button" onClick={onClose} disabled={!!busy}
          className="w-full py-2 text-sm font-medium text-gray-500 dark:text-gray-400">Not now</button>
      </div>
    </div>,
    document.body,
  );
};

/** The star next to Like: opens the Super Interest sheet; hidden once they're liked. */
export const SuperInterestButton: React.FC<{
  candidate: MatchCandidate;
  onSent: (matchId: string | null) => void;
  onUpgrade?: () => void;
}> = ({ candidate, onSent, onUpgrade }) => {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  useEffect(() => {
    if (!session?.user.id) return;
    let live = true;
    hasLiked(session.user.id, candidate.id).then((l) => { if (live) setLiked(l); });
    return () => { live = false; };
  }, [session?.user.id, candidate.id]);
  if (!session || liked !== false) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={`Send ${candidate.name || 'them'} a Super Interest`} title="Super Interest"
        className="h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20">
        <span className="w-4 h-4" aria-hidden="true"><IconStar /></span> Super Interest
      </button>
      {open && (
        <SuperInterestSheet candidate={candidate} onClose={() => setOpen(false)} onUpgrade={onUpgrade}
          onSent={(matchId) => { setOpen(false); setLiked(true); onSent(matchId); }} />
      )}
    </>
  );
};

export default SuperInterestSheet;
