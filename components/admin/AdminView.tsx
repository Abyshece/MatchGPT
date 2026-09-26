import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/useToast';
import {
  fetchPlatformStats, fetchReports, fetchAuditLog,
} from '../../lib/adminService';
import { useIsAdmin } from '../../lib/useIsAdmin';
import type { PlatformStats, ReportRow, AdminAuditRow } from '../../lib/adminService';
import AdminUsersTab from './AdminUsersTab';
import AdminReportsTab from './AdminReportsTab';
import AdminVerificationsTab from './AdminVerificationsTab';

// ============================================================================
// AdminView
//
// Three-tab admin panel:
//   1. Dashboard — platform stats + recent audit log
//   2. Reports — pending reports queue
//   3. Users — search any user, take actions
//
// Access is decided by the database (is_admin(): the signed-in email must be
// in admin_emails). If a non-admin somehow reaches this view they see "Access
// denied", and the admin RPCs refuse them anyway.
// ============================================================================

type AdminTab = 'dashboard' | 'reports' | 'verifications' | 'users';

const AdminView: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const isAdmin = useIsAdmin();

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentReports, setRecentReports] = useState<ReportRow[]>([]);
  const [recentAudit, setRecentAudit] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [statsRes, reportsRes, auditRes] = await Promise.all([
      fetchPlatformStats(),
      fetchReports('pending'),
      fetchAuditLog(10),
    ]);
    setLoading(false);

    if (statsRes.error) showToast(`Stats: ${statsRes.error}`, 'error');
    else setStats(statsRes.stats);

    if (reportsRes.error) showToast(`Reports: ${reportsRes.error}`, 'error');
    else setRecentReports(reportsRes.reports.slice(0, 5));

    if (auditRes.error) showToast(`Audit: ${auditRes.error}`, 'error');
    else setRecentAudit(auditRes.entries);
  }, [showToast]);

  useEffect(() => {
    if (isAdmin && tab === 'dashboard') loadDashboard();
  }, [isAdmin, tab, loadDashboard]);

  // ---- Access control ----
  if (!profile) return null;
  if (isAdmin === null) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-400">Checking access…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Access denied</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This area is only available to admins. Your account isn't on the admin list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-zinc-900/30">
      <div className="max-w-6xl mx-auto py-8 px-6 lg:px-12">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-1">
            🛡️ Admin Panel
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Platform moderation and oversight. Every action here is logged.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-zinc-800">
          {(['dashboard', 'reports', 'verifications', 'users'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab body */}
        {tab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            recentReports={recentReports}
            recentAudit={recentAudit}
            loading={loading}
            onGoToReports={() => setTab('reports')}
          />
        )}
        {tab === 'reports' && <AdminReportsTab onAuditUpdate={loadDashboard} />}
        {tab === 'verifications' && <AdminVerificationsTab onAuditUpdate={loadDashboard} />}
        {tab === 'users' && <AdminUsersTab onAuditUpdate={loadDashboard} />}
      </div>
    </div>
  );
};

// ============================================================================
// Dashboard tab — stats + recent activity
// ============================================================================

const DashboardTab: React.FC<{
  stats: PlatformStats | null;
  recentReports: ReportRow[];
  recentAudit: AdminAuditRow[];
  loading: boolean;
  onGoToReports: () => void;
}> = ({ stats, recentReports, recentAudit, loading, onGoToReports }) => {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="bg-white dark:bg-zinc-800 rounded-lg p-4 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-12 text-gray-400">Couldn't load stats.</div>;
  }

  return (
    <div className="space-y-6">
      {/* High-level stats */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total users" value={stats.total_users} />
          <StatCard label="Pro users" value={stats.pro_users} subtle={`${pct(stats.pro_users, stats.total_users)}% conversion`} />
          <StatCard label="Verified" value={stats.verified_users} subtle={`${pct(stats.verified_users, stats.total_users)}%`} />
          <StatCard label="Banned" value={stats.banned_users} alert={stats.banned_users > 0} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total matches" value={stats.total_matches} />
          <StatCard label="Matches today" value={stats.matches_today} />
          <StatCard label="Messages today" value={stats.messages_today} />
          <StatCard label="Total likes" value={stats.total_likes} subtle={`${stats.super_likes} super-likes`} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Growth</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Signups today" value={stats.signups_today} />
          <StatCard label="Signups this week" value={stats.signups_week} />
          <StatCard label="Matches this week" value={stats.matches_week} />
          <StatCard
            label="Pending reports"
            value={stats.pending_reports}
            alert={stats.pending_reports > 0}
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Moderation queue</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Pending reports"
            value={stats.pending_reports}
            alert={stats.pending_reports > 0}
          />
          <StatCard
            label="Pending verifications"
            value={stats.pending_verifications ?? 0}
            alert={(stats.pending_verifications ?? 0) > 0}
          />
        </div>
      </div>

      {/* Recent pending reports */}
      {recentReports.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-yellow-900 dark:text-yellow-200">
              🚩 {recentReports.length} pending {recentReports.length === 1 ? 'report' : 'reports'}
            </h3>
            <button
              onClick={onGoToReports}
              className="text-xs font-bold text-yellow-700 dark:text-yellow-300 hover:underline"
            >
              Review all →
            </button>
          </div>
          <ul className="space-y-1.5">
            {recentReports.map((r) => (
              <li key={r.id} className="text-xs text-yellow-900 dark:text-yellow-200">
                <span className="font-medium">{r.reporter_name ?? 'Anonymous'}</span> reported{' '}
                <span className="font-medium">{r.reported_name ?? 'a user'}</span>: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent admin actions */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent admin actions</h2>
        <div className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          {recentAudit.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No admin actions yet.</div>
          ) : (
            recentAudit.map((entry, idx) => (
              <div
                key={entry.id}
                className={`px-4 py-2.5 text-xs ${
                  idx !== recentAudit.length - 1 ? 'border-b border-gray-100 dark:border-zinc-700/50' : ''
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-gray-900 dark:text-white">{entry.admin_email}</span>
                    <span className="text-gray-500 dark:text-gray-400"> · {entry.action.replace(/_/g, ' ')}</span>
                    {entry.details && typeof entry.details === 'object' && 'reason' in entry.details && (
                      <span className="text-gray-500 dark:text-gray-400 italic">
                        {' '}— "{String(entry.details.reason)}"
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 flex-shrink-0">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// StatCard component
// ============================================================================

const StatCard: React.FC<{
  label: string;
  value: number;
  subtle?: string;
  alert?: boolean;
}> = ({ label, value, subtle, alert }) => (
  <div className={`rounded-lg p-4 border ${
    alert
      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40'
      : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700'
  }`}>
    <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">
      {label}
    </div>
    <div className={`text-2xl font-bold ${alert ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>
      {value.toLocaleString()}
    </div>
    {subtle && (
      <div className="text-[10px] text-gray-400 mt-0.5">{subtle}</div>
    )}
  </div>
);

const pct = (n: number, total: number): string => {
  if (total === 0) return '0';
  return ((n / total) * 100).toFixed(1);
};

export default AdminView;
