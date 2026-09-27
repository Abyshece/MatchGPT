// ============================================================================
// Sign in with Google through Google's own button (Google Identity Services)
//
// The classic sign-in (supabase.auth.signInWithOAuth) sends people to Google
// with Supabase's address as the return address, so Google's screen says
// "to continue to <project>.supabase.co". With Google's button the sign-in
// happens on this site: Google shows the site's address instead (or the app
// name "MatchGPT" once Google has verified the brand), hands the page an ID
// token, and Supabase signs the user in with it (signInWithIdToken).
//
// Google only shows the button on sites listed under "Authorized JavaScript
// origins" of the client in Google Cloud (Google Auth Platform → Clients).
// ============================================================================

// Google's public ID for this site's sign-in client. Not a secret: it's part
// of every Google sign-in link. Empty until https://shaadi-gpt.vercel.app is
// an authorized origin of the client, because Google refuses the button
// until then; while empty, the classic sign-in is used.
// VITE_GOOGLE_CLIENT_ID overrides it ('' switches Google's button off).
const LIVE_CLIENT_ID = '';
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? LIVE_CLIENT_ID;

// The parts of Google's library this app uses
// (https://developers.google.com/identity/gsi/web/reference/js-reference).
export interface GoogleIdentity {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    nonce?: string;
    ux_mode?: 'popup' | 'redirect';
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(parent: HTMLElement, options: {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    logo_alignment?: 'left' | 'center';
    width?: number;
  }): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 10_000;
let loading: Promise<GoogleIdentity> | null = null;

// Loads Google's library once per page.
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    const fail = () => {
      loading = null;  // let a later attempt try again
      script.remove();
      reject(new Error('Google sign-in could not load'));
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    script.onload = () => {
      clearTimeout(timer);
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else fail();
    };
    script.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

// A fresh nonce for one sign-in: Google puts the SHA-256 (hex) of it in the
// ID token, and Supabase checks it against the plain one, so a token can't
// be replayed on another page.
export async function makeNonce(): Promise<{ nonce: string; hashed: string }> {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { nonce, hashed };
}
