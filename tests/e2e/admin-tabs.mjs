// Admin Users and Reports tabs see everyone (they used to see only the admin's own row).
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

  await page.getByRole('button', { name: /^reports$/i }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}2-reports.png` });
  check(await page.getByText(target[1]).first().isVisible(), `Reports tab shows the reported person's name (${target[1]})`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
  await page.screenshot({ path: `${OUT}FAILED.png` });
} finally {
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
