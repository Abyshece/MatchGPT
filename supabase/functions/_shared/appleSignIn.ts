// ============================================================================
// Sign in with Apple: ending it when an account is deleted
//
// Apple asks apps that offer Sign in with Apple and let people delete their
// account to end Sign in with Apple for the app at the same time (Apple's
// "revoke tokens" call). That takes a token only Apple's server hands out:
// the app sends Apple's one-time code from the sign-in to apple-sign-in,
// which exchanges it for a refresh token and keeps it
// (apple_sign_in_tokens); delete-account revokes it.
//
// Secrets (Apple Developer → Certificates, Identifiers & Profiles → Keys, a
// key with "Sign in with Apple" for the app's ID; the push key can have it
// too):
//   APPLE_TEAM_ID              the team ID (top right of the developer site)
//   APPLE_SIGNIN_KEY_ID        the key's ID
//   APPLE_SIGNIN_PRIVATE_KEY   the text of the key's .p8 file
// APPLE_BUNDLE_ID: the app's bundle ID (default com.shaadi24.app).
// APPLE_ID_API_BASE: only for local testing against a stand-in.
// Until the secrets are set, nothing is kept and nothing is revoked.
// ============================================================================

import { errorText, rest } from './serviceRest.ts';

export interface AppleSignInConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;   // the app's bundle ID: native sign-ins are issued to it
  apiBase: string;
}

export function appleSignInConfig(): AppleSignInConfig | null {
  const teamId = Deno.env.get('APPLE_TEAM_ID')?.trim() ?? '';
  const keyId = Deno.env.get('APPLE_SIGNIN_KEY_ID')?.trim() ?? '';
  const privateKey = Deno.env.get('APPLE_SIGNIN_PRIVATE_KEY')?.trim() ?? '';
  if (!teamId || !keyId || !privateKey) return null;
  return {
    teamId,
    keyId,
    privateKey,
    clientId: Deno.env.get('APPLE_BUNDLE_ID') || 'com.shaadi24.app',
    apiBase: (Deno.env.get('APPLE_ID_API_BASE') || 'https://appleid.apple.com').replace(/\/+$/, ''),
  };
}

export class AppleSignInError extends Error {
  constructor(message: string, readonly status: number, readonly reason = '') {
    super(message);
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

/** The .p8 key's text (PEM; also with its line breaks written as \n). */
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** The client secret Apple wants with each call: a short-lived JWT signed with the key (ES256). */
export async function appleClientSecret(cfg: AppleSignInConfig, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64urlJson({ alg: 'ES256', kid: cfg.keyId })}.${b64urlJson({
    iss: cfg.teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: cfg.clientId,
  })}`;
  // WebCrypto's ECDSA signature is already JWS's r‖s form
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, await importKey(cfg.privateKey), new TextEncoder().encode(unsigned),
  ));
  return `${unsigned}.${b64url(signature)}`;
}

async function call(cfg: AppleSignInConfig, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: await appleClientSecret(cfg), ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // not JSON
  }
  if (!res.ok) {
    throw new AppleSignInError(`Apple ${path}: ${res.status} ${text.slice(0, 200)}`, res.status, String(body.error ?? ''));
  }
  return body;
}

/** The person's Apple ID (the "sub" of an ID token Apple's server just handed us). */
function appleSubject(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  try {
    const payload = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Exchanges the app's one-time code: the refresh token, and whose Apple ID it is. */
export async function exchangeAppleCode(cfg: AppleSignInConfig, code: string): Promise<{ refreshToken: string; appleId: string | null }> {
  const body = await call(cfg, '/auth/token', { code, grant_type: 'authorization_code' });
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
    throw new AppleSignInError('Apple /auth/token: no refresh token', 502);
  }
  return { refreshToken: body.refresh_token, appleId: appleSubject(body.id_token) };
}

/** Ends Sign in with Apple for the app, for the person this token is for. */
export async function revokeAppleToken(cfg: AppleSignInConfig, refreshToken: string): Promise<void> {
  await call(cfg, '/auth/revoke', { token: refreshToken, token_type_hint: 'refresh_token' });
}

/**
 * Before an account is deleted: ends its Sign in with Apple, if it has one
 * kept. Best effort (the account is deleted either way); the kept token goes
 * with the account.
 */
export async function endSignInWithApple(userId: string): Promise<'revoked' | 'none' | 'not_configured' | 'failed'> {
  const [row] = await rest<{ refresh_token: string }[]>(`apple_sign_in_tokens?user_id=eq.${userId}&select=refresh_token`);
  if (!row) return 'none';
  const cfg = appleSignInConfig();
  if (!cfg) {
    console.warn('[apple] a Sign in with Apple token is kept but the Apple secrets are not set: not revoked');
    return 'not_configured';
  }
  try {
    await revokeAppleToken(cfg, row.refresh_token);
    return 'revoked';
  } catch (e) {
    console.warn('[apple] revoking Sign in with Apple failed:', errorText(e));
    return 'failed';
  }
}
