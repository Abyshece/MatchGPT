// Sign in with Apple on the server (apple-sign-in, delete-account), against
// the Apple stand-in in store-standin.cjs and the real local database:
//   - the one-time code from the app is exchanged for a refresh token, kept
//     only for the account's own Apple ID, never readable by the app
//   - a used or expired code, another Apple ID, Apple being down, an account
//     without Apple: nothing kept
//   - signing in again replaces it; "Download my data" says since when (not the token)
//   - deleting the account revokes it at Apple, then it goes with the account;
//     no token → no call to Apple; Apple down → the account is deleted anyway
// Usage: SERVICE_ROLE_KEY=… node apple-sign-in.mjs   (functions served with store-standin.env)
import { execSync } from 'node:child_process';

const SUPABASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const STANDIN = process.env.STANDIN_URL || 'http://127.0.0.1:8790';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is required'); process.exit(2); }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const j = (r) => r.json().catch(() => ({}));
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

async function newUser(label) {
  const email = `apple_${label}_${Date.now()}@example.com`;
  const created = await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass!2026', email_confirm: true }),
  }).then(j);
  const session = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass!2026' }),
  }).then(j);
  return { id: created.id, token: session.access_token, appleId: `000${Math.floor(Math.random() * 1e6)}.${label}.${Date.now()}` };
}
// The account signs in with this Apple ID (what Supabase Auth records for a Sign in with Apple)
const linkApple = (u) => sql(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values ('${u.appleId}', '${u.id}', jsonb_build_object('sub', '${u.appleId}', 'email', '${u.id.slice(0, 8)}@privaterelay.appleid.com',
          'email_verified', true, 'provider_id', '${u.appleId}'), 'apple', now(), now(), now());`);
const call = (fn, token, body) => fetch(`${SUPABASE}/functions/v1/${fn}`, {
  method: 'POST', headers: { apikey: ANON, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const appleCode = async (sub) => (await fetch(`${STANDIN}/__appleid/code`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub, email: 'x@privaterelay.appleid.com' }),
}).then(j)).code;
const appleState = () => fetch(`${STANDIN}/__appleid/state`).then(j);
const appleMode = (mode) => fetch(`${STANDIN}/__appleid/mode`, { method: 'POST', body: JSON.stringify({ mode }) });
const kept = (u) => sql(`select refresh_token || '|' || created_at || '|' || updated_at from apple_sign_in_tokens where user_id = '${u.id}';`);
const userExists = async (id) => (await fetch(`${SUPABASE}/auth/v1/admin/users/${id}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).status === 200;

await appleMode('ok');

log('== Keeping the token');
let r = await call('apple-sign-in', null, { authorizationCode: 'c.x' });
check(r.status === 401, `not signed in → ${r.status}`);

const a = await newUser('a');
const callsBefore = (await appleState()).calls.length;
r = await call('apple-sign-in', a.token, { authorizationCode: await appleCode(a.appleId) });
let body = await j(r);
check(r.status === 400 && body.code === 'NOT_APPLE', `an account without Sign in with Apple → ${r.status} ${body.code}`);
check((await appleState()).calls.length === callsBefore, '  …and Apple isn\'t asked');

linkApple(a);
r = await call('apple-sign-in', a.token, {});
body = await j(r);
check(r.status === 400 && body.code === 'BAD_REQUEST', `no code → ${r.status} ${body.code}`);

const code1 = await appleCode(a.appleId);
r = await call('apple-sign-in', a.token, { authorizationCode: code1 });
body = await j(r);
check(r.status === 200 && body.kept === true, `the account's own Apple sign-in → kept (${r.status} ${JSON.stringify(body)})`);
let state = await appleState();
const issued1 = state.refreshTokens.find((t) => t.sub === a.appleId);
const [token1, created1, updated1] = kept(a).split('|');
check(!!issued1 && token1 === issued1.token, 'the refresh token Apple issued is the one kept');
const tokenCall = state.calls.filter((c) => c.path === '/auth/token').pop();
check(tokenCall?.grant_type === 'authorization_code', 'exchanged as an authorization code, with a client secret Apple accepted');

r = await call('apple-sign-in', a.token, { authorizationCode: code1 });
body = await j(r);
check(r.status === 400 && body.code === 'INVALID_CODE', `the same code again → ${r.status} ${body.code}`);

r = await call('apple-sign-in', a.token, { authorizationCode: await appleCode('000999.someone.else') });
body = await j(r);
check(r.status === 403 && body.code === 'OTHER_ACCOUNT', `another Apple ID's code → ${r.status} ${body.code}`);
check(kept(a).split('|')[0] === token1, '  …and the kept token is unchanged');

await appleMode('down');
r = await call('apple-sign-in', a.token, { authorizationCode: await appleCode(a.appleId) });
body = await j(r);
check(r.status === 502, `Apple down → ${r.status} ${body.error}`);
await appleMode('ok');
check(kept(a).split('|')[0] === token1, '  …and the kept token is unchanged');

await new Promise((res) => setTimeout(res, 1100));
r = await call('apple-sign-in', a.token, { authorizationCode: await appleCode(a.appleId) });
check(r.status === 200, `signing in with Apple again → ${r.status}`);
const [token2, created2, updated2] = kept(a).split('|');
check(token2 !== token1 && created2 === created1 && updated2 !== updated1, 'the new token replaces the old one (same row, updated)');

log('== Out of the app\'s reach');
const read = await fetch(`${SUPABASE}/rest/v1/apple_sign_in_tokens?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${a.token}` } });
check(read.status === 401 || read.status === 403, `the app can't read the tokens (${read.status})`);
const write = await fetch(`${SUPABASE}/rest/v1/apple_sign_in_tokens`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: a.id, refresh_token: 'mine' }),
});
check(write.status === 401 || write.status === 403, `…nor write them (${write.status})`);
const exported = await fetch(`${SUPABASE}/rest/v1/rpc/export_my_data`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json' }, body: '{}',
}).then(j);
check(exported?.export_metadata?.format_version === '1.3' && !!exported?.sign_in_with_apple?.token_kept_since,
  `"Download my data" says since when a token is kept (${JSON.stringify(exported?.sign_in_with_apple)})`);
check(!JSON.stringify(exported).includes(token2), '  …without the token itself');

log('== Deleting the account');
r = await call('delete-account', a.token, { confirmation: 'Delete' });
body = await j(r);
check(r.status === 200 && body.success && body.details?.sign_in_with_apple === 'revoked',
  `deleted, Sign in with Apple ended (${r.status} ${body.details?.sign_in_with_apple})`);
state = await appleState();
check(state.refreshTokens.find((t) => t.token === token2)?.revoked === true, 'Apple was asked to revoke the kept token');
const revokeCall = state.calls.filter((c) => c.path === '/auth/revoke').pop();
check(revokeCall?.token_type_hint === 'refresh_token', '  …as a refresh token');
check(!(await userExists(a.id)) && kept(a) === '', 'the account and its kept token are gone');

const b = await newUser('b');
const revokesBefore = (await appleState()).calls.filter((c) => c.path === '/auth/revoke').length;
r = await call('delete-account', b.token, { confirmation: 'Delete' });
body = await j(r);
check(r.status === 200 && body.details?.sign_in_with_apple === 'none', `an account without Apple → deleted (${body.details?.sign_in_with_apple})`);
check((await appleState()).calls.filter((c) => c.path === '/auth/revoke').length === revokesBefore, '  …without a call to Apple');

const c = await newUser('c');
linkApple(c);
r = await call('apple-sign-in', c.token, { authorizationCode: await appleCode(c.appleId) });
check(r.status === 200, 'another account keeps its token');
await appleMode('down');
r = await call('delete-account', c.token, { confirmation: 'Delete' });
body = await j(r);
await appleMode('ok');
check(r.status === 200 && body.success && body.details?.sign_in_with_apple === 'failed',
  `Apple down while deleting → deleted anyway (${body.details?.sign_in_with_apple})`);
check(!(await userExists(c.id)) && kept(c) === '', '  …and the kept token went with it');

log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
