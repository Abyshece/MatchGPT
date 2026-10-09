// ============================================================================
// Spotlight and Super Interest: bought one at a time in the phone apps
//
//   Spotlight (24 hours): the member is shown first, marked "Spotlight", to
//     people searching nearby whose search they fit anyway (the search
//     function ranks them). Bought, then started when the member likes.
//   Super Interest: a like with a short note that goes to the top of the other
//     person's Likes You and shows who sent it, even to members without
//     Shaadi24+. Shaadi24+ includes 3 a week; more are bought (1 or 5).
//
// The stores take the payment (consumable in-app products). The app passes
// the member's id with each purchase, reports it to the store-billing
// function ('pack'), which checks it with the store and adds the credits,
// then finishes the purchase so it can be bought again. A purchase the app
// couldn't report (no signal, the app closed) is still waiting in the store
// and is sent the next time the app opens (syncPacks).
// The database keeps the credits (supabase/migrations/…_spotlight_super_interest.sql).
// ============================================================================

import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { supabase } from './supabase';
import { StoreError, storePlatform } from './storePurchases';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { formatRupees } from './billingService';

export type PackKind = 'spotlight' | 'super_interest';

export interface Pack {
  id: string;                  // spotlight_24h, super_interest_1, super_interest_5
  kind: PackKind;
  quantity: number;
  amount: number;              // paise, our list price
  currency: string;
  google_product_id: string | null;
  apple_product_id: string | null;
}

export interface SpotlightRun {
  started_at: string;
  ends_at: string;
  views: number;               // searches it was shown in
  likes: number;               // likes received while it was on
}

export interface Boosts {
  spotlight: { credits: number; active: SpotlightRun | null; last: SpotlightRun | null };
  super_interest: { credits: number; free_per_week: number; free_left: number; next_free_at: string | null };
  products: Pack[];
}

/** A pack as the store sells it here: its own price text. */
export interface PackOffer {
  pack: Pack;
  storeId: string;
  price: string;               // "₹149.00"
}

export const SUPER_INTEREST_NOTE_MAX = 200;
export const SPOTLIGHT_HOURS = 24;

export async function fetchBoosts(): Promise<Boosts | null> {
  const { data, error } = await supabase.rpc('my_boosts');
  if (error || !data) return null;
  return data as unknown as Boosts;
}

export async function startSpotlight(): Promise<{ endsAt: string | null; error: string | null; code: string | null }> {
  const { data, error } = await supabase.rpc('start_spotlight');
  if (error) return { endsAt: null, error: error.message, code: error.hint || null };
  return { endsAt: (data as { ends_at?: string } | null)?.ends_at ?? null, error: null, code: null };
}

/** "18 h 12 min left", "40 min left" */
export function timeLeft(endsAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((Date.parse(endsAt) - now) / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h} h ${minutes % 60} min left` : `${minutes} min left`;
}

/** Our list price, when the store's isn't known (on the website) */
export const listPrice = (pack: Pack) => formatRupees(pack.amount);

const storeIdOf = (pack: Pack) => (storePlatform() === 'ios' ? pack.apple_product_id : pack.google_product_id);

/** The packs the store will sell here, with its prices. Empty on the website or before the store has them. */
export async function loadPackOffers(packs: Pack[]): Promise<PackOffer[]> {
  if (!storePlatform()) return [];
  const ids = packs.map(storeIdOf).filter((id): id is string => !!id);
  if (!ids.length) return [];
  const { products = [] } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: PURCHASE_TYPE.INAPP });
  return packs.flatMap((pack) => {
    const id = storeIdOf(pack);
    const product = products.find((p) => p.identifier === id);
    return id && product ? [{ pack, storeId: id, price: product.priceString }] : [];
  });
}

export interface PackGrant {
  granted: boolean;
  kind: PackKind;
  balance: number;
}

async function reportPack(tx: Transaction, storeId: string): Promise<PackGrant> {
  const platform = storePlatform();
  const body = platform === 'android'
    ? { action: 'pack', platform, productId: storeId, purchaseToken: tx.purchaseToken }
    : { action: 'pack', platform, jws: tx.jwsRepresentation };
  const { data, error } = await supabase.functions.invoke('store-billing', { body });
  if (error) {
    let message = 'Your purchase could not be checked. It will be added when the app next opens.';
    let code = 'FAILED';
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
      if (typeof details?.code === 'string') code = details.code;
    }
    throw new StoreError(message, code);
  }
  return data as PackGrant;
}

// Tells the store we've delivered the pack: on Android it can then be bought
// again (consumed), on iPhone the transaction is finished
async function finish(tx: Transaction): Promise<void> {
  try {
    if (storePlatform() === 'android') {
      if (tx.purchaseToken) await NativePurchases.consumePurchase({ purchaseToken: tx.purchaseToken });
    } else {
      await NativePurchases.acknowledgePurchase({ purchaseToken: tx.transactionId });
    }
  } catch (e) {
    // Android: the server consumed it already
    console.warn('[packs] finishing the purchase:', e);
  }
}

export type PackOutcome =
  | { status: 'done'; grant: PackGrant }
  | { status: 'cancelled' }
  | { status: 'pending' };   // waiting for the payment (some UPI and cash payments)

/** Opens the store's payment sheet for a pack, then has the server check it and add the credits. */
export async function buyPack(offer: PackOffer, userId: string): Promise<PackOutcome> {
  let tx: Transaction;
  try {
    tx = await NativePurchases.purchaseProduct({
      productIdentifier: offer.storeId,
      productType: PURCHASE_TYPE.INAPP,
      appAccountToken: userId,
      quantity: 1,
      isConsumable: false,              // consumed once the server has added it
      autoAcknowledgePurchases: false,
    });
  } catch (e) {
    const { code, message = '' } = (e ?? {}) as { code?: string; message?: string };
    if (code === 'USER_CANCELED' || /user ?cancel/i.test(message)) return { status: 'cancelled' };
    if (/pending/i.test(message)) return { status: 'pending' };
    throw new StoreError(message || 'The purchase did not go through. Please try again.', code || 'STORE_FAILED');
  }
  try {
    const grant = await reportPack(tx, offer.storeId);
    await finish(tx);
    return { status: 'done', grant };
  } catch (e) {
    if (e instanceof StoreError && e.code === 'PENDING') return { status: 'pending' };
    throw e;
  }
}

/**
 * Packs bought but not yet added (the app closed, no signal, a payment that
 * went through later): sent to the server and finished. Never throws.
 */
export async function syncPacks(userId: string): Promise<number> {
  const platform = storePlatform();
  if (!platform) return 0;
  let added = 0;
  try {
    const { purchases = [] } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, appAccountToken: userId });
    for (const tx of purchases) {
      if (platform === 'android' && tx.purchaseState === '2') continue;  // still waiting for the payment
      try {
        const grant = await reportPack(tx, tx.productIdentifier);
        if (grant.granted) added++;
        await finish(tx);
      } catch (e) {
        console.warn('[packs] not added yet:', e);
      }
    }
  } catch (e) {
    console.warn('[packs] sync failed:', e);
  }
  return added;
}
