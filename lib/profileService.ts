// ============================================================================
// profileService (Phase 4 update)
//
// Adds:
//   - incrementSearchCount() — daily search counter, resets at midnight
//   - canSearch() — returns whether user can run another search today
//   - DAILY_LIMITS — constant config
// ============================================================================

import { supabase } from './supabase';
import { profileToRowUpdate, settingsToRowUpdate } from './profileMapping';
import type { ProfileRow } from './database.types';
import type { UserProfile, UserSettings } from '../types';

export const DAILY_LIMITS = {
  FREE: { searches: 3, likes: 15 },  // likes: enforced by the database too
  PRO:  { searches: Infinity, likes: Infinity },
} as const;

// ----------------------------------------------------------------------------
// Update arbitrary profile fields (camelCase keys → DB row update)
// ----------------------------------------------------------------------------

export async function updateProfile(
  userId: string,
  changes: Partial<UserProfile>
): Promise<{ row: ProfileRow | null; error: string | null }> {
  const update = profileToRowUpdate(changes);

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

// ----------------------------------------------------------------------------
// Update settings
// ----------------------------------------------------------------------------

export async function updateSettings(
  userId: string,
  settings: UserSettings
): Promise<{ row: ProfileRow | null; error: string | null }> {
  const update = settingsToRowUpdate(settings);

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select()
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

// ----------------------------------------------------------------------------
// Toggle a single field's hidden status on the user's public profile
// ----------------------------------------------------------------------------

export async function toggleHiddenField(
  userId: string,
  currentHidden: string[],
  fieldKey: string
): Promise<{ row: ProfileRow | null; error: string | null }> {
  const isCurrentlyHidden = currentHidden.includes(fieldKey);
  const newHidden = isCurrentlyHidden
    ? currentHidden.filter((k) => k !== fieldKey)
    : [...currentHidden, fieldKey];

  const { data, error } = await supabase
    .from('profiles')
    .update({ hidden_fields: newHidden })
    .eq('id', userId)
    .select()
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data, error: null };
}

// ============================================================================
// PHASE 4 ADDITIONS
// ============================================================================

// ----------------------------------------------------------------------------
// FEATURE FLAG: PRO_FOR_ALL
//
// While we're growing our user base, every user gets Pro features for free.
// This single flag is the source of truth for "is this user effectively Pro?"
// — turn it off later when we switch to paid Pro.
// ----------------------------------------------------------------------------

export const PRO_FOR_ALL = true;

/** Single helper everyone should use instead of `profile.subscriptionTier === 'PRO'`. */
export function isProEffective(profile: UserProfile | null | undefined): boolean {
  if (PRO_FOR_ALL) return true;
  return profile?.subscriptionTier === 'PRO';
}

// ----------------------------------------------------------------------------
// canSearch — checks daily limit. Returns { allowed, remaining, resetIn }
// ----------------------------------------------------------------------------

export interface SearchAllowance {
  allowed: boolean;
  remaining: number;
  isPro: boolean;
  // hours until reset (for display)
  resetInHours: number;
}

export function computeSearchAllowance(profile: UserProfile): SearchAllowance {
  // Daily limit applies to all signed-in users. PRO_FOR_ALL only unlocks paid
  // *features* (full likes, sorting, etc.) — not unlimited searches. When real
  // Pro launches, only paid users will bypass this limit.
  if (profile.subscriptionTier === 'PRO') {
    return { allowed: true, remaining: Infinity, isPro: true, resetInHours: 0 };
  }

  const limit = DAILY_LIMITS.FREE.searches;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const lastDate = profile.lastSearchDate?.slice(0, 10);
  const used = lastDate === today ? (profile.dailySearchCount ?? 0) : 0;
  const remaining = Math.max(0, limit - used);

  // Hours until midnight UTC
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const resetInHours = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));

  return {
    allowed: remaining > 0,
    remaining,
    isPro: false,
    resetInHours,
  };
}

// ----------------------------------------------------------------------------
// incrementSearchCount — bump daily counter, reset on new day
// ----------------------------------------------------------------------------

export async function incrementSearchCount(
  userId: string,
  currentProfile: UserProfile
): Promise<{ error: string | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = currentProfile.lastSearchDate?.slice(0, 10);
  const isNewDay = lastDate !== today;

  const newCount = isNewDay ? 1 : (currentProfile.dailySearchCount ?? 0) + 1;

  const { error } = await supabase
    .from('profiles')
    .update({
      daily_search_count: newCount,
      last_search_date: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// Verification lockout: 72 hours after account creation, unverified users
// are soft-locked from search/like actions until they verify.
// ----------------------------------------------------------------------------

export interface VerificationStatus {
  isVerified: boolean;
  isLockedOut: boolean;
  hoursUntilLockout: number;  // 0 if already locked out
  hoursSinceCreation: number;
}

export function computeVerificationStatus(profile: UserProfile): VerificationStatus {
  const isVerified = profile.isVerified === true;
  if (isVerified) {
    return { isVerified: true, isLockedOut: false, hoursUntilLockout: 0, hoursSinceCreation: 0 };
  }

  const created = profile.accountCreated;
  if (!created) {
    return { isVerified: false, isLockedOut: false, hoursUntilLockout: 72, hoursSinceCreation: 0 };
  }

  const hoursSince = (Date.now() - created) / (1000 * 60 * 60);
  const hoursUntil = Math.max(0, 72 - hoursSince);
  return {
    isVerified: false,
    isLockedOut: hoursSince >= 72,
    hoursUntilLockout: Math.ceil(hoursUntil),
    hoursSinceCreation: Math.floor(hoursSince),
  };
}

// ----------------------------------------------------------------------------
// updateLastActive — heartbeat. Called on app open and every 2 minutes after.
// Powers the "Online" / "Last seen" UI everywhere. Incognito users skip this
// to stay hidden from the Online filter.
// ----------------------------------------------------------------------------

export async function updateLastActive(
  userId: string,
  incognito = false
): Promise<void> {
  if (!userId) return;
  if (incognito) return;  // Don't broadcast presence when in incognito mode
  try {
    await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    // Best-effort. Failing to update presence isn't worth surfacing to the user.
  }
}

// ----------------------------------------------------------------------------
// setPauseStatus — pause or resume matching
// ----------------------------------------------------------------------------
// When paused, the user disappears from search results everywhere (eligible_
// profiles view excludes paused users in 012_pause_and_gdpr_export.sql).
// Existing matches and chats keep working — only NEW discovery is blocked.
// Different from incognito: incognito users still appear to people who liked
// them. Paused users are invisible to everyone.

export async function setPauseStatus(
  userId: string,
  isPaused: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_paused: isPaused,
      paused_at: isPaused ? new Date().toISOString() : null,
    })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { error: null };
}
