// ============================================================================
// Writing blog posts with Google Gemini (Admin → Blog)
//
//   ideas    a theme (or nothing) → post ideas, each a title, the angle and
//            the search phrase it's for
//   draft    a topic, the phrase people search for, who it's for, the tone
//            and the length → a whole post: title, slug, excerpt, the text in
//            Markdown, the search engine title and description, tags and a
//            description of a fitting cover picture
//   seo      a written post → its search engine title and description,
//            excerpt, slug, tags and search phrase
//   rewrite  some text and what to do with it ("shorter", "warmer",
//            "add an example") → the text rewritten
//
// Sent to Google: what the admin typed and, for seo and rewrite, the post's
// text. Never anything about members. Needs the GEMINI_API_KEY secret, the
// same as search; GEMINI_BLOG_MODEL optionally picks the model.
// ============================================================================

export type Action = 'ideas' | 'draft' | 'seo' | 'rewrite';

export interface DraftInput {
  topic: string;
  keyword?: string;
  audience?: string;
  tone?: string;
  length?: 'short' | 'medium' | 'long';
  notes?: string;
}
export interface SeoInput { title: string; content: string }
export interface RewriteInput { text: string; instruction: string }
export interface IdeasInput { theme?: string }

export interface Idea { title: string; angle: string; keyword: string }
export interface SeoFields {
  seo_title: string;
  seo_description: string;
  excerpt: string;
  slug: string;
  tags: string[];
  focus_keyword: string;
}
export interface Draft extends SeoFields {
  title: string;
  content: string;
  cover_alt: string;
}

export type Answer =
  | { action: 'ideas'; ideas: Idea[] }
  | { action: 'draft'; post: Draft }
  | { action: 'seo'; fields: SeoFields }
  | { action: 'rewrite'; text: string };

export interface WriterOptions {
  apiKey: string;
  model?: string;
  apiBase?: string;
  fetch?: typeof fetch;
}

export type WriteResult =
  | { ok: true; answer: Answer; model: string }
  | { ok: false; reason: 'no_key' | 'bad_request' | 'quota' | 'error' | 'unusable'; message: string };

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Best writer first. If Google says a model doesn't exist (retired, or not
// offered to new projects), the next one is tried.
export const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
const TIMEOUT_MS = 55_000;

let workingModel: string | null = null;
export const resetWriterState = () => { workingModel = null; };

const WORDS = { short: '600 to 800', medium: '1,000 to 1,300', long: '1,600 to 2,000' } as const;

const HOUSE_STYLE = `You write for the blog of Shaadi24, a matrimony app for India (Android and iPhone) where people describe
the life partner they want in their own words and meet the people they fit best. Readers are Indian singles who want
to marry, and their families, in India and abroad.

House style:
- Warm, respectful and practical. Indian English (colour, organise; lakh and crore where money comes up). Plain words,
  short paragraphs (2 to 4 sentences), "you" for the reader.
- Respect every religion, community, region and family; never rank castes or communities, and never suggest dowry,
  pressure or deception. Safety first when meeting someone new.
- Never invent statistics, studies, surveys, quotes, people or stories presented as real. General advice only, no
  medical, legal or financial advice beyond common sense ("talk to a lawyer" where it matters).
- Mention Shaadi24 at most twice, naturally, and never promise matches or results.
- Markdown only: ## and ### headings (never a # heading: the title is separate), lists, **bold** sparingly, > for a
  tip. No tables, no HTML, no images, no links unless asked.`;

const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

/** "Arranged vs Love Marriage: 7 Things!" → "arranged-vs-love-marriage-7-things" (100 at most) */
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

const tagsFrom = (t: unknown) =>
  [...new Set((Array.isArray(t) ? t : []).map((x) => clean(x, 30).toLowerCase()).filter(Boolean))].slice(0, 6);

// A leading "# Title" line is dropped (the title is shown on its own)
export const tidyMarkdown = (s: unknown) =>
  typeof s === 'string'
    ? s.replace(/\r\n/g, '\n').replace(/^\s*#\s+[^\n]*\n+/, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 100_000)
    : '';

const STRINGS = (props: string[]) => Object.fromEntries(props.map((p) => [p, { type: 'string' }]));
const SEO_PROPS = {
  ...STRINGS(['seo_title', 'seo_description', 'excerpt', 'slug', 'focus_keyword']),
  tags: { type: 'array', items: { type: 'string' } },
};
const SEO_RULES = `- seo_title: 50 to 60 characters, the search phrase near the start, no "| Shaadi24" (it's added).
- seo_description: 140 to 155 characters, says what the reader gets, with the search phrase once.
- excerpt: one or two sentences (up to 200 characters) for the blog's list and link previews.
- slug: 3 to 6 lowercase words joined by hyphens, the search phrase's words, no dates or stop words.
- tags: 3 to 5 short lowercase topics (e.g. "arranged marriage", "first meeting", "family").
- focus_keyword: the phrase people would type into Google to find this post.`;

function schemaFor(action: Action) {
  if (action === 'ideas') {
    return {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          items: { type: 'object', properties: STRINGS(['title', 'angle', 'keyword']), required: ['title', 'angle', 'keyword'] },
        },
      },
      required: ['ideas'],
    };
  }
  if (action === 'rewrite') return { type: 'object', properties: STRINGS(['text']), required: ['text'] };
  if (action === 'seo') return { type: 'object', properties: SEO_PROPS, required: Object.keys(SEO_PROPS) };
  const props = { ...SEO_PROPS, ...STRINGS(['title', 'content', 'cover_alt']) };
  return { type: 'object', properties: props, required: Object.keys(props) };
}

function taskText(action: Action, input: Record<string, unknown>): string {
  if (action === 'ideas') {
    const theme = clean(input.theme, 200);
    return `Blog task: ideas.
Suggest 8 blog post ideas${theme ? ` about: ${JSON.stringify(theme)}` : ' across marriage, partner search, family, relationships and safety'}.
Each: a title (under 70 characters) that answers a real question people search for, a one-sentence angle, and the
search phrase (keyword) it targets. Mix guides, checklists and questions; no two alike.`;
  }
  if (action === 'draft') {
    const d = input as unknown as DraftInput;
    const length = d.length && d.length in WORDS ? d.length : 'medium';
    return `Blog task: draft.
Write a complete blog post.
Topic: ${JSON.stringify(clean(d.topic, 300))}
${clean(d.keyword, 100) ? `Search phrase to rank for: ${JSON.stringify(clean(d.keyword, 100))}\n` : ''}${clean(d.audience, 200) ? `Written for: ${JSON.stringify(clean(d.audience, 200))}\n` : ''}Tone: ${JSON.stringify(clean(d.tone, 60) || 'warm and practical')}
Length: ${WORDS[length]} words of text.
${clean(d.notes, 1000) ? `Points to include: ${JSON.stringify(clean(d.notes, 1000))}\n` : ''}
- title: under 70 characters, clear and specific, the search phrase in it where it reads naturally.
- content: the post in Markdown. Open with 2 or 3 sentences that say what the reader will get (the search phrase in
  the first paragraph). Then 4 to 7 ## sections, with ### or lists where they help. End with a short ## section that
  sums up, and, where it fits naturally, one sentence about describing the partner you want on Shaadi24. Add a short
  "## Frequently asked questions" with 3 questions (### each) when the topic has common questions.
- cover_alt: one sentence describing a fitting cover photo (it is the picture's alt text).
${SEO_RULES}`;
  }
  if (action === 'seo') {
    const s = input as unknown as SeoInput;
    return `Blog task: seo.
For this post, write what search engines and link previews show.
${SEO_RULES}

Title: ${JSON.stringify(clean(s.title, 200))}
Post:
${String(s.content ?? '').slice(0, 30_000)}`;
  }
  const r = input as unknown as RewriteInput;
  return `Blog task: rewrite.
Rewrite the text below: ${JSON.stringify(clean(r.instruction, 300) || 'make it clearer')}.
Keep its Markdown (headings, lists) and its meaning unless asked otherwise, in the house style. Answer with the
rewritten text only, in "text".

Text:
${String(r.text ?? '').slice(0, 20_000)}`;
}

/** What's wrong with the input, or null */
export function checkInput(action: unknown, input: Record<string, unknown>): string | null {
  if (!['ideas', 'draft', 'seo', 'rewrite'].includes(action as string)) return 'Unknown action';
  if (action === 'draft' && clean(input.topic, 300).length < 3) return 'Say what the post is about';
  if (action === 'seo' && (!clean(input.title, 200) || String(input.content ?? '').trim().length < 50)) {
    return 'Write the title and some of the post first';
  }
  if (action === 'rewrite' && !String(input.text ?? '').trim()) return 'Nothing to rewrite';
  return null;
}

export function requestBody(model: string, action: Action, input: Record<string, unknown>) {
  const tuning = model.startsWith('gemini-3')
    ? { thinkingConfig: { thinkingLevel: 'low' } }
    : model.startsWith('gemini-2.5')
      ? { temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } }
      : { temperature: 0.7 };
  return {
    systemInstruction: { parts: [{ text: HOUSE_STYLE }] },
    contents: [{ role: 'user', parts: [{ text: taskText(action, input) }] }],
    generationConfig: {
      ...tuning,
      maxOutputTokens: action === 'draft' ? 8192 : action === 'rewrite' ? 4096 : 1024,
      responseMimeType: 'application/json',
      responseJsonSchema: schemaFor(action),
    },
  };
}

function seoFields(o: Record<string, unknown>, fallbackTitle = ''): SeoFields {
  return {
    seo_title: clean(o.seo_title, 120),
    seo_description: clean(o.seo_description, 320),
    excerpt: clean(o.excerpt, 400),
    slug: slugify(clean(o.slug, 120) || fallbackTitle),
    tags: tagsFrom(o.tags),
    focus_keyword: clean(o.focus_keyword, 100),
  };
}

/** Gemini's answer → what the editor gets, or null when it's unusable */
export function readAnswer(action: Action, data: unknown): Answer | null {
  // deno-lint-ignore no-explicit-any
  const parts = (data as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const raw = parts.filter((p) => !p?.thought && typeof p?.text === 'string').map((p) => p.text).join('');
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;

  if (action === 'ideas') {
    const ideas = (Array.isArray(o.ideas) ? o.ideas : [])
      .map((i: Record<string, unknown>) => ({ title: clean(i?.title, 120), angle: clean(i?.angle, 300), keyword: clean(i?.keyword, 100) }))
      .filter((i: Idea) => i.title)
      .slice(0, 10);
    return ideas.length ? { action, ideas } : null;
  }
  if (action === 'rewrite') {
    const text = typeof o.text === 'string' ? o.text.replace(/\r\n/g, '\n').trim().slice(0, 50_000) : '';
    return text ? { action, text } : null;
  }
  if (action === 'seo') {
    const fields = seoFields(o);
    return fields.seo_title || fields.seo_description ? { action, fields } : null;
  }
  const title = clean(o.title, 200);
  const content = tidyMarkdown(o.content);
  if (!title || content.length < 200) return null;
  return { action, post: { title, content, cover_alt: clean(o.cover_alt, 200), ...seoFields(o, title) } };
}

export async function write(action: Action, input: Record<string, unknown>, opts: WriterOptions): Promise<WriteResult> {
  const problem = checkInput(action, input);
  if (problem) return { ok: false, reason: 'bad_request', message: problem };
  if (!opts.apiKey) {
    return { ok: false, reason: 'no_key', message: 'AI writing needs the GEMINI_API_KEY secret in Supabase (the same key search uses).' };
  }
  const doFetch = opts.fetch ?? fetch;
  const models = opts.model ? [opts.model] : workingModel ? [workingModel] : DEFAULT_MODELS;
  for (const model of models) {
    let res: Response;
    try {
      res = await doFetch(`${opts.apiBase ?? API_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify(requestBody(model, action, input)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: 'error', message: 'Gemini took too long or could not be reached. Try again.' };
    }
    if (res.status === 404) {
      await res.body?.cancel();
      continue;
    }
    if (res.status === 429) {
      await res.body?.cancel();
      return { ok: false, reason: 'quota', message: "Gemini's free quota is used up for now. Try again in a minute (or tomorrow)." };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[blog-ai] Gemini ${model}: ${res.status} ${detail.slice(0, 300)}`);
      return { ok: false, reason: 'error', message: `Gemini answered with an error (${res.status}). Try again.` };
    }
    const answer = readAnswer(action, await res.json().catch(() => null));
    if (!answer) return { ok: false, reason: 'unusable', message: "Gemini's answer couldn't be used. Try again." };
    workingModel = model;
    return { ok: true, answer, model };
  }
  return { ok: false, reason: 'error', message: 'None of the Gemini models are available to this key.' };
}
