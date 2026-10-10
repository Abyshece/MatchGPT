// ============================================================================
// Fixes for what other matrimony apps' members complain about, part 1
// (docs/research/competitor-reviews.md; 20261010120000_interests_undo_and_reveals.sql)
//
//   1. Chat notes: "digital arrest" and money talk under every such message,
//      moving to WhatsApp or a video call under the first only; "digital
//      arrest" also raises Admin → Scam alerts (money_talk)
//   2. Taking back an interest: withdraw_interest() refuses a match; undone
//      within a minute it gives back the day's like, later it doesn't
//   3. Undo on the "Interest sent" toast, in the app
//   4. Search History → Interests sent: Withdraw, and "Matched" for a match
//   5. One free "Likes You" a day (Shaadi24+ for everyone switched off): the
//      server sends who it is only after the free look; a second one waits
//      for tomorrow; in the app, the card opens with "See who (free today)"
//   6. Our promises: on the welcome screen, the Shaadi24+ page and the
//      website, with the website's price list
//
// Usage: node review-fixes-1.mjs <member A> <member B>
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SITE = process.env.SITE_URL || 'http://localhost:3002';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B) { console.error('usage: node review-fixes-1.mjs <member A> <member B>'); process.exit(2); }

const OUT = new URL('./.shots/review-fixes-1/', import.meta.url).pathname;
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
const like = async (jwt, liker, liked) => {
  const r = await fetch(`${API}/rest/v1/likes`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ liker_id: liker, liked_id: liked }),
  });
  if (!r.ok) throw new Error(`like failed: ${r.status} ${await r.text()}`);
};

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const nameB = sql(`select name from profiles where id = '${B}';`);
const [lo, hi] = [A, B].sort();
// Two other members A can find (gender preferences fit both ways), with a
// finished profile, not matched, liked or blocked either way with A
const others = sql(`select p.id || '|' || p.name from profiles p, profiles me
  where me.id = '${A}' and p.onboarding_complete and p.name <> '' and p.id not in ('${A}', '${B}')
    and not coalesce(p.is_banned, false) and not coalesce(p.is_paused, false) and not coalesce(p.settings_incognito, false)
    and public.gender_preference_fits(me.interested_in, p.gender) and public.gender_preference_fits(p.interested_in, me.gender)
    and not exists (select 1 from likes l where (l.liker_id = '${A}' and l.liked_id = p.id) or (l.liker_id = p.id and l.liked_id = '${A}'))
    and not exists (select 1 from matches m where (m.user_a_id = p.id and m.user_b_id = '${A}') or (m.user_b_id = p.id and m.user_a_id = '${A}'))
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = '${A}') or (b.blocked_id = p.id and b.blocker_id = '${A}'))
  order by p.account_created limit 2;`).split('\n').map((r) => { const [id, name] = r.split('|'); return { id, name }; });
if (others.length < 2) { console.error('needs two more members with a finished profile'); process.exit(2); }
const [X, Y] = others;

const before = sql(`select pro_for_all || '|' || (select subscription_tier || '|' || coalesce(daily_like_count, 0) || '|' || coalesce(last_like_date::text, '') from profiles where id = '${A}') from app_settings;`).split('|');
const [proForAll, tierA, likesA, likeDateA] = before;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
const cleanup = () => {
  sql(`delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
       delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
       delete from likes where (liker_id = '${A}' and liked_id in ('${B}', '${X.id}', '${Y.id}'))
                            or (liked_id = '${A}' and liker_id in ('${X.id}', '${Y.id}'));
       delete from like_reveals where user_id = '${A}';
       update app_settings set pro_for_all = ${proForAll === 't'};
       update profiles set subscription_tier = '${tierA}', daily_like_count = ${likesA}
         ${likeDateA ? `, last_like_date = '${likeDateA}'` : ''} where id = '${A}';`);
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
const newContext = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  return ctx;
};

try {
  cleanup();
  // Without "Shaadi24+ for everyone", on the free plan
  sql(`update app_settings set pro_for_all = false;
       update profiles set subscription_tier = 'FREE', daily_like_count = 0, last_like_date = current_date where id = '${A}';
       delete from search_usage where user_id = '${A}';`);
  const jwt = await token(EMAIL_A);

  log('== 1. Notes in a chat');
  const matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];
  sql(`insert into messages (match_id, sender_id, content, created_at) values
         ('${matchId}', '${B}', 'Hi! Lovely to match with you.', now() - interval '5 minutes'),
         ('${matchId}', '${B}', 'Can we talk on WhatsApp? My number is 98765 43210', now() - interval '4 minutes'),
         ('${matchId}', '${B}', 'Or a video call tonight on WhatsApp?', now() - interval '3 minutes'),
         ('${matchId}', '${B}', 'This is a CBI officer. You are under digital arrest, stay on the video call', now() - interval '2 minutes'),
         ('${matchId}', '${B}', 'Please send money to my UPI for the customs fee', now() - interval '1 minute');`);
  const chat = await newContext();
  const pc = await signIn(chat);
  await pc.getByText('Matches', { exact: true }).first().click();
  await pc.locator('main').getByText(nameB).first().click();
  await pc.getByText('Please send money to my UPI').waitFor({ timeout: 10000 });
  const offPlatform = pc.getByTestId('off-platform-warning');
  const scams = pc.getByTestId('scam-warning');
  check(await appears(offPlatform) && await offPlatform.count() === 1, 'one note about moving to WhatsApp, under the first such message only');
  check((await offPlatform.first().innerText()).includes('No rush to move to WhatsApp'), 'it says there is no rush');
  check(await scams.count() === 2, 'a note under the "digital arrest" message and the money message');
  check((await pc.locator('[data-kind="arrest"]').first().innerText()).includes('1930'), 'the "digital arrest" note gives the 1930 helpline');
  await pc.screenshot({ path: `${OUT}1-chat-notes.png` });
  check(sql(`select public.money_talk('You are under digital arrest, CBI case against you')`) === 't', 'Scam alerts: "digital arrest" counts as money talk');
  await chat.close();

  log('== 2. Taking back an interest');
  check((await rpc('withdraw_interest', { p_liked: B }, jwt))?.reason === 'not_found', 'nothing to take back yet');
  await like(jwt, A, B);
  check((await rpc('withdraw_interest', { p_liked: B }, jwt))?.reason === 'matched', 'a match stays a match');
  check(sql(`select count(*) from likes where liker_id = '${A}' and liked_id = '${B}';`) === '1', 'the interest in a match stays');
  const used = () => Number(sql(`select daily_like_count from profiles where id = '${A}';`));
  const start = used();
  await like(jwt, A, X.id);
  check(used() === start + 1, `the like counts toward the day (${start} → ${start + 1})`);
  const undone = await rpc('withdraw_interest', { p_liked: X.id }, jwt);
  check(undone?.withdrawn === true && undone?.refunded === true, 'taken back straight away: withdrawn, nothing used up');
  check(used() === start, `the day's like is given back (${start})`);
  await like(jwt, A, X.id);
  sql(`update likes set created_at = now() - interval '5 minutes' where liker_id = '${A}' and liked_id = '${X.id}';`);
  const later = await rpc('withdraw_interest', { p_liked: X.id }, jwt);
  check(later?.withdrawn === true && later?.refunded === false, 'taken back later: withdrawn, the like stays used');
  check(used() === start + 1, `the day's count stays at ${start + 1}`);
  const other = await token(EMAIL_B);
  check((await rpc('withdraw_interest', { p_liked: X.id }, other))?.reason === 'not_found', "nobody can take back someone else's interest");

  log('== 3. Undo on the "Interest sent" toast');
  const app = await newContext();
  const pa = await signIn(app);
  // From a profile opened from the search results
  await pa.getByRole('button', { name: /Find Match/ }).first().click();
  await pa.getByTestId('find-match-box').fill(Y.name);
  await pa.getByRole('button', { name: 'Search', exact: true }).click();
  const card = pa.locator('main h3', { hasText: Y.name });
  if (await appears(card, 20000)) {
    await card.first().click();
    const dialog = pa.locator('[data-popup], .fixed.inset-0').filter({ hasText: 'Profile Details' }).last();
    await dialog.getByTitle('Like').first().click();
    await pa.getByRole('button', { name: 'Yes, Like' }).click();
    const toast = pa.getByText(`Interest sent to ${Y.name}`);
    check(await appears(toast), 'the toast says the interest was sent');
    await pa.screenshot({ path: `${OUT}3-undo-toast.png` });
    await pa.getByRole('button', { name: 'Undo', exact: true }).click();
    check(await appears(pa.getByText(`Interest to ${Y.name} taken back`)), 'Undo takes it back');
    check(sql(`select count(*) from likes where liker_id = '${A}' and liked_id = '${Y.id}';`) === '0', 'the interest is gone');
    check(used() === start + 1, "and it didn't use up a like");
    await pa.keyboard.press('Escape');
  } else {
    check(false, `the search finds ${Y.name}`);
  }

  log('== 4. Search History → Interests sent');
  await like(jwt, A, Y.id);
  await pa.getByText('Search History', { exact: true }).first().click();
  await pa.getByText('Interests sent', { exact: true }).first().click();
  const sent = pa.getByTestId('sent-interest');
  check(await appears(sent.filter({ hasText: Y.name })), `${Y.name} is in the list`);
  check(await appears(sent.filter({ hasText: nameB }).getByText('Matched: say hello in Messages')), `${nameB} shows as a match, without Withdraw`);
  await pa.screenshot({ path: `${OUT}4-interests-sent.png` });
  pa.once('dialog', (d) => d.accept());
  await sent.filter({ hasText: Y.name }).getByTestId('withdraw-interest').click();
  check(await appears(pa.getByText(`Interest in ${Y.name} withdrawn`)), 'Withdraw takes it back');
  check(sql(`select count(*) from likes where liker_id = '${A}' and liked_id = '${Y.id}';`) === '0', 'the interest is gone');

  log('== 5. One free "Likes You" a day');
  sql(`insert into likes (liker_id, liked_id) values ('${X.id}', '${A}'), ('${Y.id}', '${A}');`);
  const inbox = async () => (await rpc('get_likes_received', { p_user_id: A }, jwt)).filter((l) => [X.id, Y.id].includes(l.liker_id) || l.liker_id === null);
  const hidden = await inbox();
  check(hidden.length >= 2 && hidden.every((l) => l.liker_id === null && l.liker_name === null), 'without Shaadi24+, nobody is named');
  const status = await rpc('like_reveal_status', {}, jwt);
  check(status?.left === 1 && status?.per_day === 1, 'one free look today');
  await pa.getByRole('button', { name: /Likes You/ }).first().click();
  check(await appears(pa.getByTestId('likes-reveal-note').filter({ hasText: 'one free look a day' })), 'Likes You says there is one free look a day');
  await pa.screenshot({ path: `${OUT}5-likes-you-before.png` });
  await pa.getByTestId('reveal-like').first().click();
  check(await appears(pa.getByText(/^Here they are/)), 'the card opens');
  const opened = await inbox();
  const shown = opened.filter((l) => l.liker_id);
  check(shown.length === 1 && [X.id, Y.id].includes(shown[0].liker_id) && shown[0].liker_name, 'the server names that one, and only that one');
  check(await appears(pa.getByText(shown[0].liker_name)), `the app shows ${shown[0].liker_name}`);
  check(await appears(pa.getByText('Upgrade to See')) && await pa.getByTestId('reveal-like').count() === 0, 'the rest ask for Shaadi24+ again');
  await pa.screenshot({ path: `${OUT}5-likes-you-after.png` });
  const hiddenLike = opened.find((l) => !l.liker_id);
  const second = await rpc('reveal_like', { p_like_id: hiddenLike.like_id }, jwt);
  check(second?.revealed === false && second?.reason === 'none_left' && !!second?.resets_at, 'a second free look waits for tomorrow');
  check((await rpc('reveal_like', { p_like_id: hiddenLike.like_id }, other))?.reason === 'not_found', "nobody can open someone else's likes");

  log('== 6. Our promises');
  await pa.getByRole('button', { name: 'Get Shaadi24+' }).first().click();
  const promises = pa.getByTestId('upgrade-promises');
  check(await appears(promises) && (await promises.innerText()).includes('We never call you to sell'), 'the Shaadi24+ page lists our promises');
  await app.close();
  const out = await newContext();
  const welcome = await out.newPage();
  await welcome.goto(BASE);
  check(await appears(welcome.getByTestId('welcome-promises').filter({ hasText: 'No sales calls' })), 'the welcome screen: "Chatting is free · No sales calls · Real members only"');
  const site = await out.newPage();
  await site.goto(SITE);
  const sitePromises = site.getByTestId('site-promises');
  check(await appears(sitePromises) && await sitePromises.locator('li').count() === 4, 'the website lists the 4 promises');
  const prices = site.getByTestId('site-prices');
  check((await prices.innerText()).includes('₹499') && (await prices.innerText()).includes('₹2,999') && (await prices.innerText()).includes('a day'),
    'the website shows the prices, with the price a day');
  await prices.scrollIntoViewIfNeeded();
  await site.screenshot({ path: `${OUT}6-website.png`, fullPage: true });
  await out.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  cleanup();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
