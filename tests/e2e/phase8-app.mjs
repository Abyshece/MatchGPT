// Phase 8 app-side checks against the local stack, as one signed-in user:
//  1. Online status on result cards (active in last 5 min, respects Active Status off)
//  2. Standouts keeps today's saved picks, even ones outside the live top 8
//  3. Blocked people are hidden from search; Settings lists them; Unblock works
//  4. Pause my profile saves; Email Digests toggle is gone
//  5. Profile page: "Get verified →" opens the verification form
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name

const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/shots-p8/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from auth.users where email = '${EMAIL}';`);
// Everyone female in the pool was "active just now"; those with names A–M turned Active Status off.
sql(`update profiles set last_active_at = now(), settings_show_online = (coalesce(name, '') >= 'N') where id <> '${me}';
     delete from blocks where blocker_id = '${me}';
     delete from standouts where user_id = '${me}';
     delete from verification_requests where user_id = '${me}';
     update profiles set is_paused = false, is_verified = false, verification_status = 'unverified', daily_search_count = 0, account_created = now()
      where id = '${me}';
     delete from search_usage where user_id = '${me}';`);  // not verified yet, and inside the 3 days to verify
const hidden = new Set(sql(`select name from profiles where settings_show_online = false;`).split('\n'));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror:', e.message));

async function search(prompt) {
  await page.getByText('Find Match', { exact: true }).first().click();
  const box = page.getByTestId('find-match-box');
  await box.fill(prompt);
  await box.press('Enter');
  await page.getByText('Results for you').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1000);
}
// Each result card: name ("Charlotte Hayes, 30") and its Online/Offline pill.
async function cards() {
  return page.evaluate(() => [...document.querySelectorAll('h3')].map((h) => {
    const card = h.closest('.group') || h.parentElement.parentElement.parentElement;
    const name = h.textContent.split(',')[0].trim();
    const pill = card?.innerText.match(/\b(Online|Offline)\b/)?.[1] ?? '?';
    return { name, pill };
  }).filter((c) => c.name));
}

try {
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });

  log('1. online status on result cards');
  await search('someone kind who loves travel');
  const found = await cards();
  await page.screenshot({ path: `${OUT}1-online-status.png` });
  log('   cards:', found.map((c) => `${c.name}=${c.pill}`).join(', '));
  check(found.length > 0, 'search shows cards');
  check(found.every((c) => c.pill === (hidden.has(c.name) ? 'Offline' : 'Online')),
    'Online for recently active people, Offline for those with Active Status off');

  log('2. Standouts keeps saved picks outside the live top 8');
  // Save 5 random compatible people as today's picks; most of them fall outside
  // the live top 8 that the old code re-ran on every visit. This account looks
  // for women here (other tests may have changed it), so the picks fit it.
  sql(`update profiles set gender = 'Male', interested_in = 'Women' where id = '${me}';`);
  const picks = sql(`select id || '|' || name from profiles where onboarding_complete and name <> '' and not is_banned and not is_paused
                     and gender = 'Female' and interested_in in ('Men','Everyone')
                     order by md5(id::text) limit 5;`).split('\n').map((l) => l.split('|'));
  sql(`insert into standouts (user_id, candidate_id, rank, for_date) values ${picks.map(([id], i) => `('${me}', '${id}', ${i + 1}, (now() at time zone 'utc')::date)`).join(',')};`);
  await page.getByText('Standouts', { exact: true }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}2-standouts.png` });
  const standoutText = await page.locator('main, body').first().innerText();
  const shown = picks.filter(([, name]) => standoutText.includes(name));
  log('   saved picks:', picks.map(([, n]) => n).join(', '), '| shown:', shown.length);
  check(shown.length === picks.length, 'all 5 saved picks are shown after reload');

  log('3. blocked people');
  // someone whose name nobody else has (the seed data repeats some names)
  const victim = found.map((c) => c.name)
    .find((n) => sql(`select count(*) from profiles where name = '${n.replace(/'/g, "''")}';`) === '1');
  const victimId = sql(`select id from profiles where name = '${victim.replace(/'/g, "''")}';`);
  sql(`insert into blocks (blocker_id, blocked_id, reason) values ('${me}', '${victimId}', 'test');`);
  await search('someone kind who loves travel');
  const after = await cards();
  check(!after.some((c) => c.name === victim), `${victim} no longer appears in search after being blocked`);
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByText('Blocked people').waitFor({ timeout: 10000 });
  await page.getByText(victim).waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}3-blocked-list.png` });
  check(true, `Settings lists ${victim} under Blocked people`);
  await page.getByRole('button', { name: 'Unblock' }).first().click();
  await page.getByText("You haven't blocked anyone.").waitFor({ timeout: 10000 });
  check(sql(`select count(*) from blocks where blocker_id = '${me}';`) === '0', 'Unblock removed the block');

  log('4. pause + email digests');
  check(!(await page.getByText('Email Digests').isVisible()), 'Email Digests toggle is gone');
  await page.getByText('Pause my profile').click();
  await page.waitForTimeout(1500);
  check(sql(`select is_paused from profiles where id = '${me}';`) === 't', 'Pause my profile saved (is_paused = true)');
  // someone from the results, whose search pool had this user in it
  const other = sql(`select id from profiles where name = '${found[0].name.replace(/'/g, "''")}' limit 1;`);
  check(sql(`select count(*) from jsonb_array_elements(public.search_candidates('${other}')) e where e->>'id' = '${me}';`) === '0',
    'paused profile is out of the search pool');
  await page.screenshot({ path: `${OUT}4-settings-paused.png` });
  await page.getByText('Pause my profile').click();
  await page.waitForTimeout(1500);
  check(sql(`select is_paused from profiles where id = '${me}';`) === 'f', 'unpausing saved (is_paused = false)');

  log('5. profile page verification row');
  await page.getByText('My Profile', { exact: true }).first().click();
  await page.getByRole('button', { name: /Get verified/ }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}5-verify-modal.png` });
  check(await page.getByText(/LinkedIn/i).first().isVisible(), '"Get verified →" opens the verification form');
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
