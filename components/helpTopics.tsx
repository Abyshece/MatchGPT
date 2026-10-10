import React from 'react';

// ============================================================================
// Answers to common questions, shared by the Help Center and the website's
// /support page (the stores' "Support URL"; members use the apps, so the
// website's answers point to the app). Keep them true to the app: the
// limits are the server's (consume_search, enforce_daily_like_limit). Each
// app names only its own store (Apple and Google don't allow pointing to
// other platforms or ways to pay).
// ============================================================================

export const SUPPORT_EMAIL = 'support@shaadi24.in';
export const PRIVACY_EMAIL = 'privacy@shaadi24.in';

export interface HelpTopic {
  q: string;
  a: React.ReactNode;
}

const link = 'underline text-blue-600 dark:text-blue-400';
const Mail: React.FC<{ to: string }> = ({ to }) => <a className={link} href={`mailto:${to}`}>{to}</a>;

export type HelpPlatform = 'web' | 'android' | 'ios';

/** The questions, worded for the website (with links to its pages) or one of the apps. */
export function helpTopics(platform: HelpPlatform): HelpTopic[] {
  const onWebsite = platform === 'web';
  return [
    {
      q: 'Is Shaadi24 free?',
      a: <>Yes. A free account can make a profile, use the AI search (a few searches every few hours, a day and
        a week; more a day with a complete profile), send 15 likes a day, see 5 Standouts a day, match and chat.
        Shaadi24+ adds more searches, unlimited likes, 3 Super Interests a week, everyone who has liked you,
        more search filters (religion, mother tongue, community, Manglik, height, diet, education and more), the
        full compatibility report and date proposals in chat.</>,
    },
    {
      q: 'How do I search?',
      a: <>Describe the person you hope to meet in your own words, for example "a vegetarian doctor in Pune who
        wants children" or "Tamil, settled abroad, open to moving back". Shaadi24 turns it into filters and puts
        the people you fit best first. The filters work on their own too.</>,
    },
    {
      q: 'How do I get more free searches?',
      a: <>Fill in your profile. Sign-up asks only the basics (about two minutes); My Profile has six more
        sections (about you, religion and community, education and career, family, lifestyle, and plans and
        values), and each one you complete adds a free search a day: up to 6 more. A section counts once about 7
        in 10 of its questions are answered, and My Profile shows what's left in each and about how long it takes,
        usually a minute or two. Shaadi24+ has higher limits.</>,
    },
    {
      q: 'How do the search limits work?',
      a: <>Like many AI apps, Shaadi24 has three limits on searches. One is for a few hours at a time (5 for now),
        which start with your first search after the last ones ended. One is for the day, which starts again at
        midnight (India time), and one is for the week, which starts again every Friday evening (India time). When one is used up,
        Find Match says when you can search again. Settings → Shaadi24+ shows how many you have used of each and when
        each resets. Shaadi24+ has higher limits.</>,
    },
    {
      q: 'What is the compatibility score?',
      a: <>How well the two of you fit, from your profiles and what you're each looking for: marriage plans and
        children, religion and community, family values, diet and lifestyle, where you live, languages, age and
        more. The report lists where you match and where you differ.</>,
    },
    {
      q: 'What are Standouts?',
      a: <>Five people picked for you each day: the most compatible people you haven't liked yet. They stay the
        same all day, and new ones come the next day.</>,
    },
    {
      q: 'How do I get the verified badge?',
      a: <>Add two clear photos of yourself to your profile, then tap <strong>Get verified</strong> and take a
        selfie doing the gesture shown (a thumbs up, say). Links to your LinkedIn, Instagram, Facebook or X help but
        aren't needed. Our team compares the selfie with your photos, usually within 24–48 hours, and adds the
        badge; if it isn't approved, you're told why and can try again. Only the team sees the selfie, and it's
        deleted once they've decided. A new account can search for 72 hours; after that it needs to be
        verified.</>,
    },
    {
      q: 'Who can see my profile?',
      a: <>Members see your profile in search and Standouts with your age, never your date of birth. Any answer
        you hide is never shown, and nobody can filter by it. In Settings → Privacy &amp; Visibility,
        <strong> Pause my profile</strong> takes you out of search, and <strong>Incognito Mode</strong> shows you
        only to people you've liked.</>,
    },
    {
      q: 'How do I report or block someone?',
      a: <>On their profile or in your chat with them, tap <strong>⋯</strong>, then <strong>Report</strong> or
        <strong> Block user</strong>. Blocking ends the match and hides you from each other; Settings → Blocked
        people undoes it. Agents and marriage bureaus aren't allowed: report them with <strong>An agent or marriage
        bureau</strong>. We review every report within 24 hours (intimate photos or someone pretending to be you
        within 2 hours), remove content that breaks our Terms and remove the people who post it. Settings →
        <strong> My requests</strong> shows whether we acted (never what happened to the other person).</>,
    },
    {
      q: 'Where can I see my complaints and requests?',
      a: <>Settings → <strong>My requests</strong> lists your verification requests, complaints, reports and the
        problems you've told us about, where each stands, and our answer. You also get a notification when one is
        answered.</>,
    },
    {
      q: 'How do I give someone my phone number?',
      a: <>Shaadi24 never shows your number. When you're ready, open your chat with a match, tap
        <strong> ⋯</strong> → <strong>Share my number</strong>, and they can call or WhatsApp you. Once shared it
        can't be taken back, so take your time.</>,
    },
    {
      q: "Why can't I take screenshots?",
      a: <>To protect members' photos and chats, the Android app doesn't allow screenshots or screen recording,
        and shows blank in your list of recent apps.</>,
    },
    {
      q: 'How do I make a complaint?',
      a: <>Our Grievance Officer handles complaints about anything on Shaadi24: a fake profile, abuse, a dowry
        demand, your data or a payment. Use the form on the{' '}
        {onWebsite
          ? <a className={link} href="/grievances">Grievance Redressal page</a>
          : <>Grievance Redressal page (Settings → <strong>Make a complaint</strong>)</>}
        , member or not. You get a ticket number at once and an answer within the times Indian law sets: 2 hours
        for intimate photos or impersonation, 36 hours for other unlawful content, 7 days for the rest.</>,
    },
    {
      q: 'How do I stay safe?',
      a: <>Never send money, or share bank, card or OTP details, whatever the story. Video call before you meet,
        meet in a public place, and tell family or a friend where you'll be. Report anyone who asks for money or
        pressures you.</>,
    },
    {
      q: 'I forgot my password',
      a: <>On the sign-in screen tap <strong>Forgot Password?</strong>, enter your email, type the code we email
        you and choose a new password. If you joined with Google or Apple, continue with them instead: those
        accounts have no Shaadi24 password.</>,
    },
    {
      q: 'Something isn\'t working',
      a: onWebsite
        ? <>In the app, Settings → Support → <strong>Report a problem</strong>: say what went wrong and what you were
          trying to do. The screen you were on, the app's version and the kind of phone go with it, so we can find it,
          and our answer appears in Settings → My requests. Or email <Mail to={SUPPORT_EMAIL} />.</>
        : <>Settings → Support → <strong>Report a problem</strong>: say what went wrong and what you were trying to do.
          The screen you were on, the app's version and the kind of phone go with it, so we can find it, and our
          answer appears in Settings → My requests. If the app asks you to update, please do: it means that version
          had a problem we've fixed.</>,
    },
    {
      q: 'How do I cancel Shaadi24+?',
      a: platform === 'android'
        ? <>Settings → Shaadi24+ → <strong>Manage subscription</strong> opens your subscriptions in Google Play
          (or: Play Store → your picture → Payments &amp; subscriptions → Subscriptions). Shaadi24+ stays on until
          the end of the time you've paid for. We send you a message 3 days before it renews (a day before, for a
          weekly plan) and before a free trial ends, with the price.</>
        : platform === 'ios'
          ? <>Settings → Shaadi24+ → <strong>Manage subscription</strong> (or: iPhone Settings → your name →
            Subscriptions). Shaadi24+ stays on until the end of the time you've paid for. We send you a message
            3 days before it renews (a day before, for a weekly plan) and before a free trial ends, with the price.
            Deleting your account doesn't cancel it, so cancel it first.</>
          : <>In the store you bought it from; it stays on until the end of the time you've paid for. Google Play:
            in the app, Settings → Shaadi24+ → Manage subscription, or Play Store → your picture → Payments &amp;
            subscriptions → Subscriptions. App Store: iPhone Settings → your name → Subscriptions. We send you a
            message in the app 3 days before it renews (a day before, for a weekly plan) and before a free trial
            ends, with the price. Deleting your account doesn't cancel an App Store subscription, so cancel it
            first.</>,
    },
    {
      q: 'Can I get a refund?',
      a: platform === 'android'
        ? <>Google Play refunds purchases made in the app, under its rules:{' '}
          <a className={link} href="https://support.google.com/googleplay" target="_blank" rel="noreferrer">support.google.com/googleplay</a>.</>
        : platform === 'ios'
          ? <>Apple refunds purchases made in the app, under its rules:{' '}
            <a className={link} href="https://reportaproblem.apple.com" target="_blank" rel="noreferrer">reportaproblem.apple.com</a>.</>
          : <>Shaadi24+ is bought in the apps, so Google Play or Apple refunds it, under their rules:{' '}
            <a className={link} href="https://support.google.com/googleplay" target="_blank" rel="noreferrer">support.google.com/googleplay</a>{' '}
            or <a className={link} href="https://reportaproblem.apple.com" target="_blank" rel="noreferrer">reportaproblem.apple.com</a>.</>,
    },
    {
      q: 'Shaadi24+ is missing on my new phone',
      a: <>Shaadi24+ belongs to your account, so sign in with the same account. If you bought it in the app and it
        still doesn't show, tap Settings → Shaadi24+ → <strong>Restore purchases</strong>.</>,
    },
    {
      q: 'Notifications',
      a: <>{onWebsite ? 'In the app, Settings' : 'Settings'} → Notifications turns them on or off on {onWebsite ? 'that' : 'this'}{' '}
        phone. If the phone blocks them, allow them for Shaadi24 in its own settings. A message notification never
        shows what was written.</>,
    },
    {
      q: 'My data, and deleting my account',
      a: <>{onWebsite ? 'In the app, Settings' : 'Settings'} → <strong>Download my data</strong> saves a copy of what we
        hold about you. Settings → <strong> Delete Account</strong> deletes your account and its data
        {onWebsite
          ? <>, and so does our <a className={link} href="/delete-account">Delete account page</a>, without the app</>
          : null}. Read how we use your data in the{' '}
        {onWebsite ? <a className={link} href="/privacy">Privacy Policy</a> : 'Privacy Policy'}; questions to{' '}
        <Mail to={PRIVACY_EMAIL} />.</>,
    },
  ];
}
