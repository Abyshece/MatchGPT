// Stand-in for Google's Gemini API, for testing AI search locally without a
// real key. Answers generateContent calls with a search plan built from a few
// cues in the prompt (girl/woman, Pune, near me, online, under 30, smoking,
// vegetarian, book), using the profile answers listed in the request, and
// returns "out of quota" (429) for prompts containing "quota". Blog requests
// (supabase/functions/blog-ai) get a fixed answer for each task: ideas, a
// draft, the search fields, or the text rewritten in capitals.
//
//   node tests/e2e/gemini-standin.cjs          # listens on :8787, GET /stats shows calls
//   # serve the functions with an env file containing:
//   #   GEMINI_API_KEY=test-key
//   #   GEMINI_API_BASE=http://<docker gateway, e.g. 172.18.0.1>:8787/v1beta
//   npx supabase functions serve --env-file <that file>
const http = require('http');
let calls = 0;
const log = [];
const SEO = {
  seo_title: 'Questions to Ask Before Marriage: A Practical Guide',
  seo_description: 'The questions to ask before marriage, about money, family, careers and children, so you both start married life with fewer surprises.',
  excerpt: 'The conversations worth having before you say yes.',
  slug: 'questions-to-ask-before-marriage',
  tags: ['before marriage', 'family'],
  focus_keyword: 'questions to ask before marriage',
};
function blogAnswer(task, text) {
  if (task === 'ideas') {
    return { ideas: [
      { title: 'Questions to ask before marriage', angle: 'The talks that matter', keyword: 'questions to ask before marriage' },
      { title: 'Meeting his parents for the first time', angle: 'What to expect', keyword: 'meeting parents first time' },
    ] };
  }
  if (task === 'seo') return SEO;
  if (task === 'rewrite') return { text: (text.split('\nText:\n')[1] || '').toUpperCase() };
  const para = 'Talking openly before marriage about money, family and plans helps you both start well. '.repeat(4);
  return {
    ...SEO,
    title: 'Questions to Ask Before Marriage',
    content: `# Questions to Ask Before Marriage\n\nThese questions to ask before marriage help. ${para}\n\n## Money\n\n${para}\n\n## Family\n\n- Where will you live?\n- How often will you visit family?\n\n## In short\n\n${para}`,
    cover_alt: 'A couple talking over chai',
  };
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/stats') {
    res.end(JSON.stringify({ calls, log }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls++;
    const m = req.url.match(/^\/v1beta\/models\/([^:]+):generateContent$/);
    const key = req.headers['x-goog-api-key'];
    const reqJson = JSON.parse(body || '{}');
    const text = reqJson?.contents?.[0]?.parts?.[0]?.text ?? '';
    const blogTask = (text.match(/^Blog task: (\w+)\./) || [])[1];
    if (blogTask) {
      log.push({ model: m && m[1], key, blogTask });
      if (!m || key !== 'test-key') { res.writeHead(403); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(blogAnswer(blogTask, text)) }] }, finishReason: 'STOP' }] }));
      return;
    }
    const prompt = JSON.parse((text.match(/\nSearch: (.*)$/s) || [, '""'])[1]);
    log.push({ model: m && m[1], key, prompt, hasSchema: !!reqJson?.generationConfig?.responseJsonSchema });
    if (!m || key !== 'test-key') { res.writeHead(403); res.end('{}'); return; }
    if (/quota/i.test(prompt)) { res.writeHead(429); res.end('{"error":{"code":429}}'); return; }
    const answers = {};
    for (const line of text.split('\n')) {
      const mm = line.match(/^([a-z_]+): (.*)$/);
      if (mm) answers[mm[1]] = mm[2].split(' | ');
    }
    const plan = { gender: 'any', age_min: 0, age_max: 0, near_me: false, city: '', online_now: false,
      recently_active: false, verified_only: false, avoid: [], preferences: [], keywords: [] };
    if (/girl|woman|women/i.test(prompt)) plan.gender = 'woman';
    if (/pune/i.test(prompt)) plan.city = 'Pune';
    if (/near me|nearby/i.test(prompt)) plan.near_me = true;
    if (/online/i.test(prompt)) plan.online_now = true;
    if (/under 30/i.test(prompt)) plan.age_max = 29;
    if (/smok/i.test(prompt)) plan.avoid.push('smoking');
    if (/vegetarian/i.test(prompt)) plan.preferences.push({ field: 'dietary_preferences',
      answers: (answers.dietary_preferences || []).filter((a) => /Vegetarian|Vegan|Jain/.test(a)), negated: false });
    if (/book/i.test(prompt)) plan.keywords.push({ words: ['books', 'reading', 'novels', 'literature'], negated: false });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] }, finishReason: 'STOP' }] }));
  });
}).listen(8787, '0.0.0.0', () => console.log('gemini stand-in on :8787'));
