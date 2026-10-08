// Admin → App Preview: the members' app inside the admin panel, for admins
// only (lib/appPreview.ts, components/website/AppPreview.tsx,
// components/admin/AdminAppTab.tsx), against the website's dev server
// WITHOUT VITE_MEMBERS_ON_WEB (BASE_URL, default http://localhost:3002):
//  1. /app-preview signed out: refused, with the way to the admin panel
//  2. A member signed in on the website: refused
//  3. An admin: the App Preview tab shows the members' app phone-sized; it
//     signs in with email only (a note says Google and Apple are tried in the
//     phone apps), here as a member, while the admin panel stays signed in as
//     the admin: two sign-ins, each under its own key. No cookie banner, as
//     in the phone apps
//  4. Phone sizes; Reload; Open in a new tab
//  5. Signing out of the preview leaves the admin panel signed in
//  6. The admin's own account in the preview: its admin panel has no App
//     Preview tab (no preview inside the preview)
// Usage: node app-preview.mjs <admin email> <member email>   (password TestPass!2026)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3002';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) {
  console.error('usage: node app-preview.mjs <admin email> <member email>');
  process.exit(2);
}
const PASSWORD = 'TestPass!2026';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 15000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

async function signIn(where, email) {
  await where.getByRole('button', { name: /Continue with Email/ }).click();
  await where.locator('input[type=email]').fill(email);
  await where.locator('input[type=password]').fill(PASSWORD);
  await where.locator('form').getByRole('button', { name: /Log In/i }).click();
}

// Who each sign-in on the website is: Supabase's usual key, and the preview's
const signIns = (page) => page.evaluate(() => {
  const who = (raw) => { try { return JSON.parse(raw)?.user?.email ?? null; } catch { return null; } };
  const site = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
  return { website: site ? who(localStorage.getItem(site)) : null, preview: who(localStorage.getItem('shaadi24-app-preview-auth')) };
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  log('1. Signed out');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await ctx.newPage();
  await page.goto(`${BASE}/app-preview`);
  const refused = page.getByTestId('app-preview-refused');
  check(await appears(refused) && /Sign in to the admin panel first/.test(await refused.innerText()), 'refused, signed out');
  check(await refused.getByRole('link', { name: 'Go to the admin panel' }).getAttribute('href') === '/admin', 'with the way to the admin panel');
  check(await page.getByText('Find your life partner').count() === 0, "no members' app");

  log('2. A member signed in on the website');
  await page.goto(`${BASE}/admin`);
  await signIn(page, MEMBER);
  check(await appears(page.getByTestId('not-an-admin')), 'the member is told the website is for the team');
  await page.goto(`${BASE}/app-preview`);
  check(await appears(refused) && /isn't an admin/.test(await refused.innerText()), 'refused, not an admin');
  await ctx.close();

  log('3. An admin');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/admin`);
  await signIn(page, ADMIN);
  const tab = page.getByRole('button', { name: 'App preview', exact: true });
  check(await appears(tab), 'the admin panel has an App Preview tab');
  // On a phone the tabs wrap, so App Preview stays in view
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const box = await tab.boundingBox();
  check(!!box && box.x >= 0 && box.x + box.width <= 390, 'on a phone-sized screen the App Preview tab is in view');
  await page.setViewportSize({ width: 1280, height: 900 });
  await tab.click();
  check(await appears(page.getByTestId('admin-app-tab').getByText(/Only admins can open it/)), 'what the preview is');
  const frameEl = page.getByTestId('app-preview-frame');
  check(await appears(frameEl), 'the phone frame');
  check(await frameEl.getAttribute('width') === '393' && await frameEl.getAttribute('height') === '852', 'an iPhone 16 screen (393 × 852)');
  const app = page.frameLocator('[data-testid=app-preview-frame]');
  check(await appears(app.getByTestId('welcome'), 20000), "the members' welcome screen in it");
  await app.getByRole('button', { name: 'Sign in' }).first().click();
  check(await appears(app.getByTestId('preview-sign-in-note')), 'sign-in: the note about Google and Apple');
  check(await app.getByText('Continue with Google').count() === 0, 'no Google button in the preview');
  await signIn(app, MEMBER);
  check(await appears(app.getByTestId('find-match-box'), 25000), 'signed in to the preview as the member: Find Match');
  await page.waitForTimeout(1500);
  check(await app.getByText('We respect your privacy').count() === 0, 'no cookie banner, as in the phone apps');
  let who = await signIns(page);
  check(who.website === ADMIN && who.preview === MEMBER, `two sign-ins: the website as the admin, the preview as the member (${who.website} / ${who.preview})`);
  await page.reload();
  check(await appears(page.getByRole('heading', { name: /Admin Panel/ })), 'the admin panel is still signed in after a reload');

  log('4. Phone sizes, Reload, a new tab');
  await page.getByRole('button', { name: 'App preview', exact: true }).click();
  await page.getByRole('button', { name: 'iPhone SE', exact: true }).click();
  check(await frameEl.getAttribute('width') === '375' && await frameEl.getAttribute('height') === '667', 'iPhone SE (375 × 667)');
  await page.getByRole('button', { name: 'Android (Pixel 8)', exact: true }).click();
  check(await frameEl.getAttribute('width') === '412' && await frameEl.getAttribute('height') === '915', 'Android (412 × 915)');
  check(await page.getByText(/Shown at \d+% to fit your screen/).isVisible(), 'a tall phone is scaled to fit, and says so');
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  check(await appears(app.getByTestId('find-match-box'), 25000), 'after Reload: still signed in as the member');
  const [tabPage] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('link', { name: /Open in a new tab/ }).click()]);
  check(await appears(tabPage.getByTestId('find-match-box'), 25000) && new URL(tabPage.url()).pathname === '/app-preview',
    'Open in a new tab: the app at full size, signed in as the member');
  await tabPage.close();

  log('5. Signing out of the preview');
  await app.locator('main button.md\\:hidden').first().click();
  await app.getByTitle('Sign out').click();
  // (Find Match has the welcome screen's heading too: its Sign in button tells them apart)
  check(await appears(app.getByRole('button', { name: 'Sign in' }), 20000), 'the preview is signed out');
  who = await signIns(page);
  check(who.website === ADMIN && !who.preview, 'the admin panel is still signed in');
  check(await page.getByRole('heading', { name: /Admin Panel/ }).isVisible(), 'and still shows the panel');

  log("6. The admin's own account in the preview");
  await app.getByRole('button', { name: 'Sign in' }).first().click();
  await signIn(app, ADMIN);
  await app.locator('main button.md\\:hidden').first().click().catch(() => {});
  const adminItem = app.getByRole('button', { name: /^🛡️\s*Admin$|^Admin$/ }).filter({ visible: true }).first();
  if (await appears(adminItem, 20000)) {
    await adminItem.click();
    check(await appears(app.getByRole('button', { name: 'Errors', exact: true }).or(app.getByRole('button', { name: 'errors', exact: true }))),
      "the admin panel inside the preview");
    check(await app.getByRole('button', { name: 'App preview', exact: true }).count() === 0, 'without an App Preview tab');
  } else {
    check(false, "the members' app shows the admin its Admin page");
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`);
  await ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 2).join(' / '));
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
