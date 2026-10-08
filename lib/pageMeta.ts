// ============================================================================
// A page's title and the tags search engines and link previews read, set in
// the browser as the blog's pages open (api/blog.ts puts the same tags in the
// page the server sends, for crawlers that don't run JavaScript).
// ============================================================================

export interface PageMeta {
  title: string;               // the whole <title>
  description: string;
  url: string;                 // the page's canonical address
  image?: string | null;
  imageAlt?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | null;
}

function tag(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

const meta = (attr: 'name' | 'property', key: string, content: string | null) => {
  const selector = `meta[${attr}="${key}"]`;
  if (content === null) {
    document.head.querySelector(selector)?.remove();
    return;
  }
  tag(selector, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, key);
    return m;
  }).setAttribute('content', content);
};

export function setPageMeta(m: PageMeta): void {
  document.title = m.title;
  meta('name', 'description', m.description);
  meta('name', 'robots', m.noindex ? 'noindex' : null);
  meta('property', 'og:type', m.type ?? 'website');
  meta('property', 'og:title', m.title);
  meta('property', 'og:description', m.description);
  meta('property', 'og:url', m.url);
  if (m.image) {
    meta('property', 'og:image', m.image);
    meta('property', 'og:image:alt', m.imageAlt ?? '');
    meta('property', 'og:image:width', null);
    meta('property', 'og:image:height', null);
  }
  const link = tag('link[rel="canonical"]', () => {
    const l = document.createElement('link');
    l.setAttribute('rel', 'canonical');
    return l;
  });
  link.setAttribute('href', m.url);

  document.head.querySelector('script[data-page-ld]')?.remove();
  if (m.jsonLd) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.dataset.pageLd = '';
    s.textContent = JSON.stringify(m.jsonLd);
    document.head.appendChild(s);
  }
}
