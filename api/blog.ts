// ============================================================================
// The blog's pages as the server sends them (a Vercel function; vercel.json
// sends these addresses here):
//
//   /blog, /blog/<slug>   the website's page with the post's title,
//                         description, link preview (Open Graph) and
//                         structured data in it, and the post itself as plain
//                         HTML, for search engines and link previews (WhatsApp,
//                         Facebook, X, LinkedIn) that don't run JavaScript.
//                         The website then starts as usual (BlogPages.tsx).
//   /blog/feed.xml        the newest posts as RSS
//   /sitemap.xml          the website's pages and every published post
//   /robots.txt           what search engines may visit, and the sitemap
//
// Posts are read with the public (anon) key, so only published posts whose
// date has come are seen. Whatever goes wrong, the website's page is sent as
// it is, and the browser shows the post.
// ============================================================================

// Imports end in .js: Vercel compiles each file to .js and leaves import paths as written
import { escapeHtml, parseMarkdown, toHtml } from '../lib/markdown.js';
import {
  BLOG_DESCRIPTION, BLOG_TITLE, SITE_URL, blogJsonLd, metaDescription, pageTitle, postJsonLd, postPath, type SeoPost,
} from '../lib/blogSeo.js';

export const config = { runtime: 'edge' };

type Post = SeoPost & { updated_at: string };

export interface Env {
  supabaseUrl: string;
  anonKey: string;
  fetch: typeof fetch;
}

const env = (): Env => ({
  supabaseUrl: (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  anonKey: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
  fetch: (input, init) => fetch(input, init),
});

const COLUMNS = 'slug,title,excerpt,content,cover_url,cover_alt,tags,seo_title,seo_description,noindex,author_name,published_at,updated_at';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each caller picks its columns
async function readPosts(e: Env, query: string): Promise<any[]> {
  if (!e.supabaseUrl || !e.anonKey) return [];
  const res = await e.fetch(`${e.supabaseUrl}/rest/v1/blog_posts?status=eq.published&${query}`, {
    headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`blog_posts: ${res.status}`);
  return (await res.json()) as Post[];
}

// ---- The page --------------------------------------------------------------

export interface Head {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  imageAlt?: string;
  type: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
  published?: string | null;
}

// The tags the server adds; the ones the website's index.html already has for
// these are taken out first
export function headTags(h: Head): string {
  const m = (attr: string, key: string, value: string) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(h.title)}</title>`,
    m('name', 'description', h.description),
    `<link rel="canonical" href="${escapeHtml(h.url)}" />`,
    h.noindex ? m('name', 'robots', 'noindex') : '',
    m('property', 'og:type', h.type),
    m('property', 'og:site_name', 'Shaadi24'),
    m('property', 'og:title', h.title),
    m('property', 'og:description', h.description),
    m('property', 'og:url', h.url),
    m('property', 'og:image', h.image || `${SITE_URL}/og-image.png`),
    h.image ? m('property', 'og:image:alt', h.imageAlt ?? '') : m('property', 'og:image:alt', 'Shaadi24: matrimony for India'),
    h.published ? m('property', 'article:published_time', h.published) : '',
    m('name', 'twitter:card', 'summary_large_image'),
    `<link rel="alternate" type="application/rss+xml" title="${BLOG_TITLE}" href="${SITE_URL}/blog/feed.xml" />`,
    // "<" never appears raw inside the script, so text can't end it early
    h.jsonLd ? `<script type="application/ld+json">${JSON.stringify(h.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
}

export function fillShell(shell: string, h: Head, body: string): string {
  const head = shell
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+(name|property)="(description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, `  ${headTags(h)}\n  </head>`);
  // The page's text before the website starts (React then replaces it)
  return head.replace(/<div id="root"><\/div>/i, `<div id="root">${body}</div>`);
}

const wrap = (inner: string) =>
  `<div style="max-width:720px;margin:0 auto;padding:40px 20px;font-family:system-ui,sans-serif;line-height:1.6">${inner}</div>`;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

export function postPage(shell: string, post: Post): string {
  const url = `${SITE_URL}${postPath(post.slug)}`;
  const head: Head = {
    title: pageTitle(post), description: metaDescription(post), url, image: post.cover_url, imageAlt: post.cover_alt,
    type: 'article', noindex: post.noindex, jsonLd: postJsonLd(post), published: post.published_at,
  };
  const body = wrap([
    '<p><a href="/blog">Blog</a></p>',
    `<article><h1>${escapeHtml(post.title)}</h1>`,
    post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : '',
    `<p>By ${escapeHtml(post.author_name)} · <time datetime="${escapeHtml(post.published_at ?? '')}">${fmtDate(post.published_at)}</time></p>`,
    post.cover_url ? `<img src="${escapeHtml(post.cover_url)}" alt="${escapeHtml(post.cover_alt)}" style="max-width:100%;height:auto">` : '',
    toHtml(parseMarkdown(post.content)),
    '</article>',
  ].join('\n'));
  return fillShell(shell, head, body);
}

export function indexPage(shell: string, posts: Pick<Post, 'slug' | 'title' | 'excerpt'>[]): string {
  const head: Head = {
    title: `${BLOG_TITLE}: advice for finding your life partner`, description: BLOG_DESCRIPTION, url: `${SITE_URL}/blog`,
    type: 'website', jsonLd: blogJsonLd(posts),
  };
  const items = posts.map((p) =>
    `<li><a href="${postPath(p.slug)}">${escapeHtml(p.title)}</a>${p.excerpt ? ` <span>${escapeHtml(p.excerpt)}</span>` : ''}</li>`);
  const body = wrap(`<h1>${BLOG_TITLE}</h1>\n<p>${escapeHtml(BLOG_DESCRIPTION)}</p>\n<ul>${items.join('\n')}</ul>`);
  return fillShell(shell, head, body);
}

export function notFoundPage(shell: string): string {
  return fillShell(shell, {
    title: `Post not found | ${BLOG_TITLE}`, description: BLOG_DESCRIPTION, url: `${SITE_URL}/blog`, type: 'website', noindex: true,
  }, wrap('<h1>This post isn’t here</h1><p><a href="/blog">See all posts</a></p>'));
}

// ---- Feeds -----------------------------------------------------------------

const xml = (s: string) => escapeHtml(s);

// The website's own pages, for the sitemap
const PAGES = ['/', '/blog', '/stories', '/support', '/privacy', '/terms', '/grievances', '/safety', '/refunds', '/delete-account'];

export function sitemapXml(posts: Pick<Post, 'slug' | 'noindex' | 'published_at' | 'updated_at'>[]): string {
  const urls = [
    ...PAGES.map((p) => `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc></url>`),
    ...posts.filter((p) => !p.noindex).map((p) =>
      `  <url><loc>${SITE_URL}${postPath(p.slug)}</loc><lastmod>${xml((p.updated_at ?? p.published_at ?? '').slice(0, 10))}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function feedXml(posts: Post[]): string {
  const items = posts.slice(0, 30).map((p) => {
    const url = `${SITE_URL}${postPath(p.slug)}`;
    return `    <item>
      <title>${xml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${p.published_at ? new Date(p.published_at).toUTCString() : ''}</pubDate>
      <description>${xml(metaDescription(p))}</description>
${p.tags.map((t) => `      <category>${xml(t)}</category>`).join('\n')}
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${BLOG_TITLE}</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xml(BLOG_DESCRIPTION)}</description>
    <language>en-in</language>
${items.join('\n')}
  </channel>
</rss>
`;
}

export const robotsTxt = () => `User-agent: *
Allow: /
Disallow: /admin
Disallow: /app-preview

Sitemap: ${SITE_URL}/sitemap.xml
`;

// ---- The function ----------------------------------------------------------

const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400';
const reply = (body: string, type: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': CACHE } });

// Used only if this deployment's index.html can't be read: the page without the website's scripts
const BARE_SHELL = '<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';

type View = { view: 'index' | 'feed' | 'sitemap' | 'robots' } | { view: 'post'; slug: string };

// vercel.json sends ?view= (and &slug=); the address itself says the same
export function viewFor(url: URL): View {
  const view = url.searchParams.get('view');
  const slug = url.searchParams.get('slug');
  if (view === 'post' && slug) return { view: 'post', slug };
  if (view === 'index' || view === 'feed' || view === 'sitemap' || view === 'robots') return { view };
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/robots.txt') return { view: 'robots' };
  if (path === '/sitemap.xml') return { view: 'sitemap' };
  if (path === '/blog/feed.xml') return { view: 'feed' };
  const post = path.match(/^\/blog\/([^/]+)$/);
  return post ? { view: 'post', slug: decodeURIComponent(post[1]) } : { view: 'index' };
}

export async function handle(request: Request, e: Env = env()): Promise<Response> {
  const url = new URL(request.url);
  const v = viewFor(url);

  if (v.view === 'robots') return reply(robotsTxt(), 'text/plain');
  if (v.view === 'sitemap') {
    const posts = await readPosts(e, 'select=slug,noindex,published_at,updated_at&order=published_at.desc&limit=5000').catch(() => []);
    return reply(sitemapXml(posts), 'application/xml');
  }
  if (v.view === 'feed') {
    const posts = await readPosts(e, `select=${COLUMNS}&order=published_at.desc&limit=30`).catch(() => []);
    return reply(feedXml(posts), 'application/rss+xml');
  }

  // The website's page from this deployment, with its scripts (the cookie
  // passes a preview deployment's protection the way the visitor did)
  const shellRes = await e.fetch(new URL('/index.html', url.origin), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
  const shell = shellRes?.ok ? await shellRes.text() : BARE_SHELL;

  try {
    if (v.view === 'post') {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) return reply(notFoundPage(shell), 'text/html', 404);
      const [post] = await readPosts(e, `select=${COLUMNS}&slug=eq.${v.slug}&limit=1`);
      return post ? reply(postPage(shell, post), 'text/html') : reply(notFoundPage(shell), 'text/html', 404);
    }
    const posts = await readPosts(e, 'select=slug,title,excerpt&order=published_at.desc&limit=100');
    return reply(indexPage(shell, posts), 'text/html');
  } catch (err) {
    console.error('[blog]', err);
    return new Response(shell, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

export default function handler(request: Request): Promise<Response> {
  return handle(request);
}
