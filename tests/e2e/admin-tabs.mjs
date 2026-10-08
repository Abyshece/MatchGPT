// The admin sidebar; Customers and Reports see everyone (they used to see only the admin's own
// row), every detail of a member in one row, and a member corrects a date of birth: one made
// under 21 and hidden shows as such,
// a date under the legal age is refused, a real one is saved with its note in the audit
// log and the profile is visible again (the member is put back as it was afterwards).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name

const EMAIL = process.argv[2];
const OUT = new URL('./.shots/shots-admin/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from auth.users where email = '${EMAIL}';`);
const target = sql(`select id || '|' || name from profiles where name is not null and id <> '${me}' order by name limit 1;`).split('|');
sql(`insert into admin_emails (email) values ('${EMAIL}') on conflict do nothing;
     delete from reports where reporter_id = '${me}';
     insert into reports (reporter_id, reported_id, reason, details) values ('${me}', '${target[0]}', 'fake_profile', 'test report');`);
const totalUsers = Number(sql(`select count(*) from profiles;`));
const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const young = sql(`select id || '|' || name from profiles where name is not null and id not in ('${me}', '${target[0]}') order by name limit 1;`).split('|');
const youngWas = JSON.parse(sql(`select json_build_object('gender', gender, 'date_of_birth', date_of_birth, 'age', age,
  'is_paused', coalesce(is_paused, false), 'paused_at', paused_at) from profiles where id = '${young[0]}';`));
const isoYearsAgo = (years) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
try {
  await page.goto(process.env.BASE_URL || 'http://localhost:3000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByText('Admin', { exact: true }).first().click();

  // The sections are in a sidebar
  const sidebar = page.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 15000 });
  check((await Promise.all(['Overview', 'Customers', 'Verification', 'Reports', 'Complaints', 'Finance', 'Errors', 'Audit log']
    .map((name) => sidebar.getByRole('button', { name, exact: true }).isVisible()))).every(Boolean), 'the sections are in the sidebar');
  await sidebar.getByRole('button', { name: 'Customers', exact: true }).click();
  const table = page.getByTestId('customers-table');
  await table.locator('tbody tr').nth(1).waitFor({ timeout: 15000 });
  const listed = await table.locator('tbody tr').count();
  await page.screenshot({ path: `${OUT}1-customers.png` });
  check(listed === Math.min(totalUsers, 50), `Customers lists everyone, 50 to a page (${listed} of ${totalUsers})`);
  check((await page.getByTestId('customers-count').innerText()) === `1–${Math.min(totalUsers, 50)} of ${totalUsers.toLocaleString('en-US')}`,
    `the count: ${await page.getByTestId('customers-count').innerText()}`);
  const headers = await table.locator('thead th').allInnerTexts();
  check(['Member', 'Phone', 'Location', 'Religion', 'Education', 'Joined', 'Sign-in', 'Verified', 'Plan', 'Profile', 'Matches', 'Reported', 'Status']
    .every((h) => headers.includes(h)), `every detail in one row (${headers.length} columns)`);
  const search = page.getByRole('searchbox', { name: 'Search customers' });
  await search.fill(target[1]);
  await page.waitForTimeout(1500);
  check(await table.getByText(target[1]).first().isVisible(), `search finds "${target[1]}"`);

  // A member under 21 writes in with an ID that shows an earlier date of birth
  sql(`set session_replication_role = replica;
       update profiles set gender = 'Male', date_of_birth = current_date - interval '20 years', age = 20, is_paused = true, paused_at = null
        where id = '${young[0]}';`);
  await search.fill(young[1]);
  await page.waitForTimeout(1500);
  const row = table.locator('tbody tr', { has: page.getByText(young[1], { exact: true }) }).first();
  check(await row.getByText('Under 21', { exact: true }).isVisible() && await row.getByText('Paused', { exact: true }).isVisible(),
    `${young[1]} shows as under 21 and paused`);
  await row.getByRole('button').first().click();
  const panel = page.getByTestId('member-panel');
  await panel.waitFor();
  check(await panel.getByText(young[1]).first().isVisible() && await panel.getByText('Background').isVisible(), 'a row opens the member, everything grouped');
  await panel.getByRole('button', { name: 'Date of birth' }).click();
  const dialog = page.getByRole('dialog', { name: `Correct ${young[1]}'s date of birth` });
  await dialog.waitFor();
  await dialog.getByLabel('Date of birth on the ID').fill(isoYearsAgo(19));
  await dialog.getByLabel(/How you checked it/).fill('Passport seen (test)');
  await dialog.getByRole('button', { name: 'Save date of birth' }).click();
  const refused = await dialog.getByRole('alert').waitFor({ timeout: 8000 }).then(() => dialog.getByRole('alert').innerText(), () => '');
  check(refused.includes('legal ages to marry in India') && await dialog.isVisible(), 'a date under the legal age is refused, and the pop-up stays open');
  await dialog.getByLabel('Date of birth on the ID').fill('1995-03-15');
  await page.screenshot({ path: `${OUT}3-date-of-birth.png` });
  await dialog.getByRole('button', { name: 'Save date of birth' }).click();
  check(await page.getByText(`Date of birth corrected for ${young[1]}`).waitFor({ timeout: 8000 }).then(() => true, () => false),
    'a real date of birth is saved');
  await page.waitForTimeout(1500);
  check(!(await dialog.isVisible()), 'the pop-up closes');
  check(await panel.getByText(/born 15 Mar 1995/).isVisible(), 'the member shows the new date');
  await page.screenshot({ path: `${OUT}4-member.png` });
  await panel.getByRole('button', { name: 'Close' }).click();
  check(!(await row.getByText('Under 21', { exact: true }).isVisible()) && await row.getByText('Active', { exact: true }).isVisible(),
    'the row: no longer under 21 or paused');
  const saved = sql(`select age || ' ' || is_paused || ' ' || (select details ->> 'note' from admin_audit
    where action = 'correct_date_of_birth' and target_user_id = '${young[0]}' order by created_at desc limit 1)
    from profiles where id = '${young[0]}';`);
  const expectedAge = new Date().getFullYear() - 1995 - (new Date() < new Date(new Date().getFullYear(), 2, 15) ? 1 : 0);
  check(saved === `${expectedAge} false Passport seen (test)`, `the age follows, the profile is visible, the note is in the audit log (${saved})`);

  await sidebar.getByRole('button', { name: 'Audit log', exact: true }).click();
  await page.getByTestId('audit-log').waitFor({ timeout: 10000 });
  check(await page.getByTestId('audit-log').getByText(/corrected a date of birth.*Passport seen \(test\)/).first().isVisible(), 'the Audit log has it');

  // A verification request, and whether it's likely to pass
  const slug = target[1].toLowerCase().replace(/[^a-z]+/g, '-');
  sql(`delete from verification_requests where user_id = '${target[0]}';
       insert into verification_requests (user_id, linkedin_url, instagram_url, status)
       values ('${target[0]}', 'https://www.linkedin.com/in/${slug}-123', 'instagram.com/p/abc123', 'pending');`);
  await sidebar.getByRole('button', { name: 'Verification', exact: true }).click();
  const verdict = page.getByTestId('verification-check').first();
  await verdict.waitFor({ timeout: 15000 });
  const said = await verdict.innerText();
  await page.screenshot({ path: `${OUT}5-verification.png` });
  check(said.includes('Unlikely to pass') && said.includes('Only 1 working profile link (LinkedIn); 2 are needed')
    && said.includes("The Instagram link isn't a profile") && said.includes('Their name is in the LinkedIn link'),
    `the request says why it's unlikely to pass (${said.split('\n').join(' | ')})`);
  check(/1 waiting/.test(await page.getByTestId('verification-summary').innerText()), 'and how many are waiting');

  await page.getByRole('button', { name: /^reports$/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}2-reports.png` });
  check(await page.getByText(target[1]).first().isVisible(), `Reports tab shows the reported person's name (${target[1]})`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  sql(`set session_replication_role = replica;
       update profiles set gender = ${lit(youngWas.gender)}, date_of_birth = ${lit(youngWas.date_of_birth)}, age = ${youngWas.age ?? 'null'},
         is_paused = ${youngWas.is_paused}, paused_at = ${lit(youngWas.paused_at)} where id = '${young[0]}';
       delete from admin_audit where action = 'correct_date_of_birth' and target_user_id = '${young[0]}';
       delete from verification_requests where user_id = '${target[0]}';`);
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
