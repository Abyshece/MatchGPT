import React from 'react';
import { IconBook } from '../constants';
import { pricesInWords, spotlightPrice, superInterestPrices } from '../lib/billingService';
import { TERMS_VERSION } from '../lib/consentService';
import { DAILY_LIMITS } from '../lib/profileService';
import { LEGAL, orPending } from '../lib/legalInfo';
import { HindiSummary, LegalLayout, List, Mail, Section, Summary, linkClass } from './legal/LegalLayout';

// ============================================================================
// Terms of Service, written for India: the IT Act 2000 and the IT
// (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021 as amended
// to 10 February 2026 (rule 3(1)(b)'s list, rule 3(1)(c)'s consequences), the
// Ministry of Electronics and IT's advisory for matrimonial websites (2016),
// the Prohibition of Child Marriage Act 2006 (21 for men, 18 for women), the
// Dowry Prohibition Act 1961, the Consumer Protection Act 2019 and the
// Digital Personal Data Protection Act 2023. docs/legal/README.md says why
// each part is there. A lawyer should review it before launch.
// ============================================================================

interface TermsViewProps {
  onBack: () => void;
}

const page = (path: string, label: string) => <a className={linkClass} href={path}>{label}</a>;

const TermsView: React.FC<TermsViewProps> = ({ onBack }) => (
  <LegalLayout title="Terms of Service" icon={<IconBook />} version={TERMS_VERSION} onBack={onBack}>
    <Summary>
      <p>Shaadi24 is for finding a life partner to marry, not for dating. You must be of the legal age to marry in
        India (21 for men, 18 for women), use your real details, and treat everyone with respect.</p>
      <p>We don't check every profile, so take care before you trust anyone, and never send money. Report anything
        wrong in the app; our Grievance Officer answers complaints within the times Indian law sets.</p>
      <p>Shaadi24+ is bought in the apps through Google Play or the App Store; cancel any time there.</p>
    </Summary>

    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-8">
      These Terms of Service (the "Terms") are an agreement between you and {LEGAL.operator}, {LEGAL.operatorKind === 'sole proprietor' ? 'the proprietor who runs' : 'which runs'}{' '}
      {LEGAL.brand} ("{LEGAL.brand}", "we", "us"). They are an electronic record under the Information Technology Act,
      2000 and the rules made under it, and need no signature. By creating an account or using {LEGAL.brand}'s apps
      or website you agree to them. Our {page('/privacy', 'Privacy Policy')},{' '}
      {page('/safety', 'Community Guidelines and Safety')}, {page('/refunds', 'Refund and Cancellation Policy')} and{' '}
      {page('/grievances', 'Grievance Redressal')} page are part of these Terms.
    </p>

    <Section title="1. Shaadi24 is for marriage only">
      <p>{LEGAL.brand} is a matrimonial platform. It is meant only for people looking for a life partner to marry, and
        for their families. It is <strong>not a dating website</strong>, and it must not be used for dating, casual or
        sexual relationships, friendship, or posting obscene material.</p>
      <p>{LEGAL.brand} is an intermediary: we provide the platform on which members post profiles and talk to each
        other. We do not arrange, broker or solemnise marriages, and we are not a party to any conversation, meeting,
        agreement or marriage between members. Whether and how a marriage can be solemnised or registered depends on
        the law that applies to the two people concerned.</p>
      <p><strong>We do not check every profile.</strong> A profile has been checked by us only if it shows the Verified
        badge, and the badge means only that our team compared a selfie the member took, doing a gesture we asked
        for, with their profile photos (and looked at any social-media profiles they linked). We do
        not verify identity documents, age, marital status, religion, community, education, income, family or
        anything else a member says unless we say so on the profile. Please check what you rely on yourself
        (section 8).</p>
    </Section>

    <Section title="2. Who can use Shaadi24">
      <List>
        <li>You must be of the legal age to marry in India under the Prohibition of Child Marriage Act, 2006:
          <strong> 21 years or older for men and 18 years or older for women.</strong> Members of any other gender must be
          21 or older. Profiles of anyone younger are removed.</li>
        <li>You must be free to marry: not married, unless you are awaiting a divorce or annulment and say so in your
          profile. You may not marry again until a divorce or annulment is final; marrying again while a husband or
          wife is living is an offence under section 82 of the Bharatiya Nyaya Sanhita, 2023 (except where the law
          that applies to you allows it).</li>
        <li>You must be able to enter into a contract under the Indian Contract Act, 1872, and must not have been
          banned from {LEGAL.brand} before.</li>
        <li>One account per person. Profiles for businesses, marriage bureaus or agents are not allowed.</li>
      </List>
    </Section>

    <Section title="3. Profiles made for someone else">
      <p>A parent, brother or sister, relative or friend may create and look after a profile for someone (the
        "member"), but only with the member's knowledge and permission. If you do, you confirm that:</p>
      <List>
        <li>the member is of the legal age to marry (section 2) and wants to marry;</li>
        <li>the member has agreed to the profile and to you sharing their details and photos on {LEGAL.brand};</li>
        <li>everything in the profile is true and describes the member, not you; and</li>
        <li>the member can see, change or delete the profile at any time.</li>
      </List>
      <p>The member is the person the personal data is about. If the member asks us, we will give them control of the
        profile or delete it.</p>
    </Section>

    <Section title="4. Your account and your details">
      <List>
        <li>Keep your password and sign-in safe. You are responsible for what happens on your account; tell us at once
          at <Mail to={LEGAL.supportEmail} /> if someone else uses it.</li>
        <li>The details you give must be true, complete and current, to the best of your knowledge, including your
          age, marital status, children, religion, community, education, occupation and income where you give them.
          Your photos must be recent photos of you (or of the member).</li>
        <li>As the Digital Personal Data Protection Act, 2023 (section 15) asks of everyone, you must not impersonate
          anyone, must not hide material information when you give your details, and must not make false or
          frivolous complaints.</li>
      </List>
    </Section>

    <Section title="5. What you must not post or do">
      <p>As the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 require,
        you must not host, display, upload, modify, publish, transmit, store, update or share any information that:</p>
      <List ordered>
        <li>belongs to another person and to which you have no right (for example, someone else's photos);</li>
        <li>is obscene, pornographic, paedophilic, invasive of another person's privacy including bodily privacy,
          insulting or harassing on the basis of gender, racially or ethnically objectionable, relating to or
          encouraging money laundering or gambling, or promoting enmity between groups on the grounds of religion or
          caste with the intent to incite violence;</li>
        <li>is harmful to a child;</li>
        <li>infringes any patent, trademark, copyright or other proprietary right;</li>
        <li>deceives or misleads anyone about the origin of a message, or knowingly and intentionally communicates
          misinformation or information that is patently false, untrue or misleading;</li>
        <li>impersonates another person;</li>
        <li>threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with foreign
          States, or public order, incites the commission of any cognisable offence, prevents the investigation of any
          offence, or insults any other nation;</li>
        <li>contains a software virus or any other code, file or program designed to interrupt, destroy or limit the
          functionality of any computer resource;</li>
        <li>is an online game that is not a permissible online game, or advertises or promotes one; or</li>
        <li>violates any law for the time being in force.</li>
      </List>
      <p>Because {LEGAL.brand} is for marriage, you must also not:</p>
      <List>
        <li><strong>ask for, offer or advertise dowry</strong>, in any form. Giving, taking or demanding dowry is an
          offence under the Dowry Prohibition Act, 1961, and offering money or property as consideration for a
          marriage in any advertisement is punishable under its section 4A;</li>
        <li>ask other members for money, gifts, loans, investments, cryptocurrency, bank or card details or one-time
          passwords, or take part in any fraud;</li>
        <li>harass, stalk, threaten, blackmail or abuse anyone, or discriminate against anyone for their caste,
          religion, gender, disability or appearance in a way that insults or demeans them;</li>
        <li>ask for or share intimate images, or share another member's photos, messages or details outside{' '}
          {LEGAL.brand} without their consent (showing your shortlist to the family you invite to Family Circle, as
          members see those profiles, is allowed; you are responsible for who you invite, and they must keep what they
          see within the family);</li>
        <li>create a fake or second profile, or a profile for a child or for anyone without their permission;</li>
        <li>use {LEGAL.brand} for business: advertising, marriage bureaus or agents, recruitment, selling, or spam; or</li>
        <li>copy or collect other members' data, use bots or automated tools, reverse-engineer the apps, or get around
          our security or limits.</li>
      </List>
      <p>Our <a className={linkClass} href="/safety">Community Guidelines</a> explain these rules in everyday words.</p>
    </Section>

    <Section title="6. What happens if these rules are broken">
      <p>As the IT Rules require us to tell you, and as we remind every member at least once every three months:</p>
      <List>
        <li>if you do not follow these Terms, our Privacy Policy or our Community Guidelines, we may immediately
          suspend or end your access to {LEGAL.brand}, remove or disable access to what you posted, or both;</li>
        <li>if you post or share information that breaks the law, you may be liable to penalty or punishment under the
          Information Technology Act, 2000 and other laws; and</li>
        <li>where it is an offence that the law requires to be reported, such as under the Bharatiya Nagarik Suraksha
          Sanhita, 2023 or the Protection of Children from Sexual Offences Act, 2012, we will report it to the
          appropriate authority.</li>
      </List>
      <p>Words we do not allow are refused before anyone sees them, and you can report any profile or conversation
        (⋯ → Report) and block anyone. We review reports and act within the times in section 10. When we remove
        something, we keep it and the records about it for 180 days (longer if a court or lawfully authorised agency
        asks), as rule 3(1)(g) of the IT Rules requires, and we give information to lawfully authorised government
        agencies when they order it.</p>
    </Section>

    <Section title="7. What you post">
      <p>Your profile, photos and messages stay yours. You allow {LEGAL.brand} to store them, show them to other
        members as the app does (for example, your profile in search results and your messages to the person you
        send them to), and adapt them only as needed to do so (such as resizing photos), for as long as they are on{' '}
        {LEGAL.brand}. This permission ends when you delete them or your account, except for what the law requires
        us to keep (our <a className={linkClass} href="/privacy">Privacy Policy</a> says what and for how long).</p>
      <p>Only post what you have the right to post. Do not post photos of children or of other people without their
        consent. We may remove anything that breaks these Terms.</p>
      <p>{LEGAL.brand}'s search uses artificial intelligence (Google's Gemini) to understand what you type, and
        compatibility scores are estimates worked out from profile answers. They are suggestions, not promises.{' '}
        {LEGAL.brand} does not create images, audio or video of anyone.</p>
    </Section>

    <Section title="8. Your safety, and checking for yourself">
      <p>Most members are genuine, but some people use matrimonial sites to cheat others. Before you trust anyone or
        decide anything:</p>
      <List>
        <li>talk on video, involve your family, and meet in a public place first;</li>
        <li>check what matters to you (identity, marital status, education, job, family) yourself, for example with
          documents and through people you trust; and</li>
        <li><strong>never send money</strong> or share bank details, one-time passwords or intimate photos, whatever
          reason you are given. Report anyone who asks.</li>
      </List>
      <p>We are not responsible for what members say or do on or off {LEGAL.brand}, but we act on every report. Our{' '}
        <a className={linkClass} href="/safety">Safety page</a> has more advice and the numbers to call for help.</p>
    </Section>

    <Section title="9. Shaadi24+ and payments">
      <List>
        <li>{LEGAL.brand} is free to use. Every account has limits on AI searches: a number every few hours, a day and
          a week (the week starts on Friday evening, India time). Settings in the app shows them, how many you have
          used and when each resets. Free accounts also have {DAILY_LIMITS.FREE.likes} likes a day, and completing your
          profile adds free searches a day. Shaadi24+ is a paid subscription with higher search limits, unlimited likes
          and the other features listed in the app.</li>
        <li>We may change these limits to keep {LEGAL.brand} running well for everyone. The app always shows the current
          ones, and we tell Shaadi24+ members in the app before we lower theirs.</li>
        <li>Shaadi24+ is sold only in our Android and iPhone apps, through Google Play and the App Store. It runs for one
          week, one month, three months or six months; our prices in India are {pricesInWords()}. The store shows you the final price, including GST and any other
          taxes, before you confirm, takes the payment, and its own terms of sale also apply. We never see your
          card, UPI or bank details.</li>
        <li>A subscription renews automatically at the end of each period until you cancel it. You can cancel any time
          in Google Play or in your Apple Account's subscriptions (Settings → Shaadi24+ in the app shows how); it then
          stays on until the end of the period you paid for. If the store offers a free trial, you are told its length
          and the price that follows before you start, and you are not charged if you cancel before it ends.</li>
        <li>If we change the price, the store tells you before the new price applies to a renewal, and you can cancel
          before it does.</li>
        <li><strong>Spotlight and Super Interest</strong> are bought one at a time in the apps, the same way, with or
          without Shaadi24+, and don't renew. A Spotlight ({spotlightPrice()}) shows your profile first, marked
          Spotlight, to members searching in your city or state for 24 hours from when you start it; it doesn't
          promise likes or matches. A Super Interest ({superInterestPrices()}) is a like with a short note that shows
          your profile and the note to that person even if they don't have Shaadi24+; Shaadi24+ includes 3 a week.
          Notes must follow section 5. Each is used once; ones you haven't used stay in your account, and are lost if
          the account is deleted or suspended for breaking these Terms.</li>
        <li>Refunds: see our <a className={linkClass} href="/refunds">Refund and Cancellation Policy</a>.</li>
      </List>
    </Section>

    <Section title="10. Reports, complaints and appeals">
      <p>Report a profile or a message in the app (⋯ → Report), or make a complaint on our{' '}
        <a className={linkClass} href="/grievances">Grievance Redressal</a> page, where you can also reach our
        Grievance Officer, {LEGAL.grievanceOfficer.name} (<Mail to={LEGAL.grievanceEmail} />). As the IT Rules
        require, we acknowledge complaints within 24 hours; act on a complaint about intimate or sexual images of
        you, or of someone impersonating you, within 2 hours; resolve requests to remove unlawful content within 36
        hours; and resolve other complaints within 7 days. Complaints about payments are acknowledged within 48
        hours and resolved within a month, as the Consumer Protection (E-Commerce) Rules, 2020 require.</p>
      <p>If you are not satisfied with the Grievance Officer's decision, or it is not resolved in time, you can appeal
        to the Grievance Appellate Committee within 30 days (<a className={linkClass} href="https://gac.gov.in" target="_blank" rel="noreferrer">gac.gov.in</a>).</p>
    </Section>

    <Section title="11. Ending your account">
      <p>You can delete your account at any time: in the app (Settings → Delete Account) or on our{' '}
        <a className={linkClass} href="/delete-account">Delete account</a> page. Our Privacy Policy says what is
        deleted and what the law requires us to keep, and for how long.</p>
      <p>We may suspend or end an account that breaks these Terms or the law, or that puts other members at risk.
        We will tell you why when we can (unless the law or an investigation stops us), and you can ask our
        Grievance Officer to look at the decision again.</p>
    </Section>

    <Section title="12. Our responsibility to you">
      <p>We provide {LEGAL.brand} with reasonable care and skill, but as it is: we do not promise that you will find a
        match, that profiles are accurate, or that the service will always be available or free of errors. As an
        intermediary that follows the due diligence the IT Act requires, we are not responsible for information that
        members post or send (section 79 of the IT Act).</p>
      <p>As far as Indian law allows, we are not liable for indirect or consequential losses, and our total liability
        to you for any claim is limited to what you paid us for Shaadi24+ in the 12 months before the claim (or
        ₹1,000 if you paid nothing). Nothing in these Terms limits any liability that the law does not allow to be
        limited, or your rights as a consumer under the Consumer Protection Act, 2019.</p>
      <p>You agree to make good any loss we suffer because you broke these Terms or the law, to the extent the law
        allows.</p>
    </Section>

    <Section title="13. Changes to Shaadi24 and to these Terms">
      <p>We may change {LEGAL.brand} and these Terms. We tell you about changes in the app, and for changes that
        matter we ask you to read and accept the new Terms before you continue. At least once a year we remind you of
        these Terms, our Privacy Policy and our rules, as the IT Rules require.</p>
    </Section>

    <Section title="14. Law, disputes and language">
      <p>These Terms are governed by the laws of India. Please tell us about any problem first (section 10); most are
        settled that way. Otherwise the courts at {LEGAL.jurisdictionCity} have jurisdiction, without affecting your
        right to go to a consumer commission under the Consumer Protection Act, 2019 or to appeal to the Grievance
        Appellate Committee.</p>
      <p>These Terms are written in English, and the English text is the one that applies. A Hindi summary is below; on
        request we will give you these Terms in any language of the Eighth Schedule to the Constitution.</p>
    </Section>

    <Section title="15. Contact">
      <List>
        <li>Run by: {LEGAL.operator} ({LEGAL.operatorKind}), address: {orPending(LEGAL.address)}</li>
        <li>Help and support: <Mail to={LEGAL.supportEmail} /> ({LEGAL.supportHours})</li>
        <li>Grievance Officer: {LEGAL.grievanceOfficer.name}, <Mail to={LEGAL.grievanceEmail} /></li>
        <li>Your personal data: <Mail to={LEGAL.privacyEmail} /></li>
      </List>
    </Section>

    <HindiSummary>
      <p>शादी24 केवल विवाह के लिए जीवनसाथी खोजने का मंच है, डेटिंग साइट नहीं। उपयोग के लिए पुरुषों की आयु कम से कम 21 वर्ष और
        महिलाओं की कम से कम 18 वर्ष होनी चाहिए। अपनी सही जानकारी दें, किसी और का रूप न धरें, और सबसे सम्मान से बात करें।</p>
      <p>दहेज माँगना, देना या उसका विज्ञापन करना अपराध है और यहाँ पूरी तरह मना है। अश्लील, अपमानजनक, धमकी भरी, झूठी या गैरकानूनी सामग्री
        न डालें; नियम तोड़ने पर खाता तुरंत बंद किया जा सकता है और कानून के अनुसार कार्रवाई हो सकती है।</p>
      <p>हम हर प्रोफ़ाइल की जाँच नहीं करते। किसी पर भरोसा करने से पहले स्वयं जाँच करें, परिवार को शामिल करें, और कभी पैसे न भेजें।
        शिकायत के लिए ऐप में Report करें या शिकायत निवारण अधिकारी से संपर्क करें; उनके निर्णय से असंतुष्ट होने पर 30 दिनों में
        शिकायत अपीलीय समिति (gac.gov.in) में अपील कर सकते हैं।</p>
    </HindiSummary>
  </LegalLayout>
);

export default TermsView;
