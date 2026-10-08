// ============================================================================
// Firebase Cloud Messaging: notifications to the phone apps
//
// FCM delivers to Android phones itself, and to iPhones through Apple's push
// service (the APNs key is uploaded to the Firebase project once). The
// FIREBASE_SERVICE_ACCOUNT secret holds the JSON key of a service account of
// that Firebase project (Project settings → Service accounts → Generate new
// private key); its project_id says which project sends.
//
// FCM_API_BASE: only for local testing against a stand-in.
// ============================================================================

import { forgetGoogleAccessToken, googleAccessToken, serviceAccountFrom, type ServiceAccount } from './googleAuth.ts';

export interface FcmConfig {
  account: ServiceAccount;
  projectId: string;
  apiBase: string;
}

export function fcmConfig(): FcmConfig | null {
  const account = serviceAccountFrom('FIREBASE_SERVICE_ACCOUNT');
  if (!account) return null;
  if (!account.project_id) {
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT has no project_id');
    return null;
  }
  return {
    account,
    projectId: account.project_id,
    apiBase: (Deno.env.get('FCM_API_BASE') || 'https://fcm.googleapis.com').replace(/\/+$/, ''),
  };
}

export interface PhonePush {
  token: string;
  eventType: string;  // new_message, new_match, super_like, admin_message; admin_* (admin alerts)
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

// The app's notification channels on Android (lib/nativePush.ts makes them):
// people can turn each kind off in the phone's settings. Admins' phones have
// one more, for every admin alert (event types starting "admin_": reports,
// verification requests, complaints, enquiries, photos to approve). A
// message from the team to a member ("admin_message") isn't one.
const CHANNEL: Record<string, string> = {
  new_message: 'messages', new_match: 'matches', super_like: 'likes',
};
export const channelFor = (eventType: string): string =>
  eventType.startsWith('admin_') && eventType !== 'admin_message' ? 'admin' : CHANNEL[eventType] ?? 'messages';
const BRAND_ORANGE = '#F97316';

/** The FCM message for one phone. */
export function fcmMessage(p: PhonePush): Record<string, unknown> {
  // FCM data values are strings
  const data: Record<string, string> = { event_type: p.eventType };
  for (const [k, v] of Object.entries(p.data ?? {})) {
    if (v !== null && v !== undefined) data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  // A chat's (or a match's) notifications replace each other instead of piling up
  const group = data.match_id ? `${p.eventType}-${data.match_id}` : p.eventType;
  return {
    token: p.token,
    notification: { title: p.title, body: p.body },
    data,
    android: {
      priority: 'high',
      ttl: '86400s',
      notification: {
        channel_id: channelFor(p.eventType),
        tag: group,
        icon: 'ic_stat_notify',
        color: BRAND_ORANGE,
        default_sound: true,
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
        'apns-collapse-id': group.slice(0, 64),
      },
      payload: { aps: { sound: 'default', 'thread-id': group } },
    },
  };
}

/**
 * What happened to a message:
 *  sent   delivered to FCM
 *  gone   the phone's token is dead (app removed, token replaced, another project's): forget the phone
 *  retry  FCM was busy or down: try again later
 *  setup  our side is wrong (the key, the project, the message): the phone is fine
 */
export type FcmOutcome = 'sent' | 'gone' | 'retry' | 'setup';

interface FcmErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: { errorCode?: string }[] };
}

export function fcmOutcome(status: number, body: FcmErrorBody | null): FcmOutcome {
  if (status >= 200 && status < 300) return 'sent';
  const codes = (body?.error?.details ?? []).map((d) => d.errorCode).filter(Boolean);
  const message = body?.error?.message ?? '';
  if (status === 404 || codes.includes('UNREGISTERED')) return 'gone';
  if (codes.includes('SENDER_ID_MISMATCH')) return 'gone';
  if (status === 400 && /registration token/i.test(message)) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'setup';
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Signs in for sending (throws GoogleAuthError if the service account can't). */
export const fcmAccessToken = (cfg: FcmConfig) => googleAccessToken(cfg.account, FCM_SCOPE);

/** After a 401: the next run signs in again instead of reusing the token. */
export const forgetFcmAccessToken = (cfg: FcmConfig) => forgetGoogleAccessToken(cfg.account, FCM_SCOPE);

/** Sends one message. */
export async function sendFcm(
  cfg: FcmConfig, accessToken: string, message: Record<string, unknown>,
): Promise<{ outcome: FcmOutcome; status: number; detail: string }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBase}/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    return { outcome: 'retry', status: 0, detail: e instanceof Error ? e.message : String(e) };
  }
  const text = await res.text();
  let body: FcmErrorBody | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch { /* not JSON */ }
  return { outcome: fcmOutcome(res.status, body), status: res.status, detail: `${res.status} ${text.slice(0, 200)}` };
}
