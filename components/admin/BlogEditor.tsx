import React, { useMemo, useRef, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  aiRewrite, aiSeo, deletePost, formatDate, isLive, isScheduled, metaDescription, metaTitle, postState, postUrl, savePost, seoChecks,
  slugify, uploadCover, COVER_TYPES, type AiDraft, type PostDraft,
} from '../../lib/blog';
import { readingMinutes, wordCount } from '../../lib/markdown';
import Markdown from '../Markdown';
import { DraftDialog, Spinner, field, labelClass } from './BlogAiDialogs';
import { IconSparkles, IconCheck, IconCircle } from '../../constants';

// ============================================================================
// Admin → Blog → a post: the title and the text (Markdown, with a toolbar, a
// preview and "Rewrite with AI" for a selected passage) on the left; on the
// right, publishing (draft, now or on a date), the address, excerpt, cover
// picture, tags, author, the search fields with a Google preview, and the
// SEO check list. "Write with AI" drafts everything; "Fill with AI" writes
// the search fields for what's written.
// ============================================================================

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const Panel: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
  <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      {right}
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);

const Counter: React.FC<{ n: number; min?: number; max: number }> = ({ n, min = 0, max }) => (
  <span className={`text-[11px] tabular-nums ${n > max || (n > 0 && n < min) ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-zinc-400'}`}>
    {n}/{max}
  </span>
);

type ToolId = 'h2' | 'h3' | 'bold' | 'italic' | 'list' | 'numbered' | 'quote' | 'link' | 'picture';
const TOOLS: { id: ToolId; label: string; title: string }[] = [
  { id: 'h2', label: 'H2', title: 'Section heading' },
  { id: 'h3', label: 'H3', title: 'Smaller heading' },
  { id: 'bold', label: 'B', title: 'Bold' },
  { id: 'italic', label: 'I', title: 'Italic' },
  { id: 'list', label: '•', title: 'Bulleted list' },
  { id: 'numbered', label: '1.', title: 'Numbered list' },
  { id: 'quote', label: '❝', title: 'Tip or quote' },
  { id: 'link', label: 'Link', title: 'Link' },
  { id: 'picture', label: 'Picture', title: 'Picture' },
];

const REWRITES = ['Make it clearer', 'Make it shorter', 'Make it warmer', 'Add an example', 'Fix grammar and spelling'];

const btn = 'h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40';
const primary = 'h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40';

const BlogEditor: React.FC<{ initial: PostDraft; startWithAi?: { topic: string; keyword: string } | null; onBack: () => void; onSaved: () => void }> = ({
  initial, startWithAi, onBack, onSaved,
}) => {
  const { showToast } = useToast();
  const [p, setP] = useState<PostDraft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [slugEdited, setSlugEdited] = useState(!!initial.id);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftAi, setDraftAi] = useState<{ topic: string; keyword: string } | null>(startWithAi ?? null);
  const [rewrite, setRewrite] = useState<{ start: number; end: number; instruction: string } | null>(null);
  const [tagText, setTagText] = useState(initial.tags.join(', '));
  const text = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(p) !== saved;
  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => setP((x) => ({ ...x, [k]: v }));
  const setTitle = (title: string) => setP((x) => ({ ...x, title, ...(slugEdited ? {} : { slug: slugify(title) }) }));
  const checks = useMemo(() => seoChecks(p), [p]);
  const words = useMemo(() => wordCount(p.content), [p.content]);
  const live = isLive({ status: p.status, published_at: p.published_at });
  const future = isScheduled(p.published_at);

  const back = () => {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    onBack();
  };

  const save = async (status: PostDraft['status'], label: string) => {
    setBusy(label);
    const draft = { ...p, status };
    const { post, error } = await savePost(draft);
    setBusy(null);
    if (error || !post) {
      showToast(error ?? "Couldn't save", 'error');
      return;
    }
    const next: PostDraft = { ...draft, ...post };
    setP(next);
    setSaved(JSON.stringify(next));
    setSlugEdited(true);
    showToast(status === 'draft' ? 'Draft saved' : isLive(post) ? 'Published' : `Scheduled for ${formatDate(post.published_at)}`, 'success');
    onSaved();
  };

  const remove = async () => {
    if (!p.id || !window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    setBusy('delete');
    const { error } = await deletePost(p.id);
    setBusy(null);
    if (error) showToast(`Couldn't delete: ${error}`, 'error');
    else {
      showToast('Post deleted', 'success');
      onSaved();
      onBack();
    }
  };

  // ---- The text: toolbar, pictures, AI rewrite ----
  const edit = (fn: (sel: string) => { insert: string; select?: [number, number] }) => {
    const ta = text.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const { insert, select } = fn(value.slice(s, e));
    const content = value.slice(0, s) + insert + value.slice(e);
    set('content', content);
    requestAnimationFrame(() => {
      ta.focus();
      const [a, b] = select ? [s + select[0], s + select[1]] : [s + insert.length, s + insert.length];
      ta.setSelectionRange(a, b);
    });
  };
  const wrap = (mark: string, placeholder: string) =>
    edit((sel) => ({ insert: `${mark}${sel || placeholder}${mark}`, select: [mark.length, mark.length + (sel || placeholder).length] }));
  const linePrefix = (prefix: string, placeholder: string) =>
    edit((sel) => {
      const body = (sel || placeholder).split('\n').map((l, i) => `${prefix.replace('1.', `${i + 1}.`)}${l}`).join('\n');
      return { insert: `\n${body}\n`, select: [1, 1 + body.length] };
    });
  const link = () => {
    const url = window.prompt('Link address (https://… or /blog/…)');
    if (url) edit((sel) => ({ insert: `[${sel || 'link text'}](${url.trim()})`, select: [1, 1 + (sel || 'link text').length] }));
  };

  const runTool = (id: ToolId) => {
    if (id === 'h2') linePrefix('## ', 'Section heading');
    else if (id === 'h3') linePrefix('### ', 'Smaller heading');
    else if (id === 'bold') wrap('**', 'bold text');
    else if (id === 'italic') wrap('*', 'italic text');
    else if (id === 'list') linePrefix('- ', 'List item');
    else if (id === 'numbered') linePrefix('1. ', 'List item');
    else if (id === 'quote') linePrefix('> ', 'A tip for the reader');
    else if (id === 'link') link();
    else imageInput.current?.click();
  };

  const upload = async (file: File | undefined, then: (url: string) => void) => {
    if (!file) return;
    setBusy('upload');
    const { url, error } = await uploadCover(file);
    setBusy(null);
    if (error || !url) showToast(`Couldn't upload: ${error}`, 'error');
    else then(url);
  };

  const startRewrite = () => {
    const ta = text.current;
    if (!ta || ta.selectionStart === ta.selectionEnd) {
      showToast('Select the passage to rewrite first', 'info');
      return;
    }
    setRewrite({ start: ta.selectionStart, end: ta.selectionEnd, instruction: REWRITES[0] });
  };
  const runRewrite = async () => {
    if (!rewrite) return;
    setBusy('rewrite');
    const { data, error } = await aiRewrite(p.content.slice(rewrite.start, rewrite.end), rewrite.instruction);
    setBusy(null);
    if (error || !data) {
      showToast(error ?? "Couldn't rewrite", 'error');
      return;
    }
    setP((x) => ({ ...x, content: x.content.slice(0, rewrite.start) + data.text + x.content.slice(rewrite.end), ai_assisted: true }));
    setRewrite(null);
  };

  const fillSeo = async () => {
    setBusy('seo');
    const { data, error } = await aiSeo(p.title, p.content);
    setBusy(null);
    if (error || !data) {
      showToast(error ?? "Couldn't write the search fields", 'error');
      return;
    }
    const f = data.fields;
    setP((x) => ({
      ...x,
      seo_title: f.seo_title || x.seo_title,
      seo_description: f.seo_description || x.seo_description,
      excerpt: x.excerpt || f.excerpt,
      focus_keyword: x.focus_keyword || f.focus_keyword,
      tags: x.tags.length ? x.tags : f.tags,
      slug: slugEdited && x.id ? x.slug : f.slug || x.slug,
      ai_assisted: true,
    }));
    if (!p.tags.length) setTagText(f.tags.join(', '));
    showToast('Search fields filled in. Check them before publishing.', 'success');
  };

  const takeDraft = (d: AiDraft) => {
    setP((x) => ({
      ...x,
      title: d.title, content: d.content, excerpt: d.excerpt, slug: x.id && slugEdited ? x.slug : d.slug,
      seo_title: d.seo_title, seo_description: d.seo_description, focus_keyword: d.focus_keyword,
      tags: d.tags, cover_alt: x.cover_alt || d.cover_alt, ai_assisted: true,
    }));
    setTagText(d.tags.join(', '));
    setDraftAi(null);
    showToast('Draft written. Read it through and make it yours.', 'success');
  };

  const score = checks.filter((c) => c.ok).length;
  const url = postUrl(slugify(p.slug || p.title) || 'your-post');

  return (
    <div data-testid="blog-editor">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <button type="button" onClick={back} className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white">← All posts</button>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
          <span data-testid="blog-state" className={`px-2 py-0.5 rounded-full font-medium ${live ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : p.status === 'published' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300'}`}>
            {p.id ? postState({ status: p.status, published_at: p.published_at }) : 'New'}
          </span>
          {dirty && <span>Unsaved changes</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* ---- Writing ---- */}
        <div className="min-w-0">
          <label htmlFor="post-title" className="sr-only">Title</label>
          <input
            id="post-title"
            value={p.title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Title"
            className="w-full bg-transparent text-3xl font-bold tracking-tight text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-zinc-600 outline-none"
          />

          <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-1 py-2 bg-white/95 dark:bg-[#191919]/95 border-b border-gray-100 dark:border-zinc-800" role="toolbar" aria-label="Formatting">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" title={t.title} disabled={preview} onClick={() => runTool(t.id)} className="h-8 min-w-8 px-2 rounded-md text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30">
                <span aria-hidden="true">{t.label}</span><span className="sr-only">{t.title}</span>
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-zinc-700" aria-hidden="true" />
            <button type="button" onClick={startRewrite} disabled={preview || !!busy} className="h-8 px-2 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30">
              <span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconSparkles /></span>Rewrite selection
            </button>
            <div className="ml-auto flex rounded-md border border-gray-200 dark:border-zinc-700 p-0.5 text-xs" role="group" aria-label="View">
              {(['Write', 'Preview'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={(v === 'Preview') === preview} onClick={() => setPreview(v === 'Preview')} className={`h-7 px-3 rounded ${(v === 'Preview') === preview ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-zinc-300'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {rewrite && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-zinc-700 p-3" data-testid="blog-rewrite">
              <label htmlFor="rewrite-how" className="text-sm text-gray-700 dark:text-zinc-300">Rewrite the selected text:</label>
              <input id="rewrite-how" list="rewrite-presets" value={rewrite.instruction} onChange={(e) => setRewrite({ ...rewrite, instruction: e.target.value })} maxLength={300} className={`${field} flex-1 min-w-[180px]`} />
              <datalist id="rewrite-presets">{REWRITES.map((r) => <option key={r} value={r} />)}</datalist>
              <button type="button" onClick={runRewrite} disabled={busy === 'rewrite' || !rewrite.instruction.trim()} className={primary}>{busy === 'rewrite' ? <Spinner /> : 'Rewrite'}</button>
              <button type="button" onClick={() => setRewrite(null)} className={btn}>Cancel</button>
            </div>
          )}

          {preview ? (
            <article className="mt-6 min-h-[480px]" data-testid="blog-preview">
              {p.content.trim() ? <Markdown source={p.content} /> : <p className="text-gray-500 dark:text-zinc-400">Nothing written yet.</p>}
            </article>
          ) : (
            <>
              <label htmlFor="post-content" className="sr-only">Post text (Markdown)</label>
              <textarea
                id="post-content"
                ref={text}
                value={p.content}
                onChange={(e) => set('content', e.target.value)}
                placeholder={'Start writing… (## for a section heading, - for a list, **bold**)\n\nOr use “Write with AI” on the right.'}
                className="mt-4 w-full min-h-[520px] resize-y bg-transparent text-[15px] leading-7 text-gray-800 dark:text-zinc-200 placeholder:text-gray-400 dark:placeholder:text-zinc-500 outline-none"
              />
            </>
          )}
          <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">{words.toLocaleString()} words · {readingMinutes(p.content)} min read</p>
          <input ref={imageInput} type="file" accept={COVER_TYPES.join(',')} className="hidden" aria-label="Picture for the text"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f, (u) => edit(() => ({ insert: `\n![Describe the picture](${u})\n` }))); }} />
        </div>

        {/* ---- Settings ---- */}
        <aside className="space-y-4" aria-label="Post settings">
          <Panel title="Publish">
            <div>
              <label htmlFor="post-date" className={labelClass}>{p.status === 'published' ? 'Published on' : 'Publish on (empty: when you publish)'}</label>
              <input id="post-date" type="datetime-local" value={toLocalInput(p.published_at)} onChange={(e) => set('published_at', fromLocalInput(e.target.value))} className={field} />
            </div>
            <div className="flex flex-wrap gap-2">
              {p.status === 'draft' ? (
                <>
                  <button type="button" onClick={() => save('draft', 'draft')} disabled={!!busy || !p.title.trim()} className={btn}>{busy === 'draft' ? <Spinner /> : 'Save draft'}</button>
                  <button type="button" onClick={() => save('published', 'publish')} disabled={!!busy || !p.title.trim() || !p.content.trim()} className={primary}>
                    {busy === 'publish' ? <Spinner /> : future ? 'Schedule' : 'Publish'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => save('published', 'publish')} disabled={!!busy || !p.title.trim()} className={primary}>{busy === 'publish' ? <Spinner /> : 'Update'}</button>
                  <button type="button" onClick={() => save('draft', 'draft')} disabled={!!busy} className={btn}>Unpublish</button>
                </>
              )}
            </div>
            {p.id && live && (
              <a href={postUrl(p.slug)} target="_blank" rel="noopener noreferrer" className="block text-xs underline text-gray-600 dark:text-zinc-300">View on the website ↗</a>
            )}
            {p.id && (
              <button type="button" onClick={remove} disabled={!!busy} className="text-xs text-red-600 dark:text-red-400 hover:underline">Delete post</button>
            )}
          </Panel>

          <Panel title="AI writing">
            <button type="button" onClick={() => setDraftAi({ topic: p.title, keyword: p.focus_keyword })} disabled={!!busy} className={`${btn} w-full`}><span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconSparkles /></span>Write with AI</button>
            <button type="button" onClick={fillSeo} disabled={!!busy || !p.title.trim() || p.content.trim().length < 50} className={`${btn} w-full`}>
              {busy === 'seo' ? <Spinner /> : <><span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconSparkles /></span>Fill search fields with AI</>}
            </button>
            <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-relaxed">Select a passage and use “Rewrite selection” to improve it. Always read AI text before publishing.</p>
          </Panel>

          <Panel title="Address and summary">
            <div>
              <label htmlFor="post-slug" className={labelClass}>Address</label>
              <div className="flex items-center rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:ring-2 focus-within:ring-gray-300 dark:focus-within:ring-zinc-600">
                <span className="pl-3 text-sm text-gray-500 dark:text-zinc-400">/blog/</span>
                <input id="post-slug" value={p.slug} onChange={(e) => { setSlugEdited(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')); }} onBlur={() => set('slug', slugify(p.slug))} maxLength={100} className="flex-1 min-w-0 bg-transparent px-1 py-2 text-sm outline-none" />
              </div>
              {p.id && live && slugify(p.slug) !== JSON.parse(saved).slug && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">Changing a published post's address breaks links to it.</p>
              )}
            </div>
            <div>
              <div className="flex justify-between"><label htmlFor="post-excerpt" className={labelClass}>Excerpt</label><Counter n={p.excerpt.length} max={200} /></div>
              <textarea id="post-excerpt" value={p.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={400} rows={3} className={field} placeholder="One or two sentences for the blog list" />
            </div>
            <div>
              <label htmlFor="post-tags" className={labelClass}>Tags (commas between)</label>
              <input id="post-tags" value={tagText} onChange={(e) => { setTagText(e.target.value); set('tags', e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10)); }} className={field} placeholder="arranged marriage, family" />
            </div>
            <div>
              <label htmlFor="post-author" className={labelClass}>Author</label>
              <input id="post-author" value={p.author_name} onChange={(e) => set('author_name', e.target.value)} maxLength={80} className={field} />
            </div>
          </Panel>

          <Panel title="Cover picture">
            {p.cover_url ? (
              <div className="relative">
                <img src={p.cover_url} alt={p.cover_alt} className="w-full aspect-[1200/630] object-cover rounded-md border border-gray-100 dark:border-zinc-800" />
                <button type="button" onClick={() => set('cover_url', null)} className="absolute top-2 right-2 h-7 px-2 rounded-md bg-white/90 dark:bg-zinc-900/90 text-xs font-medium">Remove</button>
              </div>
            ) : (
              <button type="button" onClick={() => coverInput.current?.click()} disabled={!!busy} className="w-full aspect-[1200/630] rounded-md border border-dashed border-gray-300 dark:border-zinc-700 text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">
                {busy === 'upload' ? <Spinner /> : 'Upload a picture (1200 × 630 is best)'}
              </button>
            )}
            <input ref={coverInput} type="file" accept={COVER_TYPES.join(',')} className="hidden" aria-label="Cover picture"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f, (u) => set('cover_url', u)); }} />
            <div>
              <label htmlFor="post-cover-url" className={labelClass}>Or its address</label>
              <input id="post-cover-url" value={p.cover_url ?? ''} onChange={(e) => set('cover_url', e.target.value || null)} placeholder="https://…" className={field} />
            </div>
            <div>
              <label htmlFor="post-cover-alt" className={labelClass}>Description (for screen readers and Google)</label>
              <input id="post-cover-alt" value={p.cover_alt} onChange={(e) => set('cover_alt', e.target.value)} maxLength={200} className={field} />
            </div>
          </Panel>

          <Panel title="Search engines" right={<span className="text-xs tabular-nums text-gray-500 dark:text-zinc-400" data-testid="seo-score">{score}/{checks.length}</span>}>
            <div>
              <label htmlFor="post-keyword" className={labelClass}>Search phrase</label>
              <input id="post-keyword" value={p.focus_keyword} onChange={(e) => set('focus_keyword', e.target.value)} maxLength={100} placeholder="what people type into Google" className={field} />
            </div>
            <div>
              <div className="flex justify-between"><label htmlFor="post-seo-title" className={labelClass}>Search title</label><Counter n={metaTitle(p).length} min={30} max={60} /></div>
              <input id="post-seo-title" value={p.seo_title} onChange={(e) => set('seo_title', e.target.value)} maxLength={120} placeholder={p.title || 'The title'} className={field} />
            </div>
            <div>
              <div className="flex justify-between"><label htmlFor="post-seo-desc" className={labelClass}>Search description</label><Counter n={metaDescription(p).length} min={120} max={160} /></div>
              <textarea id="post-seo-desc" value={p.seo_description} onChange={(e) => set('seo_description', e.target.value)} maxLength={320} rows={3} placeholder={p.excerpt || 'The excerpt'} className={field} />
            </div>
            <div className="rounded-md border border-gray-100 dark:border-zinc-800 p-3" aria-label="How it may look on Google" data-testid="google-preview">
              <p className="text-[11px] text-gray-500 dark:text-zinc-400 truncate">{url.replace(/^https:\/\//, '').replace(/\//g, ' › ')}</p>
              <p className="text-[15px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8] line-clamp-2">{metaTitle(p) || 'Title'} | Shaadi24</p>
              <p className="text-xs text-gray-600 dark:text-zinc-300 line-clamp-3">{metaDescription(p) || 'Description'}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
              <input type="checkbox" checked={p.noindex} onChange={(e) => set('noindex', e.target.checked)} className="rounded" />
              Hide from search engines
            </label>
            <ul className="space-y-1.5 pt-1" data-testid="seo-checks">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-xs" title={c.tip}>
                  <span aria-hidden="true" className={`flex-none mt-px [&>svg]:w-3.5 [&>svg]:h-3.5 ${c.ok ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-zinc-600'}`}>{c.ok ? <IconCheck /> : <IconCircle />}</span>
                  <span className={c.ok ? 'text-gray-700 dark:text-zinc-300' : 'text-gray-500 dark:text-zinc-400'}>
                    <span className="sr-only">{c.ok ? 'Done: ' : 'To do: '}</span>{c.label}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      {draftAi && (
        <DraftDialog
          initial={{ topic: draftAi.topic, keyword: draftAi.keyword }}
          replaces={p.content.trim().length > 0}
          onClose={() => setDraftAi(null)}
          onDraft={takeDraft}
        />
      )}
    </div>
  );
};

export default BlogEditor;
