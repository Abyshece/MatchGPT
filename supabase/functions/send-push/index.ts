// ============================================================================
// send-push Edge Function
//
// Drains the push_queue table and sends notifications via Web Push API.
// Invoked by:
//   1. Supabase cron (every minute, see deploy notes) — primary trigger
//   2. Direct invocation from the client right after a like/match for low latency
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
// We use `https://esm.sh/web-push@3` which handles VAPID signing and AES-GCM
// encryption for us. The Deno-compatible version is at @denosaurs/web-push.
// ============================================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';
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

serve(withCors(async (_req: Request): Promise<Response> => {
  // ---- Read env ----
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@shaadigpt.com';

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    console.error('[send-push] missing env vars');
    return jsonResponse({ success: false, error: 'Server not configured' }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
