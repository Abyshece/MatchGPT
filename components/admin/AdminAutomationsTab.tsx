import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  AUTOMATION_INFO, TARGETS, fetchAutomations, runAutomation, saveAutomation, type Automation, type MessageTarget,
} from '../../lib/adminGrowth';
import { Dialog, Spinner, field, labelClass } from './BlogAiDialogs';
import { MessagePreview } from './MessageComposer';
import { ago } from './adminUi';

// ============================================================================
// Admin → Automatic messages: messages from the team that send themselves,
// in the app and as a notification (to members who left notifications on),
// every hour between 9 in the morning and 9 at night India time (one a day
// at most to any member): a welcome,
// a nudge for a photo, for an unfinished profile and to get verified, and to
// members not seen for a week or a month. Each can be turned on or off and
// reworded, shows who it's for and how many are due now, and how many got,
// saw and tapped it. "Send now" sends to those due, at any hour.
// ============================================================================

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

const Switch: React.FC<{ on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }> = ({ on, label, onChange, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className={`relative inline-flex h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300 dark:bg-zinc-600'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
  </button>
);

const Editor: React.FC<{ automation: Automation; onClose: () => void; onSaved: () => void }> = ({ automation, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [a, setA] = useState(automation);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Automation>(k: K, v: Automation[K]) => setA((x) => ({ ...x, [k]: v }));
  const ready = a.title.trim() && a.body.trim() && (!a.cta_target || a.cta_label?.trim());

  const save = async () => {
    setBusy(true);
    const { error } = await saveAutomation(a);
    setBusy(false);
    if (error) showToast(error, 'error');
    else { showToast('Saved', 'success'); onSaved(); }
  };

  return (
    <Dialog title={AUTOMATION_INFO[a.id].name} onClose={onClose} busy={busy} testId="automation-editor" wide
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-medium">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !ready} className="h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
            {busy ? <Spinner /> : 'Save'}
          </button>
        </>
      )}>
      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-zinc-400">{AUTOMATION_INFO[a.id].who}</p>
          <div>
            <label htmlFor="auto-title" className={labelClass}>Title</label>
            <input id="auto-title" value={a.title} maxLength={80} onChange={(e) => set('title', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="auto-body" className={labelClass}>Message</label>
            <textarea id="auto-body" value={a.body} maxLength={400} rows={4} onChange={(e) => set('body', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="auto-target" className={labelClass}>Button opens</label>
            <select id="auto-target" value={a.cta_target ?? ''} onChange={(e) => set('cta_target', (e.target.value || null) as MessageTarget | null)} className={field}>
              {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {a.cta_target && (
            <div>
              <label htmlFor="auto-cta" className={labelClass}>Button text</label>
              <input id="auto-cta" value={a.cta_label ?? ''} maxLength={40} onChange={(e) => set('cta_label', e.target.value)} className={field} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
            <input type="checkbox" checked={a.push} onChange={(e) => set('push', e.target.checked)} />
            Also send it as a notification
          </label>
        </div>
        <div>
          <p className={labelClass}>How it looks in the app</p>
          <MessagePreview title={a.title} body={a.body} ctaLabel={a.cta_target ? a.cta_label : null} />
        </div>
      </div>
    </Dialog>
  );
};

const AdminAutomationsTab: React.FC = () => {
  const { showToast } = useToast();
  const [list, setList] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { automations, error } = await fetchAutomations();
    if (error) showToast(`Couldn't load: ${error}`, 'error');
    setList(automations);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (a: Automation, on: boolean) => {
    setBusy(a.id);
    const { error } = await saveAutomation({ ...a, enabled: on });
    setBusy(null);
    if (error) showToast(error, 'error');
    else { showToast(on ? `${AUTOMATION_INFO[a.id].name} is on` : `${AUTOMATION_INFO[a.id].name} is off`, 'success'); void load(); }
  };

  const sendNow = async (a: Automation) => {
    if (!window.confirm(`Send "${a.title}" now to the ${a.waiting} member${a.waiting === 1 ? '' : 's'} it's due for?`)) return;
    setBusy(a.id);
    const { sent, error } = await runAutomation(a.id);
    setBusy(null);
    if (error) showToast(error, 'error');
    else { showToast(`Sent to ${sent} member${sent === 1 ? '' : 's'}`, 'success'); void load(); }
  };

  if (!list) return <div className="h-64 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;

  return (
    <div className="space-y-3" data-testid="admin-automations">
      <p className="text-sm text-gray-500 dark:text-zinc-400">
        They send themselves every hour, between 9 in the morning and 9 at night India time, each only when it's due, and one a day at most to any member.
      </p>
      {list.map((a) => (
        <article key={a.id} className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="automation" data-id={a.id}>
          <div className="flex items-start gap-4">
            <Switch on={a.enabled} label={`${AUTOMATION_INFO[a.id].name}: ${a.enabled ? 'on' : 'off'}`} disabled={busy === a.id} onChange={(on) => toggle(a, on)} />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{AUTOMATION_INFO[a.id].name}</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">{AUTOMATION_INFO[a.id].who}</p>
              <p className="mt-2 text-sm text-gray-800 dark:text-zinc-200"><span className="font-medium">{a.title}</span> — {a.body}</p>
              <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400 tabular-nums" data-testid="automation-stats">
                {a.waiting} due now · {a.sent} sent ({a.sent_7} this week) · seen {pct(a.seen, a.sent)} · tapped {pct(a.clicked, a.sent)}
                {a.last_sent ? ` · last ${ago(a.last_sent)}` : ''}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-none">
              <button type="button" onClick={() => setEditing(a)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">
                Edit<span className="sr-only"> {AUTOMATION_INFO[a.id].name}</span>
              </button>
              <button type="button" onClick={() => sendNow(a)} disabled={!a.enabled || a.waiting === 0 || busy === a.id}
                className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40">
                Send now<span className="sr-only"> {AUTOMATION_INFO[a.id].name}</span>
              </button>
            </div>
          </div>
        </article>
      ))}
      {editing && <Editor automation={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
};

export default AdminAutomationsTab;
