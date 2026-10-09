import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { IconBan, IconFlag } from '../../constants';
import { useToast } from '../../lib/useToast';
import {
  fetchPlatformStats, fetchReports, fetchAuditLog, setProForAll,
} from '../../lib/adminService';
import { useIsAdmin } from '../../lib/useIsAdmin';
import { isNativeApp } from '../../lib/nativeApp';
import { isAppPreview } from '../../lib/appPreview';
import type { PlatformStats, ReportRow, AdminAuditRow } from '../../lib/adminService';
import AdminCustomersTab from './AdminCustomersTab';
import AdminProfilesTab from './AdminProfilesTab';
import AdminMessagesTab from './AdminMessagesTab';
import AdminOffersTab from './AdminOffersTab';
import AdminEnquiriesTab from './AdminEnquiriesTab';
import AdminBlogTab from './AdminBlogTab';
import { NO_COUNTS, fetchSidebarCounts, type SidebarCounts } from '../../lib/adminSafety';
import AdminModerationTab from './AdminModerationTab';
import AdminRiskTab from './AdminRiskTab';
import AdminStoriesTab from './AdminStoriesTab';
import AdminAutomationsTab from './AdminAutomationsTab';
import AdminGrowthTab from './AdminGrowthTab';
import AdminSearchTab from './AdminSearchTab';
import AdminReportsTab from './AdminReportsTab';
import AdminGrievancesTab from './AdminGrievancesTab';
import AdminVerificationsTab from './AdminVerificationsTab';
import AdminFinanceTab from './AdminFinanceTab';
import AdminErrorsTab from './AdminErrorsTab';
import AdminAppTab from './AdminAppTab';
import AdminTeamTab from './AdminTeamTab';
import { TwoStepCard, TwoStepGate } from './AdminTwoStep';
import { canUse, fetchAdminStatus, roleLabel, type AdminStatus } from '../../lib/adminTeam';

// ============================================================================
// AdminView
//
// The admin panel: sections in a sidebar on the left (a row of buttons at the
// top on a phone), grouped like a Notion workspace:
//   Overview                     platform stats, recent reports and actions,
//                                the Shaadi24+ for everyone switch
//   People:   Customers          every member in one row (AdminCustomersTab)
//             Verification       requests waiting, each with whether it's
//                                likely to pass (AdminVerificationsTab)
//             Profiles           how complete profiles are, and a message
//                                to those who haven't filled in a section
//   Safety:   Moderation         new photos and texts to approve (AdminModerationTab)
//             Reports, Scam alerts (AdminRiskTab), Complaints (to the
//             Grievance Officer, with deadlines)
//   Growth:   Messages           in-app messages and notifications
//             Automatic messages messages that send themselves (welcome, nudges)
//             Offers             a code in a banner on the home page
//             Blog               posts for the website's /blog, written by
//                                hand or with AI, with their SEO fields
//             Success stories    couples who met here, for the website
//   Inbox:    Enquiries          the website's contact form
//   Insights: Growth             members, activity, the sign-up funnel
//             Search insights    what members search for
//             Finance            subscribers, revenue, every charge (CSV)
//   System:   Errors, Audit log, Team (who's an admin, their roles, two-step
//             sign-in), App preview (the members' app, website only)
//
// Access is decided by the database: the signed-in email must be in
// admin_emails, and its role (lib/adminTeam.ts) decides the sections shown;
// each admin function checks the same (admin_can()). If a non-admin somehow
// reaches this view they see "Access denied", and the admin RPCs refuse them
// anyway. When two-step sign-in is required (or they set it up), the code
// from their authenticator app comes first (AdminTwoStep.tsx).
// ============================================================================

export type AdminTab = 'dashboard' | 'customers' | 'verifications' | 'profiles' | 'moderation' | 'reports' | 'risk' | 'grievances'
  | 'messages' | 'automations' | 'offers' | 'blog' | 'stories' | 'enquiries' | 'growth' | 'search' | 'finance' | 'errors' | 'audit' | 'team' | 'app';

interface Section {
  id: AdminTab;
  label: string;
  description: string;
  icon: React.ReactNode;
  count?: (counts: SidebarCounts) => number;
  wide?: boolean;   // uses the whole width (a wide table)
}

// Small line icons, Notion-like (Lucide's shapes)
const icon = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split('|').map((path) => <path key={path} d={path} />)}
  </svg>
);

const SECTIONS: Record<AdminTab, Section> = {
  dashboard: { id: 'dashboard', label: 'Overview', description: 'How Shaadi24 is doing, and what needs you.', icon: icon('M3 3h7v9H3z|M14 3h7v5h-7z|M14 12h7v9h-7z|M3 16h7v5H3z') },
  customers: { id: 'customers', label: 'Customers', description: 'Every member, one row each. Open a member to act on their account.', icon: icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75'), wide: true },
  verifications: { id: 'verifications', label: 'Verification', description: 'Members waiting to be verified, with whether each is likely to pass.', icon: icon('M9 12l2 2 4-4|M12 2l2.4 1.8 3 .2.9 2.8 2.4 1.8-1 2.8 1 2.8-2.4 1.8-.9 2.8-3 .2L12 22l-2.4-1.8-3-.2-.9-2.8L3.3 15.4l1-2.8-1-2.8 2.4-1.8.9-2.8 3-.2z'), count: (c) => c.verifications },
  profiles: { id: 'profiles', label: 'Profiles', description: 'How much members have filled in, section by section, and a message to those who haven’t.', icon: icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M8 13h8|M8 17h5') },
  moderation: { id: 'moderation', label: 'Moderation', description: 'New photos and what members write about themselves, to approve before others see them.', wide: true, icon: icon('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'), count: (c) => c.moderation },
  messages: { id: 'messages', label: 'Messages', description: 'In-app messages and notifications to a group of members.', icon: icon('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z') },
  automations: { id: 'automations', label: 'Automatic messages', description: 'Messages that send themselves: a welcome, nudges for a photo or an unfinished profile, and to members not seen for a while.', icon: icon('M13 2L3 14h9l-1 8 10-12h-9l1-8z') },
  offers: { id: 'offers', label: 'Offers', description: 'A code for Shaadi24+ in a banner on the website’s home page.', icon: icon('M20 12v10H4V12|M2 7h20v5H2z|M12 22V7|M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z|M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z') },
  blog: { id: 'blog', label: 'Blog', description: 'Posts on the website’s blog: write them yourself or with AI, with their search engine fields.', wide: true, icon: icon('M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5|M14 2v4a2 2 0 0 0 2 2h4|M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z') },
  stories: { id: 'stories', label: 'Success stories', description: 'Couples who met on Shaadi24, shown on the website with their consent.', icon: icon('M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z') },
  growth: { id: 'growth', label: 'Growth', description: 'Members, who is active, how far new members get, and where members are.', icon: icon('M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6') },
  search: { id: 'search', label: 'Search insights', description: 'What members search for, and the searches that found no one.', icon: icon('M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16|M21 21l-4.35-4.35') },
  enquiries: { id: 'enquiries', label: 'Enquiries', description: 'Messages from the contact form on the website.', icon: icon('M22 12h-6l-2 3h-4l-2-3H2|M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'), count: (c) => c.enquiries },
  reports: { id: 'reports', label: 'Reports', description: 'Members reported by other members.', icon: icon('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z|M4 22v-7'), count: (c) => c.reports },
  risk: { id: 'risk', label: 'Scam alerts', description: 'Members who look like scammers or fake profiles, from what they do.', icon: icon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M12 8v4|M12 16h.01') },
  grievances: { id: 'grievances', label: 'Complaints', description: 'Complaints to the Grievance Officer, with their legal deadlines.', icon: icon('M12 3v18|M5 7l7-4 7 4|M2 14l3-7 3 7a3.5 3.5 0 0 1-6 0|M16 14l3-7 3 7a3.5 3.5 0 0 1-6 0|M8 21h8') },
  finance: { id: 'finance', label: 'Finance', description: 'Subscribers, revenue by month and store, every charge.', icon: icon('M3 7h18v13H3z|M16 13h2|M3 7l3-4h12l3 4'), wide: true },
  errors: { id: 'errors', label: 'Errors', description: 'What the apps and the website reported going wrong.', icon: icon('M12 9v4|M12 17h.01|M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z') },
  audit: { id: 'audit', label: 'Audit log', description: 'Every admin action, newest first.', icon: icon('M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5|M12 7v5l4 2') },
  team: { id: 'team', label: 'Team', description: 'Who is an admin, with which role, and two-step sign-in.', icon: icon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4') },
  app: { id: 'app', label: 'App preview', description: "The members' app, phone-sized, signed in as you.", icon: icon('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z|M12 18h.01') },
};

// The app preview opens the members' app from the website; inside the phone
// apps and the preview itself, admins are in the members' app already
const GROUPS: { label: string | null; items: AdminTab[] }[] = [
  { label: null, items: ['dashboard'] },
  { label: 'People', items: ['customers', 'verifications', 'profiles'] },
  { label: 'Safety', items: ['moderation', 'reports', 'risk', 'grievances'] },
  { label: 'Growth', items: ['messages', 'automations', 'offers', 'blog', 'stories'] },
  { label: 'Inbox', items: ['enquiries'] },
  { label: 'Insights', items: ['growth', 'search', 'finance'] },
  { label: 'System', items: isNativeApp() || isAppPreview() ? ['errors', 'audit', 'team'] : ['errors', 'audit', 'team', 'app'] },
];

// initialTab: the tab an admin alert opens (Dashboard)
const AdminView: React.FC<{ initialTab?: AdminTab }> = ({ initialTab }) => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const isAdmin = useIsAdmin();

  const [chosen, setTab] = useState<AdminTab>(initialTab ?? 'dashboard');
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const loadStatus = useCallback(() => { void fetchAdminStatus().then(setStatus); }, []);
  useEffect(() => { if (isAdmin) loadStatus(); }, [isAdmin, loadStatus]);
  // Their role's sections; one it doesn't include (an old alert) opens the first that it does
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((id) => canUse(status, id)) })).filter((g) => g.items.length > 0);
  const allowed = groups.flatMap((g) => g.items);
  const tab: AdminTab = allowed.includes(chosen) ? chosen : allowed[0] ?? 'dashboard';
  const ready = status?.listed === true && !status.needs_code;
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentReports, setRecentReports] = useState<ReportRow[]>([]);
  const [recentAudit, setRecentAudit] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<SidebarCounts>(NO_COUNTS);
  const recount = useCallback(() => { void fetchSidebarCounts().then(setCounts); }, []);

  const seesReports = canUse(status, 'reports');
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const [statsRes, reportsRes, auditRes] = await Promise.all([
      fetchPlatformStats(),
      seesReports ? fetchReports('pending') : Promise.resolve({ reports: [] as ReportRow[], error: null }),
      fetchAuditLog(10),
    ]);
    setLoading(false);

    if (statsRes.error) showToast(`Stats: ${statsRes.error}`, 'error');
    else setStats(statsRes.stats);

    if (reportsRes.error) showToast(`Reports: ${reportsRes.error}`, 'error');
    else setRecentReports(reportsRes.reports.slice(0, 5));

    if (auditRes.error) showToast(`Audit: ${auditRes.error}`, 'error');
    else setRecentAudit(auditRes.entries);
  }, [showToast, seesReports]);

  useEffect(() => {
    if (ready && tab === 'dashboard') loadDashboard();
  }, [ready, tab, loadDashboard]);
  // Each section's to-do in the sidebar, again whenever another section opens
  useEffect(() => { if (ready) recount(); }, [ready, tab, recount]);

  // ---- Access control ----
  if (!profile) return null;
  if (isAdmin === null || (isAdmin && !status)) {
    return <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">Checking access…</div>;
  }
  if (!isAdmin || !status?.listed) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center">
          <div aria-hidden="true" className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6"><IconBan /></div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Access denied</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This area is only available to admins. Your account isn't on the admin list.
          </p>
        </div>
      </div>
    );
  }

  if (status.needs_code) return <TwoStepGate onDone={loadStatus} />;

  const section = SECTIONS[tab];
  const navButton = (id: AdminTab, phone: boolean) => {
    const item = SECTIONS[id];
    const count = item.count?.(counts) ?? 0;
    const on = tab === id;
    return (
      <button
        key={id}
        type="button"
        data-section={id}
        onClick={() => setTab(id)}
        aria-current={on ? 'page' : undefined}
        className={phone
          ? `flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap ${
            on ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white' : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300'}`
          : `w-full flex items-center gap-2.5 h-8 px-2 rounded-md text-[14px] text-left transition-colors ${
            on ? 'bg-gray-200/70 dark:bg-zinc-700/60 text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-200/50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100'}`}
      >
        {!phone && <span className="flex-none opacity-80">{item.icon}</span>}
        <span className="flex-1 truncate">{item.label}</span>
        {count > 0 && (
          <span aria-hidden="true" className={`text-[11px] tabular-nums px-1.5 rounded ${on && phone ? '' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="h-full flex bg-white dark:bg-[#191919]">
      {/* Sections, Notion-like, from tablet width */}
      <nav aria-label="Admin sections" data-testid="admin-sidebar" className="hidden md:flex flex-col w-56 flex-none overflow-y-auto border-r border-gray-200/80 dark:border-zinc-800 bg-[#f7f7f5] dark:bg-[#202020] px-2 py-4">
        <p className="px-2 pb-2 text-[12px] font-semibold text-gray-500 dark:text-zinc-400">
          Admin{status.role && status.role !== 'owner' && <span className="font-normal" data-testid="admin-role"> · {roleLabel(status.role)}</span>}
        </p>
        {groups.map((g) => (
          <div key={g.label ?? 'top'} className="mb-3">
            {g.label && <p className="px-2 pt-1 pb-1 text-[11px] font-medium text-gray-500 dark:text-zinc-400">{g.label}</p>}
            <div className="space-y-0.5">{g.items.map((id) => navButton(id, false))}</div>
          </div>
        ))}
      </nav>

      {/* Focusable, so the keyboard can scroll a long section with nothing to tab to (the audit log) */}
      <div className="flex-1 min-w-0 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 dark:focus-visible:ring-zinc-600"
        tabIndex={0} role="region" aria-label={`Admin: ${section.label}`}>
        {/* On a phone, the sections at the top, wrapping so all are in view */}
        <nav aria-label="Admin sections" className="md:hidden flex flex-wrap gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-zinc-800">
          {allowed.map((id) => navButton(id, true))}
        </nav>

        <div className={`${section.wide ? 'max-w-none' : 'max-w-5xl'} mx-auto px-4 sm:px-8 py-6 sm:py-8`}>
          <header className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
              <span className="text-gray-400 dark:text-zinc-500 [&>svg]:w-6 [&>svg]:h-6">{section.icon}</span>
              {section.label}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">{section.description} Every action here is logged.</p>
          </header>

          {tab === 'dashboard' && canUse(status, 'owner') && <ProForAllSwitch onChanged={loadDashboard} />}
          {tab === 'dashboard' && (
            <DashboardTab
              stats={stats}
              recentReports={recentReports}
              recentAudit={recentAudit}
              loading={loading}
              onGoToReports={() => setTab('reports')}
            />
          )}
          {tab === 'dashboard' && <div className="mt-6"><TwoStepCard required={status.two_step_required === true} onChanged={loadStatus} /></div>}
          {tab === 'customers' && <AdminCustomersTab onAuditUpdate={loadDashboard} />}
          {tab === 'verifications' && <AdminVerificationsTab onAuditUpdate={() => { void loadDashboard(); recount(); }} />}
          {tab === 'profiles' && <AdminProfilesTab />}
          {tab === 'moderation' && <AdminModerationTab onChanged={recount} />}
          {tab === 'reports' && <AdminReportsTab onAuditUpdate={() => { void loadDashboard(); recount(); }} />}
          {tab === 'risk' && <AdminRiskTab />}
          {tab === 'grievances' && <AdminGrievancesTab onAuditUpdate={loadDashboard} />}
          {tab === 'messages' && <AdminMessagesTab />}
          {tab === 'offers' && <AdminOffersTab />}
          {tab === 'blog' && <AdminBlogTab />}
          {tab === 'automations' && <AdminAutomationsTab />}
          {tab === 'stories' && <AdminStoriesTab />}
          {tab === 'enquiries' && <AdminEnquiriesTab onChanged={recount} />}
          {tab === 'growth' && <AdminGrowthTab />}
          {tab === 'search' && <AdminSearchTab />}
          {tab === 'finance' && <AdminFinanceTab />}
          {tab === 'errors' && <AdminErrorsTab onAuditUpdate={loadDashboard} />}
          {tab === 'audit' && <AuditLog />}
          {tab === 'team' && <AdminTeamTab status={status} onStatusChanged={loadStatus} />}
          {tab === 'app' && <AdminAppTab />}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Audit log: every admin action, newest first
// ============================================================================

const AuditLog: React.FC = () => {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<AdminAuditRow[] | null>(null);

  useEffect(() => {
    void fetchAuditLog(300).then(({ entries, error }) => {
      if (error) showToast(`Couldn't load the audit log: ${error}`, 'error');
      setEntries(entries);
    });
  }, [showToast]);

  if (!entries) return <div className="h-40 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  if (!entries.length) return <p className="text-sm text-gray-500 dark:text-zinc-400">No admin actions yet.</p>;
  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden" data-testid="audit-log">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">When</th>
            <th scope="col" className="text-left font-medium px-3 py-2">Admin</th>
            <th scope="col" className="text-left font-medium px-3 py-2">What</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-gray-100 dark:border-zinc-800 align-top">
              <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-zinc-400">{new Date(e.created_at).toLocaleString()}</td>
              <td className="px-3 py-2 whitespace-nowrap">{e.admin_email}</td>
              <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                {auditAction(e)}
                {e.details && typeof e.details === 'object' && 'reason' in e.details && <span className="text-gray-500 dark:text-zinc-400 italic"> — “{String(e.details.reason)}”</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// "Shaadi24+ for everyone": the one switch for Shaadi24+'s features
// (app_settings; the server and the apps follow it at once)
// ============================================================================

const ProForAllSwitch: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const { proForAll, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const on = !proForAll;
    if (!on && !window.confirm('Turn off Shaadi24+ for everyone? Members without a subscription lose Likes You, the 3 free Super Interests a week, the extra filters, compatibility reports and date proposals straight away.')) return;
    setSaving(true);
    const { error } = await setProForAll(on);
    if (!error) await refreshProfile();
    setSaving(false);
    if (error) {
      showToast(`Couldn't change it: ${error}`, 'error');
      return;
    }
    showToast(on ? 'Shaadi24+ is on for everyone' : 'Shaadi24+ is for subscribers only now', 'success');
    onChanged();
  };

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 id="pro-for-all-label" className="text-sm font-bold text-gray-900 dark:text-white">Shaadi24+ for everyone</h2>
        <p id="pro-for-all-description" className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {proForAll
            ? 'On: every member gets Likes You, 3 Super Interests a week, refreshing Standouts, every filter, compatibility reports and date proposals for free. Free accounts keep the free limits (AI searches as set under Search insights, and 15 likes a day). Turn it off when Shaadi24+ goes on sale.'
            : 'Off: only subscribers get Shaadi24+\'s features.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={proForAll}
        aria-labelledby="pro-for-all-label"
        aria-describedby="pro-for-all-description"
        disabled={saving}
        onClick={toggle}
        className={`flex-shrink-0 w-11 h-6 rounded-full relative transition-colors duration-200 disabled:opacity-60 ${proForAll ? 'bg-green-500' : 'bg-gray-300 dark:bg-zinc-600'}`}
      >
        <span aria-hidden="true" className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${proForAll ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
};

// What an audit entry says was done
function auditAction(entry: AdminAuditRow): string {
  const details = entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details) ? entry.details : null;
  if (entry.action === 'set_pro_for_all') return `turned Shaadi24+ for everyone ${details?.on ? 'on' : 'off'}`;
  if (entry.action === 'set_require_two_step') return `${details?.on ? 'required' : 'stopped requiring'} two-step sign-in for every admin`;
  if (entry.action === 'add_admin') return `added ${details?.email ?? 'an admin'} as ${roleLabel(String(details?.role ?? '')).toLowerCase()}`;
  if (entry.action === 'change_admin_role') return `made ${details?.email ?? 'an admin'} ${roleLabel(String(details?.role ?? '')).toLowerCase()}${details?.was ? ` (was ${roleLabel(String(details.was)).toLowerCase()})` : ''}`;
  if (entry.action === 'remove_admin') return `removed ${details?.email ?? 'an admin'} from the admin team`;
  if (entry.action === 'reset_admin_two_step') return `reset the two-step sign-in of ${details?.email ?? 'an admin'}`;
  if (entry.action === 'correct_date_of_birth') {
    return `corrected a date of birth${details?.from ? ` from ${details.from}` : ''} to ${details?.to ?? '?'}${details?.note ? ` (${details.note})` : ''}`;
  }
  return entry.action.replace(/_/g, ' ');
}

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
    return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Couldn't load stats.</div>;
  }

  return (
    <div className="space-y-6">
      {/* High-level stats */}
      <div>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total users" value={stats.total_users} />
          <StatCard label="Pro users" value={stats.pro_users} subtle={`${pct(stats.pro_users, stats.total_users)}% conversion`} />
          <StatCard label="Verified" value={stats.verified_users} subtle={`${pct(stats.verified_users, stats.total_users)}%`} />
          <StatCard label="Banned" value={stats.banned_users} alert={stats.banned_users > 0} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total matches" value={stats.total_matches} />
          <StatCard label="Matches today" value={stats.matches_today} />
          <StatCard label="Messages today" value={stats.messages_today} />
          <StatCard label="Total likes" value={stats.total_likes} subtle={`${stats.super_likes} Super Interests`} />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Growth</h2>
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
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Moderation queue</h2>
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
            <h3 className="text-sm font-bold text-yellow-900 dark:text-yellow-200 flex items-center gap-2">
              <span aria-hidden="true" className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"><IconFlag /></span>
              {recentReports.length} pending {recentReports.length === 1 ? 'report' : 'reports'}
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
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Recent admin actions</h2>
        <div className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          {recentAudit.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No admin actions yet.</div>
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
                    <span className="text-gray-500 dark:text-gray-400"> · {auditAction(entry)}</span>
                    {entry.details && typeof entry.details === 'object' && 'reason' in entry.details && (
                      <span className="text-gray-500 dark:text-gray-400 italic">
                        {' '}— "{String(entry.details.reason)}"
                      </span>
                    )}
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
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
    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${alert ? 'text-red-800 dark:text-red-200' : 'text-gray-500 dark:text-gray-400'}`}>
      {label}
    </div>
    <div className={`text-2xl font-bold ${alert ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>
      {value.toLocaleString()}
    </div>
    {subtle && (
      <div className={`text-[10px] mt-0.5 ${alert ? 'text-red-800 dark:text-red-200' : 'text-gray-500 dark:text-gray-400'}`}>{subtle}</div>
    )}
  </div>
);

const pct = (n: number, total: number): string => {
  if (total === 0) return '0';
  return ((n / total) * 100).toFixed(1);
};

export default AdminView;
