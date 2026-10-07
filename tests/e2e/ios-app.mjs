// The iPhone app's own behaviour (lib/nativeApp.ts, index.css), in Chromium
// with a stand-in for Capacitor's iOS bridge (its real bridge script, plugin
// calls recorded and answered) on an iPhone 15/16-sized screen. Chromium has
// no notch, so the test sets --safe-top / --safe-bottom to an iPhone's 59 and
// 34 points and checks nothing sits under them: the headers, the sign-in
// popup, the menu, the filters, a toast, the Shaadi24+ sheet, a chat's message
// box. Also: viewport-fit=cover, the status bar text follows the theme,
// email-only sign-in while Supabase has Apple and Google off
// (app-social-signin.mjs covers them), Shaadi24+ "coming to the app soon".
// Usage: node ios-app.mjs <email>   (an onboarded account, password TestPass!2026)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';  // `docker ps` shows the name
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const REPO = process.env.REPO_ROOT || new URL('../..', import.meta.url).pathname;
const BRIDGE = `${REPO}/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js`;
const EMAIL = process.argv[2];
if (!EMAIL) { console.error('usage: node ios-app.mjs <email>'); process.exit(2); }
const OUT = new URL('./.shots/ios/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const SCREEN = { width: 393, height: 852 };
const TOP = 59, BOTTOM = 34;  // an iPhone 15/16's Dynamic Island and home bar, in points
const me = sql(`select id from profiles where email = '${EMAIL}';`);
const [otherId, otherName] = sql(`select id || '|' || name from profiles where id <> '${me}' and onboarding_complete
  and name in (select name from profiles group by name having count(*) = 1)
  and not exists (select 1 from blocks b where (b.blocker_id = '${me}' and b.blocked_id = profiles.id)
                                          or (b.blocker_id = profiles.id and b.blocked_id = '${me}'))  -- Matches hides them
  and not coalesce(is_banned, false)
  order by name limit 1;`).split('|');
sql(`delete from matches where '${me}' in (user_a_id, user_b_id);
     insert into matches (user_a_id, user_b_id)  -- stored as the smaller id first
       values (least('${me}'::uuid, '${otherId}'::uuid), greatest('${me}'::uuid, '${otherId}'::uuid));
     update profiles set subscription_tier = 'FREE', account_created = now(), daily_search_count = 0,
       is_paused = false, settings_theme = 'system' where id = '${me}';`);

// What the native side provides: the bridge, and the plugins this app uses
const STANDIN = `
  window.__native = [];
  window.webkit = { messageHandlers: { bridge: { postMessage(call) {
    if (call.pluginId === 'Console' || call.type !== 'message') return;
    window.__native.push(call);
    if (call.callbackId !== '-1' && call.methodName !== 'addListener') {
      setTimeout(() => window.Capacitor.fromNative({
        callbackId: call.callbackId, pluginId: call.pluginId, methodName: call.methodName, success: true, data: {},
      }));
    }
  } } } };
  window.Capacitor = { PluginHeaders: [
    { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }] },
    { name: 'SplashScreen', methods: [{ name: 'show', rtype: 'promise' }, { name: 'hide', rtype: 'promise' }] },
    { name: 'SystemBars', methods: [{ name: 'setStyle', rtype: 'promise' }, { name: 'show', rtype: 'promise' },
                                    { name: 'hide', rtype: 'promise' }] },
  ] };
`;
// Chromium has no notch: give the page an iPhone's safe areas
const NOTCH = `html.native-ios { --safe-top: ${TOP}px !important; --safe-bottom: ${BOTTOM}px !important; }`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function appPage(colorScheme = 'light') {
  const ctx = await browser.newContext({ viewport: SCREEN, colorScheme, hasTouch: true });
  await ctx.addInitScript({ content: STANDIN });
  await ctx.addInitScript({ path: BRIDGE });
  await ctx.addInitScript({ content: `addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = ${JSON.stringify(NOTCH)}; document.head.append(s); });` });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  return page;
}
const calls = (page, pluginId, methodName) =>
  page.evaluate(([p, m]) => window.__native.filter((c) => c.pluginId === p && c.methodName === m), [pluginId, methodName]);
const box = (locator) => locator.first().boundingBox();
const rect = (page, selector) => page.evaluate((sel) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom } : null;
}, selector);
// A fixed panel draws its first child at the top and its last at the bottom
const innerEdges = (page, selector) => page.evaluate((sel) => {
  const kids = [...(document.querySelector(sel)?.children ?? [])].filter((k) => k.getBoundingClientRect().height > 0);
  return kids.length ? { top: kids[0].getBoundingClientRect().top, bottom: kids.at(-1).getBoundingClientRect().bottom } : null;
}, selector);
const clear = (edges, what) => check(!!edges && edges.top >= TOP - 0.5 && edges.bottom <= SCREEN.height - BOTTOM + 0.5,
  `${what} stays clear of the notch and the home bar (${edges ? `${Math.round(edges.top)}–${Math.round(edges.bottom)}` : 'missing'})`);

try {
  log('1. signed out');
  for (const scheme of ['light', 'dark']) {
    const page = await appPage(scheme);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    const style = (await calls(page, 'SystemBars', 'setStyle')).at(-1)?.options?.style;
    check(style === (scheme === 'dark' ? 'DARK' : 'LIGHT'), `${scheme}: status bar text for a ${scheme} page (${style})`);
    if (scheme === 'dark') { await page.context().close(); continue; }
    check(await page.evaluate(() => document.documentElement.classList.contains('native-ios')
      && document.querySelector('meta[name="viewport"]').content.includes('viewport-fit=cover')), 'knows it\'s an iPhone; page runs edge to edge');
    check(await page.evaluate(() => /maximum-scale=1\.0, user-scalable=no/.test(document.querySelector('meta[name="viewport"]').content)),
      'the app doesn\'t zoom (an iPhone would zoom in on a tapped text box)');
    clear(await rect(page, 'header'), 'the start screen\'s top bar');
    await page.screenshot({ path: `${OUT}1-start.png` });
    await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
    await page.waitForTimeout(300);
    clear(await rect(page, 'footer'), 'its footer, scrolled to the end');
    await page.evaluate(() => scrollTo(0, 0));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('button', { name: /Continue with Email/ }).waitFor();
    await page.waitForTimeout(400);
    check(await page.getByText('Continue with Google').count() === 0, 'email-only sign-in while Apple and Google are off in Supabase');
    clear(await rect(page, '.popup-backdrop > div'), 'the sign-in popup');
    await page.screenshot({ path: `${OUT}2-sign-in.png` });
    await page.context().close();
  }

  log('2. signed in');
  const page = await appPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  const prompt = page.getByTestId('find-match-box');
  await prompt.waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  clear(await rect(page, 'div.h-screen'), 'the app screen');
  check(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), 'the screen fits without the page itself scrolling');
  await page.screenshot({ path: `${OUT}3-find-match.png` });

  await prompt.fill('someone kind');
  await prompt.press('Enter');
  const toast = page.getByText(/Found \d+ match/);
  await toast.waitFor({ timeout: 20000 });
  check((await box(toast)).y >= TOP, `the "Found … matches" toast sits below the notch (${Math.round((await box(toast)).y)})`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}4-results.png` });

  await page.getByTitle('Filters').click();
  await page.getByText('Refine your search pool').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  clear(await innerEdges(page, 'aside.fixed.right-0'), 'the filters drawer');
  await page.screenshot({ path: `${OUT}5-filters.png` });
  await page.locator('aside.fixed.right-0 button[aria-label="Close"]').click();
  await page.waitForTimeout(400);

  await page.locator('main button.md\\:hidden').first().click();
  await page.waitForTimeout(500);
  clear(await innerEdges(page, 'aside.fixed.h-full'), 'the menu');
  await page.screenshot({ path: `${OUT}6-menu.png` });
  await page.getByText('Get Shaadi24+', { exact: true }).click();
  await page.waitForTimeout(500);
  // The note shows once the store has answered (isVisible doesn't wait)
  check(await page.getByText('Shaadi24+ is coming to the app soon.').waitFor({ timeout: 8000 }).then(() => true, () => false),
    'Shaadi24+ "coming to the app soon"');
  clear(await rect(page, '[role="dialog"]'), 'the Shaadi24+ sheet');
  await page.screenshot({ path: `${OUT}7-shaadi24-plus.png` });
  await page.getByRole('button', { name: 'Maybe later' }).click();
  await page.waitForTimeout(400);

  await page.getByText('Matches', { exact: true }).first().click();  // the menu is still open
  await page.getByText(otherName).first().click();
  await page.waitForTimeout(800);
  const message = page.locator('textarea, input[placeholder*="essage"]');
  const messageBox = await box(message);
  check(!!messageBox && messageBox.y + messageBox.height <= SCREEN.height - BOTTOM,
    `the message box sits above the home bar (bottom ${messageBox ? Math.round(messageBox.y + messageBox.height) : '?'})`);
  await page.screenshot({ path: `${OUT}8-chat.png` });
} catch (e) {
  failures++;
  log('ERROR', e.message.split('\n')[0]);
}

await browser.close();
sql(`delete from matches where '${me}' in (user_a_id, user_b_id);`);
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
