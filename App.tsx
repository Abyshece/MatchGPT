import React, { Suspense, useState, useEffect } from 'react';
import { lazyScreen } from './lib/lazyScreen';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider, useToast } from './lib/useToast';
import { emailLinkError, supabase } from './lib/supabase';
import LandingView from './components/LandingView';
import CookieBanner from './components/CookieBanner';
import { BACK, isNativeApp, setNativeTheme, useBackHandler } from './lib/nativeApp';
import { isAppPreview } from './lib/appPreview';
import { startStoreSync, stopStoreSync } from './lib/storePurchases';
import { syncPacks } from './lib/boosts';
import { onNotificationWhileOpen, startNativePush, stopNativePush } from './lib/nativePush';
import { setErrorScreen } from './lib/errorReports';
import { missingRequired } from './lib/profileRewards';
import { LEGAL_PAGES, type LegalPageName } from './lib/legalInfo';
import { needsConsent } from './lib/consentService';
import { belowMarriageAge } from './lib/legalAge';
import { IconAlert, IconWave } from './constants';
import { noteDevice } from './lib/deviceId';

// Screens a first visit doesn't need load when they're shown, so the first
// download is small; the signed-in app starts loading as soon as there's a
// session (AppRouter)
const loadDashboard = () => import('./components/Dashboard');
const Dashboard = lazyScreen(loadDashboard);
const OnboardingShell = lazyScreen(() => import('./components/onboarding/OnboardingShell'));
const StepConsent = lazyScreen(() => import('./components/onboarding/StepConsent'));
const EmailVerification = lazyScreen(() => import('./components/EmailVerification'));
const SetNewPassword = lazyScreen(() => import('./components/SetNewPassword'));
const TermsView = lazyScreen(() => import('./components/TermsView'));
const PrivacyView = lazyScreen(() => import('./components/PrivacyView'));
const GrievancesView = lazyScreen(() => import('./components/GrievancesView'));
const SafetyView = lazyScreen(() => import('./components/SafetyView'));
const RefundsView = lazyScreen(() => import('./components/RefundsView'));
const RequiredDetails = lazyScreen(() => import('./components/RequiredDetails'));
const UnderAgeScreen = lazyScreen(() => import('./components/UnderAgeScreen'));

// ============================================================================
// App (Phase 6 Batch 3)
//
// Light or dark follows the device (the phone, or the computer for the
// website) until a member picks Light or Dark in Settings → Appearance, kept in
// profiles.settings_theme ('system', 'light' or 'dark'). Signed out, the app
// always follows the device: a pick belongs to an account. While signed in,
// the pick is also kept on the device, so the app opens in it before the
// profile has loaded.
// ============================================================================

type LegalPage = LegalPageName | null;
type ThemeMode = 'system' | 'light' | 'dark';

// The legal pages have addresses of their own on the website (/terms,
// /privacy, /grievances, /safety, /refunds; the stores link to some); #terms,
// #privacy and so on work everywhere
const LEGAL_PATH = /^\/(terms|privacy|grievances|safety|refunds)\/?$/;
function legalPageInUrl(): LegalPage {
  const page = window.location.hash.replace('#', '') || LEGAL_PATH.exec(window.location.pathname)?.[1];
  return (LEGAL_PAGES as readonly string[]).includes(page ?? '') ? page as LegalPageName : null;
}

const THEME_KEY = 'shaadigpt_theme_mode';

const deviceIsDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

// Whether the device is in dark mode now: it can change while the app is open
// (Control Centre, or at sunset), and phones don't always tell an app in the
// background, so it's checked again on coming back to the app too
function useDeviceDark(): boolean {
  const [dark, setDark] = useState(deviceIsDark);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setDark(deviceIsDark());
    mq?.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      mq?.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return dark;
}

const AppRouter: React.FC<{
  legalPage: LegalPage;
  setLegalPage: (p: LegalPage) => void;
}> = ({ legalPage, setLegalPage }) => {
  const {
    session, profile, profileRow, loading, profileLoading, profileError, profileMissing,
    retryLoadProfile, healMissingProfile, signOut, refreshProfile, passwordRecovery,
  } = useAuth();
  // Answers that became required after this member joined (lib/profileRewards.ts)
  const missingDetails = profile && profileRow?.onboarding_complete ? missingRequired(profile).length > 0 : false;
  // Younger than the legal age to marry in India (lib/legalAge.ts)
  const tooYoung = profile && profileRow?.onboarding_complete ? belowMarriageAge(profile.gender, profile.age) : false;
  const { showToast } = useToast();
  const [pendingSignupEmail, setPendingSignupEmail] = useState<string | null>(null);

  // Signed in means sign-up is finished: drop the pending email so signing out
  // later shows the home page, not the "check your inbox" screen.
  useEffect(() => {
    if (session) setPendingSignupEmail(null);
  }, [session]);

  // Fetch the signed-in app while the profile loads, not after
  useEffect(() => {
    if (session) loadDashboard().catch(() => { /* lazyScreen() tries again when it's shown */ });
  }, [session]);

  // In the phone apps: keep the server's copy of store purchases current
  // (now and then, and when the app comes back to the front)
  const userId = session?.user.id;
  useEffect(() => {
    if (!isNativeApp()) return;
    if (!userId) {
      stopStoreSync();
      return;
    }
    const sync = () => {
      if (document.visibilityState !== 'visible') return;
      startStoreSync(userId).then((synced) => { if (synced) refreshProfile(); });
      // Spotlight and Super Interest packs bought but not added yet
      void syncPacks(userId);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // In the phone apps: notifications for whoever is signed in. While the app
  // is open they show as a toast; a tapped one opens its screen (Dashboard).
  useEffect(() => {
    if (!isNativeApp() || !userId) return;
    const stopToasts = onNotificationWhileOpen(({ title, body }) => showToast(title || body, 'info'));
    startNativePush(userId);
    // Which phone this account is on (Admin → Scam alerts; lib/deviceId.ts)
    void noteDevice();
    return () => {
      stopToasts();
      stopNativePush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // An expired or already-used email link (reset, confirmation) lands here
  // with an error in the URL; say so instead of failing silently.
  useEffect(() => {
    if (emailLinkError) showToast(`${emailLinkError}. Please request a new link.`, 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Theme ----
  // Opens in the pick kept on this device (only while signed in), then
  // follows the account once its profile has loaded, or the device once it's
  // clear nobody is signed in
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const cached = localStorage.getItem(THEME_KEY);
    return cached === 'light' || cached === 'dark' ? cached : 'system';
  });
  const deviceDark = useDeviceDark();

  useEffect(() => {
    if (loading) return;
    const saved = session ? profileRow?.settings_theme : 'system';
    if (saved !== 'light' && saved !== 'dark' && saved !== 'system') return;  // the profile is still loading
    setThemeMode(saved);
    localStorage.setItem(THEME_KEY, saved);
  }, [loading, session, profileRow]);

  const isDarkMode = themeMode === 'dark' || (themeMode === 'system' && deviceDark);

  // Apply the dark class to <html> whenever isDarkMode flips (and, in the
  // Android app, colour the status and gesture bars to match)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    setNativeTheme(isDarkMode);
  }, [isDarkMode]);

  // A pick in Settings → Appearance: shown at once, kept on the account
  const setTheme = async (newMode: ThemeMode) => {
    setThemeMode(newMode);
    localStorage.setItem(THEME_KEY, newMode);
    if (session?.user.id) {
      await supabase
        .from('profiles')
        .update({ settings_theme: newMode })
        .eq('id', session.user.id);
      await refreshProfile();
    }
  };

  // Switches to whichever of light and dark isn't showing
  const handleToggleDarkMode = () => setTheme(isDarkMode ? 'light' : 'dark');

  // The screen shown, for error reports (Dashboard names its tabs itself)
  const screen = legalPage
    ?? (loading ? 'loading'
      : !session ? (pendingSignupEmail ? 'confirm email' : 'landing')
      : passwordRecovery ? 'new password'
      : profileError && !profileLoading ? 'profile error'
      : profileMissing && !profileLoading ? 'profile missing'
      : !profileRow ? 'loading profile'
      : needsConsent(profileRow) ? 'consent'
      : !profileRow.onboarding_complete ? 'onboarding'
      : tooYoung ? 'under age'
      : missingDetails ? 'required details'
      : null);
  useEffect(() => {
    if (screen) setErrorScreen(screen);
  }, [screen]);

  // ---- Legal pages take precedence over everything ----
  if (legalPage === 'terms') {
    return <TermsView onBack={() => setLegalPage(null)} />;
  }
  if (legalPage === 'privacy') {
    return <PrivacyView onBack={() => setLegalPage(null)} />;
  }
  if (legalPage === 'grievances') return <GrievancesView onBack={() => setLegalPage(null)} />;
  if (legalPage === 'safety') return <SafetyView onBack={() => setLegalPage(null)} />;
  if (legalPage === 'refunds') return <RefundsView onBack={() => setLegalPage(null)} />;

  // 1. Top-level bootstrap loading
  if (loading) {
    return <FullScreenLoader label="Loading…" />;
  }

  // 2. Not signed in — the welcome screen. Apple and Google sign in from it;
  //    email opens its sign-in popup (Auth). A sign-up bubbles the email up so
  //    we can show EmailVerification in case 3 below.
  if (!session && !pendingSignupEmail) {
    return (
      <LandingView
        onSignupInitiated={(email) => setPendingSignupEmail(email)}
        onShowLegal={(page) => setLegalPage(page)}
      />
    );
  }

  // 3. Mid-signup, awaiting email verification
  if (!session && pendingSignupEmail) {
    return (
      <EmailVerification
        email={pendingSignupEmail}
        onVerified={() => setPendingSignupEmail(null)}
        onBack={() => setPendingSignupEmail(null)}
      />
    );
  }

  // Opened a password-reset link: choose the new password first.
  if (session && passwordRecovery) {
    return <SetNewPassword />;
  }

  // 4. Profile load errored — surface actual error with retry
  if (profileError && !profileLoading) {
    return <ProfileErrorScreen error={profileError} onRetry={retryLoadProfile} onSignOut={signOut} />;
  }

  // 5. Profile row missing in DB — offer to create one
  if (profileMissing && !profileLoading) {
    return <ProfileMissingScreen onHeal={healMissingProfile} onSignOut={signOut} />;
  }

  // 6. Still loading the profile — but bounded (8s timeout inside AuthContext)
  if (!profileRow) {
    return <FullScreenLoader label="Loading your profile…" />;
  }

  // 7. The current Terms and Privacy Policy not accepted yet (new members, and
  // everyone after they change)
  if (needsConsent(profileRow)) {
    return <StepConsent onShowLegal={(page) => setLegalPage(page)} />;
  }

  // 8. Onboarding flow
  if (!profileRow.onboarding_complete) {
    return <OnboardingShell onComplete={() => { /* AuthContext refreshes */ }} />;
  }

  // 9. Younger than the legal age to marry in India: no further
  if (tooYoung) {
    return <UnderAgeScreen />;
  }

  // 10. Answers that became required after they joined
  if (missingDetails) {
    return <RequiredDetails />;
  }

  // 11. Main app
  return (
    <Dashboard
      isDarkMode={isDarkMode}
      onToggleDarkMode={handleToggleDarkMode}
      themeMode={themeMode}
      onSetTheme={setTheme}
    />
  );
};

const App: React.FC = () => {
  const [legalPage, setLegalPage] = useState<LegalPage>(legalPageInUrl);

  // #terms or #privacy later on (links in emails and in the app)
  useEffect(() => {
    const handleHash = () => {
      const page = legalPageInUrl();
      if (page) setLegalPage(page);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Closing one opened at /terms or /privacy: the address goes back to the home page
  useEffect(() => {
    if (!legalPage && LEGAL_PATH.test(window.location.pathname)) {
      window.history.replaceState(null, '', `/${window.location.search}`);
    }
  }, [legalPage]);

  // Android back button on Terms or Privacy: back to where they came from
  useBackHandler(BACK.PAGE, () => {
    if (!legalPage) return false;
    setLegalPage(null);
    return true;
  });

  return (
    <ToastProvider>
      <AuthProvider>
        <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-200">
          <Suspense fallback={<FullScreenLoader label="Loading…" />}>
            <AppRouter
              legalPage={legalPage}
              setLegalPage={setLegalPage}
            />
          </Suspense>
          {/* The apps use no cookies or trackers, so they don't ask about them */}
          {/* Not in the phone apps, nor in the admin panel's preview of them */}
          {!isNativeApp() && !isAppPreview() && <CookieBanner onNavigateToPrivacy={() => setLegalPage('privacy')} />}
        </div>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;

// ============================================================================
// Helper screens
// ============================================================================

const FullScreenLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#191919] gap-3">
    <div className="w-8 h-8 border-3 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
    <div className="text-gray-500 dark:text-gray-400 text-sm">{label}</div>
  </div>
);

const ProfileErrorScreen: React.FC<{
  error: string;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}> = ({ error, onRetry, onSignOut }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  };

  const lower = error.toLowerCase();
  let hint = '';
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('network')) {
    hint = 'This looks like a network issue. Check that you can reach the internet and try again.';
  } else if (lower.includes('jwt') || lower.includes('expired') || lower.includes('invalid') || lower.includes('401')) {
    hint = 'Your session may have expired. Sign out and back in.';
  } else if (lower.includes('row-level security') || lower.includes('rls')) {
    hint = 'A database permission rule is blocking access. This is a server-side issue.';
  } else if (lower.includes('cors')) {
    hint = 'A cross-origin issue is blocking the request. Check your Supabase project URL.';
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919] p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900/40 rounded-xl shadow-sm p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconAlert /></div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Couldn't load your profile</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{error}</p>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 italic">{hint}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onSignOut}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="flex-1 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-4">Open DevTools → Console for more detail.</p>
      </div>
    </div>
  );
};

const ProfileMissingScreen: React.FC<{
  onHeal: () => Promise<{ error: string | null }>;
  onSignOut: () => Promise<void>;
}> = ({ onHeal, onSignOut }) => {
  const [healing, setHealing] = useState(false);
  const [healError, setHealError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleHeal = async () => {
    setHealing(true);
    setHealError(null);
    const { error } = await onHeal();
    setHealing(false);
    if (error) {
      setHealError(error);
      return;
    }
    showToast('Profile created — welcome!', 'success');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919] p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconWave /></div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Let's finish setting you up</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Your account is verified but a profile hasn't been created yet. Click below to create one and start onboarding.
        </p>
        {healError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-300 text-xs rounded-lg p-3 mb-4 text-left">
            <strong>Couldn't create:</strong> {healError}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onSignOut}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
          <button
            onClick={handleHeal}
            disabled={healing}
            className="flex-1 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {healing ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      </div>
    </div>
  );
};
