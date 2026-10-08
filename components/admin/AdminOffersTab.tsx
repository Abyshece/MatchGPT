import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { deleteOffer, fetchOffers, redeemLinks, saveOffer, type Offer, type OfferDraft } from '../../lib/adminGrowth';
import { OfferBannerView } from '../website/OfferBanner';

// ============================================================================
// Admin → Offers: a code shown in a banner on the website's home page, from
// April to May, say. Apple and Google only let subscriptions be discounted
// with their own codes, so the code is made first in App Store Connect
// (Subscriptions → the subscription → Offer Codes, with a custom code) or Play
// Console (Promo codes), then entered here. The banner links to each store's
// page for redeeming it. The newest offer running now is the one shown.
// ============================================================================

const field = 'w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600';
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-zinc-300 mb-1';

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const BLANK: OfferDraft = {
  title: '', banner_text: 'Get Shaadi24+ for less', code: '', stores: 'both', starts_at: new Date().toISOString(), ends_at: null, active: true,
};

function state(o: Offer): { label: string; tone: string } {
  const now = Date.now();
  if (!o.active) return { label: 'Off', tone: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300' };
  if (new Date(o.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
  if (o.ends_at && new Date(o.ends_at).getTime() <= now) return { label: 'Ended', tone: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300' };
  return { label: 'Running', tone: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
}

const AdminOffersTab: React.FC = () => {
  const { showToast } = useToast();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { offers, error } = await fetchOffers();
    if (error) showToast(`Couldn't load offers: ${error}`, 'error');
    setOffers(offers);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const codeOk = !!draft && /^[A-Za-z0-9]{3,64}$/.test(draft.code.trim());

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await saveOffer(draft);
    setSaving(false);
    if (error) {
      showToast(`Couldn't save: ${error}`, 'error');
      return;
    }
    showToast('Offer saved', 'success');
    setDraft(null);
    void load();
  };

  const remove = async (o: Offer) => {
    if (!window.confirm(`Delete the offer "${o.title}"? The banner stops showing.`)) return;
    const { error } = await deleteOffer(o.id);
    if (error) showToast(`Couldn't delete: ${error}`, 'error');
    else void load();
  };

  return (
    <div data-testid="admin-offers">
      <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/40 p-4 text-sm text-gray-600 dark:text-zinc-300 mb-4 leading-relaxed">
        First make the code in <strong>App Store Connect</strong> (Monetization → Subscriptions → a subscription → Offer Codes, with a
        custom code) and in <strong>Play Console</strong> (Monetize → Promo codes). Then enter the same code here: the home page shows the
        banner while the offer runs, with a link to redeem it in each store.
      </div>
      <div className="flex justify-end mb-4">
        <button type="button" onClick={() => setDraft({ ...BLANK, starts_at: new Date().toISOString() })} className="h-9 px-4 rounded-md plus-solid text-sm font-semibold">New offer</button>
      </div>

      {offers === null ? (
        <div className="h-32 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : offers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">No offers yet.</p>
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => {
            const s = state(o);
            return (
              <li key={o.id} className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="offer">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{o.title} <span className="font-mono font-normal text-gray-500 dark:text-zinc-400">· {o.code}</span></p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {new Date(o.starts_at).toLocaleString()} → {o.ends_at ? new Date(o.ends_at).toLocaleString() : 'no end'} ·{' '}
                      {o.stores === 'both' ? 'App Store and Google Play' : o.stores === 'app_store' ? 'App Store' : 'Google Play'}
                    </p>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>
                </div>
                <div className="mt-3"><OfferBannerView offer={o} /></div>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => setDraft({ ...o })} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Edit</button>
                  <button type="button" onClick={() => remove(o)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 popup-backdrop animate-fade-in" onClick={() => !saving && setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="offer-title" className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
              <h2 id="offer-title" className="text-base font-semibold text-gray-900 dark:text-white">{draft.id ? 'Edit offer' : 'New offer'}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label htmlFor="offer-name" className={labelClass}>Name (for admins)</label>
                <input id="offer-name" value={draft.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="Diwali 2026" className={field} />
              </div>
              <div>
                <label htmlFor="offer-text" className={labelClass}>Banner text</label>
                <input id="offer-text" value={draft.banner_text} maxLength={140} onChange={(e) => set('banner_text', e.target.value)} className={field} />
              </div>
              <div>
                <label htmlFor="offer-code" className={labelClass}>Code (exactly as in the stores; letters and numbers)</label>
                <input id="offer-code" value={draft.code} maxLength={64} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="DIWALI50" className={`${field} font-mono`} />
                {draft.code && !codeOk && <p className="mt-1 text-xs text-red-600">3 to 64 letters and numbers, no spaces.</p>}
              </div>
              <div>
                <label htmlFor="offer-stores" className={labelClass}>Redeemed in</label>
                <select id="offer-stores" value={draft.stores} onChange={(e) => set('stores', e.target.value as OfferDraft['stores'])} className={field}>
                  <option value="both">App Store and Google Play</option>
                  <option value="app_store">App Store only</option>
                  <option value="google_play">Google Play only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="offer-start" className={labelClass}>Starts</label>
                  <input id="offer-start" type="datetime-local" value={toLocal(draft.starts_at)} onChange={(e) => set('starts_at', fromLocal(e.target.value) ?? new Date().toISOString())} className={field} />
                </div>
                <div>
                  <label htmlFor="offer-end" className={labelClass}>Ends (optional)</label>
                  <input id="offer-end" type="datetime-local" value={toLocal(draft.ends_at)} onChange={(e) => set('ends_at', fromLocal(e.target.value))} className={field} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} className="rounded" />
                On (shown on the home page while it runs)
              </label>
              <div>
                <p className={labelClass}>Preview</p>
                <OfferBannerView offer={{ ...draft, code: draft.code || 'CODE' }} />
                {codeOk && (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-zinc-400 break-all">
                    {[redeemLinks(draft).appStore, redeemLinks(draft).googlePlay].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
              <button type="button" onClick={() => setDraft(null)} disabled={saving} className="h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium">Cancel</button>
              <button type="button" onClick={save} disabled={saving || !draft.title.trim() || !draft.banner_text.trim() || !codeOk} className="h-9 px-4 rounded-md plus-solid text-sm font-semibold disabled:opacity-40">
                {saving ? 'Saving…' : 'Save offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOffersTab;
