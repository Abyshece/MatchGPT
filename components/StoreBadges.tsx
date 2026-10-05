import React from 'react';
import { APP_STORE_URL, PLAY_STORE_URL } from '../lib/storeLinks';

// ============================================================================
// StoreBadges: "Get it on Google Play" and "Download on the App Store"
//
// Links once the apps are live (lib/storeLinks.ts); until then each says it's
// coming soon.
// ============================================================================

const BADGE = 'inline-flex items-center gap-3 h-14 min-w-[200px] px-5 rounded-xl border text-left transition-colors';

const Badge: React.FC<{ href: string | null; small: string; big: string; icon: React.ReactNode }> = ({ href, small, big, icon }) => {
  const inner = (
    <>
      <span aria-hidden="true" className="w-6 h-6 flex-shrink-0">{icon}</span>
      <span className="leading-tight">
        <span className="block text-[11px] opacity-80">{href ? small : 'Coming soon to'}</span>
        <span className="block text-lg font-semibold">{big}</span>
      </span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${BADGE} bg-black text-white border-black hover:bg-zinc-800 dark:bg-white dark:text-black dark:border-white dark:hover:bg-zinc-200`}>
      {inner}
    </a>
  ) : (
    <span aria-disabled="true" className={`${BADGE} bg-white text-gray-500 border-gray-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700`}>
      {inner}
    </span>
  );
};

const PLAY_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.6 2.2a1.5 1.5 0 0 0-.6 1.2v17.2a1.5 1.5 0 0 0 .6 1.2l9.6-9.8z" /><path d="m17.4 15.3-3.2-3.3-9.6 9.8a1.5 1.5 0 0 0 1.6.1z" opacity=".8" /><path d="m17.4 8.7-11.2-6.6a1.5 1.5 0 0 0-1.6.1l9.6 9.8z" opacity=".9" /><path d="m20.9 10.7-3.5-2-3.2 3.3 3.2 3.3 3.5-2a1.5 1.5 0 0 0 0-2.6z" opacity=".7" /></svg>
);
const APPLE_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z" /></svg>
);

const StoreBadges: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex flex-wrap gap-3 ${className}`}>
    <Badge href={PLAY_STORE_URL} small="Get it on" big="Google Play" icon={PLAY_ICON} />
    <Badge href={APP_STORE_URL} small="Download on the" big="App Store" icon={APPLE_ICON} />
  </div>
);

export default StoreBadges;
