// ============================================================================
// apple-sign-in Edge Function: so that deleting an account can end its
// Sign in with Apple
//
// Right after someone signs in with Apple in the iPhone app, the app sends
// Apple's one-time code from that sign-in (POST { authorizationCode }, with
// the person's access token; the function checks it itself, so it's deployed
// with JWT verification off). The code is exchanged with Apple for a refresh
// token, kept in apple_sign_in_tokens until the account is deleted, when
// delete-account revokes it (_shared/appleSignIn.ts).
//   → { kept: true }, or { kept: false, reason: 'not_configured' } until the
//     Apple secrets are set
// Only a code for the account's own Apple ID is kept.
// ============================================================================

import { withCors } from '../_shared/cors.ts';
import { errorText, getUserId, rest, serviceConfigured } from '../_shared/serviceRest.ts';
import { appleSignInConfig, AppleSignInError, exchangeAppleCode } from '../_shared/appleSignIn.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// The Apple IDs the account signs in with (its Apple identities in Supabase Auth)
async function appleIdsOf(userId: string): Promise<string[]> {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`auth admin user: ${res.status}`);
  const user = await res.json();
  const identities: { provider?: string; id?: string; provider_id?: string; identity_data?: { sub?: string } }[] = user.identities ?? [];
  return identities
    .filter((i) => i.provider === 'apple')
    .flatMap((i) => [i.id, i.provider_id, i.identity_data?.sub])
    .filter((v): v is string => typeof v === 'string' && v !== '');
}

Deno.serve(withCors(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!serviceConfigured()) return json({ error: 'Server not configured' }, 500);

  const userId = await getUserId(req);
  if (!userId) return json({ error: 'Please sign in again.', code: 'UNAUTHENTICATED' }, 401);

  let code = '';
  try {
    const body = await req.json();
    code = typeof body?.authorizationCode === 'string' ? body.authorizationCode.trim() : '';
  } catch {
    // no body: answered below
  }
  if (!code || code.length > 2048) return json({ error: 'Missing authorization code', code: 'BAD_REQUEST' }, 400);

  const cfg = appleSignInConfig();
  if (!cfg) return json({ kept: false, reason: 'not_configured' });

  try {
    const appleIds = await appleIdsOf(userId);
    if (appleIds.length === 0) return json({ error: 'This account doesn\'t sign in with Apple.', code: 'NOT_APPLE' }, 400);
    const { refreshToken, appleId } = await exchangeAppleCode(cfg, code);
    if (!appleId || !appleIds.includes(appleId)) {
      return json({ error: 'That Apple sign-in is for another account.', code: 'OTHER_ACCOUNT' }, 403);
    }
    await rest('apple_sign_in_tokens?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() }),
    });
    return json({ kept: true });
  } catch (e) {
    if (e instanceof AppleSignInError && e.status === 400 && e.reason === 'invalid_grant') {
      // Used already, or more than five minutes old
      return json({ error: 'That Apple sign-in has expired.', code: 'INVALID_CODE' }, 400);
    }
    console.error('[apple-sign-in] failed:', errorText(e));
    return json({ error: 'Something went wrong. Please try again.' }, 502);
  }
}));
