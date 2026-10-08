// ============================================================================
// The blog (supabase/migrations/…_blog.sql): posts written in Admin → Blog,
// shown on the website at /blog and /blog/<slug>.
//
// Admins write in Markdown (lib/markdown.ts), with the fields search engines
// and link previews use (search title, description, the phrase it's for,
// cover picture and its description, tags), a check list of the usual SEO
// advice, and AI writing (supabase/functions/blog-ai): post ideas, a whole
// draft, the search fields for what's written, and rewriting a passage.
// ============================================================================

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { LEGAL } from './legalInfo';
import { inlineText, parseMarkdown, wordCount } from './markdown';
import { metaDescription, metaTitle } from './blogSeo';

const fail = (error: { message: string } | null) => (error ? error.message : null);

export const BLOG_URL = `${LEGAL.websiteUrl}/blog`;
export const postUrl = (slug: string) => `${BLOG_URL}/${slug}`;

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_url: string | null;
  cover_alt: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  noindex: boolean;
  author_name: string;
  status: 'draft' | 'published';
  published_at: string | null;
  ai_assisted: boolean;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export type PostDraft = Omit<BlogPost, 'id' | 'created_at' | 'updated_at' | 'word_count'> & { id?: string };

export const BLANK_POST: PostDraft = {
  slug: '', title: '', excerpt: '', content: '', cover_url: null, cover_alt: '', tags: [],
  seo_title: '', seo_description: '', focus_keyword: '', noindex: false, author_name: 'Shaadi24 Team',
  status: 'draft', published_at: null, ai_assisted: false,
};

/** "Arranged vs Love Marriage: 7 Things!" → "arranged-vs-love-marriage-7-things" */
export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
}

/** Live now: published, and its date has come */
export const isLive = (p: Pick<BlogPost, 'status' | 'published_at'>, now = Date.now()) =>
  p.status === 'published' && !!p.published_at && new Date(p.published_at).getTime() <= now;

/** A date still to come */
export const isScheduled = (iso: string | null, now = Date.now()) => !!iso && new Date(iso).getTime() > now;

export const postState = (p: Pick<BlogPost, 'status' | 'published_at'>) =>
  p.status === 'draft' ? 'Draft' : isLive(p) ? 'Published' : 'Scheduled';

export { metaTitle, metaDescription };

/** Minutes to read, from the words the database counted */
export const minutesToRead = (p: Pick<BlogPost, 'word_count'>) => Math.max(1, Math.round((p.word_count ?? 0) / 220));

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// ---- The website -----------------------------------------------------------

const LIST_COLUMNS = 'id, slug, title, excerpt, cover_url, cover_alt, tags, author_name, published_at, status, word_count';

/** Published posts, newest first (RLS shows only those whose date has come) */
export async function fetchPublishedPosts(): Promise<{ posts: BlogPost[]; error: string | null }> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(200);
  return { posts: (data ?? []) as unknown as BlogPost[], error: fail(error) };
}

export async function fetchPublishedPost(slug: string): Promise<{ post: BlogPost | null; error: string | null }> {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  return { post: (data ?? null) as BlogPost | null, error: fail(error) };
}

/** A visit, once per page load */
export async function countView(slug: string): Promise<void> {
  await supabase.rpc('blog_view', { p_slug: slug });
}

/** Up to three other posts, those sharing tags first */
export function relatedPosts(post: BlogPost, all: BlogPost[], n = 3): BlogPost[] {
  return all
    .filter((p) => p.id !== post.id)
    .map((p) => ({ p, shared: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.shared - a.shared)
    .slice(0, n)
    .map((x) => x.p);
}

// ---- Admin -----------------------------------------------------------------

export type AdminPost = BlogPost & { views: number };

export async function fetchAllPosts(): Promise<{ posts: AdminPost[]; error: string | null }> {
  const [{ data, error }, { data: visits }] = await Promise.all([
    supabase.from('blog_posts').select('*').order('updated_at', { ascending: false }),
    supabase.from('blog_views').select('post_id, views'),
  ]);
  const views = new Map((visits ?? []).map((v) => [v.post_id, v.views]));
  return {
    posts: ((data ?? []) as BlogPost[]).map((p) => ({ ...p, views: views.get(p.id) ?? 0 })),
    error: fail(error),
  };
}

export async function savePost(d: PostDraft): Promise<{ post: BlogPost | null; error: string | null }> {
  const row = {
    slug: slugify(d.slug || d.title),
    title: d.title.trim(),
    excerpt: d.excerpt.trim(),
    content: d.content.trim(),
    cover_url: d.cover_url?.trim() || null,
    cover_alt: d.cover_alt.trim(),
    tags: [...new Set(d.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10),
    seo_title: d.seo_title.trim(),
    seo_description: d.seo_description.trim(),
    focus_keyword: d.focus_keyword.trim(),
    noindex: d.noindex,
    author_name: d.author_name.trim() || 'Shaadi24 Team',
    status: d.status,
    published_at: d.published_at,
    ai_assisted: d.ai_assisted,
  };
  if (!row.title) return { post: null, error: 'Give the post a title' };
  if (!row.slug) return { post: null, error: 'Give the post an address (slug)' };
  if (row.cover_url && !/^https?:\/\//.test(row.cover_url)) return { post: null, error: "The cover picture's address must start with https://" };
  const query = d.id
    ? supabase.from('blog_posts').update(row).eq('id', d.id).select().single()
    : supabase.from('blog_posts').insert(row).select().single();
  const { data, error } = await query;
  if (error?.code === '23505') return { post: null, error: `Another post already uses /blog/${row.slug}. Change the address.` };
  return { post: (data ?? null) as BlogPost | null, error: fail(error) };
}

export async function deletePost(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  return { error: fail(error) };
}

export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A cover picture into the public "blog" bucket → its address */
export async function uploadCover(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!COVER_TYPES.includes(file.type)) return { url: null, error: 'Use a JPEG, PNG or WebP picture' };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'The picture is over 5 MB' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('blog').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) return { url: null, error: error.message };
  return { url: supabase.storage.from('blog').getPublicUrl(path).data.publicUrl, error: null };
}

// ---- AI writing (supabase/functions/blog-ai) --------------------------------

export interface Idea { title: string; angle: string; keyword: string }
export interface SeoFields {
  seo_title: string; seo_description: string; excerpt: string; slug: string; tags: string[]; focus_keyword: string;
}
export interface AiDraft extends SeoFields { title: string; content: string; cover_alt: string }
export interface DraftRequest {
  topic: string; keyword?: string; audience?: string; tone?: string; length?: 'short' | 'medium' | 'long'; notes?: string;
}

async function callAi<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('blog-ai', { body });
  if (!error) return { data: data as T, error: null };
  let message = "AI writing didn't work. Try again.";
  if (error instanceof FunctionsHttpError) {
    const details = await error.context.json().catch(() => null);
    if (typeof details?.error === 'string') message = details.error;
  }
  return { data: null, error: message };
}

export const aiIdeas = (theme: string) => callAi<{ ideas: Idea[] }>({ action: 'ideas', theme });
export const aiDraft = (req: DraftRequest) => callAi<{ post: AiDraft }>({ action: 'draft', ...req });
export const aiSeo = (title: string, content: string) => callAi<{ fields: SeoFields }>({ action: 'seo', title, content });
export const aiRewrite = (text: string, instruction: string) => callAi<{ text: string }>({ action: 'rewrite', text, instruction });

// ---- SEO check list ----------------------------------------------------------

export interface Check { id: string; ok: boolean; label: string; tip?: string }

const has = (text: string, phrase: string) => !!phrase && text.toLowerCase().includes(phrase.toLowerCase());

/** The usual advice for a post to be found and clicked, each met or not */
export function seoChecks(p: PostDraft): Check[] {
  const kw = p.focus_keyword.trim();
  const title = metaTitle(p);
  const description = metaDescription(p);
  const words = wordCount(p.content);
  const blocks = parseMarkdown(p.content);
  const firstPara = blocks.find((b) => b.t === 'p');
  const firstText = firstPara && firstPara.t === 'p' ? inlineText(firstPara.c) : '';
  const headings = blocks.filter((b) => b.t === 'h');
  const links = (p.content.match(/\]\((https?:\/\/|\/)[^)]+\)/g) ?? []).length;
  return [
    { id: 'keyword', ok: !!kw, label: 'A search phrase is set', tip: 'What would people type into Google to find this post?' },
    { id: 'kw-title', ok: has(title, kw), label: 'The search phrase is in the title' },
    { id: 'kw-desc', ok: has(description, kw), label: 'The search phrase is in the description' },
    { id: 'kw-first', ok: has(firstText, kw), label: 'The search phrase is in the first paragraph' },
    { id: 'kw-slug', ok: !!kw && slugify(p.slug || p.title).includes(slugify(kw)), label: 'The search phrase is in the address' },
    { id: 'title-length', ok: title.length >= 30 && title.length <= 60, label: `Title is 30–60 characters (${title.length})` },
    { id: 'desc-length', ok: description.length >= 120 && description.length <= 160, label: `Description is 120–160 characters (${description.length})` },
    { id: 'length', ok: words >= 600, label: `At least 600 words (${words.toLocaleString()})` },
    { id: 'headings', ok: headings.length >= 2, label: 'Split into sections with headings' },
    { id: 'cover', ok: !!p.cover_url && !!p.cover_alt.trim(), label: 'Cover picture with a description' },
    { id: 'links', ok: links >= 1, label: 'Links to another page', tip: 'Another post, the app, or a useful page elsewhere' },
    { id: 'excerpt', ok: !!p.excerpt.trim(), label: 'An excerpt for the blog list' },
  ];
}
