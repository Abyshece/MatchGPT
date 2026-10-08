// ============================================================================
// Admin alerts (notify_admins(): event types starting "admin_", with the
// section to open in data.admin_tab): which admin section a clicked alert
// opens, on the website (AdminSite) and in the apps (Dashboard). The members'
// own "admin_message" (a message from the team) isn't one.
// ============================================================================

export const ADMIN_ALERT_TABS = [
  'reports', 'verifications', 'grievances', 'enquiries', 'moderation', 'risk', 'customers',
] as const;
export type AdminAlertTab = typeof ADMIN_ALERT_TABS[number];

export const isAdminAlert = (eventType: unknown): boolean =>
  typeof eventType === 'string' && eventType.startsWith('admin_') && eventType !== 'admin_message';

/** The section an admin alert opens, or null if it isn't one */
export function adminTabFromAlert(data: { event_type?: unknown; admin_tab?: unknown }): AdminAlertTab | null {
  if (!isAdminAlert(data.event_type)) return null;
  const tab = data.admin_tab;
  return typeof tab === 'string' && (ADMIN_ALERT_TABS as readonly string[]).includes(tab) ? (tab as AdminAlertTab) : 'reports';
}
