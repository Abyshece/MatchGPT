import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { adminTabFromAlert } from '../../lib/adminAlerts';
import { lazyScreen } from '../../lib/lazyScreen';
import { useAuth } from '../../lib/AuthContext';
import { useIsAdmin } from '../../lib/useIsAdmin';
import type { AdminTab } from '../admin/AdminView';
import StoreBadges from '../StoreBadges';
import { BrandMark } from '../../constants';

const Auth = lazyScreen(() => import('../Auth'));
const AdminView = lazyScreen(() => import('../admin/AdminView'));
const PushNotifSetup = lazyScreen(() => import('../PushNotifSetup'));

// ============================================================================
// AdminSite: /admin on the website
//
// Admins sign in here (email, Google, or a reset code by email; no sign-up)
// and get the admin panel. Anyone else who signs in is told Shaadi24 is used
// in the app. The database decides who is an admin (is_admin()), and every
// admin action checks again on the server.
// ============================================================================

const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3">
    <div className="w-8 h-8 border-3 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
    <div className="text-gray-500 dark:text-gray-400 text-sm">{label}</div>
  </div>
);

const NotAnAdmin: React.FC<{ email: string; onSignOut: () => void }> = ({ email, onSignOut }) => (
  <div className="min-h-screen flex items-center justify-center p-6">
    <div className="max-w-md text-center" data-testid="not-an-admin">
      <BrandMark className="w-10 h-10 mx-auto" />
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Shaadi24 is used in the app</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        You're signed in as <strong className="text-gray-900 dark:text-white">{email}</strong>. The website's sign-in is
        for Shaadi24's team; members use Shaadi24 on Android and iPhone, with the same account.
      </p>
      <StoreBadges className="mt-6 justify-center" />
      <div className="mt-6 flex justify-center gap-3 text-sm">
        <button onClick={onSignOut} className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-bold hover:opacity-90">
          Sign out
        </button>
        <a href="/" className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
          Home
        </a>
      </div>
    </div>
  </div>
);

interface PushData { event_type?: string; admin_tab?: string }
const tabFor = (data: PushData): AdminTab | null => adminTabFromAlert(data);

const AdminShell: React.FC<{ email: string; onSignOut: () => void }> = ({ email, onSignOut }) => {
  const [open, setOpen] = useState<{ tab?: AdminTab; key: number }>({ key: 0 });
  const [showAlerts, setShowAlerts] = useState(false);

  // A clicked admin alert opens its tab: from the service worker while this
  // page is open, or in the address when it opened the page (public/sw.js)
  const openFromAlert = useCallback((data: PushData) => {
    const tab = tabFor(data);
    if (tab) setOpen((o) => ({ tab, key: o.key + 1 }));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const opened = params.get('push');
    if (opened) {
      window.history.replaceState(null, '', '/admin');
      try { openFromAlert(JSON.parse(opened) as PushData); } catch { /* not an alert's */ }
    }
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'push_click') openFromAlert((e.data.data ?? {}) as PushData);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [openFromAlert]);

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-none flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-zinc-800">
        <a href="/" className="flex items-center gap-2 select-none min-w-0">
          <BrandMark className="w-6 h-6" />
          <span className="font-bold tracking-tight">Shaadi24</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5">Admin</span>
        </a>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:block truncate max-w-[220px] text-gray-500 dark:text-gray-400">{email}</span>
          <button
            onClick={() => setShowAlerts((v) => !v)}
            aria-expanded={showAlerts}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Alerts
          </button>
          <button
            onClick={onSignOut}
            className="px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      </header>
      {showAlerts && (
        <div className="flex-none border-b border-gray-100 dark:border-zinc-800 px-2 sm:px-4 py-1" data-testid="admin-alerts-setup">
          <Suspense fallback={null}><PushNotifSetup forAdmins /></Suspense>
        </div>
      )}
      <main className="flex-1 relative overflow-hidden">
        <Suspense fallback={<Spinner label="Loading…" />}>
          <AdminView key={open.key} initialTab={open.tab} />
        </Suspense>
      </main>
    </div>
  );
};

const AdminSite: React.FC = () => {
  const { session, loading, signOut } = useAuth();
  const isAdmin = useIsAdmin();

  useEffect(() => { document.title = 'Shaadi24 Admin'; }, []);

  if (loading) return <Spinner label="Loading…" />;
  if (!session) {
    return (
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Auth forAdmins onSignInSuccess={() => { /* the session shows the panel */ }} onSignupInitiated={() => { /* no sign-up here */ }} />
      </Suspense>
    );
  }
  if (isAdmin === null) return <Spinner label="Checking your access…" />;
  const email = session.user.email ?? '';
  if (!isAdmin) return <NotAnAdmin email={email} onSignOut={() => signOut()} />;
  return <AdminShell email={email} onSignOut={() => signOut()} />;
};

export default AdminSite;
