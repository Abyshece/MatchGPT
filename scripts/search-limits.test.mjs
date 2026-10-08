// The words the app shows for the search limits (lib/searchLimitText.ts):
// under the search box, the pop-up's title, the week's start and what
// Shaadi24+ adds. In India time, like a phone in India.
//   node --test scripts/search-limits.test.mjs
process.env.TZ = 'Asia/Kolkata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';

register();
const { timeText, whenText, allowanceLine, limitTitle, weekResetText, plusSearchesText, DEFAULT_PLANS } = await import('../lib/searchLimitText.ts');

// Thursday 8 October 2026, 2:30 pm India time
const NOW = new Date('2026-10-08T09:00:00Z');
const allowance = (over) => ({
  allowed: true, plan: 'free', remaining: 3, remaining_by: 'window', remaining_until: null, limited_by: null, next_search_at: null,
  window: { used: 0, limit: 3, hours: 5, resets_at: null },
  day: { used: 0, limit: 4, bonus: 1, resets_at: '2026-10-08T18:30:00Z' },
  week: { used: 0, limit: 30, resets_at: '2026-10-09T12:30:00Z' },
  plans: DEFAULT_PLANS, week_reset: { dow: 5, hour: 18 },
  ...over,
});

test('times in the 12-hour clock', () => {
  assert.equal(timeText(new Date('2026-10-08T10:42:00Z')), '4:12 pm');
  assert.equal(timeText(new Date('2026-10-08T03:30:00Z')), '9:00 am');
  assert.equal(timeText(new Date('2026-10-08T18:30:00Z')), '12:00 am');
});

test('when: today, midnight, tomorrow, later in the week, further', () => {
  assert.equal(whenText('2026-10-08T10:42:00Z', NOW), 'at 4:12 pm');
  assert.equal(whenText('2026-10-08T18:30:00Z', NOW), 'at midnight');
  assert.equal(whenText('2026-10-09T03:30:00Z', NOW), 'tomorrow at 9:00 am');
  assert.equal(whenText('2026-10-09T12:30:00Z', NOW), 'tomorrow at 6:00 pm');
  assert.equal(whenText('2026-10-12T12:30:00Z', NOW), 'on Monday at 6:00 pm');
  assert.equal(whenText('2026-10-20T12:30:00Z', NOW), 'on 20 Oct at 6:00 pm');
});

test('the line under the search box', () => {
  assert.equal(allowanceLine(allowance({}), NOW), '3 searches every 5 hours');                       // the 5 hours not started
  assert.equal(allowanceLine(allowance({ remaining: 2, remaining_until: '2026-10-08T10:42:00Z' }), NOW), '2 searches left until 4:12 pm');
  assert.equal(allowanceLine(allowance({ remaining: 1, remaining_by: 'day', remaining_until: '2026-10-08T18:30:00Z' }), NOW), '1 search left today');
  assert.equal(allowanceLine(allowance({ remaining: 5, remaining_by: 'week', remaining_until: '2026-10-09T12:30:00Z' }), NOW), '5 searches left until tomorrow at 6:00 pm');
  assert.equal(allowanceLine(allowance({ remaining: null, remaining_by: null }), NOW), 'Unlimited searches');
  assert.equal(allowanceLine(allowance({ allowed: false, remaining: 0, limited_by: 'window', next_search_at: '2026-10-08T10:42:00Z' }), NOW), 'Out of searches until 4:12 pm');
  assert.equal(allowanceLine(allowance({ allowed: false, remaining: 0, limited_by: 'day', next_search_at: '2026-10-08T18:30:00Z' }), NOW), 'Out of searches until midnight');
  assert.equal(allowanceLine(allowance({ allowed: false, remaining: 0, limited_by: 'week', next_search_at: '2026-10-09T12:30:00Z' }), NOW), 'Out of searches until tomorrow at 6:00 pm');
  assert.equal(allowanceLine(allowance({ allowed: false, remaining: 0, limited_by: 'week', next_search_at: '2026-10-16T12:30:00Z' }), new Date('2026-10-09T13:00:00Z')),
    'Out of searches until Friday at 6:00 pm');
});

test("the pop-up says which limit", () => {
  assert.equal(limitTitle('window'), "You've used your searches for now");
  assert.equal(limitTitle('day'), "You've used today's searches");
  assert.equal(limitTitle('week'), "You've used this week's searches");
  assert.equal(limitTitle(null), "You've used your searches for now");
});

test("the week's start", () => {
  assert.equal(weekResetText({ dow: 5, hour: 18 }), 'Friday at 6:00 pm');
  assert.equal(weekResetText({ dow: 0, hour: 0 }), 'Sunday at 12:00 am');
  assert.equal(weekResetText({ dow: 1, hour: 12 }), 'Monday at 12:00 pm');
});

test('what Shaadi24+ adds, from the numbers the owners set', () => {
  assert.deepEqual(plusSearchesText(), {
    title: 'More AI searches',
    detail: '15 every 5 hours, 50 a day, 200 a week. Free: 3 every 5 hours, 3 (up to 9 with a complete profile) a day, 30 a week',
  });
  const open = { per_window: null, per_day: null, per_week: null };
  assert.equal(plusSearchesText({ free: DEFAULT_PLANS.free, plus: open }).title, 'Unlimited AI searches');
  assert.equal(plusSearchesText({ free: { per_window: 4, per_day: null, per_week: null }, plus: { per_window: 20, per_day: null, per_week: 300 } }, 4).detail,
    '20 every 4 hours, 300 a week. Free: 4 every 4 hours');
});
