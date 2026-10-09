// Admin → Moderation and Scam alerts, end to end:
//   1. A member writes About me with a phone number and adds a photo: My Profile says they wait for
//      approval; other members still see the old text and not the photo; the admins are alerted
//   2. Moderation lists both (the text flagged for its phone number), fingerprints the photo; the
//      text is "Not approved" with a reason (it goes back, the member is told) and the photo approved
//      (others see it)
//   3. The member sees why in the app, and nothing waits any more
//   4. "Approve before others see it" off: a change shows at once and still waits in the queue;
//      back on; Select all + Approve
//   5. Scam alerts: "Check every photo" finds the same photo on two accounts; money talk in a chat;
//      "Reviewed" moves an alert away; "Open" opens the member; a member blocked by three others shows
//      "Blocked by several members" with a reason, and their timeline gives each block's reason
//   6. Members can't use any of it
// Usage: node admin-safety.mjs <admin email> <member email> <other member email>
// (SERVICE_ROLE_KEY for the storage upload and clean-up)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const [ADMIN, MEMBER, OTHER] = process.argv.slice(2);
if (!ADMIN || !MEMBER || !OTHER || !SERVICE) {
  console.error('usage: SERVICE_ROLE_KEY=… node admin-safety.mjs <admin email> <member email> <other member email>');
  process.exit(2);
}
const OUT = new URL('./.shots/admin-safety/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); }
  return false;
};

// ---- A real photo: a 64 × 64 PNG with a pattern ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(seed) {
  const w = 64, h = 64;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) row.push((x * 4 + seed) % 256, (y * 4 * seed) % 256, ((x ^ y) * 8 + seed * 3) % 256);
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = `${OUT}photo-a.png`;
fs.writeFileSync(PHOTO, png(7));

const a = sql(`select id from profiles where email = '${MEMBER}';`);
const b = sql(`select id from profiles where email = '${OTHER}';`);
const saved = JSON.parse(sql(`select json_build_object('a', (select json_build_object('d', description, 'p', photo_urls) from profiles where id = '${a}'),
  'b', (select json_build_object('d', description, 'p', photo_urls) from profiles where id = '${b}'));`));
const OLD_BIO = 'I teach mathematics and love long walks with my family on Sundays.';
const NEW_BIO = 'Call me on 98765 43210. I teach maths, cook on weekends and want a kind partner.';
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (v) => (v == null ? 'null' : `array[${v.map(lit).join(',') || ''}]::text[]`);
const pair = `least('${a}'::uuid, '${b}'::uuid), greatest('${a}'::uuid, '${b}'::uuid)`;
const hadMatch = sql(`select count(*) from matches where user_a_id = least('${a}'::uuid, '${b}'::uuid) and user_b_id = greatest('${a}'::uuid, '${b}'::uuid);`) !== '0';
const STARTED = sql('select now();');
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
let otherPhotoPath = null;
let blockers = [];

const reset = () => sql(`
  delete from moderation_items where user_id in ('${a}', '${b}');
  delete from photo_fingerprints where user_id in ('${a}', '${b}');
  delete from risk_reviews where user_id in ('${a}', '${b}');
  update member_messages mm set dismissed_at = now() from admin_messages m
   where m.id = mm.message_id and m.kind = 'moderation' and mm.user_id in ('${a}', '${b}') and mm.dismissed_at is null;
  update app_settings set review_before_showing = true;`);
reset();
// Only this test's photos and text wait in the queue (other tests' new members add theirs)
sql(`update moderation_items set status = 'approved', reviewed_at = now() where status = 'pending';`);
sql(`insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;
  update profiles set description = ${lit(OLD_BIO)}, gender = 'Female', interested_in = 'Men', is_paused = false, ${CONSENTED} where id = '${a}';
  update profiles set gender = 'Male', interested_in = 'Women', is_paused = false, ${CONSENTED} where id = '${b}';
  delete from blocks where (blocker_id = '${a}' and blocked_id = '${b}') or (blocker_id = '${b}' and blocked_id = '${a}');`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
};
const signIn = async (page, email) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')), null, { timeout: 20000 });
};
const tokenOf = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return JSON.parse(localStorage.getItem(key)).access_token;
});
const seenByB = () => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('d', c->>'description', 'p', c->'photo_urls')), '[]') from jsonb_array_elements(search_candidates('${b}', array['${a}'::uuid])) c;`))[0];
const openAdmin = async (page, section) => {
  await page.getByText('Admin', { exact: true }).first().click();
  const sidebar = page.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  await sidebar.getByRole('button', { name: new RegExp(`^${section}`) }).click();
  return sidebar;
};

const member = await newPage();
const admin = await newPage();
try {
  // ---- 1. The member changes their profile ---------------------------------------------------
  log('1. A member writes About me and adds a photo');
  await signIn(member, MEMBER);
  await member.getByText('My Profile', { exact: true }).first().click();
  const about = member.getByTestId('about-me');
  await about.waitFor({ timeout: 20000 });
  await about.getByText(OLD_BIO).click();
  await about.getByLabel('About me').fill(NEW_BIO);
  await about.getByRole('button', { name: 'Save' }).click();
  await member.getByText('About me saved').waitFor({ timeout: 15000 });
  const photosBefore = (saved.a.p ?? []).length;
  await member.locator('label:has-text("Add Photo") input[type=file]').setInputFiles(PHOTO);
  check(await until(() => Number(sql(`select coalesce(cardinality(photo_urls), 0) from profiles where id = '${a}';`)) === photosBefore + 1), 'the photo is added');
  const banner = member.getByTestId('under-review');
  check(await banner.waitFor({ timeout: 15000 }).then(() => true, () => false), 'My Profile says what waits for approval');
  check(await until(async () => /1 photo, About me/.test(await banner.innerText())), `…the photo and About me (${(await banner.innerText()).slice(0, 80)})`);
  check(await member.getByTestId('photo-under-review').waitFor({ timeout: 10000 }).then(() => true, () => false), 'the new photo says "Under review"');
  await member.screenshot({ path: `${OUT}1-member.png` });
  const newPhoto = sql(`select photo_urls[cardinality(photo_urls)] from profiles where id = '${a}';`);
  const items = sql(`select string_agg(field || ':' || array_to_string(flags, '/'), ' ' order by field) from moderation_items where user_id = '${a}' and status = 'pending';`);
  check(items === 'description:phone number photo:' || items === 'description:phone number photo:first photo', `both wait, the text flagged for its phone number (${items})`);
  const seen = seenByB();
  check(seen.d === OLD_BIO, 'another member still reads the old About me');
  check(!JSON.stringify(seen.p).includes(newPhoto), "…and doesn't see the new photo");
  // (at most one alert in half an hour)
  check(sql(`select count(*) from push_queue where event_type = 'admin_moderation' and created_at > now() - interval '30 minutes';`) !== '0', 'the admins are alerted');

  // ---- 2. The admin decides ----------------------------------------------------------------------
  log('2. Moderation');
  await signIn(admin, ADMIN);
  const sidebar = await openAdmin(admin, 'Moderation');
  check(await until(async () => /Moderation\s*2/.test(await sidebar.getByRole('button', { name: /^Moderation/ }).innerText())), 'the sidebar counts 2 waiting');
  const queue = admin.getByTestId('admin-moderation');
  await queue.getByTestId('moderation-item').first().waitFor({ timeout: 15000 });
  const textCard = queue.locator('[data-testid="moderation-item"][data-field="description"]');
  const photoCard = queue.locator('[data-testid="moderation-item"][data-field="photo"]');
  check(await textCard.getByText(NEW_BIO).isVisible() && await textCard.getByText(OLD_BIO).isVisible(), 'the text card shows the new text and what it was before');
  check(await textCard.getByText('Has phone number').isVisible(), '…flagged "Has phone number"');
  check(await photoCard.locator('img').isVisible(), 'the photo card shows the photo');
  check(await until(() => sql(`select count(*) from photo_fingerprints where url = '${newPhoto}';`) === '1'), 'the photo is fingerprinted in the browser');
  await admin.screenshot({ path: `${OUT}2-queue.png`, fullPage: true });

  await textCard.getByRole('button', { name: 'Not approved' }).click();
  const dialog = admin.getByTestId('reject-dialog');
  await dialog.getByText(/Contact details/).click();
  await dialog.getByRole('button', { name: 'Not approved' }).click();
  await admin.getByText(/not approved; the member was told why/).waitFor({ timeout: 15000 });
  check(sql(`select description from profiles where id = '${a}';`) === OLD_BIO, 'not approved: About me goes back to what it was');
  check(sql(`select count(*) from admin_messages m join member_messages mm on mm.message_id = m.id where mm.user_id = '${a}' and m.kind = 'moderation' and m.created_at >= '${STARTED}' and m.body like 'Contact details%';`) === '1', '…and the member gets the reason');

  await queue.locator('[data-testid="moderation-item"][data-field="photo"]').getByRole('button', { name: 'Approve', exact: true }).click();
  await admin.getByText('Approved 1').waitFor({ timeout: 15000 });
  check(JSON.stringify(seenByB().p).includes(newPhoto), 'approved: other members see the photo');
  check(await queue.getByTestId('moderation-empty').waitFor({ timeout: 10000 }).then(() => true, () => false), 'nothing waits now');
  await queue.getByRole('button', { name: 'Not approved' }).first().click();
  check(await queue.getByText(/Not approved: “Contact details/).first().waitFor({ timeout: 10000 }).then(() => true, () => false), '"Not approved" lists it, with the reason and who');
  check(sql(`select count(*) from admin_audit where action in ('approve_content', 'reject_content') and created_at >= '${STARTED}';`) === '2', 'both decisions are in the audit log');

  // ---- 3. The member hears why ---------------------------------------------------------------------
  log('3. The member is told');
  await member.reload();
  const card = member.getByTestId('member-message');
  check(await card.waitFor({ timeout: 15000 }).then(() => true, () => false), 'a message card shows in the app');
  check((await card.innerText()).includes('wasn\'t approved') && (await card.innerText()).includes('Contact details'), `…saying why (${(await card.innerText()).replace(/\s+/g, ' ').slice(0, 90)})`);
  await card.getByRole('button', { name: 'Open My Profile' }).click();
  await member.getByTestId('about-me').waitFor({ timeout: 15000 });
  check(!(await member.getByTestId('under-review').isVisible()), 'nothing waits for approval any more');

  // ---- 4. Show first, review after ----------------------------------------------------------------
  log('4. "Approve before others see it" off and on');
  await queue.getByRole('button', { name: /^Waiting/ }).click();
  const toggle = queue.getByTestId('review-before-showing');
  await toggle.click();
  check(await until(() => sql('select review_before_showing from app_settings;') === 'f'), 'switched off');
  const memberToken = await tokenOf(member);
  const shownAtOnce = 'I love cricket, cooking with my mother and travelling across Kerala.';
  await fetch(`${API}/rest/v1/profiles?id=eq.${a}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: shownAtOnce }) });
  check(seenByB().d === shownAtOnce, 'a change shows to others at once');
  await admin.reload();
  await openAdmin(admin, 'Moderation');
  await queue.getByTestId('moderation-item').first().waitFor({ timeout: 15000 });
  check(await queue.getByText(shownAtOnce).isVisible(), '…and still waits here to be reviewed');
  await queue.getByTestId('review-before-showing').click();
  check(await until(() => sql('select review_before_showing from app_settings;') === 't'), 'switched back on');
  await queue.getByLabel('Select all').check();
  await queue.getByRole('button', { name: /^Approve 1/ }).click();
  await admin.getByText('Approved 1').waitFor({ timeout: 15000 });
  check(sql(`select count(*) from moderation_items where user_id = '${a}' and status = 'pending';`) === '0', 'Select all + Approve clears the queue');

  // ---- 5. Scam alerts ---------------------------------------------------------------------------
  log('5. Scam alerts');
  // The other member has the same photo (put there by the server: no approval needed)
  otherPhotoPath = `${b}/same_${Date.now()}.png`;
  const up = await fetch(`${API}/storage/v1/object/photos/${otherPhotoPath}`, { method: 'POST', headers: { ...svc, 'Content-Type': 'image/png' }, body: fs.readFileSync(PHOTO) });
  check(up.ok, 'the same photo uploaded for the other member');
  sql(`update profiles set photo_urls = coalesce(photo_urls, '{}') || '${API}/storage/v1/object/public/photos/${otherPhotoPath}'::text where id = '${b}';`);
  if (!hadMatch) sql(`insert into matches (user_a_id, user_b_id) values (${pair});`);
  sql(`insert into messages (match_id, sender_id, content)
       select id, '${a}', 'Test: my visa is stuck at the airport, please send money by PhonePe today'
         from matches where user_a_id = least('${a}'::uuid, '${b}'::uuid) and user_b_id = greatest('${a}'::uuid, '${b}'::uuid);`);
  // The seeded test profiles' photos are on other sites (picsum.photos, randomuser.me), which this
  // browser may not reach: count them as checked, so "Check every photo" checks our storage's
  sql(`insert into photo_fingerprints (url, user_id, hash)
       select distinct on (u) u, p.id, null from profiles p, unnest(p.photo_urls) u where u not like '${API}/%'
       on conflict (url) do nothing;`);
  await openAdmin(admin, 'Scam alerts');
  const risk = admin.getByTestId('admin-risk');
  await risk.waitFor({ timeout: 15000 });
  await risk.getByRole('button', { name: 'Check every photo' }).click();
  await admin.getByText(/Checked \d+ photo|Every photo is checked/).waitFor({ timeout: 60000 });
  const samePhoto = risk.locator('[data-testid="risk-alert"][data-signal="same_photo"]');
  check(await samePhoto.first().waitFor({ timeout: 15000 }).then(() => true, () => false), '"Same photo as another account" shows');
  check(await samePhoto.count() >= 2, 'for both accounts');
  const money = risk.locator('[data-testid="risk-alert"][data-signal="money_talk"]', { hasText: 'visa is stuck' });
  check(await money.isVisible(), '"Money talk in chats" shows, quoting the message');
  await admin.screenshot({ path: `${OUT}3-alerts.png`, fullPage: true });
  await money.getByRole('button', { name: 'Reviewed' }).click();
  await admin.getByText('Marked reviewed').waitFor({ timeout: 10000 });
  const moneyAlert = risk.locator('[data-testid="risk-alert"][data-signal="money_talk"]', { hasText: 'visa is stuck' });
  check(await moneyAlert.waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false), '"Reviewed" moves it away');
  await risk.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Reviewed/ }).click();
  check(await moneyAlert.waitFor({ timeout: 10000 }).then(() => true, () => false), '…to Reviewed');
  await risk.getByRole('button', { name: /^To look at/ }).click();
  await samePhoto.first().getByRole('button', { name: 'Open' }).click();
  check(await admin.getByTestId('member-panel').waitFor({ timeout: 10000 }).then(() => true, () => false), '"Open" opens the member');
  await admin.getByTestId('member-panel').getByRole('button', { name: 'Close' }).click();

  // Blocked by three members
  blockers = sql(`select id from profiles where id not in ('${a}', '${b}') and onboarding_complete
                    and not exists (select 1 from blocks x where x.blocker_id = profiles.id and x.blocked_id = '${a}')
                  order by account_created limit 3;`).split('\n').filter(Boolean);
  check(blockers.length === 3, 'three members to block the first one');
  sql(blockers.map((id, i) => `insert into blocks (blocker_id, blocked_id, reason) values ('${id}', '${a}', ${i === 2 ? "'Test block: asked for my bank details'" : 'null'});`).join('\n'));
  // Away and back, so the alerts are read again
  const adminNav = admin.getByTestId('admin-sidebar');
  await adminNav.getByRole('button', { name: /^Moderation/ }).click();
  await adminNav.getByRole('button', { name: /^Scam alerts/ }).click();
  await risk.waitFor({ timeout: 15000 });
  const blockedAlert = risk.locator('[data-testid="risk-alert"][data-signal="many_blocks"]', { hasText: 'asked for my bank details' });
  check(await blockedAlert.waitFor({ timeout: 15000 }).then(() => true, () => false), '"Blocked by several members" shows, with the latest reason');
  check(/Blocked by 3 members/.test(await blockedAlert.innerText().catch(() => '')), '…and how many');
  await blockedAlert.getByRole('button', { name: 'Open' }).click();
  const panel = admin.getByTestId('member-panel');
  await panel.getByRole('tab', { name: 'Timeline' }).click();
  const blockEvent = panel.getByTestId('timeline-event').filter({ hasText: 'asked for my bank details' });
  check(await blockEvent.first().waitFor({ timeout: 10000 }).then(() => true, () => false), 'the timeline gives the reason for the block');
  check(/Blocked by /.test(await blockEvent.first().innerText().catch(() => '')), '…as "Blocked by <name>"');
  await admin.screenshot({ path: `${OUT}4-blocked.png`, fullPage: true });
  await panel.getByRole('button', { name: 'Close' }).click();

  // ---- 6. Members can't -----------------------------------------------------------------------
  log('6. Only admins');
  const as = { apikey: ANON, Authorization: `Bearer ${memberToken}`, 'Content-Type': 'application/json' };
  for (const fn of ['admin_moderation_queue', 'admin_risk_signals', 'admin_sidebar_counts', 'admin_photos_to_fingerprint']) {
    const res = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: as, body: '{}' });
    check(!res.ok, `a member can't call ${fn} (${res.status})`);
  }
  const mod = await fetch(`${API}/rest/v1/rpc/admin_moderate`, { method: 'POST', headers: as, body: JSON.stringify({ p_ids: [], p_approve: true }) });
  check(!mod.ok, `…or approve anything (${mod.status})`);
  const direct = await fetch(`${API}/rest/v1/moderation_items?select=id`, { headers: as });
  check(!direct.ok || (await direct.json()).length === 0, "…or read the queue's table");
  const mine = await fetch(`${API}/rest/v1/rpc/my_review_status`, { method: 'POST', headers: as, body: '{}' });
  check(mine.ok, 'a member can read what of theirs waits');
} catch (e) {
  failures++;
  console.error(e);
  await admin.screenshot({ path: `${OUT}error-admin.png`, fullPage: true }).catch(() => {});
  await member.screenshot({ path: `${OUT}error-member.png`, fullPage: true }).catch(() => {});
} finally {
  // Put both members back
  sql(`update profiles set description = ${lit(saved.a.d)}, photo_urls = ${arr(saved.a.p)} where id = '${a}';
       update profiles set description = ${lit(saved.b.d)}, photo_urls = ${arr(saved.b.p)} where id = '${b}';
       delete from messages where content like 'Test: my visa is stuck%';
       ${blockers.length ? `delete from blocks where blocked_id = '${a}' and blocker_id in (${blockers.map((id) => `'${id}'`).join(', ')});` : ''}
       delete from risk_reviews where user_id = '${a}' and signal = 'many_blocks';
       ${hadMatch ? '' : `delete from matches where user_a_id = least('${a}'::uuid, '${b}'::uuid) and user_b_id = greatest('${a}'::uuid, '${b}'::uuid);`}`);
  reset();
  if (otherPhotoPath) await fetch(`${API}/storage/v1/object/photos`, { method: 'DELETE', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [otherPhotoPath] }) }).catch(() => {});
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
