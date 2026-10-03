// ============================================================================
// store-notifications Edge Function: the stores tell us what changed
//
// Google Play (Real-time developer notifications, through a Pub/Sub push
// subscription):
//   POST /store-notifications?provider=google&secret=<GOOGLE_RTDN_SECRET>
//   { message: { data: base64(JSON), messageId }, subscription }
//   A subscription notification (renewed, cancelled, on hold, recovered,
//   expired, revoked, …) re-reads the purchase from Google and saves it; a
//   voided purchase notification marks that charge refunded.
// App Store (App Store Server Notifications, version 2):
//   POST /store-notifications?provider=apple
//   { signedPayload }   signed by Apple, checked like a transaction
//   Saves the transaction and renewal record it carries (renewals, renewal
//   turned off/on, grace period, expiry, refund, revocation).
//
// Each delivery is handled once (billing_events). Answers 200 when done or
// when there's nothing to do, so the store stops resending; 500 for a
// passing failure, so it tries again.
//
// Setting up, once the apps are in the stores:
//   Google: Play Console → Monetization setup → Real-time developer
//     notifications: a Pub/Sub topic, with a push subscription to
//     https://<project>.supabase.co/functions/v1/store-notifications?provider=google&secret=<GOOGLE_RTDN_SECRET>
//   Apple: App Store Connect → the app → App Information → App Store Server
//     Notifications, Version 2, production and sandbox:
//     https://<project>.supabase.co/functions/v1/store-notifications?provider=apple
//
// Deployed with JWT verification off: Google is checked by the secret in the
// URL, Apple by its signature.
// ============================================================================

import { errorText, rest, serviceConfigured } from '../_shared/serviceRest.ts';
import { googlePlayConfig, GooglePlayError } from '../_shared/googlePlay.ts';
import {
  AppleJwsError, appleBundleId, verifyAppleJws,
  type AppleNotification, type AppleRenewalInfo, type AppleTransaction,
} from '../_shared/appleStore.ts';
import { applyAppleTransaction, applyGooglePurchase, refundCharge, StorePurchaseError } from '../_shared/storeBilling.ts';

const ok = (note = 'ok') => new Response(note, { status: 200 });
const retry = (note: string) => new Response(note, { status: 500 });

// Records a delivery; false if it was handled before
async function firstTime(id: string, event: string): Promise<boolean> {
  const rows = await rest<unknown[]>('billing_events?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id, event }),
  });
  return rows.length > 0;
}

// Lets a failed delivery be handled again when the store resends it
const forget = (id: string) => rest(`billing_events?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});

interface GoogleMessage {
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number };
  testNotification?: unknown;
}

async function google(req: Request, url: URL): Promise<Response> {
  const secret = Deno.env.get('GOOGLE_RTDN_SECRET') ?? '';
  if (!secret || url.searchParams.get('secret') !== secret) return new Response('Forbidden', { status: 403 });
  const cfg = googlePlayConfig();
  if (!cfg) return retry('Google Play not set up');

  const body = await req.json().catch(() => null);
  const messageId = body?.message?.messageId ?? body?.message?.message_id;
  let msg: GoogleMessage;
  try {
    msg = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body?.message?.data ?? ''), (c) => c.charCodeAt(0))));
  } catch {
    return ok('unreadable message ignored');
  }
  if (!messageId) return ok('no message id');
  if (msg.testNotification) return ok('test notification');
  if (msg.packageName && msg.packageName !== cfg.packageName) return ok('another app');

  const eventId = `google:${messageId}`;
  if (!(await firstTime(eventId, msg.voidedPurchaseNotification ? 'voided' : `subscription.${msg.subscriptionNotification?.notificationType ?? '?'}`))) {
    return ok('already handled');
  }
  const at = new Date(Number(msg.eventTimeMillis) || Date.now());
  try {
    const voided = msg.voidedPurchaseNotification;
    if (voided?.orderId) {
      // productType 1 = subscription
      await refundCharge('google_play', voided.orderId, at);
      if (voided.purchaseToken && voided.productType === 1) await applyGooglePurchase(cfg, voided.purchaseToken, null, at);
    }
    const token = msg.subscriptionNotification?.purchaseToken;
    if (token) await applyGooglePurchase(cfg, token, null, at);
    return ok();
  } catch (e) {
    if (e instanceof StorePurchaseError || (e instanceof GooglePlayError && [400, 404, 410].includes(e.status))) {
      console.warn('[store-notifications] google: nothing to do:', errorText(e));
      return ok('ignored');
    }
    console.error('[store-notifications] google failed:', errorText(e));
    await forget(eventId);
    return retry('failed');
  }
}

async function apple(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  let note: AppleNotification;
  try {
    note = await verifyAppleJws<AppleNotification>(body?.signedPayload ?? '');
  } catch (e) {
    console.warn('[store-notifications] apple: not a valid notification:', errorText(e));
    return new Response('Bad signature', { status: 400 });
  }
  if (note.notificationType === 'TEST') return ok('test notification');
  if (note.data?.bundleId && note.data.bundleId !== appleBundleId()) return ok('another app');

  const eventId = `apple:${note.notificationUUID}`;
  if (!(await firstTime(eventId, `${note.notificationType}${note.subtype ? `.${note.subtype}` : ''}`))) {
    return ok('already handled');
  }
  try {
    if (!note.data?.signedTransactionInfo) return ok('no transaction');
    const tx = await verifyAppleJws<AppleTransaction>(note.data.signedTransactionInfo);
    const renewal = note.data.signedRenewalInfo ? await verifyAppleJws<AppleRenewalInfo>(note.data.signedRenewalInfo) : null;
    await applyAppleTransaction(tx, renewal, null, new Date(note.signedDate ?? Date.now()));
    return ok();
  } catch (e) {
    if (e instanceof StorePurchaseError || e instanceof AppleJwsError) {
      console.warn('[store-notifications] apple: nothing to do:', errorText(e));
      return ok('ignored');
    }
    console.error('[store-notifications] apple failed:', errorText(e));
    await forget(eventId);
    return retry('failed');
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!serviceConfigured()) return retry('Server not configured');
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');
  if (provider === 'google') return await google(req, url);
  if (provider === 'apple') return await apple(req);
  return new Response('Unknown provider', { status: 400 });
});
