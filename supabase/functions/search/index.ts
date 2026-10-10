// ============================================================================
// search Edge Function
//
// Runs a search, or loads today's Standouts, for the signed-in user. The
// browser sends a prompt and filters; the prompt is understood by Gemini
// (ai.ts, when the GEMINI_API_KEY secret is set) or by rules, the profiles
// are read, filtered and scored here (matching.ts), and only the top results
// come back, without anything their owners marked hidden.
//
//   POST { mode: 'search', prompt, filters, limit? }
//     → { candidates, poolSize, totalEligible, remaining, allowance,
//         understood: ["Women", "Doesn't smoke", ...], understoodBy: 'ai' | 'rules',
//         said: "London me rehne wale…" | null }
//     The prompt can be in any Indian language (Gemini's `said` answers in it;
//     the rules know the common Hindi, Hinglish, Tamil and other words)
//     Counts toward the search limits (consume_search, limits.ts: so many
//     every 5 hours, a day and a week): 429 { code: 'LIMIT_REACHED',
//     allowance } once one is used up, saying which and when the next search
//     can be. Unverified accounts older than 72 hours get 403
//     { code: 'VERIFY_REQUIRED' }. A free account that is a second account on
//     the same mailbox, or the 4th on the same phone (the app sends `device`,
//     its app ID), gets 403 { code: 'ACCOUNT_LIMIT', reason } (account_guard(),
//     20261010090000_account_guards.sql).
//   POST { mode: 'standouts', refresh? }
//     → { candidates, computed }
//     Today's 5 picks (UTC day), chosen on the first visit and kept for the
//     day; refresh (Shaadi24+) picks again. Nobody picked in the last 30
//     days is picked again while there are others to pick.
//
// Both leave out people the member passed on and people who haven't opened
// the app in 60 days (search_candidates()), and mark who is new and who
// usually replies (matching.ts).
//
// Shaadi24+ follows the database's one rule, has_pro(): a subscriber, or
// everyone while "Shaadi24+ for everyone" is on. Without it, the Shaadi24+
// filters are left out and results come without the compatibility report.
//
// Deployed with JWT verification off; the function checks the user itself.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import { understandPrompt } from './ai.ts';
import { limitMessage, type SearchAllowance } from './limits.ts';
import {
  buildCatalog, describeParsed, parsePrompt, planToParsed, rankCandidates, sanitizeFilters, withoutProFilters,
  type MatchCandidate, type ParsedPrompt, type Row, type SearchPlan,
} from './matching.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? '';
const GEMINI_API_BASE = Deno.env.get('GEMINI_API_BASE') || undefined;  // only for local testing

const MAX_RESULTS = 50;
const STANDOUTS_PER_DAY = 5;
const STANDOUTS_REPEAT_DAYS = 30;  // someone picked isn't picked again for this long
const LOCKOUT_HOURS = 72;        // unverified accounts can search for 3 days
const PLAN_VERSION = 4;          // bump when ai.ts's instructions change, so old plans aren't reused
const PLAN_CACHE_DAYS = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// PostgREST with the service role (bypasses row access rules; this function
// decides what goes back to the browser).
async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// The one rule for Shaadi24+ (has_pro in the database)
const hasPro = async (userId: string) => (await rpc('has_pro', { p_user: userId })) === true;

// Without Shaadi24+, people come without the compatibility report
const withoutReport = (candidates: MatchCandidate[]) => candidates.map((c) => ({ ...c, compatibilityReport: [] }));

// The signed-in user behind the request's access token, or null.
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === 'string' ? user.id : null;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// What the prompt asks for: Gemini's plan when possible (reusing the plan for
// the same prompt and answers from the last 30 days, to spare the free
// quota), otherwise the rule-based parser.
async function understand(prompt: string, pool: Row[]): Promise<{ parsed: ParsedPrompt; by: 'ai' | 'rules' }> {
  const byRules = { parsed: parsePrompt(prompt), by: 'rules' as const };
  if (!prompt.trim() || !GEMINI_API_KEY) return byRules;

  const catalog = buildCatalog(pool);
  const key = await sha256(JSON.stringify([PLAN_VERSION, GEMINI_MODEL, catalog, prompt.trim().toLowerCase()]));
  const since = new Date(Date.now() - PLAN_CACHE_DAYS * 86_400_000).toISOString();
  try {
    const [saved] = await rest(`search_prompt_cache?key=eq.${key}&created_at=gte.${since}&select=plan`) as { plan: SearchPlan }[];
    if (saved) return { parsed: planToParsed(saved.plan), by: 'ai' };
  } catch (e) {
    console.warn('[search] reading saved plans failed:', errorText(e));
  }

  const result = await understandPrompt(prompt, catalog, {
    apiKey: GEMINI_API_KEY, model: GEMINI_MODEL || undefined, apiBase: GEMINI_API_BASE,
  });
  if (!result.plan) {
    // The reason only (never the prompt), for the function logs
    console.warn(`[search] Gemini not used: ${result.reason}${'status' in result && result.status ? ` (${result.status})` : ''}`);
    return byRules;
  }
  try {
    await rest('search_prompt_cache', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, plan: result.plan, created_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn('[search] saving the plan failed:', errorText(e));
  }
  return { parsed: planToParsed(result.plan), by: 'ai' };
}

// Who is in Spotlight now (lib/boosts.ts); nobody if that can't be read
async function spotlightsNow(): Promise<Set<string>> {
  try {
    const rows = await rest(`spotlights?ends_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`) as { user_id: string }[];
    return new Set(rows.map((r) => r.user_id));
  } catch (e) {
    console.warn('[search] spotlights not read:', e);
    return new Set();
  }
}

async function search(me: Row, body: Record<string, unknown>): Promise<Response> {
  const hoursSinceSignup = (Date.now() - Date.parse(String(me.account_created))) / 3_600_000;
  if (me.is_verified !== true && hoursSinceSignup >= LOCKOUT_HOURS) {
    return json({ error: 'Verify your account to keep searching.', code: 'VERIFY_REQUIRED' }, 403);
  }

  // Free searches: one mailbox, one account; at most 3 accounts a phone
  const device = typeof body.device === 'string' ? body.device.slice(0, 200) : null;
  const platform = typeof body.platform === 'string' ? body.platform : null;
  const guard = await rpc('account_guard', { p_user: me.id, p_device: device, p_platform: platform }) as
    { allowed: boolean; reason?: string; message?: string };
  if (!guard.allowed) {
    return json({ error: guard.message, code: 'ACCOUNT_LIMIT', reason: guard.reason }, 403);
  }

  const allowance = await rpc('consume_search', { p_user_id: me.id }) as SearchAllowance;
  if (!allowance.allowed) {
    return json({ error: limitMessage(allowance), code: 'LIMIT_REACHED', remaining: 0, allowance }, 429);
  }

  const pro = await hasPro(me.id);
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const filters = pro ? sanitizeFilters(body.filters) : withoutProFilters(sanitizeFilters(body.filters));
  const limit = Math.min(Math.max(Math.floor(Number(body.limit) || MAX_RESULTS), 1), MAX_RESULTS);

  // Nobody the user already liked: search is for finding new people
  const pool = await rpc('search_candidates', { p_user_id: me.id, p_exclude_liked: true }) as Row[];
  const { parsed, by } = await understand(prompt, pool);
  const spotlit = await spotlightsNow();
  const { candidates, poolSize } = rankCandidates(me, pool, prompt, filters, limit, Date.now(), parsed, spotlit);
  const shown = candidates.filter((c) => c.spotlight).map((c) => c.id);
  if (shown.length) {
    await rpc('note_spotlight_views', { p_ids: shown }).catch((e) => console.warn('[search] spotlight views not counted:', e));
  }
  // The allowance after this search: whether the next one can go ahead
  const after = { ...allowance, allowed: !allowance.limited_by };
  return json({
    candidates: pro ? candidates : withoutReport(candidates), poolSize, totalEligible: pool.length, remaining: allowance.remaining, allowance: after,
    understood: describeParsed(parsed), understoodBy: by, said: parsed.said ?? null,
  });
}

async function standouts(me: Row, body: Record<string, unknown>): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const mine = `user_id=eq.${me.id}&for_date=eq.${today}`;

  const pro = await hasPro(me.id);
  if (body.refresh === true) {
    // Picking again is a Shaadi24+ feature
    if (!pro) {
      return json({ error: 'Refreshing Standouts is a Pro feature.', code: 'PRO_ONLY' }, 403);
    }
    await rest(`standouts?${mine}`, { method: 'DELETE' });
  }

  // Today's picks, once chosen, stay for the day (in their saved order).
  // Anyone liked since, or who has become unavailable (paused, banned,
  // blocked), drops out.
  const saved = await rest(`standouts?${mine}&select=candidate_id&order=rank.asc`) as { candidate_id: string }[];
  if (saved.length > 0) {
    const ids = saved.map((s) => s.candidate_id);
    const pool = await rpc('search_candidates', { p_user_id: me.id, p_ids: ids, p_exclude_liked: true }) as Row[];
    const { candidates } = rankCandidates(me, pool, '', {}, ids.length);
    candidates.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return json({ candidates: pro ? candidates : withoutReport(candidates), computed: false });
  }

  // First visit today: the most compatible people the user hasn't liked yet,
  // and hasn't been shown as a Standout in the last 30 days (they fill in
  // only when there aren't enough others)
  const pool = await rpc('search_candidates', { p_user_id: me.id, p_exclude_liked: true }) as Row[];
  const since = new Date(Date.now() - STANDOUTS_REPEAT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const shownBefore = new Set((await rest(
    `standouts?user_id=eq.${me.id}&for_date=gte.${since}&for_date=lt.${today}&select=candidate_id`,
  ) as { candidate_id: string }[]).map((s) => s.candidate_id));
  const fresh = rankCandidates(me, pool.filter((r) => !shownBefore.has(r.id)), '', {}, STANDOUTS_PER_DAY).candidates;
  const again = fresh.length < STANDOUTS_PER_DAY
    ? rankCandidates(me, pool.filter((r) => shownBefore.has(r.id)), '', {}, STANDOUTS_PER_DAY - fresh.length).candidates
    : [];
  const candidates = [...fresh, ...again];
  if (candidates.length > 0) {
    await rest('standouts?on_conflict=user_id,candidate_id,for_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(candidates.map((c, i) => ({
        user_id: me.id, candidate_id: c.id, rank: i + 1, for_date: today,
      }))),
    });
  }
  return json({ candidates: pro ? candidates : withoutReport(candidates), computed: true });
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[search] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server not configured' }, 500);
  }

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Please sign in again.', code: 'UNAUTHENTICATED' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  try {
    const [me] = await rest(`profiles?id=eq.${userId}&select=*`) as Row[];
    if (!me) return json({ error: 'Finish setting up your profile first.', code: 'NO_PROFILE' }, 403);
    if (me.is_banned === true) return json({ error: 'This account is suspended.', code: 'BANNED' }, 403);

    return body.mode === 'standouts' ? await standouts(me, body) : await search(me, body);
  } catch (e) {
    console.error('[search] failed:', e instanceof Error ? e.message : e);
    return json({ error: 'Search failed. Please try again.' }, 500);
  }
}));
