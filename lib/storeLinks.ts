// ============================================================================
// Where to get the apps
//
// Set once each app is live in its store (Vercel → Settings → Environment
// Variables, then redeploy): VITE_PLAY_STORE_URL, e.g.
// https://play.google.com/store/apps/details?id=com.shaadi24.app, and
// VITE_APP_STORE_URL, the address App Store Connect shows for the app
// (https://apps.apple.com/app/id…). Until then the website says "Coming soon".
// ============================================================================

export const PLAY_STORE_URL: string | null = import.meta.env.VITE_PLAY_STORE_URL?.trim() || null;
export const APP_STORE_URL: string | null = import.meta.env.VITE_APP_STORE_URL?.trim() || null;
