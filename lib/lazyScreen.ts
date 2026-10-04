import { lazy, type ComponentType } from 'react';

// ============================================================================
// lazyScreen: React.lazy for screens, safe across new releases
//
// Screens load their code the first time they're shown. When that fails it's
// usually because a new version of the website went live while this page was
// open, and the old version's files are gone: reloading picks up the new
// version instead of leaving a blank page. At most once a minute, so a real
// outage shows AppErrorBoundary's screen instead of reloading forever.
// ============================================================================

const RELOADED_AT = 'matchgpt_reloaded_for_update';

/** Reloads the page, unless it just did. True if it's reloading. */
function reloadForUpdate(): boolean {
  try {
    if (Date.now() - (Number(sessionStorage.getItem(RELOADED_AT)) || 0) < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;  // no storage: can't tell whether it just reloaded
  }
  window.location.reload();
  return true;
}

export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((error) => {
    if (reloadForUpdate()) return new Promise<never>(() => { /* the page is reloading */ });
    throw error;
  }));
}

// Vite's own signal that a screen's files didn't load
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
}
