// ============================================================================
// Fresh, active profiles (20261010140000_fresh_active_profiles.sql)
//
// What members of other matrimony apps complain about (docs/research/
// competitor-reviews.md): the same profiles every day, interests nobody ever
// answers, dead profiles. Here:
//   - Not interested: passProfile() keeps someone out of search and Standouts
//     for good; Settings → Hidden profiles lists them, to undo
//   - Interests nobody answered in 14 days expire (interest_active() in the
//     database): they leave the other person's Likes You, and the sender sees
//     them as expired in Search History and can send another
//   - I found my match: hides the profile, and passes the story the member
//     may tell to the team
// ============================================================================

import { supabase } from './supabase';
import { displayName } from './profileMapping';

export async function passProfile(userId: string, passedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('passed_profiles')
    .upsert({ user_id: userId, passed_id: passedId }, { onConflict: 'user_id,passed_id', ignoreDuplicates: true });
  return { error: error?.message ?? null };
}

export async function unpassProfile(userId: string, passedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('passed_profiles').delete().eq('user_id', userId).eq('passed_id', passedId);
  return { error: error?.message ?? null };
}

export interface PassedProfile { id: string; name: string; age: number | null; photo: string | null; passedAt: string }

export async function listPassedProfiles(): Promise<{ people: PassedProfile[]; error: string | null }> {
  const { data, error } = await supabase.rpc('my_passed_profiles');
  if (error) return { people: [], error: error.message };
  const rows = (data ?? []) as { id: string; name: string | null; age: number | null; photo: string | null; passed_at: string }[];
  return {
    people: rows.map((r) => ({ id: r.id, name: displayName(r.name), age: r.age, photo: r.photo, passedAt: r.passed_at })),
    error: null,
  };
}

/** I found my match: hides the profile; the story, if told, goes to the team unpublished */
export async function foundMyMatch(input: { partner?: string; story?: string; bothAgree?: boolean }): Promise<{ storySaved: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('found_my_match', {
    p_partner: input.partner?.trim() || undefined,
    p_story: input.story?.trim() || undefined,
    p_both_agree: !!input.bothAgree,
  });
  if (error) return { storySaved: false, error: error.message };
  return { storySaved: !!(data as { story_saved?: boolean } | null)?.story_saved, error: null };
}
