// ============================================================================
// Shaadi24's logo, a silver solitaire ring with a pale blue diamond
// (scripts/assets/ring.png; scripts/assets/README.md says where it comes
// from), and every image made from it:
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//                                   the iPhone app's icon, 1024 × 1024, white,
//                                   no alpha channel (the App Store takes it
//                                   from the app)
//   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732(-dark).png
//                                   the iPhone launch screen, light and dark
//   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png
//                                   the Android icon's front layer (the back
//                                   layer is white: values/ic_launcher_background.xml)
//   android/app/src/main/res/mipmap-*/ic_launcher(_round).png
//                                   the icon on Android 7 and older launchers
//   android/app/src/main/res/drawable-*/splash_icon.png
//                                   the Android launch screen
//   android/app/src/main/res/drawable-*/ic_launcher_monochrome.png
//                                   the Android themed (single-colour) icon: the
//                                   ring's outline
//   docs/store/graphics/play-icon-512.png         Google Play, 512 × 512, 32-bit
//   docs/store/graphics/play-feature-graphic.jpg  Google Play, 1024 × 500
//   public/og-image.png                            the picture in link previews
//   public/apple-touch-icon.png, favicon-32.png    the website's icons
//   public/logo.png                                the logo in the apps and on the website
//                                   (the ring on a transparent background, 192 × 192)
// Change the sizes or the words below, or the picture, and run again to
// remake them all.
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
const RING = path.join(ROOT, 'scripts/assets/ring.png');
const OUT = path.join(ROOT, 'docs/store/graphics');
const PUBLIC = path.join(ROOT, 'public');
const IOS = path.join(ROOT, 'ios/App/App/Assets.xcassets');
const ANDROID = path.join(ROOT, 'android/app/src/main/res');

const TITLE = 'Shaadi24';
const TAGLINE = 'Describe your life partner.<br>Meet the people you fit.';
const PREVIEW_LINE = 'Matrimony for India';
const DARK = '#191919';  // the apps' dark background (index.css, values-night/colors.xml)

// ---- The logo, at each use --------------------------------------------------------------
// `size` is how much of the square the ring takes (its longer side), or
// `circle` how much a circle around the whole ring takes; a `background` puts
// it on a shape (a rounded square of `radius`, or a circle with
// `tile: 'circle'`), inset by `inset` of 1024 units on each side
const APP_ICON = { size: 0.76, background: '#fff' };
// Android's front layer: launchers show the middle 72 of 108 units, masked to
// a circle, squircle or square of their choosing; this keeps all of the ring
// inside the 66-unit circle every one of them shows
const ANDROID_FOREGROUND = { circle: 64 / 108 };
const LAUNCH = { size: 0.24 };

// ---- Store and link-preview graphics ------------------------------------------------------
// The brand as in the apps and on the website: white, near-black type, the
// ring with its pale blue diamond, and a thin line of that blue
const INK = '#111111';
const MUTED = '#52525b';
const DIAMOND = '#9cc9ec';  // the diamond's pale blue
const feature = (icon) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 1024px; height: 500px; box-sizing: border-box; padding: 0 80px;
    display: flex; align-items: center; gap: 56px; position: relative;
    background: #fff; color: ${INK}; font-family: 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif;
  }
  body::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: ${DIAMOND}; }
  .icon { width: 230px; height: 230px; flex: none; border-radius: 52px; border: 2px solid #e5e7eb; box-shadow: 0 10px 30px rgba(17,17,17,.08); }
  h1 { margin: 0; font-size: 86px; font-weight: 700; letter-spacing: -2px; }
  p { margin: 18px 0 0; font-size: 34px; line-height: 1.3; color: ${MUTED}; }
</style></head><body><img class="icon" src="${icon}" alt=""><div><h1>${TITLE}</h1><p>${TAGLINE}</p></div></body></html>`;

// The link preview: the same, larger, with a line saying what Shaadi24 is
const preview = (icon) => feature(icon)
  .replace('width: 1024px; height: 500px;', 'width: 1200px; height: 630px;')
  .replace('.icon { width: 230px; height: 230px; flex: none; border-radius: 52px;', '.icon { width: 280px; height: 280px; flex: none; border-radius: 63px;')
  .replace('h1 { margin: 0; font-size: 86px;', 'h1 { margin: 0; font-size: 100px;')
  .replace('p { margin: 18px 0 0; font-size: 34px;', 'p { margin: 18px 0 0; font-size: 40px;')
  .replace(`<h1>${TITLE}</h1>`, `<div style="font-size:28px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${MUTED};margin-bottom:12px">${PREVIEW_LINE}</div><h1>${TITLE}</h1>`);

// A PNG from RGBA pixels: with its alpha channel (colour type 6; Google Play
// asks for a 32-bit PNG) or without (colour type 2; the App Store's icon may
// not have one)
function encodePng(width, height, rgba, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3;
  const row = width * channels + 1;
  const raw = Buffer.alloc(row * height);  // filter 0 (none) at the start of each row
  for (let y = 0; y < height; y++) {
    if (alpha) rgba.copy(raw, y * row + 1, y * width * 4, (y + 1) * width * 4);
    else for (let x = 0; x < width; x++) rgba.copy(raw, y * row + 1 + x * 3, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
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
  header.set([8, alpha ? 6 : 2, 0, 0, 0], 8);  // 8 bits, RGBA or RGB, deflate, no filter method, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return path.relative(ROOT, file);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const saved = [];
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  // The ring, loaded once in the page, and where it sits in its picture
  // (which has empty space around it)
  await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const solid = (x, y) => data[(y * img.width + x) * 4 + 3] > 8;
    let [left, top, right, bottom] = [img.width, img.height, -1, -1];
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (solid(x, y)) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    const [w, h] = [right - left + 1, bottom - top + 1];
    const [cx, cy] = [left + w / 2, top + h / 2];
    // How far the ring reaches from its middle, in any direction
    let reach = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) if (solid(x, y)) reach = Math.max(reach, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
    // The logo on a canvas `px` square (the options above); `outline` turns
    // it into one colour, without the soft glow at its edges
    window.drawLogo = ({ px, size, circle, background = null, tile = 'square', radius = 0, inset = 0, border = null, outline = false }) => {
      const c = Object.assign(document.createElement('canvas'), { width: px, height: px });
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.scale(px / 1024, px / 1024);
      if (background) {
        const side = 1024 - inset * 2;
        g.beginPath();
        if (tile === 'circle') g.arc(512, 512, side / 2, 0, Math.PI * 2);
        else g.roundRect(inset, inset, side, side, radius);
        g.fillStyle = background;
        g.fill();
        if (border) { g.lineWidth = 20; g.strokeStyle = border; g.stroke(); }
      }
      const k = circle ? 1024 * circle / (2 * reach) : 1024 * size / Math.max(w, h);
      g.drawImage(img, 512 - cx * k, 512 - cy * k, img.width * k, img.height * k);
      if (outline) {
        const pixels = g.getImageData(0, 0, px, px);
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[i + 1] = d[i + 2] = 255;
          d[i + 3] = Math.max(0, Math.min(255, (d[i + 3] - 64) * 2));
        }
        g.putImageData(pixels, 0, 0);
      }
      return c;
    };
    // Its pixels, as base64 RGBA
    window.logoPixels = (options) => {
      const d = window.drawLogo(options).getContext('2d').getImageData(0, 0, options.px, options.px).data;
      let bytes = '';
      for (let i = 0; i < d.length; i += 0x8000) bytes += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(bytes);
    };
  }, `data:image/png;base64,${fs.readFileSync(RING).toString('base64')}`);

  const pixels = async (options, px) => Buffer.from(await page.evaluate((o) => window.logoPixels(o), { ...options, px }), 'base64');
  const png = async (file, options, px, { alpha = true } = {}) =>
    saved.push(write(file, encodePng(px, px, await pixels(options, px), { alpha })));
  // Large images (the launch screens), through the browser's own encoder
  const big = async (file, options, px) => {
    const url = await page.evaluate((o) => window.drawLogo(o).toDataURL('image/png'), { ...options, px });
    saved.push(write(file, Buffer.from(url.split(',')[1], 'base64')));
  };

  // iPhone
  await png(path.join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'), APP_ICON, 1024, { alpha: false });
  await big(path.join(IOS, 'Splash.imageset/splash-2732x2732.png'), { ...LAUNCH, background: '#fff' }, 2732);
  await big(path.join(IOS, 'Splash.imageset/splash-2732x2732-dark.png'), { ...LAUNCH, background: DARK }, 2732);

  // Android: the adaptive icon's front layer, its single-colour version and
  // the launch screen at each density (108 dp), and the icons older launchers
  // show as they are (48 dp)
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, x] of Object.entries(densities)) {
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher_foreground.png`), ANDROID_FOREGROUND, 108 * x);
    await png(path.join(ANDROID, `drawable-${name}/ic_launcher_monochrome.png`), { ...ANDROID_FOREGROUND, outline: true }, 108 * x);
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher.png`), { size: 0.72, background: '#fff', radius: 190, inset: 48 }, 48 * x);
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher_round.png`), { size: 0.68, background: '#fff', tile: 'circle', inset: 48 }, 48 * x);
    await png(path.join(ANDROID, `drawable-${name}/splash_icon.png`), ANDROID_FOREGROUND, 108 * x);
  }

  // Google Play and the website
  await png(path.join(OUT, 'play-icon-512.png'), APP_ICON, 512);
  await png(path.join(PUBLIC, 'apple-touch-icon.png'), APP_ICON, 180);
  await png(path.join(PUBLIC, 'favicon-32.png'), { size: 0.86, background: '#fff', radius: 224, border: '#e5e7eb' }, 32);
  await png(path.join(PUBLIC, 'logo.png'), { size: 0.96 }, 192);

  const icon = `data:image/png;base64,${encodePng(560, 560, await pixels(APP_ICON, 560)).toString('base64')}`;
  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(feature(icon));
  // JPEG: the feature graphic may not have an alpha channel
  await page.screenshot({ path: path.join(OUT, 'play-feature-graphic.jpg'), type: 'jpeg', quality: 92 });
  saved.push(path.relative(ROOT, path.join(OUT, 'play-feature-graphic.jpg')));

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(preview(icon));
  await page.screenshot({ path: path.join(PUBLIC, 'og-image.png') });
  saved.push('public/og-image.png');
  console.log(`Saved ${saved.length} images:\n  ${saved.join('\n  ')}`);
} finally {
  await browser.close();
}
