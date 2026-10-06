import React from 'react';
import { IconCheck } from '../constants';
import { DAILY_LIMITS } from '../lib/profileService';
import { unansweredLabels, type ProfileSections } from '../lib/profileRewards';

// ============================================================================
// ProfileRewardsCard: top of My Profile. Each profile section completed adds
// one free AI search a day (lib/profileRewards.ts); the card shows the total
// and where every section stands. Tapping a section goes to it.
// ============================================================================

const goTo = (id: string) => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const ProfileRewardsCard: React.FC<{
  sections: ProfileSections | null;
  isPro: boolean;
  completionPercentage: number;
  estimatedMinutes: number;
}> = ({ sections, isPro, completionPercentage, estimatedMinutes }) => {
  const list = sections?.sections ?? [];
  const done = list.filter((s) => s.complete).length;
  const base = DAILY_LIMITS.FREE.searches;

  return (
    <section
      aria-labelledby="rewards-title"
      data-testid="profile-rewards"
      className="mb-10 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-sm"
    >
      {/* The title and today's number side by side; the explanation under both, full width */}
      <div className="flex items-start justify-between gap-4">
        <h3 id="rewards-title" className="min-w-0 pt-0.5 text-base sm:text-lg font-bold text-gray-900 dark:text-white">Earn free AI searches</h3>
        <div className="flex-none text-right leading-tight">
          {isPro ? (
            <>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">∞</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Unlimited with Shaadi24+</div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="daily-searches">
                {sections ? sections.dailySearches : base}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">free searches a day</div>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Each section you complete adds one free search a day, up to {base + list.length || base + 6} a day.
      </p>

      {sections === null ? (
        <div className="mt-4 h-24 rounded-lg bg-gray-50 dark:bg-zinc-800/50 animate-pulse" aria-hidden="true" />
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-zinc-800">
          {list.map((s) => {
            const left = Math.max(0, s.needed - s.answered);
            const pct = Math.min(100, Math.round((s.answered / Math.max(s.needed, 1)) * 100));
            const todo = unansweredLabels(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  data-testid={`reward-${s.id}`}
                  className="w-full flex items-start gap-3 py-2.5 text-left group"
                >
                  <span
                    className={`flex-none mt-px w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                      s.complete ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'}`}
                    aria-hidden="true"
                  >
                    {s.complete ? <IconCheck /> : '+1'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white group-hover:underline">{s.title}</span>
                      <span className={`flex-none pt-px text-xs font-medium whitespace-nowrap ${s.complete ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {s.complete ? '+1 search a day' : `${left} more ${left === 1 ? 'answer' : 'answers'}`}
                      </span>
                    </span>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${s.complete ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    {!s.complete && todo.length > 0 && (
                      <span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        Still to answer: {todo.join(', ')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{done} of {list.length || 6} sections complete</span>
        <span>
          Profile {completionPercentage}% complete
          {completionPercentage < 100 && <> · ~{estimatedMinutes} min to finish</>}
        </span>
      </div>
    </section>
  );
};

export default ProfileRewardsCard;
