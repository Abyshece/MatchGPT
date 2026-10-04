// ============================================================================
// Signing in to Google's APIs as a service account (OAuth 2.0 JWT bearer)
//
// For the Play Developer API (googlePlay.ts) and Firebase Cloud Messaging
// (fcm.ts). A service account's JSON key, kept in a secret, holds its email
// and private key. A token lasts an hour and is reused until five minutes
// before it ends.
// ============================================================================

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

/** The service account in a secret (its JSON key), or null if it's unset or unusable. */
export function serviceAccountFrom(secret: string): ServiceAccount | null {
  const raw = Deno.env.get(secret) ?? '';
  if (!raw.trim()) return null;
  try {
    const account = JSON.parse(raw) as ServiceAccount;
    if (account.client_email && account.private_key) return account;
    console.error(`[google] ${secret} has no client_email or private_key`);
  } catch {
    console.error(`[google] ${secret} is not JSON`);
  }
  return null;
}

/** Google refused to sign the service account in (a wrong or revoked key, say): our problem, not the caller's. */
export class GoogleAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

const tokens = new Map<string, { value: string; expires: number }>();

/** An access token for the given scope. */
export async function googleAccessToken(account: ServiceAccount, scope: string): Promise<string> {
  const key = `${account.client_email} ${scope}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now() + 300_000) return cached.value;

  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: account.client_email,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  })}`;
  const signingKey = await importPrivateKey(account.private_key);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, new TextEncoder().encode(unsigned)));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.access_token !== 'string') {
    throw new GoogleAuthError(`Google sign-in failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`, res.status);
  }
  tokens.set(key, { value: body.access_token, expires: Date.now() + (Number(body.expires_in) || 3600) * 1000 });
  return body.access_token;
}

/** Drops a cached token Google no longer accepts, so the next call signs in afresh. */
export function forgetGoogleAccessToken(account: ServiceAccount, scope: string): void {
  tokens.delete(`${account.client_email} ${scope}`);
}
