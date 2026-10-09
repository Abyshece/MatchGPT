// ============================================================================
// standoutsService
//
// Daily curated picks, chosen by the server (the `search` edge function): on
// the first visit of the day it picks the 5 most compatible people you haven't
// liked yet and saves them in `standouts`; later visits that day show the same
// picks, in the same order. Anyone liked since, or who has since paused,
// been banned or blocked, drops out.
//
// Day rolls over at 00:00 UTC.
// ============================================================================

import { fetchStandouts } from './searchService';
import type { MatchCandidate } from '../types';

export async function loadStandouts(): Promise<{ candidates: MatchCandidate[]; computed: boolean; error: string | null }> {
  try {
    const { candidates, computed } = await fetchStandouts();
    return { candidates, computed, error: null };
  } catch (e) {
    return { candidates: [], computed: false, error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}

// Pick again (debug / Pro perk later)
export async function refreshStandouts(): Promise<{ candidates: MatchCandidate[]; error: string | null }> {
  try {
    const { candidates } = await fetchStandouts(true);
    return { candidates, error: null };
  } catch (e) {
    return { candidates: [], error: e instanceof Error ? e.message : 'Something went wrong' };
  }
}
