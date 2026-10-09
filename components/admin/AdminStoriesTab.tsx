import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { BLANK_STORY, deleteStory, fetchStories, saveStory, uploadStoryPhoto, type Story, type StoryDraft } from '../../lib/adminInsights';
import { Dialog, Spinner, field, labelClass } from './BlogAiDialogs';
import { Pill } from './adminUi';
import { BrandMark } from '../../constants';

// ============================================================================
// Admin → Success stories: couples who met on Shaadi24, for the website's
// home page and /stories. A story is published only once both partners have
// agreed (written down in "How they agreed"), and can be taken down at any
// time. Couples can send theirs through the contact form ("Our success
// story").
// ============================================================================

const formatDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const StoryEditor: React.FC<{ initial: StoryDraft; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [d, setD] = useState<StoryDraft>(initial);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof StoryDraft>(k: K, v: StoryDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const { url, error } = await uploadStoryPhoto(file);
    setBusy(false);
    if (error || !url) showToast(`Couldn't upload: ${error}`, 'error');
    else set('photo_url', url);
  };

  const save = async () => {
    setBusy(true);
    const { error } = await saveStory(d);
    setBusy(false);
    if (error) {
      showToast(error, 'error');
      return;
    }
    showToast(d.published ? 'Story published' : 'Story saved', 'success');
    onSaved();
  };

  return (
    <Dialog
      title={d.id ? 'Edit story' : 'New story'}
      onClose={onClose}
      busy={busy}
      testId="story-editor"
      wide
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
            {busy ? <Spinner /> : 'Save'}
          </button>
        </>
      )}
    >
      <div className="grid sm:grid-cols-[1fr_180px] gap-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="story-names" className={labelClass}>The couple</label>
            <input id="story-names" value={d.names} onChange={(e) => set('names', e.target.value)} maxLength={80} placeholder="Priya & Arjun" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="story-place" className={labelClass}>Where</label>
              <input id="story-place" value={d.place} onChange={(e) => set('place', e.target.value)} maxLength={80} placeholder="Pune" className={field} />
            </div>
            <div>
              <label htmlFor="story-date" className={labelClass}>Married on</label>
              <input id="story-date" type="date" value={d.married_on ?? ''} onChange={(e) => set('married_on', e.target.value || null)} className={field} />
            </div>
          </div>
          <div>
            <div className="flex justify-between"><label htmlFor="story-text" className={labelClass}>Their story</label><span className="text-[11px] text-gray-500 dark:text-zinc-400 tabular-nums">{d.story.length}/1500</span></div>
            <textarea id="story-text" value={d.story} onChange={(e) => set('story', e.target.value)} maxLength={1500} rows={6} className={field}
              placeholder="How they met on Shaadi24, in their words." />
          </div>
          <div>
            <label htmlFor="story-consent" className={labelClass}>How both of them agreed to be shown</label>
            <input id="story-consent" value={d.consent_note} onChange={(e) => set('consent_note', e.target.value)} maxLength={300}
              placeholder="e.g. Both agreed by email to support@… on 3 Oct 2026" className={field} />
            <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400">Needed before publishing: their names, photo and story are shown to everyone.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-zinc-200">
            <input type="checkbox" checked={d.published} onChange={(e) => set('published', e.target.checked)} />
            Show it on the website
          </label>
        </div>
        <div className="space-y-3">
          <p className={labelClass}>Photo</p>
          {d.photo_url ? (
            <div className="relative">
              <img src={d.photo_url} alt={d.photo_alt} className="w-full aspect-square object-cover rounded-md" />
              <button type="button" onClick={() => set('photo_url', null)} className="absolute top-1.5 right-1.5 h-7 px-2 rounded-md bg-white/90 dark:bg-zinc-900/90 text-xs font-medium">Remove</button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}
              className="w-full aspect-square rounded-md border border-dashed border-gray-300 dark:border-zinc-700 text-xs text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800">
              Upload a photo
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Story photo"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void upload(f); }} />
          <div>
            <label htmlFor="story-alt" className={labelClass}>Photo description</label>
            <input id="story-alt" value={d.photo_alt} onChange={(e) => set('photo_alt', e.target.value)} maxLength={200} placeholder="Priya and Arjun at their wedding" className={field} />
          </div>
        </div>
      </div>
    </Dialog>
  );
};

const AdminStoriesTab: React.FC = () => {
  const { showToast } = useToast();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [editing, setEditing] = useState<StoryDraft | null>(null);

  const load = useCallback(async () => {
    const { stories, error } = await fetchStories();
    if (error) showToast(`Couldn't load stories: ${error}`, 'error');
    setStories(stories);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (s: Story) => {
    if (!window.confirm(`Delete the story of ${s.names}?`)) return;
    const { error } = await deleteStory(s.id);
    if (error) showToast(error, 'error');
    else { showToast('Story deleted', 'success'); void load(); }
  };

  return (
    <div className="space-y-4" data-testid="admin-stories">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-zinc-400">Published stories show on the website’s home page and at /stories.</p>
        <div className="flex gap-2">
          <a href="/stories" target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center rounded-md text-sm text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800">View on the website ↗</a>
          <button type="button" onClick={() => setEditing({ ...BLANK_STORY })} className="h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold">New story</button>
        </div>
      </div>

      {!stories ? (
        <div className="h-40 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : stories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-10 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">No stories yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">When a couple tells you they met on Shaadi24, ask if you may share their story.</p>
        </div>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="stories-list">
          {stories.map((s) => (
            <li key={s.id} className="rounded-lg border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col" data-testid="story-card">
              {s.photo_url ? <img src={s.photo_url} alt={s.photo_alt} className="w-full aspect-[4/3] object-cover" loading="lazy" />
                : <div className="w-full aspect-[4/3] flex items-center justify-center bg-gray-50 dark:bg-zinc-900" aria-hidden="true"><BrandMark className="w-10 h-10" /></div>}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{s.names}</p>
                  {s.published ? <Pill tone="green">Published</Pill> : <Pill>Not shown</Pill>}
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{[s.place, formatDate(s.married_on)].filter(Boolean).join(' · ')}</p>
                <p className="mt-2 text-sm text-gray-700 dark:text-zinc-300 line-clamp-3">{s.story}</p>
                <div className="mt-auto pt-3 flex gap-2">
                  <button type="button" onClick={() => setEditing(s)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Edit<span className="sr-only"> {s.names}</span></button>
                  <button type="button" onClick={() => remove(s)} className="h-8 px-3 rounded-md text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">Delete<span className="sr-only"> {s.names}</span></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <StoryEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
};

export default AdminStoriesTab;
