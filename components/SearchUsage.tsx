import React from 'react';
import { whenText, type SearchAllowance } from '../lib/searchLimits';

// ============================================================================
// SearchUsage: Settings' AI searches, like Claude's usage page. One row for
// each limit (every 5 hours, today, this week) with how many are used, a bar
// and when it resets, in the phone's own time. The server keeps the counts
// (lib/searchLimits.ts).
// ============================================================================

const Row: React.FC<{ id: string; label: string; used: number; limit: number | null; resets: string }> = ({ id, label, used, limit, resets }) => {
  const full = limit !== null && used >= limit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <li className="py-2.5" data-testid={`usage-${id}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-gray-900 dark:text-white">{label}</span>
        <span className={full ? 'font-semibold text-rose-700 dark:text-rose-400' : 'text-gray-600 dark:text-gray-300'}>
          {limit === null ? 'No limit' : `${Math.min(used, limit)} of ${limit} used`}
        </span>
      </div>
      {limit !== null && (
        <div
          role="progressbar"
          aria-label={`${label}: searches used`}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden"
        >
          <div className={`h-full rounded-full ${full ? 'bg-rose-600 dark:bg-rose-500' : 'bg-gray-800 dark:bg-gray-200'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{resets}</div>
    </li>
  );
};

const SearchUsage: React.FC<{ allowance: SearchAllowance | null }> = ({ allowance: a }) => {
  if (!a) return null;
  const now = new Date();
  const week = whenText(a.week.resets_at, now);
  return (
    <section aria-labelledby="usage-title" className="px-2" data-testid="search-usage">
      <h3 id="usage-title" className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">AI searches</h3>
      <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
        <Row id="window" label={`Every ${a.window.hours} hours`} used={a.window.used} limit={a.window.limit}
          resets={a.window.resets_at ? `Resets ${whenText(a.window.resets_at, now)}` : `The ${a.window.hours} hours start with your next search`} />
        <Row id="day" label="Today" used={a.day.used} limit={a.day.limit}
          resets={`Resets ${whenText(a.day.resets_at, now)}${a.plan === 'free' && a.day.bonus > 0 ? ` · ${a.day.bonus} more a day for your profile` : ''}`} />
        <Row id="week" label="This week" used={a.week.used} limit={a.week.limit}
          resets={`Resets ${week.startsWith('at ') ? `today ${week}` : week.replace(/^on /, '')}`} />
      </ul>
    </section>
  );
};

export default SearchUsage;
