// ============================================================================
// send-push Edge Function
//
// Drains the push_queue table and sends notifications via Web Push API.
// Invoked by the `send-push` cron job (every minute while something is queued,
// see migration 20260926195517). Only callers with the job's shared secret
// (x-cron-secret header, kept in Supabase Vault) get through, so deploy with
// JWT verification off: npx supabase functions deploy send-push --no-verify-jwt
//
// The Web Push (VAPID) key pair also lives in Vault. On the first run there
// is none, so this function creates it; browsers read the public half through
// the vapid_public_key() database function.
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

interface QueuedPush {
  queue_id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

interface PushConfig {
  cron_secret: string | null;
  vapid_public_key: string | null;
  vapid_private_key: string | null;
}

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

  // ---- 1. Fetch pending pushes (joined with subscriptions) ----
  const { data: pendingRows, error: fetchError } = await admin
    .from('pending_pushes')
    .select('*')
    .limit(100);  // process in batches to avoid timeouts

  if (fetchError) {
    console.error('[send-push] fetch failed:', fetchError);
    return jsonResponse({ success: false, error: fetchError.message }, 500);
  }

  const pending = (pendingRows ?? []) as QueuedPush[];

  if (pending.length === 0) {
    return jsonResponse({ success: true, sent: 0, failed: 0, message: 'no pending pushes' });
  }

  // ---- 2. Send each push in parallel ----
  let sent = 0;
  let failed = 0;
  const sentQueueIds: string[] = [];
  const failedSubscriptionIds: string[] = [];
  const deadSubscriptionIds: string[] = [];

  await Promise.all(pending.map(async (p) => {
    const subscription = {
      endpoint: p.endpoint,
      keys: { p256dh: p.p256dh, auth: p.auth },
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
      sentQueueIds.push(p.queue_id);
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

  // ---- 3. Mark sent queue entries ----
  if (sentQueueIds.length > 0) {
    await admin
      .from('push_queue')
      .update({ sent_at: new Date().toISOString() })
      .in('id', sentQueueIds);
  }

  // ---- 4. Increment failure_count on transient failures ----
  if (failedSubscriptionIds.length > 0) {
    for (const subId of failedSubscriptionIds) {
      await admin.rpc('increment_push_failure', { sub_id: subId });
    }
  }

  // ---- 5. Delete dead subscriptions ----
  if (deadSubscriptionIds.length > 0) {
    await admin
      .from('push_subscriptions')
      .delete()
      .in('id', deadSubscriptionIds);
  }

  return jsonResponse({
    success: true,
    sent,
    failed,
    dead_subscriptions_pruned: deadSubscriptionIds.length,
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
