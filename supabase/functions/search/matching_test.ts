// Tests for matching.ts. Run from the repo root:
//   deno test --no-config supabase/functions/search/matching_test.ts
import {
  buildCatalog, describeParsed, effectivePrefs, parsePrompt, planToParsed, prefMisses, prefsFromRow, prefsWithoutPro,
  rankCandidates, sanitizeFilters, withoutProFilters,
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

Deno.test('answers no longer asked since the short sign-up are not shown, filtered, searched or scored', () => {
  const dropped = {
    politics: 'Liberal', ethnicity: 'Indian', zodiac: 'Leo', love_language: 'Quality time', attachment_style: 'Secure',
    living_preference: 'Apartment', has_tattoos: 'Yes', hair_color: 'Black', eye_color: 'Brown', wears_lenses: 'Yes',
    interracial_marriage: 'No', music_genre: 'Jazz', next_travel_destination: 'Goa',
  };
  const searcher: Row = { ...me, ...dropped };
  const pool = [person('gave', dropped), person('plain')];
  const ranked = rankCandidates(searcher, pool, 'tattoo jazz leo', sanitizeFilters({ politics: 'Liberal', ethnicity: 'Indian' }), 50, NOW).candidates;
  // Neither filtered nor ranked by them: the same score as someone who never answered
  assertEquals(ranked.map((c) => c.id).sort(), ['gave', 'plain']);
  assertEquals(ranked[0].compatibilityScore, ranked[1].compatibilityScore);
  const gave = ranked.find((c) => c.id === 'gave')!;
  assertEquals(['politics', 'ethnicity', 'zodiac', 'loveLanguage', 'attachmentStyle', 'hasTattoos', 'wearsLenses']
    .filter((k) => k in gave), []);
  assertEquals(gave.compatibilityReport.some((i) => /politic|ethnic|love language|attachment/i.test(i.text)), false);
  // Gemini isn't offered them either
  const catalog = buildCatalog([person('a', dropped)]);
  assertEquals(['politics', 'ethnicity', 'zodiac', 'love_language', 'has_tattoos'].filter((k) => k in catalog), []);
});

Deno.test('body type, future plans and pets are shown on the profile screen', () => {
  const [c] = rankCandidates(me, [person('x', { body_type: 'Athletic', future_plans: 'Start a business', pets: 'Dog' })],
    '', {}, 50, NOW).candidates;
  assertEquals([c.bodyType, c.futurePlans, c.pets], ['Athletic', 'Start a business', 'Dog']);
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

Deno.test('without Shaadi24+: age, place and the switches stay, Shaadi24+\'s filters go', () => {
  const all = sanitizeFilters({
    ageRange: [25, 32], country: 'India', state: 'Maharashtra', neighborhood: 'Pune', isVerified: true, hasInstagram: true,
    religion: 'Hindu', motherTongue: 'Marathi', caste: 'Maratha', maritalStatus: 'Never married', heightRange: [160, 175],
    manglik: 'No', dietaryPreferences: 'Vegetarian', educationLevel: "Master's", datingIntention: 'Marriage',
    children: 'No', familyPlans: 'Yes', drinking: 'No', smoking: 'No',
  });
  assertEquals(withoutProFilters(all), {
    isVerified: true, hasInstagram: true, neighborhood: 'Pune', country: 'India', state: 'Maharashtra', ageRange: [25, 32],
  });
  // The filters given are left as they were
  assertEquals(all.religion, 'Hindu');
});

Deno.test('Spotlight: a fair match near the searcher goes first, marked; one far away or a poor match does not', () => {
  const match = { religion: 'Hindu', dietary_preferences: 'Vegetarian', smoking: 'No' };
  const pool = [
    person('best', { ...match, education_level: "Master's", family_values: 'Moderate' }),
    person('lit', match),
    person('far', { ...match, location: 'London, United Kingdom' }),
  ];
  const plain = rankCandidates(me, pool, '', {}, 50, NOW).candidates;
  const lit = rankCandidates(me, pool, '', {}, 50, NOW, undefined, new Set(['lit', 'far'])).candidates;
  assertEquals(lit[0].id, 'lit', 'in Spotlight and nearby: first');
  assertEquals([lit[0].spotlight, lit.find((c) => c.id === 'far')?.spotlight], [true, undefined], 'only the one nearby is marked');
  assertEquals(plain.some((c) => c.spotlight), false, 'nobody marked without Spotlight');
  const poor = person('poor', { location: 'Mumbai, MH', religion: 'Muslim', dietary_preferences: 'Non-Vegetarian', smoking: 'Yes',
    drinking: 'Regularly', age: 45 });
  const [c] = rankCandidates(me, [poor], '', {}, 50, NOW, undefined, new Set(['poor'])).candidates;
  assertEquals([c.compatibilityScore < 50, c.spotlight], [true, undefined], 'a poor match is not marked or pushed up');
});

Deno.test('"New" for people who joined this week; "Usually replies" from member_stats', () => {
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  const pool = [
    person('new', { account_created: daysAgo(2), replies_usually: true }),
    person('old', { account_created: daysAgo(40), replies_usually: false }),
    person('unknown'),
  ];
  const out = rankCandidates(me, pool, '', {}, 10, NOW).candidates;
  const labels = Object.fromEntries(out.map((c) => [c.id, [c.isNew, c.repliesUsually]]));
  assertEquals(labels, { new: [true, true], old: [false, false], unknown: [false, false] });
  // Neither the date joined nor the reply figures go to the browser as details
  assertEquals(out.some((c) => 'accountCreated' in c || 'repliesUsually' in c && typeof c.repliesUsually !== 'boolean'), false);
});

// ---- Phase 3 of the review fixes: preferences and search -------------------------------------

Deno.test('near misses: one thing missed by a little, only when few people pass', () => {
  const pool = [
    person('fits', { age: 27, is_verified: true }),
    person('a-bit-older', { age: 31, is_verified: true }),
    person('much-older', { age: 40, is_verified: true }),
    person('unverified', { age: 27 }),
    person('two-misses', { age: 31 }),
    person('woman', { age: 27, gender: 'Woman', is_verified: true }),
  ];
  const run = (filters: Record<string, unknown>, prompt = '') =>
    rankCandidates(me, pool, prompt, sanitizeFilters(filters), 50, NOW, undefined, undefined, { nearMisses: { below: 5, max: 10 } });
  const out = run({ ageRange: [25, 28], isVerified: true });
  assertEquals(out.candidates.map((c) => c.id), ['fits', 'woman'], 'who fits');
  assertEquals(Object.fromEntries(out.nearMisses.map((c) => [c.id, c.missed])),
    { 'a-bit-older': 'Age 31', unverified: 'Not verified yet' }, 'near misses, with what they miss');
  // "a man" is never missed by a little
  assertEquals(run({ ageRange: [25, 28] }, 'a man').nearMisses.some((c) => c.id === 'woman'), false, 'gender is never a near miss');
  // Enough results: no near misses
  const many = rankCandidates(me, pool, '', sanitizeFilters({ ageRange: [18, 60] }), 50, NOW, undefined, undefined,
    { nearMisses: { below: 5, max: 10 } });
  assertEquals(many.nearMisses.length, 0, 'none when 5 or more fit');
});

Deno.test('near misses: height by an inch or two, the next level of education', () => {
  const pool = [
    person('tall', { height_cm: 175, education_level: "Master's" }),
    person('short', { height_cm: 168, education_level: "Master's" }),
    person('bachelor', { height_cm: 175, education_level: "Bachelor's" }),
    person('school', { height_cm: 175, education_level: 'High School' }),
  ];
  const out = rankCandidates(me, pool, '', sanitizeFilters({ heightRange: [173, 190], educationLevel: "Master's" }), 50, NOW,
    undefined, undefined, { nearMisses: { below: 5, max: 10 } });
  assertEquals(out.candidates.map((c) => c.id), ['tall']);
  assertEquals(Object.fromEntries(out.nearMisses.map((c) => [c.id, c.missed])),
    { short: `Height 5'6"`, bachelor: "Education: Bachelor's" });
});

Deno.test('partner preferences: from the table, without Shaadi24+, and what the member asked for wins', () => {
  assertEquals(prefsFromRow(null), null);
  assertEquals(prefsFromRow({ religions: [], states: [], no_smoking: false, age_min: null }), null, 'nothing set');
  const prefs = prefsFromRow({
    age_min: 25, age_max: 30, height_min_cm: null, height_max_cm: 180, religions: ['Hindu', 'Jain'], mother_tongues: ['Tamil'],
    states: ['Tamil Nadu'], countries: [], no_smoking: true, alerts: true,
  })!;
  assertEquals(prefs, {
    ageRange: [25, 30], heightRange: [0, 180], religions: ['Hindu', 'Jain'], motherTongues: ['Tamil'],
    states: ['Tamil Nadu'], noSmoking: true,
  });
  assertEquals(Object.keys(prefsWithoutPro(prefs)), ['ageRange', 'states'], 'age and place are everyone\'s');
  const asked = effectivePrefs(prefs, sanitizeFilters({ religion: 'Sikh', ageRange: [30, 35] }), parsePrompt('in Pune'));
  assertEquals(Object.keys(asked), ['heightRange', 'motherTongues', 'states', 'noSmoking'], 'a filter replaces its preference');
  const city = effectivePrefs(prefs, {}, parsePrompt('near me'));
  assertEquals('states' in city, false, '"near me" replaces the places');
});

Deno.test('partner preferences as search filters: strict, like the filter panel', () => {
  const pool = [
    person('fits', { age: 27, religion: 'Jain', mother_tongue: 'Tamil', state: 'Tamil Nadu', country: 'India', smoking: 'No' }),
    person('smokes', { age: 27, religion: 'Hindu', mother_tongue: 'Tamil', state: 'Tamil Nadu', country: 'India', smoking: 'Socially' }),
    person('silent', { age: 27, mother_tongue: 'Tamil', state: 'Tamil Nadu', country: 'India' }),
    person('karnataka', { age: 27, religion: 'Hindu', mother_tongue: 'Tamil', state: 'Karnataka', country: 'India' }),
    person('abroad', { age: 27, religion: 'Hindu', mother_tongue: 'Tamil', country: 'USA', smoking: 'No' }),
  ];
  const prefs = prefsFromRow({ age_min: 25, age_max: 30, religions: ['Hindu', 'Jain'], mother_tongues: ['Tamil'],
    states: ['Tamil Nadu'], countries: [], no_smoking: true })!;
  const strict = rankCandidates(me, pool, '', {}, 50, NOW, undefined, undefined, { prefs }).candidates.map((c) => c.id);
  assertEquals(strict, ['fits'], 'only who fits every preference (not saying is left out)');
  // With the USA among the countries, anywhere there fits too
  const withUsa = rankCandidates(me, pool, '', {}, 50, NOW, undefined, undefined,
    { prefs: { ...prefs, countries: ['India', 'USA'] } }).candidates.map((c) => c.id).sort();
  assertEquals(withUsa, ['abroad', 'fits']);
});

Deno.test('partner preferences for Standouts and alerts: who fits more comes first; not saying isn\'t held against anyone', () => {
  const prefs = prefsFromRow({ religions: ['Hindu'], diets: ['Vegetarian'], age_min: 25, age_max: 32 })!;
  const c = (fields: Record<string, unknown>) => ({ age: 28, ...fields });
  assertEquals(prefMisses(c({ religion: 'Hindu', dietaryPreferences: 'Vegetarian' }), prefs), 0);
  assertEquals(prefMisses(c({}), prefs), 0, 'unknown answers');
  assertEquals(prefMisses(c({ religion: 'Muslim', dietaryPreferences: 'Non-vegetarian', age: 40 }), prefs), 3);
  const pool = [
    person('poor-fit', { religion: 'Muslim', dietary_preferences: 'Non-vegetarian' }),
    person('fits', { religion: 'Hindu', dietary_preferences: 'Vegetarian' }),
  ];
  const ranked = rankCandidates(me, pool, '', {}, 50, NOW, undefined, undefined, { preferFitting: prefs }).candidates;
  assertEquals(ranked.map((r) => [r.id, r.prefMisses]), [['fits', 0], ['poor-fit', 2]]);
});

Deno.test('family home state and who manages the profile', () => {
  const pool = [
    person('answer', { family_state: 'Gujarat' }),
    person('typed', { family_location: 'Surat, Gujarat' }),
    person('elsewhere', { family_state: 'Punjab', family_location: 'Ludhiana' }),
    person('hidden', { family_state: 'Gujarat', family_location: 'Surat', hidden_fields: ['familyLocation'] }),
  ];
  assertEquals(ids(pool, '', { familyState: 'Gujarat' }).sort(), ['answer', 'typed'], 'the answer, or "Family lives in" naming it; hidden stays hidden');
  const managed = [
    person('self', { profile_created_for: 'Myself' }),
    person('before', {}),
    person('parents', { profile_created_for: 'Daughter' }),
    person('sister', { profile_created_for: 'Sister' }),
  ];
  assertEquals(ids(managed, '', { managedBy: 'Self' }).sort(), ['before', 'self'], 'profiles from before the question count as their own');
  assertEquals(ids(managed, '', { managedBy: 'Parents' }), ['parents']);
  assertEquals(ids(managed, '', { managedBy: 'Sibling, relative or friend' }), ['sister']);
  assertEquals(sanitizeFilters({ managedBy: 'Astrologer' }), {}, 'an unknown choice is dropped');
});
