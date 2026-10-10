import React, { Suspense, useEffect } from 'react';
import { lazyScreen } from '../../lib/lazyScreen';
import { AuthProvider, useAuth } from '../../lib/AuthContext';
import { ToastProvider, useToast } from '../../lib/useToast';
import { emailLinkError } from '../../lib/supabase';
import { setErrorScreen } from '../../lib/errorReports';
import { isAdminAlert } from '../../lib/adminAlerts';
import { isAdminHost } from '../../lib/website';
import SiteHome from './SiteHome';

const AdminSite = lazyScreen(() => import('./AdminSite'));
const SetNewPassword = lazyScreen(() => import('../SetNewPassword'));
const TermsView = lazyScreen(() => import('../TermsView'));
const PrivacyView = lazyScreen(() => import('../PrivacyView'));
const GrievancesView = lazyScreen(() => import('../GrievancesView'));
const SafetyView = lazyScreen(() => import('../SafetyView'));
const RefundsView = lazyScreen(() => import('../RefundsView'));
const BlogIndex = lazyScreen(() => import('./BlogPages').then((m) => ({ default: m.BlogIndex })));
const BlogPostPage = lazyScreen(() => import('./BlogPages').then((m) => ({ default: m.BlogPostPage })));
const StoriesPage = lazyScreen(() => import('./StoriesPages').then((m) => ({ default: m.StoriesPage })));
const BiodataPage = lazyScreen(() => import('./BiodataPage'));
const FamilyPage = lazyScreen(() => import('./FamilyPage'));

// ============================================================================
// Website: the website, for everyone who isn't in the apps (lib/website.ts)
//
//   /                 the home page: what Shaadi24 is, where to get the apps
//   /admin            the admin panel, for admins only (and the home page of
//                     admin.shaadi24.in, where shaadi24.in/admin forwards)
//   /terms, /privacy  Terms of Service and the Privacy Policy (#terms and
//                     #privacy too, as older links have them)
//   /grievances       the Grievance Officer and a complaint form (IT Rules 2021)
//   /safety, /refunds Community Guidelines and Safety; Refunds and Cancellations
//   /stories          couples who met on Shaadi24 (StoriesPages.tsx)
//   /blog             the blog (BlogPages.tsx), /blog/<slug> a post; the server
//                     sends these with their search engine tags (api/blog.ts)
//   /b/<link>         a member's shared biodata (BiodataPage.tsx; lib/biodata.ts)
//   /family/<link>    Family Circle: a member's shortlist for their family to
//                     react to (FamilyPage.tsx; lib/familyCircle.ts)
// /support and /delete-account stand on their own (index.tsx). A link from
// an email (a password reset) asks for the new password wherever it lands.
// ============================================================================

type Route = 'home' | 'admin' | 'terms' | 'privacy' | 'grievances' | 'safety' | 'refunds' | 'stories' | 'blog' | `blog/${string}`
  | `b/${string}` | `family/${string}`;

// An admin alert clicked while no tab was open comes to /?push=… (public/sw.js)
function isAdminAlertData(raw: string | null): boolean {
  try {
    return isAdminAlert(JSON.parse(raw ?? '{}')?.event_type);
  } catch {
    return false;
  }
}

function currentRoute(): Route {
  const path = window.location.pathname.replace(/^\/|\/$/g, '');
  if (path === 'admin' || (path === '' && isAdminHost())) return 'admin';
  if (path === 'terms' || window.location.hash === '#terms') return 'terms';
  if (path === 'privacy' || window.location.hash === '#privacy') return 'privacy';
  if (path === 'grievances' || path === 'safety' || path === 'refunds') return path;
  if (path === 'stories') return 'stories';
  if (path === 'blog') return 'blog';
  const post = path.match(/^blog\/([a-z0-9-]+)$/);
  if (post) return `blog/${post[1]}`;
  const biodata = path.match(/^b\/([a-f0-9]{20})$/);
  if (biodata) return `b/${biodata[1]}`;
  const family = path.match(/^family\/([a-f0-9]{24})$/);
  if (family) return `family/${family[1]}`;
  if (isAdminAlertData(new URLSearchParams(window.location.search).get('push'))) {
    window.history.replaceState(null, '', `/admin${window.location.search}`);
    return 'admin';
  }
  return 'home';
}

const goHome = () => window.location.assign('/');

const Loader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919]">
    <div className="w-8 h-8 border-3 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
  </div>
);

const Routes: React.FC<{ route: Route }> = ({ route }) => {
  const { session, passwordRecovery } = useAuth();
  const { showToast } = useToast();

  // An expired or already-used email link lands here with an error
  useEffect(() => {
    if (emailLinkError) showToast(`${emailLinkError}. Please request a new link.`, 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session && passwordRecovery) return <SetNewPassword />;
  if (route === 'admin') return <AdminSite />;
  if (route === 'terms') return <TermsView onBack={goHome} />;
  if (route === 'privacy') return <PrivacyView onBack={goHome} />;
  if (route === 'grievances') return <GrievancesView onBack={goHome} />;
  if (route === 'safety') return <SafetyView onBack={goHome} />;
  if (route === 'refunds') return <RefundsView onBack={goHome} />;
  if (route === 'stories') return <StoriesPage />;
  if (route === 'blog') return <BlogIndex />;
  if (route.startsWith('blog/')) return <BlogPostPage slug={route.slice('blog/'.length)} />;
  if (route.startsWith('b/')) return <BiodataPage token={route.slice('b/'.length)} />;
  if (route.startsWith('family/')) return <FamilyPage token={route.slice('family/'.length)} />;
  return <SiteHome />;
};

// Read once, when the page loads (each page of the website is a page load)
const route = currentRoute();
setErrorScreen(`website ${route}`);

const Website: React.FC = () => {

  // The website follows the device's light or dark setting
  useEffect(() => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', dark?.matches ?? false);
    apply();
    dark?.addEventListener('change', apply);
    return () => dark?.removeEventListener('change', apply);
  }, []);

  // An admin alert clicked while a tab of the website is open: the service
  // worker tells that tab, which goes to the admin panel (there, AdminSite)
  useEffect(() => {
    if (route === 'admin' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'push_click') return;
      const data = JSON.stringify(e.data.data ?? {});
      if (isAdminAlertData(data)) window.location.assign(`/admin?push=${encodeURIComponent(data)}`);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100">
          <Suspense fallback={<Loader />}>
            <Routes route={route} />
          </Suspense>
        </div>
      </AuthProvider>
    </ToastProvider>
  );
};

export default Website;
