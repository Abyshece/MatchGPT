// ============================================================================
// Money talk in chats: the warning members see
//
// Romance and "marriage" scams end in a request for money: a UPI transfer, a
// bank account, crypto or a trading "opportunity", gift cards, customs fees
// for a parcel, a ticket home. When a message from the other person reads
// like one, the chat shows a short safety note under it with a Report button
// (MessageBubble). The same words raise Admin → Scam alerts ("money_talk",
// public.money_talk() in 20261008190000_moderation_and_risk.sql); keep the
// two lists alike.
// ============================================================================

const MONEY_TALK = new RegExp([
  '\\bsend (me )?money\\b', '\\btransfer (the )?(money|amount|fees?)\\b',
  '\\b(paytm|phone\\s?pe|g\\s?pay|google\\s?pay|upi)\\b', 'bank\\s?account', '\\bifsc\\b',
  'western union', 'money\\s?gram', 'gift\\s?cards?', 'bitcoin', '\\bcrypto', '\\busdt\\b', 'forex', 'binary option',
  'investment (plan|scheme|opportunit\\w*)', 'trading (tips|plan|platform)', 'double your money',
  'customs (duty|fee|charges?)', '\\bloan\\b.*\\burgent', '\\burgent\\b.*\\b(money|loan|help)\\b',
  'stuck at (the )?airport', 'clearance fee', 'parcel.*\\b(fee|charges?)\\b',
  // Hindi and Hinglish
  '\\bpais[ae] (bhej|chahiye|transfer|de do)', '\\budh?aa?r (de|chahiye)', 'पैसे (भेज|चाहिए)',
].join('|'), 'i');

/** Whether a chat message reads like a request for money or payment details. */
export const looksLikeMoneyAsk = (text: string | null | undefined): boolean => !!text && MONEY_TALK.test(text);
