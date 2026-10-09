// What Indian law asks of Shaadi24 (docs/legal/README.md), against the website
// as it is live (WEBSITE_URL, default http://localhost:3002), the members' app
// (BASE_URL, default http://localhost:3000) and the local stack:
//  1. The website: Terms, Privacy, Grievances, Safety and Refunds at their own
//     addresses and in the home page's footer, each with a Hindi summary and
//     fitting a phone; the home page says Shaadi24 is for marriage only
//  2. A complaint from someone who isn't a member: a ticket at once, the
//     deadline the law sets, an alert for the admins
//  3. The admin's Complaints tab: the complaint and its deadline; closing it
//     needs a note of what was done, and goes in the audit log
//  4. In the app: the menu, and Settings → Make a complaint, open the Grievance
//     page with the member's name and email filled in; reporting someone offers the reasons
//     the law treats urgently, and the admin's Reports tab shows the deadline
// Usage: node legal-pages.mjs <admin email> <member email>   (password TestPass!2026;
//   DB_CONTAINER as the other tests)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const WEBSITE = process.env.WEBSITE_URL || 'http://localhost:3002';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node legal-pages.mjs <admin email> <member email>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/legal/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const PAGES = [
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/grievances', 'Grievance Redressal'],
  ['/safety', 'Community Guidelines and Safety'],
  ['/refunds', 'Refund and Cancellation Policy'],
];
const COMPLAINANT = `complainant_${Date.now()}@example.com`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  log('1. The website\'s legal pages');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WEBSITE);
  const declaration = page.getByTestId('matrimony-only');
  check(await appears(declaration) && /for marriage only\. It is not a dating website/.test(await declaration.innerText()),
    'the home page: for marriage only, not dating (the 2016 advisory)');
  const footer = page.locator('footer');
  for (const [path] of PAGES) check(await footer.locator(`a[href="${path}"]`).count() === 1, `the footer links ${path}`);
  for (const [path, title] of PAGES) {
    await page.goto(`${WEBSITE}${path}`);
    check(await appears(page.getByRole('heading', { level: 1, name: title })), `${path}: ${title}`);
    check(await page.locator('section[lang="hi"]').count() === 1, `${path}: a summary in Hindi`);
  }
  await ctx.close();

  // At phone width, in dark mode: nothing wider than the screen
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  page = await ctx.newPage();
  for (const [path] of PAGES) {
    await page.goto(`${WEBSITE}${path}`);
    await page.locator('h1').first().waitFor();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 390, `${path} fits a phone (${width}px)`);
  }
  await page.goto(`${WEBSITE}/grievances`);
  await page.getByTestId('grievance-form').waitFor();
  await page.screenshot({ path: `${OUT}1-grievances-phone.png`, fullPage: true });
  await ctx.close();

  log('2. A complaint from someone who isn\'t a member');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(`${WEBSITE}/grievances`);
  const form = page.getByTestId('grievance-form');
  await form.waitFor();
  await page.getByRole('button', { name: 'Send complaint' }).click();
  check(await appears(page.getByText('Please choose what your complaint is about.')), 'the form says what\'s missing');
  await page.getByLabel('What is your complaint about?').selectOption('impersonation');
  check(await appears(page.getByText('Removed within 2 hours of your complaint.')), 'the category says how fast we act');
  await page.getByLabel('Your name').fill('Asha Complainant');
  await page.getByLabel('Your email address').fill(COMPLAINANT);
  await page.getByLabel(/Which profile, message or payment/).fill('A profile using my photos, "Asha K", Pune');
  await page.getByLabel('What happened?').fill('Someone made a profile with my photos and name. Please remove it.');
  await page.getByRole('button', { name: 'Send complaint' }).click();
  const done = page.getByTestId('grievance-done');
  check(await appears(done), 'the complaint is received');
  const doneText = await done.innerText();
  const ticket = doneText.match(/SH24-\d+/)?.[0];
  check(!!ticket, `with a ticket number at once (${ticket})`);
  check(doneText.includes(COMPLAINANT) && /at the latest by/.test(doneText), 'and when the answer will come, by email');
  await page.screenshot({ path: `${OUT}2-complaint-received.png` });
  const row = sql(`select category || '|' || status || '|' || (due_at = created_at + interval '2 hours') || '|' || (user_id is null)
                   from grievances where ticket = '${ticket}'`);
  check(row === 'impersonation|open|true|true', `stored: impersonation, open, due in 2 hours, from a visitor (${row})`);
  const alert = sql(`select count(*) from push_queue q join profiles p on p.id = q.user_id
                     where q.event_type = 'admin_grievance' and p.email = '${ADMIN}' and q.body like '${ticket}:%'`);
  check(alert === '1', 'the admins get an alert');
  await ctx.close();

  log('3. The admin\'s Complaints tab');
  ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page = await ctx.newPage();
  await page.goto(`${WEBSITE}/admin`);
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(ADMIN);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByRole('button', { name: /^Complaints$/ }).click();
  const item = page.getByTestId('admin-grievance').filter({ hasText: ticket });
  check(await appears(item, 15000), `the complaint is listed (${ticket})`);
  check(/due in (1h|2h|\d+m)/.test(await item.innerText()), `with its deadline (${(await item.innerText()).split('\n').pop()})`);
  await item.getByRole('button').first().click();
  await item.getByRole('button', { name: 'Resolved' }).click();
  check(await appears(page.getByText('Write what was done (it goes in the record).')), 'closing it needs a note of what was done');
  await item.getByLabel(/What was done/).fill('Removed the profile and banned the account; told her by email.');
  await page.screenshot({ path: `${OUT}3-admin-complaint.png` });
  await item.getByRole('button', { name: 'Resolved' }).click();
  check(await appears(page.getByText(`${ticket} closed.`)), 'closed');
  const closed = sql(`select status || '|' || (resolved_at is not null) || '|' || (select count(*) from admin_audit a
                       where a.action = 'grievance_resolved' and a.details ->> 'grievance_id' = g.id::text)
                      from grievances g where ticket = '${ticket}'`);
  check(closed === 'resolved|true|1', `resolved, with the time and in the audit log (${closed})`);
  await ctx.close();

  log('4. In the app');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  page = await ctx.newPage();
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(MEMBER);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  // "Prominently published": one step from the home screen (IT Rules 3(2)(a), Explanation)
  await page.getByTestId('sidebar-grievances').click();
  check(await appears(page.getByRole('heading', { level: 1, name: 'Grievance Redressal' })), 'the app\'s menu opens the Grievance page directly');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 15000 });
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Make a complaint (Grievance Officer)' }).click();
  check(await appears(page.getByRole('heading', { level: 1, name: 'Grievance Redressal' })), 'Settings → Make a complaint opens the Grievance page');
  const memberName = sql(`select name from profiles where email = '${MEMBER}'`);
  check(await page.getByLabel('Your name').inputValue() === memberName && await page.getByLabel('Your email address').inputValue() === MEMBER,
    'with the member\'s name and email filled in');
  await page.getByRole('button', { name: 'Back' }).click();

  // Report someone from their profile
  await page.goto(APP);
  const box = page.getByTestId('find-match-box');
  await box.waitFor({ timeout: 20000 });
  await box.fill('someone kind');
  const responded = page.waitForResponse((r) => r.url().includes('/functions/v1/search'), { timeout: 20000 });
  await box.press('Enter');
  await responded;
  await page.locator('h3').first().click();
  await page.getByText('Profile Details').first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'More options' }).first().click();
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  const reasons = await page.locator('input[name="report_reason"]').evaluateAll((els) => els.map((e) => e.value));
  check(reasons.includes('intimate_images') && reasons.includes('dowry'), `the reasons include intimate photos and dowry (${reasons.join(', ')})`);
  await page.locator('input[name="report_reason"][value="intimate_images"]').check();
  await page.getByPlaceholder('Tell us more about what happened.').fill('Test report: threatened to share photos.');
  await page.screenshot({ path: `${OUT}4-report.png` });
  await page.getByRole('button', { name: 'Submit Report' }).click();
  const reported = sql(`select count(*) from reports r join profiles p on p.id = r.reporter_id
                        where p.email = '${MEMBER}' and r.reason = 'intimate_images' and r.created_at > now() - interval '2 minutes'`);
  check(reported === '1', 'the report is saved with its reason');
  const urgent = sql(`select count(*) from push_queue q join profiles p on p.id = q.user_id
                      where p.email = '${ADMIN}' and q.event_type = 'admin_report' and q.title like '%within 2 hours%'
                        and q.created_at > now() - interval '2 minutes'`);
  check(urgent === '1', 'the admins are told to act within 2 hours');
  await ctx.close();

  ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  page = await ctx.newPage();
  await page.goto(`${WEBSITE}/admin`);
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(ADMIN);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByRole('button', { name: /^reports$/i }).click();
  check(await appears(page.getByText(/act within \d+h/).first(), 15000), 'Admin → Reports shows how long is left to act');
  check(await appears(page.getByText('intimate images').first()), 'and the reason, readably');
  await page.screenshot({ path: `${OUT}5-admin-reports.png` });
  await ctx.close();

  check(errors.length === 0, `no page errors (${errors.join(' | ').slice(0, 200)})`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  // What this run made
  sql(`delete from grievances where email = '${COMPLAINANT}';
       delete from reports r using profiles p where p.id = r.reporter_id and p.email = '${MEMBER}' and r.details like 'Test report:%';`);
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
