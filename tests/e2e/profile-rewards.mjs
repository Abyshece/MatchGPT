// Free AI searches for filling in the profile (lib/profileRewards.ts,
// supabase/migrations/…_phase10_profile_sections.sql and …_search_bonus.sql), in the members' app:
//  1. Find Match says "3 searches left today" and offers to earn more; it
//     opens My Profile, where the card shows 3 a day and the six sections,
//     each with what's left
//  2. The answer that completes a section (Family, 8 of 11) earns a free
//     search a day: "Section complete!", the card says 4, the section's
//     heading says so, and so does the database
//  3. A required answer can be changed but not removed
//  4. Four a day (still 3 every 5 hours): after 3 today Find Match says "1
//     search left today"; the server lets the 4th search through and stops
//     the 5th, and the limit popup suggests completing sections
//  5. With Shaadi24+: its searches (supabase/migrations/…_search_limits.sql),
//     and no offer to earn more
// Usage: node profile-rewards.mjs <email>   (an onboarded account, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { REQUIRED_DETAILS } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const [EMAIL] = process.argv.slice(2);
if (!EMAIL) { console.error('usage: node profile-rewards.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/rewards/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const SECTION_COLUMNS = ['caste', 'sub_caste', 'sect', 'gotra', 'open_to_other_communities', 'languages', 'manglik', 'rashi',
  'nakshatra', 'birth_time', 'birth_place', 'horoscope_match', 'degree', 'university', 'employed_in', 'job_title', 'work',
  'work_style', 'annual_income', 'family_type', 'family_status', 'family_values', 'father_occupation', 'mother_occupation',
  'brothers', 'brothers_married', 'sisters', 'sisters_married', 'family_location', 'living_with_family', 'family_closeness',
  'about_family', 'dietary_preferences', 'drinking', 'smoking', 'gym_routine', 'sleep_schedule', 'can_cook', 'hobbies',
  'reading_interest', 'sports_interest', 'loves_travel', 'travel_style', 'body_type', 'hair_color', 'hair_type', 'eye_color',
  'wears_glasses', 'has_tattoos', 'clothing_style', 'marriage_timeline', 'family_plans', 'settling_abroad', 'love_language',
  'social_battery', 'attachment_style', 'conflict_resolution', 'financial_approach', 'future_plans', 'dream_house_type', 'pets'];
const me = sql(`select id from profiles where email = '${EMAIL}';`);
const [tier, verified] = sql(`select subscription_tier || '|' || is_verified from profiles where id = '${me}';`).split('|');
// Family: 7 of the 11 answers it takes 8 of; every other section empty
const FAMILY = { family_type: 'Nuclear', family_status: 'Middle Class', family_values: 'Moderate',
  father_occupation: 'Business', mother_occupation: 'Homemaker', brothers: '1', sisters: '0' };
const reset = () => sql(`update profiles set ${REQUIRED_DETAILS},
    ${SECTION_COLUMNS.map((c) => `${c} = ${c in FAMILY ? `'${FAMILY[c]}'` : 'null'}`).join(', ')},
    subscription_tier = 'FREE', daily_search_count = 0, last_search_date = current_date, is_paused = false,
    is_verified = true, settings_incognito = false where id = '${me}';
  delete from search_usage where user_id = '${me}';`);
const bonus = () => sql(`select search_bonus from profiles where id = '${me}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  reset();
  check(bonus() === '0', 'starts with no sections complete');
  // India time, so the day's reset reads "today"
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Kolkata' });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { log('pageerror:', e.message); failures++; });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });

  log('1. Find Match, and the card in My Profile');
  check(await appears(page.getByTestId('search-allowance').getByText('3 searches left today')), '"3 searches left today"');
  await page.getByTestId('earn-searches').click();
  const card = page.getByTestId('profile-rewards');
  check(await appears(card), '"Earn more" opens My Profile with the card');
  const family = card.getByTestId('reward-family');
  check(await appears(family), 'the sections load');
  check(await appears(card.getByTestId('daily-searches').getByText('3', { exact: true })), 'the card says 3 free searches a day');
  check(await card.locator('[data-testid^="reward-"]').count() === 6, 'six sections');
  check((await family.innerText()).includes('1 more answer'), `Family: 1 more answer (${(await family.innerText()).replace(/\s+/g, ' ')})`);
  check((await card.getByTestId('reward-lifestyle').innerText()).includes('Still to answer: Diet'), 'a section names what is still to answer');
  const heading = page.locator('#section-family h4');
  check((await heading.innerText()).includes('1 more for +1 search a day'), 'the Family heading says one more answer earns a search');
  await page.screenshot({ path: `${OUT}1-card.png` });

  log('2. The answer that completes Family');
  await family.click();
  const row = (label) => page.locator(`div.group[data-label="${label}"]`).first();
  const r = row('Family lives in');
  await r.scrollIntoViewIfNeeded();
  await r.hover();
  await r.getByTitle('Edit').click();
  await r.locator('input').first().fill('Pune, Maharashtra');
  await r.getByRole('button', { name: 'Save' }).click();
  check(await appears(page.getByText('Section complete! You now get 4 free AI searches a day.')), '"Section complete! You now get 4 free AI searches a day."');
  check(bonus() === '1', 'the database counts the section');
  check(await appears(card.getByTestId('daily-searches').getByText('4', { exact: true })), 'the card says 4');
  check(await appears(family.getByText('+1 search a day')), 'Family: +1 search a day');
  check(await appears(heading.getByText('+1 search a day', { exact: true })) && await heading.locator('svg').count() > 0, 'and its heading, with a tick');
  await page.screenshot({ path: `${OUT}2-complete.png` });

  log('3. Required answers stay');
  const name = row('Name');
  await name.scrollIntoViewIfNeeded();
  await name.hover();
  await name.getByTitle('Edit').click();
  await name.locator('input').first().fill('');
  await name.getByRole('button', { name: 'Save' }).click();
  check(await appears(page.getByText('Name is required')), '"Name is required"');
  check(sql(`select name <> '' from profiles where id = '${me}';`) === 't', 'the name is kept');
  await name.getByRole('button', { name: 'Cancel' }).click();

  log('4. Four searches a day');
  await page.getByText('Find Match', { exact: true }).first().click();
  check(await appears(page.getByTestId('search-allowance').getByText('3 searches every 5 hours')), '"3 searches every 5 hours" (4 a day)');
  // Three today, in hours since gone
  sql(`insert into search_usage (user_id, day, day_count, week_started_at, week_count)
         values ('${me}', (now() at time zone 'Asia/Kolkata')::date, 3, search_week_start(now()), 3);`);
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  check(await appears(page.getByTestId('search-allowance').getByText('1 search left today')), '"1 search left today" after three searches');
  const search = async () => {
    const box = page.getByTestId('find-match-box');
    await box.fill('someone kind who loves books');
    const responded = page.waitForResponse((res) => res.url().includes('/functions/v1/search'), { timeout: 20000 }).catch(() => null);
    await box.press('Enter');
    return responded;
  };
  const fourth = await search();
  check(fourth?.status() === 200, `the server allows the 4th search (${fourth?.status()})`);
  await page.waitForTimeout(1500);
  check(sql(`select day_count || '/' || daily_search_count from search_usage join profiles on id = user_id where user_id = '${me}';`) === '4/4', 'and counts it');
  await search();
  check(await appears(page.getByText("You've used today's searches")) && await appears(page.getByText('Each profile section you complete adds a search a day.')),
    'the 5th: the limit popup says so and suggests completing sections');
  await page.screenshot({ path: `${OUT}3-limit.png` });
  await page.keyboard.press('Escape');

  log('5. Shaadi24+');
  sql(`update profiles set subscription_tier = 'PRO' where id = '${me}';`);
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  // 4 today, 1 of them in these 5 hours: 14 of the 15 left
  check(await appears(page.getByTestId('search-allowance').getByText(/^14 searches left until /)), 'Find Match: "14 searches left until …"');
  check(await page.getByTestId('earn-searches').count() === 0, 'no offer to earn more');
  await page.getByText('My Profile', { exact: true }).first().click();
  const plusCard = page.getByTestId('profile-rewards');
  check(await appears(plusCard.getByText('searches a day with Shaadi24+')) && await appears(plusCard.getByTestId('daily-searches').getByText('50', { exact: true })),
    'the card: 50 searches a day with Shaadi24+');
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  sql(`update profiles set subscription_tier = '${tier}', is_verified = ${verified === 't'}, daily_search_count = 0 where id = '${me}';
       delete from search_usage where user_id = '${me}';`);
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
