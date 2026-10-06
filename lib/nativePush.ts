// ============================================================================
// nativePush: notifications in the phone apps
//
// The apps get notifications through Firebase Cloud Messaging: on Android
// directly, on iPhones through Apple's push service. A phone that allows
// notifications sends its FCM token to the server for whoever is signed in
// (register_push_device), and send-push sends that person's new matches,
// messages and super likes to it. Signing out, or turning notifications off
// in Settings, takes the phone off the list (unregister_push_device) and
// drops its token. The website uses Web Push instead (pushService.ts).
//
// No token is made before someone says yes (auto-init is off in both apps).
// Until the Firebase files are in the apps (google-services.json for
// Android, GoogleService-Info.plist for iPhone) the plugin answers
// "unavailable", and the app says notifications are coming soon.
// ============================================================================

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { FirebaseMessaging, Importance, type Notification } from '@capacitor-firebase/messaging';
import { supabase } from './supabase';

/**
 * This phone, for this person:
 *   unavailable  this version of the app can't get notifications (or it's the website)
 *   prompt       the phone hasn't asked yet
 *   denied       turned off for Shaadi24 in the phone's settings
 *   on           allowed, and this phone is signed up
 *   off          allowed, but turned off here in Settings
 */
export type PushState = 'unavailable' | 'prompt' | 'denied' | 'on' | 'off';

const platform = (): 'android' | 'ios' | null => {
  const p = Capacitor.getPlatform();
  return Capacitor.isNativePlatform() && (p === 'android' || p === 'ios') ? p : null;
};

// ---- Remembered on this phone ---------------------------------------------------------

const OFF_KEY = 'matchgpt_push_off';               // :<userId> — turned off in Settings
const ASKED_KEY = 'matchgpt_push_offer_dismissed'; // when "Not now" was last pressed

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
}

let unavailable = false;     // learned from the plugin: no Firebase in this build
let currentToken: string | null = null;
let currentUser: string | null = null;
let starting: Promise<void> | null = null;  // startNativePush, while it signs the phone up

// The plugin's answer when Firebase isn't set up: "unavailable" on iPhone,
// Firebase's own "not initialized" on Android; or an app without the plugin
function isUnconfigured(e: unknown): boolean {
  const { code, message = '' } = (e ?? {}) as { code?: string; message?: string };
  return code === 'UNAVAILABLE' || code === 'UNIMPLEMENTED'
    || /not configured|not implemented|FirebaseApp is not initialized|FirebaseApp\.initializeApp/i.test(message);
}

async function permission(): Promise<'prompt' | 'granted' | 'denied' | 'unavailable'> {
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
  } catch (e) {
    if (!isUnconfigured(e)) return 'prompt';
    unavailable = true;
    return 'unavailable';
  }
}

/** Where this phone stands for this person (see PushState). */
export async function nativePushState(userId: string): Promise<PushState> {
  if (!platform()) return 'unavailable';
  await starting;
  if (unavailable) return 'unavailable';
  const p = await permission();
  if (p !== 'granted') return p;
  if (readStore(`${OFF_KEY}:${userId}`)) return 'off';
  return currentUser === userId && currentToken ? 'on' : 'off';
}

// Android lets people turn each kind off; the server names the channel (_shared/fcm.ts)
async function ensureChannels(): Promise<void> {
  if (platform() !== 'android') return;
  const channels = [
    { id: 'messages', name: 'Messages', description: 'New messages from your matches', importance: Importance.High },
    { id: 'matches', name: 'Matches', description: 'When you and someone like each other', importance: Importance.High },
    { id: 'likes', name: 'Likes', description: 'When someone super-likes you', importance: Importance.Default },
  ];
  await Promise.all(channels.map((c) => FirebaseMessaging.createChannel({ ...c, lights: true, vibration: true }).catch(() => {})));
}

/** On admins' Android phones: a channel of its own for new reports and verification requests. */
export async function ensureAdminChannel(): Promise<void> {
  if (platform() !== 'android') return;
  await FirebaseMessaging.createChannel({
    id: 'admin', name: 'Admin alerts', description: 'New reports, complaints and verification requests to review',
    importance: Importance.High, lights: true, vibration: true,
  }).catch(() => {});
}

async function appVersion(): Promise<string | null> {
  try {
    const info = await App.getInfo();
    return `${info.version} (${info.build})`;
  } catch {
    return null;
  }
}

// Gets the phone's token and signs it up for this person
async function register(userId: string): Promise<'on' | 'unavailable' | 'failed'> {
  const p = platform();
  if (!p) return 'unavailable';
  let token: string;
  try {
    ({ token } = await FirebaseMessaging.getToken());
  } catch (e) {
    if (isUnconfigured(e)) {
      unavailable = true;
      return 'unavailable';
    }
    console.warn('[push] no token:', e);
    return 'failed';
  }
  await ensureChannels();
  const { error } = await supabase.rpc('register_push_device', {
    p_token: token, p_platform: p, p_app_version: await appVersion(),
  });
  if (error) {
    console.warn('[push] not signed up:', error.message);
    return 'failed';
  }
  currentToken = token;
  currentUser = userId;
  return 'on';
}

/** Asks the phone (the first time) and signs it up. */
export async function turnOnNativePush(userId: string): Promise<'on' | 'denied' | 'unavailable' | 'failed'> {
  if (!platform() || unavailable) return 'unavailable';
  let p = await permission();
  if (p === 'unavailable') return 'unavailable';
  writeStore(`${OFF_KEY}:${userId}`, null);
  if (p === 'prompt') {
    const { receive } = await FirebaseMessaging.requestPermissions();
    p = receive === 'granted' ? 'granted' : 'denied';
  }
  if (p !== 'granted') return 'denied';
  return await register(userId);
}

// Takes this phone off the person's list on the server, and drops the token
async function unregister(): Promise<void> {
  const token = currentToken;
  currentToken = null;
  currentUser = null;
  if (token) {
    const { error } = await supabase.rpc('unregister_push_device', { p_token: token });
    if (error) console.warn('[push] not taken off:', error.message);
  }
  await FirebaseMessaging.deleteToken().catch(() => {});
}

/** Settings: no notifications on this phone for this person (until turned on again). */
export async function turnOffNativePush(userId: string): Promise<void> {
  writeStore(`${OFF_KEY}:${userId}`, '1');
  await unregister();
}

// ---- Offering notifications (NotificationOffer) --------------------------------------------

const OFFER_AGAIN_MS = 14 * 24 * 3600_000;

/** Whether to offer notifications now: the phone hasn't asked, and "Not now" wasn't pressed lately. */
export async function shouldOfferNativePush(userId: string): Promise<boolean> {
  if ((await nativePushState(userId)) !== 'prompt') return false;
  const dismissed = Number(readStore(ASKED_KEY)) || 0;
  return Date.now() - dismissed > OFFER_AGAIN_MS;
}

export const dismissNativePushOffer = () => writeStore(ASKED_KEY, String(Date.now()));

// ---- While signed in ------------------------------------------------------------------------

export interface PushData {
  event_type?: string;
  deep_link?: string;
  match_id?: string;
  [key: string]: unknown;
}

type OpenHandler = (data: PushData) => void;
type ShowHandler = (notification: { title: string; body: string; data: PushData }) => void;

let openHandler: OpenHandler | null = null;
let pendingOpen: PushData | null = null;
let showHandler: ShowHandler | null = null;
let openChat: string | null = null;
let listeners: Promise<PluginListenerHandle | null>[] = [];

const dataOf = (n: Notification): PushData => (n.data && typeof n.data === 'object' ? n.data as PushData : {});

/** The screen to open when a notification is tapped (Dashboard). A tap before it's ready waits for it. */
export function onNotificationOpened(handler: OpenHandler): () => void {
  openHandler = handler;
  if (pendingOpen) {
    const data = pendingOpen;
    pendingOpen = null;
    handler(data);
  }
  return () => { if (openHandler === handler) openHandler = null; };
}

/** How a notification shows while the app is open (a toast). */
export function onNotificationWhileOpen(handler: ShowHandler): () => void {
  showHandler = handler;
  return () => { if (showHandler === handler) showHandler = null; };
}

/** The chat on screen: its own message notifications aren't shown while it's open. */
export function setOpenChat(matchId: string | null): void {
  openChat = matchId;
}

/**
 * At sign-in (and app start): listens for taps, notifications while open and
 * new tokens, and, if this phone allows notifications and they're on for this
 * person, signs it up again (the token may have changed).
 */
export function startNativePush(userId: string): Promise<void> {
  if (!platform()) return Promise.resolve();
  starting = start(userId).finally(() => { starting = null; });
  return starting;
}

async function start(userId: string): Promise<void> {
  const allowed = await permission();
  if (allowed === 'unavailable') return;
  if (!listeners.length) {
    listeners = [
      FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
        const data = dataOf(notification);
        if (openHandler) openHandler(data);
        else pendingOpen = data;
      }),
      FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
        const data = dataOf(notification);
        if (data.event_type === 'new_message' && data.match_id && data.match_id === openChat) return;
        showHandler?.({ title: notification.title ?? '', body: notification.body ?? '', data });
      }),
      FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
        if (currentUser && token && token !== currentToken) void register(currentUser);
      }),
    ].map((l) => l.catch(() => null));
  }
  if (readStore(`${OFF_KEY}:${userId}`) || allowed !== 'granted') return;
  await register(userId);
}

/** Before signing out: this phone stops getting this person's notifications. */
export async function signOutNativePush(): Promise<void> {
  if (!platform()) return;
  await unregister();
}

/**
 * After signing out (or when the session ends): stop listening. The phone
 * stays signed up unless signOutNativePush ran first (it needs the session).
 */
export async function stopNativePush(): Promise<void> {
  const handles = listeners;
  listeners = [];
  currentToken = null;
  currentUser = null;
  pendingOpen = null;
  await Promise.all(handles.map(async (h) => (await h)?.remove().catch(() => {})));
}
