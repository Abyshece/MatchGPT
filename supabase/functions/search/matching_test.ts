// Tests for matching.ts. Run from the repo root:
//   deno test --no-config supabase/functions/search/matching_test.ts
import {
  buildCatalog, describeParsed, parsePrompt, planToParsed, rankCandidates, sanitizeFilters,
  type Row, type SearchPlan,
} from './matching.ts';

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

// ---- Plans from Gemini (ai.ts) ------------------------------------------------

const plan = (p: Partial<SearchPlan>): SearchPlan => ({
  gender: null, ageMin: null, ageMax: null, nearMe: false, city: null, online: false,
  recentlyActive: false, verified: false, avoid: [], preferences: [], keywords: [], ...p,
});
const aiIds = (pool: Row[], p: SearchPlan) =>
  rankCandidates(me, pool, 'ignored', {}, 50, NOW, planToParsed(p)).candidates.map((c) => c.id);

Deno.test('Gemini plan: a named city, age and habits to avoid are filters', () => {
  const pool = [
    person('pune', { location: 'Pune, MH' }), person('mumbai'),
    person('pune-smoker', { location: 'Pune, MH', smoking: 'Regularly' }),
    person('pune-40', { location: 'Pune, MH', age: 40 }),
  ];
  assertEquals(aiIds(pool, plan({ city: 'Pune', ageMax: 35, avoid: ['smoking'] })), ['pune']);
});

Deno.test('Gemini plan: chosen answers and keyword synonyms raise the score', () => {
  const pool = [
    person('plain'),
    person('veg', { dietary_preferences: 'Vegan' }),
    person('doc', { job_title: 'Physician' }),
    person('both', { dietary_preferences: 'Vegetarian', job_title: 'Surgeon' }),
  ];
  const p = plan({
    preferences: [{ field: 'dietary_preferences', answers: ['Vegetarian', 'Vegan'], negated: false }],
    keywords: [{ words: ['doctor', 'physician', 'surgeon'], negated: false }],
  });
  const [first] = aiIds(pool, p);
  assertEquals(first, 'both');
  const scores = rankCandidates(me, pool, '', {}, 50, NOW, planToParsed(p)).candidates;
  const score = (id: string) => scores.find((c) => c.id === id)!.compatibilityScore;
  assertEquals(score('doc') > score('plain') && score('veg') > score('plain'), true);
});

Deno.test('Gemini plan: a hidden answer counts as unknown', () => {
  const hidden = person('h', { religion: 'Hindu', hidden_fields: ['religion'] });
  const shown = person('s', { religion: 'Hindu' });
  const p = plan({ preferences: [{ field: 'religion', answers: ['Hindu'], negated: false }] });
  assertEquals(aiIds([hidden, shown], p), ['s', 'h']);
});

Deno.test('catalog: answers people show, hidden ones left out, sorted', () => {
  const catalog = buildCatalog([
    person('a', { dietary_preferences: 'Vegan', religion: 'Sikh' }),
    person('b', { dietary_preferences: 'Jain', religion: 'Hindu', hidden_fields: ['religion'] }),
  ]);
  assertEquals([catalog.dietary_preferences, catalog.religion], [['Jain', 'Vegan'], ['Sikh']]);
});

Deno.test('what the search understood, as short labels', () => {
  assertEquals(describeParsed(parsePrompt("a woman under 30 near me who doesn't smoke and loves hiking")),
    ['Women', 'Under 30', 'Near you', "Doesn't smoke", 'hiking']);
  assertEquals(describeParsed(planToParsed(plan({
    gender: 'man', ageMin: 25, ageMax: 30, city: 'Pune', avoid: ['drinking'],
    preferences: [{ field: 'dietary_preferences', answers: ['Vegetarian', 'Vegan'], negated: false }],
    keywords: [{ words: ['books', 'reading'], negated: false }, { words: ['lawyer'], negated: true }],
  }))), ['Men', 'Age 25–30', 'In Pune', "Doesn't drink", 'Diet: Vegetarian / Vegan', 'books', 'not lawyer']);
});

Deno.test('answers as the sign-up form stores them count too ("Dog", "Yes")', () => {
  const pool = [person('dog', { pets: 'Dog' }), person('none', { pets: 'None' }), person('cook', { can_cook: 'Yes' })];
  assertEquals(ids(pool, 'dog lover')[0], 'dog');
  assertEquals(ids(pool, 'someone who can cook')[0], 'cook');
});
