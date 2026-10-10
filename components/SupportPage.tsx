import React, { useEffect } from 'react';
import { helpTopics, SUPPORT_EMAIL } from './helpTopics';
import StoreBadges from './StoreBadges';
import ContactForm from './ContactForm';
import { BrandMark } from '../constants';

// ============================================================================
// SupportPage: /support on the website
//
// The stores ask for a support page with a way to reach us (App Store
// Connect's "Support URL", Google Play's store listing). The answers are the
// same as the Help Center's in the apps (helpTopics), worded for the web, and
// a contact form that lands in Admin → Enquiries.
// ============================================================================

const SupportPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Shaadi24 Help & Support';
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const link = 'underline text-blue-600 dark:text-blue-400';

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 font-sans">
      <main className="max-w-2xl mx-auto px-5 py-10 sm:py-16">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
          <BrandMark className="w-5 h-5" /> Shaadi24
        </a>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Help &amp; Support</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          Shaadi24 is a matrimony app for India, on Android and iPhone. Here are answers to the questions we're asked
          most, and how to reach us.
        </p>
        <StoreBadges className="mt-5" />

        <section className="mt-6 rounded-lg border border-gray-200 dark:border-zinc-800 p-4 text-sm leading-relaxed text-gray-600 dark:text-gray-300 space-y-2" data-testid="support-contact">
          <p><strong className="text-gray-900 dark:text-white">Write to us:</strong>{' '}
            <a className={link} href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Shaadi24 help')}`}>{SUPPORT_EMAIL}</a>,
            for help, your personal data and privacy, or anything else. Tell us the email address of your account
            and, for a problem in the app, your phone's make and model.</p>
          <p><strong className="text-gray-900 dark:text-white">Someone bothering you?</strong> Report them in the app
            (⋯ on their profile or in the chat → Report). We review every report within 24 hours.</p>
          <p><strong className="text-gray-900 dark:text-white">A complaint?</strong> Our Grievance Officer answers on the{' '}
            <a className={link} href="/grievances">Grievance Redressal</a> page, member or not.</p>
        </section>

        <section className="mt-8" id="contact" aria-labelledby="contact-heading">
          <h2 id="contact-heading" className="text-lg font-semibold tracking-tight">Send us a message</h2>
          <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-300">Questions, feedback or partnerships: we reply by email.</p>
          <ContactForm />
        </section>

        <section className="mt-8 divide-y divide-gray-200 dark:divide-zinc-800 border-y border-gray-200 dark:border-zinc-800">
          {helpTopics('web').map((t) => (
            <details key={t.q} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
                {t.q}
                <span aria-hidden="true" className="text-gray-500 dark:text-gray-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{t.a}</p>
            </details>
          ))}
        </section>

        <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/terms">Terms of Service</a>
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/privacy">Privacy Policy</a>
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/grievances">Grievances</a>
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/safety">Safety</a>
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/refunds">Refunds</a>
          <a className="underline hover:text-gray-900 dark:hover:text-white" href="/delete-account">Delete your account</a>
        </nav>
      </main>
    </div>
  );
};

export default SupportPage;
