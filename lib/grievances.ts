// ============================================================================
// What a complaint to the Grievance Officer can be about, and the deadline the
// law sets for each (grievance_due() in the database decides; this is what the
// form and Admin → Complaints say)
// ============================================================================

export const GRIEVANCE_CATEGORIES: { value: string; label: string; hint: string }[] = [
  { value: 'intimate_images', label: 'Intimate, nude or sexual images of me', hint: 'Removed within 2 hours of your complaint' },
  { value: 'impersonation', label: 'Someone is pretending to be me, or uses morphed photos of me', hint: 'Removed within 2 hours of your complaint' },
  { value: 'unlawful_content', label: 'Obscene, abusive, hateful or otherwise unlawful content', hint: 'Resolved within 36 hours' },
  { value: 'dowry', label: 'Dowry demanded or offered', hint: 'Resolved within 36 hours' },
  { value: 'fraud', label: 'Fraud, or someone asking for money', hint: 'Resolved within 36 hours' },
  { value: 'privacy', label: 'My personal data (see, correct, delete it, or nominate someone)', hint: 'Resolved within 7 days' },
  { value: 'account', label: 'My account (blocked, can\'t sign in, a decision about me)', hint: 'Resolved within 7 days' },
  { value: 'payment', label: 'A payment or my Shaadi24+ subscription', hint: 'Acknowledged within 48 hours, resolved within a month' },
  { value: 'other', label: 'Something else', hint: 'Resolved within 7 days' },
];
