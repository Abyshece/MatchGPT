import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { fetchSearchLimits, saveSearchLimits, type AdminPlanLimits, type AdminSearchLimits } from '../../lib/adminInsights';
import { weekResetText } from '../../lib/searchLimits';

// ============================================================================
// Admin → Search insights → Search limits: how many AI searches free accounts
// and Shaadi24+ get every few hours, a day and a week (lib/searchLimits.ts),
// with how many members searched this week and how many a limit stopped.
// Owners change the numbers; the rest of the team sees them. The week's start
// (Friday 6 pm India time) is in the Terms, so it isn't changed here.
// ============================================================================

type Key = 'per_window' | 'per_day' | 'per_week';
type Draft = { hours: string; free: Record<Key, string>; plus: Record<Key, string> };

const KEYS: Key[] = ['per_window', 'per_day', 'per_week'];
const MAX: Record<Key, number> = { per_window: 1000, per_day: 1000, per_week: 10000 };
const fmt = (n: number) => n.toLocaleString('en-IN');
const text = (n: number | null) => (n === null ? '' : String(n));
const toDraft = (l: AdminSearchLimits): Draft => ({
  hours: String(l.window_hours),
  free: { per_window: text(l.plans.free.per_window), per_day: text(l.plans.free.per_day), per_week: text(l.plans.free.per_week) },
  plus: { per_window: text(l.plans.plus.per_window), per_day: text(l.plans.plus.per_day), per_week: text(l.plans.plus.per_week) },
});

/** The draft as numbers, or what's wrong with it */
function read(d: Draft): { hours: number; free: AdminPlanLimits; plus: AdminPlanLimits } | string {
  const hours = Number(d.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) return 'The hours must be a whole number from 1 to 24.';
  const plan = (p: Record<Key, string>, name: string): AdminPlanLimits | string => {
    const out: AdminPlanLimits = { per_window: null, per_day: null, per_week: null };
    for (const k of KEYS) {
      const v = p[k].trim();
      if (v === '') continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > MAX[k]) return `${name}: each number must be a whole number from 1 to ${fmt(MAX[k])}, or empty for no limit.`;
      out[k] = n;
    }
    return out;
  };
  const free = plan(d.free, 'Free');
  if (typeof free === 'string') return free;
  const plus = plan(d.plus, 'Shaadi24+');
  if (typeof plus === 'string') return plus;
  for (const k of KEYS) {
    if (plus[k] !== null && (free[k] === null || plus[k]! < free[k]!)) return 'Shaadi24+ should get at least as many searches as free accounts.';
  }
  return { hours, free, plus };
}

const AdminSearchLimits: React.FC = () => {
  const { showToast } = useToast();
  const [limits, setLimits] = useState<AdminSearchLimits | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { limits, error } = await fetchSearchLimits();
    if (error) showToast(`Couldn't load the search limits: ${error}`, 'error');
    setLimits(limits);
    if (limits) setDraft(toDraft(limits));
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  if (!limits || !draft) return <div className="h-64 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;

  const edit = limits.can_edit;
  const parsed = read(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(toDraft(limits));
  const hours = typeof parsed === 'string' ? limits.window_hours : parsed.hours;
  const rows: { key: Key; label: string }[] = [
    { key: 'per_window', label: `Every ${hours} hours` },
    { key: 'per_day', label: 'A day' },
    { key: 'per_week', label: 'A week' },
  ];
  const set = (plan: 'free' | 'plus', key: Key, value: string) =>
    setDraft((d) => d && { ...d, [plan]: { ...d[plan], [key]: value } });

  const save = async () => {
    if (typeof parsed === 'string') return;
    setSaving(true);
    const error = await saveSearchLimits({ window_hours: parsed.hours, plans: { free: parsed.free, plus: parsed.plus } });
    setSaving(false);
    if (error) { showToast(`Couldn't save: ${error}`, 'error'); return; }
    showToast('Search limits saved. They apply to the next search.', 'success');
    void load();
  };

  const cell = (plan: 'free' | 'plus', key: Key, label: string) => edit ? (
    <input
      type="number" inputMode="numeric" min={1} max={MAX[key]} step={1}
      value={draft[plan][key]}
      onChange={(e) => set(plan, key, e.target.value)}
      placeholder="No limit"
      aria-label={`${plan === 'free' ? 'Free' : 'Shaadi24+'}: ${label}`}
      data-testid={`limit-${plan}-${key}`}
      className="w-24 h-8 px-2 rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right tabular-nums text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400"
    />
  ) : (
    <span className="tabular-nums" data-testid={`limit-${plan}-${key}`}>{limits.plans[plan][key] === null ? 'No limit' : fmt(limits.plans[plan][key]!)}</span>
  );

  const stopped = limits.limited_7d;
  return (
    <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="search-limits" aria-labelledby="limits-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="limits-title" className="text-sm font-semibold text-gray-900 dark:text-white">Search limits</h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400">
          {fmt(limits.searching_this_week)} {limits.searching_this_week === 1 ? 'member has' : 'members have'} searched this week
        </p>
      </div>
      <p className="text-xs text-gray-500 dark:text-zinc-400">
        Every AI search counts toward all three; a member can search while none is used up. The hours start with a
        member's first search after their last ones ended; the day starts at midnight, and the week on{' '}
        {weekResetText({ dow: limits.week_reset_dow, hour: limits.week_reset_hour })} (India time). Free accounts get one
        more a day for each profile section they complete (up to 6).{edit ? ' Leave a box empty for no limit.' : ''}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="text-sm">
          <thead className="text-gray-500 dark:text-zinc-400">
            <tr>
              <th scope="col" className="text-left font-medium pb-1 pr-6">Searches</th>
              <th scope="col" className="text-right font-medium pb-1 pr-6">Free</th>
              <th scope="col" className="text-right font-medium pb-1">Shaadi24+</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-gray-100 dark:border-zinc-800">
                <th scope="row" className="text-left font-normal py-1.5 pr-6 text-gray-900 dark:text-white whitespace-nowrap">{r.label}</th>
                <td className="text-right py-1.5 pr-6 text-gray-900 dark:text-white">{cell('free', r.key, r.label)}</td>
                <td className="text-right py-1.5 text-gray-900 dark:text-white">{cell('plus', r.key, r.label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
            Hours in the first limit
            <input
              type="number" inputMode="numeric" min={1} max={24} step={1}
              value={draft.hours}
              onChange={(e) => setDraft((d) => d && { ...d, hours: e.target.value })}
              data-testid="limit-hours"
              className="w-16 h-8 px-2 rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-right tabular-nums text-gray-900 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!changed || typeof parsed === 'string' || saving}
            data-testid="save-limits"
            className="h-8 px-3 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-medium disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
          >
            {saving ? 'Saving…' : 'Save limits'}
          </button>
          {changed && (
            <button type="button" onClick={() => setDraft(toDraft(limits))} className="h-8 px-2 text-sm text-gray-600 dark:text-zinc-300 hover:underline">
              Undo changes
            </button>
          )}
        </div>
      )}
      {edit && changed && typeof parsed === 'string' && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400" data-testid="limits-error">{parsed}</p>
      )}
      {!edit && <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">Only owners can change these.</p>}

      <p className="mt-3 text-sm text-gray-700 dark:text-zinc-300" data-testid="limits-stopped">
        {stopped.members === 0
          ? 'No one was stopped by a limit in the last 7 days.'
          : <>In the last 7 days a limit stopped <strong>{fmt(stopped.members)}</strong> {stopped.members === 1 ? 'member' : 'members'}:{' '}
            {fmt(stopped.window)} by the {limits.window_hours} hours, {fmt(stopped.day)} by the day, {fmt(stopped.week)} by the week.</>}
      </p>
    </section>
  );
};

export default AdminSearchLimits;
