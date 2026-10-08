import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { fetchSearchInsights, filterLabel, type SearchInsights } from '../../lib/adminInsights';
import DailyChart from './DailyChart';
import { FINANCE_VIZ_CSS } from './RevenueChart';
import { ago } from './adminUi';

// ============================================================================
// Admin → Search insights: what members search for, never who: searches a
// day; the words and the searches typed most, with how many people each
// usually finds; searches that found no one (members we don't have yet, or
// a search the app misreads); and the filters used. Good for knowing whom to
// bring to Shaadi24, and for blog topics.
// ============================================================================

const SPANS = [7, 30, 90] as const;
const fmt = (n: number) => n.toLocaleString('en-IN');

const Card: React.FC<{ title: string; note?: string; children: React.ReactNode; testId?: string }> = ({ title, note, children, testId }) => (
  <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid={testId}>
    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
    {note && <p className="text-xs text-gray-500 dark:text-zinc-400">{note}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

const Tile: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4">
    <p className="text-xs text-gray-500 dark:text-zinc-400">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{value}</p>
    {sub && <p className="text-xs text-gray-500 dark:text-zinc-400">{sub}</p>}
  </div>
);

const AdminSearchTab: React.FC = () => {
  const { showToast } = useToast();
  const [days, setDays] = useState<(typeof SPANS)[number]>(30);
  const [insights, setInsights] = useState<SearchInsights | null>(null);

  const load = useCallback(async (d: number) => {
    const { insights, error } = await fetchSearchInsights(d);
    if (error) showToast(`Couldn't load search insights: ${error}`, 'error');
    setInsights(insights);
  }, [showToast]);
  useEffect(() => { void load(days); }, [days, load]);

  if (!insights) return <div className="h-96 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  const maxWord = Math.max(1, ...insights.top_words.map((w) => w.n));

  return (
    <div className="fin-viz space-y-5" data-testid="admin-search">
      <style>{FINANCE_VIZ_CSS}</style>
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border border-gray-200 dark:border-zinc-700 p-0.5" role="group" aria-label="Period">
          {SPANS.map((s) => (
            <button key={s} type="button" aria-pressed={days === s} onClick={() => setDays(s)}
              className={`h-7 px-3 rounded text-xs ${days === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-zinc-300'}`}>
              {s} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Searches" value={fmt(insights.searches)} sub={`by ${fmt(insights.searchers)} members`} />
        <Tile label="Typed in words" value={fmt(insights.typed)} sub={insights.searches ? `${Math.round((insights.typed / insights.searches) * 100)}% of searches` : undefined} />
        <Tile label="Found no one" value={fmt(insights.none_found)} sub={insights.searches ? `${Math.round((insights.none_found / insights.searches) * 100)}% of searches` : undefined} />
        <Tile label="Usually found" value={insights.average_found != null ? `${insights.average_found}` : '—'} sub="people per search" />
      </div>

      <DailyChart title="Searches a day" unit={['search', 'searches']} points={insights.series.map((d) => ({ day: d.day, value: d.searches }))} testId="chart-searches" />

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Words searched most" note="From what members typed, leaving out words like “someone” and “partner”." testId="top-words">
          {insights.top_words.length === 0 ? <p className="text-sm text-gray-500 dark:text-zinc-400">No typed searches yet.</p> : (
            <ul className="space-y-1.5">
              {insights.top_words.slice(0, 15).map((w) => (
                <li key={w.word} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-sm">
                  <span className="truncate text-gray-900 dark:text-white">{w.word}</span>
                  <span className="block h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full" style={{ width: `${Math.round((w.n / maxWord) * 100)}%`, background: 'var(--viz-s1)' }} />
                  </span>
                  <span className="text-right tabular-nums text-gray-600 dark:text-zinc-300">{fmt(w.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Searches typed most" note="With how many people each usually finds." testId="top-searches">
          {insights.top_searches.length === 0 ? <p className="text-sm text-gray-500 dark:text-zinc-400">No typed searches yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 dark:text-zinc-400"><tr><th scope="col" className="text-left font-medium pb-1">Search</th><th scope="col" className="text-right font-medium pb-1">Times</th><th scope="col" className="text-right font-medium pb-1">Finds</th></tr></thead>
              <tbody>
                {insights.top_searches.slice(0, 12).map((t) => (
                  <tr key={t.search} className="border-t border-gray-100 dark:border-zinc-800">
                    <th scope="row" className="text-left font-normal py-1.5 pr-3 text-gray-900 dark:text-white break-words">“{t.search}”</th>
                    <td className="text-right tabular-nums py-1.5 pr-3">{fmt(t.n)}</td>
                    <td className="text-right tabular-nums py-1.5">{fmt(t.found)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Searches that found no one" note="Members we don't have yet, or a search the app misread." testId="none-found">
          {insights.none_found_searches.length === 0 ? <p className="text-sm text-gray-500 dark:text-zinc-400">Every search found someone.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
              {insights.none_found_searches.map((t) => (
                <li key={t.search} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-900 dark:text-white break-words">“{t.search}”</span>
                  <span className="flex-none text-xs text-gray-500 dark:text-zinc-400 tabular-nums">{t.n}× · {ago(t.last)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Filters used" testId="filters-used">
          {insights.filters.length === 0 ? <p className="text-sm text-gray-500 dark:text-zinc-400">No filters used yet.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
              {insights.filters.map((f) => (
                <li key={f.filter} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-900 dark:text-white">{filterLabel(f.filter)}</span>
                  <span className="tabular-nums text-gray-600 dark:text-zinc-300">{fmt(f.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminSearchTab;
