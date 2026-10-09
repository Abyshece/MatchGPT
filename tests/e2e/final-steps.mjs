// ============================================================================
// The final taps the click-through stops short of (it opens their "Are you
// sure?" and cancels, so its test member lives to the end), each done for
// real here, in Chromium as each phone sees the app (phone-standin.mjs):
//   - Report (in a chat): the report is saved, a thank-you shows
//   - Unmatch: the match is ended and the chat leaves Matches
//   - Block: the block is saved and the chat leaves Matches
//   - Settings › Delete Account › reason › type "Delete" › Permanently Delete:
//     the account is gone and the app is back at the welcome screen
// Makes a fresh member per phone (final_<time>@shaadigpt.dev) matched with
// three women from the seed data; the last step deletes the member.
// Usage: SERVICE_ROLE_KEY=… node final-steps.mjs [android|ios|both]   (BASE_URL, DB_CONTAINER)
// ============================================================================
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED, REQUIRED_DETAILS } from './fixtures.mjs';
import { BRIDGE, standin } from './phone-standin.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY;
const which = process.argv[2] || 'both';
const PLATFORMS = which === 'both' ? ['android', 'ios'] : [which];
const PASSWORD = 'TestPass!2026';
if (!SERVICE) { console.error('SERVICE_ROLE_KEY is needed (to make the member)'); process.exit(2); }

fs.mkdirSync(new URL('./.shots/', import.meta.url).pathname, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(`${ok ? '✓' : '✗'} ${what}`); if (!ok) failures++; };

// A member matched with three women, each of whom said hello
async function makeMember(platform) {
  const email = `final_${platform}_${Date.now()}@shaadigpt.dev`;
  const made = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  const me = made.id;
  if (!me) throw new Error(`could not make the member: ${JSON.stringify(made)}`);
  const seed = sql(`select id from profiles where gender = 'Male' and onboarding_complete and array_length(photo_urls, 1) >= 1
    and email like 'seed_%' order by email limit 1;`);
  sql(`update profiles p set (date_of_birth, height, religion, mother_tongue, description, photo_urls, marital_status)
       = (select s.date_of_birth, s.height, s.religion, s.mother_tongue, s.description, s.photo_urls, s.marital_status
            from profiles s where s.id = '${seed}') where p.id = '${me}';
       update profiles set name = 'Final Steps', gender = 'Male', interested_in = 'Women', onboarding_complete = true,
         city = 'Pune', state = 'Maharashtra', country = 'India' where id = '${me}';
       update profiles set ${REQUIRED_DETAILS}, ${CONSENTED} where id = '${me}';`);
  const women = sql(`select id from profiles where gender = 'Female' and onboarding_complete and not coalesce(is_banned, false)
    and not coalesce(is_paused, false) and email like 'seed_%' order by email offset 4 limit 3;`).split('\n');
  const hello = ['Hello, report test', 'Hello, unmatch test', 'Hello, block test'];
  women.forEach((her, i) => sql(`
    insert into matches (user_a_id, user_b_id) values (least('${me}'::uuid, '${her}'::uuid), greatest('${me}'::uuid, '${her}'::uuid));
    insert into messages (match_id, sender_id, content)
      select id, '${her}', '${hello[i]}' from matches where user_a_id = least('${me}'::uuid, '${her}'::uuid)
        and user_b_id = greatest('${me}'::uuid, '${her}'::uuid);`));
  return { email, me, women, hello };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

for (const platform of PLATFORMS) {
  log(`== ${platform}`);
  const { email, me, women, hello } = await makeMember(platform);
  const screen = platform === 'ios' ? { width: 393, height: 852 } : { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport: screen, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ content: standin(platform) });
  await ctx.addInitScript({ path: BRIDGE[platform] });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.split('\n')[0]));

  const menu = async (label) => {
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
    await page.waitForTimeout(600);
  };
  // (a chat stays open in Matches until its back button)
  const toMatches = async () => {
    await menu('Matches');
    const back = page.getByRole('button', { name: 'Back to matches' });
    if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(500); }
  };
  const openChat = async (text) => {
    await toMatches();
    await page.getByRole('button', { name: new RegExp(text) }).first().click();
    await page.getByRole('button', { name: 'More options' }).waitFor({ timeout: 10000 });
  };
  const inMatches = async (text) => {
    await toMatches();
    await page.waitForTimeout(800);
    return page.getByRole('button', { name: new RegExp(text) }).count();
  };

  try {
    // Signed in by email, as on the phone
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: /Continue with Email/ }).click();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: /Log In/i }).click();
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });

    // Report
    await openChat(hello[0]);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Report$/ }).click();
    await page.getByText('Asks for or offers dowry').click();
    await page.getByPlaceholder('Tell us more about what happened.').fill('Asked about dowry in the first message.');
    await page.getByRole('button', { name: 'Submit Report' }).click();
    await page.getByText(/Report submitted/).waitFor({ timeout: 10000 });
    check(true, 'Report: "Report submitted" shows');
    check(sql(`select reason || '|' || details from reports where reporter_id = '${me}' and reported_id = '${women[0]}';`)
      === 'dowry|Asked about dowry in the first message.', 'Report: saved with the reason and the details');

    // Unmatch
    await openChat(hello[1]);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Unmatch$/ }).click();
    await page.getByRole('button', { name: 'Unmatch', exact: true }).click();
    await page.getByText(/^Unmatched /).waitFor({ timeout: 10000 });
    check(sql(`select count(*) from matches where '${me}' in (user_a_id, user_b_id) and '${women[1]}' in (user_a_id, user_b_id)
      and unmatched_at is not null;`) === '1', 'Unmatch: the match is ended');
    check(await inMatches(hello[1]) === 0, 'Unmatch: the chat has left Matches');

    // Block
    await openChat(hello[2]);
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Block user$/ }).click();
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await page.getByText(/^Blocked /).waitFor({ timeout: 10000 });
    check(sql(`select count(*) from blocks where blocker_id = '${me}' and blocked_id = '${women[2]}';`) === '1', 'Block: saved');
    check(await inMatches(hello[2]) === 0, 'Block: the chat has left Matches');
    check(await inMatches(hello[0]) === 1, 'Reporting alone keeps the match');

    // Delete account
    await menu('Settings');
    await page.getByRole('button', { name: 'Delete Account' }).click();
    await page.getByText('I met someone on Shaadi24').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const final = page.getByRole('button', { name: 'Permanently Delete' });
    check(await final.isDisabled(), 'Delete: the final button waits for "Delete" to be typed');
    await page.getByPlaceholder('Delete').fill('Delete');
    await final.click();
    await page.getByRole('button', { name: 'Sign in' }).first().waitFor({ timeout: 20000 });
    check(true, 'Delete: back at the welcome screen');
    check(sql(`select count(*) from auth.users where id = '${me}';`) === '0', 'Delete: the account is gone');
    check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors.join(' | ')}` : ''}`);
  } catch (e) {
    failures++;
    log(`✗ ${platform} stopped: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: new URL(`./.shots/final-steps-${platform}.png`, import.meta.url).pathname }).catch(() => {});
  } finally {
    // (the member is gone if Delete worked; otherwise, tidy up)
    if (sql(`select count(*) from auth.users where id = '${me}';`) !== '0') {
      await fetch(`${API}/auth/v1/admin/users/${me}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    }
    sql(`delete from reports where reporter_id = '${me}'; delete from blocks where blocker_id = '${me}';`);
    await ctx.close();
  }
}

await browser.close();
log(failures ? `${failures} check(s) failed` : 'all final steps work');
process.exit(failures ? 1 : 0);
