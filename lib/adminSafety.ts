// ============================================================================
// Admin → Moderation and Scam alerts (supabase/migrations/…_moderation_and_risk.sql)
//
//   Moderation  photos and texts members added, waiting for approval before
//               others see them (or, with "show first", reviewed afterwards);
//               approve, or say why not and the member is told
//   Alerts      members who look like scammers or fake profiles, from what
//               they do; open the member, ban, or mark it reviewed
//
// Photo fingerprints (lib/photoFingerprint.ts) are made here, in the admin's
// browser, for the photos in the queue and, on request, every photo.
// ============================================================================

import { supabase } from './supabase';
import { fingerprintPhoto } from './photoFingerprint';

const fail = (error: { message: string } | null) => (error ? error.message : null);

// ---- Moderation --------------------------------------------------------------------------

export type ModerationField = 'photo' | 'description' | 'about_family';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';

export interface ModerationItem {
  id: string;
  user_id: string;
  field: ModerationField;
  value: string;
  prev_value: string | null;
  flags: string[];
  status: ModerationStatus;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_email: string | null;
  name: string | null;
  age: number | null;
  gender: string | null;
  place: string | null;
  account_created: string | null;
  is_verified: boolean;
  is_banned: boolean;
  photo_count: number;
  reports: number;
  fingerprinted: boolean;
  same_photo_as: { user_id: string; name: string | null; is_banned: boolean }[] | null;
}

export interface ModerationQueue {
  review_before_showing: boolean;
  pending: number;
  items: ModerationItem[];
}

export const FIELD_LABELS: Record<ModerationField, string> = {
  photo: 'Photo',
  description: 'About you',
  about_family: 'About the family',
};

/** Why something isn't approved: the member reads it */
export const REJECT_REASONS = [
  "We couldn't see your face clearly in this photo.",
  "Photos must be of you alone, so members know who you are.",
  "This photo doesn't look like it's of you.",
  'Contact details (phone numbers, emails, social media) aren\'t allowed on profiles.',
  "This isn't suitable for a matrimony profile.",
  "Links and adverts aren't allowed on profiles.",
];

export async function fetchModerationQueue(status: ModerationStatus | 'all' = 'pending'): Promise<{ queue: ModerationQueue | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_moderation_queue', { p_status: status, p_limit: 200 });
  return { queue: (data ?? null) as unknown as ModerationQueue | null, error: fail(error) };
}

export async function moderate(ids: string[], approve: boolean, reason?: string): Promise<{ done: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_moderate', { p_ids: ids, p_approve: approve, p_reason: reason ?? undefined });
  return { done: Number((data as { done?: number } | null)?.done ?? 0), error: fail(error) };
}

export async function setReviewBeforeShowing(on: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_review_before_showing', { p_on: on });
  return { error: fail(error) };
}

/** The member's own: what of theirs waits for approval (My Profile) */
export interface MyReviewStatus { photos: string[]; texts: ModerationField[]; review_before_showing: boolean }
export async function fetchMyReviewStatus(): Promise<MyReviewStatus> {
  const { data } = await supabase.rpc('my_review_status');
  const s = (data ?? {}) as Partial<MyReviewStatus>;
  return { photos: s.photos ?? [], texts: s.texts ?? [], review_before_showing: s.review_before_showing ?? true };
}

// ---- Photo fingerprints ------------------------------------------------------------------

/** Fingerprint these photos and save them (a photo that can't be read is saved as such, so it isn't
 *  asked for again); returns how many were saved */
export async function fingerprintAndSave(urls: string[]): Promise<{ saved: number; error: string | null }> {
  const items: { url: string; hash: string | null }[] = [];
  for (let i = 0; i < urls.length; i += 8) {
    const batch = urls.slice(i, i + 8);
    const hashes = await Promise.all(batch.map((u) => fingerprintPhoto(u)));
    batch.forEach((url, j) => items.push({ url, hash: hashes[j] }));
  }
  if (!items.length) return { saved: 0, error: null };
  const { data, error } = await supabase.rpc('admin_save_photo_fingerprints', { p_items: items as never });
  return { saved: Number(data ?? 0), error: fail(error) };
}

/** Every member's photos not fingerprinted yet, a batch at a time; progress(done, left) */
export async function fingerprintAllPhotos(progress: (done: number, left: number) => void): Promise<{ done: number; error: string | null }> {
  let done = 0;
  for (let round = 0; round < 500; round++) {
    const { data, error } = await supabase.rpc('admin_photos_to_fingerprint', { p_limit: 40 });
    if (error) return { done, error: error.message };
    const batch = data as unknown as { left: number; urls: string[] };
    if (!batch.urls.length) break;
    const { saved, error: saveError } = await fingerprintAndSave(batch.urls);
    if (saveError) return { done, error: saveError };
    if (saved === 0) break;  // none of them is on a profile any more
    done += saved;
    progress(done, Math.max(0, batch.left - batch.urls.length));
  }
  return { done, error: null };
}

// ---- Alerts ------------------------------------------------------------------------------

export type RiskSignal = 'same_photo' | 'money_talk' | 'copy_paste' | 'many_likes' | 'many_reports' | 'many_blocks' | 'banned_back';

export interface RiskAlert {
  user_id: string;
  signal: RiskSignal;
  severity: 1 | 2 | 3;
  detail: string;
  evidence_at: string;
  times: number;
  name: string | null;
  age: number | null;
  place: string | null;
  account_created: string | null;
  is_verified: boolean;
  is_banned: boolean;
  photo: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  open: boolean;
}

export const SIGNAL_LABELS: Record<RiskSignal, string> = {
  same_photo: 'Same photo as another account',
  money_talk: 'Money talk in chats',
  copy_paste: 'Same message to many people',
  many_likes: 'Likes by the dozen',
  many_reports: 'Reported by several members',
  many_blocks: 'Blocked by several members',
  banned_back: 'A banned member back',
};

export async function fetchRiskAlerts(): Promise<{ alerts: RiskAlert[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_risk_signals');
  return { alerts: (data ?? []) as unknown as RiskAlert[], error: fail(error) };
}

export async function reviewRisk(userId: string, signal: RiskSignal, note?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_review_risk', { p_user: userId, p_signal: signal, p_note: note ?? undefined });
  return { error: fail(error) };
}

// ---- The sidebar ---------------------------------------------------------------------------

export interface SidebarCounts { enquiries: number; moderation: number; verifications: number; reports: number }
export const NO_COUNTS: SidebarCounts = { enquiries: 0, moderation: 0, verifications: 0, reports: 0 };
export async function fetchSidebarCounts(): Promise<SidebarCounts> {
  const { data } = await supabase.rpc('admin_sidebar_counts');
  const c = (data ?? {}) as Partial<SidebarCounts>;
  return {
    enquiries: Number(c.enquiries ?? 0), moderation: Number(c.moderation ?? 0),
    verifications: Number(c.verifications ?? 0), reports: Number(c.reports ?? 0),
  };
}
