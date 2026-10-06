// Phase 9 checks against the local stack, as one signed-in user (an onboarded
// account in Mumbai, password TestPass!2026):
//  1. Search runs on the server: results come from the `search` function, and
//     the browser never reads the old profile views
//  2. "near me" and "doesn't smoke" in the prompt
//  3. A hidden name and religion stay off the screen and out of the response
//  4. The daily limit is enforced by the server: a 4th search is refused even
//     when the page thinks one is left
//  5. The liked list, Standouts and the blocked list still show people
// With the GEMINI_API_KEY secret set (or a stand-in, see README), prompts are
// understood by Gemini; otherwise by rules. The checks hold either way.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';  // `docker ps` shows the name

const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/shots-p9/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const inList = (ids) => ids.map((id) => `'${id}'`).join(',') || 'null';

const me = sql(`select id from profiles where email = '${EMAIL}';`);
// A fresh account (not yet locked out for being unverified), free plan, no searches today
sql(`update profiles set daily_search_count = 0, subscription_tier = 'FREE', is_paused = false,
       account_created = now(), city = 'Mumbai', state = 'Maharashtra', country = 'India' where id = '${me}';
     delete from likes where '${me}' in (liker_id, liked_id);  -- a like back would pop up "It's a Match!"
     delete from blocks where blocker_id = '${me}';
     delete from standouts where user_id = '${me}';
     update profiles set hidden_fields = '{}' where hidden_fields <> '{}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror:', e.message));
const requested = [];
page.on('request', (r) => requested.push(r.url()));

// Runs a search in the UI; returns the search function's response.
async function search(prompt) {
  await page.getByText('Find Match', { exact: true }).first().click();
  const box = page.getByPlaceholder(/Describe your ideal match/);
  await box.fill(prompt);
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 15000 });
  await box.press('Enter');
  const res = await responded;
  const body = await res.text();
  await page.waitForTimeout(1200);
  return { status: res.status(), body, json: JSON.parse(body) };
}

try {
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });

  log('1-2. search on the server: "near me", then "doesn\'t smoke"');
  const near = await search('someone near me');
  const nearIds = near.json.candidates.map((c) => c.id);
  await page.screenshot({ path: `${OUT}1-near-me.png` });
  check(near.status === 200 && nearIds.length > 0, `"near me" returned ${nearIds.length} people`);
  // Maharashtra by the state answer, or "…, MH" / "…, Maharashtra" as typed before Phase 12
  const far = sql(`select count(*) from profiles where id in (${inList(nearIds)})
                     and coalesce(state, '') <> 'Maharashtra' and location not similar to '%, (MH|Maharashtra)';`);
  check(far === '0', 'all of them are in Mumbai or elsewhere in Maharashtra');
  check(await page.getByText('Results for you').isVisible(), 'results are shown');
  const understood = await page.getByTestId('understood').innerText().catch(() => '');
  check(/Understood/.test(understood) && understood.includes('Near you'),
    `the page shows what the search understood (${near.json.understoodBy}): ${understood.replace(/\s+/g, ' ')}`);

  const smoke = await search("someone who doesn't smoke");
  const smokeIds = smoke.json.candidates.map((c) => c.id);
  const smokers = sql(`select count(*) from profiles where id in (${inList(smokeIds)}) and smoking in ('Socially', 'Regularly');`);
  check(smokeIds.length > 0 && smokers === '0', `"doesn't smoke": ${smokeIds.length} people, none of them smokers`);
  check(smoke.json.remaining === 1, `server counted 2 searches (1 left): ${smoke.json.remaining}`);

  log('3. hidden fields');
  // someone near the top whose name nobody else has
  const unique = sql(`select id from profiles where id in (${inList(smokeIds.slice(0, 10))})
                        and name in (select name from profiles group by name having count(*) = 1) limit 1;`);
  const top = smoke.json.candidates.find((c) => c.id === unique);
  const topRow = sql(`select name || '|' || coalesce(religion, '') from profiles where id = '${top.id}';`).split('|');
  sql(`update profiles set hidden_fields = '{name,religion}' where id = '${top.id}';`);
  const again = await search("someone who doesn't smoke");
  const hidden = again.json.candidates.find((c) => c.id === top.id);
  check(!!hidden && hidden.name === '' && hidden.religion === undefined, 'server sent no name or religion for them');
  check(!again.body.includes(topRow[0]), `"${topRow[0]}" appears nowhere in the response`);
  const card = page.locator('h3', { hasText: 'Name hidden' }).first();
  check(await card.isVisible(), 'their card says "Name hidden"');
  await card.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}3-hidden-profile.png` });
  // The popup itself (the filter drawer's backdrop is also fixed and full-screen)
  const modal = await page.locator('div.fixed.inset-0', { has: page.getByText('Profile Details') }).innerText();
  check(modal.includes('Name hidden') || modal.includes('Profile Details'), 'reading the profile popup');
  check(!modal.includes(topRow[0]) && !(topRow[1] && modal.includes(topRow[1])),
    `their profile shows neither the name nor the religion (${topRow[1] || 'none given'})`);
  await page.keyboard.press('Escape');

  log('4. daily limit on the server');
  // The page believes one search is left; the server knows there isn't
  sql(`update profiles set daily_search_count = 2 where id = '${me}';`);
  await page.reload();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
  sql(`update profiles set daily_search_count = 3 where id = '${me}';`);
  const refused = await search('someone kind');
  await page.screenshot({ path: `${OUT}4-limit.png` });
  check(refused.status === 429 && refused.json.code === 'LIMIT_REACHED', `4th search refused by the server (${refused.status})`);
  check(await page.getByText("You've used today's free searches").isVisible(), 'the page shows the upgrade prompt');
  check(sql(`select daily_search_count from profiles where id = '${me}';`) === '3', 'count stays at 3');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();

  log('5. liked list, Standouts, blocked list');
  const [visible, toBlock] = smoke.json.candidates.filter((c) => c.id !== top.id);
  sql(`insert into likes (liker_id, liked_id) values ('${me}', '${top.id}'), ('${me}', '${visible.id}');
       insert into blocks (blocker_id, blocked_id) values ('${me}', '${toBlock.id}');`);
  const visibleName = sql(`select name from profiles where id = '${visible.id}';`);
  const blockedName = sql(`select name from profiles where id = '${toBlock.id}';`);
  await page.getByText('Chat History', { exact: true }).first().click();
  await page.getByText('Liked profiles', { exact: true }).first().click();
  await page.getByText(visibleName).first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}5-liked.png` });
  check(await page.locator('h3', { hasText: 'Name hidden' }).first().isVisible(), `liked list: ${visibleName} and "Name hidden"`);

  await page.getByText('Standouts', { exact: true }).first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}5-standouts.png` });
  const picks = sql(`select count(*) from standouts where user_id = '${me}' and for_date = (now() at time zone 'utc')::date;`);
  check(picks === '5' && (await page.locator('h3').count()) >= 5, `Standouts: ${picks} picks saved and shown`);

  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByText('Blocked people').waitFor({ timeout: 10000 });
  await page.getByText(blockedName).first().waitFor({ timeout: 10000 });
  check(true, `blocked list shows ${blockedName}`);

  const oldViews = requested.filter((u) => /\/rest\/v1\/(eligible_profiles|public_profiles|my_blocked_ids)/.test(u));
  check(oldViews.length === 0, `the browser never read the old views (${oldViews.length} requests)`);
  check(requested.some((u) => u.includes('/rest/v1/rpc/get_profile_cards')), 'cards came from get_profile_cards');
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  await browser.close();
  sql(`update profiles set hidden_fields = '{}' where hidden_fields <> '{}';`);
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
