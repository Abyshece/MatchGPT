import React from 'react';
import { LEGAL } from '../../lib/legalInfo';

// ============================================================================
// The website's header and footer (the home page and the blog)
// ============================================================================

const headerLink = 'text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800';
const footerLink = 'hover:text-gray-900 dark:hover:text-white underline-offset-2 hover:underline';

export const SiteHeader: React.FC = () => (
  <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-gray-100 dark:border-zinc-800">
    <a href="/" className="flex items-center gap-2.5 select-none">
      <span className="text-2xl" aria-hidden="true">💍</span>
      <span className="text-lg font-bold tracking-tight">Shaadi24</span>
    </a>
    <nav aria-label="Website" className="flex items-center gap-1">
      <a href="/blog" className={headerLink}>Blog</a>
      <a href="/support" className={headerLink}>Help</a>
    </nav>
  </header>
);

export const SiteFooter: React.FC = () => (
  <footer className="border-t border-gray-100 dark:border-zinc-800 px-5 py-6">
    <nav aria-label="About Shaadi24" className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
      <a className={footerLink} href="/blog">Blog</a>
      <a className={footerLink} href="/stories">Success stories</a>
      <a className={footerLink} href="/support">Help &amp; Support</a>
      <a className={footerLink} href="/privacy">Privacy Policy</a>
      <a className={footerLink} href="/terms">Terms of Service</a>
      <a className={footerLink} href="/grievances">Grievances</a>
      <a className={footerLink} href="/safety">Safety</a>
      <a className={footerLink} href="/refunds">Refunds</a>
      <a className={footerLink} href="/delete-account">Delete your account</a>
      <a className={footerLink} href="/admin">Admin</a>
      <span>© 2026 {LEGAL.operator}</span>
    </nav>
  </footer>
);
