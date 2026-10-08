import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { BLANK_POST, BLOG_URL, fetchAllPosts, formatDate, isLive, postState, type AdminPost, type PostDraft } from '../../lib/blog';
import { IdeasDialog } from './BlogAiDialogs';
import BlogEditor from './BlogEditor';

// ============================================================================
// Admin → Blog: every post (drafts, scheduled and published, with visits),
// "New post", and "Ideas" from AI; a post opens in the editor (BlogEditor).
// The website shows published posts at /blog.
// ============================================================================

type Filter = 'all' | 'Draft' | 'Scheduled' | 'Published';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'Published', label: 'Published' }, { id: 'Scheduled', label: 'Scheduled' }, { id: 'Draft', label: 'Drafts' },
];

const STATE_STYLE: Record<string, string> = {
  Published: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Draft: 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const AdminBlogTab: React.FC = () => {
  const { showToast } = useToast();
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ post: PostDraft; ai: { topic: string; keyword: string } | null } | null>(null);
  const [ideas, setIdeas] = useState(false);

  const load = useCallback(async () => {
    const { posts, error } = await fetchAllPosts();
    if (error) showToast(`Couldn't load posts: ${error}`, 'error');
    setPosts(posts);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  if (editing) {
    return (
      <BlogEditor
        key={editing.post.id ?? 'new'}
        initial={editing.post}
        startWithAi={editing.ai}
        onBack={() => setEditing(null)}
        onSaved={() => void load()}
      />
    );
  }

  const shown = (posts ?? []).filter((p) => filter === 'all' || postState(p) === filter);
  const count = (f: Filter) => (posts ?? []).filter((p) => f === 'all' || postState(p) === f).length;

  return (
    <div className="space-y-4" data-testid="admin-blog">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`h-8 px-3 rounded-md text-sm ${filter === f.id ? 'bg-gray-200/70 dark:bg-zinc-700/60 font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
              {f.label} <span className="tabular-nums text-gray-500 dark:text-zinc-400">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <a href={BLOG_URL} target="_blank" rel="noopener noreferrer" className="h-9 px-3 inline-flex items-center rounded-md text-sm text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800">View blog ↗</a>
          <button type="button" onClick={() => setIdeas(true)} className="h-9 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">✨ Ideas</button>
          <button type="button" onClick={() => setEditing({ post: { ...BLANK_POST }, ai: null })} className="h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold">New post</button>
        </div>
      </div>

      {!posts ? (
        <div className="h-48 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-10 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{posts.length ? 'No posts here' : 'No posts yet'}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">Write one yourself, or start from an AI idea.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-800">
          <table className="w-full text-sm" data-testid="blog-posts">
            <thead className="bg-gray-50 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="text-left font-medium px-4 py-2">Title</th>
                <th scope="col" className="text-left font-medium px-3 py-2">Status</th>
                <th scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">Date</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Visits</th>
                <th scope="col" className="text-left font-medium px-3 py-2 whitespace-nowrap">Last edited</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const state = postState(p);
                return (
                  <tr key={p.id} className="border-t border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900">
                    <th scope="row" className="text-left font-normal px-4 py-3">
                      <button type="button" onClick={() => setEditing({ post: p, ai: null })} className="text-left">
                        <span className="block font-medium text-gray-900 dark:text-white hover:underline">{p.title}</span>
                        <span className="block text-xs text-gray-500 dark:text-zinc-400">/blog/{p.slug}{p.ai_assisted ? ' · AI-assisted' : ''}</span>
                      </button>
                    </th>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLE[state]}`}>{state}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-600 dark:text-zinc-300">{p.published_at ? formatDate(p.published_at) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{isLive(p) ? p.views.toLocaleString() : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-500 dark:text-zinc-400">{formatDate(p.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ideas && (
        <IdeasDialog
          onClose={() => setIdeas(false)}
          onPick={(idea) => { setIdeas(false); setEditing({ post: { ...BLANK_POST }, ai: { topic: idea.title, keyword: idea.keyword } }); }}
        />
      )}
    </div>
  );
};

export default AdminBlogTab;
