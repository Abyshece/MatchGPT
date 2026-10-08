// ============================================================================
// Admin → Profiles, Messages, Enquiries and Offers, and the members' side of
// each (supabase/migrations/…_admin_profiles_messages_enquiries_offers.sql):
//   Profiles   how complete members' profiles are, section by section
//   Messages   in-app messages (and notifications) to a group of members,
//              with a button that opens, say, their Family section
//   Enquiries  the website's contact form and the admins' inbox
//   Offers     a code shown on the website's home page, redeemed in the
//              App Store (offer codes) or Google Play (promo codes)
// ============================================================================

import { supabase } from './supabase';
import type { SectionId } from './profileRewards';
import { APPLE_APP_ID } from './storeLinks';

const fail = (error: { message: string } | null) => (error ? error.message : null);

// ---- Profiles ------------------------------------------------------------------------------

export interface ProfileStats {
  members: number;
  bands: { label: string; count: number }[];
  sections_done: { done: number; count: number }[];
  sections: { id: SectionId; title: string; complete: number; incomplete: number; answered_pct: number | null }[];
  missing_fields: { section: SectionId; key: string; missing: number; of: number }[];
}

export async function fetchProfileStats(): Promise<{ stats: ProfileStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_profile_stats');
  return { stats: (data ?? null) as unknown as ProfileStats | null, error: fail(error) };
}

/** "open_to_other_communities" → "Open to other communities" */
export const fieldLabel = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
};

export const SECTION_TITLES: Record<SectionId, string> = {
  about: 'About you',
  community: 'Religion & community',
  career: 'Education & career',
  family: 'Family',
  lifestyle: 'Lifestyle',
  plans: 'Plans & values',
};

// ---- Messages ------------------------------------------------------------------------------

export type Audience =
  | { kind: 'all' }
  | { kind: 'incomplete' }
  | { kind: 'missing_section'; section: SectionId }
  | { kind: 'unverified' }
  | { kind: 'free' }
  | { kind: 'inactive'; days: number };

export const audienceLabel = (a: Audience): string => {
  switch (a.kind) {
    case 'all': return 'Everyone';
    case 'incomplete': return 'Profile not complete';
    case 'missing_section': return `${SECTION_TITLES[a.section]} not complete`;
    case 'unverified': return 'Not verified';
    case 'free': return 'Free members';
    case 'inactive': return `Inactive for ${a.days} days`;
  }
};

export const AUDIENCES: Audience[] = [
  { kind: 'all' },
  { kind: 'incomplete' },
  ...(['about', 'community', 'career', 'family', 'lifestyle', 'plans'] as SectionId[]).map((section) => ({ kind: 'missing_section' as const, section })),
  { kind: 'unverified' },
  { kind: 'free' },
  { kind: 'inactive', days: 14 },
  { kind: 'inactive', days: 30 },
];

/** Where a message's button goes in the app */
export type MessageTarget = '' | `profile:${SectionId}` | 'profile' | 'verify' | 'upgrade' | 'search';

export const TARGETS: { id: MessageTarget; label: string }[] = [
  ...(['about', 'community', 'career', 'family', 'lifestyle', 'plans'] as SectionId[])
    .map((s) => ({ id: `profile:${s}` as MessageTarget, label: `My Profile → ${SECTION_TITLES[s]}` })),
  { id: 'profile', label: 'My Profile' },
  { id: 'verify', label: 'Get verified' },
  { id: 'upgrade', label: 'Shaadi24+' },
  { id: 'search', label: 'Find Match' },
  { id: '', label: 'No button' },
];

export interface MessageDraft {
  title: string;
  body: string;
  ctaLabel: string;
  target: MessageTarget;
  audience: Audience;
  push: boolean;
}

const NUDGE: Record<SectionId, { title: string; body: string; cta: string }> = {
  about: { title: 'Tell people about yourself', body: 'Profiles with an About me get far more likes. Add a few lines and your hometown: it takes about 2 minutes.', cta: 'Fill in About you' },
  community: { title: 'Add your community details', body: 'Many families look at religion, community and horoscope first. Add yours for better matches.', cta: 'Fill in community' },
  career: { title: 'Add your education and career', body: 'Members who share their degree, work and income get more serious interest.', cta: 'Fill in career' },
  family: { title: 'Tell matches about your family', body: 'Family details help families decide. Add yours for better matches.', cta: 'Fill in Family' },
  lifestyle: { title: 'Share your lifestyle', body: "Food, habits and hobbies help us find people you'll get along with.", cta: 'Fill in Lifestyle' },
  plans: { title: 'Share your plans and values', body: 'Your timeline, family plans and values help us find people who want the same.', cta: 'Fill in Plans' },
};

/** A message asking members to complete one section, with its button */
export function sectionNudge(section: SectionId): MessageDraft {
  const n = NUDGE[section];
  return {
    title: n.title,
    body: `${n.body} Each section you complete adds a free AI search a day.`,
    ctaLabel: n.cta,
    target: `profile:${section}`,
    audience: { kind: 'missing_section', section },
    push: true,
  };
}

export const BLANK_MESSAGE: MessageDraft = {
  title: '', body: '', ctaLabel: '', target: '', audience: { kind: 'all' }, push: true,
};

export async function countAudience(audience: Audience): Promise<{ count: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_message_audience', { p_audience: audience as never });
  return { count: typeof data === 'number' ? data : null, error: fail(error) };
}

export async function sendMessage(d: MessageDraft): Promise<{ recipients: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_send_message', {
    p_title: d.title.trim(), p_body: d.body.trim(), p_cta_label: d.target ? d.ctaLabel.trim() : '',
    p_cta_target: d.target, p_audience: d.audience as never, p_audience_label: audienceLabel(d.audience), p_push: d.push,
  });
  return { recipients: Number((data as { recipients?: number } | null)?.recipients ?? 0), error: fail(error) };
}

export interface SentMessage {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_target: string | null;
  audience_label: string;
  pushed: boolean;
  recipients: number;
  seen: number;
  clicked: number;
  created_at: string;
}

export async function fetchSentMessages(): Promise<{ messages: SentMessage[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_messages');
  return { messages: (data ?? []) as unknown as SentMessage[], error: fail(error) };
}

// The member's side
export interface MyMessage {
  id: string;
  title: string;
  body: string;
  cta_label: string | null;
  cta_target: MessageTarget | null;
  created_at: string;
  seen_at: string | null;
}

export async function fetchMyMessages(): Promise<MyMessage[]> {
  const { data, error } = await supabase.rpc('my_messages');
  return error ? [] : ((data ?? []) as unknown as MyMessage[]);
}

export async function markMyMessage(id: string, action: 'seen' | 'clicked' | 'dismissed'): Promise<void> {
  await supabase.rpc('mark_my_message', { p_id: id, p_action: action });
}

// ---- Enquiries -----------------------------------------------------------------------------

export type EnquiryTopic = 'general' | 'account' | 'subscription' | 'safety' | 'partnership' | 'press' | 'story' | 'other';
export const ENQUIRY_TOPICS: { id: EnquiryTopic; label: string }[] = [
  { id: 'general', label: 'A question about Shaadi24' },
  { id: 'account', label: 'My account' },
  { id: 'subscription', label: 'Shaadi24+ and payments' },
  { id: 'safety', label: 'Safety' },
  { id: 'partnership', label: 'Partnership or business' },
  { id: 'press', label: 'Press' },
  { id: 'story', label: 'Our success story' },
  { id: 'other', label: 'Something else' },
];
export const topicLabel = (t: string) => ENQUIRY_TOPICS.find((x) => x.id === t)?.label ?? t;

export async function submitEnquiry(e: { name: string; email: string; topic: EnquiryTopic; message: string; source?: 'website' | 'app' }):
  Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_enquiry', {
    p_name: e.name.trim(), p_email: e.email.trim(), p_topic: e.topic, p_message: e.message.trim(), p_source: e.source ?? 'website',
  });
  return { error: fail(error) };
}

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  topic: EnquiryTopic;
  message: string;
  status: 'new' | 'open' | 'closed';
  admin_notes: string | null;
  source: 'website' | 'app';
  user_id: string | null;
  created_at: string;
  handled_at: string | null;
}

export async function fetchEnquiries(status: 'open' | 'closed' | 'all'): Promise<{ enquiries: Enquiry[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_enquiries', { p_status: status });
  return { enquiries: (data ?? []) as unknown as Enquiry[], error: fail(error) };
}

export async function updateEnquiry(id: string, status: Enquiry['status'], notes?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_update_enquiry', { p_id: id, p_status: status, p_notes: notes ?? undefined });
  return { error: fail(error) };
}

// ---- Offers --------------------------------------------------------------------------------

export interface Offer {
  id: string;
  title: string;
  banner_text: string;
  code: string;
  stores: 'both' | 'app_store' | 'google_play';
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  created_at: string;
}

export type OfferDraft = Omit<Offer, 'id' | 'created_at'> & { id?: string };

export async function fetchOffers(): Promise<{ offers: Offer[]; error: string | null }> {
  const { data, error } = await supabase.from('offers').select('*').order('created_at', { ascending: false });
  return { offers: (data ?? []) as Offer[], error: fail(error) };
}

export async function saveOffer(o: OfferDraft): Promise<{ error: string | null }> {
  const row = {
    title: o.title.trim(), banner_text: o.banner_text.trim(), code: o.code.trim(), stores: o.stores,
    starts_at: o.starts_at, ends_at: o.ends_at || null, active: o.active, updated_at: new Date().toISOString(),
  };
  const { error } = o.id
    ? await supabase.from('offers').update(row).eq('id', o.id)
    : await supabase.from('offers').insert(row);
  return { error: fail(error) };
}

export async function deleteOffer(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('offers').delete().eq('id', id);
  return { error: fail(error) };
}

/** The offer running now, for the website's home page (anyone may read it) */
export async function fetchCurrentOffer(): Promise<Offer | null> {
  const { data } = await supabase.from('offers').select('*').order('starts_at', { ascending: false }).limit(1);
  return ((data ?? [])[0] as Offer | undefined) ?? null;
}

/** Where a code is redeemed: Apple's offer-code page, Google Play's redeem page */
export function redeemLinks(offer: Pick<Offer, 'code' | 'stores'>): { appStore: string | null; googlePlay: string | null } {
  const code = encodeURIComponent(offer.code);
  return {
    appStore: offer.stores !== 'google_play' ? `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}&code=${code}` : null,
    googlePlay: offer.stores !== 'app_store' ? `https://play.google.com/redeem?code=${code}` : null,
  };
}

// ---- Automatic messages (supabase/migrations/…_automatic_messages.sql) -------------------------

export type AutomationId = 'welcome' | 'no_photo' | 'profile_incomplete' | 'verify' | 'inactive_7' | 'inactive_30';

export interface Automation {
  id: AutomationId;
  enabled: boolean;
  title: string;
  body: string;
  cta_label: string | null;
  cta_target: MessageTarget | null;
  push: boolean;
  updated_at: string;
  waiting: number;
  sent: number;
  sent_7: number;
  seen: number;
  clicked: number;
  last_sent: string | null;
}

/** Who each one goes to (the rules are in automation_audience()) */
export const AUTOMATION_INFO: Record<AutomationId, { name: string; who: string }> = {
  welcome: { name: 'Welcome', who: 'Members who finished sign-up in the last 3 days, once.' },
  no_photo: { name: 'No photo yet', who: 'Members a day or more in without a photo, once.' },
  profile_incomplete: { name: 'Unfinished profile', who: 'Members 2 days in with fewer than 3 of the 6 sections complete; again after 14 days if still so.' },
  verify: { name: 'Get verified', who: 'Members 3 days in, not verified and not waiting to be, once.' },
  inactive_7: { name: 'Not seen for a week', who: 'Members not seen for 7 days (until it’s a month); again only after they’ve been back.' },
  inactive_30: { name: 'Not seen for a month', who: 'Members not seen for 30 days; again only after they’ve been back.' },
};

export async function fetchAutomations(): Promise<{ automations: Automation[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_automations');
  return { automations: (data ?? []) as unknown as Automation[], error: fail(error) };
}

export async function saveAutomation(a: Pick<Automation, 'id' | 'enabled' | 'title' | 'body' | 'cta_label' | 'cta_target' | 'push'>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_save_automation', {
    p_id: a.id, p_enabled: a.enabled, p_title: a.title, p_body: a.body,
    p_cta_label: a.cta_target ? a.cta_label ?? '' : '', p_cta_target: a.cta_target ?? '', p_push: a.push,
  });
  return { error: fail(error) };
}

/** Send it now to those it's due for; returns how many */
export async function runAutomation(id: AutomationId): Promise<{ sent: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_run_automation', { p_id: id });
  return { sent: Number(data ?? 0), error: fail(error) };
}
