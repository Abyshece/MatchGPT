// ============================================================================
// Saved searches (saved_searches in the database)
//
// A member keeps up to 10 searches (the prompt and the filters), each with an
// alert: once a day the search-alerts cron job looks at members listed since
// and keeps the ones who fit (new_ids, written only by the server), with one
// notification. Running a saved search again is an ordinary search; looking
// at the new members the alert found isn't (fetchAlertMatches()).
// ============================================================================

import { supabase } from './supabase';
import type { Json } from './database.types';
import type { FilterOptions } from '../types';

export const MAX_SAVED_SEARCHES = 10;

export interface SavedSearchEntry {
  id: string;
  name: string;
  prompt: string;
  filters: FilterOptions;
  alerts: boolean;
  /** New members the last alert found that the member hasn't looked at yet */
  newCount: number;
  createdAt: string;
}

export async function listSavedSearches(userId: string): Promise<{ searches: SavedSearchEntry[]; error: string | null }> {
  const { data, error } = await supabase.from('saved_searches')
    .select('id, name, prompt, filters, alerts, new_ids, alerted_at, seen_at, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return { searches: [], error: error.message };
  return {
    searches: (data ?? []).map((r) => ({
      id: r.id, name: r.name, prompt: r.prompt, filters: (r.filters ?? {}) as unknown as FilterOptions, alerts: r.alerts,
      newCount: r.alerted_at && (!r.seen_at || r.seen_at < r.alerted_at) ? (r.new_ids ?? []).length : 0,
      createdAt: r.created_at,
    })),
    error: null,
  };
}

/** A name for a search: its prompt, shortened, or "My search" */
export function defaultSearchName(prompt: string): string {
  const p = prompt.trim().replace(/\s+/g, ' ');
  if (!p) return 'My search';
  return p.length <= 40 ? p : `${p.slice(0, 39).trimEnd()}…`;
}

export async function saveSearchWithAlert(
  userId: string, name: string, prompt: string, filters: FilterOptions, alerts: boolean,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from('saved_searches').insert({
    user_id: userId, name: name.trim().slice(0, 60) || defaultSearchName(prompt), prompt: prompt.slice(0, 500),
    filters: filters as unknown as Json, alerts,
  }).select('id').single();
  if (error) {
    // The database's limit (saved_searches_limit())
    return { id: null, error: /10 saved searches/.test(error.message) ? error.message : 'Couldn\'t save this search. Please try again.' };
  }
  return { id: data.id, error: null };
}

export async function setSearchAlerts(id: string, alerts: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('saved_searches').update({ alerts }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function removeSavedSearch(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  return { error: error?.message ?? null };
}
