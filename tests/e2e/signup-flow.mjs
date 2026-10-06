// New-user journey against the local stack: email sign-up → onboarding (3 steps,
// with the India details) → dashboard → search → sign out → sign back in.
// Usage: node signup-flow.mjs [email]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
const OUT = new URL('./.shots/shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const email = process.argv[2] || `newuser_${Date.now()}@shaadigpt.dev`;
const password = 'TestPass!2026';

// ---- tiny PNG writer (solid colour) for photo uploads ----
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const photos = [[220, 80, 80], [80, 160, 220], [90, 190, 110], [230, 180, 60]].map((c, i) => {
  const p = `${OUT}photo${i + 1}.png`; fs.writeFileSync(p, png(240, 240, c)); return p;
});

const problems = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', async (r) => {
  if (r.status() >= 400 && !r.url().includes('/realtime/')) {
    let body = ''; try { body = (await r.text()).slice(0, 200); } catch {}
    problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/\?.*/, '')} ${body}`);
  }
});

let n = 0;
const shot = async (name) => { const f = `${OUT}${String(++n).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, fullPage: false }); log('screenshot', f.split('/').pop()); };
const step = async (name, fn) => {
  log('STEP', name);
  try { await fn(); } catch (e) { log('FAILED', name, e.message.split('\n')[0]); await shot(`FAILED-${name.replace(/\W+/g, '_')}`); throw e; }
};

try {
  await step('open landing page', async () => {
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
    await shot('landing');
    // The cookie banner appears after ~0.5s and covers the bottom of the page.
    const accept = page.getByRole('button', { name: 'Accept all' });
    try { await accept.waitFor({ timeout: 3000 }); await accept.click(); } catch { log('no cookie banner'); }
  });

  await step('sign up with email', async () => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Create Account/ }).click();
    await page.locator('input[type=email]').fill(email);
    await page.getByPlaceholder('At least 8 characters').fill(password);
    await page.locator('input[type=checkbox]').first().check();
    await shot('signup-form');
    await page.locator('form').getByRole('button', { name: /Create Account/ }).click();
    await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
    await shot('onboarding-step1');
    if (await page.getByText('Before you start').isVisible()) throw new Error('email sign-up was asked for Terms consent again');
  });

  // A label's own select (the form's labels sit right before their input)
  const selectAfter = (label) => page.locator(`label:text-is("${label}") + select`);
  const pick = async (name, typed, option) => {
    const box = page.getByRole('combobox', { name });
    await box.click();
    await box.fill(typed);
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  await step('onboarding step 1: basic info', async () => {
    if ((await selectAfter('This profile is for').inputValue()) !== 'Myself') throw new Error('"This profile is for" should start at Myself');
    await page.getByPlaceholder("As you'd like it shown").fill('Test Newuser');
    await page.getByLabel('Day').selectOption('15');
    await page.getByLabel('Month').selectOption({ label: 'Jan' });
    await page.getByLabel('Year').selectOption('1997');
    await selectAfter('Gender').selectOption('Male');
    await page.locator('label:text-is("Pronouns (optional)") + select').selectOption('He/Him');
    await selectAfter('Interested in').selectOption('Women');
    await selectAfter('Looking for').selectOption('Marriage');
    await selectAfter('Marital status').selectOption('Divorced');
    await selectAfter('Children (optional)').selectOption('No');     // asked because not "Never Married"
    await selectAfter('Height (optional)').selectOption(`5' 8" (173 cm)`);
    if ((await page.getByRole('combobox', { name: 'Country' }).inputValue()) !== 'India') throw new Error('country should start at India');
    await pick('State', 'guj', 'Gujarat');
    await pick('City', 'sur', 'Surat');
    await page.getByPlaceholder('Hometown').fill('Pune');
    await shot('onboarding-step1-filled');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByText('Add your photos').waitFor({ timeout: 15000 });
    await shot('onboarding-step2');
  });

  await step('onboarding step 2: four photos', async () => {
    for (let i = 0; i < 4; i++) {
      await page.locator('input[type=file]').first().setInputFiles(photos[i]);
      await page.getByText(`${i + 1}/6 uploaded`).waitFor({ timeout: 15000 });
    }
    await shot('photos-uploaded');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByText('Step 3 of 3').waitFor({ timeout: 15000 });
    await shot('onboarding-step3');
  });

  const next = async (title) => {
    await page.getByRole('button', { name: /Next/ }).click();
    await page.getByRole('heading', { name: title }).waitFor();
  };

  await step('onboarding step 3: details (6 pages)', async () => {
    // Religion & community
    await page.getByRole('heading', { name: 'Religion & community' }).waitFor();
    await page.getByLabel('Religion', { exact: true }).selectOption('Hindu');
    await pick('Mother tongue', 'gujar', 'Gujarati');
    await pick('Caste', 'pat', 'Patel');
    await pick('Sub-caste', 'leva', 'Leva Patel');
    if (!(await page.getByRole('combobox', { name: 'Gotra' }).isVisible())) throw new Error('gotra not asked for a Hindu');
    if (await page.getByText('Denomination').isVisible()) throw new Error('denomination asked for a Hindu');
    await page.getByLabel('Open to marrying outside your community?').selectOption('Yes, caste no bar');
    for (const lang of ['English', 'Gujarati', 'Hindi']) await page.getByRole('button', { name: lang, exact: true }).click();
    await shot('details-religion-community');

    await next('Education & career');
    await pick('Degree', 'btech', 'B.E/B.Tech (Bachelor of Engineering / Bachelor of Technology)');
    if ((await page.getByLabel('Highest qualification').inputValue()) !== "Bachelor's") throw new Error('the degree did not fill in the qualification');
    await pick('Occupation', 'software prof', 'Software Professional');
    await page.getByPlaceholder('e.g. Product Manager').fill('Engineer');
    await page.getByRole('combobox', { name: 'Annual income' }).click();
    await page.getByRole('option', { name: '₹10–15 lakh', exact: true }).click();
    if (await page.getByText('Residential status').isVisible()) throw new Error('residential status asked of someone in India');
    await shot('details-education');

    await next('Family');
    await page.getByLabel('Family type').selectOption('Joint family');
    await page.getByLabel('Brothers').selectOption('2');
    await page.getByLabel('Of them married').first().selectOption('1');
    await page.getByPlaceholder(/A few lines about your family/).fill('We run a textile shop in Surat.');
    await shot('details-family');

    await next('Horoscope');
    await page.getByLabel('Manglik').selectOption('Non Manglik');
    await page.locator('input[type=time]').fill('06:45');

    await next('Lifestyle & appearance');
    await page.getByLabel('Diet').selectOption('Vegetarian');
    await page.getByRole('button', { name: 'Cricket', exact: true }).click();
    for (const gone of ['Marijuana', 'Other drugs']) {
      if (await page.getByText(gone, { exact: true }).count()) throw new Error(`"${gone}" is still asked`);
    }
    await shot('details-lifestyle');

    await next('Relationship & you');
    if (await page.getByText('Relationship type', { exact: true }).count()) throw new Error('"Relationship type" is still asked');
    await page.getByPlaceholder(/A few sentences/).fill('Testing the sign-up flow.');
    await shot('details-last-page');
    await page.getByRole('button', { name: /Finish/ }).click();
  });

  await step('saved as chosen, with age, location and height worked out', async () => {
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    const row = sql(`select concat_ws(' | ', age = extract(year from age(current_date, date '1997-01-15')), location, height_cm,
        marital_status, children, mother_tongue, caste, sub_caste, education_level, occupation, brothers || '+' || brothers_married,
        birth_time, manglik, dietary_preferences, hobbies, languages, profile_created_for, annual_income)
      from profiles where email = '${email}';`);
    const want = "t | Surat, Gujarat | 173 | Divorced | No | Gujarati | Patel | Leva Patel | Bachelor's | Software Professional | 2+1 | 06:45 | Non Manglik | Vegetarian | Cricket | English, Gujarati, Hindi | Myself | ₹10–15 lakh";
    if (row !== want) throw new Error(`saved: ${row}\n  wanted: ${want}`);
    log('  saved:', row);
  });

  await step('reach the dashboard', async () => {
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot('dashboard');
  });

  await step('run a search', async () => {
    const box = page.getByTestId('find-match-box');
    await box.fill('someone who loves travel and books');
    await box.press('Enter');
    await page.waitForTimeout(4000);
    await shot('search-results');
  });

  await step('sign out', async () => {
    await page.getByTitle('Sign out').click();
    await page.waitForTimeout(2500);
    await shot('after-sign-out');
    if (await page.getByText('Check your inbox').isVisible()) throw new Error('shows "Check your inbox" after signing out');
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 5000 });
  });

  await step('sign back in', async () => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Continue with Email/ }).click();
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('form').getByRole('button', { name: /Log In/i }).click();
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    await shot('signed-back-in');
  });
  log('RESULT: all steps passed for', email);
} catch {
  log('RESULT: stopped at a failing step for', email);
} finally {
  console.log(`\n${problems.length} problem(s) seen by the browser:`);
  for (const p of [...new Set(problems)]) console.log(' -', p);
  await browser.close();
}
