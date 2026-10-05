// The admin Finance tab (components/admin/AdminFinanceTab.tsx, RevenueChart.tsx),
// in Chromium against the local stack, with a known set of subscriptions and
// charges (ALL billing rows in the local database are replaced; other tests
// make their own):
//  - subscribers now, recurring revenue, won't renew, ended in 30 days
//  - this month / last month / all time, months in India time (a charge at
//    00:30 on the 1st counts in its own month, one at 23:30 the night before
//    in the month before); refunds, the stores' estimated fees, a failed
//    charge (net 0), a charge in dollars kept out of the rupee figures
//  - the chart: one stacked column per month, legend, hover and arrow-key
//    figures, picking a month lists its charges; the table view
//  - the charges list: seller and month filters, totals, statuses
//  - CSV export: every row, amounts in rupees, India time, a customer whose
//    name is a spreadsheet formula kept as text
//  - test purchases kept apart; 6/12/24 months; phone width; dark mode
//  - in the Android app the CSV goes to the share sheet (bridge stand-in)
//  - a non-admin is refused by both database functions
// Usage: node admin-finance.mjs <admin email> <non-admin email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const ANDROID_BRIDGE = `${REPO}/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js`;
const [ADMIN, OTHER] = process.argv.slice(2);
if (!ADMIN || !OTHER) { console.error('usage: node admin-finance.mjs <admin email> <non-admin email>'); process.exit(2); }
const OUT = new URL('./.shots/finance/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

// ---- Months in India --------------------------------------------------------------------

const indiaMonth = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
};
const addMonths = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const label = (month, style) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-IN',
  { month: style === 'long' ? 'long' : 'short', ...(style === 'short' ? {} : { year: 'numeric' }), timeZone: 'UTC' });
const M0 = indiaMonth();
const M1 = addMonths(M0, -1);
const M2 = addMonths(M0, -2);
const M7 = addMonths(M0, -7);

// ---- The billing rows -----------------------------------------------------------------------

const admin = sql(`select id from auth.users where email = '${ADMIN}';`);
const people = sql(`select id from profiles where id <> '${admin}' and name is not null order by account_created, id limit 5;`).split('\n');
if (people.length < 5) { console.error('needs five other profiles'); process.exit(2); }
const [U1, U2, U3, U4, U5] = people;
const savedName = sql(`select name from profiles where id = '${U1}';`);
const FORMULA = '=HYPERLINK("https://example.com","click")';

function seed() {
  sql(`insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;
    update profiles set name = '${FORMULA.replace(/'/g, "''")}' where id = '${U1}';
    delete from payments; delete from subscriptions;
    -- m0: midnight on the 1st of this month in India, as India's wall clock
    create temp table t as select date_trunc('month', now() at time zone 'Asia/Kolkata') as m0;
    insert into subscriptions (id, user_id, provider, store_subscription_id, plan_id, mode, status,
                               trial_ends_at, current_start, current_end, cancel_at_period_end, ended_at)
    select v.* from t, lateral (values
      ('00000000-0000-4000-8000-000000000001'::uuid, '${U1}'::uuid, 'google_play', 'fin-gp-1', 'monthly', 'live', 'active',
        null::timestamptz, now() - interval '10 days', now() + interval '20 days', false, null::timestamptz),
      ('00000000-0000-4000-8000-000000000002', '${U2}', 'app_store', 'fin-as-2', 'yearly', 'live', 'active',
        null, now() - interval '40 days', now() + interval '325 days', true, null),
      ('00000000-0000-4000-8000-000000000003', '${U3}', 'google_play', 'fin-gp-3', 'monthly', 'live', 'authenticated',
        now() + interval '5 days', null, null, false, null),
      ('00000000-0000-4000-8000-000000000004', '${U4}', 'google_play', 'fin-gp-4', 'monthly', 'live', 'expired',
        null, now() - interval '33 days', now() - interval '3 days', false, now() - interval '3 days'),
      ('00000000-0000-4000-8000-000000000005', '${U4}', 'google_play', 'fin-gp-5', 'monthly', 'live', 'cancelled',
        null, now() - interval '150 days', now() - interval '120 days', false, now() - interval '60 days'),
      ('00000000-0000-4000-8000-000000000006', '${U5}', 'app_store', 'fin-as-6', 'monthly', 'live', 'active',
        null, now() - interval '2 days', now() + interval '28 days', false, null),
      ('00000000-0000-4000-8000-000000000007', '${U5}', 'google_play', 'fin-gp-7', 'monthly', 'test', 'active',
        null, now() - interval '1 day', now() + interval '29 days', false, null)
    ) v;
    insert into payments (user_id, subscription_id, provider, store_order_id, amount, currency, status, method,
                          fee_amount, fee_estimated, refunded_amount, refunded_at, paid_at)
    select v.* from t, lateral (values
      -- this month
      ('${U1}'::uuid, '00000000-0000-4000-8000-000000000001'::uuid, 'google_play', 'GPA.FIN-1', 99900, 'INR', 'captured', null,
        14985, true, 0, null::timestamptz, now() - interval '2 minutes'),
      ('${U1}', '00000000-0000-4000-8000-000000000001', 'google_play', 'GPA.FIN-B1', 99900, 'INR', 'captured', null,
        14985, true, 0, null, (t.m0 + interval '30 minutes') at time zone 'Asia/Kolkata'),
      ('${U4}', '00000000-0000-4000-8000-000000000005', 'google_play', 'GPA.FIN-FAILED', 99900, 'INR', 'failed', null,
        null, false, 0, null, now() - interval '3 minutes'),
      ('${U5}', '00000000-0000-4000-8000-000000000006', 'app_store', '2000000999000006', 999, 'USD', 'captured', null,
        150, true, 0, null, now() - interval '4 minutes'),
      -- last month (one at 23:30 on its last night)
      ('${U1}', '00000000-0000-4000-8000-000000000001', 'google_play', 'GPA.FIN-2', 99900, 'INR', 'captured', null,
        14985, true, 0, null, (t.m0 - interval '10 days') at time zone 'Asia/Kolkata'),
      ('${U1}', '00000000-0000-4000-8000-000000000001', 'google_play', 'GPA.FIN-B0', 99900, 'INR', 'captured', null,
        14985, true, 0, null, (t.m0 - interval '30 minutes') at time zone 'Asia/Kolkata'),
      ('${U2}', '00000000-0000-4000-8000-000000000002', 'app_store', '2000000999000002', 999900, 'INR', 'captured', null,
        149985, true, 0, null, (t.m0 - interval '12 days') at time zone 'Asia/Kolkata'),
      -- two months ago: one kept, one refunded in full
      ('${U1}', '00000000-0000-4000-8000-000000000001', 'google_play', 'GPA.FIN-3', 99900, 'INR', 'captured', null,
        14985, true, 0, null, (t.m0 - interval '1 month' - interval '10 days') at time zone 'Asia/Kolkata'),
      ('${U4}', '00000000-0000-4000-8000-000000000004', 'google_play', 'GPA.FIN-4', 99900, 'INR', 'refunded', null,
        14985, true, 99900, (t.m0 - interval '1 month' - interval '5 days') at time zone 'Asia/Kolkata',
        (t.m0 - interval '1 month' - interval '9 days') at time zone 'Asia/Kolkata'),
      -- seven months ago
      ('${U4}', '00000000-0000-4000-8000-000000000005', 'google_play', 'GPA.FIN-7', 99900, 'INR', 'captured', null,
        14985, true, 0, null, (t.m0 - interval '7 months' + interval '10 days') at time zone 'Asia/Kolkata'),
      -- a test purchase
      ('${U5}', '00000000-0000-4000-8000-000000000007', 'google_play', 'GPA.FIN-T1', 99900, 'INR', 'captured', null,
        14985, true, 0, null, now() - interval '5 minutes')
    ) v;`);
}

function cleanUp() {
  sql(`delete from payments where subscription_id::text like '00000000-0000-4000-8000-00000000000_';
    delete from subscriptions where id::text like '00000000-0000-4000-8000-00000000000_';
    update profiles set name = '${savedName.replace(/'/g, "''")}' where id = '${U1}';`);
}

// ---- Pages ----------------------------------------------------------------------------------

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let lastPage = null;

async function openFinance(ctx) {
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  lastPage = page;
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(ADMIN);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 20000 });
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible().catch(() => false)) await menu.click();  // phones: the sidebar is a menu
  await page.getByText('Admin', { exact: true }).first().click();
  await page.getByRole('button', { name: /^finance$/i }).click();
  await page.getByTestId('tile-subscribers').waitFor({ timeout: 15000 });
  await page.getByTestId('charges-table').waitFor({ timeout: 15000 });
  return page;
}

const text = (page, id) => page.getByTestId(id).innerText();
const monthPicker = (page) => page.getByRole('combobox', { name: 'Month', exact: true });
const sellerPicker = (page) => page.getByRole('combobox', { name: 'Seller', exact: true });
const rows = (page) => page.getByTestId('charges-table').locator('tbody tr');
const waitRows = async (page, n) => {
  for (let i = 0; i < 40 && (await rows(page).count()) !== n; i++) await page.waitForTimeout(150);
  return rows(page).count();
};
const columnCenter = async (page, index, count) => {
  // The plot starts after the y-axis labels; columns share the rest equally
  const box = await page.locator('[data-testid=finance-chart-card] svg').boundingBox();
  const left = await page.evaluate(() => {
    const ticks = [...document.querySelectorAll('[data-testid=finance-chart-card] svg line')];
    return Math.min(...ticks.map((l) => Number(l.getAttribute('x1'))));
  });
  const band = (box.width - left - 4) / count;
  return { x: box.x + left + band * (index + 0.5), y: box.y + 22 + 150 };
};

try {
  seed();

  // ======================================================================================
  log('1. The figures');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await openFinance(ctx);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}1-finance.png`, fullPage: true });

  const subs = await text(page, 'tile-subscribers');
  check(/\b4\b/.test(subs) && subs.includes('3 paying · 1 on free trial'), `subscribers: 4, 3 paying, 1 on free trial (${subs.replace(/\n/g, ' | ')})`);
  check((await text(page, 'tile-mrr')).includes('₹2,831'), 'recurring revenue ₹2,831 (two monthly ₹999 + a twelfth of ₹9,999)');
  check(/\b1\b/.test(await text(page, 'tile-ending')), "won't renew: 1 (the yearly one, cancelled)");
  check(/\b1\b/.test(await text(page, 'tile-ended')), 'ended in the last 30 days: 1 (the 60-day-old one not counted)');
  const split = await text(page, 'subscriber-split');
  check(split.includes('Google Play 2 · App Store 2') && split.includes('Monthly 3 · Yearly 1'), `split by store and plan (${split})`);

  const net = await text(page, 'tile-net-month');
  check(net.includes('₹1,698') && net.includes(`${label(M1, 'short')}: ₹10,197`),
    `net this month ₹1,698 (00:30 on the 1st counts here), last month ₹10,197 (${net.replace(/\n/g, ' | ')})`);
  const paid = await text(page, 'tile-gross-month');
  check(paid.includes('₹1,998') && paid.includes('2 charges'), 'paid this month: ₹1,998 from 2 charges (failed and dollar charges left out)');
  check((await text(page, 'tile-fees-month')).includes('₹300'), 'store fees this month ₹300 (15% estimated)');
  const all = await text(page, 'tile-net-all');
  check(all.includes('₹13,594') && all.includes('8 charges · ₹16,992 paid'), `net all time ₹13,594 from 8 charges (${all.replace(/\n/g, ' | ')})`);
  check((await text(page, 'other-currencies')).includes('net from 1 charge in USD'), 'the dollar charge is noted apart');

  // ======================================================================================
  log('2. The chart');
  const legend = await page.getByTestId('finance-legend').innerText();
  check(['Google Play', 'App Store'].every((s) => legend.includes(s)) && !/Website|Razorpay/.test(legend), `legend: ${legend.replace(/\n/g, ', ')}`);
  const paths = await page.locator('[data-testid=finance-chart-card] svg path').evaluateAll((ps) => ps.map((p) => p.style.fill));
  const axis = await page.locator('[data-testid=finance-chart-card] svg text').allTextContents();
  check(axis.includes('₹15K') && axis.includes('₹10.2K') && !axis.some((t) => /T$/.test(t)), `axis and totals in K (${axis.filter((t) => t.startsWith('₹')).join(' ')})`);
  check(paths.length === 5, `5 coloured segments: this month 1, last month 2, two months ago 1, seven months ago 1 (${paths.length})`);
  check(paths.filter((f) => f.includes('--viz-s1')).length === 4 && paths.filter((f) => f.includes('--viz-s2')).length === 1,
    'each store keeps its own colour');

  let at = await columnCenter(page, 11, 12);
  await page.mouse.move(at.x, at.y);
  let tip = await page.getByTestId('finance-tooltip').innerText();
  check(tip.includes(label(M0, 'long')) && tip.includes('₹1,698.30') && tip.includes('2 charges'), `hover this month: ${tip.replace(/\n/g, ' | ')}`);
  at = await columnCenter(page, 10, 12);
  await page.mouse.move(at.x, at.y);
  tip = await page.getByTestId('finance-tooltip').innerText();
  check(tip.includes('₹10,197.45') && tip.includes('₹8,499.15') && tip.includes('App Store') && tip.includes('₹1,799.55 store fees')
    && tip.includes('₹11,997 paid'),
    `hover last month: ${tip.replace(/\n/g, ' | ')}`);
  await page.screenshot({ path: `${OUT}2-hover.png` });
  await page.mouse.move(5, 5);
  check(!(await page.getByTestId('finance-tooltip').isVisible().catch(() => false)), 'the figures go when the pointer leaves');

  // Keyboard: arrows move between months, Enter lists one
  await page.locator('[data-testid=finance-chart-card] svg').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  tip = await page.getByTestId('finance-tooltip').innerText();
  check(tip.includes(label(M2, 'long')) && tip.includes('₹849.15') && tip.includes('₹999 refunded'), `arrow keys: ${tip.replace(/\n/g, ' | ')}`);
  const spoken = await page.locator('[data-testid=finance-chart-card] [aria-live]').innerText();
  check(spoken.includes(label(M2, 'long')) && spoken.includes('₹849.15 net'), 'screen readers hear the same month');
  await page.keyboard.press('Enter');
  check(await waitRows(page, 2) === 2, 'Enter lists that month\'s 2 charges');
  check(await monthPicker(page).inputValue() === M2, 'the month picker shows it');

  // ======================================================================================
  log('3. The charges');
  await monthPicker(page).selectOption('');
  check(await waitRows(page, 10) === 10, 'all 12 months: 10 charges (test purchase left out)');
  const totals = await text(page, 'charges-totals');
  check(totals.includes('8 charges · ₹16,992 paid · ₹2,398.95 store fees · ₹999 refunded · ₹13,594.05 net'), `totals: ${totals}`);
  const tableText = await page.getByTestId('charges-table').innerText();
  check(tableText.includes(FORMULA), "a customer's formula-like name shows as plain text");
  check(tableText.includes('Failed') && tableText.includes('Refunded') && /\$9\.99/.test(tableText), 'failed, refunded and dollar charges listed');
  const failedRow = rows(page).filter({ hasText: 'GPA.FIN-FAILED' });
  check((await failedRow.innerText()).includes('₹0'), 'a failed charge nets ₹0');
  check((await rows(page).filter({ hasText: 'GPA.FIN-1' }).first().innerText()).includes('est.'), "store fees are marked estimated");

  await sellerPicker(page).selectOption('app_store');
  check(await waitRows(page, 2) === 2, 'App Store: 2 charges (one in dollars)');
  check((await text(page, 'charges-totals')).includes('App Store: 1 charge · ₹9,999 paid · ₹1,499.85 store fees · ₹8,499.15 net'),
    'App Store rupee totals');
  await sellerPicker(page).selectOption('');

  at = await columnCenter(page, 11, 12);
  await page.mouse.click(at.x, at.y);
  check(await waitRows(page, 4) === 4, 'clicking this month lists its 4 charges');
  check((await page.getByTestId('charges-table').innerText()).includes('12:30 am') || (await page.getByTestId('charges-table').innerText()).includes('00:30'),
    'the 00:30 charge shows India time');
  await page.screenshot({ path: `${OUT}3-month-picked.png`, fullPage: true });
  await monthPicker(page).selectOption('');
  await waitRows(page, 10);

  // ======================================================================================
  log('4. The table view and CSV');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const monthTable = await page.getByTestId('finance-month-table').innerText();
  check(monthTable.includes('Total') && monthTable.includes('₹13,594.05') && monthTable.includes(label(M7, 'long')), 'table view: every month and a total');
  await page.screenshot({ path: `${OUT}4-table.png`, fullPage: true });
  await page.getByRole('button', { name: 'Chart', exact: true }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const csvPath = `${OUT}charges.csv`;
  await download.saveAs(csvPath);
  check(download.suggestedFilename() === `matchgpt-charges-live-${addMonths(M0, -11)}-to-${M0}.csv`, `file name ${download.suggestedFilename()}`);
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  check(csv.startsWith('﻿') && lines[0].startsWith('Date (India time),Order ID,Seller,Plan,Status,Currency,Amount,Fee'),
    'a header row, with the mark Excel needs for any script');
  check(lines.length === 11, `10 charges in the file (${lines.length - 1})`);
  const line = (id) => lines.find((l) => l.includes(id)) ?? '';
  check(line('2000000999000002').includes(',INR,9999.00,1499.85,yes,0.00,,8499.15,'), `App Store yearly in rupees: ${line('2000000999000002')}`);
  check(line('GPA.FIN-4').includes(',Refunded,INR,999.00,149.85,yes,999.00,') && line('GPA.FIN-4').includes(',0.00,'), 'the refunded charge');
  check(line('GPA.FIN-FAILED').includes(',Failed,INR,999.00,,,0.00,,0.00,'), `the failed charge nets 0: ${line('GPA.FIN-FAILED')}`);
  check(line('2000000999000006').includes(',USD,9.99,1.50,yes,'), 'the dollar charge in dollars');
  check(line('GPA.FIN-B1').startsWith(`${M0}-01 00:30,`), `dates in India time (${line('GPA.FIN-B1').slice(0, 16)})`);
  check(line('GPA.FIN-1').includes(`,"'=HYPERLINK(""https://example.com"",""click"")",`), 'the formula-like name is kept as text');
  check(!lines.some((l) => l.includes('GPA.FIN-T1')), 'no test purchase in a live export');

  // ======================================================================================
  log('5. Test purchases, and fewer months');
  await page.getByRole('button', { name: 'Test purchases' }).click();
  await page.getByText(/Test purchases only/).waitFor();
  check(await waitRows(page, 1) === 1 && (await rows(page).first().innerText()).includes('test'), 'test mode: just the test purchase, marked');
  for (let i = 0; i < 40 && !(await text(page, 'tile-net-month')).includes('₹849'); i++) await page.waitForTimeout(150);
  check((await text(page, 'tile-net-month')).includes('₹849'), 'test mode figures are the test purchase\'s');
  check(/\b1\b/.test(await text(page, 'tile-subscribers')), 'one test subscriber');
  await page.getByRole('button', { name: 'Live money' }).click();
  await page.getByRole('button', { name: '6 months' }).click();
  check(await waitRows(page, 9) === 9, 'six months: 9 charges (the seven-month-old one left out)');
  check(await monthPicker(page).locator('option').count() === 7, 'six months to pick from, and all six');
  check((await text(page, 'tile-net-all')).includes('₹13,594'), 'all time still counts it');
  await page.getByRole('button', { name: '12 months' }).click();

  // Dark mode
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  at = await columnCenter(page, 10, 12);
  await page.mouse.move(at.x, at.y);
  await page.screenshot({ path: `${OUT}5-dark.png`, fullPage: true });
  const fill = await page.locator('[data-testid=finance-chart-card] svg path').first().evaluate((p) => getComputedStyle(p).fill);
  check(['rgb(57, 135, 229)', 'rgb(217, 89, 38)'].includes(fill), `dark mode uses the dark steps (${fill})`);
  await ctx.close();

  // ======================================================================================
  log('6. Phone width');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await openFinance(phone).catch(async (e) => { throw e; });
  await p2.waitForTimeout(500);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `nothing wider than the screen (${overflow}px)`);
  await p2.getByTestId('finance-chart-card').scrollIntoViewIfNeeded();
  const box = await p2.locator('[data-testid=finance-chart-card] svg').boundingBox();
  await p2.touchscreen.tap(box.x + box.width - 20, box.y + 150);
  await p2.waitForTimeout(300);
  check((await p2.getByTestId('finance-tooltip').innerText()).includes(label(M0, 'long')), 'a tap shows that month\'s figures');
  await p2.screenshot({ path: `${OUT}6-phone.png`, fullPage: true });
  await phone.close();

  // ======================================================================================
  log('7. In the Android app, the CSV goes to the share sheet');
  const app = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await app.addInitScript({ content: `
    window.__native = [];
    window.__shareAnswer = null;
    function answer(call) {
      window.__native.push(call);
      if (call.callbackId === '-1' || call.methodName === 'addListener') return;
      let reply = { data: {} };
      if (call.pluginId === 'Filesystem' && call.methodName === 'writeFile') reply = { data: { uri: 'file:///data/user/0/com.matchgpt.app/cache/' + call.options.path } };
      if (call.pluginId === 'Share' && window.__shareAnswer) reply = window.__shareAnswer;
      setTimeout(() => window.Capacitor.fromNative(Object.assign(
        { callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: !reply.error },
        reply.error ? { error: reply.error } : { data: reply.data })), 10);
    }
    window.androidBridge = { postMessage(json) { const call = JSON.parse(json);
      if (call.pluginId === 'Console' || call.type === 'js.error') return; answer(call); } };
    window.Capacitor = { PluginHeaders: [
      { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'minimizeApp', rtype: 'promise' }] },
      { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
      { name: 'AppWindow', methods: [{ name: 'setTheme', rtype: 'promise' }] },
      { name: 'Filesystem', methods: [{ name: 'writeFile', rtype: 'promise' }] },
      { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }, { name: 'canShare', rtype: 'promise' }] },
    ] };` });
  await app.addInitScript({ path: ANDROID_BRIDGE });
  const p3 = await openFinance(app);
  await p3.getByRole('button', { name: 'Export CSV' }).click();
  await p3.getByText(/Exported 10 charges/).waitFor({ timeout: 10000 });
  const calls = await p3.evaluate(() => window.__native.filter((c) => ['Filesystem', 'Share'].includes(c.pluginId)));
  const write = calls.find((c) => c.methodName === 'writeFile');
  const share = calls.find((c) => c.methodName === 'share');
  check(write?.options.directory === 'CACHE' && write.options.encoding === 'utf8' && write.options.path.endsWith('.csv')
    && write.options.data.startsWith('﻿Date (India time),') && write.options.data.split('\r\n').length === 12,
    'the CSV is written to the app\'s cache');
  check(share?.options.files?.[0] === `file:///data/user/0/com.matchgpt.app/cache/${write?.options.path}`, 'and handed to the share sheet');
  await p3.evaluate(() => { window.__shareAnswer = { error: { message: 'Share canceled' } }; });
  await p3.waitForTimeout(3500);  // the first toast goes
  await p3.getByRole('button', { name: 'Export CSV' }).click();
  await p3.waitForTimeout(1500);
  check(!(await p3.getByText(/Exported|Export failed/).isVisible().catch(() => false)), 'closing the share sheet is not an error');
  await app.close();

  // ======================================================================================
  log('8. Not for anyone else');
  const anon = fs.readFileSync(process.env.ANON_KEY_FILE || '/dev/null', 'utf8').trim() || process.env.ANON_KEY;
  const token = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OTHER, password: 'TestPass!2026' }),
  }).then((r) => r.json()).then((j) => j.access_token);
  for (const fn of ['admin_finance_summary', 'admin_list_payments']) {
    const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    const body = await r.text();
    check(r.status >= 400 && body.includes('Admins only'), `${fn} refuses a non-admin (${r.status})`);
  }
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n').slice(0, 3).join(' / '));
  await lastPage?.screenshot({ path: `${OUT}FAILED.png` }).catch(() => {});
} finally {
  await browser.close();
  cleanUp();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
