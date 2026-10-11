// ============================================================================
// Framing photos before they're uploaded (components/PhotoCropper.tsx,
// lib/photoCrop.ts), in My Profile:
//   1. Three photos picked at once are framed one after the other ("Photo 1
//      of 3"): zoom and rotate, leave one out, the other two are added, as
//      3:4 portraits (the card's shape), 1280 pixels tall at most
//   2. Adjust frames a photo already on the profile again; it's replaced
//   3. Cancel adds nothing
//   4. More photos than fit: only the first ones are framed
// (Sign-up's photo step uses the same screen: signup-flow.mjs.)
//
// Usage: node photo-crop.mjs <member email>   (password TestPass!2026;
//   SERVICE_ROLE_KEY to remove the test photos afterwards)
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY || '';
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node photo-crop.mjs <member email>'); process.exit(2); }
const OUT = new URL('./.shots/photo-crop/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };
const appears = (locator, ms = 10000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

const ME = sql(`select id from auth.users where email = '${EMAIL}';`);
const urlsNow = () => JSON.parse(sql(`select coalesce(to_json(photo_urls), '[]') from profiles where id = '${ME}';`));
const before = urlsNow();
const started = sql('select now();');
// Two photos to start from, so there's room for more (12 at most)
sql(`update profiles set photo_urls = (photo_urls)[1:2] where id = '${ME}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
page.on('pageerror', (e) => log('  pageerror:', e.message));

// Test pictures, drawn by the browser: a landscape JPEG, a portrait JPEG, a square PNG
async function pictures() {
  const shots = await page.evaluate(async () => {
    const make = async (w, h, hue, type) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      for (let i = 0; i < 600; i++) {
        g.fillStyle = `hsl(${(hue + i * 13) % 360} 65% ${35 + (i % 40)}%)`;
        g.fillRect((i * 97) % w, (i * 61) % h, w / 10, h / 10);
      }
      const blob = await new Promise((res) => c.toBlob(res, type, 0.92));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    };
    return [await make(2400, 1600, 10, 'image/jpeg'), await make(1500, 2000, 140, 'image/jpeg'), await make(900, 900, 260, 'image/png')];
  });
  return [
    { name: 'landscape.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(shots[0]) },
    { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(shots[1]) },
    { name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(shots[2]) },
  ];
}
const dims = (url) => page.evaluate(async (u) => {
  const b = await createImageBitmap(await (await fetch(u, { cache: 'no-store' })).blob());
  return [b.width, b.height];
}, url);
const portrait34 = ([w, h]) => h <= 1280 && Math.abs(w / h - 0.75) < 0.01;

try {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /^My Profile/ }).first().click();
  const add = page.getByTestId('photo-add-input');
  await add.waitFor({ state: 'attached', timeout: 15000 });
  const files = await pictures();

  log('1. Three photos at once');
  await add.setInputFiles(files);
  const cropper = page.getByTestId('photo-cropper');
  check(await appears(cropper), 'the framing screen opens');
  check(await appears(cropper.getByTestId('photo-cropper-count').getByText(/^Photo 1 of 3/)), '"Photo 1 of 3"');
  check(await appears(cropper.locator('.reactEasyCrop_CropArea')), 'with a frame to move the photo in');
  await cropper.getByTestId('photo-cropper-zoom').fill('1.6');
  await cropper.getByTestId('photo-cropper-rotate').click();
  await page.screenshot({ path: `${OUT}1-framing.png` });
  await cropper.getByTestId('photo-cropper-use').click();
  check(await appears(cropper.getByTestId('photo-cropper-count').getByText(/^Photo 2 of 3/)), 'zoomed and turned: on to "Photo 2 of 3"');
  await cropper.getByTestId('photo-cropper-skip').click();
  check(await appears(cropper.getByTestId('photo-cropper-count').getByText(/^Photo 3 of 3/)), 'the second left out: "Photo 3 of 3"');
  check(await cropper.getByTestId('photo-cropper-use').innerText() === 'Use these photos', 'the last says "Use these photos"');
  await cropper.getByTestId('photo-cropper-use').click();
  check(await appears(page.getByText('2 photos added'), 20000), '"2 photos added"');
  const afterAdd = urlsNow();
  check(afterAdd.length === 4, `two photos on the profile (${afterAdd.length} in all)`);
  const added = afterAdd.slice(2);
  const sizes = [await dims(added[0]), await dims(added[1])];
  check(sizes.every(portrait34), `both 3:4 portraits, 1280 tall at most (${sizes.map((s) => s.join('×')).join(', ')})`);
  check(added.every((u) => /\.jpg$/.test(u)), 'stored as JPEGs');

  log('2. Adjust a photo already there');
  const tile = page.locator('img[alt="photo-2"]').locator('..');
  await tile.hover();
  await tile.getByTestId('photo-adjust').click();
  check(await appears(cropper) && await cropper.getByTestId('photo-cropper-count').innerText().then((t) => !/of \d/.test(t)), 'the framing screen, for one photo');
  await cropper.getByTestId('photo-cropper-zoom').fill('2.2');
  check(await cropper.getByTestId('photo-cropper-use').innerText() === 'Use photo', '"Use photo"');
  await cropper.getByTestId('photo-cropper-use').click();
  check(await appears(page.getByText('Photo saved'), 20000), '"Photo saved"');
  const afterAdjust = urlsNow();
  check(afterAdjust.length === 4 && afterAdjust[2] !== afterAdd[2] && afterAdjust[3] === afterAdd[3], 'that photo is replaced, in its place');
  check(portrait34(await dims(afterAdjust[2])), 'still a 3:4 portrait');

  log('3. Cancel');
  await add.setInputFiles(files.slice(0, 1));
  await cropper.waitFor({ timeout: 10000 });
  await cropper.getByTestId('photo-cropper-cancel').click();
  check(await cropper.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false) && urlsNow().length === 4, 'cancelled: nothing added');

  log('4. More than fit');
  sql(`update profiles set photo_urls = photo_urls || array_fill('${afterAdjust[0]}'::text, array[7]) where id = '${ME}';`);  // 11 of 12
  await page.reload();
  await page.getByRole('button', { name: /^My Profile/ }).first().click();
  await add.waitFor({ state: 'attached', timeout: 15000 });
  await add.setInputFiles(files);
  check(await appears(page.getByText(/Only 1 more photo fits/)), '"Only 1 more photo fits"');
  check(await appears(cropper.getByTestId('photo-cropper-count')) && !(await cropper.getByTestId('photo-cropper-count').innerText()).includes('of'),
    'only the first is framed');
  await cropper.getByTestId('photo-cropper-cancel').click();
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  // Put the profile back, and remove the photos this test stored
  const lit = (a) => `array[${a.map((u) => `'${u}'`).join(',')}]::text[]`;
  const mine = sql(`select coalesce(string_agg(name, ' '), '') from storage.objects where bucket_id = 'photos' and owner_id = '${ME}' and created_at >= '${started}';`).split(' ').filter(Boolean);
  sql(`update profiles set photo_urls = ${before.length ? lit(before) : "'{}'"} where id = '${ME}';
       delete from moderation_items where user_id = '${ME}' and created_at >= '${started}';
       delete from photo_fingerprints where user_id = '${ME}' and created_at >= '${started}';`);
  if (SERVICE) {
    for (const name of mine) {
      await fetch(`${API}/storage/v1/object/photos/${name}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {});
    }
  }
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
