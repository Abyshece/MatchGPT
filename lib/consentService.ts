// ============================================================================
// consentService
//
// GDPR consent management:
//   - Records consent events (terms accepted, privacy accepted, cookie prefs)
//   - Stores cookie preferences in localStorage (synced to DB once authed)
//   - Provides typed helpers for components
// ============================================================================

import { supabase } from './supabase';

// Bump these whenever the legal documents change: every member is asked to
// accept the new versions before they continue (needsConsent(); App.tsx).
export const TERMS_VERSION = 'terms-v10-2026-10-08';
export const PRIVACY_VERSION = 'privacy-v13-2026-10-08';

export type ConsentEventType =
  | 'terms_accepted'
  | 'privacy_accepted'
  | 'cookies_updated'
  | 'marketing_consent'
  // The declarations and the consent the consent screen asks for (StepConsent):
  // looking to marry and giving true details (the 2016 advisory for matrimonial
  // websites), of the legal age to marry, and the sensitive details (SPDI Rules
  // 2011, rule 5; DPDP Act, section 6)
  | 'matrimony_declaration'
  | 'legal_age_declaration'
  | 'sensitive_data_consent'
  // A profile made for someone else: they know about it and want it (StepBasicInfo)
  | 'profile_for_other_consent';

export type CookieCategories = {
  essential: boolean;  // always true — can't be disabled
  analytics: boolean;
  marketing: boolean;
};

export const DEFAULT_COOKIE_PREFS: CookieCategories = {
  essential: true,
  analytics: false,
  marketing: false,
};

const COOKIE_PREFS_KEY = 'shaadigpt_cookie_prefs';
const COOKIE_CONSENT_SHOWN_KEY = 'shaadigpt_cookie_consent_shown';

// ----------------------------------------------------------------------------
// Cookie preferences (local-first; synced to DB if authed)
// ----------------------------------------------------------------------------

export function getCookiePreferences(): CookieCategories {
  if (typeof window === 'undefined') return DEFAULT_COOKIE_PREFS;
  try {
    const stored = localStorage.getItem(COOKIE_PREFS_KEY);
    if (!stored) return DEFAULT_COOKIE_PREFS;
    const parsed = JSON.parse(stored) as Partial<CookieCategories>;
    return {
      essential: true,  // always force essential
      analytics: parsed.analytics ?? false,
      marketing: parsed.marketing ?? false,
    };
  } catch {
    return DEFAULT_COOKIE_PREFS;
  }
}

export function hasShownCookieBanner(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(COOKIE_CONSENT_SHOWN_KEY) === '1';
}

export async function setCookiePreferences(
  prefs: CookieCategories,
  userId?: string
): Promise<{ error: string | null }> {
  if (typeof window === 'undefined') return { error: null };

  const final: CookieCategories = { ...prefs, essential: true };
  localStorage.setItem(COOKIE_PREFS_KEY, JSON.stringify(final));
  localStorage.setItem(COOKIE_CONSENT_SHOWN_KEY, '1');

  // If authed, also write to DB
  if (userId) {
    await supabase
      .from('profiles')
      .update({ cookie_preferences: final })
      .eq('id', userId);

    await recordConsent({
      userId,
      eventType: 'cookies_updated',
      consented: true,
      cookieCategories: final,
    });
  } else {
    // Not yet authed (e.g. landing page) — record anonymously with null user_id
    await recordConsent({
      userId: null,
      eventType: 'cookies_updated',
      consented: true,
      cookieCategories: final,
    });
  }

  return { error: null };
}

// ----------------------------------------------------------------------------
// Record a consent event in the audit log
// ----------------------------------------------------------------------------

interface RecordConsentInput {
  userId: string | null;
  email?: string;
  eventType: ConsentEventType;
  consented: boolean;
  documentVersion?: string;
  cookieCategories?: CookieCategories;
}

export async function recordConsent(input: RecordConsentInput): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('consent_records')
    .insert({
      user_id: input.userId,
      email: input.email ?? null,
      event_type: input.eventType,
      consented: input.consented,
      document_version: input.documentVersion ?? null,
      cookie_categories: input.cookieCategories ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

  if (error) {
    console.warn('[consentService] failed to log consent:', error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ----------------------------------------------------------------------------
// Record signup consent — call when a new user signs up
// ----------------------------------------------------------------------------

export async function recordSignupConsent(
  userId: string,
  email: string,
  marketingOptIn: boolean
): Promise<{ error: string | null }> {
  // One record for each document, declaration and consent
  const events: RecordConsentInput[] = [
    { userId, email, eventType: 'terms_accepted', consented: true, documentVersion: TERMS_VERSION },
    { userId, email, eventType: 'privacy_accepted', consented: true, documentVersion: PRIVACY_VERSION },
    { userId, email, eventType: 'matrimony_declaration', consented: true, documentVersion: TERMS_VERSION },
    { userId, email, eventType: 'legal_age_declaration', consented: true, documentVersion: TERMS_VERSION },
    { userId, email, eventType: 'sensitive_data_consent', consented: true, documentVersion: PRIVACY_VERSION },
    { userId, email, eventType: 'marketing_consent', consented: marketingOptIn },
  ];

  for (const event of events) {
    const { error } = await recordConsent(event);
    if (error) return { error };
  }

  // Also on the profile: which versions were accepted, and the rules were just
  // read (the reminder every three months starts from now)
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: now,
      privacy_accepted_at: now,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      rules_reminded_at: now,
      marketing_consent: marketingOptIn,
    })
    .eq('id', userId);

  return { error: error?.message ?? null };
}

/** Turns emails with tips and news on or off, and records it. */
export async function setMarketingConsent(
  userId: string,
  email: string,
  on: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles').update({ marketing_consent: on }).eq('id', userId);
  if (error) return { error: error.message };
  return recordConsent({ userId, email, eventType: 'marketing_consent', consented: on });
}

/** Whether the member has yet to accept the current Terms and Privacy Policy. */
export function needsConsent(row: {
  terms_accepted_at: string | null;
  terms_version?: string | null;
  privacy_version?: string | null;
}): boolean {
  return !row.terms_accepted_at || row.terms_version !== TERMS_VERSION || row.privacy_version !== PRIVACY_VERSION;
}

// The IT Rules 2021 (rule 3(1)(c), as amended 10 Feb 2026) ask that members be
// reminded of the rules at least once every three months (RulesReminder)
export const RULES_REMINDER_DAYS = 90;

/** Whether it's time to remind the member of the rules. */
export function needsRulesReminder(remindedAt: string | null | undefined, now = Date.now()): boolean {
  if (!remindedAt) return true;
  return now - new Date(remindedAt).getTime() >= RULES_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

/** Records that the member has been reminded of the rules. */
export async function markRulesReminded(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('profiles')
    .update({ rules_reminded_at: new Date().toISOString() })
    .eq('id', userId);
  return { error: error?.message ?? null };
}
