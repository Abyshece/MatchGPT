import { supabase } from './supabase';

// ============================================================================
// Find Match's "Trending" pills: what members near you search for
// (trending_searches() in the database: the member's city first, then state,
// country and anywhere; only searches at least 2 members made, never who)
// ============================================================================

export type TrendingScope = 'city' | 'state' | 'country' | 'all';

export interface TrendingSearch {
  prompt: string;
  scope: TrendingScope;
  place: string | null;
  people: number;
}

export async function fetchTrendingSearches(): Promise<TrendingSearch[]> {
  const { data, error } = await supabase.rpc('trending_searches');
  if (error || !data) return [];
  const list = (data as { searches?: TrendingSearch[] }).searches;
  return Array.isArray(list) ? list : [];
}

/** The heading over the pills: as near as they all are */
export function trendingHeading(list: TrendingSearch[]): string {
  if (!list.length) return 'Try searching for';
  const first = list[0];
  const one = list.every((t) => t.scope === first.scope);
  if (first.scope === 'all') return 'Trending on Shaadi24';
  if (one) return `Trending in ${first.place}`;
  return first.scope === 'city' ? `Trending in ${first.place} and nearby` : 'Trending near you';
}
