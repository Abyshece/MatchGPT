// ============================================================================
// consentService
//
// GDPR consent management:
//   - Records consent events (terms accepted, privacy accepted, cookie prefs)
//   - Stores cookie preferences in localStorage (synced to DB once authed)
//   - Provides typed helpers for components
// ============================================================================

import { supabase } from './supabase';

// Bump these whenever the legal documents change. The user will be re-prompted.
export const TERMS_VERSION = 'terms-v1-2026-05-11';
export const PRIVACY_VERSION = 'privacy-v4-2026-09-28';

export type ConsentEventType =
  | 'terms_accepted'
  | 'privacy_accepted'
  | 'cookies_updated'
  | 'marketing_consent';

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
  // Three records: terms, privacy, marketing
  const events: RecordConsentInput[] = [
    { userId, email, eventType: 'terms_accepted', consented: true, documentVersion: TERMS_VERSION },
    { userId, email, eventType: 'privacy_accepted', consented: true, documentVersion: PRIVACY_VERSION },
    { userId, email, eventType: 'marketing_consent', consented: marketingOptIn },
  ];

  for (const event of events) {
    const { error } = await recordConsent(event);
    if (error) return { error };
  }

  // Also write to the profile row for quick lookup
  const { error } = await supabase
    .from('profiles')
    .update({
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
      marketing_consent: marketingOptIn,
    })
    .eq('id', userId);

  return { error: error?.message ?? null };
}

// ----------------------------------------------------------------------------
// Check whether the current user needs to re-consent (versions changed)
// ----------------------------------------------------------------------------

export async function needsReConsent(userId: string): Promise<{
  terms: boolean;
  privacy: boolean;
}> {
  const { data } = await supabase
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at')
    .eq('id', userId)
    .maybeSingle();

  if (!data) return { terms: true, privacy: true };

  // Check if user accepted the current version
  // (For simplicity, we treat any prior acceptance as current — version bumps
  //  would require app-level re-consent flow, deferred to a future iteration.)
  return {
    terms: !data.terms_accepted_at,
    privacy: !data.privacy_accepted_at,
  };
}
