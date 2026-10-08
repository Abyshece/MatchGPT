import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { fetchEnquiries, topicLabel, updateEnquiry, type Enquiry } from '../../lib/adminGrowth';

// ============================================================================
// Admin → Enquiries: what people sent with the website's contact form
// (lib/adminGrowth.ts). New ones first; each can be answered by email (the
// reply opens in the admin's email app, quoting the enquiry), noted, and
// closed or reopened. Every change is in the audit log.
// ============================================================================

const STATUS_TONE: Record<Enquiry['status'], string> = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  open: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  closed: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
};

function replyLink(e: Enquiry): string {
  const subject = `Re: ${topicLabel(e.topic)} (Shaadi24)`;
  const quoted = e.message.split('\n').map((l) => `> ${l}`).join('\n');
  const body = `Hello ${e.name.split(' ')[0]},\n\n\n\n—\nShaadi24 support\n\nYou wrote on ${new Date(e.created_at).toLocaleDateString('en-GB')}:\n${quoted}`;
  return `mailto:${e.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const AdminEnquiriesTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { showToast } = useToast();
  const [view, setView] = useState<'open' | 'closed' | 'all'>('open');
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (v: 'open' | 'closed' | 'all') => {
    const { enquiries, error } = await fetchEnquiries(v);
    if (error) showToast(`Couldn't load enquiries: ${error}`, 'error');
    setEnquiries(enquiries);
  }, [showToast]);
  useEffect(() => { void load(view); }, [view, load]);

  const set = async (e: Enquiry, status: Enquiry['status']) => {
    const { error } = await updateEnquiry(e.id, status, notes[e.id]);
    if (error) {
      showToast(`Couldn't update: ${error}`, 'error');
      return;
    }
    showToast(status === 'closed' ? 'Closed' : status === 'open' ? 'Marked as being handled' : 'Reopened', 'success');
    void load(view);
    onChanged();
  };

  return (
    <div data-testid="admin-enquiries">
      <div className="flex gap-1.5 mb-4" role="group" aria-label="Show">
        {(['open', 'closed', 'all'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`h-7 px-3 rounded-full text-xs font-medium border ${
              view === v ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300'
            }`}
          >
            {v === 'open' ? 'To answer' : v === 'closed' ? 'Closed' : 'All'}
          </button>
        ))}
      </div>

      {enquiries === null ? (
        <div className="h-40 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : enquiries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">{view === 'open' ? 'Nothing to answer. The contact form is on the website’s Support page.' : 'No enquiries here.'}</p>
      ) : (
        <ul className="space-y-3">
          {enquiries.map((e) => (
            <li key={e.id} className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="enquiry">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{e.name} <span className="font-normal text-gray-500 dark:text-zinc-400">· {e.email}</span></p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">{topicLabel(e.topic)} · {new Date(e.created_at).toLocaleString()} · from the {e.source}</p>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[e.status]}`}>
                  {e.status === 'new' ? 'New' : e.status === 'open' ? 'Being handled' : 'Closed'}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-800 dark:text-zinc-200 whitespace-pre-line">{e.message}</p>
              <label className="block mt-3">
                <span className="sr-only">Notes</span>
                <input
                  value={notes[e.id] ?? e.admin_notes ?? ''}
                  onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                  placeholder="Notes for the team (saved with the next change)"
                  className="w-full h-9 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href={replyLink(e)}
                  onClick={() => { if (e.status === 'new') void set(e, 'open'); }}
                  className="h-8 px-3 inline-flex items-center rounded-md plus-solid text-xs font-semibold"
                >
                  Reply by email
                </a>
                {e.status !== 'closed' ? (
                  <button type="button" onClick={() => set(e, 'closed')} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Close</button>
                ) : (
                  <button type="button" onClick={() => set(e, 'open')} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Reopen</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminEnquiriesTab;
