// Admin → Blog and the website's blog, end to end (with tests/e2e/gemini-standin.cjs as Gemini):
//   1. Ideas from AI; "Write this" drafts a whole post into the editor: title, address, text,
//      excerpt, search fields and tags, with the SEO check list and a Google preview
//   2. A cover picture uploads; a selected passage is rewritten by AI; "Fill search fields"
//   3. Publish: listed as Published, logged; the website's /blog lists it and /blog/<slug> shows
//      it with its title, description, canonical address and structured data; the visit counts
//   4. Drafts and future dates aren't on the website; unpublished, the post is "not here"
//   5. Only admins write posts, add pictures or use AI writing
// Usage: node admin-blog.mjs <admin email> <member email>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const DB = process.env.DB_CONTAINER || 'supabase_db_Shaadi24';
const APP = process.env.BASE_URL || 'http://localhost:3000';
const SITE = process.env.SITE_URL || 'http://localhost:3002';
const API = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const [ADMIN, MEMBER] = process.argv.slice(2);
if (!ADMIN || !MEMBER) { console.error('usage: node admin-blog.mjs <admin email> <member email>'); process.exit(2); }
const OUT = new URL('./.shots/admin-blog/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sql = (q) => execSync(`docker exec -i ${DB} psql -U postgres -At`, { input: q }).toString().trim();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) failures++; };

const SLUG = 'questions-to-ask-before-marriage';
const STARTED = sql('select now();');
const SERVICE = process.env.SERVICE_ROLE_KEY;
const cleanup = async () => {
  sql(`delete from blog_posts where slug in ('${SLUG}', 'test-draft-post', 'test-future-post');`);
  // Pictures through the Storage API (the database won't delete them directly)
  if (!SERVICE) return;
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const listed = await fetch(`${API}/storage/v1/object/list/blog`, { method: 'POST', headers, body: JSON.stringify({ prefix: 'covers', limit: 1000 }) })
    .then((r) => r.json()).catch(() => []);
  const prefixes = (Array.isArray(listed) ? listed : []).map((o) => `covers/${o.name}`);
  if (prefixes.length) await fetch(`${API}/storage/v1/object/blog`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes }) });
};
await cleanup();
sql(`insert into admin_emails (email) values ('${ADMIN}') on conflict do nothing;`);

// A 2×2 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(`${OUT}cover.png`, PNG);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const signIn = async (page, email) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Continue with Email/ }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('TestPass!2026');
  await page.locator('form').getByRole('button', { name: /Log In/i }).click();
};
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('shaadigpt_cookie_consent_shown', '1'));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return page;
};
const tokenOf = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
});

const page = await newPage();
try {
  // ---- 1. Ideas and an AI draft --------------------------------------------------------------
  log('1. Ideas and an AI draft');
  await signIn(page, ADMIN);
  await page.getByText('Admin', { exact: true }).first().click();
  const sidebar = page.getByTestId('admin-sidebar');
  await sidebar.waitFor({ timeout: 20000 });
  await sidebar.getByRole('button', { name: 'Blog', exact: true }).click();
  await page.getByTestId('admin-blog').waitFor({ timeout: 20000 });
  check(await page.getByRole('heading', { name: 'Blog' }).isVisible(), 'Blog is a section under Growth');

  await page.getByRole('button', { name: 'Ideas', exact: true }).click();
  const ideas = page.getByTestId('blog-ideas');
  await ideas.getByRole('button', { name: 'Suggest' }).click();
  await ideas.getByText('Questions to ask before marriage', { exact: true }).waitFor({ timeout: 20000 });
  check((await ideas.getByRole('button', { name: /^Write this/ }).count()) === 2, 'ideas from AI, each with "Write this"');
  await page.screenshot({ path: `${OUT}1-ideas.png` });
  await ideas.getByRole('button', { name: /^Write this\s*: Questions to ask/ }).click();

  const draftAi = page.getByTestId('blog-draft-ai');
  await draftAi.waitFor();
  check(await draftAi.getByLabel('What is the post about?').inputValue() === 'Questions to ask before marriage', 'the idea fills the topic');
  check(await draftAi.getByLabel(/Search phrase/).inputValue() === 'questions to ask before marriage', 'and the search phrase');
  await draftAi.getByRole('button', { name: 'Write the draft' }).click();
  await draftAi.waitFor({ state: 'detached', timeout: 30000 });
  const editor = page.getByTestId('blog-editor');
  check(await page.locator('#post-title').inputValue() === 'Questions to Ask Before Marriage', 'the draft has a title');
  check(await page.locator('#post-slug').inputValue() === SLUG, 'an address');
  const content = await page.locator('#post-content').inputValue();
  check(content.startsWith('These questions') && content.includes('## Money'), 'the text, without a repeated # title');
  check((await page.locator('#post-seo-title').inputValue()).startsWith('Questions to Ask Before Marriage:'), 'a search title');
  check((await page.locator('#post-seo-desc').inputValue()).length > 100, 'a search description');
  check(await page.locator('#post-tags').inputValue() === 'before marriage, family', 'tags');
  check(await page.locator('#post-cover-alt').inputValue() === 'A couple talking over chai', 'a description for a cover picture');
  check(await page.getByTestId('google-preview').innerText().then((t) => t.includes('| Shaadi24')), 'a Google preview');
  const scoreBefore = await page.getByTestId('seo-score').innerText();
  log('    SEO checks met:', scoreBefore);
  await page.screenshot({ path: `${OUT}2-draft.png`, fullPage: true });

  // ---- 2. Cover, rewrite, search fields ----------------------------------------------------------
  log('2. Cover picture, rewrite, search fields');
  await editor.locator('input[aria-label="Cover picture"]').setInputFiles(`${OUT}cover.png`);
  const cover = editor.locator('img[alt="A couple talking over chai"]');
  await cover.waitFor({ timeout: 15000 });
  const coverUrl = await page.locator('#post-cover-url').inputValue();
  check(/\/storage\/v1\/object\/public\/blog\/covers\//.test(coverUrl), 'the cover picture uploads to the blog bucket');
  check(await page.evaluate((u) => fetch(u).then((r) => r.ok), coverUrl), 'and anyone can load it');

  await page.evaluate(() => {
    const ta = document.getElementById('post-content');
    const i = ta.value.indexOf('## Money');
    ta.focus();
    ta.setSelectionRange(i, i + '## Money'.length);
  });
  await editor.getByRole('button', { name: 'Rewrite selection', exact: true }).click();
  const rewrite = page.getByTestId('blog-rewrite');
  await rewrite.getByLabel('Rewrite the selected text:').fill('Make it louder');
  await rewrite.getByRole('button', { name: 'Rewrite' }).click();
  await rewrite.waitFor({ state: 'detached', timeout: 20000 });
  const rewritten = await page.locator('#post-content').inputValue();
  check(rewritten.includes('## MONEY') && !rewritten.includes('## Money') && rewritten.includes('## Family'), 'the selected passage, and only it, is rewritten');

  await page.locator('#post-seo-title').fill('');
  await editor.getByRole('button', { name: 'Fill search fields with AI', exact: true }).click();
  await page.getByText('Search fields filled in').waitFor({ timeout: 20000 });
  check((await page.locator('#post-seo-title').inputValue()).length > 0, '"Fill search fields" writes the search title again');

  await editor.getByRole('button', { name: 'Preview', exact: true }).click();
  check(await page.getByTestId('blog-preview').getByRole('heading', { name: 'Family' }).isVisible(), 'Preview shows the text formatted');
  await editor.getByRole('button', { name: 'Write', exact: true }).click();

  // ---- 3. Publish, and the website ------------------------------------------------------------
  log('3. Publish');
  await editor.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText('Published', { exact: true }).first().waitFor({ timeout: 15000 });
  check(await page.getByTestId('blog-state').innerText() === 'Published', 'the post is published');
  const row = sql(`select status || '|' || ai_assisted || '|' || (published_at is not null) || '|' || coalesce(cover_url, '') from blog_posts where slug = '${SLUG}';`);
  check(row.startsWith('published|true|true|http'), `saved as published, AI-assisted, with a date and cover (${row.split('|').slice(0, 3)})`);
  check(sql(`select count(*) from admin_audit where action = 'publish_blog_post' and details->>'slug' = '${SLUG}' and created_at >= '${STARTED}';`) === '1', 'publishing is in the audit log');
  await editor.getByRole('button', { name: '← All posts' }).click();
  const list = page.getByTestId('blog-posts');
  await list.waitFor();
  check(await list.locator('tr', { hasText: 'Questions to Ask Before Marriage' }).getByText('Published').isVisible(), 'listed as Published');

  const site = await newPage();
  await site.goto(`${SITE}/`);
  const blogLink = site.getByRole('navigation', { name: 'Website' }).getByRole('link', { name: 'Blog' });
  check(await blogLink.waitFor({ timeout: 20000 }).then(() => true, () => false), 'the home page links to the blog');
  await site.goto(`${SITE}/blog`);
  await site.getByTestId('blog-card').first().waitFor({ timeout: 20000 });
  check(await site.getByRole('link', { name: 'Questions to Ask Before Marriage' }).first().isVisible(), '/blog lists the post');
  check((await site.title()).startsWith('Shaadi24 Blog'), '/blog has its own title');
  await site.screenshot({ path: `${OUT}3-blog.png`, fullPage: true });
  await site.getByRole('link', { name: 'Questions to Ask Before Marriage' }).first().click();
  await site.getByTestId('blog-post').waitFor({ timeout: 20000 });
  check(site.url().endsWith(`/blog/${SLUG}`), 'the post opens at /blog/<slug>');
  check(await site.getByRole('heading', { level: 1, name: 'Questions to Ask Before Marriage' }).isVisible(), 'with its title');
  check(await site.getByRole('heading', { level: 2, name: 'Family' }).isVisible(), 'and its text');
  check(await site.getByTestId('blog-cta').isVisible(), 'and where to get the apps');
  const head = await site.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    ld: JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}'),
  }));
  check(head.title === 'Questions to Ask Before Marriage: A Practical Guide | Shaadi24', `the page title is the search title (${head.title})`);
  check(head.description?.startsWith('The questions to ask before marriage'), 'the description is the search description');
  check(head.canonical?.endsWith(`/blog/${SLUG}`), 'the canonical address');
  check(head.ogImage === coverUrl, 'the link preview shows the cover');
  check(head.ld['@type'] === 'BlogPosting' && head.ld.headline, 'structured data for search engines');
  await site.screenshot({ path: `${OUT}4-post.png`, fullPage: true });
  await site.waitForTimeout(500);
  check(Number(sql(`select views from blog_views v join blog_posts p on p.id = v.post_id where p.slug = '${SLUG}';`)) >= 1, 'the visit is counted');

  // ---- 4. Drafts, future dates, unpublishing -----------------------------------------------------
  log('4. Drafts and scheduled posts stay off the website');
  sql(`insert into blog_posts (slug, title, content, status) values ('test-draft-post', 'Test draft', 'x', 'draft');
       insert into blog_posts (slug, title, content, status, published_at) values ('test-future-post', 'Test future', 'x', 'published', now() + interval '2 days');`);
  const anon = await fetch(`${API}/rest/v1/blog_posts?select=slug`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }).then((r) => r.json());
  check(Array.isArray(anon) && anon.some((p) => p.slug === SLUG) && !anon.some((p) => p.slug.startsWith('test-')), 'visitors read only published posts whose date has come');
  await site.goto(`${SITE}/blog/test-future-post`);
  await site.getByTestId('blog-not-found').waitFor({ timeout: 20000 });
  check(true, 'a scheduled post is "not here" until its date');
  await page.reload();
  await page.getByText('Admin', { exact: true }).first().click();
  await page.getByTestId('admin-sidebar').getByRole('button', { name: 'Blog', exact: true }).click();
  await page.getByTestId('blog-posts').waitFor({ timeout: 20000 });
  check(await page.getByTestId('blog-posts').locator('tr', { hasText: 'Test future' }).getByText('Scheduled').isVisible(), 'admins see it as Scheduled');
  await page.getByRole('button', { name: 'Drafts' }).click();
  check(await page.getByTestId('blog-posts').locator('tbody tr').count() === 1, 'and drafts on their own');
  await page.getByRole('button', { name: 'All' }).click();

  await page.getByRole('button', { name: /^Questions to Ask Before Marriage/ }).click();
  await page.getByTestId('blog-editor').getByRole('button', { name: 'Unpublish' }).click();
  await page.getByText('Draft saved').waitFor({ timeout: 15000 });
  await site.goto(`${SITE}/blog/${SLUG}`);
  await site.getByTestId('blog-not-found').waitFor({ timeout: 20000 });
  check(true, 'unpublished, the post is gone from the website');
  check(sql(`select count(*) from admin_audit where action = 'unpublish_blog_post' and details->>'slug' = '${SLUG}' and created_at >= '${STARTED}';`) === '1', 'unpublishing is logged');

  // ---- 5. Only admins --------------------------------------------------------------------------
  log('5. Only admins');
  const memberPage = await newPage();
  await signIn(memberPage, MEMBER);
  await memberPage.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('-auth-token')), null, { timeout: 20000 });
  const memberToken = await tokenOf(memberPage);
  const as = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
  const ai = await fetch(`${API}/functions/v1/blog-ai`, { method: 'POST', headers: as(memberToken), body: JSON.stringify({ action: 'ideas' }) });
  check(ai.status === 403, `a member can't use AI writing (${ai.status})`);
  const write = await fetch(`${API}/rest/v1/blog_posts`, { method: 'POST', headers: as(memberToken), body: JSON.stringify({ slug: 'test-member-post', title: 'x' }) });
  check(write.status === 401 || write.status === 403, `a member can't write a post (${write.status})`);
  const upload = await fetch(`${API}/storage/v1/object/blog/covers/member.png`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${memberToken}`, 'Content-Type': 'image/png' }, body: PNG });
  check(upload.status >= 400, `a member can't add pictures (${upload.status})`);
  const anonDraft = await fetch(`${API}/rest/v1/blog_posts?slug=eq.test-draft-post&select=slug`, { headers: as(ANON) }).then((r) => r.json());
  check(Array.isArray(anonDraft) && anonDraft.length === 0, 'visitors can\'t read drafts');
  const views = await fetch(`${API}/rest/v1/blog_views?select=views`, { headers: as(ANON) }).then((r) => r.json());
  check(Array.isArray(views) ? views.length === 0 : true, 'visitors can\'t read visit counts');

  // Delete
  await page.getByTestId('blog-editor').getByRole('button', { name: 'Delete post' }).click();
  await page.getByTestId('blog-posts').waitFor({ timeout: 15000 });
  check(sql(`select count(*) from blog_posts where slug = '${SLUG}';`) === '0', 'Delete removes the post');
} catch (e) {
  failures++;
  console.error(e);
  await page.screenshot({ path: `${OUT}error.png`, fullPage: true }).catch(() => {});
} finally {
  await cleanup();
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
