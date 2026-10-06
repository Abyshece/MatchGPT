import React from 'react';
import { IconChevronLeft } from '../../constants';
import { LEGAL, LEGAL_PAGES, LEGAL_UPDATED } from '../../lib/legalInfo';
import { isWebsite } from '../../lib/website';
import { isAppPreview } from '../../lib/appPreview';

// Inside the apps a link to another legal page opens it in place (#page); a
// link to another page of the website opens the website
const followLink = (e: React.MouseEvent) => {
  const href = (e.target as HTMLElement).closest('a')?.getAttribute('href');
  if (!href?.startsWith('/') || (isWebsite() && !isAppPreview())) return;
  e.preventDefault();
  const page = href.replace(/^\/|\/$/g, '');
  if ((LEGAL_PAGES as readonly string[]).includes(page)) {
    window.location.hash = '';
    window.location.hash = page;
    window.scrollTo(0, 0);
  } else {
    window.open(`${LEGAL.websiteUrl}${href}`, '_blank', 'noopener');
  }
};

// ============================================================================
// The frame of every legal page (Terms, Privacy, Grievances, Safety, Refunds):
// a header with Back, the title, and when it took effect; the pages give the
// sections. The same page shows on the website and inside the apps.
// ============================================================================

export const LegalLayout: React.FC<{
  title: string;
  icon?: React.ReactNode;
  version?: string;
  onBack: () => void;
  children: React.ReactNode;
}> = ({ title, icon, version, onBack, children }) => (
  <div className="min-h-screen bg-white dark:bg-[#191919]">
    <header className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-gray-200 dark:border-zinc-800 pt-[var(--safe-top)]">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>
        <h1 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
          {icon} {title}
        </h1>
      </div>
    </header>

    {/* Links inside: followLink (a link pressed with the keyboard clicks too) */}
    <main onClick={followLink} className="max-w-3xl mx-auto px-6 py-10 pb-[calc(2.5rem+var(--safe-bottom))]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
        {version ? <>Version {version} · </> : null}In effect from {LEGAL_UPDATED}
      </p>
      {children}
    </main>
  </div>
);

export const Section: React.FC<{ id?: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section id={id} className="mb-8 scroll-mt-24">
    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {children}
    </div>
  </section>
);

export const List: React.FC<{ children: React.ReactNode; ordered?: boolean }> = ({ children, ordered }) => (
  ordered
    ? <ol className="list-decimal pl-5 space-y-1.5">{children}</ol>
    : <ul className="list-disc pl-5 space-y-1.5">{children}</ul>
);

/** A short, plain-language summary at the top of a page. */
export const Summary: React.FC<{ title?: string; children: React.ReactNode }> = ({ title = 'In short', children }) => (
  <div className="mb-8 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 p-5">
    <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
  </div>
);

/** The Hindi summary of a page (the English text is the one that applies). */
export const HindiSummary: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section lang="hi" className="mt-10 mb-8 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-5">
    <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">हिंदी में सारांश</h2>
    <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{children}</div>
    <p lang="en" className="mt-3 text-xs text-gray-600 dark:text-gray-400">
      A summary in Hindi. The English text above is the one that applies. Ask us for this page in any language of
      the Eighth Schedule to the Constitution.
    </p>
  </section>
);

export const linkClass = 'text-blue-600 dark:text-blue-400 underline';

export const Mail: React.FC<{ to: string }> = ({ to }) => <a className={linkClass} href={`mailto:${to}`}>{to}</a>;
