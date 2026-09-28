// Tests for ai.ts, with a stand-in for Gemini. Run from the repo root:
//   deno test --no-config supabase/functions/search/ai_test.ts
import { readPlan, requestBody, resetAiState, scrub, understandPrompt, type Catalog } from './ai.ts';

function assertEquals(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected ${e}\n  actual   ${a}`);
}

const catalog: Catalog = {
  dietary_preferences: ['Eggetarian', 'Jain', 'No restrictions', 'Vegan', 'Vegetarian'],
  religion: ['Hindu', 'Sikh'],
};

// A Gemini reply carrying `plan` as its JSON text.
const reply = (plan: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] }, finishReason: 'STOP' }] }));

const emptyPlan = {
  gender: 'any', age_min: 0, age_max: 0, height_min_cm: 0, height_max_cm: 0, near_me: false, city: '', online_now: false,
  recently_active: false, verified_only: false, avoid: [], preferences: [], keywords: [],
};

Deno.test('request: model in the URL, key in a header, answers and prompt in the text', async () => {
  resetAiState();
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return Promise.resolve(reply(emptyPlan));
  };
  const result = await understandPrompt('a vegetarian girl, mail me at a@b.co or 98765 43210', catalog,
    { apiKey: 'k', fetch: fake as typeof fetch });
  assertEquals(result.plan !== null, true, 'plan');
  assertEquals(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
  assertEquals((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], 'k');
  const body = JSON.parse(String(calls[0].init.body));
  const text: string = body.contents[0].parts[0].text;
  assertEquals(text.includes('dietary_preferences: Eggetarian | Jain | No restrictions | Vegan | Vegetarian'), true, 'catalog');
  assertEquals(text.includes('a@b.co') || text.includes('98765'), false, 'email and phone removed');
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assertEquals(body.generationConfig.responseJsonSchema.properties.preferences.items.properties.field.enum,
    ['dietary_preferences', 'religion']);
});

Deno.test('request: Gemini 2.5 gets a zero thinking budget and temperature 0', () => {
  const body = requestBody('gemini-2.5-flash-lite', 'x', {});
  assertEquals([body.generationConfig.temperature, body.generationConfig.thinkingConfig], [0, { thinkingBudget: 0 }]);
});

Deno.test('scrub: emails and phone numbers go, ages stay', () => {
  assertEquals(scrub('between 25-30, call +91 98765 43210 or x@y.com'), 'between 25-30, call or');
});

Deno.test('readPlan: keeps what makes sense, drops the rest', () => {
  const plan = readPlan({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      ...emptyPlan,
      gender: 'woman', age_min: 25, age_max: 120, city: 'Pune', near_me: true,
      avoid: ['smoking', 'gambling', 'marijuana'],
      preferences: [
        { field: 'dietary_preferences', answers: ['vegetarian', 'Vegan', 'Meat'], negated: false },
        { field: 'height', answers: ['tall'], negated: false },
        { field: 'religion', answers: ['Hindu'], negated: true },
      ],
      keywords: [{ words: ['doctor', 'MBBS', ''], negated: false }, { words: [], negated: true }],
    }) }] } }],
  }, 'a vegetarian girl in pune near me', catalog);
  assertEquals(plan, {
    gender: 'woman', ageMin: 25, ageMax: null, heightMinCm: null, heightMaxCm: null, nearMe: true, city: 'Pune', online: false,
    recentlyActive: false, verified: false, avoid: ['smoking'],
    preferences: [
      { field: 'dietary_preferences', answers: ['Vegetarian', 'Vegan'], negated: false },
      { field: 'religion', answers: ['Hindu'], negated: true },
    ],
    keywords: [{ words: ['doctor', 'MBBS'], negated: false }],
  });
});

Deno.test('readPlan: heights between 120 and 230 cm, the lower one first', () => {
  const read = (min: number, max: number) => {
    const p = readPlan({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      ...emptyPlan, height_min_cm: min, height_max_cm: max,
    }) }] } }] }, 'taller than 5 feet 6', catalog);
    return [p?.heightMinCm, p?.heightMaxCm];
  };
  assertEquals(read(170, 0), [170, null]);
  assertEquals(read(163, 173), [163, 173]);
  assertEquals(read(180, 160), [null, null]);
  assertEquals(read(12, 999), [null, null]);
});

Deno.test('request: the plan asks for heights, and only smoking and drinking as habits', () => {
  const schema = requestBody('gemini-3.1-flash-lite', 'x', {}).generationConfig.responseJsonSchema;
  assertEquals([schema.properties.height_min_cm.type, schema.properties.avoid.items.enum], ['integer', ['smoking', 'drinking']]);
});

Deno.test('readPlan: a place that is not in the prompt is ignored; unreadable replies give nothing', () => {
  const plan = readPlan({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...emptyPlan, city: 'Delhi' }) }] } }] },
    'someone kind', catalog);
  assertEquals(plan?.city, null);
  assertEquals(readPlan({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }, 'x', catalog), null);
  assertEquals(readPlan({}, 'x', catalog), null);
});

Deno.test('a model Google does not offer: the next one is tried and remembered', async () => {
  resetAiState();
  const urls: string[] = [];
  const fake = (url: string | URL | Request) => {
    urls.push(String(url));
    return Promise.resolve(String(url).includes('3.1') ? new Response('{}', { status: 404 }) : reply(emptyPlan));
  };
  const first = await understandPrompt('kind', catalog, { apiKey: 'k', fetch: fake as typeof fetch });
  assertEquals(first.plan !== null && 'model' in first ? first.model : null, 'gemini-3.5-flash-lite');
  await understandPrompt('kind again', catalog, { apiKey: 'k', fetch: fake as typeof fetch });
  assertEquals(urls.length, 3, 'second call goes straight to the working model');
});

Deno.test('out of free quota: no plan, and Gemini is left alone for a minute', async () => {
  resetAiState();
  let calls = 0;
  let clock = 1_000_000;
  const fake = () => { calls++; return Promise.resolve(new Response('{}', { status: 429 })); };
  const opts = { apiKey: 'k', fetch: fake as typeof fetch, now: () => clock };
  assertEquals((await understandPrompt('kind', catalog, opts)).plan, null);
  assertEquals((await understandPrompt('kind', catalog, opts) as { reason: string }).reason, 'paused');
  clock += 61_000;
  await understandPrompt('kind', catalog, opts);
  assertEquals(calls, 2);
});

Deno.test('no key, empty prompt, errors and timeouts: no plan', async () => {
  resetAiState();
  const never = () => Promise.reject(new Error('should not be called'));
  assertEquals((await understandPrompt('kind', catalog, { apiKey: '', fetch: never }) as { reason: string }).reason, 'no_key');
  assertEquals((await understandPrompt(' 98765 43210 ', catalog, { apiKey: 'k', fetch: never }) as { reason: string }).reason, 'empty');
  const broken = () => Promise.resolve(new Response('oops', { status: 500 }));
  assertEquals((await understandPrompt('kind', catalog, { apiKey: 'k', fetch: broken as typeof fetch }) as { reason: string }).reason, 'error');
  const down = () => Promise.reject(new DOMException('timed out', 'TimeoutError'));
  assertEquals((await understandPrompt('kind', catalog, { apiKey: 'k', fetch: down as typeof fetch }) as { reason: string }).reason, 'error');
});
