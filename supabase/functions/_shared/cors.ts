// ============================================================================
// Shared CORS handling for the edge functions.
//
// Set the ALLOWED_ORIGINS secret to the site origins that may call these
// functions from a browser (comma-separated):
//   npx supabase secrets set ALLOWED_ORIGINS=https://shaadigpt.com,http://localhost:3000
//
// If ALLOWED_ORIGINS is unset, every origin is allowed (the previous
// behaviour), so deploying this before setting the secret breaks nothing.
// Server-to-server callers (cron, other functions) send no Origin header and
// are unaffected either way — CORS is enforced by browsers only.
// ============================================================================

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (ALLOWED_ORIGINS.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }

  // Echo the caller's origin back only when it's on the list; browsers then
  // refuse to hand the response to any other site.
  const origin = req.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  headers['Vary'] = 'Origin';
  return headers;
}

// Wraps a handler: answers CORS preflight requests and adds the CORS headers
// to every response the handler returns.
export function withCors(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: cors });
    }
    const res = await handler(req);
    for (const [name, value] of Object.entries(cors)) {
      res.headers.set(name, value);
    }
    return res;
  };
}
