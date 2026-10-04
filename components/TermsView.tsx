import React from 'react';
import { IconChevronLeft, IconBook } from '../constants';
import { TERMS_VERSION } from '../lib/consentService';

// ============================================================================
// TermsView
//
// Terms of Service. Covers acceptable use, eligibility, payment terms,
// limitation of liability, governing law, account termination.
// ============================================================================

interface TermsViewProps {
  onBack: () => void;
}

const TermsView: React.FC<TermsViewProps> = ({ onBack }) => {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {children}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919]">
      <header className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-gray-200 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
            aria-label="Back"
          >
            <IconChevronLeft />
          </button>
          <h1 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <IconBook /> Terms of Service
          </h1>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
          Document version: {TERMS_VERSION} · Last updated: October 4, 2026
        </p>

        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          Welcome to MatchGPT. These Terms of Service ("Terms") govern your use of our
          matchmaking platform. By creating an account or using the service, you agree to be
          bound by these Terms. If you do not agree, please do not use the service.
        </p>

        <Section title="1. Eligibility">
          <p>You must be at least 18 years old and legally capable of entering into a binding
          contract in your jurisdiction. By using MatchGPT, you represent that you meet these
          requirements.</p>
          <p>The platform is intended for adults seeking serious relationships and matrimony.
          Use by minors is strictly prohibited.</p>
        </Section>

        <Section title="2. Your account">
          <p>You are responsible for maintaining the confidentiality of your account credentials.
          You agree not to share your account or let anyone else use it. If you believe your
          account has been compromised, contact us immediately.</p>
          <p>You agree to provide accurate, current information when creating your profile.
          Misrepresenting yourself (fake photos, fake identity, fake age) is a violation of
          these Terms and grounds for immediate termination.</p>
        </Section>

        <Section title="3. Acceptable use">
          <p>You agree NOT to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Use the service for any unlawful, fraudulent, or harmful purpose</li>
            <li>Harass, threaten, stalk, insult, or intimidate other users, or post hateful, abusive or obscene words</li>
            <li>Send unsolicited commercial messages or spam</li>
            <li>Solicit money, financial information, or favors from other users</li>
            <li>Post nudity, sexually explicit content, or content depicting violence</li>
            <li>Impersonate another person, including celebrities</li>
            <li>Create multiple accounts to evade bans or daily limits</li>
            <li>Scrape, mine, or collect data from the platform</li>
            <li>Reverse-engineer, decompile, or attempt to extract source code</li>
            <li>Use the platform for commercial promotion or recruitment</li>
            <li>Upload viruses, malware, or other harmful code</li>
            <li>Bypass security features or access controls</li>
          </ul>
          <p>There is no tolerance on MatchGPT for objectionable content or abusive users. Messages
          and profile text with words we don't allow are refused before anyone sees them. You can
          report a profile or a conversation (⋯ → Report) and block anyone (⋯ → Block user). We
          review every report within 24 hours, remove content that breaks these Terms, and ban the
          people who post it.</p>
          <p>We reserve the right to investigate suspected violations and take action including
          warning, temporary suspension, or permanent ban — with or without notice.</p>
        </Section>

        <Section title="4. Content and license">
          <p>You retain ownership of the content you post (profile information, photos, messages).
          By posting, you grant MatchGPT a worldwide, non-exclusive, royalty-free license to use,
          display, and process that content solely for the purpose of operating the service.</p>
          <p>You represent that you have the right to share any content you post and that it does
          not infringe anyone else's rights.</p>
        </Section>

        <Section title="5. Subscriptions and payments">
          <p>MatchGPT offers a free tier and a paid Pro tier. Pro tier pricing:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Monthly: ₹999 per month</li>
            <li>Annual: ₹9,999 per year (saves ~17%)</li>
            <li>Free trial: 7 days for new Pro users</li>
          </ul>
          <p>In our Android and iPhone apps, MatchGPT+ is sold through Google Play and the App Store.
          The store takes the payment, shows the price in your local currency (which may differ from
          the prices above and include local taxes), and its own terms apply to the purchase.</p>
          <p>Subscriptions auto-renew until cancelled. You may cancel at any time: on the website, in
          Settings; for a subscription bought in an app, in Google Play or in your Apple ID's
          subscriptions (Settings in the app shows how). Cancellation takes effect at the end of the
          current billing period.</p>
          <p><strong>Refunds:</strong> We do not generally offer refunds for partially-used subscription
          periods. Exceptions may be made at our discretion for technical issues that prevented
          you from using the service. Refunds for purchases made in the apps are requested from
          Google Play or Apple and follow their policies.</p>
          <p>On the website, payments are processed by Razorpay; in the apps, by Google Play or Apple.
          We never see or store your card details.</p>
          <p>We reserve the right to change pricing with at least 30 days' notice to active
          subscribers. New pricing applies at your next renewal.</p>
        </Section>

        <Section title="6. Free trial">
          <p>New users may receive a 7-day free trial of Pro features. After the trial, you will
          be auto-charged at the standard rate unless you cancel before the trial ends.</p>
          <p>You can cancel anytime during the trial without being charged. Only one free trial
          per user. In the apps, whether a trial is offered, how long it lasts and who can have one
          is set by Google Play or the App Store and shown before you confirm.</p>
        </Section>

        <Section title="7. Matching, no guarantees">
          <p>MatchGPT provides tools to help you find compatible partners, but we make no
          guarantees about:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>The quality, accuracy, or truthfulness of other users' profiles</li>
            <li>Whether you will find a match</li>
            <li>The outcome of any interaction with another user</li>
            <li>The safety of in-person meetings</li>
          </ul>
          <p>You meet other users at your own risk. We strongly recommend video-chatting before
          meeting in person, meeting in public places, and telling a friend.</p>
        </Section>

        <Section title="8. Account termination">
          <p>You may delete your account at any time via Settings → Delete Account, or without the
          app on our website's Delete account page. All your personal data will be deleted in
          accordance with our Privacy Policy.</p>
          <p>We may suspend or terminate your account at our discretion for violations of these
          Terms, suspected fraud, or behavior that harms other users. We will provide notice
          when reasonably possible.</p>
        </Section>

        <Section title="9. Disclaimers and limitation of liability">
          <p>The service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind,
          express or implied. We do not warrant that the service will be uninterrupted, error-free,
          or secure.</p>
          <p>To the maximum extent permitted by law, MatchGPT will not be liable for any indirect,
          incidental, consequential, or special damages arising from your use of the service. Our
          total liability to you for any claim will not exceed the amount you paid us in the 12
          months preceding the claim.</p>
          <p>These limitations do not apply to liability that cannot be excluded under applicable
          law (such as for death or personal injury caused by negligence, or for fraud).</p>
        </Section>

        <Section title="10. Indemnification">
          <p>You agree to indemnify and hold MatchGPT harmless from any claims, damages, losses,
          or expenses (including legal fees) arising from your violation of these Terms or your
          misuse of the service.</p>
        </Section>

        <Section title="11. Governing law and disputes">
          <p>These Terms are governed by the laws of India. Any disputes will be resolved in the
          courts of Bangalore, India, except where mandatory consumer-protection laws in your
          country of residence apply.</p>
          <p>For EU users: nothing in these Terms affects your statutory rights as a consumer.</p>
        </Section>

        <Section title="12. Changes to these Terms">
          <p>We may update these Terms from time to time. Material changes will be notified to
          you by email and in the app with at least 30 days' notice. Continued use of the service
          after the effective date constitutes acceptance.</p>
        </Section>

        <Section title="13. Contact">
          <p>Questions about these Terms:<br />
            <a href="mailto:support@matchgpt.com" className="text-blue-600 dark:text-blue-400 underline">support@matchgpt.com</a>
          </p>
        </Section>

        <div className="border-t border-gray-200 dark:border-zinc-800 pt-6 mt-10 text-center">
          <p className="text-xs text-gray-400">
            This document was last updated on October 4, 2026 and is identified internally as {TERMS_VERSION}.
          </p>
        </div>
      </article>
    </div>
  );
};

export default TermsView;
