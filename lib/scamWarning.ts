// ============================================================================
// Warnings in chats: money talk, "digital arrest", and moving off Shaadi24
//
// Romance and "marriage" scams end in a request for money: a UPI transfer, a
// bank account, crypto or a trading "opportunity", gift cards, customs fees
// for a parcel, a ticket home. "Digital arrest" scams have someone posing as
// police, CBI, customs or a court, on a video call, demanding money to settle
// a "case". Most start by moving the talk to WhatsApp or a video call fast,
// where nobody can see or stop them. When a message from the other person
// reads like one of these, the chat shows a short note under it with a Report
// button (MessageBubble; ChatWindow shows the WhatsApp note once a chat). The
// money and arrest words also raise Admin → Scam alerts ("money_talk",
// public.money_talk() in the database); keep the lists alike.
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

// Someone posing as the police, CBI, customs, a court or a bank's fraud team
const ARREST_TALK = new RegExp([
  'digital(ly)? arrest', 'arrest warrant', '\\bwarrant (against|in) your name', 'money laundering',
  '\\b(cbi|ncb|\\bed\\b|enforcement directorate|narcotics|cyber (cell|crime) (officer|department))\\b.{0,40}\\b(case|officer|call|notice|arrest)',
  '(police|customs|cbi|court|rbi|trai) (case|notice|officer|verification|complaint) (against|on|for) (you|your)',
  'parcel.{0,30}(drugs|seized|illegal)', 'stay on (the )?(video )?call', '\\bsettle (the|this) case',
  // Hindi and Hinglish
  'डिजिटल अरेस्ट', 'गिरफ्तार', 'giraftar',
].join('|'), 'i');

// Moving the talk somewhere else: WhatsApp, Telegram, a video call, a number
const OFF_PLATFORM = new RegExp([
  '\\bwhats\\s?app\\b', '\\bwatsapp\\b', '\\bwa\\.me\\b', '\\btelegram\\b', '\\bsignal app\\b', '\\bsnap(chat)?\\b',
  '\\binsta(gram)? (dm|id)\\b', '\\bvideo\\s?call\\b', '\\bvc\\b', '\\bfacetime\\b', '\\bgoogle meet\\b', '\\bzoom call\\b',
  '\\b(call|message|text|msg|ping) me (on|at)\\b', '\\bmy (number|no\\.?|mobile|cell) (is|:)',
  '(?<!\\d)(\\+?91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}(?!\\d)',
  // Hindi and Hinglish
  'व्हाट्सएप', 'वीडियो कॉल', '\\bnumber (do|de do|bhejo|send karo)\\b',
].join('|'), 'i');

export type ChatWarning = 'arrest' | 'money' | 'off_platform';

/** What the note under a message says, by kind */
export const WARNING_TEXT: Record<ChatWarning, string> = {
  arrest: 'Police, CBI, customs and courts never question or "arrest" anyone over a video call, and never ask for money '
    + 'to settle a case. This is a known scam: stop replying, call 1930 if you were asked to pay, and report it.',
  money: "Never send money or share bank, UPI or card details with someone you haven't met. Shaadi24 never asks for them.",
  off_platform: 'No rush to move to WhatsApp or a video call. Until you know who they are, keep talking here: your number '
    + 'stays private, and you can report anyone.',
};

/** Whether a chat message reads like a request for money or payment details. */
export const looksLikeMoneyAsk = (text: string | null | undefined): boolean => !!text && MONEY_TALK.test(text);

/** The note a message from the other person calls for, if any (the most serious first) */
export function chatWarning(text: string | null | undefined): ChatWarning | null {
  if (!text) return null;
  if (ARREST_TALK.test(text)) return 'arrest';
  if (MONEY_TALK.test(text)) return 'money';
  if (OFF_PLATFORM.test(text)) return 'off_platform';
  return null;
}

/**
 * The note for each message in a chat, by message id: money and arrest notes
 * under every such message from the other person; the WhatsApp note only
 * under the first, so a chat doesn't fill up with it.
 */
export function chatWarnings(messages: { id: string; senderId: string; content: string | null }[], me: string): Map<string, ChatWarning> {
  const out = new Map<string, ChatWarning>();
  let offPlatformShown = false;
  for (const m of messages) {
    if (m.senderId === me) continue;
    const w = chatWarning(m.content);
    if (!w) continue;
    if (w === 'off_platform') {
      if (offPlatformShown) continue;
      offPlatformShown = true;
    }
    out.set(m.id, w);
  }
  return out;
}
