// Sign in, then sit on the main app while the (2-minute) sign-in token refreshes.
// Reports what the screen shows after the refresh.
import { chromium } from 'playwright';
const email = process.argv[2] || 'seed_aanyasharma_22@shaadigpt.dev';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext();
await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
const page = await ctx.newPage();
const t0 = Date.now();
const log = (...a) => console.log(`+${Math.round((Date.now() - t0) / 1000)}s`, ...a);
page.on('request', (r) => { if (r.url().includes('/auth/v1/token')) log('->', r.method(), r.url().replace(/.*\/auth\/v1/, '/auth/v1')); });
page.on('console', (m) => { if (m.type() === 'error') log('console.error', m.text().slice(0, 120)); });
await page.goto(process.env.BASE_URL || 'http://localhost:3000');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('button', { name: /Continue with Email/ }).click();
await page.locator('input[type=email]').fill(email);
await page.locator('input[type=password]').fill('SeedUser!2024');
await page.locator('form').getByRole('button', { name: /Log In/i }).click();
await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 15000 });
log('signed in, main app showing');
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(10000);
  const errorShown = await page.getByText("Couldn't load your profile").isVisible();
  const appShown = await page.getByPlaceholder(/Describe your ideal match/).isVisible();
  log(errorShown ? 'SCREEN: "Couldn\'t load your profile" error' : appShown ? 'screen: main app' : 'screen: other');
  if (errorShown) break;
}
await page.screenshot({ path: new URL('./.shots/refresh-check.png', import.meta.url).pathname });
await browser.close();
