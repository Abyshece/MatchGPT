// ============================================================================
// blog-ai Edge Function: AI writing in Admin → Blog (writer.ts), for admins
//
//   POST { action: 'ideas', theme? }                          → { ideas }
//   POST { action: 'draft', topic, keyword?, audience?, tone?, length?, notes? } → { post }
//   POST { action: 'seo', title, content }                    → { fields }
//   POST { action: 'rewrite', text, instruction }             → { text }
//   Errors: { error } with 400 (input), 401/403 (not an admin), 429 (Gemini's
//   free quota), 502 (Gemini failed), 503 (no GEMINI_API_KEY).
//
// Deployed with JWT verification off; the function checks the admin itself.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import { write, type Action } from './writer.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_BLOG_MODEL = Deno.env.get('GEMINI_BLOG_MODEL') ?? '';
const GEMINI_API_BASE = Deno.env.get('GEMINI_API_BASE') || undefined;  // only for local testing

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// is_admin() as the caller (their access token), so it's their sign-in that counts
async function isAdmin(auth: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return res.ok && (await res.json().catch(() => false)) === true;
}

const STATUS = { bad_request: 400, quota: 429, no_key: 503, error: 502, unusable: 502 } as const;

Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Sign in first' }, 401);
  if (!(await isAdmin(auth))) return json({ error: 'Admins only' }, 403);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Send JSON' }, 400);
  const { action, ...input } = body as { action: Action } & Record<string, unknown>;

  const result = await write(action, input, {
    apiKey: GEMINI_API_KEY, model: GEMINI_BLOG_MODEL || undefined, apiBase: GEMINI_API_BASE,
  });
  if (!result.ok) return json({ error: result.message, reason: result.reason }, STATUS[result.reason]);
  const { action: _, ...answer } = result.answer;
  return json({ ...answer, model: result.model });
}));
