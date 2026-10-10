// ============================================================================
// Partner preferences (partner_preferences in the database)
//
// What a member is looking for: ages, heights, religions, mother tongues,
// marital status, diets, Manglik, places, and no smoking or drinking.
//   - Standouts put the people who fit them first (the search function)
//   - Search starts from them while "Use my partner preferences" is on in the
//     filters (FilterOptions.usePreferences); a filter the member sets
//     replaces the preference about the same thing
//   - With alerts on, a notification once a day about new members who fit
//     (the search-alerts cron job); the list waits in Search History
// Only the member reads and writes their own; the database keeps what the
// alerts found, which members can't change.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { heightLabel } from './matrimonyOptions';

export interface PartnerPreferences {
  ageMin: number | null;
  ageMax: number | null;
  heightMinCm: number | null;
  heightMaxCm: number | null;
  religions: string[];
  motherTongues: string[];
  maritalStatuses: string[];
  diets: string[];
  manglik: string[];
  countries: string[];
  states: string[];
  noSmoking: boolean;
  noDrinking: boolean;
  alerts: boolean;
  /** New members the last alert found that the member hasn't looked at yet */
  newCount: number;
}

export const EMPTY_PREFERENCES: PartnerPreferences = {
  ageMin: null, ageMax: null, heightMinCm: null, heightMaxCm: null,
  religions: [], motherTongues: [], maritalStatuses: [], diets: [], manglik: [], countries: [], states: [],
  noSmoking: false, noDrinking: false, alerts: true, newCount: 0,
};

type Row = {
  age_min: number | null; age_max: number | null; height_min_cm: number | null; height_max_cm: number | null;
  religions: string[]; mother_tongues: string[]; marital_statuses: string[]; diets: string[]; manglik: string[];
  countries: string[]; states: string[]; no_smoking: boolean; no_drinking: boolean; alerts: boolean;
  new_ids: string[]; alerted_at: string | null; seen_at: string | null;
};

const fromRow = (r: Row): PartnerPreferences => ({
  ageMin: r.age_min, ageMax: r.age_max, heightMinCm: r.height_min_cm, heightMaxCm: r.height_max_cm,
  religions: r.religions ?? [], motherTongues: r.mother_tongues ?? [], maritalStatuses: r.marital_statuses ?? [],
  diets: r.diets ?? [], manglik: r.manglik ?? [], countries: r.countries ?? [], states: r.states ?? [],
  noSmoking: r.no_smoking, noDrinking: r.no_drinking, alerts: r.alerts,
  newCount: r.alerted_at && (!r.seen_at || r.seen_at < r.alerted_at) ? (r.new_ids ?? []).length : 0,
});

/** The member's preferences; null when they never set any. */
export async function loadPreferences(userId: string): Promise<{ prefs: PartnerPreferences | null; error: string | null }> {
  const { data, error } = await supabase.from('partner_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) return { prefs: null, error: error.message };
  return { prefs: data ? fromRow(data as Row) : null, error: null };
}

export async function savePreferences(userId: string, p: PartnerPreferences): Promise<{ error: string | null }> {
  const { error } = await supabase.from('partner_preferences').upsert({
    user_id: userId,
    age_min: p.ageMin, age_max: p.ageMax, height_min_cm: p.heightMinCm, height_max_cm: p.heightMaxCm,
    religions: p.religions, mother_tongues: p.motherTongues, marital_statuses: p.maritalStatuses, diets: p.diets,
    manglik: p.manglik, countries: p.countries, states: p.states, no_smoking: p.noSmoking, no_drinking: p.noDrinking,
    alerts: p.alerts, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  return { error: error?.message ?? null };
}

/** Whether anything is chosen (the alerts setting alone isn't a preference) */
export function hasPreferences(p: PartnerPreferences | null): p is PartnerPreferences {
  if (!p) return false;
  return p.ageMin !== null || p.ageMax !== null || p.heightMinCm !== null || p.heightMaxCm !== null
    || [p.religions, p.motherTongues, p.maritalStatuses, p.diets, p.manglik, p.countries, p.states].some((l) => l.length > 0)
    || p.noSmoking || p.noDrinking;
}

const feet = (cm: number) => heightLabel(Math.round(cm / 2.54)).replace(/ \(\d+ cm\)$/, '');
const list = (items: string[], max = 3) =>
  items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} +${items.length - max}`;

/** Short lines saying what the preferences are ("Age 25–30", "Hindu, Jain") */
export function preferenceSummary(p: PartnerPreferences): string[] {
  const out: string[] = [];
  if (p.ageMin !== null || p.ageMax !== null) {
    out.push(p.ageMin !== null && p.ageMax !== null ? `Age ${p.ageMin}–${p.ageMax}`
      : p.ageMin !== null ? `Age ${p.ageMin}+` : `Age up to ${p.ageMax}`);
  }
  if (p.heightMinCm !== null || p.heightMaxCm !== null) {
    out.push(p.heightMinCm !== null && p.heightMaxCm !== null ? `${feet(p.heightMinCm)}–${feet(p.heightMaxCm)}`
      : p.heightMinCm !== null ? `${feet(p.heightMinCm)} or taller` : `${feet(p.heightMaxCm as number)} or shorter`);
  }
  if (p.religions.length) out.push(list(p.religions));
  if (p.motherTongues.length) out.push(`Speaks ${list(p.motherTongues)}`);
  if (p.maritalStatuses.length) out.push(list(p.maritalStatuses));
  if (p.diets.length) out.push(list(p.diets));
  if (p.manglik.length) out.push(list(p.manglik));
  const places = [...p.states, ...p.countries.filter((c) => !(c === 'India' && p.states.length))];
  if (places.length) out.push(`In ${list(places)}`);
  if (p.noSmoking) out.push("Doesn't smoke");
  if (p.noDrinking) out.push("Doesn't drink");
  return out;
}

/** The member's preferences, loaded once; reload() after a change */
export function usePartnerPreferences(userId: string | undefined) {
  const [prefs, setPrefs] = useState<PartnerPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    if (!userId) return;
    const { prefs: p } = await loadPreferences(userId);
    setPrefs(p);
    setLoaded(true);
  }, [userId]);
  useEffect(() => { void reload(); }, [reload]);
  return { prefs, loaded, reload };
}
