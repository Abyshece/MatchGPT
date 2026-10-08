import React, { useEffect, useMemo, useState } from 'react';
import { countView, fetchPublishedPost, fetchPublishedPosts, formatDate, minutesToRead, relatedPosts, type BlogPost } from '../../lib/blog';
import { BLOG_DESCRIPTION, BLOG_TITLE, SITE_URL, blogJsonLd, metaDescription, pageTitle, postJsonLd, postPath } from '../../lib/blogSeo';
import { parseMarkdown } from '../../lib/markdown';
import { setPageMeta } from '../../lib/pageMeta';
import Markdown from '../Markdown';
import StoreBadges from '../StoreBadges';
import { SiteFooter, SiteHeader } from './SiteChrome';

// ============================================================================
// The website's blog: /blog lists the published posts (newest first, with a
// filter by tag: /blog?tag=family), and /blog/<slug> shows one, with its
// contents, where to get the apps, sharing, and more posts to read. Each sets
// the page's title and the tags search engines and link previews read
// (lib/pageMeta.ts; api/blog.ts sends the same from the server).
// ============================================================================

const Cover: React.FC<{ post: Pick<BlogPost, 'cover_url' | 'cover_alt'>; className?: string }> = ({ post, className = '' }) =>
  post.cover_url ? (
    <img src={post.cover_url} alt={post.cover_alt} loading="lazy" className={`w-full aspect-[1200/630] object-cover ${className}`} />
  ) : (
    <div className={`w-full aspect-[1200/630] flex items-center justify-center bg-gradient-to-br from-rose-50 to-amber-50 dark:from-zinc-800 dark:to-zinc-900 ${className}`} aria-hidden="true">
      <span className="text-4xl">💍</span>
    </div>
  );

const Meta: React.FC<{ post: BlogPost }> = ({ post }) => (
  <p className="text-xs text-gray-500 dark:text-gray-400">
    <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time> · {minutesToRead(post)} min read
  </p>
);

const PostCard: React.FC<{ post: BlogPost; big?: boolean }> = ({ post, big }) => (
  <article className={`group ${big ? 'sm:col-span-2 lg:col-span-3 grid lg:grid-cols-2 gap-6 items-center' : ''}`} data-testid="blog-card">
    <a href={postPath(post.slug)} tabIndex={-1} aria-hidden="true" className="block overflow-hidden rounded-xl border border-gray-100 dark:border-zinc-800">
      <Cover post={post} className="transition-transform duration-300 group-hover:scale-[1.02]" />
    </a>
    <div className={big ? '' : 'mt-3'}>
      {post.tags.length > 0 && <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{post.tags.slice(0, 2).join(' · ')}</p>}
      <h2 className={`mt-1 font-semibold tracking-tight text-gray-900 dark:text-white ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
        <a href={postPath(post.slug)} className="hover:underline underline-offset-4">{post.title}</a>
      </h2>
      {post.excerpt && <p className={`mt-2 text-gray-600 dark:text-gray-300 leading-relaxed ${big ? 'text-base' : 'text-sm line-clamp-3'}`}>{post.excerpt}</p>}
      <div className="mt-2"><Meta post={post} /></div>
    </div>
  </article>
);

const GetTheApp: React.FC = () => (
  <aside className="mt-12 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 sm:p-8 text-center" data-testid="blog-cta">
    <p className="text-2xl" aria-hidden="true">💍</p>
    <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Describe the person you hope to marry</h2>
    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto">
      Shaadi24 finds the people who fit you best, by values, family, lifestyle and plans. Free to join.
    </p>
    <StoreBadges className="mt-5 justify-center" />
  </aside>
);

const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="flex-1">{children}</main>
    <SiteFooter />
  </div>
);

// ---- /blog -------------------------------------------------------------------

export const BlogIndex: React.FC = () => {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const tag = new URLSearchParams(window.location.search).get('tag')?.toLowerCase() ?? '';

  useEffect(() => {
    void fetchPublishedPosts().then(({ posts }) => setPosts(posts));
  }, []);

  useEffect(() => {
    setPageMeta({
      title: tag ? `${tag[0].toUpperCase()}${tag.slice(1)} | ${BLOG_TITLE}` : `${BLOG_TITLE}: advice for finding your life partner`,
      description: BLOG_DESCRIPTION,
      url: `${SITE_URL}/blog${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`,
      noindex: !!tag,
      jsonLd: posts ? blogJsonLd(posts) : null,
    });
  }, [posts, tag]);

  const tags = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of posts ?? []) for (const t of p.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [posts]);
  const shown = (posts ?? []).filter((p) => !tag || p.tags.includes(tag));

  return (
    <Page>
      <div className="max-w-6xl mx-auto px-5 py-12 sm:py-16" data-testid="blog-index">
        <header className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{BLOG_TITLE}</h1>
          <p className="mt-4 text-base sm:text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
            Advice for finding your life partner, meeting families and starting married life well.
          </p>
        </header>

        {tags.length > 1 && (
          <nav aria-label="Topics" className="mt-8 flex flex-wrap gap-2">
            <a href="/blog" aria-current={!tag ? 'page' : undefined} className={`h-8 px-3 inline-flex items-center rounded-full border text-sm ${!tag ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>All</a>
            {tags.map((t) => (
              <a key={t} href={`/blog?tag=${encodeURIComponent(t)}`} aria-current={tag === t ? 'page' : undefined} className={`h-8 px-3 inline-flex items-center rounded-full border text-sm ${tag === t ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>{t}</a>
            ))}
          </nav>
        )}

        {!posts ? (
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-8" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-12 text-gray-600 dark:text-gray-300" data-testid="blog-empty">The first posts are coming soon.</p>
        ) : (
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {shown.map((p, i) => <PostCard key={p.id} post={p} big={i === 0 && !tag && shown.length > 2} />)}
          </div>
        )}
        <GetTheApp />
      </div>
    </Page>
  );
};

// ---- /blog/<slug> ------------------------------------------------------------

const Share: React.FC<{ post: BlogPost }> = ({ post }) => {
  const [copied, setCopied] = useState(false);
  const url = `${SITE_URL}${postPath(post.slug)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard: nothing to do */ }
  };
  const btn = 'h-9 px-3 inline-flex items-center rounded-full border border-gray-200 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Share</span>
      <a className={btn} href={`https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className={btn} href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
      <a className={btn} href={`https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer">X</a>
      <button type="button" className={btn} onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
    </div>
  );
};

export const BlogPostPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);
  const [others, setOthers] = useState<BlogPost[]>([]);

  useEffect(() => {
    void fetchPublishedPost(slug).then(({ post }) => {
      setPost(post);
      if (post) void countView(post.slug);
    });
    void fetchPublishedPosts().then(({ posts }) => setOthers(posts));
  }, [slug]);

  useEffect(() => {
    if (post === undefined) return;
    if (!post) {
      setPageMeta({ title: `Post not found | ${BLOG_TITLE}`, description: BLOG_DESCRIPTION, url: `${SITE_URL}/blog`, noindex: true });
      return;
    }
    setPageMeta({
      title: pageTitle(post),
      description: metaDescription(post),
      url: `${SITE_URL}${postPath(post.slug)}`,
      image: post.cover_url,
      imageAlt: post.cover_alt,
      type: 'article',
      noindex: post.noindex,
      jsonLd: postJsonLd(post),
    });
  }, [post]);

  const contents = useMemo(() => (post ? parseMarkdown(post.content).filter((b) => b.t === 'h' && b.level === 2) : []), [post]);

  if (post === undefined) {
    return <Page><div className="max-w-3xl mx-auto px-5 py-16"><div className="h-10 w-3/4 rounded bg-gray-100 dark:bg-zinc-800 animate-pulse" /><div className="mt-6 h-64 rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" /></div></Page>;
  }
  if (!post) {
    return (
      <Page>
        <div className="max-w-3xl mx-auto px-5 py-20 text-center" data-testid="blog-not-found">
          <h1 className="text-3xl font-bold tracking-tight">This post isn't here</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">It may have moved or been taken down.</p>
          <a href="/blog" className="mt-6 inline-flex h-10 px-5 items-center rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-semibold">See all posts</a>
        </div>
      </Page>
    );
  }

  const related = relatedPosts(post, others);
  return (
    <Page>
      <article className="max-w-3xl mx-auto px-5 py-10 sm:py-14" data-testid="blog-post">
        <nav aria-label="Breadcrumb" className="text-sm text-gray-500 dark:text-gray-400">
          <a href="/blog" className="hover:underline">Blog</a>
          {post.tags[0] && <> <span aria-hidden="true">›</span> <a href={`/blog?tag=${encodeURIComponent(post.tags[0])}`} className="hover:underline">{post.tags[0]}</a></>}
        </nav>
        <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight leading-tight text-gray-900 dark:text-white">{post.title}</h1>
        {post.excerpt && <p className="mt-4 text-lg sm:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">{post.excerpt}</p>}
        <p className="mt-5 text-sm text-gray-500 dark:text-gray-400">
          By {post.author_name} · <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time> · {minutesToRead(post)} min read
        </p>
        {post.cover_url && <Cover post={post} className="mt-8 rounded-2xl" />}

        {contents.length >= 3 && (
          <nav aria-label="In this post" className="mt-8 rounded-xl bg-gray-50 dark:bg-zinc-900 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">In this post</p>
            <ol className="mt-2 space-y-1 text-sm list-decimal pl-5 text-gray-600 dark:text-gray-300">
              {contents.map((h) => h.t === 'h' && <li key={h.id}><a href={`#${h.id}`} className="hover:underline">{h.text}</a></li>)}
            </ol>
          </nav>
        )}

        <Markdown source={post.content} className="mt-6" />

        {post.tags.length > 0 && (
          <ul className="mt-10 flex flex-wrap gap-2" aria-label="Tags">
            {post.tags.map((t) => (
              <li key={t}><a href={`/blog?tag=${encodeURIComponent(t)}`} className="h-8 px-3 inline-flex items-center rounded-full bg-gray-100 dark:bg-zinc-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700">{t}</a></li>
            ))}
          </ul>
        )}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800"><Share post={post} /></div>
        <GetTheApp />
      </article>

      {related.length > 0 && (
        <section aria-labelledby="more-posts" className="max-w-6xl mx-auto px-5 pb-16">
          <h2 id="more-posts" className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">More to read</h2>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {related.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        </section>
      )}
    </Page>
  );
};
