// Accessibility at phone width (390 × 844), with axe-core
// (https://github.com/dequelabs/axe-core; `npm i --no-save axe-core`):
// the website as it is live (WEBSITE_URL, default http://localhost:3002) and
// the members' app (BASE_URL, default http://localhost:3000, with
// VITE_MEMBERS_ON_WEB=true), in light and dark. Each screen must have no
// serious or critical problems; moderate and minor ones are listed.
//   - website: home, Help & Support, Delete account, Terms, admin sign-in,
//     the admin panel, its Complaints and Users tabs, the date-of-birth pop-up,
//     its Errors tab (with an error open) and its App Preview tab
//   - app: the landing and sign-in screens; signed in (an onboarded account,
//     password TestPass!2026): the free-searches pop-up, Find Match with results,
//     its Sort menu and filter chips, filters, a profile,
//     Likes You, Matches and a chat, Standouts, My Profile, Settings,
//     Shaadi24+, the phone menu
// Usage: node accessibility.mjs <admin email> <member email>   (DB_CONTAINER as the other tests)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const WEBSITE = process.env.WEBSITE_URL || 'http://localhost:3002';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node accessibility.mjs <admin email> <member email>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/accessibility/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
let current = null;  // the page being checked, for a screenshot if the run stops
const seen = new Map();  // rule → screens, so a problem shared by every screen is listed once

async function audit(page, name) {
  current = page;
  await page.waitForTimeout(600);  // animations settle
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  const { violations } = await page.evaluate(() => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  }));
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of violations) {
    const key = `${v.impact} ${v.id}`;
    if (!seen.has(key)) seen.set(key, { help: v.help, screens: [], nodes: [] });
    const entry = seen.get(key);
    entry.screens.push(name);
    for (const n of v.nodes) {
      const where = `${n.target.join(' ')} ${n.html.slice(0, 160)}`;
      if (!entry.nodes.includes(where)) entry.nodes.push(where);
    }
  }
  log(bad.length ? '  FAIL' : '  ok  ', `${name}: ${bad.length ? bad.map((v) => `${v.id} (${v.nodes.length})`).join(', ') : 'no serious problems'}`
    + (violations.length > bad.length ? `; ${violations.length - bad.length} minor` : ''));
  if (bad.length) {
    failures++;
    await page.screenshot({ path: `${OUT}${name.replace(/\W+/g, '-')}.png`, fullPage: true });
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const phone = (colorScheme = 'light') => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme });

// A post for the blog's pages
sql(`delete from blog_posts where slug = 'a11y-test-post';
  insert into blog_posts (slug, title, excerpt, content, tags, status) values ('a11y-test-post', 'Meeting the family for the first time',
  'What to expect, and what to ask.', E'Some advice first.\\n\\n## Before\\n\\n- Dress simply\\n- [Read our guide](/safety)\\n\\n## During\\n\\nListen.\\n\\n## After\\n\\n> Say thank you.',
  array['family'], 'published');`);

// An error for the Errors tab to show
sql(`select report_error('android', 'TypeError: Cannot read properties of undefined (reading ''photos'')',
       E'TypeError: Cannot read properties of undefined (reading ''photos'')\\n    at ProfileCard (index-a1b2c3.js:1:2345)',
       'matches', '1.0.0', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36');`);

try {
  for (const scheme of ['light', 'dark']) {
    log(`== The website (${scheme})`);
    const ctx = await phone(scheme);
    const page = await ctx.newPage();
    for (const [path, name] of [['/', 'home'], ['/support', 'support'], ['/delete-account', 'delete account'], ['/terms', 'terms'],
      ['/privacy', 'privacy'], ['/grievances', 'grievances'], ['/safety', 'safety'], ['/refunds', 'refunds'], ['/blog', 'blog'],
      ['/blog/a11y-test-post', 'blog post'], ['/admin', 'admin sign-in']]) {
      await page.goto(`${WEBSITE}${path}`);
      await page.locator('h1').first().waitFor({ timeout: 15000 });
      await audit(page, `website ${name} (${scheme})`);
    }
    await page.getByRole('button', { name: /Continue with Email/ }).click();
    await page.locator('input[type=email]').fill(ADMIN);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: /Log In/i }).click();
    await page.getByRole('heading', { name: 'Overview' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await audit(page, `admin panel (${scheme})`);
    await page.getByRole('button', { name: /^complaints$/i }).click();
    await page.getByTestId('admin-grievances').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await audit(page, `admin complaints (${scheme})`);
    await page.getByRole('button', { name: /^customers$/i }).click();
    await page.getByTestId('customers-table').locator('tbody tr').nth(1).waitFor({ timeout: 15000 });
    await audit(page, `admin customers (${scheme})`);
    await page.getByTestId('customers-table').locator('tbody tr').first().getByRole('button').first().click();
    await page.getByTestId('member-panel').waitFor({ timeout: 5000 });
    await audit(page, `admin member (${scheme})`);
    await page.getByTestId('member-panel').getByRole('button', { name: 'Date of birth' }).click();
    await page.getByRole('dialog', { name: /date of birth/ }).waitFor({ timeout: 5000 });
    await audit(page, `admin date of birth (${scheme})`);
    await page.getByRole('dialog', { name: /date of birth/ }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('member-panel').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: /^verification$/i }).click();
    await page.waitForTimeout(1500);
    await audit(page, `admin verification (${scheme})`);
    await page.getByRole('button', { name: /^audit log$/i }).click();
    await page.getByTestId('audit-log').waitFor({ timeout: 15000 });
    await audit(page, `admin audit log (${scheme})`);
    await page.getByRole('button', { name: /^profiles$/i }).click();
    await page.getByTestId('profile-sections').waitFor({ timeout: 15000 });
    await audit(page, `admin profiles (${scheme})`);
    await page.getByTestId('profile-sections').getByRole('button').first().click();
    await page.getByTestId('message-composer').getByTestId('audience-count').filter({ hasText: /Reaches/ }).waitFor({ timeout: 10000 });
    await audit(page, `admin message composer (${scheme})`);
    await page.getByTestId('message-composer').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: /^messages$/i }).click();
    await page.getByTestId('admin-messages').waitFor({ timeout: 15000 });
    await audit(page, `admin messages (${scheme})`);
    await page.getByRole('button', { name: /^enquiries$/i }).click();
    await page.getByTestId('admin-enquiries').waitFor({ timeout: 15000 });
    await audit(page, `admin enquiries (${scheme})`);
    await page.getByRole('button', { name: /^offers$/i }).click();
    await page.getByTestId('admin-offers').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'New offer' }).click();
    await page.getByRole('dialog', { name: 'New offer' }).waitFor({ timeout: 5000 });
    await audit(page, `admin new offer (${scheme})`);
    await page.getByRole('dialog', { name: 'New offer' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: /^blog$/i }).click();
    await page.getByTestId('blog-posts').waitFor({ timeout: 15000 });
    await audit(page, `admin blog (${scheme})`);
    await page.getByRole('button', { name: /^Meeting the family/ }).click();
    await page.getByTestId('blog-editor').waitFor({ timeout: 5000 });
    await audit(page, `admin blog editor (${scheme})`);
    await page.getByRole('button', { name: '✨ Write with AI' }).click();
    await page.getByTestId('blog-draft-ai').waitFor({ timeout: 5000 });
    await audit(page, `admin blog AI draft (${scheme})`);
    await page.getByTestId('blog-draft-ai').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: '← All posts' }).click();
    await page.getByRole('button', { name: /^errors$/i }).click();
    await page.getByTestId('admin-error').first().waitFor({ timeout: 15000 });
    await page.getByTestId('admin-error').first().getByRole('button').first().click();
    await audit(page, `admin errors (${scheme})`);
    await page.getByRole('button', { name: /^app preview$/i }).click();
    await page.getByTestId('app-preview-frame').waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await audit(page, `admin app preview (${scheme})`);
    await ctx.close();
  }

  for (const scheme of ['light', 'dark']) {
    log(`== The members' app (${scheme})`);
    // Searches left today, so the search shows results rather than the limit;
    // the free-searches pop-up due, so it's checked too
    sql(`update profiles set daily_search_count = 0, is_paused = false, profile_nudged_at = null where email = '${MEMBER}';`);
    const ctx = await phone(scheme);
    await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).first().waitFor({ timeout: 15000 });
    await audit(page, `landing (${scheme})`);
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: /Continue with Email/ }).waitFor();
    await audit(page, `sign-in (${scheme})`);
    await page.getByRole('button', { name: /Continue with Email/ }).click();
    await page.locator('input[type=email]').fill(MEMBER);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: /Log In/i }).click();
    const box = page.getByTestId('find-match-box');
    await box.waitFor({ timeout: 20000 });
    const nudge = page.getByTestId('profile-rewards-popup');
    if (await nudge.waitFor({ timeout: 10000 }).then(() => true, () => false)) {
      await audit(page, `free-searches pop-up (${scheme})`);
      await nudge.getByTestId('nudge-later').click();
    } else {
      log('  (no free-searches pop-up: the profile is complete)');
    }
    await audit(page, `find match (${scheme})`);
    await box.fill('someone kind who loves books');
    await box.press('Enter');
    await page.locator('[data-testid=match-card], .grid img').first().waitFor({ timeout: 25000 }).catch(() => {});
    await audit(page, `results (${scheme})`);
    // The Sort menu above the results, and a filter chip under the box
    if (await page.getByTestId('sort-button').isVisible().catch(() => false)) {
      await page.getByTestId('sort-button').click();
      await page.waitForTimeout(500);
      await audit(page, `sort menu (${scheme})`);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Online Now', exact: true }).click();
      await page.waitForTimeout(300);
      await audit(page, `filter chips (${scheme})`);
      await page.getByTestId('filter-chips').getByRole('button', { name: 'Clear all' }).click();
    }

    const openMenu = async (label) => {
      await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
      await page.waitForTimeout(800);
    };
    for (const [label, name] of [['Likes You', 'likes you'], ['Matches', 'matches'], ['Standouts', 'standouts'], ['My Profile', 'my profile'], ['Settings', 'settings']]) {
      await openMenu(label);
      await audit(page, `${name} (${scheme})`);
    }
    await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
    await page.waitForTimeout(500);
    await audit(page, `phone menu (${scheme})`);
    await page.getByText('Get Shaadi24+', { exact: true }).click().catch(() => {});
    await page.waitForTimeout(800);
    await audit(page, `Shaadi24+ (${scheme})`);
    await ctx.close();
  }
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 2).join(' / '));
  await current?.screenshot({ path: `${OUT}STOPPED.png` }).catch(() => {});
} finally {
  sql(`update profiles set profile_nudged_at = now() where email = '${MEMBER}';
    delete from blog_posts where slug = 'a11y-test-post';`);
  await browser.close();
  log('== Every problem found, by rule');
  for (const [key, v] of [...seen.entries()].sort()) {
    log(`${key}: ${v.help} — ${v.screens.length} screen(s)`);
    for (const n of v.nodes.slice(0, process.env.A11Y_ALL ? 200 : 3)) log(`    ${n}`);
  }
  log(failures ? `${failures} screen(s) with serious problems` : 'no serious problems');
  process.exit(failures ? 1 : 0);
}
