import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkInput, readAnswer, requestBody, resetWriterState, slugify, tidyMarkdown, write } from './writer.ts';

const gemini = (o: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
const LONG = 'A paragraph about meeting families for the first time, with practical advice. '.repeat(5);

Deno.test('slugify makes short, clean addresses', () => {
  assertEquals(slugify('Arranged vs Love Marriage: 7 Things!'), 'arranged-vs-love-marriage-7-things');
  assertEquals(slugify('  Café & Kundli  '), 'cafe-and-kundli');
  assertEquals(slugify('---'), '');
  assert(slugify('word '.repeat(60)).length <= 100);
  assert(!slugify('word '.repeat(60)).endsWith('-'));
});

Deno.test('tidyMarkdown drops a leading # title and extra blank lines', () => {
  assertEquals(tidyMarkdown('# My title\n\nFirst.\n\n\n\n## Next'), 'First.\n\n## Next');
  assertEquals(tidyMarkdown('## Kept\ntext'), '## Kept\ntext');
  assertEquals(tidyMarkdown(42), '');
});

Deno.test('checkInput asks for what each action needs', () => {
  assertEquals(checkInput('poem', {}), 'Unknown action');
  assertEquals(checkInput('draft', { topic: 'a' }), 'Say what the post is about');
  assertEquals(checkInput('draft', { topic: 'First meeting tips' }), null);
  assertEquals(checkInput('seo', { title: 'T', content: 'short' }), 'Write the title and some of the post first');
  assertEquals(checkInput('seo', { title: 'T', content: LONG }), null);
  assertEquals(checkInput('rewrite', { text: ' ' }), 'Nothing to rewrite');
  assertEquals(checkInput('ideas', {}), null);
});

Deno.test('requestBody asks for JSON in the right shape, with the house style', () => {
  const body = requestBody('gemini-3.5-flash', 'draft', { topic: 'First meeting tips', keyword: 'first meeting tips', length: 'long' });
  assert(body.systemInstruction.parts[0].text.includes('Never invent statistics'));
  const task = body.contents[0].parts[0].text;
  assert(task.startsWith('Blog task: draft.'));
  assert(task.includes('1,600 to 2,000 words'));
  assert(task.includes('"first meeting tips"'));
  assertEquals(body.generationConfig.responseMimeType, 'application/json');
  assert('content' in body.generationConfig.responseJsonSchema.properties);
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  assertEquals(requestBody('gemini-2.5-flash', 'seo', { title: 'T', content: LONG }).generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

Deno.test('readAnswer cleans up a draft', () => {
  const answer = readAnswer('draft', gemini({
    title: '  First Meeting   Tips ', content: `# First Meeting Tips\n\n${LONG}\n\n## Before`, cover_alt: 'Two cups of chai',
    seo_title: 'First meeting tips', seo_description: 'What to say', excerpt: 'Short.', slug: 'First Meeting Tips!',
    tags: ['Family', 'family', ' first meeting ', '', 'a', 'b', 'c', 'd'], focus_keyword: 'first meeting tips',
  }));
  assert(answer && answer.action === 'draft');
  assertEquals(answer.post.title, 'First Meeting Tips');
  assert(answer.post.content.startsWith('A paragraph'));
  assertEquals(answer.post.slug, 'first-meeting-tips');
  assertEquals(answer.post.tags, ['family', 'first meeting', 'a', 'b', 'c', 'd']);
});

Deno.test('readAnswer refuses what it cannot use', () => {
  assertEquals(readAnswer('draft', gemini({ title: 'T', content: 'too short' })), null);
  assertEquals(readAnswer('draft', { candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), null);
  assertEquals(readAnswer('ideas', gemini({ ideas: [] })), null);
  assertEquals(readAnswer('rewrite', gemini({ text: '' })), null);
  assertEquals(readAnswer('seo', null), null);
});

Deno.test('readAnswer: ideas, seo and rewrite', () => {
  const ideas = readAnswer('ideas', gemini({ ideas: [{ title: 'How to talk about money', angle: 'Before you marry', keyword: 'money before marriage' }, { title: '' }] }));
  assertEquals(ideas, { action: 'ideas', ideas: [{ title: 'How to talk about money', angle: 'Before you marry', keyword: 'money before marriage' }] });
  const seo = readAnswer('seo', gemini({ seo_title: 'A', seo_description: 'B', excerpt: 'C', slug: '', tags: ['x'], focus_keyword: 'k' }));
  assert(seo && seo.action === 'seo');
  assertEquals(seo.fields.seo_title, 'A');
  assertEquals(readAnswer('rewrite', gemini({ text: 'Better.\r\n' })), { action: 'rewrite', text: 'Better.' });
});

Deno.test('write tries the next model when one is missing, and reports quota and missing keys', async () => {
  resetWriterState();
  const asked: string[] = [];
  const fetchStub = (async (url: string) => {
    asked.push(url);
    if (url.includes('gemini-3.5-flash')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(gemini({ text: 'Rewritten.' })), { status: 200 });
  }) as unknown as typeof fetch;
  const ok = await write('rewrite', { text: 'Old.', instruction: 'shorter' }, { apiKey: 'k', fetch: fetchStub });
  assert(ok.ok);
  assertEquals(ok.model, 'gemini-3-flash');
  assertEquals(asked.length, 2);

  const quota = await write('ideas', {}, {
    apiKey: 'k', model: 'm', fetch: (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch,
  });
  assertEquals(quota.ok ? null : quota.reason, 'quota');

  const noKey = await write('ideas', {}, { apiKey: '' });
  assertEquals(noKey.ok ? null : noKey.reason, 'no_key');

  const bad = await write('draft', { topic: '' }, { apiKey: 'k' });
  assertEquals(bad.ok ? null : bad.reason, 'bad_request');
  resetWriterState();
});
