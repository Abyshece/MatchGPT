// ============================================================================
// What Shaadi24 promises members
//
// The answers to what members of other matrimony apps complain about most in
// their store reviews (docs/research/competitor-reviews.md): daily sales
// calls, fake interests sent to make people pay, basics locked behind a
// payment, and prices and renewals nobody explained. Shown on the website
// (SiteHome), the Shaadi24+ page (UpgradeModal) and, in short, the welcome
// screen (LandingView). Keep every one true: they are promises.
// ============================================================================

export interface MemberPromise {
  key: 'no_calls' | 'real_interests' | 'free_chat' | 'clear_prices';
  title: string;
  text: string;
}

export const PROMISES: MemberPromise[] = [
  {
    key: 'no_calls',
    title: 'We never call you to sell',
    text: 'Shaadi24 has no sales team. Nobody from Shaadi24 will phone you to push a plan, ever.',
  },
  {
    key: 'real_interests',
    title: 'Every interest is from a real member',
    text: 'We never send fake interests, likes or profile visits to get you to pay.',
  },
  {
    key: 'free_chat',
    title: 'Chatting is free',
    text: "When you both send an interest, it's a match, and you can chat for free. No plan needed.",
  },
  {
    key: 'clear_prices',
    title: 'Clear prices, cancel any time',
    text: 'Shaadi24+ is optional, with no hidden charges. It is paid through Google Play or the App Store, where you can cancel it any time.',
  },
];

/** The promises in a few words, for the welcome screen */
export const PROMISES_SHORT = ['Chatting is free', 'No sales calls', 'Real members only'];
