// ============================================================================
// The app preview: the members' app inside the admin panel
//
// Members use Shaadi24 in the phone apps (lib/website.ts). Admins can open the
// members' app on the website too, at /app-preview (Admin → App Preview shows
// it phone-sized), to see that everything works. It's the same app on the
// same live backend, so what's done in it is real.
//
// It keeps its own sign-in, under its own storage key (lib/supabase.ts):
// trying it with any account leaves the admin panel signed in. Only someone
// signed in to the admin panel as an admin gets it (components/website/
// AppPreview.tsx).
// ============================================================================

import { Capacitor } from '@capacitor/core';

export const APP_PREVIEW_PATH = '/app-preview';

/** Where the preview keeps its sign-in (the website's is under Supabase's usual key). */
export const APP_PREVIEW_STORAGE_KEY = 'shaadi24-app-preview-auth';

/** This page is the app preview (on the website, never in the phone apps). */
export const isAppPreview = (): boolean =>
  typeof window !== 'undefined'
  && !Capacitor.isNativePlatform()
  && window.location.pathname.replace(/\/+$/, '') === APP_PREVIEW_PATH;
