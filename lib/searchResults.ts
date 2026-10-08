// ============================================================================
// Find Match's results, as shown: the active filters as removable chips, the
// quick filters applied to the results already on screen, and the member's
// choice of order and match level (components/SearchView.tsx).
// ============================================================================

import { heightLabel } from './matrimonyOptions';
import type { FilterOptions, MatchCandidate } from '../types';

export const DEFAULT_FILTERS: FilterOptions = {
  isOnline: false,
  isVerified: false,
  isPremium: false,
};

const DEFAULT_AGE: [number, number] = [21, 45];

export interface FilterChipItem {
  key: string;
  label: string;
  /** The filters without this one */
  remove: (f: FilterOptions) => FilterOptions;
}

const cmLabel = (cm: number) => heightLabel(Math.round(cm / 2.54)).replace(/ \(\d+ cm\)$/, '');

/**
 * Every active filter, in the order the chips show them. The badge on the
 * filter button counts these, so a filter can't be on without a chip to
 * take it off.
 */
export function activeFilterChips(f: FilterOptions): FilterChipItem[] {
  const chips: FilterChipItem[] = [];
  const add = (key: keyof FilterOptions, label: string, off: FilterOptions[keyof FilterOptions] = undefined) =>
    chips.push({ key, label, remove: (prev) => ({ ...prev, [key]: off }) });

  if (f.isOnline) add('isOnline', 'Online now', false);
  if (f.recentlyActive) add('recentlyActive', 'Recently active', false);
  if (f.isVerified) add('isVerified', 'Verified', false);
  if (f.isPremium) add('isPremium', 'Shaadi24+', false);
  if (f.hasInstagram) add('hasInstagram', 'Has Instagram', false);
  if (f.hasLinkedin) add('hasLinkedin', 'Has LinkedIn', false);
  if (f.ageRange && (f.ageRange[0] !== DEFAULT_AGE[0] || f.ageRange[1] !== DEFAULT_AGE[1])) {
    add('ageRange', `Age ${f.ageRange[0]}–${f.ageRange[1]}`);
  }
  if (f.heightRange) add('heightRange', `Height ${cmLabel(f.heightRange[0])}–${cmLabel(f.heightRange[1])}`);
  if (f.country) {
    // The state goes with its country
    chips.push({ key: 'country', label: f.country, remove: (prev) => ({ ...prev, country: undefined, state: undefined }) });
  }
  if (f.state) add('state', f.state);
  if (f.neighborhood) add('neighborhood', f.neighborhood);
  if (f.religion) {
    // The caste list depends on the religion
    chips.push({ key: 'religion', label: f.religion, remove: (prev) => ({ ...prev, religion: undefined, caste: undefined }) });
  }
  if (f.caste) add('caste', f.caste);
  if (f.motherTongue) add('motherTongue', `Speaks ${f.motherTongue}`);
  if (f.maritalStatus) add('maritalStatus', f.maritalStatus);
  if (f.manglik) add('manglik', `Manglik: ${f.manglik}`);
  if (f.dietaryPreferences) add('dietaryPreferences', f.dietaryPreferences);
  if (f.educationLevel) add('educationLevel', f.educationLevel);
  if (f.datingIntention) add('datingIntention', f.datingIntention);
  if (f.children) add('children', `Has children: ${f.children}`);
  if (f.familyPlans) add('familyPlans', f.familyPlans);
  if (f.drinking) add('drinking', `Drinking: ${f.drinking}`);
  if (f.smoking) add('smoking', `Smoking: ${f.smoking}`);
  return chips;
}

/**
 * The quick filters (Online now, Verified, Has Instagram, Has LinkedIn) as
 * the server applies them, so turning one on narrows the results on screen
 * straight away, without another search.
 */
export function passesQuickFilters(c: MatchCandidate, f: FilterOptions): boolean {
  if (f.isOnline && !c.isOnline) return false;
  if (f.isVerified && !c.isVerified) return false;
  if (f.hasInstagram && !c.instagram) return false;
  if (f.hasLinkedin && !c.linkedin) return false;
  return true;
}

/** Whether `now` asks for anything the last search left out, so only a new search can show it */
export function widensSearch(now: FilterOptions, searched: FilterOptions): boolean {
  const before = new Map(activeFilterChips(searched).map((c) => [c.key, c.label]));
  const after = new Map(activeFilterChips(now).map((c) => [c.key, c.label]));
  for (const [key, label] of before) if (after.get(key) !== label) return true;
  // A filter added from the panel narrows on the server, not on screen
  const quick = new Set(['isOnline', 'isVerified', 'hasInstagram', 'hasLinkedin']);
  for (const key of after.keys()) if (!before.has(key) && !quick.has(key)) return true;
  return false;
}

// ---- Order --------------------------------------------------------------------------------

export type SortId = 'best' | 'lowest' | 'online' | 'verified' | 'youngest' | 'oldest';

const byScore = (a: MatchCandidate, b: MatchCandidate) => b.compatibilityScore - a.compatibilityScore;

export const SORTS: { id: SortId; label: string; short: string; compare: (a: MatchCandidate, b: MatchCandidate) => number }[] = [
  { id: 'best', label: 'Best match first', short: 'Best match', compare: byScore },
  { id: 'lowest', label: 'Lowest match first', short: 'Lowest match', compare: (a, b) => -byScore(a, b) },
  { id: 'online', label: 'Online now first', short: 'Online first', compare: (a, b) => Number(!!b.isOnline) - Number(!!a.isOnline) || byScore(a, b) },
  { id: 'verified', label: 'Verified first', short: 'Verified first', compare: (a, b) => Number(!!b.isVerified) - Number(!!a.isVerified) || byScore(a, b) },
  { id: 'youngest', label: 'Youngest first', short: 'Youngest', compare: (a, b) => (a.age || 999) - (b.age || 999) || byScore(a, b) },
  { id: 'oldest', label: 'Oldest first', short: 'Oldest', compare: (a, b) => (b.age || 0) - (a.age || 0) || byScore(a, b) },
];

// ---- Match level --------------------------------------------------------------------------
// Relative to the results: the best third, the middle third and the lowest
// third by match score (equal scores kept together), each with the scores it
// covers. (Fixed bands like "90% and above" would mostly be empty: scores
// bunch together.)

export type LevelId = 'all' | 'top' | 'middle' | 'lower';

export interface MatchLevel {
  id: LevelId;
  label: string;
  /** The scores it covers, like "59–65%" ('' when it has none) */
  range: string;
  count: number;
}

const LEVEL_LABELS: Record<LevelId, string> = {
  all: 'Any match', top: 'Top matches', middle: 'Middle matches', lower: 'Lower matches',
};
export const levelLabel = (id: LevelId) => LEVEL_LABELS[id];

/** The levels for these results (after the quick filters), and which level each result is in */
export function matchLevels(results: MatchCandidate[], filters: FilterOptions): { levels: MatchLevel[]; levelOf: Map<string, LevelId> } {
  const ranked = results.filter((c) => passesQuickFilters(c, filters)).sort(byScore);
  const n = ranked.length;
  // About a third each, but equal scores stay together (so no score is in
  // two levels): a cut inside a run of equal scores moves to whichever end
  // of the run is nearer, as long as the level before it isn't left empty
  const score = (i: number) => ranked[i].compatibilityScore;
  const cut = (target: number, from: number) => {
    if (target <= from) return from;
    if (target >= n || score(target - 1) !== score(target)) return target;
    let [start, end] = [target, target];
    while (start > from && score(start - 1) === score(target)) start--;
    while (end < n && score(end) === score(target)) end++;
    return start > from && target - start <= end - target ? start : end;
  };
  const cut1 = cut(Math.ceil(n / 3), 0);
  const cut2 = cut(Math.max(cut1, Math.ceil((2 * n) / 3)), cut1);
  const groups: [LevelId, MatchCandidate[]][] = [
    ['top', ranked.slice(0, cut1)],
    ['middle', ranked.slice(cut1, cut2)],
    ['lower', ranked.slice(cut2)],
  ];
  const range = (list: MatchCandidate[]) => {
    if (list.length === 0) return '';
    const [hi, lo] = [list[0].compatibilityScore, list[list.length - 1].compatibilityScore];
    return hi === lo ? `${hi}%` : `${lo}–${hi}%`;
  };
  const levelOf = new Map<string, LevelId>();
  for (const [id, list] of groups) for (const c of list) levelOf.set(c.id, id);
  return {
    levels: [
      { id: 'all', label: LEVEL_LABELS.all, range: range(ranked), count: ranked.length },
      ...groups.map(([id, list]) => ({ id, label: LEVEL_LABELS[id], range: range(list), count: list.length })),
    ],
    levelOf,
  };
}

/** The results to show: the quick filters, then the match level, in the chosen order */
export function arrangeResults(
  results: MatchCandidate[], filters: FilterOptions, sort: SortId, level: LevelId, levelOf: Map<string, LevelId>,
): MatchCandidate[] {
  const order = SORTS.find((s) => s.id === sort) ?? SORTS[0];
  return results
    .filter((c) => passesQuickFilters(c, filters) && (level === 'all' || levelOf.get(c.id) === level))
    .sort(order.compare);
}
