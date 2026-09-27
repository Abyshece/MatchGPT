// Tests for matching.ts. Run from the repo root:
//   deno test --no-config supabase/functions/search/matching_test.ts
import { parsePrompt, rankCandidates, sanitizeFilters, type Row } from './matching.ts';

function assertEquals(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected ${e}\n  actual   ${a}`);
}

const NOW = Date.parse('2026-09-27T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const me: Row = {
  id: 'me', name: 'Asha', age: 29, gender: 'Woman', interested_in: 'Men',
  location: 'Mumbai, MH', religion: 'Hindu', dietary_preferences: 'Vegetarian', smoking: 'No',
};

function person(id: string, fields: Record<string, unknown> = {}): Row {
  return {
    id, name: `Person ${id}`, age: 30, gender: 'Man', location: 'Mumbai, MH',
    last_active_at: minutesAgo(60), settings_show_online: true, hidden_fields: [], ...fields,
  };
}

const ids = (pool: Row[], prompt: string, filters = {}) =>
  rankCandidates(me, pool, prompt, sanitizeFilters(filters), 50, NOW).candidates.map((c) => c.id);

Deno.test('prompt: "near me" and "online" become filters, not keywords', () => {
  const near = parsePrompt('Find a match near me');
  assertEquals([near.nearMe, near.terms.length], [true, 0]);
  const online = parsePrompt('Show me all online matches');
  assertEquals([online.online, online.terms.length], [true, 0]);
});

Deno.test('prompt: negation', () => {
  const p = parsePrompt("someone who doesn't smoke or drink but loves hiking");
  assertEquals(p.terms.map((t) => [t.phrases[0], t.negated]), [['smoke', true], ['drink', true], ['hike', false]]);
  assertEquals(parsePrompt('non-smoker').terms.map((t) => t.negated), [true]);
  assertEquals(parsePrompt('smoke free vegetarian').terms.map((t) => [t.phrases[0], t.negated]),
    [['smoke', true], ['vegetarian', false]]);
  assertEquals(parsePrompt('sober').terms.map((t) => [t.phrases[0], t.negated]), [['drink', true]]);
  assertEquals(parsePrompt('gluten-free').terms.map((t) => [t.phrases[0], t.negated]), [['gluten free', false]]);
});

Deno.test('prompt: gender and age', () => {
  const p = parsePrompt('a woman under 30');
  assertEquals([p.gender, p.ageRange, p.terms.length], ['woman', [18, 29], 0]);
  assertEquals(parsePrompt('guys in their late 20s').ageRange, [26, 29]);
  assertEquals(parsePrompt('between 25 and 32').ageRange, [25, 32]);
  assertEquals(parsePrompt('over 30').ageRange, [31, 99]);
  assertEquals(parsePrompt('men or women').gender, null);
  assertEquals(parsePrompt('constructor toString').gender, null);
});

Deno.test('whole words only: "art" does not match "smart" or "heart"', () => {
  const pool = [
    person('a', { description: 'Smart, with a kind heart' }),
    person('b', { description: 'Weekends at art galleries' }),
  ];
  const [first] = rankCandidates(me, pool, 'art', {}, 50, NOW).candidates;
  assertEquals(first.id, 'b');
  const scores = rankCandidates(me, pool, 'art', {}, 50, NOW).candidates.map((c) => c.compatibilityScore);
  assertEquals(scores[0] - scores[1], 30);
});

Deno.test('"doesn\'t smoke" leaves out smokers, keeps non-smokers and people who didn\'t say', () => {
  const pool = [person('smoker', { smoking: 'Regularly' }), person('non', { smoking: 'No' }), person('blank')];
  assertEquals(ids(pool, "doesn't smoke").sort(), ['blank', 'non']);
  assertEquals(ids(pool, "doesn't smoke")[0], 'non');
});

Deno.test('"near me": same city or state', () => {
  const pool = [
    person('mumbai'), person('pune', { location: 'Pune, MH' }),
    person('toronto', { location: 'Toronto, ON' }), person('none', { location: null }),
  ];
  assertEquals(ids(pool, 'near me').sort(), ['mumbai', 'pune']);
});

Deno.test('"online": active in the last 5 minutes with Active Status on', () => {
  const pool = [
    person('now', { last_active_at: minutesAgo(1) }),
    person('earlier', { last_active_at: minutesAgo(10) }),
    person('hidden', { last_active_at: minutesAgo(1), settings_show_online: false }),
  ];
  assertEquals(ids(pool, 'online now'), ['now']);
  assertEquals(ids(pool, '', { isOnline: true }), ['now']);
});

Deno.test('gender and age from the prompt', () => {
  const pool = [person('m30'), person('w30', { gender: 'Woman' }), person('m40', { age: 40 })];
  assertEquals(ids(pool, 'a man under 35'), ['m30']);
});

Deno.test('hidden fields: not used, not shown, not revealed by filters', () => {
  const hidden = person('h', {
    religion: 'Hindu', job_title: 'Doctor', age: 29,
    hidden_fields: ['religion', 'jobTitle', 'age'],
  });
  const [c] = rankCandidates(me, [hidden], 'doctor', {}, 50, NOW).candidates;
  assertEquals([c.religion, c.jobTitle, c.age], [undefined, undefined, 0]);
  assertEquals(c.compatibilityReport.some((i) => i.text.includes('Hindu') || i.text.includes('age')), false);
  assertEquals(ids([hidden], '', { religion: 'Hindu' }), []);
  assertEquals(ids([hidden], '', { ageRange: [25, 35] }), []);
  assertEquals(ids([person('shown', { religion: 'Hindu' })], '', { religion: 'Hindu' }), ['shown']);
});

Deno.test('only the fields the profile screen shows are returned', () => {
  const [c] = rankCandidates(me, [person('x', {
    email: 'x@example.com', therapy_history: 'Currently', interested_in: 'Women', religion: 'Hindu',
  })], '', {}, 50, NOW).candidates;
  assertEquals(['email', 'therapyHistory', 'interestedIn', 'gender'].filter((k) => k in c), []);
  assertEquals(c.religion, 'Hindu');
});

Deno.test('diet, exercise and the other factors now count', () => {
  const pool = [person('veg', { dietary_preferences: 'Vegetarian' }), person('meat', { dietary_preferences: 'No restrictions' })];
  const [first, second] = rankCandidates(me, pool, '', {}, 50, NOW).candidates;
  assertEquals([first.id, first.compatibilityScore - second.compatibilityScore], ['veg', 2]);
  assertEquals(first.compatibilityReport.some((i) => i.text === 'Both vegetarian'), true);
});

Deno.test('filters from the browser are checked', () => {
  assertEquals(sanitizeFilters({ religion: 'Hindu', isOnline: 'yes', ageRange: [40, 25], evil: 1 }),
    { religion: 'Hindu', ageRange: [25, 40] });
});
