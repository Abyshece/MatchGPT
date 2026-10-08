// ============================================================================
// Search limits: the types and the words the app shows (lib/searchLimits.ts
// reads the numbers; supabase/migrations/…_search_limits.sql keeps them).
// Times are in the phone's own time zone. Nothing here talks to the server, so
// scripts/search-limits.test.mjs tests it on its own.
// ============================================================================

export type LimitName = 'window' | 'day' | 'week';

export interface PlanLimits { per_window: number | null; per_day: number | null; per_week: number | null }

export interface SearchAllowance {
  allowed: boolean;                  // a search can go ahead now
  plan: 'free' | 'plus';
  remaining: number | null;          // the fewest left of the three; null: no limits
  remaining_by: LimitName | null;    // which limit that is
  remaining_until: string | null;    // and when it resets (null: a window not started yet)
  limited_by: LimitName | null;      // used up: the limit that stops searches now
  next_search_at: string | null;     // when the next search can be
  window: { used: number; limit: number | null; hours: number; resets_at: string | null };
  day: { used: number; limit: number | null; bonus: number; resets_at: string };
  week: { used: number; limit: number | null; resets_at: string };
  plans: { free: PlanLimits; plus: PlanLimits };
  week_reset: { dow: number; hour: number };
}

/** What Shaadi24+ and free accounts get, until the server says (the database's starting numbers) */
export const DEFAULT_PLANS: { free: PlanLimits; plus: PlanLimits } = {
  free: { per_window: 3, per_day: 3, per_week: 30 },
  plus: { per_window: 15, per_day: 50, per_week: 200 },
};
export const DEFAULT_WINDOW_HOURS = 5;

// ---- Times, in the phone's own time zone ----------------------------------------------------------

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "4:12 pm" */
export function timeText(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([AP])M$/i, (_, p: string) => ` ${p.toLowerCase()}m`);
}

/** "at 4:12 pm", "at midnight", "tomorrow at 9:00 am", "on Friday at 6:00 pm" */
export function whenText(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = timeText(at);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (time === '12:00 am' && dayKey(at) === dayKey(tomorrow)) return 'at midnight';
  if (dayKey(at) === dayKey(now)) return `at ${time}`;
  if (dayKey(at) === dayKey(tomorrow)) return `tomorrow at ${time}`;
  if (at.getTime() - now.getTime() < 7 * 86_400_000) return `on ${at.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
  return `on ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} at ${time}`;
}

const s = (n: number) => (n === 1 ? '' : 'es');

/** Under the search box: "2 searches left until 4:12 pm", "Out of searches until Friday at 6:00 pm" */
export function allowanceLine(a: SearchAllowance, now = new Date()): string {
  if (!a.allowed) return a.next_search_at ? `Out of searches until ${whenText(a.next_search_at, now).replace(/^(at|on) /, '')}` : 'Out of searches for now';
  if (a.remaining === null) return 'Unlimited searches';
  if (a.remaining_by === 'window' && !a.remaining_until) return `${a.remaining} search${s(a.remaining)} every ${a.window.hours} hours`;
  if (!a.remaining_until) return `${a.remaining} search${s(a.remaining)} left`;
  const when = whenText(a.remaining_until, now);
  return `${a.remaining} search${s(a.remaining)} left ${when === 'at midnight' ? 'today' : `until ${when.replace(/^(at|on) /, '')}`}`;
}

/** The pop-up's title when a search is refused */
export function limitTitle(by: LimitName | null): string {
  return by === 'week' ? "You've used this week's searches"
    : by === 'day' ? "You've used today's searches"
    : "You've used your searches for now";
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Friday at 6:00 pm" (India time) */
export function weekResetText(r: { dow: number; hour: number }): string {
  const h = r.hour % 12 === 0 ? 12 : r.hour % 12;
  return `${DAYS[r.dow] ?? 'Friday'} at ${h}:00 ${r.hour < 12 ? 'am' : 'pm'}`;
}

/** Shaadi24+'s searches, for the list of what it adds */
export function plusSearchesText(plans = DEFAULT_PLANS, hours = DEFAULT_WINDOW_HOURS): { title: string; detail: string } {
  const p = plans.plus;
  const f = plans.free;
  const parts = (x: PlanLimits, bonus = false) => [
    x.per_window !== null ? `${x.per_window} every ${hours} hours` : null,
    x.per_day !== null ? `${x.per_day}${bonus ? ` (up to ${x.per_day + 6} with a complete profile)` : ''} a day` : null,
    x.per_week !== null ? `${x.per_week} a week` : null,
  ].filter(Boolean).join(', ');
  if (p.per_window === null && p.per_day === null && p.per_week === null) {
    return { title: 'Unlimited AI searches', detail: `Free: ${parts(f, true)}` };
  }
  return { title: 'More AI searches', detail: `${parts(p)}. Free: ${parts(f, true)}` };
}
