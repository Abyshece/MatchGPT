// ============================================================================
// searchService
//
// Search and Standouts run on the server, in the `search` edge function
// (supabase/functions/search: filters, prompt understanding by Gemini or by
// rules, scoring). The
// browser sends the prompt and filters and gets back the top matches, without
// anything their owners marked hidden. The server also counts the searches
// toward their limits (lib/searchLimits.ts), so they can't be skipped.
// ============================================================================

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { displayName } from './profileMapping';
import type { FilterOptions, MatchCandidate } from '../types';
import type { SearchAllowance } from './searchLimits';
import { deviceId, devicePlatform } from './deviceId';

export interface SearchOutput {
  candidates: MatchCandidate[];   // best first
  poolSize: number;               // people who passed the filters
  totalEligible: number;          // everyone the user could be shown
  remaining: number | null;       // searches left before a limit; null = no limits
  allowance?: SearchAllowance;    // all three limits, after this search
  understood: string[];           // what the prompt was taken to mean ("Women", "Doesn't smoke", ...)
  understoodBy: 'ai' | 'rules';   // Gemini, or the rule-based fallback
  said?: string | null;           // for a search in Hindi, Tamil…: who will be looked for, in that language
  nearMisses?: MatchCandidate[];  // fewer than 5 results: people who miss one thing by a little (`missed`)
  usedPreferences?: boolean;      // the member's partner preferences were part of the search
}

export type SearchErrorCode =
  | 'LIMIT_REACHED' | 'ACCOUNT_LIMIT' | 'VERIFY_REQUIRED' | 'PRO_ONLY' | 'UNAUTHENTICATED' | 'BANNED' | 'NO_PROFILE' | 'FAILED';

export class SearchError extends Error {
  code: SearchErrorCode;
  allowance?: SearchAllowance;    // LIMIT_REACHED: which limit, and when the next search can be
  reason?: string;                // ACCOUNT_LIMIT: 'same_mailbox' | 'shared_phone'
  constructor(message: string, code: SearchErrorCode, allowance?: SearchAllowance, reason?: string) {
    super(message);
    this.code = code;
    this.allowance = allowance;
    this.reason = reason;
  }
}

async function callSearch<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('search', { body });
  if (error) {
    let message = 'Search failed. Please try again.';
    let code: SearchErrorCode = 'FAILED';
    let allowance: SearchAllowance | undefined;
    let reason: string | undefined;
    if (error instanceof FunctionsHttpError) {
      const details = await error.context.json().catch(() => null);
      if (typeof details?.error === 'string') message = details.error;
      if (typeof details?.code === 'string') code = details.code as SearchErrorCode;
      if (details?.allowance && typeof details.allowance === 'object') allowance = details.allowance as SearchAllowance;
      if (typeof details?.reason === 'string') reason = details.reason;
    }
    throw new SearchError(message, code, allowance, reason);
  }
  return data as T;
}

// A hidden name comes back empty.
const withNames = (candidates: MatchCandidate[]) =>
  candidates.map((c) => ({ ...c, name: displayName(c.name) }));

// Run a search; counts toward the search limits. Throws SearchError.
export async function searchProfiles(
  prompt: string,
  filters: FilterOptions,
  limit = 50,
): Promise<SearchOutput> {
  // Which phone: one phone, at most 3 accounts with free searches (lib/deviceId.ts)
  const device = await deviceId();
  const output = await callSearch<SearchOutput>({ mode: 'search', prompt, filters, limit, device, platform: devicePlatform() });
  // (whether the next search can go ahead: this one used the last?)
  const allowance = output.allowance && { ...output.allowance, allowed: !output.allowance.limited_by };
  return { ...output, allowance, candidates: withNames(output.candidates), nearMisses: withNames(output.nearMisses ?? []) };
}

// The new members a saved search's alert (or the partner preferences',
// id 'preferences') found. Doesn't use a search. Throws SearchError.
export async function fetchAlertMatches(id: string): Promise<MatchCandidate[]> {
  const output = await callSearch<{ candidates: MatchCandidate[] }>({ mode: 'alert_matches', id });
  return withNames(output.candidates);
}

// Today's Standouts (picked on the first visit of the UTC day, then kept);
// `refresh` picks again (Pro only). Throws SearchError.
export async function fetchStandouts(
  refresh = false,
): Promise<{ candidates: MatchCandidate[]; computed: boolean }> {
  const output = await callSearch<{ candidates: MatchCandidate[]; computed: boolean }>({ mode: 'standouts', refresh });
  return { ...output, candidates: withNames(output.candidates) };
}
