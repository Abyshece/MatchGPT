// ============================================================================
// pushService
//
// Handles the browser-side push subscription flow:
//   1. Register the service worker
//   2. Ask the user for notification permission
//   3. Subscribe to the push manager using our VAPID public key
//   4. Save the subscription to the database
//   5. Unsubscribe + delete from DB on opt-out
//
// The VAPID public key comes from the database (vapid_public_key()); the
// send-push function creates the key pair and keeps it in Supabase Vault.
// ============================================================================

import { supabase } from './supabase';


// ----------------------------------------------------------------------------
// Capability detection
// ----------------------------------------------------------------------------

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// ----------------------------------------------------------------------------
// Service worker registration (idempotent — safe to call repeatedly)
// ----------------------------------------------------------------------------

let swRegPromise: Promise<ServiceWorkerRegistration> | null = null;

export function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) {
    return Promise.reject(new Error('Push notifications not supported on this browser'));
  }
  if (!swRegPromise) {
    swRegPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  return swRegPromise;
}

// ----------------------------------------------------------------------------
// Subscribe — full flow: permission → SW → push manager → DB
// ----------------------------------------------------------------------------

export interface SubscribeResult {
  success: boolean;
  error: string | null;
}

export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications not supported on this browser' };
  }

  const { data: vapidPublicKey, error: keyError } = await supabase.rpc('vapid_public_key');
  if (keyError || !vapidPublicKey) {
    return { success: false, error: 'Push notifications aren\'t set up yet. Please try again later.' };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permission denied. Enable notifications in browser settings.' };
    }

    // 2. Register service worker if not already
    const reg = await ensureServiceWorker();

    // 3. Subscribe (or reuse existing subscription)
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,           // required — only show user-visible pushes
        applicationServerKey: applicationServerKey as BufferSource,
      });
    }

    // 4. Extract keys + save to DB
    const subJson = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!p256dh || !auth) {
      return { success: false, error: 'Subscription is missing key material' };
    }

    // Upsert by (user_id, endpoint)
    const { error: dbError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 500),
          failure_count: 0,    // reset failure count on re-subscribe
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (dbError) {
      console.error('[pushService] failed to save subscription:', dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[pushService] subscribe failed:', msg);
    return { success: false, error: msg };
  }
}

// ----------------------------------------------------------------------------
// Unsubscribe — remove from push manager + DB
// ----------------------------------------------------------------------------

export async function unsubscribeFromPush(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { success: true, error: null };

  try {
    const reg = await ensureServiceWorker();
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      // Delete from DB
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);
    }

    return { success: true, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }
}

// ----------------------------------------------------------------------------
// Are we currently subscribed on this device?
// ----------------------------------------------------------------------------

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Helper: convert URL-safe base64 to Uint8Array (required for VAPID key)
// ----------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}
