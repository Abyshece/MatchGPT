// ============================================================================
// The graphics Google Play's store listing asks for, made from the app's icon
// design (the pink-to-orange square with the white ring):
//   docs/store/graphics/play-icon-512.png          512 × 512, 32-bit PNG
//   docs/store/graphics/play-feature-graphic.jpg   1024 × 500, JPEG
// The App Store takes its icon from the iPhone app itself (AppIcon, 1024 ×
// 1024). Change the words below and run again to remake them.
//
// Usage: node scripts/store-graphics.mjs
// (needs Playwright's Chromium: npm i --no-save playwright && npx playwright install chromium;
// REPO_ROOT when run from a copy outside the repo)
// ============================================================================

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/store/graphics');
const ICON = path.join(ROOT, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');

const TITLE = 'MatchGPT';
const TAGLINE = 'Describe your life partner.<br>Meet the people you fit.';

// The icon's ring, drawn (1024-unit square)
const RING = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="442,140 582,140 652,224 512,388 372,224" fill="#fff"/>
  <circle cx="512" cy="636" r="233" fill="none" stroke="#fff" stroke-width="77"/>
</svg>`;

const FEATURE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 1024px; height: 500px; box-sizing: border-box; padding: 0 80px;
    display: flex; align-items: center; gap: 56px;
    background: linear-gradient(135deg, #ec4899 0%, #f05a6e 45%, #f97316 100%);
    color: #fff; font-family: 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif;
  }
  svg { width: 230px; height: 230px; flex: none; }
  h1 { margin: 0; font-size: 86px; font-weight: 700; letter-spacing: -2px; }
  p { margin: 18px 0 0; font-size: 34px; line-height: 1.3; }
</style></head><body>${RING}<div><h1>${TITLE}</h1><p>${TAGLINE}</p></div></body></html>`;

// A PNG with an alpha channel (colour type 6) from RGBA pixels: browsers save
// opaque screenshots without one, and Google Play asks for a 32-bit PNG
function pngWithAlpha(width, height, rgba) {
  const row = width * 4 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) rgba.copy(raw, y * row + 1, y * width * 4, (y + 1) * width * 4);  // filter 0: none
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);  // 8 bits, RGBA, deflate, no filter method, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  const icon = `data:image/png;base64,${fs.readFileSync(ICON).toString('base64')}`;
  const pixels = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, 512, 512);
    return Array.from(ctx.getImageData(0, 0, 512, 512).data);
  }, icon);
  fs.writeFileSync(path.join(OUT, 'play-icon-512.png'), pngWithAlpha(512, 512, Buffer.from(pixels)));

  await page.setContent(FEATURE);
  // JPEG: the feature graphic may not have an alpha channel
  await page.screenshot({ path: path.join(OUT, 'play-feature-graphic.jpg'), type: 'jpeg', quality: 92 });
  console.log(`Saved in ${path.relative(ROOT, OUT)}: play-icon-512.png, play-feature-graphic.jpg`);
} finally {
  await browser.close();
}
