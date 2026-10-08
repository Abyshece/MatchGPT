// ============================================================================
// Search limits, like Claude's usage limits (supabase/migrations/…_search_limits.sql)
//
// Every AI search counts toward three limits: so many in a 5-hour window
// (starting with the first search after the last window ended), a day
// (India time; free accounts get one more for each profile section they've
// completed) and a week (from Friday 6 pm India time). The server keeps the
// counts and decides; this reads them for the app (my_search_allowance()), and
// the search itself sends them back after each search (searchService). Owners
// set the numbers in Admin → Search insights.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { SearchAllowance } from './searchLimitText';

export * from './searchLimitText';

export async function fetchSearchAllowance(): Promise<SearchAllowance | null> {
  const { data, error } = await supabase.rpc('my_search_allowance');
  if (error || !data) return null;
  return data as unknown as SearchAllowance;
}

/**
 * The signed-in member's allowance: loaded once (and again when `changes`
 * does: the plan, or the searches the profile earns), then kept up to date by
 * whatever the search answers (set).
 * null while loading, or if it couldn't be read (the server still enforces the
 * limits).
 */
export function useSearchAllowance(userId: string | undefined, changes?: string) {
  const [allowance, setAllowance] = useState<SearchAllowance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const next = await fetchSearchAllowance();
    setAllowance(next);
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void fetchSearchAllowance().then((next) => { if (live) { setAllowance(next); setLoaded(true); } });
    return () => { live = false; };
  }, [userId, changes]);
  // A window or a day that has since reset: read again then
  useEffect(() => {
    const at = allowance?.next_search_at ?? allowance?.remaining_until;
    if (!at) return;
    const wait = new Date(at).getTime() - Date.now();
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const timer = setTimeout(() => { void refresh(); }, wait + 1000);
    return () => clearTimeout(timer);
  }, [allowance, refresh]);
  return { allowance, loaded, refresh, setAllowance };
}
