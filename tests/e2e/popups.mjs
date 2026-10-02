// Every popup sits on the same light, see-through blur (.popup-backdrop in
// index.css) that covers the whole window: sign-in (light and dark; no white
// line behind it, which an empty second popup box used to draw; scrolls on a
// short screen), then, signed in as one user (an onboarded account, password
// TestPass!2026): the like confirmation on a match card (it used to be
// squeezed into the card), the profile, filters, MatchGPT+, verify and
// delete-account popups, and the phone menu.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';  // `docker ps` shows the name
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node popups.mjs <email>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/popups/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const started = sql('select now();');
// Free (so liking asks first), unverified but inside the 3 days to verify, searches and likes left
sql(`delete from likes where liker_id = '${me}';
     delete from verification_requests where user_id = '${me}';
     update profiles set subscription_tier = 'FREE', is_verified = false, verification_status = null,
       account_created = now(), daily_search_count = 0, daily_like_count = 0, is_paused = false where id = '${me}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function newPage(viewport, colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  return page;
}

// The showing backdrops: where they are and how they look
const backdrops = (page) => page.evaluate(() => [...document.querySelectorAll('.popup-backdrop')]
  .map((el) => ({ r: el.getBoundingClientRect(), s: getComputedStyle(el) }))
  .filter(({ s }) => s.opacity !== '0' && s.display !== 'none')
  .map(({ r, s }) => ({ x: r.x, y: r.y, w: r.width, h: r.height, bg: s.backgroundColor, blur: s.backdropFilter })));

async function checkBackdrop(page, name, colorScheme = 'light') {
  await page.waitForTimeout(500);  // fade-in
  const { width, height } = page.viewportSize();
  const shown = await backdrops(page);
  const wash = colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.25)';
  check(shown.length === 1, `${name}: one see-through backdrop (${shown.length})`);
  check(shown.some((b) => b.x === 0 && b.y === 0 && b.w === width && b.h === height),
    `${name}: it covers the whole window ${JSON.stringify(shown.map(({ x, y, w, h }) => [x, y, w, h]))}`);
  check(shown.every((b) => b.bg === wash && /blur\(6px\)/.test(b.blur)), `${name}: a light wash and a 6px blur, not a dark shade`);
  await page.screenshot({ path: `${OUT}${name}.png` });
}

try {
  log('1. sign-in popup, light and dark');
  for (const scheme of ['light', 'dark']) {
    const page = await newPage({ width: 1440, height: 900 }, scheme);
    await page.goto(BASE);
    await page.locator('textarea').fill('Someone kind who loves travel');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Continue with Email/ }).waitFor();
    await checkBackdrop(page, `signin-${scheme}`, scheme);
    // The empty second box was a 448 x 2 px bar across the middle of the screen
    const bars = await page.evaluate(() => [...document.querySelectorAll('.popup-backdrop *')]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 300 && r.height > 0 && r.height < 6).length);
    check(bars === 0, `signin-${scheme}: no thin bar behind the popup`);
    await page.locator('.popup-backdrop button').first().click();  // the X
    await page.waitForTimeout(300);
    check((await backdrops(page)).length === 0, `signin-${scheme}: X closes it`);
    await page.context().close();
  }

  log('2. sign-in popup on a short screen');
  {
    const page = await newPage({ width: 390, height: 420 });
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Create Account/ }).click();
    await page.waitForTimeout(400);
    await page.locator('.popup-backdrop').evaluate((el) => el.scrollTo(0, 0));
    const top = await page.evaluate(() => document.querySelector('.popup-backdrop > div').getBoundingClientRect().top);
    check(top >= 0, `the card's top is on screen (${Math.round(top)}px), not cut off`);
    await page.locator('.popup-backdrop').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(200);
    check(await page.locator('form').getByRole('button', { name: /Create Account/ }).isVisible(), 'scrolls down to Create Account');
    await page.screenshot({ path: `${OUT}signin-short-screen.png` });
    await page.context().close();
  }

  log('3. signed in: search, then the like confirmation on a card');
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  const box = page.getByPlaceholder(/Describe your ideal match/);
  await box.waitFor({ timeout: 15000 });
  await box.fill('someone kind');
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 });
  await box.press('Enter');
  check((await responded).status() === 200, 'search ran');
  await page.waitForTimeout(1500);

  const like = page.getByRole('button', { name: 'Like', exact: true }).first();
  await like.click();
  await page.getByText(/likes remaining today/).waitFor({ timeout: 5000 });
  await checkBackdrop(page, 'like-confirm');
  await page.mouse.click(20, 20);  // outside the popup
  await page.waitForTimeout(400);
  check((await backdrops(page)).length === 0, 'a click outside closes it');
  check(!(await page.getByText('Profile Details').first().isVisible().catch(() => false)),
    "and doesn't open the profile of the card underneath");
  await like.click();
  await page.getByRole('button', { name: 'Yes, Like' }).click();
  await page.waitForTimeout(1500);
  check(sql(`select count(*) from likes where liker_id = '${me}';`) === '1', '"Yes, Like" still sends the like');
  if (await page.getByText("It's a Match!").isVisible().catch(() => false)) await page.getByText('Keep Searching').click();

  log('4. profile popup');
  await page.locator('h3').first().click();
  await page.getByText('Profile Details').first().waitFor({ timeout: 5000 });
  await checkBackdrop(page, 'profile');
  await page.mouse.click(10, 450);
  await page.waitForTimeout(400);

  log('5. filters drawer');
  await page.getByTitle('Filters').click();
  await page.getByText('Refine your search pool').waitFor({ timeout: 5000 });
  await checkBackdrop(page, 'filters');
  await page.mouse.click(20, 450);
  await page.waitForTimeout(500);

  log('6. MatchGPT+ and verify popups from the sidebar');
  await page.getByText('Get MatchGPT+', { exact: true }).click();
  await checkBackdrop(page, 'upgrade');
  await page.mouse.click(20, 20);
  await page.waitForTimeout(400);
  await page.getByText('Get verified today', { exact: true }).click();
  await checkBackdrop(page, 'verify');
  await page.mouse.click(20, 20);
  await page.waitForTimeout(400);

  log('7. delete-account popup');
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await checkBackdrop(page, 'delete-account');
  await page.locator('.popup-backdrop button').first().click();
  await page.waitForTimeout(300);

  log('8. phone menu');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.locator('main button.md\\:hidden').first().click();
  await checkBackdrop(page, 'phone-menu');
} catch (e) {
  failures++;
  log('ERROR', e.message.split('\n')[0]);
}

await browser.close();
sql(`delete from likes where liker_id = '${me}';
     delete from matches where '${me}' in (user_a_id, user_b_id) and created_at >= '${started}';`);
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
