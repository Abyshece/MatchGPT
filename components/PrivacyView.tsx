import React from 'react';
import { IconChevronLeft, IconShield } from '../constants';
import { PRIVACY_VERSION } from '../lib/consentService';

// ============================================================================
// PrivacyView
//
// GDPR-compliant Privacy Policy. Plain language, structured by section.
// Must cover: what data, why, where stored, retention, rights, contact.
// ============================================================================

interface PrivacyViewProps {
  onBack: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      {children}
    </div>
  </section>
);

const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-[#191919]">
      {/* Header */}
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
            <IconShield /> Privacy Policy
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
          Document version: {PRIVACY_VERSION} · Last updated: October 6, 2026
        </p>

        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
          This Privacy Policy explains how MatchGPT ("we", "us", or "the Service") collects, uses,
          stores, and protects your personal information when you use our dating and matrimony
          platform. We are committed to handling your data with care and in accordance with the
          EU General Data Protection Regulation (GDPR), India's Digital Personal Data Protection
          Act, and other applicable laws.
        </p>

        <Section title="1. Who we are">
          <p>
            MatchGPT is operated by Abhishek (the "Operator"). For any privacy-related questions,
            you can contact us at <a href="mailto:privacy@matchgpt.com" className="text-blue-600 dark:text-blue-400 underline">privacy@matchgpt.com</a>.
          </p>
          <p>
            We are the data controller for the personal information you provide on this platform.
          </p>
        </Section>

        <Section title="2. What information we collect">
          <p>We collect the following categories of personal data:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Account data:</strong> email address, password (hashed, if you set one), date of registration. If you sign in with Google or Apple, they tell us your name, email address and an identifier for your Google or Apple account; with Apple you can hide your email address, and we then get an address at Apple's private relay that forwards to you. For Sign in with Apple we also keep a token from Apple, used only to end Sign in with Apple for MatchGPT when you delete your account</li>
            <li><strong>Profile data:</strong> name, date of birth (other members only ever see your age), gender, sexuality, marital status, children, height, where you live (country, state, city), hometown, photos, bio, and roughly 80 other optional profile attributes you choose to share (lifestyle, personality, relationship preferences, etc.)</li>
            <li><strong>Background and family details (all optional):</strong> religion, mother tongue, caste or community, sub-caste, sect or denomination, gotra, whether you are open to marrying outside your community, horoscope details (Manglik status, rashi, nakshatra, time and place of birth), education, occupation, annual income, residential status abroad, family details (family type, status and values, your parents' occupations, brothers and sisters, where your family lives) and any disability you choose to mention</li>
            <li><strong>Activity data:</strong> likes you send and receive, matches, messages, search queries, login history</li>
            <li><strong>Technical data:</strong> IP address, browser type, device information, cookies (see Section 8). If you turn on notifications, a notification token for your browser or phone (on phones, from Google's Firebase Cloud Messaging), whether the phone is an Android phone or an iPhone, and the version of our app</li>
            <li><strong>Error reports:</strong> when something goes wrong in the app or on the website, it tells us what the error was, where in our code it happened, which screen you were on, the version of the app, and the kind of phone or computer and browser (for example "Android 14, Chrome 141"). Not who you are: we keep no account, name or IP address with it, and email addresses, phone numbers, IDs and other long numbers are blanked out before it leaves your device. The same error from many people adds up to one report</li>
            <li><strong>Payment data:</strong> MatchGPT+ is bought in our Android and iPhone apps, and Google Play or Apple processes the payment; we never see your card, UPI or bank details. We receive and keep the purchase details they send us (the purchase or order IDs, the plan, amounts and currency, dates, whether it renews, refunds), linked to your account by your account's ID, which we pass with the purchase. We also record the fees the stores charge us.</li>
          </ul>
          <p className="mt-2">
            Some categories — religion, caste or community, sexuality, ethnicity, disability and other
            health-related fields — are considered "special category" data under GDPR, and your
            income and horoscope details are personal too. All of them are optional. We process them
            only because you have given explicit consent by entering them into your profile, and only
            for the matchmaking purpose. You can hide any answer: hidden answers are never shown to
            other members and nobody can search or filter by them, but they still help us pick your
            own matches. You can change or delete any answer at any time.
          </p>
          <p className="mt-2">
            If you create a profile for someone else (a son, daughter, brother, sister, relative or
            friend), you must have their permission, and the profile must describe them.
          </p>
        </Section>

        <Section title="3. Why we process your data">
          <p>We use your data for:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Creating your account and providing the matchmaking service</li>
            <li>Showing relevant profiles to you and your profile to relevant others</li>
            <li>Enabling chat between matched users</li>
            <li>Verifying account identity to prevent fraud and abuse</li>
            <li>Processing subscription payments (Pro tier)</li>
            <li>Sending essential service emails (account verification, security alerts)</li>
            <li>Sending optional notifications (new matches, messages, super-likes) — only if you turn them on; you can turn them off any time in Settings or in your phone's settings</li>
            <li>Finding and fixing errors in the app and the website (error reports)</li>
            <li>Investigating reports and enforcing community guidelines</li>
            <li>Complying with legal obligations</li>
          </ul>
        </Section>

        <Section title="4. Legal basis for processing">
          <p>Under GDPR, we process your data on the following legal bases:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Contract:</strong> processing required to deliver the service you signed up for</li>
            <li><strong>Consent:</strong> for special-category data (religion, sexuality, etc.), marketing emails, and optional cookies</li>
            <li><strong>Legitimate interests:</strong> security, fraud prevention, and basic analytics</li>
            <li><strong>Legal obligation:</strong> where required by law (e.g., responding to legal requests)</li>
          </ul>
        </Section>

        <Section title="5. How we share your data">
          <p>We share data with the following categories of recipients:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Other users:</strong> your profile (excluding fields you mark hidden, and never your date of birth) is visible to other users in search results and matches. Other members can filter search results by answers you show, such as religion, mother tongue, caste or community, marital status, height, Manglik status, diet and where you live</li>
            <li><strong>Supabase (database & auth):</strong> our backend hosting provider, EU/US infrastructure</li>
            <li><strong>Vercel (web hosting):</strong> hosts the website and serves it from edge locations worldwide</li>
            <li><strong>Google (Gemini AI):</strong> the text you type into search is sent to Google's Gemini AI to work out what you're looking for, with emails and phone numbers removed. With it we send the list of answers members have chosen for the searchable questions (for example "Tamil, Marathi" for mother tongue), never names, photos, or which answer belongs to whom. Nothing else from your account or profile is sent. We use Google's free tier, under which Google may use this text to improve its services, so please don't type personal details into search</li>
            <li><strong>Google and Apple (sign-in):</strong> if you choose "Continue with Google" or "Continue with Apple", they confirm who you are under their own privacy policies and tell us your name and email address. We never see your Google or Apple password</li>
            <li><strong>Google Play and Apple (app payments):</strong> process Pro subscriptions bought in our Android and iPhone apps under their own privacy policies; we exchange the purchase details with them to check purchases and keep subscriptions current</li>
            <li><strong>Google Firebase Cloud Messaging and Apple Push Notification service (notifications):</strong> if you turn on notifications in our app, each notification (for example "It's a match! You and Priya liked each other") goes with your phone's notification token to Google's Firebase Cloud Messaging, which delivers it to Android phones itself and to iPhones through Apple's push service. Message notifications never include what was written</li>
            <li><strong>Resend (email):</strong> sends transactional emails — when configured with a real domain</li>
            <li><strong>Law enforcement:</strong> only when legally compelled (court order, subpoena)</li>
          </ul>
          <p className="mt-2">
            We <strong>do not sell</strong> your personal data to anyone, ever. We do not run ads
            on the platform.
          </p>
        </Section>

        <Section title="6. International data transfers">
          <p>
            Some of our service providers (Vercel, Supabase, Google, Apple) operate globally and may transfer your
            data outside the European Economic Area. When this happens, we rely on Standard
            Contractual Clauses approved by the European Commission, or the recipient country's
            adequacy decision, to ensure your data is protected.
          </p>
        </Section>

        <Section title="7. How long we keep your data">
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Active account:</strong> as long as you use the service</li>
            <li><strong>Deleted account:</strong> within 30 days of deletion request. Some records (transactions, fraud-prevention logs) may be retained for up to 7 years where legally required.</li>
            <li><strong>Error reports:</strong> we keep at most 5,000; once there are that many, each new one takes the place of the one seen longest ago</li>
            <li><strong>Consent records:</strong> for the duration of our legal obligation to demonstrate compliance (typically 6 years)</li>
            <li><strong>Backups:</strong> regularly overwritten; deleted data is gone within 30 days even from backups</li>
          </ul>
        </Section>

        <Section title="8. Cookies and tracking">
          <p>We use cookies and similar technologies for:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Essential (always on):</strong> keeping you logged in, security tokens, basic functionality</li>
            <li><strong>Analytics (optional):</strong> understanding how the service is used to improve it — disabled by default until you consent</li>
            <li><strong>Marketing (optional):</strong> currently unused, but reserved for future promotional features — disabled by default</li>
          </ul>
          <p className="mt-2">
            You can change your cookie preferences anytime via Settings → Privacy.
          </p>
        </Section>

        <Section title="9. Your rights under GDPR">
          <p>You have the following rights:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Access:</strong> request a copy of all personal data we hold about you</li>
            <li><strong>Rectification:</strong> correct inaccurate data (most fields are editable directly in your profile)</li>
            <li><strong>Erasure ("right to be forgotten"):</strong> delete your account at any time via Settings → Delete Account, or without the app on our website's Delete account page (/delete-account), with a code we email you. If you signed in with Apple, this also ends Sign in with Apple for MatchGPT</li>
            <li><strong>Restriction:</strong> ask us to temporarily stop processing your data</li>
            <li><strong>Portability:</strong> receive your data in a machine-readable format</li>
            <li><strong>Objection:</strong> object to processing based on legitimate interests</li>
            <li><strong>Withdraw consent:</strong> at any time, by changing settings or contacting us</li>
            <li><strong>Complain:</strong> lodge a complaint with your local data protection authority</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, email <a href="mailto:privacy@matchgpt.com" className="text-blue-600 dark:text-blue-400 underline">privacy@matchgpt.com</a>. We will respond within 30 days.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We protect your data with industry-standard security measures including encrypted
            transit (HTTPS/TLS), encrypted storage at rest, row-level security policies on the
            database, and access controls limiting which engineers can view production data.
          </p>
          <p>
            However, no system is 100% secure. If we ever experience a data breach affecting your
            personal data, we will notify you and the relevant authorities within 72 hours, as
            required by GDPR.
          </p>
        </Section>

        <Section title="11. Children's privacy">
          <p>
            MatchGPT is intended only for users 18 years and older. We do not knowingly collect
            data from children under 18. If you become aware that a child has provided us with
            personal data, please contact us immediately and we will delete it.
          </p>
        </Section>

        <Section title="12. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Significant changes will be
            notified to you by email and in the app. The "Last updated" date at the top of this
            document indicates when it was last revised.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about this policy or your data:<br />
            <a href="mailto:privacy@matchgpt.com" className="text-blue-600 dark:text-blue-400 underline">privacy@matchgpt.com</a>
          </p>
        </Section>

        <div className="border-t border-gray-200 dark:border-zinc-800 pt-6 mt-10 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This document was last updated on October 6, 2026 and is identified internally as {PRIVACY_VERSION}.
          </p>
        </div>
      </main>
    </div>
  );
};

export default PrivacyView;
