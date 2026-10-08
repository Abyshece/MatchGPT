// ============================================================================
// Shaadi24's logo is the 💍 emoji, as the apps and the website show it: Google's
// Noto Emoji ring (the one most Android phones show), unchanged, from
// scripts/assets/noto-emoji-ring.svg (see scripts/assets/README.md for where
// it comes from and its licence). Apple's 💍 can't be used: Apple's emoji
// pictures may only be shown as text on Apple's devices. Every image made from it:
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
//   android/app/src/main/res/drawable/ic_launcher_monochrome.xml
//                                   the Android themed (single-colour) icon: the
//                                   emoji's outline
//   docs/store/graphics/play-icon-512.png         Google Play, 512 × 512, 32-bit
//   docs/store/graphics/play-feature-graphic.jpg  Google Play, 1024 × 500
//   public/og-image.png                            the picture in link previews
//   public/apple-touch-icon.png, favicon-32.png    the website's icons (with
//                                                  public/favicon.svg)
// Change the sizes or the words below and run again to remake them all.
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
const PUBLIC = path.join(ROOT, 'public');
const IOS = path.join(ROOT, 'ios/App/App/Assets.xcassets');
const ANDROID = path.join(ROOT, 'android/app/src/main/res');

const TITLE = 'Shaadi24';
const TAGLINE = 'Describe your life partner.<br>Meet the people you fit.';
const PREVIEW_LINE = 'Matrimony for India';
const DARK = '#191919';  // the apps' dark background (index.css, values-night/colors.xml)

// ---- The logo -------------------------------------------------------------------------
// The emoji, drawn on its own 128-unit square
const EMOJI = fs.readFileSync(path.join(ROOT, 'scripts/assets/noto-emoji-ring.svg'), 'utf8');
const EMOJI_ART = EMOJI.slice(EMOJI.indexOf('<g>'), EMOJI.lastIndexOf('</svg>'));

/**
 * The logo as a 1024-unit SVG: the emoji's square takes `size` of it,
 * centred; `tile` puts it on a shape (a rounded square of `radius`, or a
 * circle) of `background`, inset by `inset` units on each side.
 */
function logoSvg({ size = 0.8, background = null, tile = 'square', radius = 0, inset = 0, border = null } = {}) {
  const side = 1024 - inset * 2;
  const back = !background ? ''
    : tile === 'circle'
      ? `<circle cx="512" cy="512" r="${side / 2}" fill="${background}"/>`
      : `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${radius}" fill="${background}"${
        border ? ` stroke="${border}" stroke-width="20"` : ''}/>`;
  const box = 1024 * size;
  const at = (1024 - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${back}`
    + `<svg x="${at}" y="${at}" width="${box}" height="${box}" viewBox="0 0 128 128">${EMOJI_ART}</svg></svg>`;
}

// The app icon: the emoji large, on white
const APP_ICON = logoSvg({ background: '#fff' });
// Android's front layer: launchers show the middle 72 of 108 units, masked to
// a circle, squircle or square of their choosing; this keeps the emoji inside
// the 66-unit circle every one of them shows
const ANDROID_SIZE = 0.56;
const ANDROID_FOREGROUND = logoSvg({ size: ANDROID_SIZE });

// Android's themed icon (Android 13+, when the member picks themed icons): the
// emoji's shapes in one colour, as a vector on the front layer's 108-unit grid
function androidMonochrome() {
  const round = (v) => +v.toFixed(3);
  const scale = round(108 * ANDROID_SIZE / 128);
  const offset = round((108 - 108 * ANDROID_SIZE) / 2);
  // Its outline: the band, the setting and the stone, without the light on
  // them (the shadow inside the band and the white glints on it)
  const lighting = (tag, attributes) => /fill:#4B8A99/i.test(attributes) || (tag === 'path' && /fill:#FFFFFF/i.test(attributes));
  const shapes = [...EMOJI_ART.matchAll(/<(path|polygon)\b([^>]*?)\s(d|points)="([^"]+)"/g)]
    .filter(([, tag, attributes]) => !lighting(tag, attributes))
    .map(([, tag, , , value]) => {
      const flat = value.replace(/\s+/g, ' ').trim();
      const d = tag === 'path' ? flat : `M${flat.split(' ').join(' L')} Z`;
      // a hairline of the same colour, so the facets join without seams
      return `        <path
            android:pathData="${d}"
            android:fillColor="#FFFFFF"
            android:strokeColor="#FFFFFF"
            android:strokeWidth="0.5"
            android:strokeLineJoin="round" />`;
    });
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- The themed (single-colour) app icon: the 💍 emoji's outline, inside the 66dp
     circle every launcher shows. Made by scripts/store-graphics.mjs -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="${scale}"
        android:scaleY="${scale}"
        android:translateX="${offset}"
        android:translateY="${offset}">
${shapes.join('\n')}
    </group>
</vector>
`;
}

// ---- Store and link-preview graphics ------------------------------------------------------
const FEATURE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: 1024px; height: 500px; box-sizing: border-box; padding: 0 80px;
    display: flex; align-items: center; gap: 56px;
    background: linear-gradient(135deg, #ec4899 0%, #f05a6e 45%, #f97316 100%);
    color: #fff; font-family: 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif;
  }
  body > svg { width: 230px; height: 230px; flex: none; border-radius: 52px; box-shadow: 0 12px 32px rgba(0,0,0,.18); }
  h1 { margin: 0; font-size: 86px; font-weight: 700; letter-spacing: -2px; }
  p { margin: 18px 0 0; font-size: 34px; line-height: 1.3; }
</style></head><body>${APP_ICON}<div><h1>${TITLE}</h1><p>${TAGLINE}</p></div></body></html>`;

// The link preview: the same, larger, with a line saying what Shaadi24 is
const PREVIEW = FEATURE
  .replace('width: 1024px; height: 500px;', 'width: 1200px; height: 630px;')
  .replace('body > svg { width: 230px; height: 230px; flex: none; border-radius: 52px;', 'body > svg { width: 280px; height: 280px; flex: none; border-radius: 63px;')
  .replace('h1 { margin: 0; font-size: 86px;', 'h1 { margin: 0; font-size: 100px;')
  .replace('p { margin: 18px 0 0; font-size: 34px;', 'p { margin: 18px 0 0; font-size: 40px;')
  .replace(`<h1>${TITLE}</h1>`, `<div style="font-size:30px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:.85;margin-bottom:10px">${PREVIEW_LINE}</div><h1>${TITLE}</h1>`);

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

const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return path.relative(ROOT, file);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const saved = [];
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  // An SVG drawn at a size, as RGBA pixels (transparent where it draws nothing)
  const pixels = async (svg, size) => Buffer.from(await page.evaluate(async ({ src, size }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, size }));
  const png = async (file, svg, size) => saved.push(write(file, pngWithAlpha(size, size, await pixels(svg, size))));
  // An opaque PNG (no alpha channel), as the App Store requires of the icon
  const opaque = async (file, svg, size, background) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:${background}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'png' });
    saved.push(path.relative(ROOT, file));
  };

  // iPhone
  await opaque(path.join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'), APP_ICON, 1024, '#fff');
  await opaque(path.join(IOS, 'Splash.imageset/splash-2732x2732.png'), logoSvg({ size: 0.22, background: '#fff' }), 2732, '#fff');
  await opaque(path.join(IOS, 'Splash.imageset/splash-2732x2732-dark.png'), logoSvg({ size: 0.22, background: DARK }), 2732, DARK);

  // Android: the adaptive icon's front layer and the launch screen at each density
  // (108 dp), and the icons older launchers show as they are (48 dp)
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, x] of Object.entries(densities)) {
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher_foreground.png`), ANDROID_FOREGROUND, 108 * x);
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher.png`), logoSvg({ size: 0.74, background: '#fff', radius: 190, inset: 48 }), 48 * x);
    await png(path.join(ANDROID, `mipmap-${name}/ic_launcher_round.png`), logoSvg({ size: 0.72, background: '#fff', tile: 'circle', inset: 48 }), 48 * x);
    await png(path.join(ANDROID, `drawable-${name}/splash_icon.png`), ANDROID_FOREGROUND, 108 * x);
  }
  saved.push(write(path.join(ANDROID, 'drawable/ic_launcher_monochrome.xml'), androidMonochrome()));

  // Google Play and the website
  await png(path.join(OUT, 'play-icon-512.png'), APP_ICON, 512);
  await png(path.join(PUBLIC, 'apple-touch-icon.png'), APP_ICON, 180);
  await png(path.join(PUBLIC, 'favicon-32.png'), logoSvg({ size: 0.86, background: '#fff', radius: 224, border: '#e5e7eb' }), 32);
  saved.push(write(path.join(PUBLIC, 'favicon.svg'),
    `<!-- The app icon (scripts/store-graphics.mjs), with rounded corners and an edge for browser tabs -->\n${
      logoSvg({ size: 0.86, background: '#fff', radius: 224, border: '#e5e7eb' })}\n`));

  await page.setViewportSize({ width: 1024, height: 500 });
  await page.setContent(FEATURE);
  // JPEG: the feature graphic may not have an alpha channel
  await page.screenshot({ path: path.join(OUT, 'play-feature-graphic.jpg'), type: 'jpeg', quality: 92 });
  saved.push(path.relative(ROOT, path.join(OUT, 'play-feature-graphic.jpg')));

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(PREVIEW);
  await page.screenshot({ path: path.join(PUBLIC, 'og-image.png') });
  saved.push('public/og-image.png');
  console.log(`Saved ${saved.length} images:\n  ${saved.join('\n  ')}`);
} finally {
  await browser.close();
}
