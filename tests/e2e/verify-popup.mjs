// The "Get verified" popup, as one signed-in user (an onboarded account,
// password TestPass!2026): opens full size from the sidebar (it used to be
// squeezed into it), needs two photos (with one, "Add a photo" goes to My
// Profile) and a selfie; links are optional but checked; sends the request,
// reopens as "in review", and is a full-width sheet on a phone. Also: a Pro
// account sees its searches as a number (it once said "Infinity of 3").
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const EMAIL = process.argv[2];
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/shots-verify/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${EMAIL}';`);
const photos = sql(`select array_to_json(photo_urls) from profiles where id = '${me}';`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
sql(`delete from verification_requests where user_id = '${me}';
     update profiles set is_verified = false, verification_status = null, subscription_tier = 'PRO',
       linkedin = null, instagram = null, facebook = null, twitter = null, account_created = now() where id = '${me}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function signIn(viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  return { ctx, page };
}

try {
  const { ctx, page } = await signIn({ width: 1400, height: 900 });
  const line = page.getByTestId('search-allowance');
  await line.waitFor({ timeout: 10000 }).catch(() => {});
  const said = await line.innerText().catch(() => '');
  check(/^\d+ search(es)? (every|left)/.test(said) && !said.includes('Infinity'), `a Pro account sees its searches: "${said}"`);

  log('1. open from the sidebar');
  const first = JSON.parse(photos)[0];
  sql(`update profiles set photo_urls = array['${first}'] where id = '${me}';`);
  await page.reload();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  await page.getByText('Get verified today', { exact: false }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}1-desktop-open.png` });
  const box = await dialog.boundingBox();
  check(box && box.width >= 440 && box.x > 400, `full size and centred over the page (width ${Math.round(box?.width)}, left ${Math.round(box?.x)})`);
  const inBody = await page.evaluate(() => !!document.querySelector('body > div [role=dialog]') && !document.querySelector('aside [role=dialog]'));
  check(inBody, 'rendered at page level, not inside the sidebar');
  check(await dialog.getByTestId('verify-photos').getAttribute('data-ok') === 'false', 'one photo: not enough');
  await dialog.getByRole('button', { name: 'Add a photo' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  check(await page.getByRole('heading', { name: 'Photos' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false),
    '"Add a photo" goes to My Profile');

  log('2. two photos, links checked');
  sql(`update profiles set photo_urls = '${photos.replace(/^\[/, '{').replace(/\]$/, '}')}' where id = '${me}';`);
  await page.reload();
  await page.getByText('Get verified today', { exact: false }).first().click();
  await dialog.waitFor({ timeout: 5000 });
  const send = dialog.getByRole('button', { name: 'Send for review' });
  check(await dialog.getByTestId('verify-photos').getAttribute('data-ok') === 'true', 'two photos: ticked');
  check(await send.isDisabled(), 'Send is off until there is a selfie');
  await dialog.getByTestId('verify-links-toggle').click();
  await dialog.getByLabel('LinkedIn').fill('my linkedin');
  await dialog.getByLabel('Instagram').click();
  check(await dialog.getByText(/Paste the link to your LinkedIn profile/).isVisible(), 'a wrong LinkedIn link is pointed out after leaving the field');
  await dialog.getByTestId('verify-selfie-input').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: PNG });
  check(await send.isDisabled(), 'Send stays off while a link is wrong');
  await dialog.getByLabel('LinkedIn').fill('linkedin.com/in/test-person');
  await dialog.getByLabel('Instagram').fill('https://www.instagram.com/test.person/');
  await dialog.getByLabel('Facebook').click();
  check(await send.isEnabled(), 'good links and a selfie: Send is on');
  await page.screenshot({ path: `${OUT}2-desktop-filled.png` });

  log('3. send');
  await send.click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
  const row = sql(`select linkedin_url || ' | ' || instagram_url || ' | ' || coalesce(facebook_url, '-') || ' | ' || status || ' | ' || (selfie_path like '${me}/selfie_%')
                   from verification_requests where user_id = '${me}';`);
  check(row === 'https://linkedin.com/in/test-person | https://instagram.com/test.person/ | - | pending | true', `saved: ${row}`);
  await page.getByText('Verification pending').first().waitFor({ timeout: 10000 });
  check(true, 'the sidebar says "Verification pending"');

  log('4. reopen while in review');
  await page.getByText('Verification pending').first().click();
  await dialog.waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  check(await dialog.getByText('Verification in review').isVisible(), 'titled "Verification in review"');
  check(await dialog.getByTestId('verify-change').isVisible(), 'offers "Send a new selfie instead"');
  await dialog.getByTestId('verify-change').click();
  await dialog.getByTestId('verify-links-toggle').click();
  check(await dialog.getByLabel('LinkedIn').inputValue() === 'https://linkedin.com/in/test-person', 'links filled in');
  await page.screenshot({ path: `${OUT}3-desktop-pending.png` });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  check(true, 'Escape closes it');
  await ctx.close();

  log('5. phone');
  sql(`delete from verification_requests where user_id = '${me}';
       update profiles set verification_status = null where id = '${me}';`);
  const phone = await signIn({ width: 390, height: 844 });
  await phone.page.locator('button.md\\:hidden').last().click();  // the header's menu button
  await phone.page.waitForTimeout(500);
  await phone.page.getByText('Get verified today', { exact: false }).first().click();
  const sheet = phone.page.getByRole('dialog');
  await sheet.waitFor({ timeout: 5000 });
  await phone.page.waitForTimeout(400);
  await phone.page.screenshot({ path: `${OUT}4-phone.png` });
  const pbox = await sheet.boundingBox();
  check(pbox && pbox.width >= 385, `full width on a phone (${Math.round(pbox?.width)}px)`);
  await phone.ctx.close();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  await browser.close();
  sql(`delete from verification_requests where user_id = '${me}';
       update profiles set verification_status = null, subscription_tier = 'FREE', photo_urls = '${photos.replace(/^\[/, '{').replace(/\]$/, '}')}',
         linkedin = null, instagram = null, facebook = null, twitter = null where id = '${me}';`);
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
