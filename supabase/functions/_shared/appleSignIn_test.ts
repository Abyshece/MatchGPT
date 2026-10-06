// deno test --allow-env supabase/functions/_shared/appleSignIn_test.ts
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { appleClientSecret, appleSignInConfig, type AppleSignInConfig } from './appleSignIn.ts';

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const body = btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}

const cfgWith = (privateKey: string): AppleSignInConfig =>
  ({ teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey, clientId: 'com.shaadi24.app', apiBase: 'https://appleid.apple.com' });

Deno.test('the client secret is an ES256 JWT Apple can check', async () => {
  const { pem, publicKey } = await testKey();
  const now = Date.UTC(2026, 9, 4, 12, 0, 0);
  const jwt = await appleClientSecret(cfgWith(pem), now);
  const [h, p, s] = jwt.split('.');
  assertEquals(JSON.parse(new TextDecoder().decode(fromB64url(h))), { alg: 'ES256', kid: 'KEY1234567' });
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  assertEquals(claims, { iss: 'TEAM123456', iat: now / 1000, exp: now / 1000 + 300, aud: 'https://appleid.apple.com', sub: 'com.shaadi24.app' });
  assertEquals(fromB64url(s).length, 64);  // r‖s, as JWS wants
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${p}`)));
});

Deno.test('the key also works with its line breaks written as \\n', async () => {
  const { pem, publicKey } = await testKey();
  const jwt = await appleClientSecret(cfgWith(pem.trim().replace(/\n/g, '\\n')));
  const [h, p, s] = jwt.split('.');
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${p}`)));
});

Deno.test('nothing is set up until all three secrets are there', () => {
  const names = ['APPLE_TEAM_ID', 'APPLE_SIGNIN_KEY_ID', 'APPLE_SIGNIN_PRIVATE_KEY', 'APPLE_BUNDLE_ID', 'APPLE_ID_API_BASE'];
  const saved = names.map((n) => Deno.env.get(n));
  try {
    names.forEach((n) => Deno.env.delete(n));
    assertEquals(appleSignInConfig(), null);
    Deno.env.set('APPLE_TEAM_ID', 'TEAM123456');
    Deno.env.set('APPLE_SIGNIN_KEY_ID', 'KEY1234567');
    assertEquals(appleSignInConfig(), null);
    Deno.env.set('APPLE_SIGNIN_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----');
    assertEquals(appleSignInConfig()?.clientId, 'com.shaadi24.app');
    assertEquals(appleSignInConfig()?.apiBase, 'https://appleid.apple.com');
  } finally {
    names.forEach((n, i) => (saved[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, saved[i]!)));
  }
});
