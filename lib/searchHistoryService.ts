// ============================================================================
// searchHistoryService
//
// Wraps the search_history table for save/load/delete of past searches.
// ============================================================================

import { supabase } from './supabase';
import type { FilterOptions, MatchCandidate } from '../types';
import type { Json } from './database.types';

export interface SavedSearch {
  id: string;
  prompt: string;
  filters: FilterOptions;
  resultIds: string[];
  poolSize: number;
  createdAt: string; // ISO
}

// ----------------------------------------------------------------------------
// Save a search
// ----------------------------------------------------------------------------

export async function saveSearch(
  userId: string,
  prompt: string,
  filters: FilterOptions,
  results: MatchCandidate[],
  poolSize: number
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('search_history')
    .insert({
      user_id: userId,
      prompt,
      filters: filters as unknown as Json,
      result_ids: results.map((r) => r.id),
      pool_size: poolSize,
    })
    .select('id')
    .single();

  if (error) {
    return { id: null, error: error.message };
  }
  return { id: data.id, error: null };
}

// ----------------------------------------------------------------------------
// Load a user's recent searches (most recent first)
// ----------------------------------------------------------------------------

export async function loadHistory(userId: string, limit = 50): Promise<{ searches: SavedSearch[]; error: string | null }> {
  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { searches: [], error: error.message };
  }

  const searches: SavedSearch[] = (data ?? []).map((row) => ({
    id: row.id,
    prompt: row.prompt ?? '',
    filters: (row.filters ?? {}) as unknown as FilterOptions,
    resultIds: row.result_ids ?? [],
    poolSize: row.pool_size ?? 0,
    createdAt: row.created_at,
  }));

  return { searches, error: null };
}

// ----------------------------------------------------------------------------
// Delete a saved search
// ----------------------------------------------------------------------------

export async function deleteSearch(searchId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('id', searchId);
  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// Clear all of a user's search history
// ----------------------------------------------------------------------------

export async function clearHistory(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return { error: null };
}
