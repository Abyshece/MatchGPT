// ============================================================================
// The database through PostgREST with the service role (bypasses row access
// rules: the function using it decides what goes back to the browser), and
// the signed-in user behind a request.
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export const serviceConfigured = () => !!SUPABASE_URL && !!SERVICE_ROLE_KEY;

// deno-lint-ignore no-explicit-any
export async function rest<T = any>(path: string, init: RequestInit = {}): Promise<T> {
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
  return (text ? JSON.parse(text) : null) as T;
}

// deno-lint-ignore no-explicit-any
export const rpc = <T = any>(fn: string, args: Record<string, unknown>) =>
  rest<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// The signed-in user behind the request's access token, or null.
export async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: auth },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === 'string' ? user.id : null;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
