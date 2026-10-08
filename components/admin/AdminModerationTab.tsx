import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  FIELD_LABELS, REJECT_REASONS, fetchModerationQueue, fingerprintAndSave, moderate, setReviewBeforeShowing,
  type ModerationItem, type ModerationQueue, type ModerationStatus,
} from '../../lib/adminSafety';
import { Dialog } from './BlogAiDialogs';
import { MemberPanelById } from './MemberPanel';
import { Pill, ago } from './adminUi';

// ============================================================================
// Admin → Moderation: photos members add and what they write about themselves
// and their family, oldest first. With "Approve before others see it" on, it
// stays hidden from other members until approved; off, it shows at once and
// is reviewed here afterwards. "Not approved" takes the photo off the
// profile, or puts the text back as it was, and tells the member why.
// The photos here are fingerprinted (lib/photoFingerprint.ts), so the same
// photo on another account shows.
// ============================================================================

const TABS: { id: ModerationStatus; label: string }[] = [
  { id: 'pending', label: 'Waiting' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Not approved' },
];

const btn = 'h-8 px-3 rounded-md text-xs font-medium disabled:opacity-40';
const approveBtn = `${btn} bg-green-600 text-white hover:bg-green-700`;
const rejectBtn = `${btn} border border-gray-200 dark:border-zinc-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`;

const RejectDialog: React.FC<{ count: number; onCancel: () => void; onConfirm: (reason: string) => void }> = ({ count, onCancel, onConfirm }) => {
  const [choice, setChoice] = useState(REJECT_REASONS[0]);
  const [other, setOther] = useState('');
  const reason = choice === 'other' ? other.trim() : choice;
  return (
    <Dialog
      title={count === 1 ? 'Not approved' : `Not approved (${count})`}
      onClose={onCancel}
      testId="reject-dialog"
      footer={(
        <>
          <button type="button" onClick={onCancel} className="h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => onConfirm(reason)} disabled={reason.length < 5} className="h-9 px-4 rounded-md bg-red-600 text-white text-sm font-semibold disabled:opacity-40">Not approved</button>
        </>
      )}
    >
      <fieldset>
        <legend className="text-sm text-gray-700 dark:text-zinc-300 mb-3">The member reads this, with a button to their profile:</legend>
        <div className="space-y-2">
          {[...REJECT_REASONS, 'other'].map((r) => (
            <label key={r} className="flex items-start gap-2 text-sm text-gray-800 dark:text-zinc-200">
              <input type="radio" name="reject-reason" checked={choice === r} onChange={() => setChoice(r)} className="mt-1" />
              <span>{r === 'other' ? 'Something else' : r}</span>
            </label>
          ))}
        </div>
        {choice === 'other' && (
          <>
            <label htmlFor="reject-other" className="sr-only">The reason</label>
            <textarea id="reject-other" value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} rows={3} autoFocus
              className="mt-3 w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" placeholder="Why it isn't approved" />
          </>
        )}
      </fieldset>
    </Dialog>
  );
};

const MemberLine: React.FC<{ item: ModerationItem; onOpen: () => void }> = ({ item, onOpen }) => (
  <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-zinc-300">
    <button type="button" onClick={onOpen} className="font-medium text-gray-900 dark:text-white hover:underline">
      {item.name ?? 'Member'}{item.age ? `, ${item.age}` : ''}
    </button>
    {item.place && <span>· {item.place}</span>}
    <span>· joined {ago(item.account_created)}</span>
    {item.is_verified && <Pill tone="green">Verified</Pill>}
    {item.is_banned && <Pill tone="red">Banned</Pill>}
    {item.reports > 0 && <Pill tone="red">Reported {item.reports}×</Pill>}
  </div>
);

const ItemCard: React.FC<{
  item: ModerationItem; selected: boolean; busy: boolean; pending: boolean;
  onSelect: (on: boolean) => void; onApprove: () => void; onReject: () => void; onOpen: () => void;
}> = ({ item, selected, busy, pending, onSelect, onApprove, onReject, onOpen }) => (
  <article data-testid="moderation-item" data-field={item.field}
    className={`rounded-lg border ${selected ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-zinc-800'} overflow-hidden flex flex-col`}>
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-zinc-300">
        {pending && <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${FIELD_LABELS[item.field]} of ${item.name ?? 'member'}`} />}
        {FIELD_LABELS[item.field]}
      </label>
      <span className="text-[11px] text-gray-500 dark:text-zinc-400">{ago(item.created_at)}</span>
    </div>

    {item.field === 'photo' ? (
      <a href={item.value} target="_blank" rel="noopener noreferrer" className="block bg-gray-50 dark:bg-zinc-900">
        <img src={item.value} alt={`Photo added by ${item.name ?? 'a member'}`} loading="lazy" className="w-full aspect-[4/5] object-cover" />
      </a>
    ) : (
      <div className="px-3 py-3 text-sm space-y-2">
        <p className="whitespace-pre-wrap text-gray-900 dark:text-white">{item.value}</p>
        {item.prev_value && (
          <p className="text-xs text-gray-500 dark:text-zinc-400"><span className="font-medium">Before:</span> <span className="whitespace-pre-wrap">{item.prev_value}</span></p>
        )}
      </div>
    )}

    <div className="px-3 py-2 space-y-2 mt-auto">
      {(item.flags.length > 0 || (item.same_photo_as?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1">
          {item.flags.map((f) => <Pill key={f} tone={f === 'first photo' ? 'blue' : 'amber'}>{f === 'first photo' ? 'First photo' : `Has ${f}`}</Pill>)}
          {item.same_photo_as?.map((o) => (
            <Pill key={o.user_id} tone="red">Same photo as {o.name ?? 'another member'}{o.is_banned ? ' (banned)' : ''}</Pill>
          ))}
        </div>
      )}
      <MemberLine item={item} onOpen={onOpen} />
      {pending ? (
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onApprove} className={approveBtn}>Approve</button>
          <button type="button" disabled={busy} onClick={onReject} className={rejectBtn}>Not approved</button>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-zinc-400">
          {item.status === 'approved' ? 'Approved' : `Not approved: “${item.reason}”`}
          {item.reviewed_by_email ? ` by ${item.reviewed_by_email}` : ''} · {ago(item.reviewed_at)}
        </p>
      )}
    </div>
  </article>
);

const AdminModerationTab: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<ModerationStatus>('pending');
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<string[] | null>(null);
  const [member, setMember] = useState<string | null>(null);

  const load = useCallback(async (status: ModerationStatus) => {
    const { queue, error } = await fetchModerationQueue(status);
    if (error) showToast(`Couldn't load: ${error}`, 'error');
    setQueue(queue);
    return queue;
  }, [showToast]);

  // Load, then fingerprint the photos not done yet and load again to show any same photos
  useEffect(() => {
    let live = true;
    setSelected(new Set());
    void load(tab).then(async (q) => {
      const urls = (q?.items ?? []).filter((i) => i.field === 'photo' && !i.fingerprinted && i.status === 'pending').map((i) => i.value);
      if (!urls.length || !live) return;
      const { saved } = await fingerprintAndSave(urls);
      if (saved && live) void load(tab);
    });
    return () => { live = false; };
  }, [tab, load]);

  const decide = async (ids: string[], approve: boolean, reason?: string) => {
    setBusy(true);
    const { done, error } = await moderate(ids, approve, reason);
    setBusy(false);
    setRejecting(null);
    if (error) {
      showToast(error, 'error');
      return;
    }
    showToast(approve ? `Approved ${done}` : `${done} not approved; the member${done === 1 ? ' was' : 's were'} told why`, 'success');
    setSelected(new Set());
    void load(tab);
    onChanged?.();
  };

  const toggleMode = async () => {
    if (!queue) return;
    const on = !queue.review_before_showing;
    if (!on && !window.confirm('Show new photos and text to members at once, and review them here afterwards?')) return;
    const { error } = await setReviewBeforeShowing(on);
    if (error) showToast(error, 'error');
    else {
      showToast(on ? 'New photos and text now wait for approval' : 'New photos and text now show at once', 'success');
      void load(tab);
    }
  };

  const items = queue?.items ?? [];
  const pending = tab === 'pending';
  const allSelected = pending && items.length > 0 && items.every((i) => selected.has(i.id));

  return (
    <div className="space-y-4" data-testid="admin-moderation">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-zinc-800 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Approve before others see it</p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
            {queue?.review_before_showing ?? true
              ? 'New photos stay hidden, and changed text shows as it was, until approved.'
              : 'New photos and text show at once; review them here afterwards.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={queue?.review_before_showing ?? true}
          aria-label="Approve before others see it"
          data-testid="review-before-showing"
          onClick={toggleMode}
          disabled={!queue}
          className={`relative inline-flex h-6 w-11 flex-none rounded-full transition-colors ${queue?.review_before_showing ?? true ? 'bg-green-600' : 'bg-gray-300 dark:bg-zinc-600'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${queue?.review_before_showing ?? true ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Show">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}
              className={`h-8 px-3 rounded-md text-sm ${tab === t.id ? 'bg-gray-200/70 dark:bg-zinc-700/60 font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
              {t.label}{t.id === 'pending' && queue ? <span className="ml-1 tabular-nums text-gray-500 dark:text-zinc-400">{queue.pending}</span> : null}
            </button>
          ))}
        </div>
        {pending && items.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
              <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />
              Select all
            </label>
            <button type="button" disabled={busy || !selected.size} onClick={() => decide([...selected], true)} className={approveBtn}>Approve {selected.size || ''}</button>
            <button type="button" disabled={busy || !selected.size} onClick={() => setRejecting([...selected])} className={rejectBtn}>Not approved {selected.size || ''}</button>
          </div>
        )}
      </div>

      {!queue ? (
        <div className="h-64 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-10 text-center" data-testid="moderation-empty">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{pending ? 'Nothing waiting' : 'Nothing here yet'}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{pending ? 'New photos and text show up here as members add them.' : ''}</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              pending={pending}
              busy={busy}
              selected={selected.has(item.id)}
              onSelect={(on) => setSelected((s) => { const n = new Set(s); if (on) n.add(item.id); else n.delete(item.id); return n; })}
              onApprove={() => decide([item.id], true)}
              onReject={() => setRejecting([item.id])}
              onOpen={() => setMember(item.user_id)}
            />
          ))}
        </div>
      )}

      {rejecting && <RejectDialog count={rejecting.length} onCancel={() => setRejecting(null)} onConfirm={(reason) => decide(rejecting, false, reason)} />}
      {member && <MemberPanelById userId={member} onClose={() => setMember(null)} onChanged={() => void load(tab)} />}
    </div>
  );
};

export default AdminModerationTab;
