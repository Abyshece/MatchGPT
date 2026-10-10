// ============================================================================
// Guards against fake and repeat accounts, and the chat scam warning
// (20261010090000_account_guards.sql, lib/deviceId.ts, lib/scamWarning.ts)
//
//   1. A throwaway address (YOPmail, a Mailinator subdomain) can't sign up:
//      the server refuses it, and the app's sign-up form says why
//   2. One mailbox, one account: a second account on the same Gmail (dots,
//      +tag) is created but can't search; the first one can
//   3. One phone, at most 3 accounts with free searches: the 4th account on a
//      phone is refused, in the app too (with Shaadi24+ offered); a
//      Shaadi24+ account on the same phone can search
//   4. Admin → Scam alerts: "Second account on the same mailbox", "Several
//      accounts on one phone"
//   5. A chat message asking for money shows a safety note with Report
//
// Usage: node account-guards.mjs <admin email> <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [ADMIN, EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!ADMIN || !EMAIL_A || !EMAIL_B) { console.error('usage: node account-guards.mjs <admin email> <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/account-guards/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const PASSWORD = 'TestPass!2026';
const STAMP = Date.now();
const PHONE = `android:guard-test-phone-${STAMP}`;

const signUp = async (email) => {
  const r = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const search = async (jwt, device) => {
  const r = await fetch(`${API}/functions/v1/search`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'search', prompt: 'a doctor in Pune', filters: {}, limit: 5, device, platform: 'android' }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const rpc = async (fn, args, jwt) => {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt || ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return r.json().catch(() => null);
};
const newAccount = async (email) => {
  const r = await signUp(email);
  if (!r.body?.access_token) throw new Error(`sign-up failed for ${email}: ${JSON.stringify(r.body)}`);
  return { id: r.body.user.id, jwt: r.body.access_token };
};

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const nameB = sql(`select name from profiles where id = '${B}';`);
const [lo, hi] = [A, B].sort();
const created = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const cleanup = () => {
  sql(`delete from member_devices where device_hash = public.device_hash('${PHONE}');
       delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
       delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
       delete from reports where reporter_id = '${A}' and reported_id = '${B}' and created_at > now() - interval '1 hour';
       delete from auth.users where email like 'guard%${STAMP}%';`);
};

try {
  log('== 1. Throwaway addresses');
  check(await rpc('email_domain_allowed', { p_email: 'priya@yopmail.com' }) === false, 'YOPmail is a throwaway domain');
  check(await rpc('email_domain_allowed', { p_email: 'priya@inbox.mailinator.com' }) === false, 'so is a Mailinator subdomain');
  check(await rpc('email_domain_allowed', { p_email: 'priya@gmail.com' }) === true
    && await rpc('email_domain_allowed', { p_email: 'priya@rediffmail.com' }) === true, 'Gmail and Rediffmail are fine');
  let r = await signUp(`guard${STAMP}@yopmail.com`);
  check(r.status >= 400 && /throwaway/i.test(r.body?.message ?? r.body?.msg ?? ''), `the server refuses a YOPmail sign-up (${r.status}: ${r.body?.message ?? r.body?.msg})`);
  check(sql(`select count(*) from auth.users where email = 'guard${STAMP}@yopmail.com';`) === '0', 'and no account is made');

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Create Account/ }).click();
  await page.locator('input[type=email]').fill(`guard${STAMP}@10minutemail.com`);
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD);
  await page.locator('input[type=checkbox]').first().check();
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click();
  check(await appears(page.getByText(/throwaway email addresses can't be used on Shaadi24/)), 'the sign-up form says a throwaway address can\'t be used');
  await page.screenshot({ path: `${OUT}1-throwaway.png` });
  await ctx.close();

  log('== 2. One mailbox, one account');
  const first = await newAccount(`guard.mail.${STAMP}@gmail.com`);
  const second = await newAccount(`guardmail${STAMP}+2@googlemail.com`);
  created.push(first.id, second.id);
  check(sql(`select public.mailbox_duplicate_of('${second.id}') = '${first.id}';`) === 't', 'the second address is the same Gmail mailbox');
  r = await search(second.jwt, `android:guard-mail-${STAMP}-2`);
  check(r.status === 403 && r.body?.code === 'ACCOUNT_LIMIT' && r.body?.reason === 'same_mailbox'
    && /already have a Shaadi24 account with this email/.test(r.body?.error ?? ''), `the second account can't search (${r.status} ${r.body?.code}: ${r.body?.error})`);
  r = await search(first.jwt, `android:guard-mail-${STAMP}-1`);
  check(r.body?.code !== 'ACCOUNT_LIMIT', `the first account can (${r.status} ${r.body?.code ?? 'results'})`);

  log('== 3. One phone, at most 3 accounts with free searches');
  const phone = [];
  for (let i = 1; i <= 5; i++) phone.push(await newAccount(`guard-phone${i}-${STAMP}@example.org`));
  created.push(...phone.map((p) => p.id));
  for (let i = 0; i < 3; i++) {
    r = await search(phone[i].jwt, PHONE);
    check(r.body?.code !== 'ACCOUNT_LIMIT', `account ${i + 1} on the phone can search (${r.status} ${r.body?.code ?? 'results'})`);
  }
  r = await search(phone[3].jwt, PHONE);
  check(r.status === 403 && r.body?.reason === 'shared_phone' && /already has 3 Shaadi24 accounts/.test(r.body?.error ?? ''),
    `the 4th can't (${r.status} ${r.body?.code}: ${r.body?.error})`);
  check(sql(`select count(*) from search_usage where user_id = '${phone[3].id}' and day_count > 0;`) === '0', 'and its refused search isn\'t counted');
  sql(`update profiles set subscription_tier = 'PRO' where id = '${phone[4].id}';`);
  r = await search(phone[4].jwt, PHONE);
  check(r.body?.code !== 'ACCOUNT_LIMIT', `a Shaadi24+ account on the same phone can (${r.status} ${r.body?.code ?? 'results'})`);
  check(sql(`select count(*) from member_devices where device_hash = public.device_hash('${PHONE}');`) === '5'
    && sql(`select count(*) from member_devices where device_hash like '%guard-test%';`) === '0', 'the phone is stored only as a scrambled ID');

  log('   in the app');
  const app = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await app.addInitScript((id) => {
    localStorage.setItem('shaadigpt_cookie_consent_shown', '1');
    localStorage.setItem('shaadi24_install_id', id);
  }, PHONE);
  const pa = await app.newPage();
  pa.on('pageerror', (e) => log('pageerror:', e.message));
  await pa.goto(BASE);
  await pa.getByRole('button', { name: 'Sign in' }).first().click();
  await pa.getByRole('button', { name: /Continue with Email/ }).click();
  await pa.locator('input[type=email]').fill(EMAIL_A);
  await pa.locator('input[type=password]').fill(PASSWORD);
  await pa.locator('form').getByRole('button', { name: /Log In/i }).click();
  await pa.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  const before = sql(`select coalesce((select day_count from search_usage where user_id = '${A}'), 0);`);
  await pa.getByTestId('find-match-box').fill('a doctor in Pune who loves to travel');
  await pa.getByTestId('find-match-box').press('Enter');
  check(await appears(pa.getByText(/This phone already has 3 Shaadi24 accounts using free searches/), 15000),
    'a member who is the 6th on the phone is told why they can\'t search');
  check(await appears(pa.getByTestId('upgrade-modal'), 5000), 'and Shaadi24+ is offered');
  check(sql(`select coalesce((select day_count from search_usage where user_id = '${A}'), 0);`) === before, 'without using up a search');
  await pa.screenshot({ path: `${OUT}2-phone-limit.png` });
  await app.close();

  log('== 4. Admin → Scam alerts');
  const alerts = sql(`select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = '${ADMIN}'), 'role', 'authenticated', 'aal', 'aal2')::text, false);
    set role authenticated;
    select string_agg(distinct (a->>'signal') || ':' || (a->>'user_id'), ',') from jsonb_array_elements(public.admin_risk_signals()) a
     where a->>'signal' in ('same_mailbox', 'shared_phone');`).split('\n').pop();
  check(alerts.includes(`same_mailbox:${second.id}`), 'the second account on the mailbox is flagged');
  check(phone.every((p) => alerts.includes(`shared_phone:${p.id}`)) && alerts.includes(`shared_phone:${A}`),
    'every account on the shared phone is flagged');

  log('== 5. Money talk in a chat');
  const matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  sql(`insert into messages (match_id, sender_id, content) values
         ('${matchId}', '${B}', 'Hi! Lovely to match with you.'),
         ('${matchId}', '${B}', 'My parcel is stuck at customs, please send money to my UPI ravi@okaxis');`);
  const chat = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await chat.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const pc = await chat.newPage();
  await pc.goto(BASE);
  await pc.getByRole('button', { name: 'Sign in' }).first().click();
  await pc.getByRole('button', { name: /Continue with Email/ }).click();
  await pc.locator('input[type=email]').fill(EMAIL_A);
  await pc.locator('input[type=password]').fill(PASSWORD);
  await pc.locator('form').getByRole('button', { name: /Log In/i }).click();
  await pc.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await pc.getByText('Matches', { exact: true }).first().click();
  await pc.locator('main').getByText(nameB).first().click();
  await pc.getByText('please send money to my UPI').waitFor({ timeout: 10000 });
  const warnings = pc.getByTestId('scam-warning');
  check(await appears(warnings) && await warnings.count() === 1, 'one safety note, under the message asking for money only');
  check((await warnings.first().innerText()).includes('Never send money'), 'it says never to send money');
  await pc.screenshot({ path: `${OUT}3-scam-warning.png` });
  await warnings.first().getByRole('button', { name: 'Report' }).click();
  check(await appears(pc.getByRole('heading', { name: `Report ${nameB}` })), 'its Report button opens the report form');
  await chat.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  cleanup();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
