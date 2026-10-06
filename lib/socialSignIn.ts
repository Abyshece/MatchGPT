// ============================================================================
// Sign in with Google and Sign in with Apple inside the phone apps
//
// The phone's own sign-in sheets (@capgo/capacitor-social-login): Google's
// account chooser (Android's Credential Manager, Google's sign-in on
// iPhones) and, on iPhones, Apple's. They hand the app an ID token for the
// account, and Supabase signs the person in with it (signInWithIdToken),
// creating the account the first time; new accounts then accept the Terms
// like any other (StepConsent). A fresh nonce ties each token to this one
// sign-in: the sheet gets its SHA-256, Supabase the nonce itself.
//
// Google: Android uses the "Web application" client that Supabase's Google
// provider already has (GOOGLE_WEB_CLIENT_ID below; Google Cloud also needs
// an Android client for com.shaadi24.app with the app's signing
// certificates). iPhones use their own client, VITE_GOOGLE_IOS_CLIENT_ID,
// set when the app is built (scripts/ios-google-sign-in.mjs adds its URL
// scheme); without it iPhones don't offer Google.
// Apple: iPhones only, offered once Supabase's Apple provider is on. Apple
// asks for Sign in with Apple wherever another account sign-in is offered,
// so iPhones offer Google only next to it. Apple gives the person's name
// only the first time; it goes into the account for the profile form, and
// Apple's one-time code to the server (apple-sign-in), so that deleting the
// account can also end its Sign in with Apple.
// ============================================================================

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { makeNonce } from './googleSignIn';

export type SocialProvider = 'google' | 'apple';

// The "Web application" client of Supabase's Google provider (public: it's
// in every Google sign-in link). VITE_GOOGLE_WEB_CLIENT_ID overrides it, ''
// turns Google sign-in off on Android.
const LIVE_WEB_CLIENT_ID = '1095396009529-7cqo7gfh8s160u4qrk6i6an6726r7lde.apps.googleusercontent.com';
const GOOGLE_WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? LIVE_WEB_CLIENT_ID).trim();
const GOOGLE_IOS_CLIENT_ID = (import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? '').trim();

const LABEL: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple' };

const platform = (): 'android' | 'ios' | null => {
  const p = Capacitor.getPlatform();
  return Capacitor.isNativePlatform() && (p === 'android' || p === 'ios') ? p : null;
};

/** Something went wrong, in words for the person signing in. */
export class SocialSignInError extends Error {}

// ---- Which sign-ins this phone offers ---------------------------------------------------

const PROVIDERS_KEY = 'matchgpt_auth_providers';
let providersOn: Promise<Record<string, boolean> | null> | null = null;

// The providers switched on in Supabase (its public auth settings), kept for
// when the phone is offline
function enabledProviders(): Promise<Record<string, boolean> | null> {
  providersOn ??= (async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`;
      const res = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
      if (!res.ok) throw new Error(`auth settings: ${res.status}`);
      const external = (await res.json())?.external ?? {};
      try { localStorage.setItem(PROVIDERS_KEY, JSON.stringify(external)); } catch { /* private mode */ }
      return external;
    } catch {
      providersOn = null;  // ask again next time
      try { return JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? 'null'); } catch { return null; }
    }
  })();
  return providersOn;
}

/** The sign-in buttons this phone shows (none on the website). */
export async function socialProviders(): Promise<Record<SocialProvider, boolean>> {
  const p = platform();
  if (!p) return { google: false, apple: false };
  const on = await enabledProviders();
  const apple = p === 'ios' && on?.apple === true;
  const client = p === 'android' ? GOOGLE_WEB_CLIENT_ID : GOOGLE_IOS_CLIENT_ID;
  const google = !!client && on?.google !== false && (p === 'android' || apple);
  return { google, apple };
}

// ---- Signing in --------------------------------------------------------------------------

type SocialLoginPlugin = typeof import('@capgo/capacitor-social-login').SocialLogin;
let plugin: Promise<SocialLoginPlugin> | null = null;

// The plugin, set up once with this phone's providers
function socialLogin(): Promise<SocialLoginPlugin> {
  plugin ??= (async () => {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    const ios = platform() === 'ios';
    await SocialLogin.initialize({
      ...(ios
        ? GOOGLE_IOS_CLIENT_ID ? { google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, mode: 'online' } } : {}
        : { google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } }),
      ...(ios ? { apple: {} } : {}),
    });
    return SocialLogin;
  })().catch((e) => {
    plugin = null;
    throw e;
  });
  return plugin;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

// Closing the sheet: USER_CANCELLED (Android), "canceled the sign-in flow"
// (Google, iPhone), AuthorizationError 1001 (Apple)
export function isCancelled(e: unknown): boolean {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  return code === 'USER_CANCELLED' || /cancel/i.test(messageOf(e)) || /\berror 1001\b/.test(messageOf(e));
}

// What the phone's sheet said, for the person
function sheetError(provider: SocialProvider, e: unknown): SocialSignInError {
  const message = messageOf(e);
  console.warn(`[sign-in] ${provider}:`, message);
  if (/28444|developer console|not set up correctly|client id is not set/i.test(message)) {
    return new SocialSignInError(`${LABEL[provider]} sign-in isn't set up for this app yet. Please continue with email.`);
  }
  if (/no credential/i.test(message)) {
    return new SocialSignInError('There is no Google account on this phone. Add one in the phone\'s settings, or continue with email.');
  }
  return new SocialSignInError(`${LABEL[provider]} sign-in didn't work. Please try again, or continue with email.`);
}

// What Supabase said, for the person
function supabaseError(provider: SocialProvider, error: { message: string; code?: string; status?: number }): SocialSignInError {
  console.warn(`[sign-in] ${provider} → Supabase:`, error.code ?? error.status, error.message);
  if (error.code === 'provider_disabled' || /not enabled/i.test(error.message)) {
    return new SocialSignInError(`${LABEL[provider]} sign-in isn't switched on yet. Please continue with email.`);
  }
  if (/audience/i.test(error.message)) {
    return new SocialSignInError(`${LABEL[provider]} sign-in isn't set up for this app yet. Please continue with email.`);
  }
  if (error.code === 'user_banned') return new SocialSignInError('This account has been suspended.');
  if (error.code === 'signup_disabled') return new SocialSignInError('New accounts can\'t be created right now. Please try again later.');
  if (!error.status || error.status >= 500) {
    return new SocialSignInError('Couldn\'t reach Shaadi24. Check your connection and try again.');
  }
  return new SocialSignInError(`${LABEL[provider]} sign-in didn't work. Please try again, or continue with email.`);
}

/**
 * Signs in with the phone's Google or Apple sheet. 'cancelled' when the
 * person closed it; throws SocialSignInError when something went wrong.
 */
export async function signInWith(provider: SocialProvider): Promise<'signed-in' | 'cancelled'> {
  if (!platform()) throw new SocialSignInError(`${LABEL[provider]} sign-in works in the Shaadi24 app.`);
  const { nonce, hashed } = await makeNonce();

  let idToken: string | null;
  let appleCode: string | undefined;
  let appleName = '';
  let sheet: SocialLoginPlugin;
  try {
    sheet = await socialLogin();
    if (provider === 'google') {
      // forcePrompt: always the account chooser, never a remembered sign-in
      // (whose token carries an old nonce)
      const { result } = await sheet.login({ provider: 'google', options: { nonce: hashed, forcePrompt: true } });
      idToken = result.responseType === 'online' ? result.idToken : null;
    } else {
      const { result } = await sheet.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: hashed } });
      idToken = result.idToken;
      appleCode = result.authorizationCode || undefined;
      appleName = [result.profile?.givenName, result.profile?.familyName].filter(Boolean).join(' ').trim();
    }
  } catch (e) {
    if (isCancelled(e)) return 'cancelled';
    throw sheetError(provider, e);
  }
  if (!idToken) throw sheetError(provider, new Error('no ID token'));

  const { data, error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
  if (error || !data.session) throw supabaseError(provider, error ?? { message: 'no session' });

  if (provider === 'google') {
    // The app keeps its own session; next time Google asks which account again
    sheet.logout({ provider: 'google' }).catch(() => {});
  } else {
    // Apple's first sign-in carries the name: keep it for the profile form
    const meta = data.user?.user_metadata ?? {};
    if (appleName && !meta.full_name && !meta.name) {
      await supabase.auth.updateUser({ data: { full_name: appleName } }).catch(() => {});
    }
    if (appleCode) {
      // So that deleting the account can end its Sign in with Apple
      supabase.functions.invoke('apple-sign-in', { body: { authorizationCode: appleCode } })
        .then(({ error: e }) => { if (e) console.warn('[sign-in] Apple token not kept:', e.message); })
        .catch(() => {});
    }
  }
  return 'signed-in';
}
