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
//     → { candidates, poolSize, totalEligible, remaining,
//         understood: ["Women", "Doesn't smoke", ...], understoodBy: 'ai' | 'rules' }
//     Counts toward the daily limit (consume_search): 429 { code:
//     'LIMIT_REACHED' } once it's used up. Unverified accounts older than 72
//     hours get 403 { code: 'VERIFY_REQUIRED' }.
//   POST { mode: 'standouts', refresh? }
//     → { candidates, computed }
//     Today's 5 picks (UTC day), chosen on the first visit and kept for the
//     day; refresh (Pro only) picks again.
//
// Deployed with JWT verification off; the function checks the user itself.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import { understandPrompt } from './ai.ts';
import {
  buildCatalog, describeParsed, parsePrompt, planToParsed, rankCandidates, sanitizeFilters,
  type ParsedPrompt, type Row, type SearchPlan,
} from './matching.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? '';
const GEMINI_API_BASE = Deno.env.get('GEMINI_API_BASE') || undefined;  // only for local testing

const MAX_RESULTS = 50;          // everyone gets the Pro-size result list for now (PRO_FOR_ALL)
const STANDOUTS_PER_DAY = 5;
const LOCKOUT_HOURS = 72;        // unverified accounts can search for 3 days
const PLAN_VERSION = 2;          // bump when ai.ts's instructions change, so old plans aren't reused
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

async function search(me: Row, body: Record<string, unknown>): Promise<Response> {
  const hoursSinceSignup = (Date.now() - Date.parse(String(me.account_created))) / 3_600_000;
  if (me.is_verified !== true && hoursSinceSignup >= LOCKOUT_HOURS) {
    return json({ error: 'Verify your account to keep searching.', code: 'VERIFY_REQUIRED' }, 403);
  }

  const allowance = await rpc('consume_search', { p_user_id: me.id }) as { allowed: boolean; remaining: number | null };
  if (!allowance.allowed) {
    return json({ error: "You've used today's searches. They reset at midnight UTC.", code: 'LIMIT_REACHED', remaining: 0 }, 429);
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const filters = sanitizeFilters(body.filters);
  const limit = Math.min(Math.max(Math.floor(Number(body.limit) || MAX_RESULTS), 1), MAX_RESULTS);

  // Nobody the user already liked: search is for finding new people
  const pool = await rpc('search_candidates', { p_user_id: me.id, p_exclude_liked: true }) as Row[];
  const { parsed, by } = await understand(prompt, pool);
  const { candidates, poolSize } = rankCandidates(me, pool, prompt, filters, limit, Date.now(), parsed);
  return json({
    candidates, poolSize, totalEligible: pool.length, remaining: allowance.remaining,
    understood: describeParsed(parsed), understoodBy: by,
  });
}

async function standouts(me: Row, body: Record<string, unknown>): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const mine = `user_id=eq.${me.id}&for_date=eq.${today}`;

  if (body.refresh === true) {
    // Picking again is a Pro feature (the Standouts page offers it to Pro only)
    if (me.subscription_tier !== 'PRO') {
      return json({ error: 'Refreshing Standouts is a Pro feature.', code: 'PRO_ONLY' }, 403);
    }
    await rest(`standouts?${mine}`, { method: 'DELETE' });
  }

  // Today's picks, once chosen, stay for the day (in their saved order).
  // Anyone who has since become unavailable (paused, banned, blocked) drops out.
  const saved = await rest(`standouts?${mine}&select=candidate_id&order=rank.asc`) as { candidate_id: string }[];
  if (saved.length > 0) {
    const ids = saved.map((s) => s.candidate_id);
    const pool = await rpc('search_candidates', { p_user_id: me.id, p_ids: ids }) as Row[];
    const { candidates } = rankCandidates(me, pool, '', {}, ids.length);
    candidates.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return json({ candidates, computed: false });
  }

  // First visit today: the most compatible people the user hasn't liked yet
  const pool = await rpc('search_candidates', { p_user_id: me.id, p_exclude_liked: true }) as Row[];
  const { candidates } = rankCandidates(me, pool, '', {}, STANDOUTS_PER_DAY);
  if (candidates.length > 0) {
    await rest('standouts?on_conflict=user_id,candidate_id,for_date', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(candidates.map((c, i) => ({
        user_id: me.id, candidate_id: c.id, rank: i + 1, for_date: today,
      }))),
    });
  }
  return json({ candidates, computed: true });
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
