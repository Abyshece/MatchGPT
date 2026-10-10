// ============================================================================
// Your week: what happened for the member in the last 7 days (my_week() in
// supabase/migrations/…_payments_and_reliability.sql), on Find Match once a
// week and in a Monday notification. Only what really happened: nothing is
// counted twice and nothing is made up to look busy.
// ============================================================================

import { supabase } from './supabase';

export interface Week {
  likes: number;
  matches: number;
  messages: number;
  standouts: number;  // how many people's Standouts picked them
  new_near: number;   // new members in their state who could be a match
}

export type WeekGoTo = 'likes' | 'matches';

export interface WeekPart {
  key: keyof Week;
  count: number;
  text: string;
  to?: WeekGoTo;
}

export async function fetchMyWeek(): Promise<Week | null> {
  const { data, error } = await supabase.rpc('my_week');
  if (error || !data) return null;
  return data as unknown as Week;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The parts worth saying, in the order the notification says them */
export function weekParts(w: Week): WeekPart[] {
  const parts: WeekPart[] = [
    { key: 'likes', count: w.likes, text: plural(w.likes, 'like', 'likes'), to: 'likes' },
    { key: 'matches', count: w.matches, text: plural(w.matches, 'new match', 'new matches'), to: 'matches' },
    { key: 'messages', count: w.messages, text: plural(w.messages, 'message', 'messages'), to: 'matches' },
    { key: 'standouts', count: w.standouts, text: plural(w.standouts, "person's Standouts picked you", "people's Standouts picked you") },
    { key: 'new_near', count: w.new_near, text: plural(w.new_near, 'new member near you', 'new members near you') },  // the card is on Find Match already
  ];
  return parts.filter((p) => p.count > 0);
}

/** "2026-W41": the week a card was put away in, so it comes back the next week */
export function weekId(at: Date): string {
  const d = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
  const day = d.getUTCDay() || 7;            // Monday 1 … Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - day);    // the week's Thursday decides its year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const KEY = (userId: string) => `shaadi24_week_seen:${userId}`;

export function weekDismissed(userId: string, now = new Date()): boolean {
  try {
    return localStorage.getItem(KEY(userId)) === weekId(now);
  } catch {
    return false;
  }
}

export function dismissWeek(userId: string, now = new Date()): void {
  try {
    localStorage.setItem(KEY(userId), weekId(now));
  } catch {
    // Private browsing: it shows again next time
  }
}
