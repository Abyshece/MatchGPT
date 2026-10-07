// Admin Users and Reports tabs see everyone (they used to see only the admin's own row),
// and Users corrects a date of birth: a member made under 21 and hidden shows as such,
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

  await page.getByRole('button', { name: /^users$/i }).click();
  await page.getByPlaceholder(/Search users by name or email/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(2000);
  // Rows starting with any address: other tests add accounts at other domains (example.com)
  const listed = await page.evaluate(() => [...document.querySelectorAll('main *')]
    .filter((el) => el.children.length === 0 && /^[\w.+-]+@[\w-]+(\.[\w-]+)+(\s|$)/.test((el.textContent || '').trim())).length);
  await page.screenshot({ path: `${OUT}1-users.png` });
  check(listed >= Math.min(totalUsers, 50) - 1, `Users tab lists everyone (${listed} of ${totalUsers} shown, 50 max)`);
  await page.getByPlaceholder(/Search users by name or email/).fill(target[1]);
  await page.waitForTimeout(2000);
  check(await page.getByText(target[1]).first().isVisible(), `search finds "${target[1]}"`);

  // A member under 21 writes in with an ID that shows an earlier date of birth
  sql(`set session_replication_role = replica;
       update profiles set gender = 'Male', date_of_birth = current_date - interval '20 years', age = 20, is_paused = true, paused_at = null
        where id = '${young[0]}';`);
  await page.getByPlaceholder(/Search users by name or email/).fill(young[1]);
  await page.waitForTimeout(2000);
  const row = page.locator('div.p-4', { has: page.getByRole('heading', { name: new RegExp(`^${young[1]}`) }) }).first();
  check(await row.getByText('Under 21', { exact: true }).isVisible() && await row.getByText('Hidden', { exact: true }).isVisible(),
    `${young[1]} shows as under 21 and hidden`);
  await row.getByRole('button', { name: 'Date of birth' }).click();
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
  check(await row.getByText(/Born 15 Mar 1995/).isVisible() && !(await row.getByText('Under 21', { exact: true }).isVisible())
    && !(await row.getByText('Hidden', { exact: true }).isVisible()), 'the row shows the new date, no longer under 21 or hidden');
  const saved = sql(`select age || ' ' || is_paused || ' ' || (select details ->> 'note' from admin_audit
    where action = 'correct_date_of_birth' and target_user_id = '${young[0]}' order by created_at desc limit 1)
    from profiles where id = '${young[0]}';`);
  const expectedAge = new Date().getFullYear() - 1995 - (new Date() < new Date(new Date().getFullYear(), 2, 15) ? 1 : 0);
  check(saved === `${expectedAge} false Passport seen (test)`, `the age follows, the profile is visible, the note is in the audit log (${saved})`);

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
       delete from admin_audit where action = 'correct_date_of_birth' and target_user_id = '${young[0]}';`);
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
