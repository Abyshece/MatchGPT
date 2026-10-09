import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  buyPack, fetchBoosts, listPrice, loadPackOffers, SPOTLIGHT_HOURS, startSpotlight, timeLeft,
  type Boosts, type Pack, type PackOffer,
} from '../lib/boosts';
import { storeName, storePlatform } from '../lib/storePurchases';
import { IconStar, IconSparkles } from '../constants';

// ============================================================================
// Spotlight & Super Interest (lib/boosts.ts), bought one at a time in the
// phone apps: Spotlight shows the member first to people searching nearby for
// 24 hours; Super Interests stand out in Likes You with a note. Members
// without the app see what they are and where to get them.
// ============================================================================

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const Stat: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="flex-1 rounded-lg bg-white/70 dark:bg-zinc-900/60 px-3 py-2">
    <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    <p className="text-xs text-gray-600 dark:text-gray-300">{label}</p>
  </div>
);

const BoostsView: React.FC<{ onOpenSearch?: () => void }> = ({ onOpenSearch }) => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [boosts, setBoosts] = useState<Boosts | null>(null);
  const [offers, setOffers] = useState<PackOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  const userId = session?.user.id;
  const platform = storePlatform();

  const load = useCallback(async () => {
    const b = await fetchBoosts();
    setBoosts(b);
    if (b && platform) setOffers(await loadPackOffers(b.products).catch(() => []));
  }, [platform]);
  useEffect(() => { void load(); }, [load]);
  // The time left on a Spotlight, every minute
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setBusy('start');
    const { error } = await startSpotlight();
    setBusy(null);
    if (error) showToast(error, 'error');
    else showToast(`Your Spotlight is on for ${SPOTLIGHT_HOURS} hours`, 'success');
    await load();
  };

  const buy = async (offer: PackOffer) => {
    if (!userId) return;
    setBusy(offer.pack.id);
    try {
      const outcome = await buyPack(offer, userId);
      if (outcome.status === 'pending') {
        showToast('Waiting for the payment. It is added once the payment goes through.', 'info');
      } else if (outcome.status === 'done' && offer.pack.kind === 'spotlight' && !boosts?.spotlight.active) {
        // Bought to use: on straight away
        const { error } = await startSpotlight();
        showToast(error ?? `Your Spotlight is on for ${SPOTLIGHT_HOURS} hours`, error ? 'error' : 'success');
      } else if (outcome.status === 'done') {
        showToast(offer.pack.kind === 'spotlight' ? 'Spotlight added' : `${plural(offer.pack.quantity, 'Super Interest')} added`, 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'The purchase did not go through.', 'error');
    } finally {
      setBusy(null);
      await load();
    }
  };

  const offerFor = (pack: Pack) => offers.find((o) => o.pack.id === pack.id);
  const packs = (kind: Pack['kind']) => (boosts?.products ?? []).filter((p) => p.kind === kind);
  const priceOf = (pack: Pack) => offerFor(pack)?.price ?? listPrice(pack);
  const single = packs('super_interest').find((p) => p.quantity === 1);

  const buyButton = (pack: Pack, label: string, primary = false) => {
    const offer = offerFor(pack);
    if (!offer) return null;
    const save = single && pack.kind === 'super_interest' && pack.quantity > 1
      ? Math.round((single.amount * pack.quantity - pack.amount) / 100) : 0;
    return (
      <button key={pack.id} type="button" onClick={() => buy(offer)} disabled={!!busy}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl font-semibold disabled:opacity-50 ${primary
          ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
          : 'border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white hover:border-amber-500'}`}>
        <span>{label}{save > 0 && <span className="ml-2 text-xs text-green-600 dark:text-green-400">Save ₹{save}</span>}</span>
        <span>{busy === pack.id ? '…' : offer.price}</span>
      </button>
    );
  };

  const spot = boosts?.spotlight;
  const si = boosts?.super_interest;
  const spotlightPack = packs('spotlight')[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="boosts-view">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Spotlight &amp; Super Interest</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Be seen first, or stand out to one person. One at a time, no plan needed.
          </p>
        </div>

        {!boosts ? (
          <div className="h-48 rounded-2xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />
        ) : (
          <>
            <section aria-labelledby="spotlight-title" data-testid="spotlight-card"
              className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/30 dark:to-rose-950/20 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="spotlight-title" className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><span aria-hidden="true" className="text-amber-600 dark:text-amber-400 [&>svg]:w-5 [&>svg]:h-5"><IconSparkles /></span>Spotlight</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    For {SPOTLIGHT_HOURS} hours you're shown first, marked Spotlight, to people searching in your city or
                    state whose search you fit.
                  </p>
                </div>
                {spot?.active && (
                  <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-amber-500 text-white text-xs font-bold">On now</span>
                )}
              </div>

              {spot?.active ? (
                <>
                  <p className="font-semibold text-gray-900 dark:text-white" data-testid="spotlight-left">{timeLeft(spot.active.ends_at)}</p>
                  <div className="flex gap-2">
                    <Stat value={spot.active.views} label={spot.active.views === 1 ? 'search shown in' : 'searches shown in'} />
                    <Stat value={spot.active.likes} label={spot.active.likes === 1 ? 'new like' : 'new likes'} />
                  </div>
                </>
              ) : spot && spot.credits > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 dark:text-gray-200">You have {plural(spot.credits, 'Spotlight')} ready.</p>
                  <button type="button" onClick={start} disabled={!!busy}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-50">
                    {busy === 'start' ? 'Starting…' : `Start my Spotlight (${SPOTLIGHT_HOURS} hours)`}
                  </button>
                </div>
              ) : platform && spotlightPack && offerFor(spotlightPack) ? (
                buyButton(spotlightPack, `Get Spotlight for ${SPOTLIGHT_HOURS} hours`, true)
              ) : spotlightPack ? (
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {platform ? 'Spotlight is not on sale yet.' : `Spotlight is bought in the Shaadi24 app (${priceOf(spotlightPack)}).`}
                </p>
              ) : null}

              {spot?.last && !spot.active && (
                <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="spotlight-last">
                  Your last Spotlight was shown in {plural(spot.last.views, 'search', 'searches')} and brought {plural(spot.last.likes, 'like')}.
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Works best with a clear photo and a full profile, on an evening or a weekend when more people search.
              </p>
            </section>

            <section aria-labelledby="si-card-title" data-testid="super-interest-card"
              className="rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 flex-shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center" aria-hidden="true">
                  <IconStar />
                </span>
                <div className="min-w-0">
                  <h2 id="si-card-title" className="text-lg font-bold text-gray-900 dark:text-white">Super Interest</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    A like with a note that goes to the top of their Likes You and shows who you are, even if they
                    don't have Shaadi24+. Send one from any profile.
                  </p>
                </div>
              </div>
              {si && (
                <p className="text-sm font-medium text-gray-900 dark:text-white" data-testid="super-interest-count">
                  {si.free_per_week > 0 ? `${si.free_left} of ${si.free_per_week} free this week with Shaadi24+` : 'None included without Shaadi24+'}
                  {si.credits > 0 ? ` · ${plural(si.credits, 'bought one', 'bought ones')} left` : ''}
                </p>
              )}
              {platform ? (
                <div className="space-y-2">
                  {packs('super_interest').map((p) => buyButton(p, p.quantity === 1 ? '1 Super Interest' : `${p.quantity} Super Interests`))}
                  {offers.every((o) => o.pack.kind !== 'super_interest') && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">Super Interests are not on sale yet.</p>
                  )}
                </div>
              ) : single ? (
                <p className="text-sm text-gray-700 dark:text-gray-200">More are bought in the Shaadi24 app ({priceOf(single)} each).</p>
              ) : null}
              {onOpenSearch && (
                <button type="button" onClick={onOpenSearch} className="text-sm font-semibold text-gray-900 dark:text-white underline">
                  Find someone to send one to
                </button>
              )}
            </section>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {platform ? `Paid through ${storeName(platform)}. ` : ''}Each Spotlight and Super Interest is used once and
              doesn't renew. A Spotlight runs for {SPOTLIGHT_HOURS} hours from when it starts. Refunds go through the
              store you paid; see Refunds in Help.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BoostsView;
