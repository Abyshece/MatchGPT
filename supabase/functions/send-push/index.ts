// ============================================================================
// send-push Edge Function
//
// Drains the push_queue table: each queued notification goes to the person's
// browsers (Web Push) and phones (Firebase Cloud Messaging, _shared/fcm.ts).
// Invoked by the `send-push` cron job (every minute while something is
// queued, see migration 20260926195517). Only callers with the job's shared
// secret (x-cron-secret header, kept in Supabase Vault) get through, so deploy
// with JWT verification off:
//   npx supabase functions deploy send-push --no-verify-jwt
//
// The Web Push (VAPID) key pair also lives in Vault. On the first run there
// is none, so this function creates it; browsers read the public half through
// the vapid_public_key() database function. Phones need the
// FIREBASE_SERVICE_ACCOUNT secret; until it's set their notifications wait
// (for a day: older ones are not sent).
//
// A notification counts as sent once it has reached one of the person's
// browsers or phones. A browser or phone that keeps failing (5 times) is
// skipped until it signs up again; one that's gone for good is removed.
//
// Web Push protocol:
//   POST <subscription.endpoint>
//   Headers:
//     TTL: <seconds>
//     Content-Encoding: aes128gcm
//     Content-Type: application/octet-stream
//     Authorization: vapid t=<JWT>, k=<VAPID-public-key-base64url>
//     Crypto-Key: dh=<ECDH-public-key-base64url>
//   Body: encrypted payload (aes128gcm)
//
// The web-push npm package handles VAPID signing and AES-GCM encryption for us.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.7';
// CORS: allowed browser origins come from the ALLOWED_ORIGINS secret.
import { withCors } from '../_shared/cors.ts';
import { fcmAccessToken, fcmConfig, fcmMessage, forgetFcmAccessToken, sendFcm } from '../_shared/fcm.ts';
import { GoogleAuthError } from '../_shared/googleAuth.ts';

// One row per notification and browser or phone (the pending_pushes view)
interface QueuedPush {
  queue_id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  subscription_id: string;    // the browser's push_subscriptions row, or the phone's push_devices row
  endpoint: string | null;    // browsers only
  p256dh: string | null;
  auth: string | null;
  failure_count: number;
  channel: 'web' | 'android' | 'ios';
  device_token: string | null;  // phones only
}

interface PushConfig {
  cron_secret: string | null;
  vapid_public_key: string | null;
  vapid_private_key: string | null;
}

const BATCH = 500;
const PHONES_AT_ONCE = 20;

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  // ---- Read env (both provided by Supabase) ----
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@shaadigpt.com';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[send-push] missing env vars');
    return jsonResponse({ success: false, error: 'Server not configured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Cron secret and VAPID keys from Vault ----
  const { data: configRows, error: configError } = await admin.rpc('send_push_config');
  const config = ((configRows ?? []) as PushConfig[])[0];
  if (configError || !config?.cron_secret) {
    console.error('[send-push] no config in Vault:', configError?.message);
    return jsonResponse({ success: false, error: 'Server not configured' }, 500);
  }
  if (!sameSecret(req.headers.get('x-cron-secret') ?? '', config.cron_secret)) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  let vapidPublicKey = config.vapid_public_key;
  let vapidPrivateKey = config.vapid_private_key;
  if (!vapidPublicKey || !vapidPrivateKey) {
    // First run: create the key pair. If another run got there first, the
    // database keeps and returns that pair instead.
    const keys = webpush.generateVAPIDKeys();
    const { data: saved, error: saveError } = await admin.rpc('save_vapid_keys', {
      p_public_key: keys.publicKey,
      p_private_key: keys.privateKey,
    });
    const pair = ((saved ?? []) as PushConfig[])[0];
    if (saveError || !pair?.vapid_public_key || !pair?.vapid_private_key) {
      console.error('[send-push] could not save VAPID keys:', saveError?.message);
      return jsonResponse({ success: false, error: 'Server not configured' }, 500);
    }
    vapidPublicKey = pair.vapid_public_key;
    vapidPrivateKey = pair.vapid_private_key;
    console.log('[send-push] created the VAPID key pair');
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // ---- 1. Fetch pending pushes, a notification's browsers and phones together ----
  const { data: pendingRows, error: fetchError } = await admin
    .from('pending_pushes')
    .select('*')
    .order('queue_id')
    .limit(BATCH);  // in batches, to stay within the function's time

  if (fetchError) {
    console.error('[send-push] fetch failed:', fetchError);
    return jsonResponse({ success: false, error: fetchError.message }, 500);
  }

  let pending = (pendingRows ?? []) as QueuedPush[];
  // A full batch may have cut the last notification's browsers and phones
  // short: it waits for the next run, whole
  if (pending.length === BATCH) {
    const last = pending[pending.length - 1].queue_id;
    if (pending[0].queue_id !== last) pending = pending.filter((p) => p.queue_id !== last);
  }

  if (pending.length === 0) {
    return jsonResponse({ success: true, sent: 0, failed: 0, message: 'no pending pushes' });
  }

  const sentQueueIds = new Set<string>();

  // ---- 2. Browsers (Web Push), all at once ----
  let sent = 0;
  let failed = 0;
  const failedSubscriptionIds: string[] = [];
  const deadSubscriptionIds: string[] = [];

  await Promise.all(pending.filter((p) => p.channel === 'web').map(async (p) => {
    const subscription = {
      endpoint: p.endpoint!,
      keys: { p256dh: p.p256dh!, auth: p.auth! },
    };

    const payload = JSON.stringify({
      title: p.title,
      body: p.body,
      data: p.data ?? {},
      tag: `${p.event_type}-${p.user_id}`,    // collapse same-type pushes for same user
    });

    try {
      await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60 * 24,  // 24h — drop if not delivered in a day
      });
      sent++;
      sentQueueIds.add(p.queue_id);
    } catch (e: unknown) {
      failed++;
      const err = e as { statusCode?: number; message?: string };

      // 410 Gone = subscription expired/revoked. Delete it.
      // 404 Not Found = same. Delete it.
      if (err.statusCode === 410 || err.statusCode === 404) {
        deadSubscriptionIds.push(p.subscription_id);
      } else {
        failedSubscriptionIds.push(p.subscription_id);
      }

      console.warn(`[send-push] failed for ${p.endpoint}: ${err.message ?? err}`);
    }
  }));

  // ---- 3. Phones (Firebase Cloud Messaging), a few at a time ----
  const phones = { sent: 0, failed: 0, removed: 0, waiting: 0 };
  const failedDeviceIds: string[] = [];
  const deadDeviceIds: string[] = [];
  const phoneRows = pending.filter((p) => p.channel !== 'web' && p.device_token);

  if (phoneRows.length) {
    const fcm = fcmConfig();
    let accessToken: string | null = null;
    if (!fcm) {
      console.warn(`[send-push] FIREBASE_SERVICE_ACCOUNT is not set: ${phoneRows.length} phone notification(s) wait`);
    } else {
      try {
        accessToken = await fcmAccessToken(fcm);
      } catch (e) {
        console.error('[send-push] Firebase sign-in failed:', e instanceof GoogleAuthError ? e.message : e);
      }
    }
    if (fcm && accessToken) {
      const queue = [...phoneRows];
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const { outcome, status, detail } = await sendFcm(fcm, accessToken!, fcmMessage({
            token: p.device_token!,
            eventType: p.event_type,
            title: p.title,
            body: p.body,
            data: p.data,
          }));
          if (outcome === 'sent') {
            phones.sent++;
            sentQueueIds.add(p.queue_id);
            continue;
          }
          phones.failed++;
          // Google stopped accepting our token: sign in afresh next time
          if (status === 401) forgetFcmAccessToken(fcm);
          if (outcome === 'gone') deadDeviceIds.push(p.subscription_id);
          else if (outcome === 'retry') failedDeviceIds.push(p.subscription_id);
          // 'setup': our key, project or message is wrong, not the phone
          (outcome === 'setup' ? console.error : console.warn)(`[send-push] ${p.channel} phone, ${outcome}: ${detail}`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PHONES_AT_ONCE, queue.length) }, worker));
    } else {
      phones.waiting = phoneRows.length;
    }
  }

  // ---- 4. Mark sent queue entries ----
  if (sentQueueIds.size > 0) {
    await admin
      .from('push_queue')
      .update({ sent_at: new Date().toISOString() })
      .in('id', [...sentQueueIds]);
  }

  // ---- 5. Count transient failures ----
  for (const subId of failedSubscriptionIds) {
    await admin.rpc('increment_push_failure', { sub_id: subId });
  }
  if (failedDeviceIds.length > 0) {
    await admin.rpc('record_push_device_failures', { p_device_ids: failedDeviceIds });
  }

  // ---- 6. Remove browsers and phones that are gone ----
  if (deadSubscriptionIds.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('id', deadSubscriptionIds);
  }
  if (deadDeviceIds.length > 0) {
    await admin.from('push_devices').delete().in('id', deadDeviceIds);
    phones.removed = deadDeviceIds.length;
  }

  return jsonResponse({
    success: true,
    sent,
    failed,
    dead_subscriptions_pruned: deadSubscriptionIds.length,
    phones,
  });
}));

// Compare without an early exit, so response timing doesn't leak the secret.
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
