// New-user journey against the local stack: email sign-up → the consent screen
// (the declarations Indian law asks for) → the three short sign-up steps (the
// basics, background, one photo) → the free-searches pop-up → My Profile's
// About me draft → dashboard → search → sign out → sign back in.
// Usage: node signup-flow.mjs [email]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { agreeToTerms } from './fixtures.mjs';

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
    // The Terms were ticked on the form: the consent screen asks only the rest
    await page.getByText('Before you start').waitFor({ timeout: 15000 });
    await shot('consent-screen');
    if (!(await page.getByTestId('consent-terms-done').isVisible())) throw new Error('the Terms accepted on the form are asked again');
    if (await page.getByTestId('consent-terms').count()) throw new Error('a Terms box although they were accepted on the form');
    await agreeToTerms(page);
    await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
    await shot('onboarding-step1');
    const recorded = sql(`select count(*) || '/' || count(c.ip_address) from consent_records c join profiles p on p.id = c.user_id
      where p.email = '${email}' and c.event_type in ('terms_accepted', 'privacy_accepted', 'matrimony_declaration',
        'legal_age_declaration', 'sensitive_data_consent')`);
    if (recorded !== '5/5') throw new Error(`consents recorded (and with the address): ${recorded}`);
  });

  // A label's own select (the form's labels sit right before their input)
  // The select after a label, by the label's whole text ("(optional)" is set apart in it)
  const selectAfter = (label) => page.locator(`xpath=//label[normalize-space(.)="${label}"]/following-sibling::select[1]`);
  const pick = async (name, typed, option) => {
    const box = page.getByRole('combobox', { name });
    await box.click();
    await box.fill(typed);
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  await step('onboarding step 1: the basics', async () => {
    if ((await selectAfter('This profile is for').inputValue()) !== 'Myself') throw new Error('"This profile is for" should start at Myself');
    if (!(await page.getByText('about two minutes for all three steps').isVisible())) throw new Error('step 1 does not say how long sign-up takes');
    await page.getByPlaceholder("As you'd like it shown").fill('Test Newuser');
    if (await page.locator('xpath=//label[normalize-space(.)="Looking for"]').count()) throw new Error('asked what he is looking for (marriage only)');
    for (const gone of ['Pronouns (optional)', 'Grew up in (optional)']) {
      if (await page.locator(`xpath=//label[normalize-space(.)="${gone}"]`).count()) throw new Error(`"${gone}" is still asked at sign-up`);
    }
    await page.getByLabel('Day').selectOption('15');
    await page.getByLabel('Month').selectOption({ label: 'Jan' });
    // A man of 20 is under the legal age to marry in India
    await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 20));
    await selectAfter('Gender').selectOption('Male');
    // Filled in from the gender (and can be changed)
    if ((await selectAfter('Interested in').inputValue()) !== 'Women') throw new Error('"Interested in" was not filled in from the gender');
    await page.getByRole('button', { name: /Continue/ }).click();
    if (!(await page.getByText(/must be at least 21 to use Shaadi24/).isVisible())) throw new Error('a man of 20 was not stopped');
    await page.getByLabel('Year').selectOption('1997');
    await selectAfter('Marital status').selectOption('Divorced');
    await selectAfter('Children (optional)').selectOption('No');     // asked because not "Never Married"
    await selectAfter('Height').selectOption(`5' 8" (173 cm)`);
    if ((await page.getByRole('combobox', { name: 'Country' }).inputValue()) !== 'India') throw new Error('country should start at India');
    await pick('State', 'guj', 'Gujarat');
    await pick('City', 'sur', 'Surat');
    await shot('onboarding-step1-filled');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByText('Step 2 of 3').waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: 'Your background' }).waitFor();
    await shot('onboarding-step2');
  });

  await step('onboarding step 2: background, and back to step 1', async () => {
    await page.getByRole('button', { name: /Continue/ }).click();   // all four are needed
    if (!(await page.getByText('Please choose the religion, mother tongue, highest qualification and occupation.').isVisible())) {
      throw new Error('the missing answers were not named');
    }
    // Back keeps step 1's answers
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByText('Tell us about yourself').waitFor({ timeout: 15000 });
    if ((await page.getByPlaceholder("As you'd like it shown").inputValue()) !== 'Test Newuser') throw new Error('step 1 forgot the name');
    if ((await page.getByRole('combobox', { name: 'City' }).inputValue()) !== 'Surat') throw new Error('step 1 forgot the city');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByRole('heading', { name: 'Your background' }).waitFor({ timeout: 15000 });
    await selectAfter('Religion').selectOption('Hindu');
    await pick('Mother tongue', 'gujar', 'Gujarati');
    await selectAfter('Highest qualification').selectOption("Bachelor's");
    await pick('Occupation', 'software prof', 'Software Professional');
    await shot('onboarding-step2-filled');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByText('Add your photos').waitFor({ timeout: 15000 });
    if (!(await page.getByText('Step 3 of 3').isVisible())) throw new Error('the photos are not step 3 of 3');
    await shot('onboarding-step3');
  });

  await step('onboarding step 3: one photo is enough, and it is kept going back', async () => {
    if (!(await page.getByRole('button', { name: /Continue/ }).isDisabled())) throw new Error('Continue works without a photo');
    for (const slot of ['Clear face photo', 'Full-length photo', 'Traditional or festive']) {
      if (!(await page.getByText(slot, { exact: true }).isVisible())) throw new Error(`no "${slot}" slot`);
    }
    for (const gone of ['With an Animal', 'With Friends']) {
      if (await page.getByText(gone, { exact: true }).count()) throw new Error(`"${gone}" is still a photo slot`);
    }
    await page.locator('input[type=file]').first().setInputFiles(photos[0]);
    await page.getByText('1/6 added').waitFor({ timeout: 15000 });
    // Saved at once
    if (sql(`select coalesce(array_length(photo_urls, 1), 0) from profiles where email = '${email}';`) !== '1') throw new Error('the photo was not saved at once');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('heading', { name: 'Your background' }).waitFor({ timeout: 15000 });
    if ((await page.getByRole('combobox', { name: 'Occupation' }).inputValue()) !== 'Software Professional') throw new Error('step 2 forgot the occupation');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.getByText('1/6 added').waitFor({ timeout: 15000 });
    await shot('photos-uploaded');
    await page.getByRole('button', { name: /Continue/ }).click();
  });

  await step('saved as chosen, with age, location and height worked out', async () => {
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    const row = sql(`select concat_ws(' | ', age = extract(year from age(current_date, date '1997-01-15')), location, height_cm,
        marital_status, children, interested_in, religion, mother_tongue, education_level, occupation, profile_created_for,
        array_length(photo_urls, 1), onboarding_complete, coalesce(description, '-'))
      from profiles where email = '${email}';`);
    const want = "t | Surat, Gujarat | 173 | Divorced | No | Women | Hindu | Gujarati | Bachelor's | Software Professional | Myself | 1 | t | -";
    if (row !== want) throw new Error(`saved: ${row}\n  wanted: ${want}`);
    log('  saved:', row);
  });

  await step('the free-searches pop-up, then My Profile at About you', async () => {
    const popup = page.getByTestId('profile-rewards-popup');
    await popup.waitFor({ timeout: 15000 });
    await shot('free-searches-popup');
    for (const text of ['Unlock more free searches', 'Your profile is live!', 'up to 9 a day']) {
      if (!(await popup.getByText(text).first().isVisible())) throw new Error(`the pop-up does not say "${text}"`);
    }
    for (const id of ['about', 'community', 'career', 'family', 'lifestyle', 'plans']) {
      const row = popup.getByTestId(`nudge-${id}`);
      if (!/\+1 search · ~\d+ min/.test(await row.innerText())) throw new Error(`section ${id}: ${await row.innerText()}`);
    }
    if (!/^All 6: about \d+ minutes\./.test(await popup.getByTestId('nudge-total').innerText())) throw new Error('no total time');
    await popup.getByTestId('nudge-complete').click();
    await page.locator('#section-about').waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    const top = await page.locator('#section-about').evaluate((el) => el.getBoundingClientRect().top);
    if (top < -5 || top > 400) throw new Error(`My Profile did not open at About you (top ${top})`);
    await shot('my-profile-about-you');
  });

  await step('About me: a draft from the answers, edited and saved', async () => {
    await page.getByRole('button', { name: /Write a draft for me/ }).first().click();
    const box = page.getByLabel('About me', { exact: true });
    const draft = await box.inputValue();
    if (!draft.startsWith('I work as a software professional and live in Surat, Gujarat.')) throw new Error(`draft: ${draft}`);
    await box.fill(`${draft} We are a close family.`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('About me saved').waitFor({ timeout: 10000 });
    const saved = sql(`select description from profiles where email = '${email}';`);
    if (!saved.endsWith('We are a close family.')) throw new Error(`About me saved as: ${saved}`);
    await shot('about-me-saved');
  });

  await step('the pop-up waits a few days after it has shown', async () => {
    await page.reload();
    await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    if (await page.getByTestId('profile-rewards-popup').count()) throw new Error('the pop-up showed again straight away');
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
