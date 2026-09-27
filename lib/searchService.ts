// ============================================================================
// searchService
//
// Search and Standouts run on the server, in the `search` edge function
// (supabase/functions/search: filters, prompt understanding by Gemini or by
// rules, scoring). The
// browser sends the prompt and filters and gets back the top matches, without
// anything their owners marked hidden. The server also keeps the daily search
// count, so the limit can't be skipped.
// ============================================================================

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { displayName } from './profileMapping';
import type { FilterOptions, MatchCandidate } from '../types';

export interface SearchOutput {
  candidates: MatchCandidate[];   // best first
  poolSize: number;               // people who passed the filters
  totalEligible: number;          // everyone the user could be shown
  remaining: number | null;       // searches left today; null = unlimited
  understood: string[];           // what the prompt was taken to mean ("Women", "Doesn't smoke", ...)
  understoodBy: 'ai' | 'rules';   // Gemini, or the rule-based fallback
}

export type SearchErrorCode =
  | 'LIMIT_REACHED' | 'VERIFY_REQUIRED' | 'PRO_ONLY' | 'UNAUTHENTICATED' | 'BANNED' | 'NO_PROFILE' | 'FAILED';

export class SearchError extends Error {
  code: SearchErrorCode;
  constructor(message: string, code: SearchErrorCode) {
    super(message);
    this.code = code;
  }
}

async function callSearch<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('search', { body });
  if (error) {
    let message = 'Search failed. Please try again.';
    let code: SearchErrorCode = 'FAILED';
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
      if (typeof details?.code === 'string') code = details.code as SearchErrorCode;
    }
    throw new SearchError(message, code);
  }
  return data as T;
}

// A hidden name comes back empty.
const withNames = (candidates: MatchCandidate[]) =>
  candidates.map((c) => ({ ...c, name: displayName(c.name) }));

// Run a search; counts toward today's limit. Throws SearchError.
export async function searchProfiles(
  prompt: string,
  filters: FilterOptions,
  limit = 50,
): Promise<SearchOutput> {
  const output = await callSearch<SearchOutput>({ mode: 'search', prompt, filters, limit });
  return { ...output, candidates: withNames(output.candidates) };
}

// Today's Standouts (picked on the first visit of the UTC day, then kept);
// `refresh` picks again (Pro only). Throws SearchError.
export async function fetchStandouts(
  refresh = false,
): Promise<{ candidates: MatchCandidate[]; computed: boolean }> {
  const output = await callSearch<{ candidates: MatchCandidate[]; computed: boolean }>({ mode: 'standouts', refresh });
  return { ...output, candidates: withNames(output.candidates) };
}
