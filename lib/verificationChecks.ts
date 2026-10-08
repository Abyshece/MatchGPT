// ============================================================================
// Will this verification pass? The checks the admin panel shows on each
// request waiting for a decision (Admin → Verification), from the request's
// links and what the database knows about the member
// (admin_verification_signals(), in
// supabase/migrations/…_admin_customers_and_verification_checks.sql).
//
// A guide for the admin, who still opens the links and decides:
//   Likely to pass: nothing against it
//   Check closely:  two or more things to look at (a link that isn't a
//                   profile, the name not in any link, no confirmed email,
//                   joined today…)
//   Unlikely:       something that usually means no (no photo, fewer than two
//                   working links, a link another member used, reports)
// ============================================================================

import { supabase } from './supabase';
import type { PendingVerification } from './verificationService';

export interface VerificationSignals {
  request_id: string;
  user_id: string;
  gender: string | null;
  age: number | null;
  city: string | null;
  country: string | null;
  joined: string;
  email_confirmed: boolean | null;
  sign_in: string | null;
  photos: number;
  sections_done: number;
  onboarded: boolean;
  reports: number;
  blocked_by: number;
  rejections: number;
  shared: { link: string; name: string | null; user_id: string }[];
}

export type CheckLevel = 'pass' | 'warn' | 'fail';
export interface Check { level: CheckLevel; text: string }
export type Verdict = 'likely' | 'check' | 'unlikely';
export interface Assessment { verdict: Verdict; checks: Check[] }

export const VERDICT_LABEL: Record<Verdict, string> = {
  likely: 'Likely to pass',
  check: 'Check closely',
  unlikely: 'Unlikely to pass',
};

export async function fetchVerificationSignals(): Promise<{ signals: Map<string, VerificationSignals>; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_verification_signals');
  if (error) return { signals: new Map(), error: error.message };
  const list = (data ?? []) as unknown as VerificationSignals[];
  return { signals: new Map(list.map((s) => [s.request_id, s])), error: null };
}

// ---- The links -----------------------------------------------------------------------------

type Site = 'LinkedIn' | 'Instagram' | 'Facebook' | 'X';

const SITES: Record<Site, { hosts: RegExp; profile: RegExp }> = {
  // linkedin.com/in/<name>
  LinkedIn: { hosts: /(^|\.)linkedin\.com$/, profile: /^\/in\/[^/]{2,}/ },
  // instagram.com/<name>, not a post or reel
  Instagram: { hosts: /(^|\.)instagram\.com$/, profile: /^\/(?!p\/|reel\/|explore\/|stories\/)[A-Za-z0-9._]{2,}\/?$/ },
  // facebook.com/<name> or profile.php?id=…
  Facebook: { hosts: /(^|\.)(facebook\.com|fb\.com)$/, profile: /^\/(profile\.php|(?!groups\/|events\/|share\/)[A-Za-z0-9.]{2,})/ },
  X: { hosts: /(^|\.)(x\.com|twitter\.com)$/, profile: /^\/[A-Za-z0-9_]{2,}\/?$/ },
};

export interface LinkCheck { site: Site; url: string; ok: boolean; handle: string; problem?: string }

export function checkLink(site: Site, raw: string): LinkCheck {
  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { site, url, ok: false, handle: '', problem: `the ${site} link isn't a web address` };
  }
  const host = parsed.hostname.toLowerCase();
  if (!SITES[site].hosts.test(host)) return { site, url, ok: false, handle: '', problem: `the ${site} link goes to ${host}` };
  if (!SITES[site].profile.test(parsed.pathname)) {
    return { site, url, ok: false, handle: '', problem: `the ${site} link isn't a profile` };
  }
  const handle = decodeURIComponent(parsed.pathname.replace(/^\/(in\/)?/, '').split('/')[0] ?? '').toLowerCase();
  return { site, url, ok: true, handle };
}

/** The request's links that were filled in, checked. */
export function linkChecks(req: Pick<PendingVerification, 'linkedin_url' | 'instagram_url' | 'facebook_url' | 'twitter_url'>): LinkCheck[] {
  const given: [Site, string | null][] = [
    ['LinkedIn', req.linkedin_url], ['Instagram', req.instagram_url], ['Facebook', req.facebook_url], ['X', req.twitter_url],
  ];
  return given.filter(([, url]) => url && url.trim()).map(([site, url]) => checkLink(site, url as string));
}

/** Whether a part of the member's name (3 letters or more) is in a link's handle. */
export function nameInLinks(name: string | null, links: LinkCheck[]): Site | null {
  const parts = (name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/).filter((p) => p.length >= 3);
  if (!parts.length) return null;
  const hit = links.find((l) => l.ok && parts.some((p) => l.handle.replace(/[^a-z]/g, '').includes(p)));
  return hit?.site ?? null;
}

const days = (iso: string, now: number) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

// ---- The verdict ---------------------------------------------------------------------------

export function assessVerification(req: PendingVerification, s: VerificationSignals | undefined, now = Date.now()): Assessment {
  const checks: Check[] = [];
  const links = linkChecks(req);
  const working = links.filter((l) => l.ok);

  // The links (two working ones are what the app asks for)
  if (working.length >= 2) checks.push({ level: 'pass', text: `${working.length} working profile links (${working.map((l) => l.site).join(', ')})` });
  else if (working.length === 1) checks.push({ level: 'fail', text: `Only 1 working profile link (${working[0].site}); 2 are needed` });
  else checks.push({ level: 'fail', text: 'No working profile links' });
  for (const l of links.filter((x) => !x.ok)) checks.push({ level: 'warn', text: `${l.problem?.[0].toUpperCase()}${l.problem?.slice(1)}` });

  const named = nameInLinks(req.user_name, links);
  checks.push(named
    ? { level: 'pass', text: `Their name is in the ${named} link` }
    : { level: 'warn', text: "Their name isn't in any link: open them to compare" });

  if (!s) return verdictOf(checks);

  checks.push(s.photos > 0
    ? { level: 'pass', text: `${s.photos} photo${s.photos === 1 ? '' : 's'} to compare with the links` }
    : { level: 'fail', text: 'No photo to compare with the links' });

  checks.push(s.sections_done >= 3
    ? { level: 'pass', text: `Profile: ${s.sections_done} of 6 sections complete` }
    : { level: 'warn', text: `Profile: ${s.sections_done} of 6 sections complete` });

  const age = days(s.joined, now);
  checks.push(age >= 1
    ? { level: 'pass', text: `Joined ${age} day${age === 1 ? '' : 's'} ago` }
    : { level: 'warn', text: 'Joined today' });

  if (s.sign_in === 'google' || s.sign_in === 'apple') checks.push({ level: 'pass', text: `Signed in with ${s.sign_in === 'google' ? 'Google' : 'Apple'}` });
  else checks.push(s.email_confirmed ? { level: 'pass', text: 'Email confirmed' } : { level: 'warn', text: 'Email not confirmed' });

  if (s.reports > 0) checks.push({ level: 'fail', text: `Reported ${s.reports} time${s.reports === 1 ? '' : 's'}` });
  if (s.blocked_by >= 2) checks.push({ level: 'warn', text: `Blocked by ${s.blocked_by} members` });
  if (s.rejections > 0) checks.push({ level: 'warn', text: `Rejected ${s.rejections} time${s.rejections === 1 ? '' : 's'} before` });
  for (const shared of s.shared) {
    checks.push({ level: 'fail', text: `${shared.link} was also given by ${shared.name ?? 'another member'}` });
  }
  return verdictOf(checks);
}

function verdictOf(checks: Check[]): Assessment {
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  return { verdict: fails > 0 ? 'unlikely' : warns >= 2 ? 'check' : 'likely', checks };
}
