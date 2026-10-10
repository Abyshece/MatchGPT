// ============================================================================
// adminService
//
// Wraps the admin-only RPCs. Every function here calls a SECURITY DEFINER
// function in Postgres that double-checks is_admin() before doing anything,
// so even if a non-admin somehow reaches these client calls, the DB rejects.
// ============================================================================

import { supabase } from './supabase';
import type { Database } from './database.types';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface PlatformStats {
  total_users: number;
  banned_users: number;
  verified_users: number;
  pro_users: number;
  total_matches: number;
  total_messages: number;
  total_likes: number;
  super_likes: number;
  pending_reports: number;
  pending_verifications: number;
  total_blocks: number;
  blocks_today: number;
  signups_today: number;
  signups_week: number;
  matches_today: number;
  matches_week: number;
  messages_today: number;
}

export interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  // joined fields (populated client-side)
  reporter_email?: string;
  reporter_name?: string;
  reported_email?: string;
  reported_name?: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  age: number | null;
  location: string | null;
  subscription_tier: 'FREE' | 'PRO';
  is_verified: boolean;
  is_banned: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  account_created: string;  // ISO timestamp
  daily_search_count: number;
  daily_like_count: number;
  date_of_birth: string | null;  // YYYY-MM-DD
  gender: string | null;
  is_paused: boolean;            // hidden from everyone (by the member, or by the legal-age rule)
}

export interface AdminAuditRow {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  target_user_id: string | null;
  target_report_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Platform stats
// ----------------------------------------------------------------------------

export async function fetchPlatformStats(): Promise<{ stats: PlatformStats | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_platform_stats');
  if (error) return { stats: null, error: error.message };
  return { stats: data as unknown as PlatformStats, error: null };
}

// ----------------------------------------------------------------------------
// Reports queue
// ----------------------------------------------------------------------------

// Reports with both people's name and email. The browser can only read its
// own profile row, so the names come from the admin-only admin_list_reports().
export async function fetchReports(status: 'pending' | 'all' = 'pending'): Promise<{ reports: ReportRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_reports', { p_pending_only: status === 'pending' });
  if (error) return { reports: [], error: error.message };
  const reports = (data ?? []).map((r) => ({
    ...r,
    status: r.status as ReportRow['status'],
    reporter_email: r.reporter_email ?? undefined,
    reporter_name: r.reporter_name ?? undefined,
    reported_email: r.reported_email ?? undefined,
    reported_name: r.reported_name ?? undefined,
  }));
  return { reports, error: null };
}

export async function updateReport(
  reportId: string,
  newStatus: 'resolved' | 'dismissed',
  notes: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_update_report', {
    report_id: reportId,
    new_status: newStatus,
    notes,
  });
  if (error) return { error: error.message };
  return { error: null };
}

// ----------------------------------------------------------------------------
// User management
// ----------------------------------------------------------------------------

// Newest 50 accounts, or those whose name or email contains the query.
export async function searchUsers(query: string): Promise<{ users: AdminUserRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_find_users', { p_query: query.trim(), p_limit: 50 });
  if (error) return { users: [], error: error.message };
  return { users: (data ?? []) as AdminUserRow[], error: null };
}

export async function banUser(userId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_ban_user', {
    target_id: userId,
    reason,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function unbanUser(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_unban_user', {
    target_id: userId,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function verifyUser(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_verify_user', {
    target_id: userId,
  });
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Corrects a member's date of birth, after seeing an ID that shows it (in the
 * audit log, with the note). A date under the legal age to marry is refused;
 * a profile hidden only because of the age becomes visible again.
 */
export async function correctDateOfBirth(userId: string, dateOfBirth: string, note: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_correct_date_of_birth', {
    target_id: userId,
    new_date_of_birth: dateOfBirth,
    note,
  });
  return { error: error?.message ?? null };
}

// ----------------------------------------------------------------------------
// Audit log
// ----------------------------------------------------------------------------

/** Turns "Shaadi24+ for everyone" on or off (admins only; in the audit log). */
export async function setProForAll(on: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_pro_for_all', { p_on: on });
  return { error: error?.message ?? null };
}

export async function fetchAuditLog(limit = 50): Promise<{ entries: AdminAuditRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('admin_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []) as AdminAuditRow[], error: null };
}

// ----------------------------------------------------------------------------
// Admin check (used by frontend to decide whether to show the Admin tab).
// Asks the database: admin_status() compares the signed-in user's confirmed
// email with the admin_emails table (any role; two-step sign-in, when it's
// required, is asked for inside the admin panel). Every admin RPC checks
// again on the server, with the admin's role.
// ----------------------------------------------------------------------------

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_status');
  if (error) return false;
  return (data as { listed?: boolean } | null)?.listed === true;
}

// ----------------------------------------------------------------------------
// Errors the app and the website reported (lib/errorReports.ts): each error
// once, most recent first. Marking one fixed hides it until it happens again.
// ----------------------------------------------------------------------------

export type ErrorReportRow = Database['public']['Functions']['admin_list_errors']['Returns'][number];

export async function fetchErrorReports(includeFixed: boolean): Promise<{ errors: ErrorReportRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_errors', { p_include_fixed: includeFixed, p_limit: 200 });
  if (error) return { errors: [], error: error.message };
  return { errors: data ?? [], error: null };
}

export async function markErrorFixed(id: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_mark_error_fixed', { p_id: id });
  return { error: error?.message ?? null };
}

// ---- Problems members reported (Settings → Report a problem) -------------------------

export interface ProblemRow {
  id: string;
  user_id: string;
  name: string | null;
  details: string;
  screen: string | null;
  app_version: string | null;
  platform: string | null;
  device: string | null;
  status: 'open' | 'answered' | 'closed';
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

export async function fetchProblems(openOnly: boolean): Promise<{ problems: ProblemRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_list_problems', { p_open_only: openOnly });
  if (error) return { problems: [], error: error.message };
  return { problems: (data ?? []) as unknown as ProblemRow[], error: null };
}

/** An answer goes to the member (a message that opens My requests); none closes it quietly */
export async function answerProblem(id: string, answer: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_answer_problem', { p_id: id, p_answer: answer });
  return { error: error?.message ?? null };
}

// ---- The oldest app that still works (app_config(); owner only) ----------------------

export async function fetchMinAppBuild(): Promise<number> {
  const { data } = await supabase.rpc('app_config');
  return Number((data as { min_app_build?: number } | null)?.min_app_build ?? 0);
}

export async function setMinAppBuild(build: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_set_min_app_build', { p_build: build });
  return { error: error?.message ?? null };
}
