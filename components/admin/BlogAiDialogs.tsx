import React, { useEffect, useState } from 'react';
import { aiDraft, aiIdeas, type AiDraft, type DraftRequest, type Idea } from '../../lib/blog';

// ============================================================================
// AI writing in Admin → Blog (supabase/functions/blog-ai): "Ideas" suggests
// posts worth writing, and "Write with AI" drafts a whole post from a topic,
// the phrase people search for, who it's for, the tone and the length. The
// draft lands in the editor to be read, corrected and published by a person.
// ============================================================================

export const field = 'w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600';
export const labelClass = 'block text-xs font-medium text-gray-600 dark:text-zinc-300 mb-1';

export const Dialog: React.FC<{ title: string; onClose: () => void; busy?: boolean; testId: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({
  title, onClose, busy, testId, children, footer, wide,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  const id = `${testId}-title`;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 popup-backdrop animate-fade-in" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        data-testid={testId}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
          <h2 id={id} className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">✕</button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">{footer}</div>}
      </div>
    </div>
  );
};

export const Spinner: React.FC = () => (
  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin align-[-3px]" aria-hidden="true" />
);

const primary = 'h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40';
const secondary = 'h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40';

// ---- Ideas -------------------------------------------------------------------

export const IdeasDialog: React.FC<{ onClose: () => void; onPick: (idea: Idea) => void }> = ({ onClose, onPick }) => {
  const [theme, setTheme] = useState('');
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await aiIdeas(theme.trim());
    setBusy(false);
    if (error || !data) setError(error);
    else setIdeas(data.ideas);
  };

  return (
    <Dialog title="Post ideas" onClose={onClose} busy={busy} testId="blog-ideas" wide>
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="ideas-theme" className="sr-only">Theme (optional)</label>
        <input id="ideas-theme" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={200} placeholder="A theme, e.g. NRI marriages, meeting the family (optional)" className={field} />
        <button type="submit" disabled={busy} className={`${primary} flex-none`}>{busy ? <Spinner /> : ideas ? 'More ideas' : 'Suggest'}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {ideas && (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-zinc-800" aria-label="Ideas">
          {ideas.map((idea) => (
            <li key={idea.title} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{idea.title}</p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">{idea.angle}</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">Search phrase: {idea.keyword}</p>
              </div>
              <button type="button" onClick={() => onPick(idea)} className={`${secondary} flex-none h-8 text-xs`}>
                Write this<span className="sr-only">: {idea.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!ideas && !busy && !error && (
        <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400">Gemini suggests posts that answer what people search for. Pick one to draft it.</p>
      )}
    </Dialog>
  );
};

// ---- A whole draft -------------------------------------------------------------

const TONES = ['Warm and practical', 'Friendly and light', 'Expert and reassuring', 'Story-led'];
const LENGTHS: { id: NonNullable<DraftRequest['length']>; label: string }[] = [
  { id: 'short', label: 'Short (600–800 words)' },
  { id: 'medium', label: 'Medium (1,000–1,300 words)' },
  { id: 'long', label: 'Long (1,600–2,000 words)' },
];

export const DraftDialog: React.FC<{ initial?: Partial<DraftRequest>; replaces: boolean; onClose: () => void; onDraft: (d: AiDraft) => void }> = ({
  initial, replaces, onClose, onDraft,
}) => {
  const [req, setReq] = useState<DraftRequest>({ topic: '', keyword: '', audience: '', tone: TONES[0], length: 'medium', notes: '', ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof DraftRequest>(k: K, v: DraftRequest[K]) => setReq((r) => ({ ...r, [k]: v }));

  const go = async () => {
    if (req.topic.trim().length < 3) return;
    if (replaces && !window.confirm('Replace what is in the editor with the AI draft?')) return;
    setBusy(true);
    setError(null);
    const { data, error } = await aiDraft(req);
    setBusy(false);
    if (error || !data) setError(error);
    else onDraft(data.post);
  };

  return (
    <Dialog
      title="Write with AI"
      onClose={onClose}
      busy={busy}
      testId="blog-draft-ai"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondary}>Cancel</button>
          <button type="button" onClick={go} disabled={busy || req.topic.trim().length < 3} className={primary}>
            {busy ? <><Spinner /> Writing… (up to a minute)</> : 'Write the draft'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="ai-topic" className={labelClass}>What is the post about?</label>
          <input id="ai-topic" value={req.topic} onChange={(e) => set('topic', e.target.value)} maxLength={300} placeholder="e.g. Questions to ask before saying yes to an arranged marriage" className={field} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ai-keyword" className={labelClass}>Search phrase (what people type into Google)</label>
            <input id="ai-keyword" value={req.keyword} onChange={(e) => set('keyword', e.target.value)} maxLength={100} placeholder="questions to ask before marriage" className={field} />
          </div>
          <div>
            <label htmlFor="ai-audience" className={labelClass}>Written for (optional)</label>
            <input id="ai-audience" value={req.audience} onChange={(e) => set('audience', e.target.value)} maxLength={200} placeholder="e.g. parents looking for their son" className={field} />
          </div>
          <div>
            <label htmlFor="ai-tone" className={labelClass}>Tone</label>
            <select id="ai-tone" value={req.tone} onChange={(e) => set('tone', e.target.value)} className={field}>
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ai-length" className={labelClass}>Length</label>
            <select id="ai-length" value={req.length} onChange={(e) => set('length', e.target.value as DraftRequest['length'])} className={field}>
              {LENGTHS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="ai-notes" className={labelClass}>Points to include (optional)</label>
          <textarea id="ai-notes" value={req.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} rows={3} className={field} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
          Gemini writes the post, its title, address, excerpt, search fields and tags. Read it through before publishing:
          check every fact, and make it sound like Shaadi24.
        </p>
      </div>
    </Dialog>
  );
};
