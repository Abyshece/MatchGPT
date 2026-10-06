import React from 'react';
import { IconBook } from '../constants';
import { LEGAL } from '../lib/legalInfo';
import { HindiSummary, LegalLayout, List, Mail, Section, Summary, linkClass } from './legal/LegalLayout';

// ============================================================================
// Refund and Cancellation Policy for Shaadi24+, which is sold only in the apps
// through Google Play and the App Store. The Consumer Protection (E-Commerce)
// Rules 2020 ask sellers to state cancellation and refund terms clearly, and
// the Dark Patterns Guidelines 2023 forbid making a subscription hard to cancel.
// ============================================================================

const RefundsView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <LegalLayout title="Refund and Cancellation Policy" icon={<IconBook />} onBack={onBack}>
    <Summary>
      <p>Shaadi24+ is bought in our Android and iPhone apps through Google Play or the App Store. You can cancel any
        time, and it stays on until the end of the period you paid for. If something went wrong, ask us or the store
        for a refund.</p>
    </Summary>

    <Section title="1. What you buy">
      <p>Shaadi24+ is a subscription of one month (₹999) or one year (₹9,999) in India, that renews automatically until
        you cancel. The store shows you the final price, including GST and any other taxes, and any free trial, before
        you confirm. {LEGAL.brand} itself is free to use.</p>
    </Section>

    <Section title="2. Cancelling">
      <List>
        <li><strong>On Android</strong>: Google Play → your profile picture → Payments and subscriptions →
          Subscriptions → Shaadi24+ → Cancel subscription.</li>
        <li><strong>On iPhone</strong>: Settings → your name → Subscriptions → Shaadi24+ → Cancel Subscription. Cancel
          at least 24 hours before the end of a period so that it doesn't renew.</li>
        <li>In the app, Settings → Shaadi24+ → Manage subscription takes you there.</li>
      </List>
      <p>When you cancel, you are not charged again, and Shaadi24+ stays on until the end of the period you have paid
        for. Cancelling during a free trial means you are not charged at all. Deleting your {LEGAL.brand} account stops a
        Google Play subscription, but an App Store subscription must be cancelled in your Apple Account (the app reminds
        you).</p>
    </Section>

    <Section title="3. Refunds">
      <List>
        <li>We don't refund the unused part of a period you cancelled, except where the law requires it.</li>
        <li>We do refund if you were charged by mistake (for example, twice), or if Shaadi24+ didn't work for you
          because of a fault on our side that we couldn't fix. Write to us within 30 days of the charge.</li>
        <li><strong>Google Play</strong>: you can ask Google for a refund in Google Play (Order history → Request a
          refund), or ask us: we can refund Google Play purchases ourselves.</li>
        <li><strong>App Store</strong>: Apple handles refunds. Ask at{' '}
          <a className={linkClass} href="https://reportaproblem.apple.com" target="_blank" rel="noreferrer">reportaproblem.apple.com</a>;
          we can't refund App Store purchases ourselves, but write to us and we'll help.</li>
        <li>A refund goes back to the way you paid, usually within 5 to 10 working days of the store approving it.</li>
      </List>
    </Section>

    <Section title="4. Price changes">
      <p>If we change the price of Shaadi24+, the store tells you before the new price applies to your renewal, and you
        can cancel before it does.</p>
    </Section>

    <Section title="5. Questions and complaints">
      <p>Write to <Mail to={LEGAL.supportEmail} /> with your store's order number, or use the form on our{' '}
        <a className={linkClass} href="/grievances">Grievance Redressal</a> page. We acknowledge complaints about
        payments within 48 hours and resolve them within a month. You can also contact the National Consumer Helpline
        on 1915.</p>
    </Section>

    <HindiSummary>
      <p>शादी24+ केवल हमारे Android और iPhone ऐप में Google Play या App Store के माध्यम से खरीदा जाता है। आप इसे कभी भी रद्द कर
        सकते हैं; भुगतान की गई अवधि के अंत तक यह चालू रहेगा।</p>
      <p>गलती से दो बार शुल्क लगने या हमारी तकनीकी खराबी से सेवा न मिलने पर 30 दिनों के भीतर हमें लिखें; हम धनवापसी करेंगे। भुगतान
        संबंधी शिकायत 48 घंटे में स्वीकार और एक महीने में निपटाई जाती है।</p>
    </HindiSummary>
  </LegalLayout>
);

export default RefundsView;
