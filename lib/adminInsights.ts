// ============================================================================
// Admin → a member's timeline, Growth, Search insights and Success stories
// (supabase/migrations/…_admin_insights_and_stories.sql)
// ============================================================================

import { supabase } from './supabase';

const fail = (error: { message: string } | null) => (error ? error.message : null);

// ---- A member's timeline --------------------------------------------------------------------

export type TimelineKind = 'account' | 'search' | 'like' | 'match' | 'message' | 'safety' | 'verification' | 'profile'
  | 'money' | 'team' | 'admin' | 'device';

export interface TimelineEvent { at: string; kind: TimelineKind; title: string; detail: string | null }

export const TIMELINE_GROUPS: { id: 'all' | 'activity' | 'safety' | 'money' | 'team'; label: string; kinds: TimelineKind[] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'activity', label: 'Activity', kinds: ['search', 'like', 'match', 'message', 'profile'] },
  { id: 'safety', label: 'Safety', kinds: ['safety', 'verification'] },
  { id: 'money', label: 'Shaadi24+', kinds: ['money'] },
  { id: 'team', label: 'The team', kinds: ['admin', 'team'] },
];

export const KIND_ICONS: Record<TimelineKind, string> = {
  account: '👤', search: '🔎', like: '♥', match: '💞', message: '💬', safety: '🚩', verification: '✓',
  profile: '🖼', money: '₹', team: '📣', admin: '🛡', device: '📱',
};

export async function fetchTimeline(userId: string): Promise<{ events: TimelineEvent[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_member_timeline', { p_user: userId, p_limit: 400 });
  const out = (data ?? {}) as { events?: TimelineEvent[] };
  return { events: out.events ?? [], error: fail(error) };
}

// ---- Growth ---------------------------------------------------------------------------------

export interface GrowthDay { day: string; signups: number; active: number }
export interface BreakdownRow { label: string; members: number; active: number }
export type Dimension = 'city' | 'community' | 'religion' | 'gender' | 'age';

export interface Growth {
  days: number;
  from: string;
  members: number;
  active_1: number;
  active_7: number;
  active_30: number;
  funnel: { step: string; n: number }[];
  series: GrowthDay[];
  breakdown: Partial<Record<Dimension, BreakdownRow[]>>;
}

export const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'city', label: 'City' }, { id: 'community', label: 'Community' }, { id: 'religion', label: 'Religion' },
  { id: 'gender', label: 'Gender' }, { id: 'age', label: 'Age' },
];

export async function fetchGrowth(days: number): Promise<{ growth: Growth | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_growth', { p_days: days });
  return { growth: (data ?? null) as unknown as Growth | null, error: fail(error) };
}

// ---- Biodatas shared (lib/biodata.ts) ---------------------------------------------------------

export interface BiodataStats {
  members: number;            // members who made a biodata link
  active_links: number;       // links on now
  made_in_period: number;
  opens: number;              // all opens, all time
  opened_in_period: number;   // links opened in the period
  top: { user_id: string; name: string | null; email: string | null; opens: number; created_at: string;
    last_opened_at: string | null; turned_off: boolean }[];
}

export async function fetchBiodataStats(days: number): Promise<{ stats: BiodataStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_biodata_stats', { p_days: days });
  return { stats: (data ?? null) as unknown as BiodataStats | null, error: fail(error) };
}

// ---- Family Circle (lib/familyCircle.ts) --------------------------------------------------------

export interface FamilyStats {
  circles: number;              // members with someone invited
  family: number;               // people invited (not removed)
  visited_in_period: number;
  reactions: number;
  reactions_in_period: number;
  by_reaction: Partial<Record<'yes' | 'maybe' | 'no', number>>;
  by_relation: Partial<Record<string, number>>;
}

export async function fetchFamilyStats(days: number): Promise<{ stats: FamilyStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_family_stats', { p_days: days });
  return { stats: (data ?? null) as unknown as FamilyStats | null, error: fail(error) };
}

// ---- Search insights ------------------------------------------------------------------------

export interface SearchInsights {
  days: number;
  searches: number;
  searchers: number;
  typed: number;
  none_found: number;
  average_found: number | null;
  series: { day: string; searches: number; none_found: number }[];
  top_words: { word: string; n: number }[];
  top_searches: { search: string; n: number; found: number }[];
  none_found_searches: { search: string; n: number; last: string }[];
  filters: { filter: string; n: number }[];
}

export async function fetchSearchInsights(days: number): Promise<{ insights: SearchInsights | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_search_insights', { p_days: days });
  return { insights: (data ?? null) as unknown as SearchInsights | null, error: fail(error) };
}

// ---- Search limits (supabase/migrations/…_search_limits.sql; lib/searchLimits.ts) ------------

export interface AdminPlanLimits { per_window: number | null; per_day: number | null; per_week: number | null; updated_at?: string }

export interface AdminSearchLimits {
  window_hours: number;
  week_reset_dow: number;
  week_reset_hour: number;
  plans: { free: AdminPlanLimits; plus: AdminPlanLimits };
  can_edit: boolean;                      // owners only
  week_started_at: string;
  limited_7d: { members: number; window: number; day: number; week: number };   // by the limit that stopped them last
  searching_this_week: number;
}

export async function fetchSearchLimits(): Promise<{ limits: AdminSearchLimits | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_search_limits');
  return { limits: (data ?? null) as unknown as AdminSearchLimits | null, error: fail(error) };
}

/** Owners only; null for no limit */
export async function saveSearchLimits(settings: { window_hours: number; plans: { free: AdminPlanLimits; plus: AdminPlanLimits } }): Promise<string | null> {
  const plan = (p: AdminPlanLimits) => ({ per_window: p.per_window, per_day: p.per_day, per_week: p.per_week });
  const { error } = await supabase.rpc('admin_set_search_limits', {
    p_settings: { window_hours: settings.window_hours, plans: { free: plan(settings.plans.free), plus: plan(settings.plans.plus) } },
  });
  return fail(error);
}

/** "motherTongue" → "Mother tongue" */
export const filterLabel = (key: string) => {
  const known: Record<string, string> = {
    isOnline: 'Online now', isVerified: 'Verified only', isPremium: 'Shaadi24+ only', heightRange: 'Height',
    ageRange: 'Age', neighborhood: 'Near me', motherTongue: 'Mother tongue', maritalStatus: 'Marital status',
  };
  if (known[key]) return known[key];
  const words = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// ---- Success stories --------------------------------------------------------------------------

export interface Story {
  id: string;
  names: string;
  place: string;
  married_on: string | null;
  story: string;
  photo_url: string | null;
  photo_alt: string;
  consent_note: string;
  published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export type StoryDraft = Omit<Story, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export const BLANK_STORY: StoryDraft = {
  names: '', place: '', married_on: null, story: '', photo_url: null, photo_alt: '', consent_note: '', published: false, sort_order: 0,
};

export async function fetchStories(publishedOnly = false): Promise<{ stories: Story[]; error: string | null }> {
  let q = supabase.from('success_stories').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  if (publishedOnly) q = q.eq('published', true);
  const { data, error } = await q;
  return { stories: (data ?? []) as Story[], error: fail(error) };
}

export async function saveStory(d: StoryDraft): Promise<{ error: string | null }> {
  const row = {
    names: d.names.trim(), place: d.place.trim(), married_on: d.married_on || null, story: d.story.trim(),
    photo_url: d.photo_url?.trim() || null, photo_alt: d.photo_alt.trim(), consent_note: d.consent_note.trim(),
    published: d.published, sort_order: d.sort_order,
  };
  if (row.names.length < 2) return { error: 'Write the couple’s names' };
  if (row.story.length < 20) return { error: 'Write their story (at least a few sentences)' };
  if (row.published && row.consent_note.length < 5) return { error: 'Say how both of them agreed to be shown, before publishing' };
  const { error } = d.id
    ? await supabase.from('success_stories').update(row).eq('id', d.id)
    : await supabase.from('success_stories').insert(row);
  return { error: fail(error) };
}

export async function deleteStory(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('success_stories').delete().eq('id', id);
  return { error: fail(error) };
}

/** A story's photo, into the public "blog" bucket */
export async function uploadStoryPhoto(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { url: null, error: 'Use a JPEG, PNG or WebP picture' };
  if (file.size > 5 * 1024 * 1024) return { url: null, error: 'The picture is over 5 MB' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `stories/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('blog').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) return { url: null, error: error.message };
  return { url: supabase.storage.from('blog').getPublicUrl(path).data.publicUrl, error: null };
}
