// ============================================================================
// blocksService
//
// Wraps the `blocks` and `reports` tables.
//
// Blocking is one-directional in the DB but bidirectional in effect: search,
// Standouts, Likes You and Matches (all on the server) leave out everyone who
// blocked or was blocked by the current user.
// ============================================================================

import { supabase } from './supabase';

export type ReportReason =
  | 'spam'
  | 'fake_profile'
  | 'agent_bureau'
  | 'inappropriate_content'
  | 'intimate_images'
  | 'harassment'
  | 'dowry'
  | 'underage'
  | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam, scam or asking for money' },
  { value: 'fake_profile', label: 'Fake profile, impersonation or lying (for example, already married)' },
  { value: 'agent_bureau', label: 'An agent or marriage bureau, not looking for themselves' },
  { value: 'inappropriate_content', label: 'Inappropriate photos or content' },
  { value: 'intimate_images', label: 'Shares or threatens to share intimate or morphed photos' },
  { value: 'harassment', label: 'Harassment or threats' },
  { value: 'dowry', label: 'Asks for or offers dowry' },
  { value: 'underage', label: 'Underage user' },
  { value: 'other', label: 'Other' },
];

// How soon a report must be acted on, in hours (Admin → Reports): the IT Rules
// 2021 give 2 hours for intimate images and impersonation (rule 3(2)(b)), 36
// for other unlawful content (rule 3(2)(a)) and 7 days for the rest
export const REPORT_DEADLINE_HOURS: Record<string, number> = {
  intimate_images: 2, fake_profile: 2,
  inappropriate_content: 36, harassment: 36, dowry: 36, underage: 36, spam: 36, agent_bureau: 36,
  other: 168,
};

// ----------------------------------------------------------------------------
// blockUser — insert into blocks. Also unmatches if currently matched.
// ----------------------------------------------------------------------------

export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason?: string
): Promise<{ error: string | null }> {
  // First, unmatch them if a match exists
  const userA = blockerId < blockedId ? blockerId : blockedId;
  const userB = blockerId < blockedId ? blockedId : blockerId;

  await supabase
    .from('matches')
    .update({ unmatched_at: new Date().toISOString(), unmatched_by: blockerId })
    .eq('user_a_id', userA)
    .eq('user_b_id', userB)
    .is('unmatched_at', null);

  // Then insert the block
  const { error } = await supabase
    .from('blocks')
    .insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason,
    });

  if (error) {
    if (error.code === '23505') {
      return { error: null }; // already blocked = success
    }
    return { error: error.message };
  }
  return { error: null };
}

// ----------------------------------------------------------------------------
// unblockUser — remove a block (one-directional; only undoes blocks I created)
// ----------------------------------------------------------------------------

export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// listBlockedByMe — only people I explicitly blocked (for an unblock UI)
// ----------------------------------------------------------------------------

export async function listBlockedByMe(blockerId: string): Promise<{
  ids: { blockedId: string; createdAt: string; reason: string | null }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, reason')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });
  if (error) return { ids: [], error: error.message };
  return {
    ids: (data ?? []).map((r) => ({
      blockedId: r.blocked_id as string,
      createdAt: r.created_at as string,
      reason: (r.reason as string) ?? null,
    })),
    error: null,
  };
}

// ----------------------------------------------------------------------------
// reportUser — submit a report. Unlike blocking, this does not unmatch.
// (The user can choose to also block separately.)
// ----------------------------------------------------------------------------

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  details?: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details,
    });
  if (error) return { error: error.message };
  return { error: null };
}
