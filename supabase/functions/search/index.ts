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
//     With filters.usePreferences, the member's partner preferences
//     (partner_preferences) are filters too, except where the member asked
//     for the same thing themselves. Fewer than 5 results: `nearMisses`,
//     people who miss one thing by a little, each with `missed` ("Age 31").
//   POST { mode: 'standouts', refresh? }
//     → { candidates, computed }
//     Today's 5 picks (UTC day), chosen on the first visit and kept for the
//     day; refresh (Shaadi24+) picks again. People who fit the member's
//     partner preferences come first; nobody picked in the last 30 days is
//     picked again while there are others to pick.
//   POST { mode: 'alert_matches', id }  (a saved search's id, or 'preferences')
//     → { candidates }
//     The new members the last alert found, without using a search.
//   POST { mode: 'alerts' } with the x-cron-secret header (the search-alerts
//     cron job, once a day)
//     → { members, notified }
//     For each member with alerts on: the people listed since the last look
//     who fit each saved search, and who fit the partner preferences; one
//     notification for all of them.
//
// They leave out people the member passed on and people who haven't opened
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
  buildCatalog, describeParsed, effectivePrefs, parsePrompt, planToParsed, prefsFromRow, prefsWithoutPro, rankCandidates,
  sanitizeFilters, withoutProFilters,
  type MatchCandidate, type ParsedPrompt, type PartnerPrefs, type Row, type SearchPlan,
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
const NEAR_MISSES = { below: 5, max: 10 };  // fewer results than 5: up to 10 near misses
const ALERT_MEMBERS_PER_RUN = 500;
const ALERT_IDS_MAX = 50;        // new members kept per saved search for the member to see

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
async function understand(prompt: string, pool: Row[]): Promise<{ parsed: ParsedPrompt; by: 'ai' | 'rules'; plan?: SearchPlan }> {
  const byRules = { parsed: parsePrompt(prompt), by: 'rules' as const };
  if (!prompt.trim() || !GEMINI_API_KEY) return byRules;

  const catalog = buildCatalog(pool);
  const key = await sha256(JSON.stringify([PLAN_VERSION, GEMINI_MODEL, catalog, prompt.trim().toLowerCase()]));
  const since = new Date(Date.now() - PLAN_CACHE_DAYS * 86_400_000).toISOString();
  try {
    const [saved] = await rest(`search_prompt_cache?key=eq.${key}&created_at=gte.${since}&select=plan`) as { plan: SearchPlan }[];
    if (saved) return { parsed: planToParsed(saved.plan), by: 'ai', plan: saved.plan };
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
  return { parsed: planToParsed(result.plan), by: 'ai', plan: result.plan };
}

// The member's partner preferences, or null when none are set
async function partnerPrefs(userId: string): Promise<PartnerPrefs | null> {
  const [row] = await rest(`partner_preferences?user_id=eq.${userId}&select=*`) as Record<string, unknown>[];
  return prefsFromRow(row);
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
  // Partner preferences as filters: those Shaadi24+ filters cover need it here too
  const saved = filters.usePreferences ? await partnerPrefs(me.id) : null;
  const prefs = saved ? effectivePrefs(pro ? saved : prefsWithoutPro(saved), filters, parsed) : null;
  const { candidates, poolSize, nearMisses } = rankCandidates(
    me, pool, prompt, filters, limit, Date.now(), parsed, spotlit, { prefs, nearMisses: NEAR_MISSES },
  );
  const shown = candidates.filter((c) => c.spotlight).map((c) => c.id);
  if (shown.length) {
    await rpc('note_spotlight_views', { p_ids: shown }).catch((e) => console.warn('[search] spotlight views not counted:', e));
  }
  // The allowance after this search: whether the next one can go ahead
  const after = { ...allowance, allowed: !allowance.limited_by };
  return json({
    candidates: pro ? candidates : withoutReport(candidates), poolSize, totalEligible: pool.length, remaining: allowance.remaining, allowance: after,
    understood: describeParsed(parsed), understoodBy: by, said: parsed.said ?? null,
    nearMisses: pro ? nearMisses : withoutReport(nearMisses),
    usedPreferences: !!prefs && Object.keys(prefs).length > 0,
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

  // First visit today: the most compatible people the user hasn't liked yet.
  // Those who fit more of their partner preferences come first; then those
  // not shown as a Standout in the last 30 days (the others fill in only
  // when there aren't enough).
  const pool = await rpc('search_candidates', { p_user_id: me.id, p_exclude_liked: true }) as Row[];
  const since = new Date(Date.now() - STANDOUTS_REPEAT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const shownBefore = new Set((await rest(
    `standouts?user_id=eq.${me.id}&for_date=gte.${since}&for_date=lt.${today}&select=candidate_id`,
  ) as { candidate_id: string }[]).map((s) => s.candidate_id));
  const prefs = await partnerPrefs(me.id);
  const ranked = rankCandidates(me, pool, '', {}, pool.length, Date.now(), undefined, undefined, { preferFitting: prefs })
    .candidates.map((c, i) => ({ c, i, misses: Number(c.prefMisses ?? 0), again: shownBefore.has(c.id) }));
  ranked.sort((a, b) => a.misses - b.misses || Number(a.again) - Number(b.again) || a.i - b.i);
  const candidates = ranked.slice(0, STANDOUTS_PER_DAY).map(({ c }) => {
    delete c.prefMisses;
    return c;
  });
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

// The new members the last alert found, for the member to look through. It
// doesn't use a search; looking marks them seen (the "new" count goes).
async function alertMatches(me: Row, body: Record<string, unknown>): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id : '';
  const forPrefs = id === 'preferences';
  if (!forPrefs && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Invalid request' }, 400);
  const which = forPrefs ? `partner_preferences?user_id=eq.${me.id}` : `saved_searches?id=eq.${id}&user_id=eq.${me.id}`;
  const [row] = await rest(`${which}&select=new_ids`) as { new_ids: string[] | null }[];
  if (!row) return json({ error: 'That saved search is gone.', code: 'NOT_FOUND' }, 404);
  const ids = (row.new_ids ?? []).slice(0, ALERT_IDS_MAX);
  const pool = ids.length
    ? await rpc('search_candidates', { p_user_id: me.id, p_ids: ids, p_exclude_liked: true }) as Row[]
    : [];
  const { candidates } = rankCandidates(me, pool, '', {}, ALERT_IDS_MAX);
  await rest(which, { method: 'PATCH', body: JSON.stringify({ seen_at: new Date().toISOString() }) });
  const pro = await hasPro(me.id);
  return json({ candidates: pro ? candidates : withoutReport(candidates) });
}

// ---- The daily alerts (cron) -----------------------------------------------------------

// The x-cron-secret header against the push cron secret in Vault, in constant time
async function fromCron(req: Request): Promise<boolean> {
  const sent = req.headers.get('x-cron-secret') ?? '';
  if (!sent) return false;
  const [config] = await rpc('send_push_config', {}) as { cron_secret: string | null }[];
  const secret = config?.cron_secret ?? '';
  if (!secret || sent.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// Who the alert found before, kept until the member looks at them
const unseen = (row: Row): string[] => {
  const seen = row.seen_at && row.alerted_at && Date.parse(String(row.seen_at)) >= Date.parse(String(row.alerted_at));
  return seen ? [] : (row.new_ids as string[] | null) ?? [];
};
const merged = (ids: string[], before: string[]) => [...new Set([...ids, ...before])].slice(0, ALERT_IDS_MAX);
const listedAfter = (r: Row, since: unknown) => Date.parse(String(r.listed_at)) > Date.parse(String(since));

// One member's alerts: the people listed since each saved search (and the
// preferences) last looked, who fit it. True when a notification went out.
async function alertMember(userId: string, now: number): Promise<boolean> {
  const [me] = await rest(`profiles?id=eq.${userId}&select=*`) as Row[];
  if (!me) return false;
  const searches = await rest(`saved_searches?user_id=eq.${userId}&alerts=eq.true&select=*&order=created_at`) as Row[];
  const [prefRow] = await rest(`partner_preferences?user_id=eq.${userId}&select=*`) as Row[];
  const prefs = prefsFromRow(prefRow);
  const pro = await hasPro(userId);
  const stamp = new Date(now).toISOString();
  const pool = await rpc('search_candidates', { p_user_id: userId, p_exclude_liked: true }) as Row[];
  const found: { label: string; count: number; id: string }[] = [];

  for (const s of searches) {
    const fresh = pool.filter((r) => listedAfter(r, s.checked_at));
    let ids: string[] = [];
    const patch: Record<string, unknown> = { checked_at: stamp };
    if (fresh.length > 0) {
      const prompt = String(s.prompt ?? '');
      let parsed: ParsedPrompt;
      if (s.plan) {
        parsed = planToParsed(s.plan as SearchPlan);
      } else {
        // Gemini is asked once for a saved search; its plan is kept
        const understood = await understand(prompt, pool);
        parsed = understood.parsed;
        if (understood.plan) patch.plan = understood.plan;
      }
      const raw = sanitizeFilters(s.filters);
      const filters = pro ? raw : withoutProFilters(raw);
      const own = filters.usePreferences && prefs
        ? effectivePrefs(pro ? prefs : prefsWithoutPro(prefs), filters, parsed)
        : null;
      ids = rankCandidates(me, fresh, prompt, filters, ALERT_IDS_MAX, now, parsed, undefined, { prefs: own })
        .candidates.map((c) => c.id);
    }
    if (ids.length > 0) {
      patch.new_ids = merged(ids, unseen(s));
      patch.alerted_at = stamp;
      found.push({ label: `“${String(s.name)}”`, count: ids.length, id: String(s.id) });
    }
    await rest(`saved_searches?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  if (prefRow?.alerts === true && prefs) {
    // Like a search that starts from them: someone who hasn't said isn't
    // announced as fitting
    const fresh = pool.filter((r) => listedAfter(r, prefRow.checked_at));
    const ids = rankCandidates(me, fresh, '', {}, ALERT_IDS_MAX, now, undefined, undefined, { prefs })
      .candidates.map((c) => c.id);
    const patch: Record<string, unknown> = { checked_at: stamp };
    if (ids.length > 0) {
      patch.new_ids = merged(ids, unseen(prefRow));
      patch.alerted_at = stamp;
      found.unshift({ label: 'your partner preferences', count: ids.length, id: 'preferences' });
    }
    await rest(`partner_preferences?user_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  // One notification for everything found, to members who left them on
  if (found.length === 0 || me.settings_push_notifs === false) return false;
  const [first, ...more] = found;
  const body = more.length === 0
    ? `${first.count} new ${first.count === 1 ? 'member fits' : 'members fit'} ${first.label}.`
    : `New members fit ${first.label} and ${more.length === 1 ? more[0].label : `${more.length} saved searches`}.`;
  await rest('push_queue', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId, event_type: 'search_alert', title: 'New members for you', body,
      data: { event_type: 'search_alert', saved_search: first.id },
    }),
  });
  return true;
}

async function runAlerts(): Promise<Response> {
  const members = await rpc('alert_members', { p_limit: ALERT_MEMBERS_PER_RUN }) as { user_id: string }[];
  const now = Date.now();
  let notified = 0;
  for (const m of members) {
    try {
      if (await alertMember(m.user_id, now)) notified++;
    } catch (e) {
      console.warn('[search] alerts for a member failed:', errorText(e));
    }
  }
  return json({ members: members.length, notified });
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[search] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server not configured' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  // The daily alerts: the cron job, not a member
  if (body.mode === 'alerts') {
    try {
      if (!await fromCron(req)) return json({ error: 'Unauthorized' }, 401);
      return await runAlerts();
    } catch (e) {
      console.error('[search] alerts failed:', errorText(e));
      return json({ error: 'Alerts failed.' }, 500);
    }
  }

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Please sign in again.', code: 'UNAUTHENTICATED' }, 401);

  try {
    const [me] = await rest(`profiles?id=eq.${userId}&select=*`) as Row[];
    if (!me) return json({ error: 'Finish setting up your profile first.', code: 'NO_PROFILE' }, 403);
    if (me.is_banned === true) return json({ error: 'This account is suspended.', code: 'BANNED' }, 403);

    if (body.mode === 'standouts') return await standouts(me, body);
    if (body.mode === 'alert_matches') return await alertMatches(me, body);
    return await search(me, body);
  } catch (e) {
    console.error('[search] failed:', e instanceof Error ? e.message : e);
    return json({ error: 'Search failed. Please try again.' }, 500);
  }
}));
