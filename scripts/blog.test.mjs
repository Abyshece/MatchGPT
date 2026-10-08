// The blog's Markdown (lib/markdown.ts) and the pages, sitemap and feed the
// server sends (api/blog.ts). Node runs the TypeScript directly.
//   node --test scripts/blog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, toHtml, wordCount, readingMinutes, safeHref } from '../lib/markdown.ts';
import { metaDescription, pageTitle, postJsonLd, SITE_URL } from '../lib/blogSeo.ts';
import { fillShell, handle, postPage, sitemapXml, feedXml, robotsTxt, viewFor } from '../api/blog.ts';

const POST = {
  slug: 'first-meeting-tips', title: 'First meeting tips', excerpt: 'What to say & ask.',
  content: '# Ignored title\n\nMeet somewhere **public**.\n\n## Before\n\n- Tell family\n- Charge your phone\n\n> Trust your instincts\n\n[Our app](/support) and <script>alert(1)</script>',
  cover_url: 'https://example.com/c.jpg', cover_alt: 'Two cups of "chai"', tags: ['first meeting', 'safety'],
  seo_title: '', seo_description: '', noindex: false, author_name: 'Shaadi24 Team',
  published_at: '2026-10-08T10:00:00Z', updated_at: '2026-10-09T10:00:00Z',
};

const SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Shaadi24: Indian Matrimony</title>
    <meta name="description" content="old" />
    <meta property="og:title" content="old" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

test('Markdown: blocks, and nothing in a post becomes HTML', () => {
  const blocks = parseMarkdown(POST.content);
  assert.deepEqual(blocks.map((b) => b.t), ['h', 'p', 'h', 'ul', 'quote', 'p']);
  assert.equal(blocks[0].level, 2);  // # becomes ##: the title is the page's only top heading
  const html = toHtml(blocks);
  assert.match(html, /<strong>public<\/strong>/);
  assert.match(html, /<a href="\/support">Our app<\/a>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<h2 id="before">Before<\/h2>/);
});

test('Markdown: unsafe links and pictures are dropped', () => {
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('//evil.example'), null);
  assert.equal(safeHref('https://ok.example/a'), 'https://ok.example/a');
  const nodes = parseInline('[x](javascript:alert(1))');
  assert.ok(nodes.every((n) => n.t === 'text'));
  assert.deepEqual(parseMarkdown('![a](http://insecure.example/p.jpg)'), []);
  assert.equal(parseMarkdown('![a](https://ok.example/p.jpg)')[0].t, 'img');
});

test('Markdown: lists, numbered lists, inline marks, repeated headings', () => {
  const [ol] = parseMarkdown('1. One\n2. **Two**\n   continued');
  assert.equal(ol.t, 'ol');
  assert.equal(ol.items.length, 2);
  assert.deepEqual(parseInline('a *b* `c` _d_ snake_case'), [
    { t: 'text', v: 'a ' }, { t: 'i', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: ' ' }, { t: 'code', v: 'c' },
    { t: 'text', v: ' ' }, { t: 'i', c: [{ t: 'text', v: 'd' }] }, { t: 'text', v: ' snake_case' },
  ]);
  const ids = parseMarkdown('## Tips\n\n## Tips').map((b) => b.id);
  assert.deepEqual(ids, ['tips', 'tips-2']);
  assert.equal(wordCount('## Two words\n\nand three more'), 5);
  assert.equal(readingMinutes('word '.repeat(660)), 3);
});

test('SEO: title, description and structured data', () => {
  assert.equal(pageTitle(POST), 'First meeting tips | Shaadi24');
  assert.equal(metaDescription(POST), 'What to say & ask.');
  assert.match(metaDescription({ ...POST, excerpt: '', content: 'word '.repeat(100) }), /…$/);
  const ld = postJsonLd(POST);
  assert.equal(ld['@type'], 'BlogPosting');
  assert.equal(ld.url, `${SITE_URL}/blog/first-meeting-tips`);
  assert.equal(ld.author['@type'], 'Organization');
});

test("The post's page: the site's tags replaced, the post's in, the scripts kept", () => {
  const html = postPage(SHELL, POST);
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.match(html, /<title>First meeting tips \| Shaadi24<\/title>/);
  assert.doesNotMatch(html, /content="old"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example.com\/c.jpg" \/>/);
  assert.match(html, /og:image:alt" content="Two cups of &quot;chai&quot;"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/blog\/first-meeting-tips" \/>/);
  assert.match(html, /<script type="module" crossorigin src="\/assets\/index-abc.js"><\/script>/);
  assert.match(html, /<div id="root"><div style=[^>]+>[\s\S]*<h1>First meeting tips<\/h1>/);
  assert.doesNotMatch(html, /<meta name="robots"/);
  assert.match(postPage(SHELL, { ...POST, noindex: true }), /<meta name="robots" content="noindex" \/>/);
  // Text in the structured data can't close its script
  const sneaky = postPage(SHELL, { ...POST, title: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(sneaky, /<\/script><script>alert/);
});

test('fillShell keeps a page without the tags working', () => {
  const html = fillShell('<html><head></head><body><div id="root"></div></body></html>', {
    title: 'T', description: 'D', url: 'https://x/blog', type: 'website',
  }, '<p>hi</p>');
  assert.match(html, /<title>T<\/title>/);
  assert.match(html, /<div id="root"><p>hi<\/p><\/div>/);
});

test('Sitemap, feed and robots.txt', () => {
  const sitemap = sitemapXml([POST, { ...POST, slug: 'hidden', noindex: true }]);
  assert.match(sitemap, /<loc>[^<]+\/blog\/first-meeting-tips<\/loc><lastmod>2026-10-09<\/lastmod>/);
  assert.doesNotMatch(sitemap, /hidden/);
  assert.match(sitemap, /<loc>[^<]+\/privacy<\/loc>/);
  const feed = feedXml([POST]);
  assert.match(feed, /<title>First meeting tips<\/title>/);
  assert.match(feed, /<description>What to say &amp; ask.<\/description>/);
  assert.match(feed, /<category>safety<\/category>/);
  assert.match(robotsTxt(), /Disallow: \/admin\n/);
  assert.match(robotsTxt(), /Sitemap: https:\/\/[^\n]+\/sitemap.xml/);
});

test('viewFor reads the rewrite or the address', () => {
  assert.deepEqual(viewFor(new URL('https://x/api/blog?view=post&slug=a-b')), { view: 'post', slug: 'a-b' });
  assert.deepEqual(viewFor(new URL('https://x/blog/a-b')), { view: 'post', slug: 'a-b' });
  assert.deepEqual(viewFor(new URL('https://x/blog/feed.xml')), { view: 'feed' });
  assert.deepEqual(viewFor(new URL('https://x/blog/')), { view: 'index' });
  assert.deepEqual(viewFor(new URL('https://x/sitemap.xml')), { view: 'sitemap' });
  assert.deepEqual(viewFor(new URL('https://x/robots.txt')), { view: 'robots' });
});

// A stand-in for the website and the database
function stubEnv({ posts = [POST], shellOk = true, dbOk = true } = {}) {
  const asked = [];
  return {
    asked,
    env: {
      supabaseUrl: 'https://db.example', anonKey: 'anon',
      fetch: async (input, init) => {
        const url = String(input);
        asked.push({ url, init });
        if (url.endsWith('/index.html')) return new Response(SHELL, { status: shellOk ? 200 : 401 });
        if (!dbOk) return new Response('{}', { status: 500 });
        const slug = url.match(/slug=eq\.([^&]+)/)?.[1];
        return Response.json(slug ? posts.filter((p) => p.slug === slug) : posts);
      },
    },
  };
}

test('handle: a post, a missing post, a bad address', async () => {
  const { env, asked } = stubEnv();
  const res = await handle(new Request('https://site.example/api/blog?view=post&slug=first-meeting-tips', { headers: { cookie: 'a=b' } }), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<title>First meeting tips \| Shaadi24<\/title>/);
  assert.equal(asked[0].url, 'https://site.example/index.html');
  assert.equal(asked[0].init.headers.cookie, 'a=b');
  assert.match(asked[1].url, /status=eq.published/);
  assert.equal(asked[1].init.headers.apikey, 'anon');

  const missing = await handle(new Request('https://site.example/blog/nope'), stubEnv().env);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /noindex/);
  const bad = await handle(new Request('https://site.example/api/blog?view=post&slug=..%2Fx'), stubEnv().env);
  assert.equal(bad.status, 404);
});

test('handle: the page still loads when the database or the shell fails', async () => {
  const dbDown = await handle(new Request('https://site.example/blog/first-meeting-tips'), stubEnv({ dbOk: false }).env);
  assert.equal(dbDown.status, 200);
  assert.match(await dbDown.text(), /assets\/index-abc.js/);  // the website as it is
  const noShell = await handle(new Request('https://site.example/blog/first-meeting-tips'), stubEnv({ shellOk: false }).env);
  assert.equal(noShell.status, 200);
  assert.match(await noShell.text(), /<h1>First meeting tips<\/h1>/);
  const sitemap = await handle(new Request('https://site.example/sitemap.xml'), stubEnv({ dbOk: false }).env);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /<urlset/);
});
