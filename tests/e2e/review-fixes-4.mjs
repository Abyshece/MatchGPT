// ============================================================================
// Fixes for what other matrimony apps' members complain about, part 4: trust
// and support (20261012090000_trust_and_support.sql)
//
//   1. The Verified badge: two photos and a selfie doing the gesture the
//      server picks; the rules the database keeps (old app, one photo, wrong
//      gesture, someone else's selfie, writing requests directly); the selfie
//      is private to the member and the verification team
//   2. In the app: Get verified, the selfie, "in review" since when
//   3. The admin compares the selfie with the photos and turns it down with a
//      reason; the selfie is deleted; the member gets a message, sees why in
//      My requests and tries again; approved: the badge and a message
//   4. Reports: "An agent or marriage bureau", the team's notes hidden from
//      the reporter, an answer in My requests and a message
//   5. Complaints: the answer in My requests, and a message that opens it
//   6. Share my number: the card with Call and WhatsApp for the match, only
//      through share_my_number(); messages can't be changed by members
//   7. Download my data has the new parts; screenshots are blocked on Android
//
// Usage: node review-fixes-4.mjs <admin> <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_ADMIN, EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_ADMIN || !EMAIL_A || !EMAIL_B) { console.error('usage: node review-fixes-4.mjs <admin> <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/review-fixes-4/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const PASSWORD = 'TestPass!2026';

const token = async (email) => {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.access_token;
};
const call = async (path, init, jwt) => {
  const r = await fetch(`${API}${path}`, {
    ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, json, text };
};
const rpc = (name, args, jwt) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }, jwt);
const POSES = ['thumbs_up', 'peace', 'hand_on_head', 'touch_ear', 'hand_on_cheek', 'three_fingers', 'open_palm', 'point_up'];
// A 1×1 PNG: enough for the bucket, the browser and the admin panel
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const upload = (path, jwt) => fetch(`${API}/storage/v1/object/verification-selfies/${path}`, {
  method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'image/png' }, body: PNG,
}).then((r) => r.status);
const fetchSelfie = (path, jwt) => fetch(`${API}/storage/v1/object/authenticated/verification-selfies/${path}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}` },
}).then((r) => r.status);
const selfieStored = (path) => sql(`select count(*) from storage.objects where bucket_id = 'verification-selfies' and name = '${path}';`) === '1';

const ADMIN = sql(`select id from auth.users where email = '${EMAIL_ADMIN}';`);
const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const NAME_A = sql(`select name from profiles where id = '${A}';`);
const NAME_B = sql(`select name from profiles where id = '${B}';`);
const [LO, HI] = A < B ? [A, B] : [B, A];
const PHOTO = sql(`select photo_urls[1] from profiles where id = '${A}';`);
// What the test changes, to put back
const was = JSON.parse(sql(`select json_build_object('photos', photo_urls, 'verified', is_verified, 'status', verification_status,
  'phone', phone_number) from profiles where id = '${A}';`));
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => (a ? `array[${a.map(lit).join(',')}]::text[]` : 'null');
const started = sql('select now();');
const cleanup = () => sql(`
  delete from verification_requests where user_id = '${A}';
  delete from reports where reporter_id = '${A}' and created_at >= '${started}';
  delete from grievances where user_id = '${A}' and created_at >= '${started}';
  delete from member_messages where user_id = '${A}' and created_at >= '${started}';
  delete from admin_messages where kind = 'support' and created_at >= '${started}';
  delete from matches where user_a_id = '${LO}' and user_b_id = '${HI}';
  delete from push_queue where user_id in ('${A}', '${B}', '${ADMIN}') and created_at >= '${started}';
  update profiles set photo_urls = ${arr(was.photos)}, is_verified = ${was.verified ?? false},
    verification_status = ${lit(was.status)}, phone_number = ${lit(was.phone)} where id = '${A}';`);
const messagesTo = (who) => sql(`select coalesce(json_agg(json_build_object('title', m.title, 'body', m.body, 'target', m.cta_target) order by mm.created_at), '[]')
  from member_messages mm join admin_messages m on m.id = mm.message_id where mm.user_id = '${who}' and mm.created_at >= '${started}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const signIn = async (email, viewport = { width: 1280, height: 900 }) => {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return { ctx, page };
};

try {
  cleanup();
  sql(`update profiles set ${CONSENTED} where id in ('${A}', '${B}', '${ADMIN}');
       update profiles set is_verified = false, verification_status = null, phone_number = null where id = '${A}';`);
  const jwtA = await token(EMAIL_A);
  const jwtB = await token(EMAIL_B);
  const jwtAdmin = await token(EMAIL_ADMIN);

  log('== 1. What the database keeps to');
  const pose = (await rpc('verification_pose', {}, jwtA)).json;
  check(POSES.includes(pose),
    `today's gesture for A: ${pose}`);
  check((await rpc('verification_pose', {}, jwtA)).json === pose, 'the same all day');
  const old = await rpc('submit_verification_request',
    { p_linkedin_url: 'https://linkedin.com/in/a', p_instagram_url: 'https://instagram.com/a', p_facebook_url: '', p_twitter_url: '', p_user_notes: '' }, jwtA);
  check(old.status >= 400 && /update Shaadi24/.test(old.text), 'an app from before the selfie is told to update');

  const mine = `${A}/selfie_test_${Date.now()}.png`;
  check(await upload(mine, jwtA) === 200, 'A puts a selfie in their own folder');
  check(await upload(`${B}/selfie_test_${Date.now()}.png`, jwtA) >= 400, "but not in B's");
  check(await fetchSelfie(mine, jwtA) === 200, 'A can open their selfie');
  check(await fetchSelfie(mine, jwtB) >= 400, "B can't");
  check(await fetchSelfie(mine) >= 400, 'nor can anyone signed out');
  check(await fetchSelfie(mine, jwtAdmin) === 200, 'the verification team can');

  const submit = (args) => rpc('submit_verification_request', {
    p_selfie_path: mine, p_pose: pose, p_linkedin_url: '', p_instagram_url: '', p_facebook_url: '', p_twitter_url: '', p_user_notes: '', ...args }, jwtA);
  sql(`update profiles set photo_urls = array[${lit(PHOTO)}] where id = '${A}';`);
  let r = await submit({});
  check(r.status >= 400 && /second photo/.test(r.text), 'one photo isn\'t enough');
  sql(`update profiles set photo_urls = array[${lit(PHOTO)}, ${lit(PHOTO + '?2')}] where id = '${A}';`);
  const yesterdays = sql(`select public.verification_pose_for('${A}', (now() at time zone 'Asia/Kolkata')::date - 1);`);
  const wrongPose = POSES.find((p) => p !== pose && p !== yesterdays);
  r = await submit({ p_pose: wrongPose });
  check(r.status >= 400 && /gesture/.test(r.text), 'another gesture is refused');
  r = await submit({ p_selfie_path: `${B}/x.png` });
  check(r.status >= 400 && /selfie/.test(r.text), "someone else's selfie is refused");
  r = await submit({ p_selfie_path: `${A}/never-sent.png` });
  check(r.status >= 400 && /selfie/.test(r.text), "a selfie that didn't arrive is refused");
  r = await call('/rest/v1/verification_requests', { method: 'POST', body: JSON.stringify({ user_id: A, status: 'approved' }) }, jwtA);
  check(r.status >= 400, `members can't write a request directly (${r.status})`);
  await fetch(`${API}/storage/v1/object/verification-selfies/${mine}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${jwtA}` } });
  check(!selfieStored(mine), 'A can remove their own selfie');

  log('== 2. Get verified, in the app');
  const a = await signIn(EMAIL_A);
  await a.page.getByText('Get verified today', { exact: false }).first().click();
  const modal = a.page.getByTestId('verify-modal');
  await modal.waitFor({ timeout: 8000 });
  check(await appears(modal.getByTestId('verify-pose')), 'the gesture is shown');
  check(await modal.getByTestId('verify-pose').getAttribute('data-pose') === pose, 'the one the server picked');
  check(await modal.getByTestId('verify-photos').getAttribute('data-ok') === 'true', 'two photos: ticked');
  const send = modal.getByTestId('verify-submit');
  check(await send.isDisabled(), 'Send is off until there is a selfie');
  await modal.getByTestId('verify-selfie-input').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: PNG });
  check(await appears(modal.getByTestId('verify-selfie-preview')), 'the selfie shows');
  check(await send.isEnabled(), 'and Send is on, without any links');
  await a.page.screenshot({ path: `${OUT}1-get-verified.png` });
  await send.click();
  await modal.waitFor({ state: 'detached', timeout: 15000 });
  const req = JSON.parse(sql(`select json_build_object('id', id, 'path', selfie_path, 'pose', pose, 'status', status) from verification_requests where user_id = '${A}';`));
  check(req.status === 'pending' && req.pose === pose && req.path?.startsWith(`${A}/selfie_`) && selfieStored(req.path),
    `sent: ${req.status}, ${req.pose}, ${req.path}`);
  await a.page.getByText('Verification pending').first().click();
  await modal.waitFor({ timeout: 8000 });
  check(await appears(modal.getByTestId('verify-status').getByText(/^Sent /)), 'reopened: since when it is in review');
  check(await modal.getByTestId('verify-change').isVisible(), 'and "Send a new selfie instead"');
  sql(`update verification_requests set created_at = now() - interval '3 days' where id = '${req.id}';`);
  await a.page.keyboard.press('Escape');
  await a.page.getByText('Verification pending').first().click();
  check(await appears(modal.getByText(/taking longer than usual/)), 'after 48 hours: "taking longer than usual"');
  await a.page.keyboard.press('Escape');

  log('== 3. The team decides');
  r = await rpc('admin_review_verification', { request_id: req.id, decision: 'rejected', notes: '' }, jwtAdmin);
  check(r.status >= 400 && /why/.test(r.text), 'turning it down needs a reason');
  sql(`insert into verification_requests (user_id, linkedin_url, status) values ('${B}', 'https://linkedin.com/in/b', 'pending');`);
  const noSelfie = sql(`select id from verification_requests where user_id = '${B}' and status = 'pending' order by created_at desc limit 1;`);
  r = await rpc('admin_review_verification', { request_id: noSelfie, decision: 'approved', notes: '' }, jwtAdmin);
  check(r.status >= 400 && /no selfie/i.test(r.text), 'a request without a selfie can\'t be approved');
  sql(`delete from verification_requests where id = '${noSelfie}';`);

  const admin = await signIn(EMAIL_ADMIN, { width: 1400, height: 1000 });
  await admin.page.getByText('Admin', { exact: true }).first().click();
  await admin.page.getByTestId('admin-sidebar').getByRole('button', { name: 'Verification', exact: true }).click();
  const card = admin.page.getByTestId('verification-selfie').filter({ hasText: 'Asked to do' }).first();
  check(await appears(card, 15000), 'the request shows the gesture asked for');
  check(await appears(card.locator('img[alt^="Selfie"]')), 'the selfie, next to the photos');
  await admin.page.screenshot({ path: `${OUT}2-admin-verification.png` });
  const cardBox = admin.page.locator('div.bg-white', { has: card }).last();
  await cardBox.getByRole('button', { name: 'Reject' }).click();
  const dialogSelect = admin.page.getByTestId('verify-reason-select');
  await dialogSelect.waitFor();
  await dialogSelect.selectOption('selfie_unclear');
  check(await appears(admin.page.getByText(/They read: "We couldn't see your face clearly/)), 'the admin sees what the member will read');
  await admin.page.getByRole('button', { name: 'Reject', exact: true }).last().click();
  await admin.page.waitForTimeout(2500);
  const decided = sql(`select status || ' ' || coalesce(reason_code, '-') from verification_requests where id = '${req.id}';`);
  check(decided === 'rejected selfie_unclear', `turned down, with the reason (${decided})`);
  check(!selfieStored(req.path), 'the selfie is deleted');
  let msgs = JSON.parse(messagesTo(A));
  check(msgs.some((m) => m.title === 'Your verification needs another try' && m.body.startsWith("We couldn't see your face clearly") && m.target === 'verify'),
    'A gets a message with the reason and "Try again"');
  check(sql(`select count(*) from push_queue where user_id = '${A}' and event_type = 'admin_message' and title = 'Your verification needs another try';`) === '1',
    'and a notification');

  // A sees why, in My requests, and tries again
  await a.page.getByRole('button', { name: /^Settings/ }).first().click();
  const list = a.page.getByTestId('my-requests');
  check(await appears(list, 10000), 'Settings → My requests');
  const verifyRow = list.getByTestId('my-request').filter({ hasText: 'Verified badge' }).first();
  check(await appears(verifyRow.getByText('Not approved')) && await verifyRow.getByText(/couldn't see your face clearly/).isVisible(),
    'the verification: "Not approved" and why');
  await a.page.screenshot({ path: `${OUT}3-my-requests.png` });
  await verifyRow.getByTestId('my-request-retry').click();
  check(await appears(a.page.getByTestId('verify-reason')), 'Try again opens Get verified with the reason');
  await a.page.getByTestId('verify-modal').getByTestId('verify-selfie-input').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: PNG });
  await a.page.getByTestId('verify-submit').click();
  await a.page.getByTestId('verify-modal').waitFor({ state: 'detached', timeout: 15000 });
  const again = sql(`select id from verification_requests where user_id = '${A}' and status = 'pending';`);
  check(!!again, 'sent again');
  r = await rpc('admin_review_verification', { request_id: again, decision: 'approved', notes: 'Clear match' }, jwtAdmin);
  check(r.status === 204 || r.status === 200, `approved (${r.status})`);
  check(sql(`select is_verified::text || ' ' || verification_status from profiles where id = '${A}';`) === 'true verified', 'A is verified');
  msgs = JSON.parse(messagesTo(A));
  check(msgs.some((m) => m.title === "You're verified"), 'and told so');
  r = await rpc('admin_review_verification', { request_id: again, decision: 'rejected', notes: '', p_reason: 'other' }, jwtAdmin);
  check(r.status >= 400 && /decided already/.test(r.text), "a decided request can't be decided again");

  log('== 4. Reports');
  r = await call('/rest/v1/reports', { method: 'POST', body: JSON.stringify({ reporter_id: A, reported_id: B, reason: 'agent_bureau', details: 'Says they run a bureau' }) }, jwtA);
  check(r.status === 201, `A reports B as an agent or marriage bureau (${r.status})`);
  const alert = sql(`select title from push_queue where user_id = '${ADMIN}' and event_type = 'admin_report' and created_at >= '${started}' order by created_at desc limit 1;`);
  check(alert === '🚩 Report: an agent or marriage bureau', `the team is told: ${alert}`);
  r = await call('/rest/v1/reports', { method: 'POST', body: JSON.stringify({ reporter_id: A, reported_id: B, reason: 'spam', status: 'resolved' }) }, jwtA);
  check(r.status >= 400, `a member can't file a report as resolved (${r.status})`);
  const rep = sql(`select id from reports where reporter_id = '${A}' and reason = 'agent_bureau' order by created_at desc limit 1;`);
  r = await rpc('admin_update_report', { report_id: rep, new_status: 'resolved', notes: 'Warned them; internal note' }, jwtAdmin);
  check(r.status === 204 || r.status === 200, `the team acts on it (${r.status})`);
  r = await call(`/rest/v1/reports?id=eq.${rep}&select=admin_notes`, { method: 'GET' }, jwtA);
  check(r.status >= 400, `A can't read the team's notes (${r.status})`);
  r = await call(`/rest/v1/reports?id=eq.${rep}&select=id,status`, { method: 'GET' }, jwtA);
  check(r.status === 200 && r.json?.[0]?.status === 'resolved', 'but sees where it stands');
  msgs = JSON.parse(messagesTo(A));
  check(msgs.some((m) => m.title === "We've looked into your report" && /acted/.test(m.body) && m.target === 'requests'), 'A gets a message');

  log('== 5. Complaints');
  r = await rpc('submit_grievance', { p_category: 'account', p_name: NAME_A, p_email: EMAIL_A, p_details: 'I cannot change my city (test).' }, jwtA);
  check(r.status === 200 && /^SH24-/.test(r.json?.ticket), `A complains: ${r.json?.ticket}`);
  const ticket = r.json?.ticket;
  const gid = sql(`select id from grievances where ticket = '${ticket}';`);
  r = await rpc('admin_update_grievance', { p_id: gid, p_status: 'resolved', p_resolution: 'Fixed: you can change it in My Profile now.' }, jwtAdmin);
  check(r.status === 204 || r.status === 200, 'the team answers');
  msgs = JSON.parse(messagesTo(A));
  check(msgs.some((m) => m.title === `Your complaint ${ticket} has an answer` && m.target === 'requests'), 'A gets a message');
  const mr = (await rpc('my_requests', {}, jwtA)).json;
  check(mr?.complaints?.[0]?.resolution === 'Fixed: you can change it in My Profile now.' && mr?.reports?.[0]?.outcome === 'acted'
    && mr?.reports?.[0]?.name === NAME_B && !('admin_notes' in (mr?.reports?.[0] ?? {})), 'my_requests: the answer, and "we acted" without the notes');

  // The message opens My requests
  await a.ctx.close();
  sql(`update member_messages set dismissed_at = now() where user_id = '${A}' and created_at < (select max(created_at) from member_messages where user_id = '${A}');`);
  const a2 = await signIn(EMAIL_A);
  const cta = a2.page.getByRole('button', { name: 'Read it' });
  check(await appears(cta, 10000), `the message about ${ticket} shows when A opens the app`);
  await cta.click();
  check(await appears(a2.page.getByTestId('my-requests')), 'its button opens Settings → My requests');
  await a2.page.waitForTimeout(1800);
  const top = (await a2.page.locator('#my-requests').boundingBox())?.y ?? -1;
  check(top >= 0 && top < 300, `scrolled to it (${Math.round(top)}px from the top)`);
  const complaintRow = a2.page.getByTestId('my-request').filter({ hasText: ticket });
  check(await appears(complaintRow.getByText('Answered')) && await complaintRow.getByTestId('my-request-answer').innerText().then((t) => t.includes('Fixed: you can change it')),
    'the complaint: "Answered", with our answer');
  const reportRow = a2.page.getByTestId('my-request').filter({ hasText: `Report about ${NAME_B}` }).first();
  check(await appears(reportRow.getByText('We acted on it')) && !(await reportRow.innerText()).includes('internal note'), 'the report: "We acted on it", no notes');
  await a2.page.screenshot({ path: `${OUT}4-my-requests-answered.png` });

  log('== 6. Share my number');
  sql(`insert into matches (user_a_id, user_b_id) values ('${LO}', '${HI}') on conflict do nothing;`);
  const matchId = sql(`select id from matches where user_a_id = '${LO}' and user_b_id = '${HI}';`);
  r = await call('/rest/v1/messages', { method: 'POST', body: JSON.stringify({ match_id: matchId, sender_id: A, content: '+919999999999', message_type: 'contact' }) }, jwtA);
  check(r.status >= 400, `a number can't be sent as a card another way (${r.status})`);
  r = await rpc('share_my_number', { p_match_id: matchId, p_phone: '12345' }, jwtA);
  check(r.status >= 400 && /doesn't look like/.test(r.text), 'a number that isn\'t one is refused');
  // The new match is celebrated while A has the app open: "Send a Message" opens the chat
  check(await appears(a2.page.getByText("It's a Match!"), 15000), '"It\'s a Match!" for the new match');
  await a2.page.getByRole('button', { name: /Send a Message/ }).click();
  await a2.page.getByPlaceholder(`Message ${NAME_B}…`).waitFor({ timeout: 10000 });
  await a2.page.getByRole('button', { name: 'More options' }).click();
  await a2.page.getByTestId('share-number').click();
  const sheet = a2.page.getByTestId('share-number-modal');
  await sheet.waitFor();
  check(await sheet.getByText(/can't be taken back/).isVisible(), 'the sheet says it can\'t be taken back');
  await sheet.getByTestId('share-number-input').fill('098765 43210');
  await a2.page.screenshot({ path: `${OUT}5-share-number.png` });
  await sheet.getByTestId('share-number-send').click();
  await sheet.waitFor({ state: 'detached', timeout: 10000 });
  check(await appears(a2.page.getByTestId('contact-card').filter({ hasText: '+91 98765 43210' })), 'A sees "You shared your number: +91 98765 43210"');
  check(sql(`select count(*) || ' ' || max(content) from messages where match_id = '${matchId}' and message_type = 'contact';`) === '1 +919876543210', 'one contact message');
  check(sql(`select phone_number from profiles where id = '${A}';`) === '+919876543210', 'remembered for next time');
  r = await rpc('share_my_number', { p_match_id: matchId, p_phone: '+91 98765 43210' }, jwtA);
  check(r.status >= 400 && /already/.test(r.text), 'the same number twice is refused');
  r = await call(`/rest/v1/messages?match_id=eq.${matchId}`, { method: 'PATCH', body: JSON.stringify({ content: '+911111111111' }) }, jwtB);
  check(r.status >= 400 && sql(`select content from messages where match_id = '${matchId}' and message_type = 'contact';`) === '+919876543210',
    `B can't change A's message (${r.status})`);
  r = await rpc('mark_messages_read', { p_match_id: matchId }, jwtB);
  check(r.status === 200 && r.json === 1, 'but can mark it read');

  const b = await signIn(EMAIL_B);
  await b.page.getByRole('button', { name: /^Matches/ }).first().click();
  await b.page.getByRole('button', { name: new RegExp(NAME_A) }).filter({ hasText: 'Shared a phone number' }).first().click();
  const theirCard = b.page.getByTestId('contact-card').filter({ hasText: '+91 98765 43210' });
  check(await appears(theirCard, 10000), `B sees ${NAME_A}'s number`);
  check(await theirCard.getByRole('link', { name: 'Call' }).getAttribute('href') === 'tel:+919876543210', 'Call rings it');
  check(await theirCard.getByRole('link', { name: 'WhatsApp' }).getAttribute('href') === 'https://wa.me/919876543210', 'WhatsApp opens it');
  check(!(await b.page.getByTestId('off-platform-warning').isVisible().catch(() => false)), 'no "moving to WhatsApp" warning on it');
  await b.page.screenshot({ path: `${OUT}6-their-number.png` });
  await b.ctx.close();

  log('== 7. Download my data, and Android');
  const data = (await rpc('export_my_data', {}, jwtA)).json;
  check(Number(data?.export_metadata?.format_version) >= 1.5, `format ${data?.export_metadata?.format_version}`);
  check(['partner_preferences', 'saved_searches', 'hidden_profiles', 'complaints', 'found_my_match_story'].every((k) => k in (data ?? {})),
    'with partner preferences, saved searches, hidden profiles, complaints and an "I found my match" story');
  check(data?.complaints?.some((g) => g.ticket === ticket) && data?.reports_filed?.every((x) => !('admin_notes' in x)),
    "the complaint is in it, and the team's notes on reports aren't");
  const main = fs.readFileSync(`${REPO}/android/app/src/main/java/com/shaadi24/app/MainActivity.java`, 'utf8');
  check(/setFlags\(WindowManager\.LayoutParams\.FLAG_SECURE/.test(main), 'the Android app blocks screenshots');
  await admin.ctx.close();
  await a2.ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  try { cleanup(); } catch (e) { log('cleanup:', e.message.split('\n')[0]); }
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
