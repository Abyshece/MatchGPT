// Admin → Team (roles, two-step sign-in) and Automatic messages, end to end:
//   1. Roles: an owner adds a member as Content; they see only Content's sections, and the
//      database refuses them the rest (admin_customers: Forbidden). Made Support, they see
//      Customers and not Blog. Admin alerts go only to admins whose role covers the section.
//   2. Automatic messages: one is reworded, turned off (and "Send now" with it), on again, and
//      sent now; the member it was due for sees it in the app, and isn't due another that day
//   3. Two-step sign-in: the owner sets it up (a code worked out from the key, like an
//      authenticator app) and requires it. A Support admin without it is refused by the
//      database and asked to set it up before the panel opens; signing in again asks for the
//      code first. An owner resets another admin's (lost phone: signed out too), stops
//      requiring it and turns their own off; removes the admin. Every change is in the audit log.
//   Team, the set-up and the code screens pass axe-core (no serious or critical problems).
// Usage: node admin-team.mjs <owner email> <second account> <member email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const [OWNER, STAFF, MEMBER] = process.argv.slice(2);
if (!OWNER || !STAFF || !MEMBER) { console.error('usage: node admin-team.mjs <owner email> <second account> <member email>'); process.exit(2); }
const OUT = new URL('./.shots/admin-team/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (loc, ms = 15000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const accessible = async (page, name) => {
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  const { violations } = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  }));
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  check(!bad.length, `${name}: accessible${bad.length ? ` (${bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`).join('; ')})` : ''}`);
};

// ---- An authenticator app: the 6-digit code for a key, a new one each 30 seconds (RFC 6238) ----
const base32 = (s) => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...s.replace(/=+$/, '').toUpperCase()].map((c) => abc.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
};
const usedStep = new Map();
const code = async (secret) => {
  // A code once used isn't taken again: wait for the next one
  while (Math.floor(Date.now() / 30000) <= (usedStep.get(secret) ?? -1)) await new Promise((r) => setTimeout(r, 1000));
  const step = Math.floor(Date.now() / 30000);
  usedStep.set(secret, step);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};

const ids = Object.fromEntries([OWNER, STAFF, MEMBER].map((e) => [e, sql(`select id from profiles where email = '${e}';`)]));
const TITLE = 'Testcase: we have missed you';
const originalTitle = sql(`select title from automations where id = 'inactive_30';`);
const cleanup = () => sql(`
  delete from auth.mfa_factors where user_id in ('${ids[OWNER]}', '${ids[STAFF]}');
  update app_settings set require_admin_two_step = false where id;
  delete from admin_emails where lower(email) = lower('${STAFF}');
  update admin_emails set role = 'owner' where lower(email) = lower('${OWNER}');
  update automations set title = $t$${originalTitle}$t$, enabled = true where id = 'inactive_30';
  delete from push_queue where event_type = 'testcase_alert';
  delete from admin_messages where title = $t$${TITLE}$t$;`);
cleanup();
sql(`insert into admin_emails (email) values ('${OWNER}') on conflict do nothing;
  update profiles set ${CONSENTED} where email in ('${OWNER}', '${STAFF}', '${MEMBER}');
  update member_messages set dismissed_at = now() where user_id = '${ids[MEMBER]}' and dismissed_at is null;
  delete from automation_sends where user_id = '${ids[MEMBER]}';
  update profiles set last_active_at = now() - interval '31 days', is_paused = false where id = '${ids[MEMBER]}';`);

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
const openAdmin = async (page) => {
  await page.getByText('Admin', { exact: true }).first().click({ timeout: 20000 });
};
// An admin function, called as the signed-in person (their access token, as the app does)
const rpc = (page, fn, args = {}) => page.evaluate(async ([api, anon, fn, args]) => {
  const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
  const token = JSON.parse(localStorage.getItem(key)).access_token;
  const r = await fetch(`${api}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  return { status: r.status, body: await r.text() };
}, [API, ANON, fn, args]);
const sections = async (page) => (await page.getByTestId('admin-sidebar').getByRole('button').allInnerTexts()).map((t) => t.replace(/\s*\d+$/, '').trim());

const owner = await newPage();
const staff = await newPage();
try {
  await signIn(owner, OWNER);
  await openAdmin(owner);
  const sidebar = owner.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  const open = (page, name) => page.getByTestId('admin-sidebar').getByRole('button', { name: new RegExp(`^${name}`) }).click();

  // ---- 1. Roles ------------------------------------------------------------------------------
  log('1. Roles');
  check((await sections(owner)).includes('Team'), 'an owner has Team');
  await open(owner, 'Team');
  const team = owner.getByTestId('admin-team');
  await team.waitFor({ timeout: 15000 });
  check(await team.getByTestId('team-member').filter({ hasText: '(you)' }).count() === 1, 'the team lists the owner, marked as them');
  await accessible(owner, 'Team');
  await team.getByLabel('Their email (the one they sign in with)').fill(STAFF);
  await team.getByLabel('Role', { exact: true }).selectOption('content');
  await team.getByRole('button', { name: 'Add', exact: true }).click();
  const staffRow = team.locator(`[data-testid=team-member][data-email="${STAFF.toLowerCase()}"]`);
  check(await appears(staffRow), 'added to the team');
  check(await staffRow.getByRole('combobox').inputValue() === 'content', 'as Content');
  check(sql(`select role from admin_emails where lower(email) = lower('${STAFF}');`) === 'content', 'saved as Content');
  await owner.screenshot({ path: `${OUT}team.png` });

  await signIn(staff, STAFF);
  await openAdmin(staff);
  await staff.getByTestId('admin-sidebar').waitFor({ timeout: 20000 });
  let seen = await sections(staff);
  check(['Overview', 'Profiles', 'Messages', 'Automatic messages', 'Offers', 'Blog', 'Success stories', 'Growth', 'Search insights'].every((s) => seen.includes(s)),
    `Content sees its sections (${seen.join(', ')})`);
  check(!['Customers', 'Verification', 'Moderation', 'Reports', 'Finance', 'Audit log', 'Team'].some((s) => seen.includes(s)), 'and not the others');
  check(await staff.getByTestId('admin-role').innerText().then((t) => t.includes('Content')), 'the sidebar says Content');
  check(!(await staff.getByRole('switch', { name: /Shaadi24\+ for everyone/ }).count()), "no Shaadi24+ for everyone switch (owners')");
  let res = await rpc(staff, 'admin_customers');
  check(res.status >= 400 && res.body.includes('Forbidden'), `the database refuses Content the customers (${res.status})`);
  res = await rpc(staff, 'admin_team');
  check(res.status >= 400 && res.body.includes('Forbidden'), 'and the team');
  res = await rpc(staff, 'admin_automations');
  check(res.status === 200, 'and lets them have automatic messages');
  res = await rpc(staff, 'admin_set_pro_for_all', { p_on: true });
  check(res.body.includes('Forbidden'), 'and Shaadi24+ for everyone (owners only)');

  await staffRow.getByRole('combobox').selectOption('support');
  check(await appears(owner.getByText(/is a support now/)), 'made Support');
  await staff.reload();
  await openAdmin(staff);
  await staff.getByTestId('admin-sidebar').waitFor({ timeout: 20000 });
  seen = await sections(staff);
  check(seen.includes('Customers') && seen.includes('Complaints') && !seen.includes('Blog') && !seen.includes('Automatic messages'),
    `Support sees Customers and not Blog (${seen.join(', ')})`);
  res = await rpc(staff, 'admin_customers');
  check(res.status === 200, 'and the database lets them have the customers');

  // Admin alerts by role: one for Finance reaches the owner and not Support; one for Reports both
  sql(`select notify_admins('testcase_alert', 'Finance thing', '-', '{"admin_tab": "finance"}');
       select notify_admins('testcase_alert', 'Reports thing', '-', '{"admin_tab": "reports"}');`);
  const got = (who, title) => sql(`select count(*) from push_queue where event_type = 'testcase_alert' and user_id = '${ids[who]}' and title = '${title}';`);
  check(got(OWNER, 'Finance thing') === '1' && got(STAFF, 'Finance thing') === '0', 'a finance alert goes to the owner, not to Support');
  check(got(OWNER, 'Reports thing') === '1' && got(STAFF, 'Reports thing') === '1', 'a reports alert to both');

  // ---- 2. Automatic messages --------------------------------------------------------------------
  log('2. Automatic messages');
  await open(owner, 'Automatic messages');
  const auto = owner.locator('[data-testid=automation][data-id=inactive_30]');
  await auto.waitFor({ timeout: 15000 });
  const due = parseInt(await auto.getByTestId('automation-stats').innerText(), 10);
  check(due >= 1, `"Not seen for a month" is due for ${due}, the member among them`);
  await auto.getByRole('button', { name: /^Edit/ }).click();
  const editor = owner.getByTestId('automation-editor');
  await editor.getByLabel('Title').fill(TITLE);
  check(await editor.getByText(TITLE).count() > 0, 'the preview shows the new title');
  await editor.getByRole('button', { name: 'Save' }).click();
  check(await appears(auto.getByText(TITLE)), 'reworded');
  const toggle = auto.getByRole('switch');
  await toggle.click();
  check(await owner.waitForFunction(() => document.querySelector('[data-id=inactive_30] [role=switch]')?.getAttribute('aria-checked') === 'false', null, { timeout: 10000 }).then(() => true, () => false), 'turned off');
  check(await auto.getByRole('button', { name: /^Send now/ }).isDisabled(), '"Send now" is off with it');
  res = await rpc(owner, 'admin_run_automation', { p_id: 'inactive_30' });
  check(res.body.includes('Turn it on first'), 'and the database won\'t send one that\'s off');
  await toggle.click();
  check(await owner.waitForFunction(() => document.querySelector('[data-id=inactive_30] [role=switch]')?.getAttribute('aria-checked') === 'true', null, { timeout: 10000 }).then(() => true, () => false), 'on again');
  await auto.getByRole('button', { name: /^Send now/ }).click();
  check(await appears(owner.getByText(/Sent to \d+ members?/)), 'sent now');
  check(sql(`select count(*) from member_messages mm join admin_messages m on m.id = mm.message_id where mm.user_id = '${ids[MEMBER]}' and m.title = '${TITLE.replace(/'/g, "''")}';`) === '1',
    'the member got it');
  check(sql(`select count(*) from automations a, automation_audience(a.id) x where x.user_id = '${ids[MEMBER]}';`) === '0', "and isn't due another automatic message today");
  check(await appears(auto.getByTestId('automation-stats').getByText(/\b0 due now/)), 'none due now');
  await owner.screenshot({ path: `${OUT}automations.png` });

  const member = await newPage();
  await signIn(member, MEMBER);
  const card = member.getByTestId('member-message');
  check(await appears(card, 20000) && (await card.innerText()).includes(TITLE), 'the member sees it in the app');
  await member.context().close();

  // ---- 3. Two-step sign-in ----------------------------------------------------------------------
  log('3. Two-step sign-in');
  await open(owner, 'Team');
  await team.waitFor({ timeout: 15000 });
  const ownCard = team.getByTestId('two-step-card');
  await ownCard.getByRole('button', { name: 'Set up' }).click();
  const secret = (await ownCard.getByTestId('two-step-secret').innerText({ timeout: 15000 })).trim();
  check(/^[A-Z2-7]{16,}$/.test(secret), 'a key (and its QR code) to add to the app');
  await accessible(owner, 'setting up two-step sign-in');
  await ownCard.getByLabel('The 6-digit code from the app').fill('000000');
  await ownCard.getByRole('button', { name: 'Confirm' }).click();
  check(await appears(owner.getByText(/didn't work/)), 'a wrong code is refused');
  await ownCard.getByLabel('The 6-digit code from the app').fill(await code(secret));
  await ownCard.getByRole('button', { name: 'Confirm' }).click();
  check(await appears(ownCard.getByText(/^On:/)), 'on for the owner');
  check(sql(`select count(*) from auth.mfa_factors where user_id = '${ids[OWNER]}' and status = 'verified';`) === '1', 'their authenticator is saved');

  const requireSwitch = team.getByRole('switch', { name: /Require two-step sign-in/ });
  await requireSwitch.click();
  check(await owner.waitForFunction(() => document.querySelector('[aria-labelledby=require-two-step-label]')?.getAttribute('aria-checked') === 'true', null, { timeout: 10000 }).then(() => true, () => false), 'required for every admin now');
  check(sql(`select require_admin_two_step from app_settings limit 1;`) === 't', 'saved');
  check((await rpc(owner, 'admin_team')).status === 200, 'the owner, signed in with it, carries on');

  // Support, without it: refused, and asked to set it up
  res = await rpc(staff, 'admin_customers');
  check(res.status >= 400 && res.body.includes('Forbidden'), 'the database refuses an admin without it');
  await staff.reload();
  await openAdmin(staff);
  const gate = staff.getByTestId('two-step-gate');
  check(await appears(gate, 20000), 'the admin panel asks them to set it up first');
  check(!(await staff.getByTestId('admin-sidebar').count()), 'nothing of the panel shows');
  const staffSecret = (await gate.getByTestId('two-step-secret').innerText({ timeout: 15000 })).trim();
  await accessible(staff, 'the set-up before the panel');
  await gate.getByLabel('The 6-digit code from the app').fill(await code(staffSecret));
  await gate.getByRole('button', { name: 'Confirm' }).click();
  check(await appears(staff.getByTestId('admin-sidebar'), 20000), 'set up: the panel opens');
  check((await rpc(staff, 'admin_customers')).status === 200, 'and the database lets them in');

  // Signing in again: the code first
  const owner2 = await newPage();
  await signIn(owner2, OWNER);
  await openAdmin(owner2);
  const gate2 = owner2.getByTestId('two-step-gate');
  check(await appears(gate2.getByText(/Enter the 6-digit code/), 20000), 'signing in again asks for the code');
  await accessible(owner2, 'the code before the panel');
  res = await rpc(owner2, 'admin_platform_stats');
  check(res.status >= 400 && res.body.includes('Forbidden'), 'and without it the database refuses even the owner');
  await gate2.getByLabel('The 6-digit code from your authenticator app').fill(await code(secret));
  await gate2.getByRole('button', { name: 'Confirm' }).click();
  check(await appears(owner2.getByTestId('admin-sidebar'), 20000), 'with it the panel opens');
  await owner2.screenshot({ path: `${OUT}after-code.png` });
  await owner2.context().close();

  // Lost phone: an owner resets it (and signs them out)
  await owner.reload();
  await openAdmin(owner);
  await open(owner, 'Team');
  await team.waitFor({ timeout: 15000 });
  check(await appears(staffRow.getByText('On', { exact: true })), "the team shows Support's two-step sign-in on");
  await staffRow.getByRole('button', { name: /^Reset/ }).click();
  check(await appears(owner.getByText(/Reset and signed out/)), 'reset');
  check(sql(`select count(*) from auth.mfa_factors where user_id = '${ids[STAFF]}';`) === '0', 'their authenticator is gone');
  check(sql(`select count(*) from auth.sessions where user_id = '${ids[STAFF]}';`) === '0', 'and they are signed out everywhere');

  await requireSwitch.click();
  check(await owner.waitForFunction(() => document.querySelector('[aria-labelledby=require-two-step-label]')?.getAttribute('aria-checked') === 'false', null, { timeout: 10000 }).then(() => true, () => false), 'no longer required');
  await ownCard.getByRole('button', { name: 'Turn off' }).click();
  check(await appears(ownCard.getByText(/^Off\./)), 'the owner turned theirs off');
  check(sql(`select count(*) from auth.mfa_factors where user_id = '${ids[OWNER]}';`) === '0', 'gone from the database');

  await staffRow.getByRole('button', { name: /^Remove/ }).click();
  check(await appears(owner.getByText(/isn't an admin any more/)), 'removed from the team');
  check(await staffRow.waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false) && sql(`select count(*) from admin_emails where lower(email) = lower('${STAFF}');`) === '0', 'and off the list');
  res = await rpc(owner, 'admin_team_remove', { p_email: OWNER });
  check(res.body.includes("can't remove yourself"), "an owner can't remove themselves");

  // ---- The audit log ------------------------------------------------------------------------------
  const actions = sql(`select string_agg(distinct action, ',') from admin_audit where created_at > now() - interval '30 minutes'
    and action in ('add_admin', 'change_admin_role', 'set_require_two_step', 'reset_admin_two_step', 'remove_admin', 'save_automation', 'run_automation');`);
  check(actions.split(',').length === 7, `every change is in the audit log (${actions})`);
  await open(owner, 'Audit log');
  check(await appears(owner.getByTestId('audit-log').getByText(`added ${STAFF.toLowerCase()} as content`).first()), 'which says who was added, as what');
} catch (e) {
  failures++;
  log('ERROR', e.message);
  await owner.screenshot({ path: `${OUT}error-owner.png` }).catch(() => {});
  await staff.screenshot({ path: `${OUT}error-staff.png` }).catch(() => {});
} finally {
  cleanup();
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
