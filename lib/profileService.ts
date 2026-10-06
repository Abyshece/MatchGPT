// ============================================================================
// profileService (Phase 4 update)
//
// Adds:
//   - computeSearchAllowance() — searches left today (the server keeps the
//     count and enforces the limit; see supabase/functions/search)
//   - DAILY_LIMITS — constant config
// ============================================================================

import { supabase } from './supabase';
import { profileToRowUpdate, settingsToRowUpdate } from './profileMapping';
import type { ProfileRow } from './database.types';
import type { UserProfile, UserSettings } from '../types';

export const DAILY_LIMITS = {
  // Both enforced by the server too. Free searches go up by one a day for
  // each profile section completed (profile.searchBonus, lib/profileRewards.ts)
  FREE: { searches: 3, likes: 15 },
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
// canSearch — checks daily limit. Returns { allowed, remaining, resetIn }
// ----------------------------------------------------------------------------

export interface SearchAllowance {
  allowed: boolean;
  remaining: number;
  limit: number;      // searches a day: 3 plus the profile sections completed
  bonus: number;      // of which earned by completing profile sections
  isPro: boolean;
  // hours until reset (for display)
  resetInHours: number;
}

export function computeSearchAllowance(profile: UserProfile): SearchAllowance {
  // The daily limit follows the subscription alone: "Shaadi24+ for everyone"
  // (useAuth().hasPro) opens Shaadi24+'s features, not unlimited searches.
  if (profile.subscriptionTier === 'PRO') {
    return { allowed: true, remaining: Infinity, limit: Infinity, bonus: 0, isPro: true, resetInHours: 0 };
  }

  const bonus = profile.searchBonus ?? 0;
  const limit = DAILY_LIMITS.FREE.searches + bonus;
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
    limit,
    bonus,
    isPro: false,
    resetInHours,
  };
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
// When paused, the user disappears from search and Standouts (search_candidates()
// leaves out paused users).
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
