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

// ---- India fields (Phase 12) ---------------------------------------------------

Deno.test('heights in the prompt: units needed, ranges, "taller than", "under"', () => {
  assertEquals(parsePrompt(`taller than 5'6"`).heightRange, [170, 230]);
  assertEquals(parsePrompt("between 5'4 and 5'8").heightRange, [163, 173]);
  assertEquals(parsePrompt("5'4 to 5'8, vegetarian").heightRange, [163, 173]);
  assertEquals(parsePrompt('under 6 ft').heightRange, [120, 180]);
  assertEquals(parsePrompt('shorter than 180 cm').heightRange, [120, 179]);
  assertEquals(parsePrompt('at least 170 cm').heightRange, [170, 230]);
  assertEquals(parsePrompt("5'6+ girl").heightRange, [168, 230]);
  assertEquals(parsePrompt('a 5ft10in guy').heightRange, [175, 181]);
  const ages = parsePrompt('a woman 25 to 30, 5 kids is fine');
  assertEquals([ages.heightRange, ages.ageRange], [null, [25, 30]]);
  assertEquals(parsePrompt("taller than 5'6\" who doesn't smoke").terms.map((t) => t.phrases[0]), ['smoke']);
});

Deno.test('height: the filter and the prompt, by height in cm; hidden or unknown heights are left out', () => {
  const pool = [
    person('short', { height_cm: 157 }), person('tall', { height_cm: 180 }), person('blank'),
    person('hidden', { height_cm: 183, hidden_fields: ['height'] }),
  ];
  assertEquals(ids(pool, '', { heightRange: [170, 190] }), ['tall']);
  assertEquals(ids(pool, `taller than 5'6"`), ['tall']);
  assertEquals(ids(pool, 'under 5 feet 5', { heightRange: [150, 200] }), ['short']);
});

Deno.test('India filters: country, state, mother tongue (Hindi kinds), caste, marital status, children', () => {
  const pool = [
    person('surat', { city: 'Surat', state: 'Gujarat', country: 'India', mother_tongue: 'Gujarati', caste: 'Patel',
      marital_status: 'Never Married', children: 'No' }),
    person('delhi', { city: 'Delhi', state: 'Delhi', country: 'India', mother_tongue: 'Hindi (Delhi)', caste: 'Brahmin',
      marital_status: 'Divorced', children: 'Yes, living together' }),
    person('toronto', { city: 'Toronto', state: 'Ontario', country: 'Canada', mother_tongue: 'Punjabi',
      marital_status: 'Never Married', children: 'Has children' }),
    person('hidden-place', { city: 'Pune', state: 'Maharashtra', country: 'India', hidden_fields: ['location'] }),
  ];
  assertEquals(ids(pool, '', { country: 'India' }).sort(), ['delhi', 'surat']);
  assertEquals(ids(pool, '', { country: 'India', state: 'Gujarat' }), ['surat']);
  assertEquals(ids(pool, '', { motherTongue: 'Hindi' }), ['delhi']);
  assertEquals(ids(pool, '', { motherTongue: 'Hindi (Rajasthan)' }), []);
  assertEquals(ids(pool, '', { caste: 'brahmin' }), ['delhi']);
  assertEquals(ids(pool, '', { maritalStatus: 'Never Married' }).sort(), ['surat', 'toronto']);
  assertEquals(ids(pool, '', { children: 'Yes' }).sort(), ['delhi', 'toronto']);
  assertEquals(ids(pool, '', { children: 'No' }), ['surat']);
  const [c] = rankCandidates(me, [pool[3]], '', {}, 50, NOW).candidates;
  assertEquals([c.city, c.state, c.country], [undefined, undefined, undefined]);
});

Deno.test('the questions no longer asked are not filters any more', () => {
  assertEquals(sanitizeFilters({ marijuana: 'No', drugs: 'No', relationshipType: 'Casual', height: 'Tall', caste: 'Jat' }),
    { caste: 'Jat' });
  const pool = [person('x', { marijuana: 'Regularly', relationship_type: 'Open' })];
  assertEquals(ids(pool, '', sanitizeFilters({ marijuana: 'No', relationshipType: 'Monogamous' })), ['x']);
  const [c] = rankCandidates(me, pool, '', {}, 50, NOW).candidates;
  assertEquals(['marijuana', 'relationshipType', 'drugs'].filter((k) => k in c), []);
});

Deno.test('prompt: never married, divorced, Manglik, NRI', () => {
  const pool = [
    person('first', { marital_status: 'Never Married', manglik: 'Non Manglik', country: 'India' }),
    person('again', { marital_status: 'Divorced', manglik: 'Manglik', country: 'Canada' }),
  ];
  assertEquals(ids(pool, 'never married')[0], 'first');
  assertEquals(ids(pool, 'divorced')[0], 'again');
  assertEquals(ids(pool, 'non manglik')[0], 'first');
  assertEquals(ids(pool, 'manglik')[0], 'again');
  assertEquals(ids(pool, 'NRI')[0], 'again');
  assertEquals(parsePrompt('never married girl').terms.map((t) => [t.label, t.negated]), [['never married', false]]);
});

Deno.test('the India details are returned for the profile screen, the date of birth never', () => {
  const [c] = rankCandidates(me, [person('x', {
    date_of_birth: '1996-04-02', mother_tongue: 'Tamil', caste: 'Iyer', manglik: 'Non Manglik', brothers: '1',
    family_type: 'Joint family', about_family: 'We love music.',
  })], '', {}, 50, NOW).candidates;
  assertEquals([c.motherTongue, c.caste, c.manglik, c.brothers, c.familyType, c.aboutFamily],
    ['Tamil', 'Iyer', 'Non Manglik', '1', 'Joint family', 'We love music.']);
  assertEquals('dateOfBirth' in c, false);
});

Deno.test('score: diet, community, horoscope, mother tongue and settling abroad', () => {
  const searcher: Row = {
    ...me, mother_tongue: 'Marathi', caste: 'Maratha', open_to_other_communities: 'Only my own community',
    manglik: 'Non Manglik', horoscope_match: 'Must match', settling_abroad: 'Not interested in settling abroad',
  };
  const report = (fields: Record<string, unknown>) =>
    rankCandidates(searcher, [person('x', fields)], '', {}, 50, NOW).candidates[0].compatibilityReport.map((i) => [i.text, i.color]);
  const texts = (fields: Record<string, unknown>) => report(fields).map(([t]) => t);
  assertEquals(report({ dietary_preferences: 'Non-vegetarian' }).find(([t]) => String(t).startsWith('Different diets')),
    ['Different diets (Vegetarian vs Non-vegetarian)', 'amber']);
  assertEquals(texts({ caste: 'Maratha' }).includes('Same community'), true);
  assertEquals(report({ caste: 'Brahmin' }).find(([t]) => String(t).startsWith('Different communities')),
    ['Different communities; one of you only wants their own', 'red']);
  assertEquals(texts({ manglik: 'Manglik' }).includes('Manglik status differs, and a horoscope match is wanted'), true);
  assertEquals(texts({ manglik: 'Non Manglik' }).includes('Manglik status matches'), true);
  assertEquals(texts({ mother_tongue: 'Marathi' }).includes('Both speak Marathi at home'), true);
  assertEquals(texts({ settling_abroad: 'Interested in settling abroad' }).includes('Different plans about settling abroad'), true);
  // Community isn't compared when neither side minds
  const relaxed = { ...searcher, open_to_other_communities: 'Yes, caste no bar' };
  const others = rankCandidates(relaxed, [person('x', { caste: 'Brahmin' })], '', {}, 50, NOW).candidates[0].compatibilityReport;
  assertEquals(others.some((i) => i.text.includes('communit')), false);
});

Deno.test('near me: old "City, XX" locations and city/state answers are compared alike', () => {
  const legacyMe: Row = { ...me, location: 'Mumbai, MH' };
  const pool = [
    person('pune', { location: 'Pune, Maharashtra', city: 'Pune', state: 'Maharashtra', country: 'India' }),
    person('pune-old', { location: 'Pune, MH' }),
    person('surat', { location: 'Surat, Gujarat', city: 'Surat', state: 'Gujarat', country: 'India' }),
  ];
  assertEquals(ids(pool, 'near me').sort(), ['pune', 'pune-old']);
  assertEquals(rankCandidates(legacyMe, pool, 'near me', {}, 50, NOW).candidates.map((c) => c.id).sort(), ['pune', 'pune-old']);
  const newMe: Row = { ...me, location: 'Thane, Maharashtra', city: 'Thane', state: 'Maharashtra', country: 'India' };
  assertEquals(rankCandidates(newMe, pool, 'near me', {}, 50, NOW).candidates.map((c) => c.id).sort(), ['pune', 'pune-old']);
});

Deno.test('near me: city and state columns, and cities with two names', () => {
  const searcher: Row = { ...me, location: 'Bengaluru, Karnataka', city: 'Bengaluru', state: 'Karnataka' };
  const pool = [
    person('blr', { location: 'Bangalore, KA' }),
    person('mysore', { location: 'Mysore, Karnataka', city: 'Mysore', state: 'Karnataka' }),
    person('chennai', { location: 'Chennai, Tamil Nadu', city: 'Chennai', state: 'Tamil Nadu' }),
  ];
  const ranked = rankCandidates(searcher, pool, '', {}, 50, NOW).candidates;
  assertEquals(ranked[0].id, 'blr');
  assertEquals(ranked[0].compatibilityReport.some((i) => i.icon === '📍'), true);
});

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

Deno.test('Gemini plan: heights and India answers', () => {
  const pool = [
    person('tall-tamil', { height_cm: 178, mother_tongue: 'Tamil' }),
    person('short-tamil', { height_cm: 160, mother_tongue: 'Tamil' }),
    person('tall-hindi', { height_cm: 180, mother_tongue: 'Hindi' }),
  ];
  const p = plan({ heightMinCm: 170, preferences: [{ field: 'mother_tongue', answers: ['Tamil'], negated: false }] });
  assertEquals(aiIds(pool, p), ['tall-tamil', 'tall-hindi']);
  assertEquals(describeParsed(planToParsed(p)).slice(0, 2), [`5'7" or taller`, 'Mother tongue: Tamil']);
  assertEquals(describeParsed(parsePrompt('under 6 ft')), [`5'11" or shorter`]);
  assertEquals(describeParsed(planToParsed(plan({ heightMinCm: 163, heightMaxCm: 173 })))[0], `Height 5'4"–5'8"`);
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
