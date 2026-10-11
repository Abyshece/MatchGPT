// ============================================================================
// Photos are made small before they're sent (lib/imageShrink.ts,
// lib/photoService.ts):
//   1. A 4000×3000 phone photo with the camera's hidden details (EXIF) comes
//      out 1280×960, as a JPEG, many times smaller, and without the details
//   2. A see-through PNG gets a white background, not a black one
//   3. A file the browser can't read is sent as it was
//   4. Uploaded as a member: what's stored is the small JPEG, cached for a year
//
// Usage: node photo-shrink.mjs <member email>   (password TestPass!2026)
// ============================================================================

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SERVICE = process.env.SERVICE_ROLE_KEY || '';  // to remove the test photo afterwards
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node photo-shrink.mjs <member email>'); process.exit(2); }
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
page.on('pageerror', (e) => log('  pageerror:', e.message));
await page.goto(BASE);
let uploaded = null;

try {
  log('1–3. Made small in the browser');
  const r = await page.evaluate(async () => {
    const { shrinkImage } = await import('/lib/imageShrink.ts');
    const hasExif = async (blob) => new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer())).includes('Exif');
    const size = async (blob) => { const b = await createImageBitmap(blob); const s = [b.width, b.height]; b.close(); return s; };

    // A busy 4000×3000 picture, saved the way a phone would (high quality)
    const big = document.createElement('canvas');
    big.width = 4000; big.height = 3000;
    const g = big.getContext('2d');
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 50)}%)`;
      g.fillRect((i * 97) % 4000, (i * 61) % 3000, 120, 90);
    }
    const jpeg = new Uint8Array(await (await new Promise((res) => big.toBlob(res, 'image/jpeg', 0.95))).arrayBuffer());
    // The camera's hidden details: an EXIF block right after the start marker
    const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const body = [...new TextEncoder().encode('Exif'), 0, 0, ...tiff];
    const app1 = [0xff, 0xe1, ((body.length + 2) >> 8) & 0xff, (body.length + 2) & 0xff, ...body];
    const withExif = new Uint8Array(jpeg.length + app1.length);
    withExif.set(jpeg.subarray(0, 2), 0);
    withExif.set(app1, 2);
    withExif.set(jpeg.subarray(2), 2 + app1.length);
    const phone = new File([withExif], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const out = await shrinkImage(phone);

    // A see-through PNG
    const clear = document.createElement('canvas');
    clear.width = 300; clear.height = 200;
    const png = new File([await new Promise((res) => clear.toBlob(res, 'image/png'))], 'clear.png', { type: 'image/png' });
    const flat = await shrinkImage(png);
    const fb = await createImageBitmap(flat.blob);
    const probe = document.createElement('canvas');
    probe.width = 1; probe.height = 1;
    probe.getContext('2d').drawImage(fb, -10, -10);
    const pixel = [...probe.getContext('2d').getImageData(0, 0, 1, 1).data];

    // Something that isn't really a picture
    const junk = new File([new Uint8Array([1, 2, 3, 4, 5])], 'photo.heic', { type: 'image/heic' });
    const kept = await shrinkImage(junk);

    return {
      inSize: phone.size, inExif: await hasExif(phone), inDims: await size(phone),
      outSize: out.blob.size, outType: out.type, outExt: out.ext, outExif: await hasExif(out.blob), outDims: await size(out.blob), shrunk: out.shrunk,
      pngType: flat.type, pixel,
      junkKept: kept.blob === junk && !kept.shrunk && kept.type === 'image/heic' && kept.ext === 'heic',
    };
  });
  check(r.inExif && r.inDims.join('×') === '4000×3000', `the phone photo: 4000×3000, ${(r.inSize / 1024 / 1024).toFixed(1)} MB, with hidden details`);
  check(r.shrunk && r.outType === 'image/jpeg' && r.outExt === 'jpg', 'made small, as a JPEG');
  check(r.outDims.join('×') === '1280×960', `1280×960 (${r.outDims.join('×')})`);
  check(r.outSize < 400 * 1024 && r.outSize * 3 < r.inSize, `${Math.round(r.outSize / 1024)} KB, ${Math.round(r.inSize / r.outSize)}× smaller`);
  check(!r.outExif, 'without the hidden details (EXIF)');
  check(r.pngType === 'image/jpeg' && r.pixel[0] > 240 && r.pixel[1] > 240 && r.pixel[2] > 240, `a see-through PNG: white behind it (${r.pixel.slice(0, 3).join(',')})`);
  check(r.junkKept, "a file the browser can't read is sent as it was");

  log('4. Uploaded as a member');
  const userId = sql(`select id from auth.users where email = '${EMAIL}';`);
  const result = await page.evaluate(async ({ email, userId }) => {
    const { supabase } = await import('/lib/supabase.ts');
    const { uploadPhoto } = await import('/lib/photoService.ts');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: 'TestPass!2026' });
    if (signInError) return { error: signInError.message };
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 4000;
    const g = c.getContext('2d');
    for (let i = 0; i < 3000; i++) { g.fillStyle = `hsl(${(i * 53) % 360} 60% 50%)`; g.fillRect((i * 89) % 3000, (i * 71) % 4000, 100, 140); }
    const file = new File([await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95))], 'portrait.jpg', { type: 'image/jpeg' });
    const up = await uploadPhoto(userId, file, 'test');
    const stored = up.url ? await fetch(up.url) : null;
    const dims = stored ? await createImageBitmap(await stored.blob()).then((b) => [b.width, b.height]) : null;
    await supabase.auth.signOut();
    return { ...up, originalSize: file.size, cache: stored?.headers.get('cache-control') ?? null, dims };
  }, { email: EMAIL, userId });
  uploaded = result.url ? result.url.split('/photos/')[1] : null;
  check(!result.error && !!uploaded && uploaded.startsWith(`${userId}/test_`) && uploaded.endsWith('.jpg'), `uploaded (${uploaded ?? result.error})`);
  const meta = uploaded ? JSON.parse(sql(`select json_build_object('size', (metadata->>'size')::int, 'type', metadata->>'mimetype', 'cache', metadata->>'cacheControl')
    from storage.objects where bucket_id = 'photos' and name = '${uploaded}';`) || 'null') : null;
  check(meta?.type === 'image/jpeg' && meta.size < 400 * 1024 && meta.size * 3 < result.originalSize,
    `stored as a ${Math.round((meta?.size ?? 0) / 1024)} KB JPEG (from ${(result.originalSize / 1024 / 1024).toFixed(1)} MB)`);
  check(result.dims?.join('×') === '960×1280', `a portrait photo stays upright: ${result.dims?.join('×')}`);
  check(/max-age=31536000/.test(meta?.cache ?? '') || /max-age=31536000/.test(result.cache ?? ''), `cached for a year (${meta?.cache ?? result.cache})`);
} catch (e) {
  failures++;
  log('FAIL (stopped):', e.message.split('\n')[0]);
} finally {
  if (uploaded && SERVICE) {
    await fetch(`${API}/storage/v1/object/photos/${uploaded}`, {
      method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    }).catch(() => {});
  }
  await browser.close();
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  process.exit(failures ? 1 : 0);
}
