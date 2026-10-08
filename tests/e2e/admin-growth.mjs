// Admin → Profiles, Messages, Enquiries and Offers, end to end:
//   1. Profiles: how complete profiles are; "Message them" on Family opens a ready message to the
//      members whose Family section isn't complete, with how many it reaches; sending it
//   2. Messages: it's listed with how many it went to; each got it in the app and as a notification
//   3. The member: the message shows as a card when they open the app; its button opens Family in
//      My Profile, and it's marked as tapped
//   4. Enquiries: the contact form on the website's Support page lands in the inbox (a count in the
//      sidebar), with a reply link and Close
//   5. Offers: a new offer shows as a banner on the website's home page with its code and the stores'
//      redeem links; turned off, it's gone
//   6. Signed out, nobody reads enquiries, messages or offers that aren't running
// Usage: node admin-growth.mjs <admin email> <member email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { CONSENTED } from './fixtures.mjs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const SITE = process.env.SITE_URL || 'http://localhost:3002';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node admin-growth.mjs <admin email> <member email>'); process.exit(2); }
const OUT = new URL('./.shots/admin-growth/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const FAMILY = ['family_type', 'family_status', 'family_values', 'father_occupation', 'mother_occupation', 'brothers', 'sisters',
  'family_location', 'living_with_family', 'family_closeness', 'about_family'];
const member = sql(`select id from profiles where email = '${MEMBER}';`);
const familyWas = sql(`select row_to_json(x) from (select ${FAMILY.join(', ')} from profiles where id = '${member}') x;`);
const TITLE = `Test: Tell matches about your family ${Date.now()}`;
const ENQUIRER = `enquiry_test_${Date.now()}@example.com`;
const CODE = `TESTCODE${Date.now() % 100000}`;
const cleanup = () => sql(`delete from admin_messages where title like 'Test: %';
  delete from enquiries where email like 'enquiry_test_%';
  delete from offers where code like 'TESTCODE%';`);
cleanup();
sql(`insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;
     set session_replication_role = replica;
     update profiles set ${FAMILY.map((c) => `${c} = null`).join(', ')}, ${CONSENTED} where id = '${member}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const signIn = async (page, email) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
};

const page = await newPage();
try {
  // ---- 1. Profiles ----------------------------------------------------------------------------
  log('1. Profiles');
  await signIn(page, ADMIN);
  await page.getByText('Admin', { exact: true }).first().click();
  const sidebar = page.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  check((await Promise.all(['Profiles', 'Messages', 'Offers', 'Enquiries'].map((name) => sidebar.getByRole('button', { name, exact: true }).isVisible())))
    .every(Boolean), 'Profiles, Messages, Offers and Enquiries are in the sidebar');
  await sidebar.getByRole('button', { name: 'Profiles', exact: true }).click();
  const sections = page.getByTestId('profile-sections');
  await sections.waitFor({ timeout: 20000 });
  check((await sections.locator('tbody tr').count()) === 6, 'the six sections, each with how many completed it');
  check(await page.getByText('Answers most often missing').isVisible(), 'and the answers most often missing');
  await page.screenshot({ path: `${OUT}1-profiles.png` });
  await sections.locator('tr', { hasText: 'Family' }).getByRole('button', { name: /^Message them/ }).click();
  const composer = page.getByTestId('message-composer');
  await composer.waitFor();
  check(await composer.getByLabel('Title').inputValue() === 'Tell matches about your family'
    && (await composer.getByLabel('Send to').locator('option:checked').innerText()) === 'Family not complete'
    && (await composer.getByLabel('Button opens').locator('option:checked').innerText()) === 'My Profile → Family'
    && await composer.getByLabel('Button text').inputValue() === 'Fill in Family', 'a ready message: to those without Family, its button opens Family');
  await composer.getByTestId('audience-count').filter({ hasText: /Reaches \d+ member/ }).waitFor({ timeout: 10000 });
  const reach = Number((await composer.getByTestId('audience-count').innerText()).match(/Reaches ([\d,]+)/)[1].replace(/,/g, ''));
  const expected = Number(sql(`select count(*) from profiles p where not coalesce(is_banned, false) and coalesce(onboarding_complete, false)
    and exists (select 1 from jsonb_array_elements(profile_sections(p)) s where s->>'id' = 'family' and not (s->>'complete')::boolean);`));
  check(reach === expected && reach >= 1, `it says how many it reaches (${reach}; ${expected} in the database)`);
  await composer.getByLabel('Title').fill(TITLE);
  await page.screenshot({ path: `${OUT}2-composer.png` });
  await composer.getByRole('button', { name: /^Send to/ }).click();
  check(await page.getByText(new RegExp(`Sent to ${reach} member`)).waitFor({ timeout: 10000 }).then(() => true, () => false), `sent to ${reach}`);

  // ---- 2. Messages --------------------------------------------------------------------------
  log('2. Messages');
  await sidebar.getByRole('button', { name: 'Messages', exact: true }).click();
  const sent = page.getByTestId('sent-messages');
  await sent.waitFor({ timeout: 10000 });
  const row = sent.locator('tr', { hasText: TITLE });
  check(await row.isVisible() && (await row.innerText()).includes('Family not complete'), 'listed with who it went to');
  const got = sql(`select count(*) || '|' || (select count(*) from push_queue q where q.event_type = 'admin_message'
      and q.user_id = '${member}' and q.title = '${TITLE}') from member_messages mm join admin_messages m on m.id = mm.message_id
     where m.title = '${TITLE}' and mm.user_id = '${member}';`);
  check(got === '1|1', `the member got it in the app and as a notification (${got})`);

  // ---- 3. The member ------------------------------------------------------------------------
  log('3. The member sees it');
  const mpage = await newPage();
  await signIn(mpage, MEMBER);
  const card = mpage.getByTestId('member-message');
  check(await card.waitFor({ timeout: 25000 }).then(() => true, () => false) && (await card.innerText()).includes(TITLE), 'a card with the message when they open the app');
  await mpage.screenshot({ path: `${OUT}3-member-card.png` });
  await card.getByRole('button', { name: 'Fill in Family' }).click();
  const family = mpage.locator('#section-family');
  check(await family.waitFor({ timeout: 15000 }).then(() => true, () => false), 'its button opens Family in My Profile');
  await mpage.waitForTimeout(1500);
  const marked = sql(`select (mm.seen_at is not null) || '|' || (mm.clicked_at is not null) from member_messages mm
    join admin_messages m on m.id = mm.message_id where m.title = '${TITLE}' and mm.user_id = '${member}';`);
  check(marked === 'true|true', `marked as seen and tapped (${marked})`);
  await mpage.reload();
  await mpage.waitForTimeout(5000);
  check(!(await mpage.getByTestId('member-message').isVisible()), "and it doesn't come back");
  await mpage.context().close();

  // ---- 4. Enquiries -------------------------------------------------------------------------
  log('4. Enquiries');
  const site = await newPage();
  await site.goto(`${SITE}/support`);
  const form = site.getByTestId('contact-form');
  await form.waitFor({ timeout: 15000 });
  await form.getByLabel('Your name').fill('Priya Test');
  await form.getByLabel('Email').fill(ENQUIRER);
  await form.getByLabel('About').selectOption('subscription');
  await form.getByLabel('Message').fill('Hello, how do I get Shaadi24+ on my phone?');
  await form.getByRole('button', { name: 'Send message' }).click();
  check(await site.getByTestId('contact-sent').waitFor({ timeout: 10000 }).then(() => true, () => false), 'the contact form says it was received');
  check(sql(`select count(*) from enquiries where email = '${ENQUIRER}' and status = 'new' and topic = 'subscription';`) === '1', 'stored, new');
  await page.reload();
  await page.getByText('Admin', { exact: true }).first().click({ timeout: 20000 });
  await sidebar.waitFor({ timeout: 20000 });
  const enquiriesButton = sidebar.getByRole('button', { name: 'Enquiries', exact: true });
  await page.waitForTimeout(1500);
  check(/\d/.test(await enquiriesButton.innerText()), `a count beside Enquiries (${(await enquiriesButton.innerText()).replace(/\s+/g, ' ')})`);
  await enquiriesButton.click();
  const enquiry = page.getByTestId('enquiry').filter({ hasText: ENQUIRER });
  await enquiry.waitFor({ timeout: 10000 });
  check((await enquiry.innerText()).includes('Shaadi24+ and payments') && (await enquiry.innerText()).includes('New'), 'in the inbox: who, what about, new');
  const href = await enquiry.getByRole('link', { name: 'Reply by email' }).getAttribute('href');
  check(href.startsWith(`mailto:${ENQUIRER}?subject=`) && decodeURIComponent(href).includes('> Hello, how do I get Shaadi24+'), 'Reply by email quotes it');
  await page.screenshot({ path: `${OUT}4-enquiries.png` });
  await enquiry.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(1500);
  check(sql(`select status from enquiries where email = '${ENQUIRER}';`) === 'closed', 'closed');

  // ---- 5. Offers ----------------------------------------------------------------------------
  log('5. Offers');
  await sidebar.getByRole('button', { name: 'Offers', exact: true }).click();
  await page.getByRole('button', { name: 'New offer' }).click();
  const dialog = page.getByRole('dialog', { name: 'New offer' });
  await dialog.getByLabel('Name (for admins)').fill('Test offer');
  await dialog.getByLabel('Banner text').fill('Diwali offer: 50% off your first 3 months');
  await dialog.getByLabel(/^Code/).fill(CODE);
  await dialog.getByRole('button', { name: 'Save offer' }).click();
  const offer = page.getByTestId('offer').filter({ hasText: CODE });
  check(await offer.waitFor({ timeout: 10000 }).then(() => true, () => false) && (await offer.innerText()).includes('Running'), 'the offer is saved and running');
  await page.screenshot({ path: `${OUT}5-offers.png` });
  await site.goto(SITE);
  const banner = site.getByTestId('offer-banner');
  check(await banner.waitFor({ timeout: 15000 }).then(() => true, () => false) && (await banner.innerText()).includes(CODE)
    && (await banner.innerText()).includes('Diwali offer'), 'the home page shows the banner with the code');
  const ios = await banner.getByRole('link', { name: 'Redeem on iPhone' }).getAttribute('href');
  const android = await banner.getByRole('link', { name: 'Redeem on Android' }).getAttribute('href');
  check(ios === `https://apps.apple.com/redeem?ctx=offercodes&id=6819755167&code=${CODE}` && android === `https://play.google.com/redeem?code=${CODE}`,
    'with each store\'s redeem link');
  await site.screenshot({ path: `${OUT}6-home-banner.png` });
  sql(`update offers set active = false where code = '${CODE}';`);
  await site.reload();
  await site.waitForTimeout(3000);
  check(!(await site.getByTestId('offer-banner').isVisible()), 'turned off, the banner is gone');
  await site.context().close();

  // ---- 6. Signed out --------------------------------------------------------------------------
  log('6. Signed out');
  const anon = (path, init = {}) => fetch(`${API}${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', ...init.headers } });
  const enquiriesRead = await (await anon('/rest/v1/enquiries?select=id')).json();
  const offersRead = await (await anon(`/rest/v1/offers?select=code&code=eq.${CODE}`)).json();
  const listed = await anon('/rest/v1/rpc/admin_enquiries', { method: 'POST', body: '{}' });
  const messages = await anon('/rest/v1/rpc/admin_list_messages', { method: 'POST', body: '{}' });
  check(Array.isArray(enquiriesRead) ? enquiriesRead.length === 0 : true, `no enquiries for a visitor (${JSON.stringify(enquiriesRead).slice(0, 80)})`);
  check(Array.isArray(offersRead) && offersRead.length === 0, 'an offer that isn\'t running stays hidden');
  check(listed.status >= 400 && messages.status >= 400, `the admin functions refuse a visitor (${listed.status}, ${messages.status})`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  const was = JSON.parse(familyWas || '{}');
  const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  sql(`set session_replication_role = replica;
       update profiles set ${FAMILY.map((c) => `${c} = ${lit(was[c])}`).join(', ')} where id = '${member}';
       delete from push_queue where event_type = 'admin_message' and title like 'Test: %';`);
  cleanup();
  await browser.close();
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
