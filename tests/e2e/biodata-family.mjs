// My Biodata and Family Circle, against the local stack: the members' app on
// BASE_URL (VITE_MEMBERS_ON_WEB) and the website on WEBSITE_URL (as it is live).
//  1. My Biodata: the preview from the profile (an answer the member hid is
//     left out), in Hindi and another design; Save image downloads a PNG;
//     Share on WhatsApp opens WhatsApp with the link
//  2. The link's page on the website, signed out: what members see, never the
//     email or a hidden answer; each visit counts, and the app says so; a
//     link turned off opens nothing, and the next biodata gets a new one
//  3. Family Circle: Mummy is invited (WhatsApp opens with her link); her page
//     shows who the member liked, but not someone who said no to families;
//     in Hindi; her Yes with a note is saved, the member gets a notification
//     and sees it in the app; removed, her link opens nothing; without
//     Shaadi24+ nobody can be invited
//  4. Admin → Growth counts biodatas and Family Circle
// Usage: node biodata-family.mjs <admin email> <member email>
//   (password TestPass!2026; DB_CONTAINER, BASE_URL, WEBSITE_URL)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const WEBSITE = process.env.WEBSITE_URL || 'http://localhost:3002';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node biodata-family.mjs <admin email> <member email>'); process.exit(2); }
const PASSWORD = 'TestPass!2026';
const OUT = new URL('./.shots/biodata-family/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const me = sql(`select id from profiles where email = '${MEMBER}';`);
const myName = sql(`select split_part(trim(name), ' ', 1) from profiles where id = '${me}';`);
// The member hides their caste; likes two people, one of whom said no to families
const [liked, shy] = sql(`select id from profiles where id <> '${me}' and onboarding_complete and not coalesce(is_banned, false)
  and not coalesce(is_paused, false) and email like 'seed_%' order by email offset 10 limit 2;`).split('\n');
const likedName = sql(`select split_part(trim(name), ' ', 1) from profiles where id = '${liked}';`);
const shyName = sql(`select split_part(trim(name), ' ', 1) from profiles where id = '${shy}';`);
// What the test changes, put back at the end
const [hiddenBefore, casteBefore] = sql(`select coalesce(hidden_fields::text, '{}') || '|' || coalesce(caste, '') from profiles where id = '${me}';`).split('|');
sql(`update profiles set hidden_fields = array['caste'], caste = coalesce(caste, 'Patel') where id = '${me}';
     update biodata_links set revoked_at = now() where user_id = '${me}' and revoked_at is null;
     delete from family_members where member_id = '${me}';
     delete from likes where liker_id = '${me}' and liked_id in ('${liked}', '${shy}');
     insert into likes (liker_id, liked_id) values ('${me}', '${liked}'), ('${me}', '${shy}');
     update profiles set family_can_view = false where id = '${shy}';
     update profiles set family_can_view = true where id = '${liked}';
     update app_settings set pro_for_all = true;`);
const myCaste = sql(`select caste from profiles where id = '${me}';`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const opened = [];  // windows the app opened (WhatsApp)

async function signedIn(email, desktop) {
  const ctx = await browser.newContext(desktop ? { viewport: desktop }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  // WhatsApp: noted, not opened
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (r) => { opened.push(r.request().url()); return r.fulfill({ body: '' }); });
  const page = await ctx.newPage();
  ctx.on('page', (p) => { setTimeout(() => p.close().catch(() => {}), 1500); });
  page.on('pageerror', (e) => { log('pageerror:', e.message); failures++; });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByTestId('find-match-box').waitFor({ timeout: 20000 });
  return { ctx, page };
}
const menu = async (page, label) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).first().click();
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
};
const waitOpened = async (pattern) => {
  for (let i = 0; i < 30 && !opened.some((u) => pattern.test(decodeURIComponent(u))); i++) await new Promise((r) => setTimeout(r, 200));
  return opened.find((u) => pattern.test(decodeURIComponent(u)));
};

try {
  log('1. My Biodata');
  const { page } = await signedIn(MEMBER);
  await menu(page, 'My Biodata');
  const preview = page.getByTestId('biodata-preview');
  await preview.waitFor({ timeout: 10000 });
  await page.getByTestId('biodata-link').waitFor({ timeout: 10000 });
  const text = await preview.innerText();
  check(text.includes('Marriage Biodata') && text.includes(myName), `the preview is made from the profile ("${myName}")`);
  check(!text.includes(myCaste), `the caste the member hid is left out (${myCaste})`);
  check(!text.includes(MEMBER), 'no email');
  await page.screenshot({ path: `${OUT}1-biodata.png` });
  await page.getByRole('button', { name: 'हिन्दी' }).click();
  await page.getByRole('button', { name: 'Floral' }).click();
  check((await preview.innerText()).includes('विवाह बायोडाटा'), 'in Hindi: "विवाह बायोडाटा"');
  await page.screenshot({ path: `${OUT}2-biodata-hindi-floral.png` });
  const token = sql(`select token from biodata_links where user_id = '${me}' and revoked_at is null;`);
  check(/^[a-f0-9]{20}$/.test(token), 'a private link was made');

  const download = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'Save image' }).click();
  const file = await (await download).path();
  const png = fs.readFileSync(file);
  check(png.subarray(1, 4).toString() === 'PNG' && png.length > 30000, `Save image downloads a picture (${Math.round(png.length / 1024)} KB)`);
  fs.copyFileSync(file, `${OUT}biodata.png`);
  await page.getByRole('button', { name: 'Share on WhatsApp' }).click();
  const wa = await waitOpened(new RegExp(`wa\\.me/[\\s\\S]*b/${token}`));
  check(!!wa, 'Share on WhatsApp opens WhatsApp with the link');

  log('2. The link\'s page on the website, signed out');
  const site = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const visitor = await site.newPage();
  await visitor.goto(`${WEBSITE}/b/${token}`);
  await visitor.getByTestId('biodata-page').waitFor({ timeout: 10000 });
  await visitor.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10000 });
  await visitor.waitForTimeout(800);
  const page2 = await visitor.locator('main').innerText();
  await visitor.screenshot({ path: `${OUT}3-biodata-page.png` });
  check(page2.includes(myName), 'the page shows the member\'s first name');
  check(!page2.includes(MEMBER) && !page2.includes(myCaste), 'never the email or the hidden caste');
  check(await visitor.locator('meta[name=robots]').getAttribute('content') === 'noindex', 'not for search engines');
  check(sql(`select opens from biodata_links where token = '${token}';`) === '1', 'the visit was counted');
  await menu(page, 'Find Match');
  await menu(page, 'My Biodata');
  await page.getByTestId('biodata-link').waitFor({ timeout: 10000 });
  check(/opened 1 time/.test(await page.getByTestId('biodata-link').innerText()), 'the app says the link was opened once');
  await page.getByRole('button', { name: 'Turn off this link' }).click();
  await page.getByRole('button', { name: 'Turn off', exact: true }).click();
  await page.getByText(/Link turned off/).waitFor({ timeout: 10000 });
  await visitor.goto(`${WEBSITE}/b/${token}`);
  await visitor.getByTestId('biodata-gone').waitFor({ timeout: 10000 });
  check(true, 'a link turned off opens nothing');
  const next = sql(`select token from biodata_links where user_id = '${me}' and revoked_at is null;`);
  check(/^[a-f0-9]{20}$/.test(next) && next !== token, 'the next biodata has a new link');

  log('3. Family Circle');
  await menu(page, 'Family Circle');
  await page.getByTestId('family-view').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Mother', exact: true }).click();
  check(await page.getByLabel('What do you call them?').inputValue() === 'Mummy', '"Mother" suggests "Mummy"');
  await page.getByRole('button', { name: 'Invite on WhatsApp' }).click();
  await page.getByTestId('family-member').first().waitFor({ timeout: 10000 });
  const famToken = sql(`select token from family_members where member_id = '${me}' and removed_at is null;`);
  check(!!(await waitOpened(new RegExp(`wa\\.me/[\\s\\S]*family/${famToken}`))), 'Invite on WhatsApp opens WhatsApp with Mummy\'s own link');
  await page.screenshot({ path: `${OUT}4-family-circle.png` });

  const mum = await site.newPage();
  await mum.goto(`${WEBSITE}/family/${famToken}`);
  await mum.getByTestId('family-page').waitFor({ timeout: 10000 });
  await mum.getByTestId('family-card').first().waitFor({ timeout: 10000 });
  const mumText = await mum.locator('main').innerText();
  check(mumText.includes(likedName), `Mummy sees ${likedName}, whom the member liked`);
  check(!mumText.includes(shyName), `but not ${shyName}, who said no to families`);
  await mum.getByRole('button', { name: 'हिन्दी' }).click();
  check(await mum.getByRole('heading', { level: 1 }).innerText() === `${myName} की पसंद`, 'in Hindi: "… की पसंद"');
  const card = mum.getByTestId('family-card').filter({ hasText: likedName }).first();
  await card.getByRole('textbox').fill('Achha parivaar lagta hai');
  await card.getByRole('button', { name: /हाँ/ }).click();
  await card.getByRole('status').filter({ hasText: 'भेज दिया' }).waitFor({ timeout: 10000 });
  await mum.screenshot({ path: `${OUT}5-family-page.png` });
  check(sql(`select reaction || '|' || note from family_reactions r join family_members f on f.id = r.family_member_id
    where f.member_id = '${me}' and r.profile_id = '${liked}';`) === 'yes|Achha parivaar lagta hai', 'her Yes and note are saved');
  check(sql(`select count(*) from push_queue where user_id = '${me}' and event_type = 'family_reaction';`) === '1', 'the member gets a notification');
  await menu(page, 'Find Match');
  await menu(page, 'Family Circle');
  await page.getByTestId('family-reaction').first().waitFor({ timeout: 10000 });
  const seen = await page.getByTestId('family-reaction').first().innerText();
  check(/Mummy\s+Yes/.test(seen) && seen.includes('Achha parivaar lagta hai') && await page.getByTestId('family-reaction').first().locator('svg').count() > 0,
    'the member sees "Mummy [thumbs up] Yes" and her note');
  check(/Looked today · 1 reaction/.test(await page.getByTestId('family-member').first().innerText()), 'and that she looked today');
  await page.waitForTimeout(500);  // the menu closing
  await page.screenshot({ path: `${OUT}6-family-reactions.png` });
  await page.getByTestId('family-member').first().getByRole('button', { name: 'Remove' }).click();
  await page.getByTestId('family-member').first().getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByText(/can no longer see your shortlist/).waitFor({ timeout: 10000 });
  await mum.goto(`${WEBSITE}/family/${famToken}`);
  await mum.getByTestId('family-gone').waitFor({ timeout: 10000 });
  check(true, 'removed, her link opens nothing');
  sql(`update app_settings set pro_for_all = false; update profiles set subscription_tier = 'FREE' where id = '${me}';`);
  const refused = sql(`select set_config('request.jwt.claims', json_build_object('sub', '${me}', 'role', 'authenticated')::text, false);
    do $$ begin perform public.invite_family_member('Papa', 'father'); raise notice 'invited'; exception when others then raise notice 'refused: %', sqlerrm; end $$;`);
  check(!/invited/.test(refused), 'without Shaadi24+ nobody can be invited');

  log('4. Admin → Growth');
  const { page: ap } = await signedIn(ADMIN, { width: 1400, height: 950 });
  await ap.getByText('Admin', { exact: true }).first().click();
  await ap.getByTestId('admin-sidebar').getByRole('button', { name: /^Growth/ }).click();
  await ap.getByTestId('growth-biodata').waitFor({ timeout: 15000 });
  const g = await ap.getByTestId('growth-biodata').innerText();
  check(/Members with a biodata\s*\d+/.test(g) && /Times opened\s*[1-9]/.test(g), 'Admin → Growth: biodatas made and opened');
  check(/Reactions\s*[1-9]/.test(await ap.getByTestId('growth-family').innerText()), 'Admin → Growth: Family Circle reactions');
  await ap.getByTestId('growth-biodata').screenshot({ path: `${OUT}7-admin-growth.png` });
} catch (e) {
  failures++;
  log('FAIL', e.message.split('\n').slice(0, 8).join('\n'));
} finally {
  sql(`update app_settings set pro_for_all = true;
       update profiles set hidden_fields = '${hiddenBefore}', caste = nullif('${casteBefore}', '') where id = '${me}';
       update profiles set family_can_view = true where id = '${shy}';
       delete from likes where liker_id = '${me}' and liked_id in ('${liked}', '${shy}');
       delete from family_members where member_id = '${me}';
       delete from push_queue where user_id = '${me}' and event_type = 'family_reaction';`);
  await browser.close();
}
log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
