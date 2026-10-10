// ============================================================================
// Fixes for what other matrimony apps' members complain about, part 2:
// fresh, active profiles (20261010140000_fresh_active_profiles.sql)
//
//   1. Not interested: the X on a search card hides the person for good
//      (with Undo); ⋯ → Not interested on a profile too; Settings → Hidden
//      profiles shows them again
//   2. Nobody who hasn't opened the app in 60 days is in search
//   3. "New" (joined this week) and "Usually replies" on the cards;
//      compute_member_stats() gives the badge to someone who answers most
//      people who write to them
//   4. An interest nobody answered in 14 days expires: it leaves the other
//      person's Likes You, the sender can find them in search again, and
//      Search History offers "Send again"
//   5. Standouts: nobody picked in the last 30 days is picked again while
//      there are others
//   6. I found my match: the profile is hidden, the story goes to the team
//      unpublished
//
// Usage: node review-fixes-2.mjs <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B) { console.error('usage: node review-fixes-2.mjs <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/review-fixes-2/', import.meta.url).pathname;
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
const rpc = async (fn, args, jwt) => {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return r.json().catch(() => null);
};
const fn = async (name, body, jwt) => {
  const r = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
// Members A can find, not liked, matched or blocked either way, active
const pool = sql(`select p.id || '|' || p.name || '|' || coalesce(p.last_active_at::text, '') || '|' || p.account_created from profiles p, profiles me
  where me.id = '${A}' and p.onboarding_complete and p.name <> '' and p.id not in ('${A}', '${B}')
    and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false) and not coalesce(p.settings_incognito, false)
    and public.gender_preference_fits(me.interested_in, p.gender) and public.gender_preference_fits(p.interested_in, me.gender)
    and not exists (select 1 from likes l where (l.liker_id = '${A}' and l.liked_id = p.id) or (l.liker_id = p.id and l.liked_id = '${A}'))
    and not exists (select 1 from matches m where (m.user_a_id = p.id and m.user_b_id = '${A}') or (m.user_b_id = p.id and m.user_a_id = '${A}'))
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = '${A}') or (b.blocked_id = p.id and b.blocker_id = '${A}'))
    and not exists (select 1 from passed_profiles x where x.user_id = '${A}' and x.passed_id = p.id)
    -- a name nobody else has, to find their card by it
    and (select count(*) from profiles q where q.name = p.name) = 1
  order by p.account_created limit 6;`).split('\n').map((r) => { const [id, name, active, created] = r.split('|'); return { id, name, active, created }; });
if (pool.length < 6) { console.error('needs six more members A can find'); process.exit(2); }
const [P1, P2, P3, P4, P5] = pool;
const nameA = sql(`select split_part(name, ' ', 1) from profiles where id = '${A}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const restore = pool.map((p) => `update profiles set last_active_at = ${p.active ? `'${p.active}'` : 'null'}, account_created = '${p.created}' where id = '${p.id}';`).join('\n');
const cleanup = () => {
  sql(`${restore}
       delete from passed_profiles where user_id = '${A}';
       delete from likes where liker_id = '${A}' and liked_id in (${pool.map((p) => `'${p.id}'`).join(',')});
       delete from member_stats where user_id = '${P3.id}';
       delete from standouts where user_id = '${A}';
       delete from success_stories where created_by = '${A}';
       update profiles set is_paused = false, paused_at = null, found_match_at = null where id = '${A}';
       delete from search_usage where user_id = '${A}';`);
};
const newContext = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  return ctx;
};
const signIn = async (ctx) => {
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL_A);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return page;
};

try {
  cleanup();
  const jwt = await token(EMAIL_A);
  const searchIds = async (prompt = '') => {
    // A free account has a few searches a window: these checks don't count
    sql(`delete from search_usage where user_id = '${A}';`);
    const r = await fn('search', { mode: 'search', prompt, filters: {}, limit: 50 }, jwt);
    if (r.status !== 200) log('  search:', r.status, JSON.stringify(r.json).slice(0, 200));
    return { ids: (r.json?.candidates ?? []).map((c) => c.id), candidates: r.json?.candidates ?? [], status: r.status };
  };

  log('== 1. Not interested');
  const app = await newContext();
  const pa = await signIn(app);
  await pa.getByTestId('find-match-box').fill(P1.name);
  await pa.getByRole('button', { name: 'Search', exact: true }).click();
  const cardOf = (name) => pa.getByTestId('match-card').filter({ has: pa.locator('h3', { hasText: name }) });
  const card = cardOf(P1.name);
  check(await appears(pa.locator('main h3', { hasText: P1.name }), 20000), `the search finds ${P1.name}`);
  await card.getByRole('button', { name: 'Pass' }).click();
  check(await appears(pa.getByText(`You won't see ${P1.name} again`)), 'the X says they won\'t be shown again');
  await pa.waitForTimeout(500);
  check(sql(`select count(*) from passed_profiles where user_id = '${A}' and passed_id = '${P1.id}';`) === '1', 'saved: Not interested');
  await pa.screenshot({ path: `${OUT}1-passed.png` });
  check(!(await searchIds()).ids.includes(P1.id), `${P1.name} isn't in the next search`);
  // Undo from the toast puts them back
  sql(`delete from search_usage where user_id = '${A}';`);
  await pa.getByTestId('find-match-box').fill(P2.name);
  await pa.getByRole('button', { name: 'Search', exact: true }).click();
  check(await appears(pa.locator('main h3', { hasText: P2.name }), 20000), `the search finds ${P2.name}`);
  await pa.locator('main h3', { hasText: P2.name }).first().click();
  const dialog = pa.locator('[data-popup], .fixed.inset-0').filter({ hasText: 'Profile Details' }).last();
  await dialog.getByRole('button', { name: 'More options' }).click();
  await dialog.getByTestId('not-interested').click();
  check(await appears(pa.getByText(`You won't see ${P2.name} again`)), '⋯ → Not interested on a profile');
  await pa.locator('div', { hasText: `You won't see ${P2.name} again` }).getByRole('button', { name: 'Undo', exact: true }).last().click();
  check(await appears(pa.getByText(`${P2.name} is back in your results`)), 'Undo brings them back');
  check(await appears(pa.locator('main h3', { hasText: P2.name })), 'their card is back');
  check(sql(`select count(*) from passed_profiles where user_id = '${A}' and passed_id = '${P2.id}';`) === '0', 'and nothing is saved');
  // Settings → Hidden profiles
  await pa.getByText('Settings', { exact: true }).first().click();
  const hidden = pa.getByTestId('hidden-profiles');
  check(await appears(hidden.getByText(P1.name)), `Settings → Hidden profiles lists ${P1.name}`);
  await pa.screenshot({ path: `${OUT}1-hidden-profiles.png` });
  await hidden.getByRole('button', { name: 'Show again' }).first().click();
  check(await appears(pa.getByText(`${P1.name} can show up in your searches again`)), 'Show again');
  check((await searchIds()).ids.includes(P1.id), `${P1.name} is in search again`);

  log('== 2. Inactive for 60 days');
  sql(`update profiles set last_active_at = now() - interval '61 days' where id = '${P2.id}';`);
  check(!(await searchIds()).ids.includes(P2.id), `${P2.name}, away 61 days, isn't in search`);
  sql(`update profiles set last_active_at = now() - interval '59 days' where id = '${P2.id}';`);
  check((await searchIds()).ids.includes(P2.id), 'away 59 days: still in search');

  log('== 3. "New" and "Usually replies"');
  sql(`update profiles set account_created = now() - interval '2 days' where id = '${P3.id}';
       insert into member_stats (user_id, conversations, replied, replies_usually) values ('${P3.id}', 4, 4, true)
         on conflict (user_id) do update set replies_usually = true;`);
  const found = (await searchIds(P3.name)).candidates.find((c) => c.id === P3.id);
  check(found?.isNew === true && found?.repliesUsually === true, `${P3.name}: New and Usually replies`);
  check(found && !('accountCreated' in found) && !('account_created' in found), 'the date joined isn\'t sent');
  const other = (await searchIds()).candidates.find((c) => c.id === P4.id);
  check(other && !other.isNew && !other.repliesUsually, `${P4.name}: neither`);
  await pa.getByText('Find Match', { exact: true }).first().click();
  sql(`delete from search_usage where user_id = '${A}';`);
  await pa.getByTestId('find-match-box').fill(P3.name);
  await pa.getByRole('button', { name: 'Search', exact: true }).click();
  const card3 = cardOf(P3.name);
  check(await appears(card3.getByTestId('new-badge'), 20000) && await appears(card3.getByTestId('replies-badge')), 'the card shows both badges');
  await card3.scrollIntoViewIfNeeded();
  await pa.screenshot({ path: `${OUT}3-badges.png` });
  // The daily job: someone who answered everyone who wrote to them gets it
  const stamp = Date.now();
  // Three others (not A: a match would pop up in A's open app)
  const writers = [P4.id, P5.id, pool[5].id];
  const matchIds = writers.map((w) => {
    const [x, y] = [w, B].sort();
    return sql(`insert into matches (user_a_id, user_b_id) values ('${x}', '${y}')
                on conflict do nothing returning id;`).split('\n')[0] || sql(`select id from matches where user_a_id = '${x}' and user_b_id = '${y}';`);
  });
  matchIds.forEach((m, i) => sql(`insert into messages (match_id, sender_id, content, created_at) values
    ('${m}', '${writers[i]}', 'Hello ${stamp}', now() - interval '10 minutes'),
    ('${m}', '${B}', 'Hi! ${stamp}', now() - interval '5 minutes');`));
  sql(`select public.compute_member_stats();`);
  check(sql(`select replies_usually from member_stats where user_id = '${B}';`) === 't',
    'compute_member_stats: answered everyone who wrote → Usually replies');
  sql(`delete from messages where match_id in (${matchIds.map((m) => `'${m}'`).join(',')});
       delete from matches where id in (${matchIds.map((m) => `'${m}'`).join(',')});`);
  sql(`select public.compute_member_stats();`);

  log('== 4. Interests that expire');
  sql(`insert into likes (liker_id, liked_id, created_at) values ('${A}', '${P4.id}', now() - interval '15 days');`);
  check((await searchIds()).ids.includes(P4.id), `${P4.name}: after 15 days without a reply, they're back in A's search`);
  // P4's Likes You, as P4
  const inboxOfP4 = sql(`select set_config('request.jwt.claims', json_build_object('sub', '${P4.id}', 'role', 'authenticated')::text, false);
    set role authenticated;
    select count(*) from public.get_likes_received('${P4.id}') where liked_at < now() - interval '14 days';`).split('\n').pop();
  check(inboxOfP4 === '0', `${P4.name}'s Likes You no longer shows it`);
  await pa.getByText('Search History', { exact: true }).first().click();
  await pa.getByText('Interests sent', { exact: true }).first().click();
  const expired = pa.getByTestId('sent-interest').filter({ hasText: P4.name }).getByTestId('expired-interest');
  check(await appears(expired), 'Search History: "No reply in time: this interest has expired"');
  await pa.screenshot({ path: `${OUT}4-expired.png` });
  await expired.getByRole('button', { name: 'Send again' }).click();
  check(await appears(pa.getByText(`Interest sent to ${P4.name} again`)), 'Send again');
  check(sql(`select count(*) from likes where liker_id = '${A}' and liked_id = '${P4.id}' and created_at > now() - interval '1 minute';`) === '1',
    'a new interest replaces the expired one');
  check(!(await searchIds()).ids.includes(P4.id), 'and they leave search again');
  await app.close();

  log('== 5. Standouts don\'t repeat');
  const yesterday = sql(`select ((now() at time zone 'utc')::date - 1)::text;`);
  // Everyone in A's pool but two was a Standout in the last days
  const all = (await searchIds()).ids;
  const keep = all.slice(0, 2);
  const shown = all.slice(2);
  if (shown.length) {
    // Five a day, over the last days
    sql(`insert into standouts (user_id, candidate_id, rank, for_date) values ${shown.map((id, i) =>
      `('${A}', '${id}', ${(i % 5) + 1}, '${yesterday}'::date - ${Math.floor(i / 5)})`).join(',')}
         on conflict do nothing;`);
  }
  const today = await fn('search', { mode: 'standouts' }, jwt);
  const picks = (today.json?.candidates ?? []).map((c) => c.id);
  check(picks.length > 0 && keep.every((id) => picks.includes(id)), 'today\'s picks start with the people not picked lately');
  check(picks.filter((id) => shown.includes(id)).length === picks.length - keep.length, 'the rest fill in only because there are no others');

  log('== 6. I found my match');
  const set = await newContext();
  const ps = await signIn(set);
  await ps.getByText('Settings', { exact: true }).first().click();
  await ps.getByTestId('found-my-match').click();
  const sheet = ps.getByTestId('found-match');
  await sheet.getByLabel("Your partner's first name").fill('Rahul');
  await sheet.getByLabel('How you met').fill('We matched on Shaadi24 in March and our families met in May.');
  await sheet.getByRole('checkbox').check();
  await ps.screenshot({ path: `${OUT}6-found-match.png` });
  await sheet.getByRole('button', { name: 'Hide my profile' }).click();
  check(await appears(ps.getByText('Congratulations! Your profile is hidden now.')), 'Congratulations, hidden');
  check(sql(`select is_paused || '/' || (found_match_at is not null) from profiles where id = '${A}';`) === 'true/true', 'the profile is paused, with the date');
  check(sql(`select names || '|' || published || '|' || (consent_note <> '') from success_stories where created_by = '${A}';`) === `${nameA} & Rahul|false|true`,
    'the story waits for the team, unpublished, with both agreeing');
  await set.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  cleanup();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
