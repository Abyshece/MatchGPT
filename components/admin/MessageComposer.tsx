import React, { useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  AUDIENCES, TARGETS, audienceLabel, countAudience, sendMessage,
  type Audience, type MessageDraft, type MessageTarget,
} from '../../lib/adminGrowth';
import { BrandMark, IconX } from '../../constants';

// ============================================================================
// Writing an in-app message to a group of members (Admin → Messages, and
// Admin → Profiles' "Message them"): who it goes to (and how many that is
// now), the title, the text, the button and where it goes in the app, and
// whether it's also a notification. A preview shows it as members see it.
// ============================================================================

const sameAudience = (a: Audience, b: Audience) => JSON.stringify(a) === JSON.stringify(b);
const field = 'w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600';
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-zinc-300 mb-1';

/** How a member sees a message in the app (MemberMessages uses the same) */
export const MessagePreview: React.FC<{ title: string; body: string; ctaLabel?: string | null }> = ({ title, body, ctaLabel }) => (
  <div className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-sm">
    <div className="flex items-start gap-3">
      <BrandMark className="w-6 h-6 flex-none" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title || 'Title'}</p>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-zinc-300 whitespace-pre-line">{body || 'Your message'}</p>
        <div className="mt-3 flex gap-2">
          {ctaLabel && <span className="rounded-full plus-solid px-3 py-1.5 text-xs font-semibold">{ctaLabel}</span>}
          <span className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400">Not now</span>
        </div>
      </div>
    </div>
  </div>
);

const MessageComposer: React.FC<{ initial: MessageDraft; onClose: () => void; onSent: () => void }> = ({ initial, onClose, onSent }) => {
  const { showToast } = useToast();
  const [d, setD] = useState<MessageDraft>(initial);
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof MessageDraft>(k: K, v: MessageDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  // How many it reaches, again whenever the group changes
  useEffect(() => {
    let live = true;
    setCount(null);
    void countAudience(d.audience).then(({ count }) => { if (live) setCount(count); });
    return () => { live = false; };
  }, [d.audience]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const ready = d.title.trim() && d.body.trim() && (!d.target || d.ctaLabel.trim()) && (count ?? 0) > 0;

  const send = async () => {
    if (!ready || !window.confirm(`Send "${d.title.trim()}" to ${count} member${count === 1 ? '' : 's'}?`)) return;
    setSending(true);
    const { recipients, error } = await sendMessage(d);
    setSending(false);
    if (error) {
      showToast(`Couldn't send: ${error}`, 'error');
      return;
    }
    showToast(`Sent to ${recipients} member${recipients === 1 ? '' : 's'}`, 'success');
    onSent();
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4 popup-backdrop animate-fade-in" onClick={() => !sending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        data-testid="message-composer"
        className="w-full max-w-2xl max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
          <h2 id="composer-title" className="text-base font-semibold text-gray-900 dark:text-white">New in-app message</h2>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 [&>svg]:w-4 [&>svg]:h-4"><IconX /></button>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 p-5">
          <div className="space-y-4">
            <div>
              <label htmlFor="msg-audience" className={labelClass}>Send to</label>
              <select
                id="msg-audience"
                value={AUDIENCES.findIndex((a) => sameAudience(a, d.audience))}
                onChange={(e) => set('audience', AUDIENCES[Number(e.target.value)])}
                className={field}
              >
                {AUDIENCES.map((a, i) => <option key={audienceLabel(a)} value={i}>{audienceLabel(a)}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400" data-testid="audience-count">
                {count === null ? 'Counting…' : `Reaches ${count.toLocaleString()} member${count === 1 ? '' : 's'}`}
              </p>
            </div>
            <div>
              <label htmlFor="msg-title" className={labelClass}>Title</label>
              <input id="msg-title" value={d.title} maxLength={80} onChange={(e) => set('title', e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="msg-body" className={labelClass}>Message</label>
              <textarea id="msg-body" value={d.body} maxLength={400} rows={4} onChange={(e) => set('body', e.target.value)} className={field} />
              <p className="mt-1 text-[11px] text-gray-500 dark:text-zinc-400 text-right">{d.body.length}/400</p>
            </div>
            <div>
              <label htmlFor="msg-target" className={labelClass}>Button opens</label>
              <select id="msg-target" value={d.target} onChange={(e) => set('target', e.target.value as MessageTarget)} className={field}>
                {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {d.target && (
              <div>
                <label htmlFor="msg-cta" className={labelClass}>Button text</label>
                <input id="msg-cta" value={d.ctaLabel} maxLength={40} onChange={(e) => set('ctaLabel', e.target.value)} className={field} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
              <input type="checkbox" checked={d.push} onChange={(e) => set('push', e.target.checked)} className="rounded" />
              Also send it as a notification
            </label>
          </div>

          <div>
            <p className={labelClass}>How it looks in the app</p>
            <MessagePreview title={d.title} body={d.body} ctaLabel={d.target ? d.ctaLabel : null} />
            <p className="mt-3 text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
              It shows the next time they open Shaadi24, until they tap the button or “Not now”.
              {d.push && ' The notification goes to the phones and browsers they allowed notifications on.'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
          <button type="button" onClick={onClose} disabled={sending} className="h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Cancel</button>
          <button type="button" onClick={send} disabled={!ready || sending} className="h-9 px-4 rounded-md plus-solid text-sm font-semibold disabled:opacity-40">
            {sending ? 'Sending…' : count ? `Send to ${count.toLocaleString()}` : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageComposer;
