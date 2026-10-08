// ============================================================================
// The admin team: roles, and two-step sign-in
// (supabase/migrations/…_admin_roles_and_two_step.sql)
//
// Roles decide which sections of the admin panel someone may use; the
// database enforces it (admin_can()). Two-step sign-in is an authenticator
// app (Google Authenticator, Microsoft Authenticator, 1Password…): Supabase's
// TOTP factors. Once an owner requires it, the admin panel asks for the
// 6-digit code after signing in, and the admin functions refuse a session
// without it.
// ============================================================================

import { supabase } from './supabase';

const fail = (error: { message: string } | null) => (error ? error.message : null);

export type AdminRole = 'owner' | 'moderator' | 'support' | 'content' | 'finance';

export const ROLES: { id: AdminRole; label: string; what: string }[] = [
  { id: 'owner', label: 'Owner', what: 'Everything, including the team, the audit log and the Shaadi24+ for everyone switch' },
  { id: 'moderator', label: 'Moderator', what: 'Customers, verification, moderation, reports, scam alerts, complaints, enquiries' },
  { id: 'support', label: 'Support', what: 'Customers, verification, reports, complaints, enquiries' },
  { id: 'content', label: 'Content', what: 'Profiles, messages, automatic messages, offers, blog, success stories, growth, search insights' },
  { id: 'finance', label: 'Finance', what: 'Finance and growth' },
];
export const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;

export interface AdminStatus {
  listed: boolean;
  role?: AdminRole;
  areas?: string[];
  two_step_required?: boolean;
  aal?: 'aal1' | 'aal2';
  two_step_ok?: boolean;
  /** Ask for the code before the admin panel opens: it's required and this
   *  session hasn't used it, or they set it up and haven't used it yet */
  needs_code?: boolean;
}

export async function fetchAdminStatus(): Promise<AdminStatus> {
  const [{ data, error }, { data: aal }] = await Promise.all([
    supabase.rpc('admin_status'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (error || !data) return { listed: false };
  const status = data as unknown as AdminStatus;
  const unusedFactor = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
  return { ...status, needs_code: status.listed && ((status.two_step_required === true && !status.two_step_ok) || unusedFactor) };
}

/** May they use this section? (owners: everything) */
export const canUse = (status: AdminStatus | null, area: string) => status?.areas?.includes(area) === true;

// ---- Team (owners) ------------------------------------------------------------------------------

export interface TeamMember {
  email: string;
  role: AdminRole;
  notes: string | null;
  added_at: string;
  name: string | null;
  signed_up: boolean;
  last_sign_in: string | null;
  two_step: boolean;
}
export interface Team { require_two_step: boolean; me: string; members: TeamMember[] }

export async function fetchTeam(): Promise<{ team: Team | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_team');
  return { team: (data ?? null) as unknown as Team | null, error: fail(error) };
}

export async function saveTeamMember(email: string, role: AdminRole, notes?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_team_save', { p_email: email, p_role: role, p_notes: notes ?? undefined });
  return { error: fail(error) };
}

export async function removeTeamMember(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_team_remove', { p_email: email });
  return { error: fail(error) };
}

export async function resetTwoStep(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_team_reset_two_step', { p_email: email });
  return { error: fail(error) };
}

export async function setRequireTwoStep(on: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_require_two_step', { p_on: on });
  return { error: fail(error) };
}

// ---- Two-step sign-in (the signed-in admin's own) --------------------------------------------------

export interface TwoStepState { factorId: string | null; level: 'aal1' | 'aal2' | null }

/** Their authenticator (a verified one), and whether this session used it */
export async function twoStepState(): Promise<TwoStepState> {
  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const verified = (factors?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  return { factorId: verified?.id ?? null, level: (aal?.currentLevel as TwoStepState['level']) ?? null };
}

export interface Enrolment { factorId: string; qr: string; secret: string; uri: string }

/** Start setting up an authenticator: a QR code (and the key, for typing in).
 *  Asked twice at once (a screen opening twice), both get the same one. */
let starting: Promise<{ enrolment: Enrolment | null; error: string | null }> | null = null;
export function startTwoStep(): Promise<{ enrolment: Enrolment | null; error: string | null }> {
  starting ??= enrol().finally(() => { starting = null; });
  return starting;
}

async function enrol(): Promise<{ enrolment: Enrolment | null; error: string | null }> {
  // An earlier set-up left unfinished would get in the way
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp', friendlyName: `Shaadi24 admin ${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`,
  });
  if (error || !data) {
    const message = error?.message ?? "Couldn't start";
    return {
      enrolment: null,
      error: /disabled|not enabled/i.test(message)
        ? 'Authenticator apps are turned off for this Shaadi24 project. In Supabase → Authentication → Multi-Factor, turn on "App Authenticator (TOTP)".'
        : message,
    };
  }
  return { enrolment: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri }, error: null };
}

/** The 6-digit code from the app: finishes the set-up, or signs this session in with it */
export async function verifyTwoStep(factorId: string, code: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) return { error: /invalid|expired/i.test(error.message) ? "That code didn't work. Check the app and try the new code." : error.message };
  return { error: null };
}

/** Turn their two-step sign-in off (needs a session signed in with it) */
export async function removeTwoStep(factorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { error: fail(error) };
}
