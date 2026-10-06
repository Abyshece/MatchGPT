// ============================================================================
// Error reports: when the app or the website hits an error, it tells our own
// database (report_error), so it can be fixed. What's sent: the error and
// where in the code it came from, the screen, the app version and the kind of
// device and browser. Not who it happened to: emails, phone numbers, ids and
// tokens are blanked out first, the report goes with the app's public key and
// never the member's sign-in, and the server keeps no account or address
// (supabase/migrations/…_phase10_error_reports.sql). Admins see them in
// Admin → Errors.
// ============================================================================

import { Capacitor } from '@capacitor/core';
import { isAppPreview } from './appPreview';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const MAX_PER_PAGE = 10;    // a loop of errors sends no more than this
const sentHere = new Set<string>();
let screen = '';

/** The screen people are on, for the reports (App, Dashboard's tabs, the website's pages). */
export function setErrorScreen(name: string): void {
  screen = name;
}

// Personal details out of a message or stack, before it leaves the device
export function scrub(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\+?\d[\d\s-]{5,}\d/g, '[number]')
    .replace(/([?&#][\w-]+=)[^&\s)#]+/g, '$1…');
}

// Not ours to fix: the network dropping, the browser's own quirks, extensions
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network request failed|The Internet connection appears to be offline/i,
  /AbortError|The operation was aborted|signal is aborted/i,
];
const fromExtension = (stack: string) => /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack);

/** Sends an error to the database, once per page or app session for the same error. */
export function reportError(error: unknown, where?: string): void {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));
    const message = scrub(`${e.name && e.name !== 'Error' ? `${e.name}: ` : ''}${e.message || String(error)}`).slice(0, 500);
    const stack = scrub(e.stack ?? '').slice(0, 3000);
    if (!message.trim() || NOISE.some((n) => n.test(message)) || fromExtension(stack)) return;
    const key = `${message}|${stack.split('\n')[1] ?? ''}`;
    if (sentHere.has(key) || sentHere.size >= MAX_PER_PAGE) return;
    sentHere.add(key);
    // Not with supabase.rpc, which would send the member's sign-in with it
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/report_error`, {
      method: 'POST',
      headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_platform: Capacitor.getPlatform(),
        p_message: message,
        p_stack: stack || null,
        p_screen: `${isAppPreview() ? 'app preview: ' : ''}${where || screen || window.location.pathname}`.slice(0, 120),
        p_app_version: __APP_VERSION__,
        p_user_agent: navigator.userAgent.slice(0, 300),
      }),
    }).then((response) => {
      if (!response.ok) console.warn('[errorReports] not sent:', response.status);
    }).catch(() => { /* offline: nothing to do */ });
  } catch {
    // Reporting must never break the app
  }
}

let started = false;

/** Reports errors nobody caught: thrown ones and promises that failed. */
export function startErrorReports(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('error', (event) => reportError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
}
