// ============================================================================
// Family Circle: a member's family sees their shortlist and reacts
//
// The member (with Shaadi24+) invites up to 5 people: each gets a private
// link (website /family/<link>, FamilyPage.tsx) to the people the member
// liked or matched with, shown as other members see them, never chats or
// contact details. Family react Yes / Maybe / No with a short note; the member
// sees it here and gets a notification. Members who'd rather not be shown to
// families say so in Settings → Privacy (family_can_view).
// The database does the checking (supabase/migrations/…_family_circle.sql).
// ============================================================================

import { supabase } from './supabase';
import { LEGAL } from './legalInfo';
import { isNativeApp } from './nativeApp';
import { displayName } from './profileMapping';
import type { MatchCandidate } from '../types';

export type Relation = 'mother' | 'father' | 'sister' | 'brother' | 'relative' | 'friend';
export type Reaction = 'yes' | 'maybe' | 'no';

export const RELATIONS: { id: Relation; label: string; suggested: string }[] = [
  { id: 'mother', label: 'Mother', suggested: 'Mummy' },
  { id: 'father', label: 'Father', suggested: 'Papa' },
  { id: 'sister', label: 'Sister', suggested: 'Didi' },
  { id: 'brother', label: 'Brother', suggested: 'Bhaiya' },
  { id: 'relative', label: 'Relative', suggested: '' },
  { id: 'friend', label: 'Friend', suggested: '' },
];

// Shown with a flat icon each (ReactionIcon in constants.tsx)
export const REACTIONS: { id: Reaction; label: string; hindi: string }[] = [
  { id: 'yes', label: 'Yes', hindi: 'हाँ' },
  { id: 'maybe', label: 'Maybe', hindi: 'शायद' },
  { id: 'no', label: 'No', hindi: 'नहीं' },
];
export const reactionLabel = (r: Reaction, lang: 'en' | 'hi' = 'en') => {
  const x = REACTIONS.find((y) => y.id === r);
  return x ? (lang === 'hi' ? x.hindi : x.label) : '';
};

export interface FamilyMember {
  id: string;
  name: string;
  relation: Relation;
  token: string;
  created_at: string;
  last_seen_at: string | null;
  reactions: number;
}

export interface FamilyReaction {
  profile_id: string;
  family_member_id: string;
  name: string;
  relation: Relation;
  reaction: Reaction;
  note: string | null;
  updated_at: string;
}

export const familyUrl = (token: string) => `${LEGAL.websiteUrl}/family/${token}`;

const fail = (e: { message: string } | null) => (e ? e.message : null);

export async function fetchMyFamily(): Promise<{ members: FamilyMember[]; reactions: FamilyReaction[]; error: string | null }> {
  const { data, error } = await supabase.rpc('my_family_circle');
  const d = (data ?? {}) as { members?: FamilyMember[]; reactions?: FamilyReaction[] };
  return { members: d.members ?? [], reactions: d.reactions ?? [], error: fail(error) };
}

export async function inviteFamily(name: string, relation: Relation): Promise<{ token: string | null; error: string | null; proOnly: boolean }> {
  const { data, error } = await supabase.rpc('invite_family_member', { p_name: name, p_relation: relation });
  return { token: (data as { token?: string } | null)?.token ?? null, error: fail(error), proOnly: error?.hint === 'PRO_ONLY' };
}

export async function removeFamily(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('remove_family_member', { p_id: id });
  return fail(error);
}

/** The invitation, for WhatsApp: in the apps the share sheet, on the website WhatsApp itself */
export async function shareInvite(member: { name: string; token: string }, from: string): Promise<void> {
  const text = `Namaste ${member.name}! 🙏 I'm looking for a life partner on Shaadi24. `
    + `Please see the profiles I've shortlisted and tell me what you think (no app needed). `
    + `${from ? `– ${from}` : ''}\n${familyUrl(member.token)}`;
  if (isNativeApp()) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({ text, dialogTitle: 'Send the link' });
    } catch (e) {
      if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** The cards of the people the family reacted to, for the member's screen */
export async function reactedCards(ids: string[]): Promise<Map<string, MatchCandidate>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.rpc('get_profile_cards', { p_ids: ids });
  return new Map((data ?? []).map((p) => [p.id, {
    id: p.id,
    name: displayName(p.name),
    age: p.age ?? 0,
    location: p.location ?? '',
    compatibilityScore: 0,
    tags: [],
    bio: p.description ?? '',
    imageUrls: p.photo_urls ?? [],
    isVerified: p.is_verified ?? false,
    isPremium: p.subscription_tier === 'PRO',
    subscriptionTier: p.subscription_tier === 'PRO' ? 'PRO' : 'FREE',
    hiddenFields: p.hidden_fields ?? [],
  } as MatchCandidate]));
}

// ---- The family's page (the website, no account) ------------------------------------

export interface FamilyCard {
  id: string;
  matched: boolean;
  name: string | null;
  age: number | null;
  height: string | null;
  place: string | null;
  religion: string | null;
  mother_tongue: string | null;
  caste: string | null;
  education: string | null;
  occupation: string | null;
  marital_status: string | null;
  about: string | null;
  photo: string | null;
  verified: boolean;
  reactions: { by: string; relation: Relation; mine: boolean; reaction: Reaction; note: string | null }[];
}

export interface FamilyView {
  found: boolean;
  member?: string;
  member_gender?: string;
  you?: { name: string; relation: Relation };
  shortlist?: FamilyCard[];
}

export async function fetchFamilyView(token: string): Promise<FamilyView> {
  const { data, error } = await supabase.rpc('family_circle_view', { p_token: token });
  return error || !data ? { found: false } : (data as unknown as FamilyView);
}

export async function familyReact(token: string, profileId: string, reaction: Reaction, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('family_react', {
    p_token: token, p_profile_id: profileId, p_reaction: reaction, p_note: note.trim() || undefined,
  });
  return fail(error);
}
