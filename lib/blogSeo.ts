// ============================================================================
// What search engines and link previews get for the blog: titles,
// descriptions and structured data (schema.org), the same in the browser
// (components/website/BlogPages.tsx) and in the page the server sends
// (api/blog.ts). No browser-only imports here: api/blog.ts uses it too.
// ============================================================================

import { LEGAL } from './legalInfo.ts';
import { plainText } from './markdown.ts';

export const SITE_URL = LEGAL.websiteUrl;
export const BLOG_TITLE = 'Shaadi24 Blog';
export const BLOG_DESCRIPTION =
  'Advice for finding your life partner in India: arranged and love marriages, meeting families, first conversations, safety and starting married life well.';

export interface SeoPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_url: string | null;
  cover_alt: string;
  tags: string[];
  seo_title: string;
  seo_description: string;
  noindex: boolean;
  author_name: string;
  published_at: string | null;
  updated_at?: string;
}

export const postPath = (slug: string) => `/blog/${slug}`;

export const metaTitle = (p: Pick<SeoPost, 'seo_title' | 'title'>) => p.seo_title.trim() || p.title.trim();
export const metaDescription = (p: Pick<SeoPost, 'seo_description' | 'excerpt' | 'content'>) => {
  const own = p.seo_description.trim() || p.excerpt.trim();
  if (own) return own;
  const text = plainText(p.content).replace(/\s+/g, ' ').trim();
  return text.length > 155 ? `${text.slice(0, 152).replace(/\s+\S*$/, '')}…` : text;
};

/** The whole <title> of a post's page */
export const pageTitle = (p: Pick<SeoPost, 'seo_title' | 'title'>) => `${metaTitle(p)} | Shaadi24`;

export function postJsonLd(p: SeoPost, site = SITE_URL): Record<string, unknown> {
  const url = `${site}${postPath(p.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: metaTitle(p).slice(0, 110),
    description: metaDescription(p),
    ...(p.cover_url ? { image: [p.cover_url] } : {}),
    datePublished: p.published_at,
    dateModified: p.updated_at ?? p.published_at,
    author: { '@type': p.author_name === 'Shaadi24 Team' ? 'Organization' : 'Person', name: p.author_name },
    publisher: { '@type': 'Organization', name: 'Shaadi24', logo: { '@type': 'ImageObject', url: `${site}/apple-touch-icon.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(p.tags.length ? { keywords: p.tags.join(', ') } : {}),
  };
}

export function blogJsonLd(posts: Pick<SeoPost, 'slug' | 'title'>[], site = SITE_URL): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    url: `${site}/blog`,
    blogPost: posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${site}${postPath(p.slug)}` })),
  };
}
