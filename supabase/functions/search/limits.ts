// ============================================================================
// Search limits (supabase/migrations/…_search_limits.sql): what
// consume_search() answers, and the message when a search is refused.
//
// Every search counts toward three limits: so many in a 5-hour window, a day
// (India time) and a week (from Friday 6 pm India time). The app shows the
// times in the phone's own time; this message, for apps from before the
// limits, says India time.
// ============================================================================

export type LimitName = 'window' | 'day' | 'week';

export interface SearchAllowance {
  allowed: boolean;
  plan: 'free' | 'plus';
  remaining: number | null;          // null: no limits
  remaining_by: LimitName | null;
  remaining_until: string | null;
  limited_by: LimitName | null;
  next_search_at: string | null;
  limit: number | null;              // the day's, for apps from before the limits
  window: { used: number; limit: number | null; hours: number; resets_at: string | null };
  day: { used: number; limit: number | null; bonus: number; resets_at: string };
  week: { used: number; limit: number | null; resets_at: string };
}

const TZ = 'Asia/Kolkata';
const dateOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "4:12 pm" in India time */
export function timeOf(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

/** "at 4:12 pm", "at midnight", "tomorrow at 9:00 am", "on Friday at 6:00 pm" (India time) */
export function whenText(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = timeOf(at);
  const day = dateOf(at);
  if (time === '12:00 am' && day === dateOf(new Date(now.getTime() + 86_400_000))) return 'at midnight';
  if (day === dateOf(now)) return `at ${time}`;
  if (day === dateOf(new Date(now.getTime() + 86_400_000))) return `tomorrow at ${time}`;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(at);
  return `on ${weekday} at ${time}`;
}

/** Why a search was refused, and when the next one can be */
export function limitMessage(a: SearchAllowance, now = new Date()): string {
  const used = a.limited_by === 'week' ? "You've used this week's searches."
    : a.limited_by === 'day' ? "You've used today's searches."
    : "You've used your searches for now.";
  return a.next_search_at ? `${used} You can search again ${whenText(a.next_search_at, now)} (India time).` : used;
}
