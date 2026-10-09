// Tests for indic.ts and searches typed in Indian languages. Run from the repo root:
//   deno test --no-config supabase/functions/search/indic_test.ts
import { toEnglishWords } from './indic.ts';
import { describeParsed, parsePrompt } from './matching.ts';

function assertEquals(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected ${e}\n  actual   ${a}`);
}

const chips = (prompt: string) => describeParsed(parsePrompt(prompt));

Deno.test('Hinglish: the owner\'s example', () => {
  const p = parsePrompt('Mere liye 6 foot ka ladka dhundho jo london me rehta ho or finance me kaam karta ho.');
  assertEquals(p.gender, 'man');
  assertEquals(p.heightRange, [180, 186], 'about 6 feet');
  assertEquals(p.terms.map((t) => t.label), ['london', 'finance'], 'only the meaningful words are looked for');
});

Deno.test('Hinglish: ages, heights, habits, places', () => {
  assertEquals(parsePrompt('25 se 30 saal ki ladki').ageRange, [25, 30]);
  assertEquals(parsePrompt('30 saal se kam umar ki ladki').ageRange, [18, 29]);
  assertEquals(parsePrompt('30 se upar').ageRange, [31, 99]);
  assertEquals(parsePrompt('28 saal ka ladka').ageRange, [26, 30]);
  assertEquals(parsePrompt('5 feet 6 inch se lamba ladka').heightRange, [170, 230]);
  assertEquals(parsePrompt('6 fut se kam').heightRange, [120, 180]);
  const habits = parsePrompt('ladka jo sharab nahi peeta aur smoke nahi karta');
  assertEquals(habits.terms.map((t) => [t.label, t.negated]), [['drink', true], ['smoke', true]]);
  assertEquals(parsePrompt('shakahari ladki Dilli me').terms.map((t) => t.label), ['vegetarian', 'delhi']);
  assertEquals(parsePrompt('mere sheher me koi ladki').nearMe, true);
  assertEquals(parsePrompt('Punjabi kudi Canada vich').gender, 'woman');
});

Deno.test('Hindi in Devanagari', () => {
  const p = parsePrompt('मेरे लिए 6 फुट का लड़का ढूंढो जो लंदन में रहता हो और डॉक्टर हो');
  assertEquals(p.gender, 'man');
  assertEquals(p.heightRange, [180, 186]);
  assertEquals(p.terms.map((t) => t.label), ['london', 'doctor']);
  assertEquals(parsePrompt('२५ से ३० साल की शाकाहारी लड़की').ageRange, [25, 30], 'Devanagari digits');
  assertEquals(parsePrompt('शराब नहीं पीता').terms.map((t) => [t.label, t.negated]), [['drink', true]]);
});

Deno.test('Tamil, Telugu, Marathi, Bengali', () => {
  const tamil = parsePrompt('எனக்கு சென்னையில் ஒரு டாக்டர் பையன் வேண்டும்');
  assertEquals(tamil.gender, 'man');
  assertEquals(tamil.terms.map((t) => t.label), ['chennai', 'doctor']);
  assertEquals(parsePrompt('லண்டனில் பெண்').terms.map((t) => t.label), ['london'], 'Tamil endings on the word');
  assertEquals(parsePrompt('హైదరాబాద్ అమ్మాయి').gender, 'woman');
  assertEquals(parsePrompt('Pune madhli mulgi').gender, 'woman');
  assertEquals(parsePrompt('Kolkata r chele').gender, 'man');
});

Deno.test('English reads as before', () => {
  assertEquals(toEnglishWords('a vegetarian doctor in Pune who doesn\'t smoke'), 'a vegetarian doctor in Pune who doesn\'t smoke');
  assertEquals(parsePrompt('between 170 cm and 180 cm').heightRange, [170, 180]);
  assertEquals(toEnglishWords('170 to 180 cm'), '170 to 180 cm', 'heights in cm are not read as ages');
  assertEquals(parsePrompt('a 30 years old woman').ageRange, [28, 32]);
  assertEquals(chips('25 to 30 government job'), ['Age 25–30', 'government', 'job']);
  assertEquals(parsePrompt('government job').terms.map((t) => t.label), ['government', 'job']);
  assertEquals(parsePrompt('yoga mat lover').terms.map((t) => t.label), ['yoga', 'mat']);
  assertEquals(parsePrompt("taller than 5'6\"").heightRange, [170, 230]);
});
