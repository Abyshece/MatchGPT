import React from 'react';
import { IconShield } from '../constants';
import { PRIVACY_VERSION } from '../lib/consentService';
import { LEGAL, orPending } from '../lib/legalInfo';
import { HindiSummary, LegalLayout, List, Mail, Section, Summary, linkClass } from './legal/LegalLayout';

// ============================================================================
// Privacy Policy, written for India. It is the notice the Digital Personal Data
// Protection Act 2023 (section 5) and Rules 2025 (rule 3) ask for: what personal
// data, for what, how to withdraw consent, use your rights and complain to the
// Data Protection Board (most of the Act applies from 13 May 2027), and the
// privacy policy that the IT (Reasonable Security Practices and Sensitive
// Personal Data or Information) Rules 2011 and IT Rules 2021 ask for now. What
// we keep after an account is deleted, and for how long, follows rule 3(1)(g)
// and (h) of the IT Rules, the 2016 advisory for matrimonial websites and rule
// 8(3) of the DPDP Rules (docs/legal/README.md). A lawyer should review it.
// ============================================================================

interface PrivacyViewProps {
  onBack: () => void;
}

// An item of personal data and why we use it
const Item: React.FC<{ what: React.ReactNode; why: React.ReactNode }> = ({ what, why }) => (
  <li className="py-2.5">
    <div className="font-semibold text-gray-900 dark:text-white">{what}</div>
    <div className="mt-0.5">{why}</div>
  </li>
);

const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => (
  <LegalLayout title="Privacy Policy" icon={<IconShield />} version={PRIVACY_VERSION} onBack={onBack}>
    <Summary>
      <p>We use your details to show your profile to people who might marry you and to find you matches. Your data is
        stored in {LEGAL.dataRegion}. We never sell it and show no ads.</p>
      <p>Only your sign-in and the basics are required; everything else is optional, and you can hide any answer.
        Sensitive details (such as religion, caste, health or who you are interested in) are used only with your
        consent, which you can withdraw.</p>
      <p>You can see, download, correct and delete your data in the app, and complain to our Grievance Officer and
        then to the Data Protection Board of India.</p>
    </Summary>

    <Section title="1. Who we are">
      <p>{LEGAL.brand} is run by {LEGAL.operator} ({LEGAL.operatorKind}; address: {orPending(LEGAL.address)}), who
        decides how and why your personal data is used: in India's Digital Personal Data Protection Act, 2023 (the
        "DPDP Act"), the "Data Fiduciary". This policy is the notice that Act asks for, and the privacy policy that the
        Information Technology Act, 2000 and its rules ask for.</p>
      <p>Questions about your personal data: <Mail to={LEGAL.privacyEmail} />. Our Grievance Officer is{' '}
        {LEGAL.grievanceOfficer.name} (<Mail to={LEGAL.grievanceEmail} />; see our{' '}
        <a className={linkClass} href="/grievances">Grievance Redressal</a> page).</p>
    </Section>

    <Section title="2. The personal data we use, and why">
      <p>{LEGAL.brand} is a matrimonial service: it lets you make a profile, find people you might marry and talk to
        them. This is what we use for it.</p>
      <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
        <Item what="Your account: email address, password (kept only in a form that can't be turned back into it), and how you sign in"
          why="To create your account, sign you in and keep it secure. With Google or Apple sign-in, they give us your name, email address and an identifier; with Apple you can hide your email, and for Sign in with Apple we keep a token from Apple, used only to end Sign in with Apple when you delete your account." />
        <Item what="The answers every member gives: who the profile is for, name, date of birth, gender, who you are interested in, marital status, children, height, country, state and city, religion, mother tongue, highest qualification, occupation, and a few sentences about yourself"
          why="To show your profile to people who might want to marry you, and to find your matches. Your date of birth also lets us check you are of the legal age to marry (other members only ever see your age)." />
        <Item what="Optional answers you choose to give: caste or community, sub-caste, sect, gotra, horoscope (Manglik, rashi, nakshatra, time and place of birth), education and work (degree, college, employer, job, annual income), family (parents' occupations, brothers and sisters, family type, status, values and where they live), lifestyle, appearance, plans and personality, hometown, disability, vaccination and similar"
          why="To show your profile and work out how well you might match someone. Completing sections of these also gives you extra free searches a day. Leave out anything you prefer not to say." />
        <Item what="Photos" why="To show your profile to other members. Our team checks new photos, and what you write about yourself and your family, before other members see them." />
        <Item what="If you ask for the Verified badge: a selfie you take doing a gesture we ask for (a thumbs up, say), and links to your profiles on LinkedIn, Instagram, Facebook or X if you add them"
          why="So our team can compare the selfie with your profile photos, look at the links, and give your profile the Verified badge, or tell you why not. Only our verification team sees them. A person compares the photos: we don't use face recognition. The selfie is deleted once we've decided, or when you delete your account." />
        <Item what="Your phone number, only if you share it in a chat with Share my number"
          why="To show it to the match you shared it with, in that chat. If you ask us to remember it, it's kept on your account for next time, never shown on your profile, and used to recognise a banned member's phone." />
        <Item what="What you do on Shaadi24: likes, matches, messages, what you search for, Standouts, the people you block and the reports you make"
          why="To provide these features (for example, to deliver your messages), to keep members safe, and to act on reports. To keep members safe our systems also look for signs of scams and fake profiles, such as messages asking for money, the same message sent to many people, or the same photo on several accounts; our team looks at what was flagged and can stop the account. Short searches that at least two members near you have made show as Trending on Find Match, never with who made them, and never with numbers, email addresses or links." />
        <Item what="Device and technical data: the internet (IP) addresses and devices you sign in from and use to set up your profile, the app's version, the app's ID for your phone (we keep only a scrambled form of it, which can't be turned back into the ID), and a notification token if you turn notifications on"
          why="To keep accounts secure, prevent fraud, fake profiles and repeat accounts (for example, free searches are limited to three accounts on one phone, and a banned member's phone is recognised), send notifications you asked for, and keep the records Indian law requires (section 6)." />
        <Item what="Error and crash reports" why="When something goes wrong in the app, we get what went wrong, on which screen, and the kind of device, without your name, email or account; email addresses and phone numbers in it are removed first. If the Android or iPhone app crashes, Firebase Crashlytics sends us where in the app it crashed, the app's version, the kind of phone and its system version, and a random ID for that install, never your name, email, account or what's on the screen." />
        <Item what="Purchases of Shaadi24+, Spotlight and Super Interests: the store's order number, the plan or pack, the price, dates and refunds (never your card, UPI or bank details)"
          why="To give you what you bought and keep the accounts that tax law requires. While your Spotlight is on, we count how many searches it was shown in, to tell you how it went." />
        <Item what="Complaints, problems and requests you send us (a problem you report comes with the screen you were on, the app's version and the kind of phone or browser), and the consents you give (which documents, when)"
          why="To answer them (Settings → My requests shows where each stands, and we send you a message when one is answered), to fix what went wrong, and to show what you agreed to." />
      </ul>
      <p><strong>Sensitive details.</strong> Some of this is sensitive: who you are interested in (which can show your
        sexual orientation), any health detail such as a disability or vaccination, and your password are "sensitive
        personal data" under the IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or
        Information) Rules, 2011, and many people also regard religion, caste and horoscope details as private. We use
        them only with the consent you give on the consent screen, only to provide {LEGAL.brand}, and you can leave
        out, hide or delete the optional ones at any time.</p>
      <p><strong>Profiles made for someone else.</strong> If a parent, relative or friend makes a profile for someone,
        the personal data is that person's. The person making it confirms that they have that person's permission
        (see our <a className={linkClass} href="/terms">Terms</a>, section 3), and that person can use all the rights
        in section 7.</p>
      <p>We don't use your data for advertising, we don't sell it, and we don't make decisions with legal effects about
        you by automated means: match scores only change the order in which profiles are shown.</p>
    </Section>

    <Section title="3. Who sees your data">
      <List>
        <li><strong>Other members</strong> see your profile and photos, except answers you hide and your date of birth
          (they see your age), and can filter searches by the answers you show. Whether you're online shows only if
          Active Status is on. Messages are seen by the person you send them to. When you send a Super Interest, that
          person sees your profile and your note even without Shaadi24+. While your Spotlight is on, you're shown first,
          marked Spotlight, to members searching near you. In your first week your card says New, and if you answer most
          people who write to you (worked out each day from the last 90 days of chats), it says Usually replies. If you
          haven't opened the app for 60 days, you're left out of search until you come back. Members can search by
          your family's home state and by who manages your profile (you, parents, or a sibling, relative or friend).
          Your partner preferences and saved searches are seen only by you; we use them to pick your Standouts, to start
          your searches and to tell you about new members who fit. Your phone number is seen only by a match you share
          it with, in your chat; once shared it can't be taken back. When you report someone, they aren't told who
          reported them, and you're told only whether we acted. In the Android app, screenshots and screen recordings
          of Shaadi24 are blocked, to protect members' photos and chats.</li>
        <li><strong>People you share a link with.</strong> If you share your biodata, anyone with its link or QR code
          can open a page that shows what other members see of your profile (never what you hid, your email or a phone
          number), until you turn the link off in My Biodata. If you invite family to Family Circle, each person you
          invite sees, through their own private link, the people you liked or matched with, as members see them (never
          your chats), and can react, until you remove them. Your profile can be shown to other members' families in
          the same way, unless you turn off "Show me to members' families" in Settings.</li>
        <li><strong>Our team</strong> sees what it needs to verify profiles, check new photos and profile text, look into
          possible scams, review reports and complaints, and run{' '}
          {LEGAL.brand}, and every action in the admin panel is logged.</li>
        <li><strong>Service providers</strong> that process data for us, under contract and only to provide{' '}
          {LEGAL.brand} (in the DPDP Act, "Data Processors"):
          <List>
            <li>Supabase: our database, photo storage and sign-in, on servers in {LEGAL.dataRegion};</li>
            <li>Vercel: hosts the website;</li>
            <li>Google: Gemini, which reads the text you type into search (with email addresses and phone numbers
              removed, and never with your name or profile) to understand what you're looking for; Firebase Cloud
              Messaging, which delivers notifications; Firebase Crashlytics, which sends us the apps' crash reports;
              Google sign-in; and Google Play, which sells Shaadi24+ on Android;</li>
            <li>Apple: Sign in with Apple, the App Store and its notification service on iPhone; and</li>
            <li>an email service, to send sign-up codes and password resets.</li>
          </List>
        </li>
        <li><strong>The authorities</strong>, when Indian law requires it: for example, government agencies lawfully
          authorised to ask for information to verify identity or to prevent, detect, investigate or prosecute offences
          (IT Rules 2021, rule 3(1)(j)), and courts.</li>
        <li>If {LEGAL.brand} is ever sold or merged, your data would go to the new owner under this policy, and we would
          tell you first.</li>
      </List>
    </Section>

    <Section title="4. Where your data is kept">
      <p>Your profile, photos, messages and the rest of your account are kept on servers in {LEGAL.dataRegion}. Some
        service providers in section 3 (such as Google, Apple and Vercel) process some data outside India, for
        example the text of a search or a notification on its way to your phone. The DPDP Act allows this except to
        countries the Government of India restricts, and we require them to protect the data.</p>
    </Section>

    <Section title="5. How we keep it safe">
      <p>Data is encrypted on its way to and from our servers (HTTPS) and where it is stored; database rules let each
        member read only what they are allowed to; few people on our team can reach members' data, and their actions
        are logged. These are the reasonable security practices the IT Rules ask for.</p>
      <p>If a breach of personal data ever happens, we will tell the affected members and the Data Protection Board of
        India without delay, as the DPDP Rules require (with a full report to the Board within 72 hours), and report it
        to CERT-In, India's computer emergency response team.</p>
    </Section>

    <Section title="6. How long we keep it">
      <List>
        <li>While your account is open, we keep your data so that {LEGAL.brand} works for you. You can delete any
          optional answer, photo or your whole account at any time.</li>
        <li><strong>When you delete your account</strong>, your profile, photos, likes, matches, messages and searches
          are deleted straight away, and from our backups within 30 days.</li>
        <li>A verification selfie is deleted once our team has decided, approved or not.</li>
        <li><strong>What Indian law requires us to keep after that</strong>, kept apart, seen by nobody at{' '}
          {LEGAL.brand} except to answer a lawful request, and then deleted:
          <List>
            <li>a registration record (your name, email address, date of birth, gender, city, when you joined and
              left, and the internet addresses you used to set up and use your profile) for one year after the account
              is deleted. The IT Rules 2021 require registration details to be kept for 180 days after an account ends
              (rule 3(1)(h)), the Government's advisory for matrimonial websites asks for the address used to set up
              a profile to be kept for one year, and the DPDP Rules require records of processing to be kept for one
              year (rule 8(3));</li>
            <li>anything removed after a complaint or report, with the records about it, for 180 days, or longer if a
              court or lawfully authorised agency asks (IT Rules, rule 3(1)(g));</li>
            <li>records of Shaadi24+ purchases, for up to 8 years, as tax and accounting laws require;</li>
            <li>records of the consents you gave, for up to 3 years after your account ends, to show what you agreed
              to; and</li>
            <li>complaints to our Grievance Officer and our answers, for 3 years after each complaint is closed.</li>
          </List>
        </li>
        <li>Error reports carry nothing that identifies you; we keep at most 5,000 of them.</li>
      </List>
    </Section>

    <Section id="rights" title="7. Your rights, and how to use them">
      <p>Under the DPDP Act you have these rights. Most can be used in the app at once; for the rest, write to{' '}
        <Mail to={LEGAL.privacyEmail} /> from your account's email address, or use the form on our{' '}
        <a className={linkClass} href="/grievances">Grievance Redressal</a> page.</p>
      <List>
        <li><strong>See your data and get a copy</strong>: Settings → Download my data gives you everything we hold
          about you, and who we share it with is in section 3.</li>
        <li><strong>Correct or complete it</strong>: edit your profile in My Profile.</li>
        <li><strong>Erase it</strong>: delete answers or photos in My Profile, or your whole account in Settings →
          Delete Account or on our <a className={linkClass} href="/delete-account">Delete account</a> page (except what
          section 6 says the law requires us to keep).</li>
        <li><strong>Withdraw your consent</strong>, as easily as you gave it: turn off notifications or emails from us
          in Settings, delete sensitive answers, or delete your account. Withdrawing doesn't affect what was done
          before, but without the consent to use your basic profile we can't provide {LEGAL.brand}.</li>
        <li><strong>Nominate someone</strong> to use these rights for you if you die or become unable to: write to us
          with their name and contact details.</li>
        <li><strong>Have your complaints answered</strong>: our Grievance Officer answers within 7 days, and always
          within the 90 days the DPDP Rules allow. If you're not satisfied, you can complain to the{' '}
          <strong>Data Protection Board of India</strong> once you have used our grievance process.</li>
      </List>
      <p>If a member has a lawful guardian, the guardian can use these rights for them. We may ask you to confirm who
        you are before we act on a request.</p>
    </Section>

    <Section title="8. Children">
      <p>{LEGAL.brand} is only for people of the legal age to marry in India: men of 21 or older and women of 18 or
        older (members of any other gender, 21 or older). We don't knowingly collect data about children or anyone
        younger than that, and we delete such profiles when we find them. If you know of one, please report it.</p>
    </Section>

    <Section title="9. On your device">
      <p>The apps and the website keep your sign-in and settings on your device so you stay signed in. The website
        shows a cookie notice, and uses no advertising or tracking cookies; any optional analytics stays off unless you
        turn it on. Notifications are sent only if you turn them on, and you can turn them off in Settings or in your
        phone's settings. They include a weekly summary on Mondays (your likes, matches and messages that week) when
        there is something to tell. If your Shaadi24+ renews by itself, we send you a message a few days before it
        renews or before a free trial ends (a day before, for a weekly plan), with the price and how to cancel, even
        with notifications off. Emails with tips and news are sent only if you agreed, and you can stop them in Settings.</p>
    </Section>

    <Section title="10. Changes to this policy">
      <p>We tell you about changes in the app. If we start using your data in a new way, or change this policy in a way
        that matters, we ask you to read and accept it before you continue. We also remind you of this policy at
        least once a year.</p>
    </Section>

    <Section title="11. Contact">
      <List>
        <li>Questions about your personal data, and requests: <Mail to={LEGAL.privacyEmail} /></li>
        <li>Grievance Officer: {LEGAL.grievanceOfficer.name}, <Mail to={LEGAL.grievanceEmail} /></li>
        <li>{LEGAL.operator}, {orPending(LEGAL.address)}</li>
      </List>
      <p>This policy is in English, and the English text is the one that applies. A Hindi summary is below; ask us for
        it in any language of the Eighth Schedule to the Constitution.</p>
    </Section>

    <HindiSummary>
      <p>हम आपकी जानकारी का उपयोग केवल आपकी प्रोफ़ाइल दिखाने और आपके लिए विवाह योग्य मैच खोजने के लिए करते हैं। आपका डेटा मुंबई,
        भारत में स्थित सर्वरों पर रखा जाता है। हम इसे कभी बेचते नहीं और कोई विज्ञापन नहीं दिखाते।</p>
      <p>धर्म, जाति, स्वास्थ्य या आपकी रुचि (आप किससे विवाह करना चाहते हैं) जैसी संवेदनशील जानकारी का उपयोग केवल आपकी सहमति से
        होता है, जिसे आप कभी भी वापस ले सकते हैं। आप ऐप में अपना डेटा देख, डाउनलोड, सुधार और हटा सकते हैं।</p>
      <p>खाता हटाने पर प्रोफ़ाइल, फ़ोटो और संदेश तुरंत हटा दिए जाते हैं; कानून के अनुसार पंजीकरण का एक छोटा रिकॉर्ड एक वर्ष तक
        सुरक्षित रखा जाता है। शिकायत के लिए हमारे शिकायत निवारण अधिकारी से संपर्क करें; संतुष्ट न होने पर भारतीय डेटा संरक्षण बोर्ड
        में शिकायत कर सकते हैं।</p>
    </HindiSummary>
  </LegalLayout>
);

export default PrivacyView;
