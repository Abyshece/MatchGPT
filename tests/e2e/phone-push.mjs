// Notifications to the phone apps, on the server (no browser): phones signing
// up (register_push_device), the queue, and send-push sending through Firebase
// Cloud Messaging, here the stand-in in store-standin.cjs (with its settings
// in the functions' env: FIREBASE_SERVICE_ACCOUNT, FCM_API_BASE).
//  - a match and a message reach A's phone: the right channel, grouping and
//    data, the message's words never in the notification; sent once
//  - phones that are gone are removed; busy ones are counted, then skipped
//  - our own setup failing (the API off, the sign-in refused) leaves the
//    phones alone and the notification waiting; a day-old one is dropped
//  - a phone moving to another account; signing out; the 10-phone cap;
//    only send-push's own caller gets in; RLS on the table
// The local send-push cron job is paused while it runs (and put back).
// Usage: node phone-push.mjs <email A> <email B>   (onboarded, password TestPass!2026)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const STANDIN = process.env.STORE_STANDIN || 'http://127.0.0.1:8790';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B || !ANON) { console.error('usage: ANON_KEY=… node phone-push.mjs <email A> <email B>'); process.exit(2); }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

async function signIn(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass!2026' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}
const rest = async (jwt, method, path, body) => {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const rpc = (jwt, fn, args = {}) => rest(jwt, 'POST', `rpc/${fn}`, args);
const standin = async (path, body) => (await fetch(`${STANDIN}${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})).json();

const cronSecret = sql(`select decrypted_secret from vault.decrypted_secrets where name = 'send_push_cron_secret';`);
const sendPush = async (secret = cronSecret) => {
  const r = await fetch(`${API}/functions/v1/send-push`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: '{}',
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const sentTo = async (token) => (await standin('/__fcm/messages')).filter((m) => m.message.token === token);

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const nameB = sql(`select coalesce(name, 'Someone') from profiles where id = '${B}';`);
const [lo, hi] = [A, B].sort();
const TOK_A = 'phone-a-cHNfdG9rZW5fZm9yX3Rlc3RfQQ';
const TOK_A2 = 'dead-phone-a-second-0123456789';
const TOK_BUSY = 'busy-phone-a-third-0123456789';

function reset() {
  sql(`delete from push_devices where user_id in ('${A}', '${B}') or token like 'phone-%' or token like 'dead-%' or token like 'busy-%';
       delete from push_queue where user_id in ('${A}', '${B}');
       delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
       delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
       update profiles set settings_push_notifs = true where id in ('${A}', '${B}');`);
}
const queued = (user) => sql(`select count(*) from push_queue where user_id = '${user}' and sent_at is null;`);

try {
  sql(`select cron.alter_job((select jobid from cron.job where jobname = 'send-push'), active := false);`);
  reset();
  await standin('/__fcm/reset', {});
  const jwtA = await signIn(EMAIL_A);
  const jwtB = await signIn(EMAIL_B);

  // ======================================================================================
  log('1. A phone signs up');
  let r = await rpc(jwtA, 'register_push_device', { p_token: TOK_A, p_platform: 'android', p_app_version: '1.0 (1)' });
  check(r.status === 204 || r.status === 200, `A's phone signed up (${r.status})`);
  check(sql(`select platform || '|' || app_version from push_devices where token = '${TOK_A}' and user_id = '${A}';`) === 'android|1.0 (1)',
    'saved for A, with the platform and app version');
  r = await rest(jwtA, 'GET', 'push_devices?select=platform,app_version');
  check(r.status === 200 && r.body.length === 1 && r.body[0].platform === 'android', 'A sees its own phone');
  r = await rest(jwtA, 'GET', 'push_devices?select=token');
  check(r.status >= 400, 'but not its token');
  r = await rest(jwtB, 'GET', 'push_devices?select=platform');
  check(r.status === 200 && r.body.length === 0, "B doesn't see A's phone");
  r = await rest(jwtA, 'POST', 'push_devices', { user_id: A, platform: 'ios', token: 'phone-direct-0123456789abcdef' });
  check(r.status >= 400, 'phones can only be added through register_push_device');
  r = await rpc(jwtA, 'register_push_device', { p_token: 'short', p_platform: 'android' });
  check(r.status >= 400, 'a token that is no token is refused');
  r = await rpc(jwtA, 'register_push_device', { p_token: TOK_A, p_platform: 'windows' });
  check(r.status >= 400, 'an unknown platform is refused');
  r = await fetch(`${API}/rest/v1/rpc/register_push_device`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: TOK_A, p_platform: 'ios' }),
  });
  check(r.status >= 400, 'not without signing in');

  // ======================================================================================
  log('2. A match and a message reach the phone');
  const matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  r = await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'Secret words: meet at 7?' });
  check(r.status === 201, `B sends A a message (${r.status})`);
  check(queued(A) === '2' && queued(B) === '1', 'queued: A a match and a message, B the match');
  r = await sendPush();
  check(r.status === 200 && r.body?.phones?.sent === 2, `send-push: 2 phone notifications sent (${JSON.stringify(r.body?.phones)})`);
  const got = await sentTo(TOK_A);
  const match = got.find((m) => m.message.data.event_type === 'new_match')?.message;
  const message = got.find((m) => m.message.data.event_type === 'new_message')?.message;
  check(!!match && match.notification.title.startsWith("It's a match") && match.notification.body.includes(nameB)
    && match.android.notification.channel_id === 'matches' && match.data.match_id === matchId,
    `the match: "${match?.notification.title}" / "${match?.notification.body}", channel matches`);
  check(!!message && message.notification.title === `💬 ${nameB} sent you a message` && message.notification.body === 'Open Shaadi24 to read it'
    && message.android.notification.channel_id === 'messages' && message.data.deep_link === '/matches' && message.data.match_id === matchId,
    `the message: "${message?.notification.title}", channel messages, opens the chat`);
  check(!JSON.stringify(got).includes('Secret words'), "the message's words are never in a notification");
  check(message?.android.notification.tag === `new_message-${matchId}` && message?.apns.headers['apns-collapse-id'] === `new_message-${matchId}`
    && message?.apns.payload.aps['thread-id'] === `new_message-${matchId}` && message?.android.priority === 'high',
    "one notification per chat (Android tag, Apple's collapse id and thread), sent at high priority");
  check(Object.values(message?.data ?? { x: 1 }).every((v) => typeof v === 'string'), 'data as strings, as FCM needs');
  check(queued(A) === '0', "A's notifications are marked sent");
  check(queued(B) === '1', "B's match waits (B has no phone or browser)");
  r = await sendPush();
  check((await sentTo(TOK_A)).length === 2 && (r.body?.phones?.sent ?? 0) === 0, 'sent once: nothing again on the next run');

  // ======================================================================================
  log('3. Phones that are gone, and busy ones');
  await rpc(jwtA, 'register_push_device', { p_token: TOK_A2, p_platform: 'ios' });
  await rpc(jwtA, 'register_push_device', { p_token: TOK_BUSY, p_platform: 'ios' });
  await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'second' });
  r = await sendPush();
  check(r.body?.phones?.sent === 1 && r.body?.phones?.removed === 1, `one sent, the dead phone removed (${JSON.stringify(r.body?.phones)})`);
  check(sql(`select count(*) from push_devices where token = '${TOK_A2}';`) === '0', 'the unregistered phone is gone');
  check(sql(`select failure_count from push_devices where token = '${TOK_BUSY}';`) === '1', 'the busy one counted a failure');
  check(queued(A) === '0', 'the notification counts as sent: it reached a phone');
  sql(`update push_devices set failure_count = 4 where token = '${TOK_BUSY}';`);
  await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'third' });
  await sendPush();
  check(sql(`select failure_count from push_devices where token = '${TOK_BUSY}';`) === '5', 'five failures');
  await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'fourth' });
  check(sql(`select count(*) from pending_pushes where device_token = '${TOK_BUSY}';`) === '0', 'then the phone is skipped');
  await rpc(jwtA, 'register_push_device', { p_token: TOK_BUSY, p_platform: 'ios' });
  check(sql(`select failure_count from push_devices where token = '${TOK_BUSY}';`) === '0', 'until the app signs it up again');
  sql(`delete from push_devices where token = '${TOK_BUSY}';`);
  await sendPush();

  // ======================================================================================
  log('4. Our setup failing leaves the phones alone');
  await standin('/__fcm/mode', { mode: 'denied' });
  await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'fifth' });
  const before = (await sentTo(TOK_A)).length;
  r = await sendPush();
  check(r.body?.phones?.failed === 1 && queued(A) === '1', 'the API off for the project: not sent, still queued');
  check(sql(`select failure_count from push_devices where token = '${TOK_A}';`) === '0', "and the phone isn't blamed");
  await standin('/__fcm/mode', { mode: 'signin' });
  r = await sendPush();
  check(r.body?.phones?.failed === 1 && queued(A) === '1', `the key stops working: Google refuses the token, the notification waits (${JSON.stringify(r.body?.phones)})`);
  r = await sendPush();
  check(r.body?.phones?.waiting === 1 && queued(A) === '1', `the next run signs in afresh, is refused, and waits (${JSON.stringify(r.body?.phones)})`);
  check(sql(`select failure_count from push_devices where token = '${TOK_A}';`) === '0', 'the phone still not blamed');
  await standin('/__fcm/mode', { mode: 'ok' });
  r = await sendPush();
  check(r.body?.phones?.sent === 1 && (await sentTo(TOK_A)).length === before + 1 && queued(A) === '0', 'fixed: it goes out');
  sql(`insert into push_queue (user_id, event_type, title, body, scheduled_at) values ('${A}', 'new_match', 'Old news', 'x', now() - interval '25 hours');`);
  r = await sendPush();
  check(!(await sentTo(TOK_A)).some((m) => m.message.notification.title === 'Old news'), 'a notification over a day old is not sent');

  // ======================================================================================
  log('5. The phone moves to another account; signing out; the cap');
  await rpc(jwtB, 'register_push_device', { p_token: TOK_A, p_platform: 'android' });
  check(sql(`select user_id from push_devices where token = '${TOK_A}';`) === B, 'B signs in on the same phone: it is B\'s now');
  const messagesBefore = (await sentTo(TOK_A)).filter((m) => m.message.data.event_type === 'new_message').length;
  await rest(jwtB, 'POST', 'messages', { match_id: matchId, sender_id: B, content: 'sixth' });
  await sendPush();
  const nowOnIt = await sentTo(TOK_A);
  check(nowOnIt.filter((m) => m.message.data.event_type === 'new_message').length === messagesBefore, "A's messages no longer go to it");
  check(nowOnIt.some((m) => m.message.data.event_type === 'new_match' && m.message.notification.body.includes(sql(`select coalesce(name, 'someone') from profiles where id = '${A}';`))),
    "B's match notification, waiting since B had no phone, reaches B's phone now");
  r = await rpc(jwtA, 'unregister_push_device', { p_token: TOK_A });
  check(sql(`select count(*) from push_devices where token = '${TOK_A}';`) === '1', "A can't take B's phone off");
  r = await rpc(jwtB, 'unregister_push_device', { p_token: TOK_A });
  check(r.status < 300 && sql(`select count(*) from push_devices where token = '${TOK_A}';`) === '0', 'B signs out: the phone is off the list');
  for (let i = 1; i <= 12; i++) await rpc(jwtB, 'register_push_device', { p_token: `phone-b-${String(i).padStart(2, '0')}-0123456789abcdef`, p_platform: 'ios' });
  check(sql(`select count(*) || '|' || bool_or(token like 'phone-b-12-%') from push_devices where user_id = '${B}';`) === '10|true',
    'an account keeps its 10 most recent phones');

  // ======================================================================================
  log('6. Only the cron job gets in');
  r = await sendPush('wrong-secret');
  check(r.status === 401, 'send-push refuses a caller without its secret');
  r = await fetch(`${API}/rest/v1/rpc/record_push_device_failures`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwtA}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_device_ids: [] }),
  });
  check(r.status >= 400, 'signed-in people can\'t count failures');
  r = await rest(jwtA, 'GET', 'pending_pushes?select=queue_id');
  check(r.status >= 400, "and can't read the queue");
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  try { reset(); } catch (e) { log('cleanup failed:', e.message); }
  sql(`select cron.alter_job((select jobid from cron.job where jobname = 'send-push'), active := true);`);
  await standin('/__fcm/reset', {}).catch(() => {});
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
