import { assertEquals } from 'jsr:@std/assert@1';
import { limitMessage, timeOf, whenText, type SearchAllowance } from './limits.ts';

// Thursday 8 October 2026, 2:30 pm India time
const NOW = new Date('2026-10-08T09:00:00Z');

Deno.test('times are India time, in the 12-hour clock', () => {
  assertEquals(timeOf(new Date('2026-10-08T10:42:00Z')), '4:12 pm');
  assertEquals(timeOf(new Date('2026-10-08T18:30:00Z')), '12:00 am');
});

Deno.test('when: today, midnight, tomorrow, another day', () => {
  assertEquals(whenText('2026-10-08T10:42:00Z', NOW), 'at 4:12 pm');
  assertEquals(whenText('2026-10-08T18:30:00Z', NOW), 'at midnight');           // the day's reset
  assertEquals(whenText('2026-10-09T03:30:00Z', NOW), 'tomorrow at 9:00 am');
  assertEquals(whenText('2026-10-09T12:30:00Z', NOW), 'tomorrow at 6:00 pm');   // Friday 6 pm, the week's
  assertEquals(whenText('2026-10-16T12:30:00Z', NOW), 'on Friday at 6:00 pm');
});

const allowance = (over: Partial<SearchAllowance>): SearchAllowance => ({
  allowed: false, plan: 'free', remaining: 0, remaining_by: 'window', remaining_until: null,
  limited_by: 'window', next_search_at: '2026-10-08T10:42:00Z', limit: 3,
  window: { used: 3, limit: 3, hours: 5, resets_at: '2026-10-08T10:42:00Z' },
  day: { used: 3, limit: 4, bonus: 1, resets_at: '2026-10-08T18:30:00Z' },
  week: { used: 3, limit: 30, resets_at: '2026-10-09T12:30:00Z' },
  ...over,
});

Deno.test('the refusal says which limit and when', () => {
  assertEquals(limitMessage(allowance({}), NOW), "You've used your searches for now. You can search again at 4:12 pm (India time).");
  assertEquals(limitMessage(allowance({ limited_by: 'day', next_search_at: '2026-10-08T18:30:00Z' }), NOW),
    "You've used today's searches. You can search again at midnight (India time).");
  assertEquals(limitMessage(allowance({ limited_by: 'week', next_search_at: '2026-10-16T12:30:00Z' }), NOW),
    "You've used this week's searches. You can search again on Friday at 6:00 pm (India time).");
});
