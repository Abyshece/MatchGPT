// ============================================================================
// matchesService
//
// Wraps the `matches` table. The match row itself is created by a Postgres
// trigger when likes become mutual — we never insert into matches from the
// frontend.
// ============================================================================

import { supabase } from './supabase';
import { displayName } from './profileMapping';

export interface MatchSummary {
  matchId: string;
  matchedAt: string;
  otherUser: {
    id: string;
    name: string;
    age: number | null;
    location: string;
    photos: string[];
    subscriptionTier: 'FREE' | 'PRO';
    isVerified: boolean;
    hiddenFields: string[];
  };
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

// ----------------------------------------------------------------------------
// listMatches — full chat-list, ordered by last message (or match time)
// ----------------------------------------------------------------------------

export async function listMatches(userId: string): Promise<{ matches: MatchSummary[]; error: string | null }> {
  const { data, error } = await supabase.rpc('get_matches_with_profile', { p_user_id: userId });
  if (error) return { matches: [], error: error.message };

  const matches: MatchSummary[] = (data ?? []).map((row: Record<string, unknown>) => ({
    matchId: row.match_id as string,
    matchedAt: row.matched_at as string,
    otherUser: {
      id: row.other_user_id as string,
      name: displayName(row.other_name as string | null),
      age: (row.other_age as number) ?? null,
      location: (row.other_location as string) ?? '',
      photos: (row.other_photos as string[]) ?? [],
      subscriptionTier: ((row.other_subscription_tier as string) ?? 'FREE') as 'FREE' | 'PRO',
      isVerified: (row.other_is_verified as boolean) ?? false,
      hiddenFields: (row.other_hidden_fields as string[]) ?? [],
    },
    lastMessage: row.last_message_content
      ? {
          content: row.last_message_content as string,
          createdAt: row.last_message_at as string,
          senderId: row.last_message_sender_id as string,
        }
      : null,
    unreadCount: Number(row.unread_count ?? 0),
  }));

  return { matches, error: null };
}

// ----------------------------------------------------------------------------
// unmatch — soft unmatch via RPC
// ----------------------------------------------------------------------------

export async function unmatch(matchId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('unmatch', { p_match_id: matchId });
  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// getMatch — single match by id (used when a celebration modal opens)
// ----------------------------------------------------------------------------

export async function getMatch(matchId: string, currentUserId: string): Promise<{ match: MatchSummary | null; error: string | null }> {
  const { matches, error } = await listMatches(currentUserId);
  if (error) return { match: null, error };
  const m = matches.find((m) => m.matchId === matchId);
  return { match: m ?? null, error: null };
}
