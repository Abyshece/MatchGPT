// ============================================================================
// "Write a draft for me": a first draft of About me and About my family, made
// from the member's own answers, for them to edit (My Profile). Many people
// find it hard to write about themselves, and families making a profile for a
// son or daughter even more so. It's put together on the phone; nothing is
// sent anywhere. A profile made for someone else is written about them
// ("Rahul works as…"); the member's own in the first person.
// ============================================================================

import type { UserProfile } from '../types';

type Person = {
  self: boolean;
  name: string;          // the first name, for someone else's profile
  subject: string;       // I / He / She / Rahul
  object: string;        // me / him / her / Rahul
  possessive: string;    // my / his / her / Rahul's
};

function person(p: UserProfile): Person {
  const forWhom = p.profileCreatedFor ?? 'Myself';
  if (forWhom === 'Myself') return { self: true, name: '', subject: 'I', object: 'me', possessive: 'my' };
  const name = (p.name ?? '').trim().split(/\s+/)[0] || 'They';
  const male = ['Son', 'Brother'].includes(forWhom) || p.gender === 'Male';
  const female = ['Daughter', 'Sister'].includes(forWhom) || p.gender === 'Female';
  if (male) return { self: false, name, subject: 'He', object: 'him', possessive: 'his' };
  if (female) return { self: false, name, subject: 'She', object: 'her', possessive: 'her' };
  // No pronoun we can be sure of: the name throughout
  return { self: false, name, subject: name, object: name, possessive: `${name}'s` };
}

// "I work" or "he works": the verb for the person
const verb = (who: Person, base: string, third = `${base}s`) => (who.self ? base : third);
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? '' : '.');
const an = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

// "Software Professional" → "software professional"; "CA / Accountant" → "CA / accountant"
const lowerWords = (text: string) => text.split(' ').map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w)).join(' ');
// "B.Tech (Bachelor of Technology)" → "B.Tech"
const shortDegree = (degree: string) => degree.replace(/\s*\(.*\)\s*$/, '').trim();
// "Reading, Cricket, Cooking, Travel" → "reading, cricket and cooking"
function listOf(items: string[]): string {
  const words = items.map(lowerWords);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
const given = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v !== 'Not specified';

const EDUCATION: Record<string, [string, string]> = {
  // [first person, third person]
  'High School': ['finished high school', 'finished high school'],
  'Diploma': ['have a diploma', 'has a diploma'],
  "Bachelor's": ["have a bachelor's degree", "has a bachelor's degree"],
  "Master's": ["have a master's degree", "has a master's degree"],
  'PhD': ['have a PhD', 'has a PhD'],
  'Trade School': ['went to trade school', 'went to trade school'],
  'Self-taught': ['am self-taught', 'is self-taught'],
};

const DIET: Record<string, [string, string]> = {
  'Vegetarian': ["I'm vegetarian", 'is vegetarian'], 'Non-vegetarian': ["I'm non-vegetarian", 'is non-vegetarian'],
  'Eggetarian': ["I'm eggetarian", 'is eggetarian'], 'Vegan': ["I'm vegan", 'is vegan'],
  'Jain': ['I follow a Jain diet', 'follows a Jain diet'], 'Halal': ['I eat halal', 'eats halal'],
};

const PERSONALITY: Record<string, [string, string]> = {
  'Introvert': ["I'm on the quieter side", 'is on the quieter side'],
  'Ambivert': ['I enjoy both a quiet evening and a good get-together', 'enjoys both a quiet evening and a good get-together'],
  'Extrovert': ['I love meeting people', 'loves meeting people'],
  'Social Butterfly': ['I love meeting people', 'loves meeting people'],
  'Homebody': ["I'm a homebody at heart", 'is a homebody at heart'],
};

/** A first draft of "About me" (always at least a couple of sentences). */
export function draftAboutMe(p: UserProfile): string {
  const who = person(p);
  const lines: string[] = [];
  const s = who.self ? 'I' : who.name;   // the first sentence names them

  const place = [p.city, p.country === 'India' ? p.state : p.country].filter(given).join(', ');
  if (given(p.occupation) && p.employedIn !== 'Not working') {
    lines.push(`${s} ${verb(who, 'work')} as ${an(lowerWords(p.occupation))}${place ? ` and ${verb(who, 'live')} in ${place}` : ''}`);
  } else if (place) {
    lines.push(`${s} ${verb(who, 'live')} in ${place}`);
  }

  if (given(p.degree)) {
    lines.push(`${who.subject} studied ${shortDegree(p.degree)}${given(p.university) ? ` at ${p.university.trim()}` : ''}`);
  } else if (given(p.educationLevel) && EDUCATION[p.educationLevel]) {
    lines.push(`${who.subject} ${EDUCATION[p.educationLevel][who.self ? 0 : 1]}`);
  }

  if (given(p.hometown) && p.hometown.trim().toLowerCase() !== (p.city ?? '').trim().toLowerCase()) {
    lines.push(`${who.subject} grew up in ${p.hometown.trim()}`);
  }

  if (['Very close', 'Very Close', 'Close', 'Moderately Close'].includes(p.familyCloseness ?? '')) {
    lines.push(`family means a lot to ${who.object}`);
  }

  const hobbies = (p.hobbies ?? '').split(',').map((h) => h.trim()).filter(Boolean).slice(0, 3);
  if (hobbies.length) {
    // "he" and "she" mid-sentence; a name stays as it is
    const subject = ['He', 'She'].includes(who.subject) ? who.subject.toLowerCase() : who.subject;
    lines.push(`in ${who.possessive} free time ${subject} ${verb(who, 'enjoy')} ${listOf(hobbies)}`);
  }

  const diet = DIET[p.dietaryPreferences ?? ''];
  if (diet) lines.push(who.self ? diet[0] : `${who.subject} ${diet[1]}`);

  const personality = PERSONALITY[p.socialBattery ?? ''];
  if (personality) lines.push(who.self ? personality[0] : `${who.subject} ${personality[1]}`);

  lines.push(who.self
    ? "I'm looking for a partner who is kind and honest, and ready to build a happy life together"
    : `We're looking for a partner for ${who.object} who is kind and honest, and ready to build a happy life together`);

  return lines.map(sentence).join(' ');
}

const FATHER: Record<string, string> = {
  'Businessman / Entrepreneur': 'runs a business', 'Private Employee': 'works in the private sector',
  'Govt. / PSU Employee': 'works in government service', 'Armed Forces Employee': 'serves in the armed forces',
  'Civil Servant': 'is a civil servant', 'Teacher': 'is a teacher', 'Retired': 'is retired',
};
const MOTHER: Record<string, string> = {
  'Homemaker': 'is a homemaker', 'Businesswoman / Entrepreneur': 'runs a business',
  'Private Employee': 'works in the private sector', 'Govt. / PSU Employee': 'works in government service',
  'Armed Forces Employee': 'serves in the armed forces', 'Civil Servant': 'is a civil servant',
  'Teacher': 'is a teacher', 'Retired': 'is retired',
};
const COUNT: Record<string, string> = { '1': 'one', '2': 'two', '3': 'three', '3+': 'more than three' };

/** Whether the family answers say enough for a draft of About my family to work from. */
export function hasFamilyDetails(p: UserProfile): boolean {
  return [p.familyType, p.familyValues, p.familyLocation, p.fatherOccupation, p.motherOccupation, p.brothers, p.sisters]
    .some(given);
}

/** A first draft of "About my family". */
export function draftAboutFamily(p: UserProfile): string {
  const who = person(p);
  const lines: string[] = [];
  const whose = who.self ? 'my' : `${who.name}'s`;

  const type = given(p.familyType) && p.familyType !== 'Other' ? p.familyType.toLowerCase() : '';
  const values = given(p.familyValues) ? ` with ${p.familyValues.toLowerCase()} values` : '';
  const where = given(p.familyLocation) ? `, based in ${p.familyLocation.trim()}` : '';
  if (type || values || where) lines.push(`we're a ${type || 'family'}${values}${where}`);

  // "Rahul's father runs a business and his mother is a homemaker"
  const father = FATHER[p.fatherOccupation ?? ''];
  const mother = MOTHER[p.motherOccupation ?? ''];
  if (father && mother) lines.push(`${whose} father ${father} and ${who.self ? 'my' : who.possessive} mother ${mother}`);
  else if (father) lines.push(`${whose} father ${father}`);
  else if (mother) lines.push(`${whose} mother ${mother}`);
  if (p.fatherOccupation === 'Passed away') lines.push(`${whose} father has passed away`);
  if (p.motherOccupation === 'Passed away') lines.push(`${whose} mother has passed away`);

  const brothers = COUNT[p.brothers ?? ''];
  const sisters = COUNT[p.sisters ?? ''];
  const has = who.self ? 'I have' : `${who.subject} has`;
  if (brothers || sisters) {
    const parts = [
      brothers && `${brothers} ${p.brothers === '1' ? 'brother' : 'brothers'}`,
      sisters && `${sisters} ${p.sisters === '1' ? 'sister' : 'sisters'}`,
    ].filter(Boolean);
    lines.push(`${has} ${parts.join(' and ')}`);
  } else if (p.brothers === '0' && p.sisters === '0') {
    lines.push(who.self ? "I'm an only child" : `${who.subject} is an only child`);
  }

  lines.push('we look forward to getting to know your family');
  return lines.map(sentence).join(' ');
}
