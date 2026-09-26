// ============================================================================
// standoutsService
//
// Daily curated picks. Computed lazily: when a user opens the Standouts tab
// for the first time on a given day, we run the matching algorithm and
// insert 3-5 rows into `standouts` for that user/day. On subsequent visits
// the same day, we just read from the cache.
//
// Day rolls over at 00:00 UTC.
// ============================================================================

import { supabase } from './supabase';
import { runSearch, scoreProfilesByIds } from './matchingService';
import type { UserProfile, MatchCandidate } from '../types';

const STANDOUTS_PER_DAY = 5;

// ----------------------------------------------------------------------------
// loadStandouts — main entry point
//
// Returns today's picks for the user. Computes on first call of the day,
// reads from cache thereafter.
// ----------------------------------------------------------------------------

export async function loadStandouts(
  userId: string,
  searcher: UserProfile
): Promise<{ candidates: MatchCandidate[]; computed: boolean; error: string | null }> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1. Try cache first
  const { data: cached, error: cachedError } = await supabase
    .from('standouts')
    .select('candidate_id, rank')
    .eq('user_id', userId)
    .eq('for_date', today)
    .order('rank', { ascending: true });

  if (cachedError) {
    return { candidates: [], computed: false, error: cachedError.message };
  }

  // Any saved picks are today's picks, even if fewer than 5 were found; don't
  // recompute (and reshuffle) them on every visit.
  if (cached && cached.length > 0) {
    return await fetchProfilesByIds(cached.map((r) => r.candidate_id as string), searcher);
  }

  // 2. Cache miss — compute fresh
  // Run the matcher with no prompt and broad filters; we want top scorers
  // overall as the daily standouts.
  const result = await runSearch({
    searcherId: userId,
    searcher,
    prompt: '',
    filters: {
      isOnline: false,
      isVerified: false,
      isPremium: false,
    },
  });

  const top = result.candidates.slice(0, STANDOUTS_PER_DAY);

  if (top.length === 0) {
    return { candidates: [], computed: true, error: null };
  }

  // 3. Persist to cache (best-effort)
  const rows = top.map((c, i) => ({
    user_id: userId,
    candidate_id: c.id,
    rank: i + 1,
    for_date: today,
  }));

  // Use upsert so re-runs don't fail on the unique constraint
  await supabase.from('standouts').upsert(rows, {
    onConflict: 'user_id,candidate_id,for_date',
    ignoreDuplicates: true,
  });

  return { candidates: top, computed: true, error: null };
}

// ----------------------------------------------------------------------------
// Force refresh — wipe today's cache and recompute (debug / Pro perk later)
// ----------------------------------------------------------------------------

export async function refreshStandouts(
  userId: string,
  searcher: UserProfile
): Promise<{ candidates: MatchCandidate[]; error: string | null }> {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('standouts').delete().eq('user_id', userId).eq('for_date', today);
  const result = await loadStandouts(userId, searcher);
  return { candidates: result.candidates, error: result.error };
}

// ----------------------------------------------------------------------------
// helper: turn a list of ids into MatchCandidate[] using the same shape as runSearch
// ----------------------------------------------------------------------------

async function fetchProfilesByIds(
  ids: string[],
  searcher: UserProfile
): Promise<{ candidates: MatchCandidate[]; computed: boolean; error: string | null }> {
  // Score exactly the saved picks. (Re-running a top-8 search and keeping the
  // saved ids lost any pick that had since dropped out of the top 8, so picks
  // vanished on reload later in the day.)
  const candidates = await scoreProfilesByIds(searcher, ids);
  // Keep the saved order, not today's live score order
  candidates.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { candidates, computed: false, error: null };
}
