import React from 'react';
import { IconHeart } from '../constants';
import { LEGAL } from '../lib/legalInfo';
import { HindiSummary, LegalLayout, List, Section, Summary, linkClass } from './legal/LegalLayout';

// ============================================================================
// Community Guidelines and Safety: the rules of the Terms in everyday words,
// and the warnings about fraud that the Government's advisory for matrimonial
// websites asks for (caution members against fraudsters, encourage reporting,
// say that profiles aren't checked unless marked).
// ============================================================================

const SafetyView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <LegalLayout title="Community Guidelines and Safety" icon={<IconHeart />} onBack={onBack}>
    <Summary>
      <p>{LEGAL.brand} is for finding a life partner to marry. Be genuine, be respectful, and take care: never send money
        to anyone you meet here, and report anyone who asks.</p>
    </Summary>

    <Section title="Our community guidelines">
      <List>
        <li><strong>Marriage only.</strong> {LEGAL.brand} is not a dating site. Use it only to find a life partner, for
          yourself or, with their permission, for a family member.</li>
        <li><strong>Be real.</strong> Use your real name, age and details, and recent photos of yourself. Say honestly
          whether you have been married, and whether you are awaiting a divorce.</li>
        <li><strong>Be respectful.</strong> No abuse, threats, harassment or pressure, and no insults about anyone's
          caste, religion, gender, disability or looks. "No" means no.</li>
        <li><strong>No dowry.</strong> Don't ask for, offer or hint at dowry, gifts or money as part of a marriage. It is
          an offence under the Dowry Prohibition Act, 1961.</li>
        <li><strong>Keep it clean.</strong> No nudity, sexual content or requests for intimate photos, and nothing
          involving children.</li>
        <li><strong>Respect privacy.</strong> Don't share anyone's photos, messages, phone number or details outside{' '}
          {LEGAL.brand} without their consent.</li>
        <li><strong>No business.</strong> No advertising, marriage bureaus, agents, selling or spam.</li>
      </List>
      <p>Breaking these can get content removed and an account suspended or closed, and some of it is a crime. The full
        rules are in our <a className={linkClass} href="/terms">Terms of Service</a>.</p>
    </Section>

    <Section title="We don't check every profile">
      <p>A profile has been checked by our team only if it shows the <strong>Verified</strong> badge, and that means we
        checked the social-media profiles the member linked, nothing more. Check for yourself whatever matters to you:
        identity, marital status, education, job and family, for example with documents, video calls and people you
        trust.</p>
    </Section>

    <Section title="Protect your money">
      <List>
        <li><strong>Never send money</strong>, gifts or cryptocurrency, and never share your bank or card details,
          UPI PIN or one-time passwords (OTPs), whatever the story: an emergency, a parcel stuck at customs, hospital
          bills, a visa, an investment or a business deal.</li>
        <li>Be wary of anyone who lives abroad but can't meet or video-call, who moves very fast to talk of marriage
          or love, or who wants to move the conversation off {LEGAL.brand} straight away.</li>
        <li>No genuine customs officer, police officer or bank will ask you to pay them through a match.</li>
      </List>
    </Section>

    <Section title="Before you meet">
      <List>
        <li>Talk on video first, and involve your family early.</li>
        <li>Meet in a busy public place, get there and back on your own, and tell someone you trust where you'll be.</li>
        <li>Don't share your home address, workplace or financial details until you know and trust the person.</li>
        <li>If someone pressures you, threatens you or asks for intimate photos, stop, keep the messages, and report
          them.</li>
      </List>
    </Section>

    <Section title="Report and block">
      <p>On a profile or in a chat, tap ⋯ → Report to tell us, and ⋯ → Block so they can't see or contact you. Reports
        are private. For serious complaints, such as intimate images of you or someone impersonating you, use our{' '}
        <a className={linkClass} href="/grievances">Grievance Redressal</a> page: we act on those within 2 hours.</p>
    </Section>

    <Section title="Get help">
      <List>
        <li>Police and emergencies: <strong>112</strong></li>
        <li>Women's helpline: <strong>181</strong></li>
        <li>Cyber fraud: <strong>1930</strong>, or report at{' '}
          <a className={linkClass} href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a>.
          If you sent money, call 1930 as soon as you can: the sooner, the better the chance of stopping it.</li>
        <li>If someone threatens to share intimate images of you, don't pay. Report them to us and at cybercrime.gov.in.</li>
      </List>
    </Section>

    <HindiSummary>
      <p>शादी24 केवल विवाह के लिए है। अपनी सही जानकारी दें, सबसे सम्मान से बात करें, और दहेज की माँग या पेशकश बिल्कुल न करें।</p>
      <p>हम हर प्रोफ़ाइल की जाँच नहीं करते; केवल "Verified" निशान वाली प्रोफ़ाइल के सोशल मीडिया लिंक जाँचे गए हैं। किसी को कभी पैसे न
        भेजें और बैंक विवरण या OTP साझा न करें। पहली मुलाकात सार्वजनिक स्थान पर करें और परिवार को बताएँ।</p>
      <p>गड़बड़ी दिखे तो Report और Block करें। आपात स्थिति में 112, महिला हेल्पलाइन 181, और साइबर धोखाधड़ी के लिए 1930 पर कॉल करें।</p>
    </HindiSummary>
  </LegalLayout>
);

export default SafetyView;
