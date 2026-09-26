// ============================================================================
// adminService
//
// Wraps the admin-only RPCs. Every function here calls a SECURITY DEFINER
// function in Postgres that double-checks is_admin() before doing anything,
// so even if a non-admin somehow reaches these client calls, the DB rejects.
// ============================================================================

import { supabase } from './supabase';

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

export async function fetchReports(status: 'pending' | 'all' = 'pending'): Promise<{ reports: ReportRow[]; error: string | null }> {
  let query = supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (status === 'pending') {
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query;
  if (error) return { reports: [], error: error.message };

  const reports = (data ?? []) as ReportRow[];

  // Hydrate with reporter/reported user info
  const userIds = Array.from(new Set([
    ...reports.map((r) => r.reporter_id),
    ...reports.map((r) => r.reported_id),
  ]));

  if (userIds.length === 0) return { reports, error: null };

  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, name')
    .in('id', userIds);

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  reports.forEach((r) => {
    const reporter = userMap.get(r.reporter_id);
    const reported = userMap.get(r.reported_id);
    r.reporter_email = reporter?.email ?? undefined;
    r.reporter_name = reporter?.name ?? undefined;
    r.reported_email = reported?.email ?? undefined;
    r.reported_name = reported?.name ?? undefined;
  });

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

export async function searchUsers(query: string): Promise<{ users: AdminUserRow[]; error: string | null }> {
  let supaQuery = supabase
    .from('profiles')
    .select('id, email, name, age, location, subscription_tier, is_verified, is_banned, banned_at, ban_reason, account_created, daily_search_count, daily_like_count')
    .order('account_created', { ascending: false })
    .limit(50);

  if (query.trim()) {
    const q = `%${query.trim()}%`;
    // Search by name OR email
    supaQuery = supaQuery.or(`name.ilike.${q},email.ilike.${q}`);
  }

  const { data, error } = await supaQuery;
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

// ----------------------------------------------------------------------------
// Audit log
// ----------------------------------------------------------------------------

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
// Admin check (used by frontend to decide whether to show the Admin tab)
// ----------------------------------------------------------------------------

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
  if (!raw) return false;
  const allowlist = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
