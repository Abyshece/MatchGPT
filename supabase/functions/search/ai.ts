// ============================================================================
// Understanding search prompts with Google Gemini (free tier)
//
// Turns what someone typed ("a vegetarian doctor in Pune who doesn't smoke")
// into a SearchPlan (matching.ts): hard filters (gender, age, place, online,
// habits to avoid) and preferences that raise the score (profile answers, and
// words with synonyms to look for in bios, hobbies and jobs).
//
// Sent to Google: the typed text (emails and phone numbers removed) and the
// list of profile answers people in the pool have. Never names, photos or
// profiles. On Google's free tier Google may use the text to improve its
// products; the Privacy Policy says so.
//
// Needs the GEMINI_API_KEY secret (a free key from aistudio.google.com);
// GEMINI_MODEL optionally picks the model. understandPrompt() returns no plan
// whenever Gemini can't help (no key, slow, out of free quota, unusable
// answer), and search then uses the rule-based parser in matching.ts.
// ============================================================================

import type { Habit, SearchPlan } from './matching.ts';

export type Catalog = Record<string, string[]>;  // snake_case field → answers people have

export interface AiOptions {
  apiKey: string;
  model?: string;             // GEMINI_MODEL; otherwise DEFAULT_MODELS
  apiBase?: string;           // only for testing against a stand-in
  fetch?: typeof fetch;
  now?: () => number;
}

export type AiResult =
  | { plan: SearchPlan; model: string }
  | { plan: null; reason: 'empty' | 'no_key' | 'paused' | 'quota' | 'error' | 'unusable'; status?: number };

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Newest first. If Google says a model doesn't exist (retired, or not offered
// to new projects), the next one is tried.
export const DEFAULT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
const TIMEOUT_MS = 5000;
const QUOTA_PAUSE_MS = 60_000;  // after "out of free quota", don't ask again for a minute
const HABITS: Habit[] = ['smoking', 'drinking', 'marijuana', 'drugs'];

let workingModel: string | null = null;
let pausedUntil = 0;

export function resetAiState() {
  workingModel = null;
  pausedUntil = 0;
}

const INSTRUCTIONS = `You turn a search typed into a dating and marriage app into a JSON search plan.
The person describes who they want to meet. Record only what they asked for and leave the rest empty
(gender "any", ages 0, city "", false, empty lists). Never guess.

- gender: who they want to meet. girl, woman, lady, wife, bride -> "woman"; boy, guy, man, husband, groom -> "man".
- age_min, age_max: "under 30" -> age_max 29; "over 25" -> age_min 26; "25-30" or "between 25 and 30" -> 25 and 30;
  "in her 20s" -> 20 and 29; "late 20s" -> 26 and 29; "early 30s" -> 30 and 33. 0 when not said.
- near_me: "near me", "nearby", "around me", "local", "in my city".
- city: a city, area or country they name ("in Pune" -> "Pune"), written as they wrote it.
- online_now: "online", "active now". recently_active: "recently active", "active this week". verified_only: "verified".
- avoid: habits they don't want. "doesn't smoke", "non-smoker", "no smoking" -> smoking; "doesn't drink", "sober",
  "teetotaller" -> drinking; "no weed", "no cannabis" -> marijuana; "no drugs" -> drugs.
- preferences: anything that matches a profile answer in the list sent with the search. Use only those fields and
  answers, copied exactly, and include every answer that fits ("vegetarian" -> dietary_preferences: Vegetarian,
  Vegan, Jain when listed; "wants kids" -> family_plans: Wants children, Open to children). negated = true when they
  want to avoid those answers.
- keywords: everything else to look for in bios, hobbies and jobs, each as a few words or synonyms ("book lover" ->
  books, reading, novels, literature; "doctor" -> doctor, physician, MBBS, surgeon; "ambitious" -> ambitious,
  driven, motivated). negated = true for things they don't want ("not a lawyer").
Ignore words that only say they are searching ("find", "show me", "someone", "match", "partner", "most compatible").`;

function responseSchema(fields: string[]) {
  const words = { type: 'array', items: { type: 'string' } };
  return {
    type: 'object',
    properties: {
      gender: { type: 'string', enum: ['any', 'woman', 'man', 'nonbinary'] },
      age_min: { type: 'integer' },
      age_max: { type: 'integer' },
      near_me: { type: 'boolean' },
      city: { type: 'string' },
      online_now: { type: 'boolean' },
      recently_active: { type: 'boolean' },
      verified_only: { type: 'boolean' },
      avoid: { type: 'array', items: { type: 'string', enum: HABITS } },
      preferences: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', enum: fields.length > 0 ? fields : ['none'] },
            answers: words,
            negated: { type: 'boolean' },
          },
          required: ['field', 'answers', 'negated'],
        },
      },
      keywords: {
        type: 'array',
        items: {
          type: 'object',
          properties: { words, negated: { type: 'boolean' } },
          required: ['words', 'negated'],
        },
      },
    },
    required: [
      'gender', 'age_min', 'age_max', 'near_me', 'city', 'online_now', 'recently_active',
      'verified_only', 'avoid', 'preferences', 'keywords',
    ],
  };
}

export function requestBody(model: string, prompt: string, catalog: Catalog) {
  const answers = Object.entries(catalog).map(([field, values]) => `${field}: ${values.join(' | ')}`).join('\n');
  // Gemini 3 wants its default temperature; thinking is kept to a minimum for speed.
  const tuning = model.startsWith('gemini-3')
    ? { thinkingConfig: { thinkingLevel: 'minimal' } }
    : model.startsWith('gemini-2.5')
      ? { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
      : { temperature: 0 };
  return {
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{
      role: 'user',
      parts: [{ text: `Profile answers people have (field: answers):\n${answers || '(none)'}\n\nSearch: ${JSON.stringify(prompt)}` }],
    }],
    generationConfig: {
      ...tuning,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema(Object.keys(catalog)),
    },
  };
}

// Emails and phone numbers never leave the server.
export function scrub(prompt: string): string {
  return prompt
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/\+?\d[\d\s-]{6,}\d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const asAge = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 18 && n <= 99 ? n : null);
const asText = (s: unknown, max: number) => (typeof s === 'string' && s.trim() && s.trim().length <= max ? s.trim() : null);

// Gemini's answer → a SearchPlan, keeping only what makes sense: known
// habits, fields and answers from the catalog (matched without regard to
// case), a place that appears in the prompt, ages between 18 and 99.
export function readPlan(data: unknown, prompt: string, catalog: Catalog): SearchPlan | null {
  // deno-lint-ignore no-explicit-any
  const parts = (data as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const raw = parts.filter((p) => !p?.thought && typeof p?.text === 'string').map((p) => p.text).join('');
  // deno-lint-ignore no-explicit-any
  let out: any;
  try {
    out = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null;

  let ageMin = asAge(out.age_min);
  let ageMax = asAge(out.age_max);
  if (ageMin !== null && ageMax !== null && ageMin > ageMax) ageMin = ageMax = null;

  const city = asText(out.city, 60);

  const preferences = new Map<string, { field: string; answers: string[]; negated: boolean }>();
  for (const pref of Array.isArray(out.preferences) ? out.preferences : []) {
    const field = typeof pref?.field === 'string' ? pref.field : '';
    const known = catalog[field];
    if (!known || !Array.isArray(pref.answers)) continue;
    const answers = pref.answers
      .map((a: unknown) => (typeof a === 'string' ? known.find((k) => k.toLowerCase() === a.trim().toLowerCase()) : undefined))
      .filter((a: string | undefined): a is string => !!a);
    if (answers.length === 0) continue;
    const negated = pref.negated === true;
    const key = `${field}:${negated}`;
    const entry = preferences.get(key) ?? { field, answers: [], negated };
    entry.answers = [...new Set([...entry.answers, ...answers])];
    preferences.set(key, entry);
  }

  const keywords: SearchPlan['keywords'] = [];
  for (const group of Array.isArray(out.keywords) ? out.keywords : []) {
    const words = (Array.isArray(group?.words) ? group.words : [])
      .map((w: unknown) => asText(w, 40))
      .filter((w: string | null): w is string => !!w)
      .slice(0, 6);
    if (words.length > 0) keywords.push({ words, negated: group.negated === true });
  }

  return {
    gender: ['woman', 'man', 'nonbinary'].includes(out.gender) ? out.gender : null,
    ageMin,
    ageMax,
    nearMe: out.near_me === true,
    city: city && prompt.toLowerCase().includes(city.toLowerCase()) ? city : null,
    online: out.online_now === true,
    recentlyActive: out.recently_active === true,
    verified: out.verified_only === true,
    avoid: [...new Set((Array.isArray(out.avoid) ? out.avoid : []).filter((h: unknown) => HABITS.includes(h as Habit)))] as Habit[],
    preferences: [...preferences.values()].slice(0, 12),
    keywords: keywords.slice(0, 10),
  };
}

export async function understandPrompt(prompt: string, catalog: Catalog, opts: AiOptions): Promise<AiResult> {
  const text = scrub(prompt);
  if (!text) return { plan: null, reason: 'empty' };
  if (!opts.apiKey) return { plan: null, reason: 'no_key' };
  const now = opts.now ?? Date.now;
  if (now() < pausedUntil) return { plan: null, reason: 'paused' };

  const doFetch = opts.fetch ?? fetch;
  const models = opts.model ? [opts.model] : workingModel ? [workingModel] : DEFAULT_MODELS;
  for (const model of models) {
    let res: Response;
    try {
      res = await doFetch(`${opts.apiBase ?? API_BASE}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify(requestBody(model, text, catalog)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { plan: null, reason: 'error' };  // timed out or unreachable
    }
    if (res.status === 404) {
      await res.body?.cancel();
      continue;  // this model isn't available: try the next
    }
    if (res.status === 429) {
      await res.body?.cancel();
      pausedUntil = now() + QUOTA_PAUSE_MS;
      return { plan: null, reason: 'quota' };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { plan: null, reason: 'error', status: res.status };
    }
    const plan = readPlan(await res.json().catch(() => null), text, catalog);
    if (!plan) return { plan: null, reason: 'unusable' };
    workingModel = model;
    return { plan, model };
  }
  return { plan: null, reason: 'error', status: 404 };
}
