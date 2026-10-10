// ============================================================================
// likesService
//
// Wraps the `likes` table. Insertion fires the `check_for_match` trigger on
// the DB which auto-creates a `matches` row when the like is mutual. The
// frontend listens for that match via Realtime in chatService.
// ============================================================================

import { supabase } from './supabase';
import { displayName } from './profileMapping';
import type { MatchCandidate } from '../types';

export interface LikeReceived {
  likeId: string;
  likerId: string;
  isSuperLike: boolean;        // a Super Interest: who sent it shows to everyone
  likedAt: string;
  note: string | null;         // a Super Interest's note
  liker: {
    id: string;
    name: string;
    age: number | null;
    location: string;
    photos: string[];
    subscriptionTier: 'FREE' | 'PRO';
    isVerified: boolean;
    hiddenFields: string[];
    description: string;
  };
}

export interface LikeResult {
  success: boolean;
  matched: boolean;          // true if a match was created (mutual like)
  matchId?: string;
  error?: string;
  code?: string;             // NO_SUPER_INTEREST, NOTE_REFUSED (lib/boosts.ts)
}

// ----------------------------------------------------------------------------
// likeUser — insert into likes, check if it caused a match
// ----------------------------------------------------------------------------

export async function likeUser(
  likerId: string,
  likedId: string,
  isSuperLike = false,
  note?: string,
): Promise<LikeResult> {
  // Insert the like row. Trigger auto-creates a match if mutual. A Super
  // Interest uses one included with Shaadi24+ or a bought one (the database
  // decides, and refuses when there are none).
  const { error: insertError } = await supabase
    .from('likes')
    .insert({
      liker_id: likerId,
      liked_id: likedId,
      is_super_like: isSuperLike,
      ...(isSuperLike && note?.trim() ? { note: note.trim() } : {}),
    });

  if (insertError) {
    // unique violation = already liked
    if (insertError.code === '23505') {
      return { success: false, matched: false, error: 'Already liked this user' };
    }
    return { success: false, matched: false, error: insertError.message, code: insertError.hint || undefined };
  }

  // Check if a match row exists now (the trigger inserts one when mutual)
  const userA = likerId < likedId ? likerId : likedId;
  const userB = likerId < likedId ? likedId : likerId;

  const { data: matchData } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a_id', userA)
    .eq('user_b_id', userB)
    .is('unmatched_at', null)
    .maybeSingle();

  if (matchData) {
    return { success: true, matched: true, matchId: matchData.id };
  }
  return { success: true, matched: false };
}

// ----------------------------------------------------------------------------
// unlikeUser — remove a previous like (e.g. user wants to undo)
// ----------------------------------------------------------------------------

export async function unlikeUser(
  likerId: string,
  likedId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('liker_id', likerId)
    .eq('liked_id', likedId);
  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// withdrawInterest — take back an interest that hasn't become a match
// (withdraw_interest() in the database). Taken back within a minute (Undo),
// it doesn't use up one of the day's likes or a bought Super Interest.
// ----------------------------------------------------------------------------

export interface WithdrawResult {
  withdrawn: boolean;
  refunded: boolean;                                      // undone within a minute: nothing used up
  reason: 'matched' | 'not_found' | 'error' | null;       // why not, when it wasn't
  error: string | null;
}

export async function withdrawInterest(likedId: string): Promise<WithdrawResult> {
  const { data, error } = await supabase.rpc('withdraw_interest', { p_liked: likedId });
  if (error) return { withdrawn: false, refunded: false, reason: 'error', error: error.message };
  const out = data as { withdrawn: boolean; refunded?: boolean; reason?: 'matched' | 'not_found' };
  return out.withdrawn
    ? { withdrawn: true, refunded: !!out.refunded, reason: null, error: null }
    : { withdrawn: false, refunded: false, reason: out.reason ?? 'not_found', error: null };
}

// ----------------------------------------------------------------------------
// One free "Likes You" a day (like_reveals in the database): a member without
// Shaadi24+ can see who one person who liked them is, each day (India time)
// ----------------------------------------------------------------------------

export interface RevealStatus { perDay: number; left: number; resetsAt: string }

export async function likeRevealStatus(): Promise<RevealStatus | null> {
  const { data, error } = await supabase.rpc('like_reveal_status');
  if (error || !data) return null;
  const d = data as { per_day: number; left: number; resets_at: string };
  return { perDay: d.per_day, left: d.left, resetsAt: d.resets_at };
}

export async function revealLike(likeId: string): Promise<{ revealed: boolean; resetsAt?: string; error: string | null }> {
  const { data, error } = await supabase.rpc('reveal_like', { p_like_id: likeId });
  if (error) return { revealed: false, error: error.message };
  const d = data as { revealed: boolean; resets_at?: string };
  return { revealed: d.revealed, resetsAt: d.resets_at, error: null };
}

// ----------------------------------------------------------------------------
// hasLiked — check whether current user has already liked someone
// ----------------------------------------------------------------------------

export async function hasLiked(
  likerId: string,
  likedId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('liker_id', likerId)
    .eq('liked_id', likedId)
    .maybeSingle();
  return !!data;
}

// ----------------------------------------------------------------------------
// listLikesSent — IDs of everyone the current user has liked
// (Used by the search results to badge "liked" on cards)
// ----------------------------------------------------------------------------

export async function listLikesSent(likerId: string): Promise<{ likedIds: Set<string>; error: string | null }> {
  const { data, error } = await supabase
    .from('likes')
    .select('liked_id')
    .eq('liker_id', likerId);
  if (error) return { likedIds: new Set(), error: error.message };
  return { likedIds: new Set((data ?? []).map((r) => r.liked_id as string)), error: null };
}

// ----------------------------------------------------------------------------
// listMyLikesDetailed — like-history view for the current user. Returns full
// profile cards for everyone they've liked, plus the timestamp of when they
// liked each one (so HistoryView can group by Today / This week / All time).
// ----------------------------------------------------------------------------

export interface MyLikeEntry {
  likeId: string;
  likedAt: string;     // ISO timestamp
  isSuperLike: boolean;
  matched: boolean;    // it became a match (it can't be withdrawn then)
  candidate: MatchCandidate;
}

export async function listMyLikesDetailed(
  likerId: string
): Promise<{ entries: MyLikeEntry[]; error: string | null }> {
  // Pull every like the user has sent, newest first
  const { data: likeRows, error: likeErr } = await supabase
    .from('likes')
    .select('id, liked_id, is_super_like, created_at')
    .eq('liker_id', likerId)
    .order('created_at', { ascending: false });
  if (likeErr) return { entries: [], error: likeErr.message };
  if (!likeRows || likeRows.length === 0) return { entries: [], error: null };

  // Name and photos for each (banned people, and anyone who blocked the user,
  // come back without a card and are skipped)
  const ids = likeRows.map((r) => r.liked_id as string);
  const { data: cards, error: cardsErr } = await supabase.rpc('get_profile_cards', { p_ids: ids });
  if (cardsErr) return { entries: [], error: cardsErr.message };

  const cardById = new Map((cards ?? []).map((p) => [p.id, p]));

  // Which of them became a match
  const { data: matchRows } = await supabase
    .from('matches')
    .select('user_a_id, user_b_id')
    .or(`user_a_id.eq.${likerId},user_b_id.eq.${likerId}`)
    .is('unmatched_at', null);
  const matchedIds = new Set((matchRows ?? []).map((m) => (m.user_a_id === likerId ? m.user_b_id : m.user_a_id)));

  const entries: MyLikeEntry[] = likeRows
    .map((row): MyLikeEntry | null => {
      const p = cardById.get(row.liked_id as string);
      if (!p) return null;
      return {
        likeId: row.id as string,
        likedAt: row.created_at as string,
        isSuperLike: row.is_super_like as boolean,
        matched: matchedIds.has(row.liked_id as string),
        candidate: {
          id: p.id,
          name: displayName(p.name),
          age: p.age ?? 0,
          location: p.location ?? '',
          compatibilityScore: 0,
          tags: row.is_super_like ? ['You super-liked'] : ['You liked'],
          bio: p.description ?? '',
          imageUrls: p.photo_urls ?? [],
          isVerified: p.is_verified ?? false,
          isPremium: p.subscription_tier === 'PRO',
          subscriptionTier: p.subscription_tier === 'PRO' ? 'PRO' : 'FREE',
          hiddenFields: p.hidden_fields ?? [],
        },
      };
    })
    .filter((e): e is MyLikeEntry => e !== null);

  return { entries, error: null };
}

// ----------------------------------------------------------------------------
// listLikesReceived — full inbox of incoming likes via RPC
// ----------------------------------------------------------------------------

export async function listLikesReceived(userId: string): Promise<{ likes: LikeReceived[]; error: string | null }> {
  const { data, error } = await supabase.rpc('get_likes_received', { p_user_id: userId });
  if (error) return { likes: [], error: error.message };

  const likes: LikeReceived[] = (data ?? []).map((row: Record<string, unknown>) => ({
    likeId: row.like_id as string,
    likerId: row.liker_id as string,
    isSuperLike: row.is_super_like as boolean,
    likedAt: row.liked_at as string,
    note: (row.note as string | null) ?? null,
    liker: {
      id: row.liker_id as string,
      name: displayName(row.liker_name as string | null),
      age: (row.liker_age as number) ?? null,
      location: (row.liker_location as string) ?? '',
      photos: (row.liker_photos as string[]) ?? [],
      subscriptionTier: ((row.liker_subscription_tier as string) ?? 'FREE') as 'FREE' | 'PRO',
      isVerified: (row.liker_is_verified as boolean) ?? false,
      hiddenFields: (row.liker_hidden_fields as string[]) ?? [],
      description: (row.liker_description as string) ?? '',
    },
  }));

  return { likes, error: null };
}

// ----------------------------------------------------------------------------
// Helper: convert a LikeReceived to a MatchCandidate so we can reuse
// MatchCard / ProfileModal components for the "Likes You" tab.
// (We don't have full profile data on the inbox, just a subset.)
// ----------------------------------------------------------------------------

export function likeReceivedToCandidate(like: LikeReceived): MatchCandidate {
  return {
    id: like.liker.id,
    name: like.liker.name,
    age: like.liker.age ?? 0,
    location: like.liker.location,
    compatibilityScore: 0, // unknown from this view; ProfileModal won't show report
    tags: like.isSuperLike ? ['Super Interest'] : ['Liked you'],
    bio: like.liker.description,
    imageUrls: like.liker.photos,
    isVerified: like.liker.isVerified,
    isPremium: like.liker.subscriptionTier === 'PRO',
    subscriptionTier: like.liker.subscriptionTier,
    hiddenFields: like.liker.hiddenFields,
  };
}
