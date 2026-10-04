// Words MatchGPT doesn't allow (migration …_phase13_content_filter; Apple's
// App Review Guideline 1.2 asks for a filter next to reporting and blocking),
// against the local stack, through the API and in Chromium:
//   - a message with them is refused with a plain message (English, Hindi in
//     Latin letters and in Devanagari, disguised with numbers or capitals);
//     ordinary words that look like them are not (Chota Bheem, chutney,
//     Randeep, "chhod do", magna cum laude); editing a message in is refused
//   - a profile's text likewise, naming the field (About me, job title, name)
//   - text written before the filter doesn't block the profile's other
//     updates (last active, settings), and can be changed to something else
//   - the server's own writes and reports (which may quote) aren't filtered
//   - in the website: the chat keeps the refused text and says why; My
//     Profile's About Me says why
// Usage: ANON_KEY=… node content-filter.mjs <email A> <email B>   (onboarded, password TestPass!2026; DB_CONTAINER, BASE_URL)
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_MatchGPT';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ANON = (process.env.ANON_KEY_FILE ? fs.readFileSync(process.env.ANON_KEY_FILE, 'utf8') : process.env.ANON_KEY || '').trim();
const [EMAIL_A, EMAIL_B] = process.argv.slice(2);
if (!EMAIL_A || !EMAIL_B || !ANON) { console.error('usage: ANON_KEY=… node content-filter.mjs <email A> <email B>'); process.exit(2); }
const OUT = new URL('./.shots/content-filter/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

async function signIn(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass!2026' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`sign-in failed for ${email}`);
  return j.access_token;
}
const rest = async (jwt, method, path, body) => {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    method, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const MESSAGE_REFUSED = "This message has words MatchGPT doesn't allow. Please keep it respectful.";
const refusedFor = (r, field) => r.status === 400 && r.body?.code === 'MG001'
  && r.body?.message === `Your ${field} has words MatchGPT doesn't allow. Please change them.`;

const A = sql(`select id from auth.users where email = '${EMAIL_A}';`);
const B = sql(`select id from auth.users where email = '${EMAIL_B}';`);
const nameB = sql(`select name from profiles where id = '${B}';`);
const [lo, hi] = [A, B].sort();
const saved = sql(`select coalesce(description, '') || E'\\x1f' || coalesce(job_title, '') || E'\\x1f' || coalesce(about_family, '')
                   from profiles where id = '${A}';`).split('\x1f');
const reset = () => sql(`delete from messages where match_id in (select id from matches where user_a_id = '${lo}' and user_b_id = '${hi}');
  delete from matches where user_a_id = '${lo}' and user_b_id = '${hi}';
  delete from reports where reporter_id = '${A}' and reported_id = '${B}';`);
reset();
const matchId = sql(`insert into matches (user_a_id, user_b_id) values ('${lo}', '${hi}') returning id;`).split('\n')[0];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const appears = (locator, ms = 8000) => locator.first().waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);

try {
  const jwtA = await signIn(EMAIL_A);
  const jwtB = await signIn(EMAIL_B);
  const send = (content, jwt = jwtA, sender = A) => rest(jwt, 'POST', 'messages', { match_id: matchId, sender_id: sender, content });

  log('== Messages');
  let r = await send('Hello! Chota Bheem fan here, love chutney. Chhod do the formalities?');
  check(r.status === 201, `an ordinary message is sent (${r.status})`);
  const firstId = r.body?.[0]?.id;
  for (const text of ['tu chutiya hai', 'You B1TCH', 'what a fuuucking joke', 'madar chod', 'तू चूतिया है', 'send nudes']) {
    r = await send(text);
    check(r.status === 400 && r.body?.code === 'MG001' && r.body?.message === MESSAGE_REFUSED, `refused: "${text}"`);
  }
  for (const text of ['Randeep and Ranchod are my cousins', 'Graduated magna cum laude from Lund University', 'Fukrey is my favourite film']) {
    r = await send(text, jwtB, B);
    check(r.status === 201, `sent: "${text}"`);
  }
  r = await rest(jwtA, 'PATCH', `messages?id=eq.${firstId}`, { content: 'chutiya' });
  check(r.status === 400 && r.body?.code === 'MG001', 'editing a message into one is refused');
  r = await rest(jwtB, 'PATCH', `messages?id=eq.${firstId}`, { read_at: new Date().toISOString() });
  check(r.status === 200, `marking it read still works (${r.status})`);
  check(sql(`select count(*) from messages where match_id = '${matchId}';`) === '4', 'only the ordinary messages were saved');

  log('== Profiles');
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { description: 'Looking for a nice bitch' });
  check(refusedFor(r, 'About me'), `About me: "${r.body?.message}"`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { job_title: 'Madarchod manager' });
  check(refusedFor(r, 'job title'), `job title: "${r.body?.message}"`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { name: 'Randi', city: 'Pune' });
  check(refusedFor(r, 'name'), `name: "${r.body?.message}"`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { family_location: 'Bhosdike nagar' });
  check(refusedFor(r, 'family location'), `any other text field: "${r.body?.message}"`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { description: 'Chota Bheem fan who loves chutney; magna cum laude.' });
  check(r.status === 200, `ordinary text is saved (${r.status})`);

  log('== Text from before the filter');
  sql(`update profiles set about_family = 'A harami family' where id = '${A}';`);  // as the server: not checked
  check(sql(`select about_family from profiles where id = '${A}';`) === 'A harami family', 'the server\'s own writes aren\'t filtered');
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { last_active_at: new Date().toISOString() });
  check(r.status === 200, `the app's "last active" update still works (${r.status})`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { settings_read_receipts: true, about_family: 'A harami family' });
  check(r.status === 200, `other fields can be saved next to the old text (${r.status})`);
  r = await rest(jwtA, 'PATCH', `profiles?id=eq.${A}`, { about_family: 'A close, loving family' });
  check(r.status === 200, `and the old text can be changed (${r.status})`);

  log('== Reports');
  r = await rest(jwtA, 'POST', 'reports', { reporter_id: A, reported_id: B, reason: 'harassment', details: 'He called me a chutiya' });
  check(r.status === 201, `a report can quote what was said (${r.status})`);

  log('== In the website');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror:', e.message));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(EMAIL_A);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
  await page.getByPlaceholder(/Describe your ideal match/).waitFor({ timeout: 20000 });
  await page.getByText('Matches', { exact: true }).first().click();
  await page.locator('main').getByText(nameB).first().click();  // not the sidebar's own name
  const box = page.getByPlaceholder(`Message ${nameB}…`);
  await box.fill('Tu chutiya hai');
  await box.press('Enter');
  check(await appears(page.getByText(`Couldn't send: ${MESSAGE_REFUSED}`)), 'the chat says why the message wasn\'t sent');
  check(await box.inputValue() === 'Tu chutiya hai', 'and keeps the text to change');
  await page.screenshot({ path: `${OUT}1-chat.png` });
  await box.fill('Shall we talk on Sunday?');
  await box.press('Enter');
  check(await appears(page.getByText('Shall we talk on Sunday?').last()), 'an ordinary message goes through');

  await page.getByText('My Profile', { exact: true }).first().click();
  await page.getByText('Chota Bheem fan who loves chutney; magna cum laude.').click();
  await page.getByPlaceholder('Write a few sentences about yourself…').fill('Not a chutiya, I promise');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check(await appears(page.getByText("Couldn't save: Your About me has words MatchGPT doesn't allow. Please change them.")),
    'My Profile says why About me wasn\'t saved');
  await page.screenshot({ path: `${OUT}2-profile.png` });
  await ctx.close();
} catch (e) {
  failures++;
  log('ERROR', e.stack || e.message);
} finally {
  await browser.close();
  reset();
  const q = (s) => (s ? `'${s.replace(/'/g, "''")}'` : 'null');
  sql(`update profiles set description = ${q(saved[0])}, job_title = ${q(saved[1])}, about_family = ${q(saved[2])} where id = '${A}';`);
}
log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
