// ============================================================================
// The website and the members' app
//
// Members use Shaadi24 in the phone apps. The website shows the home page,
// with where to get the apps, the pages the stores link to (support, privacy,
// terms, account deletion) and, at /admin, the admin panel for Shaadi24's
// team (components/website/). Admins can try the members' app on the website
// at /app-preview (Admin → App Preview; lib/appPreview.ts).
//
// VITE_MEMBERS_ON_WEB=true puts the members' app back on the website, for
// local development and the browser tests. Never set it in Vercel.
// ============================================================================

import { isNativeApp } from './nativeApp';

export const MEMBERS_ON_WEB = import.meta.env.VITE_MEMBERS_ON_WEB === 'true';

/** On the website, where members are sent to the apps (not in the apps). */
export const isWebsite = (): boolean => !isNativeApp() && !MEMBERS_ON_WEB;
