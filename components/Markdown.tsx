import React from 'react';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown';

// ============================================================================
// A blog post's Markdown on screen (lib/markdown.ts reads it): the website's
// /blog pages and the editor's preview in Admin → Blog. Styled here, in the
// website's light and dark colours.
// ============================================================================

const Inlines: React.FC<{ c: Inline[] }> = ({ c }) => (
  <>
    {c.map((n, i) => {
      if (n.t === 'text') return <React.Fragment key={i}>{n.v}</React.Fragment>;
      if (n.t === 'code') return <code key={i} className="rounded bg-gray-100 dark:bg-zinc-800 px-1 py-0.5 text-[0.9em]">{n.v}</code>;
      if (n.t === 'b') return <strong key={i} className="font-semibold text-gray-900 dark:text-white"><Inlines c={n.c} /></strong>;
      if (n.t === 'i') return <em key={i}><Inlines c={n.c} /></em>;
      const external = /^https?:/i.test(n.href);
      return (
        <a key={i} href={n.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="underline underline-offset-2 decoration-gray-400 hover:decoration-current text-gray-900 dark:text-white">
          <Inlines c={n.c} />
        </a>
      );
    })}
  </>
);

const BlockView: React.FC<{ b: Block }> = ({ b }) => {
  switch (b.t) {
    case 'h': {
      const cls = b.level === 2
        ? 'mt-10 mb-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white scroll-mt-20'
        : 'mt-7 mb-2 text-lg font-semibold text-gray-900 dark:text-white scroll-mt-20';
      const Tag = `h${b.level}` as 'h2' | 'h3' | 'h4';
      return <Tag id={b.id} className={cls}><Inlines c={b.c} /></Tag>;
    }
    case 'p': return <p className="my-4"><Inlines c={b.c} /></p>;
    case 'quote':
      return (
        <blockquote className="my-6 border-l-4 border-gray-300 dark:border-zinc-600 pl-4 italic text-gray-700 dark:text-gray-300">
          <Inlines c={b.c} />
        </blockquote>
      );
    case 'ul': case 'ol': {
      const List = b.t;
      return (
        <List className={`my-4 pl-6 space-y-1.5 ${b.t === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-gray-400`}>
          {b.items.map((it, i) => <li key={i}><Inlines c={it} /></li>)}
        </List>
      );
    }
    case 'img': return <img src={b.src} alt={b.alt} loading="lazy" className="my-6 w-full rounded-xl" />;
    case 'hr': return <hr className="my-8 border-gray-200 dark:border-zinc-800" />;
    case 'pre':
      return <pre className="my-5 overflow-x-auto rounded-lg bg-gray-100 dark:bg-zinc-800 p-4 text-sm"><code>{b.v}</code></pre>;
  }
};

const Markdown: React.FC<{ source: string; className?: string }> = ({ source, className = '' }) => (
  <div className={`text-[17px] leading-relaxed text-gray-700 dark:text-gray-300 ${className}`}>
    {parseMarkdown(source).map((b, i) => <BlockView key={i} b={b} />)}
  </div>
);

export default Markdown;
