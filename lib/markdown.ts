// ============================================================================
// The Markdown the blog is written in (Admin → Blog), read into blocks that
// components/Markdown.tsx shows on the website and toHtml() turns into HTML
// for search engines and link previews (api/blog.ts). Nothing in a post is
// ever used as HTML: text is text, and only https, mailto and on-site links
// and https pictures are kept.
//
//   ## Heading, ### Smaller heading      paragraphs (blank line between)
//   - item / * item, 1. item             > a tip or quote
//   **bold**, *italic*, `code`           [text](https://…), ![alt](https://…)
//   ---                                   a line across
// ============================================================================

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] };

export type Block =
  | { t: 'h'; level: 2 | 3 | 4; id: string; c: Inline[]; text: string }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'img'; src: string; alt: string }
  | { t: 'hr' }
  | { t: 'pre'; v: string };

export const safeHref = (url: string): string | null => {
  const u = url.trim();
  if (/^https?:\/\/[^\s]+$/i.test(u) || /^mailto:[^\s]+$/i.test(u)) return u;
  if (/^\/(?!\/)[^\s]*$/.test(u) || /^#[\w-]+$/.test(u)) return u;
  return null;
};
const safeSrc = (url: string) => (/^https:\/\/[^\s"'<>]+$/i.test(url.trim()) ? url.trim() : null);

export const headingId = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';

// ---- Inline ----------------------------------------------------------------

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => { if (text) { out.push({ t: 'text', v: text }); text = ''; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if (rest[0] === '\\' && i + 1 < src.length && /[\\`*_[\]()#>!-]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length;
    } else if ((m = rest.match(/^\*\*(?=\S)([\s\S]*?\S)\*\*/)) || (m = rest.match(/^__(?=\S)([\s\S]*?\S)__/))) {
      flush(); out.push({ t: 'b', c: parseInline(m[1]) }); i += m[0].length;
    } else if ((m = rest.match(/^\*(?=[^\s*])([\s\S]*?[^\s*])\*/)) || (/[^\w]|^$/.test(src[i - 1] ?? '') && (m = rest.match(/^_(?=\S)([\s\S]*?\S)_(?!\w)/)))) {
      flush(); out.push({ t: 'i', c: parseInline(m[1]) }); i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      const href = safeHref(m[2]);
      flush();
      if (href) out.push({ t: 'a', href, c: parseInline(m[1]) });
      else out.push(...parseInline(m[1]));
      i += m[0].length;
    } else {
      text += src[i];
      i++;
    }
  }
  flush();
  return out;
}

export const inlineText = (c: Inline[]): string =>
  c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : inlineText(n.c))).join('');

// ---- Blocks ----------------------------------------------------------------

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  let i = 0;
  const isBlank = (l: string) => !l.trim();
  const startsBlock = (l: string) =>
    /^#{1,6}\s/.test(l) || /^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l) || /^>\s?/.test(l) ||
    /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^```/.test(l) || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m: RegExpMatchArray | null;

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ t: 'pre', v: body.join('\n') });
    } else if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      // # becomes ## (the post's title is the page's only top heading)
      const level = Math.min(Math.max(m[1].length, 2), 4) as 2 | 3 | 4;
      const c = parseInline(m[2]);
      const text = inlineText(c);
      const base = headingId(text);
      const n = (ids.get(base) ?? 0) + 1;
      ids.set(base, n);
      blocks.push({ t: 'h', level, id: n > 1 ? `${base}-${n}` : base, c, text });
      i++;
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
    } else if ((m = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      const src = safeSrc(m[2]);
      if (src) blocks.push({ t: 'img', src, alt: m[1] });
      i++;
    } else if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ t: 'quote', c: parseInline(body.join(' ').trim()) });
    } else if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const marker = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const items: string[] = [];
      while (i < lines.length) {
        if (marker.test(lines[i])) items.push(lines[i++].replace(marker, ''));
        else if (!isBlank(lines[i]) && /^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i++].trim()}`;
        else break;
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items: items.map((s) => parseInline(s.trim())) });
    } else {
      const body: string[] = [line.trim()];
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) body.push(lines[i++].trim());
      blocks.push({ t: 'p', c: parseInline(body.join(' ')) });
    }
  }
  return blocks;
}

// ---- What the blog shows about a post --------------------------------------

/** The text without Markdown: for counting words and for descriptions */
export const plainText = (src: string) =>
  parseMarkdown(src)
    .map((b) => (b.t === 'h' ? b.text : b.t === 'p' || b.t === 'quote' ? inlineText(b.c) : b.t === 'ul' || b.t === 'ol' ? b.items.map(inlineText).join(' ') : b.t === 'pre' ? b.v : ''))
    .filter(Boolean)
    .join('\n');

export const wordCount = (src: string) => (plainText(src).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
export const readingMinutes = (src: string) => Math.max(1, Math.round(wordCount(src) / 220));

// ---- HTML (for api/blog.ts) ------------------------------------------------

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inlineHtml = (c: Inline[]): string =>
  c.map((n) => {
    if (n.t === 'text') return escapeHtml(n.v);
    if (n.t === 'code') return `<code>${escapeHtml(n.v)}</code>`;
    if (n.t === 'b') return `<strong>${inlineHtml(n.c)}</strong>`;
    if (n.t === 'i') return `<em>${inlineHtml(n.c)}</em>`;
    const external = /^https?:/i.test(n.href);
    return `<a href="${escapeHtml(n.href)}"${external ? ' rel="noopener"' : ''}>${inlineHtml(n.c)}</a>`;
  }).join('');

export function toHtml(blocks: Block[]): string {
  return blocks.map((b) => {
    switch (b.t) {
      case 'h': return `<h${b.level} id="${escapeHtml(b.id)}">${inlineHtml(b.c)}</h${b.level}>`;
      case 'p': return `<p>${inlineHtml(b.c)}</p>`;
      case 'quote': return `<blockquote><p>${inlineHtml(b.c)}</p></blockquote>`;
      case 'ul': case 'ol': return `<${b.t}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</${b.t}>`;
      case 'img': return `<img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}" loading="lazy">`;
      case 'hr': return '<hr>';
      case 'pre': return `<pre><code>${escapeHtml(b.v)}</code></pre>`;
    }
  }).join('\n');
}
