// ============================================================================
// Each match is celebrated once
//
// The screen where a like back made the match (Search, Likes You, Standouts)
// and Dashboard's live listener, which is there for the person who liked
// first, both hear about it. Whichever is first shows "It's a Match!".
// ============================================================================

const celebrated = new Set<string>();

/** True the first time for a match: show its celebration. */
export function firstCelebration(matchId: string): boolean {
  if (celebrated.has(matchId)) return false;
  celebrated.add(matchId);
  return true;
}
