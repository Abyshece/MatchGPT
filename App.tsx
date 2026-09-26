import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ToastProvider, useToast } from './lib/useToast';
import Auth from './components/Auth';
import EmailVerification from './components/EmailVerification';
import LandingView from './components/LandingView';
import OnboardingShell from './components/onboarding/OnboardingShell';
import StepConsent from './components/onboarding/StepConsent';
import Dashboard from './components/Dashboard';
import TermsView from './components/TermsView';
import PrivacyView from './components/PrivacyView';
import CookieBanner from './components/CookieBanner';

// ============================================================================
// App (Phase 6 Batch 3)
//
// Adds dark-mode persistence: theme is stored in profiles.settings_theme as
// 'system' | 'light' | 'dark', applied on every load.
//
// Resolution order for the *effective* theme:
//   1. If authed AND profile has settings_theme = 'dark' or 'light' → use it
//   2. Else: OS preference via prefers-color-scheme media query
//
// The toggle in the sidebar cycles light → dark → system and persists.
// ============================================================================

type LegalPage = 'terms' | 'privacy' | null;
type ThemeMode = 'system' | 'light' | 'dark';

// Compute the actual boolean "is dark mode active right now" from a theme mode.
function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  // mode === 'system' → ask the OS
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const AppRouter: React.FC<{
  legalPage: LegalPage;
  setLegalPage: (p: LegalPage) => void;
}> = ({ legalPage, setLegalPage }) => {
  const {
    session, profileRow, profile, loading, profileLoading, profileError, profileMissing,
    retryLoadProfile, healMissingProfile, signOut, refreshProfile,
  } = useAuth();
  const [pendingSignupEmail, setPendingSignupEmail] = useState<string | null>(null);

  // Signed in means sign-up is finished: drop the pending email so signing out
  // later shows the home page, not the "check your inbox" screen.
  useEffect(() => {
    if (session) setPendingSignupEmail(null);
  }, [session]);

  // ---- Theme state ----
  // Initialise from localStorage as a fast path (so the screen doesn't flash light
  // briefly on a hard refresh), then sync from profile once it loads.
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const cached = (localStorage.getItem('shaadigpt_theme_mode') as ThemeMode | null);
    return cached === 'light' || cached === 'dark' || cached === 'system' ? cached : 'system';
  });

  // When profile loads, sync its theme into state (overriding the cached value)
  useEffect(() => {
    // We access settings_theme via the raw row because the typed UserSettings
    // includes it (see profileMapping.ts patch).
    const rowTheme = (profileRow as { settings_theme?: string } | null)?.settings_theme;
    if (rowTheme === 'light' || rowTheme === 'dark' || rowTheme === 'system') {
      setThemeMode(rowTheme);
      localStorage.setItem('shaadigpt_theme_mode', rowTheme);
    }
  }, [profileRow]);

  const isDarkMode = resolveIsDark(themeMode);

  // Apply the dark class to <html> whenever isDarkMode flips
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Listen for OS preference changes (only matters when mode is 'system')
  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Force a re-render by toggling — resolveIsDark will re-read the media query
      setThemeMode('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  // ---- Theme toggle / setter that persists to DB ----
  const setTheme = async (newMode: ThemeMode) => {
    setThemeMode(newMode);
    localStorage.setItem('shaadigpt_theme_mode', newMode);
    if (session?.user.id) {
      // Lazy import to avoid circular dependency at app boot
      const { supabase } = await import('./lib/supabase');
      await supabase
        .from('profiles')
        .update({ settings_theme: newMode })
        .eq('id', session.user.id);
      await refreshProfile();
    }
  };

  // ---- Legacy "toggle" handler — cycles light → dark → system ----
  const handleToggleDarkMode = () => {
    const next: ThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
    setTheme(next);
  };

  // ---- Legal pages take precedence over everything ----
  if (legalPage === 'terms') {
    return <TermsView onBack={() => setLegalPage(null)} />;
  }
  if (legalPage === 'privacy') {
    return <PrivacyView onBack={() => setLegalPage(null)} />;
  }

  // 1. Top-level bootstrap loading
  if (loading) {
    return <FullScreenLoader label="Loading…" />;
  }

  // 2. Not signed in — show public landing page (search dashboard preview).
  //    LandingView pops its own Auth modal when the user clicks Search or Sign In.
  //    On signup initiation it bubbles the email up so we can show EmailVerification
  //    in case 3 below. The user's prompt gets stashed in sessionStorage by
  //    LandingView and picked up by SearchView after auth completes.
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

  // 7. Terms and Privacy not accepted yet (Google sign-ups, older accounts)
  if (!profileRow.terms_accepted_at) {
    return <StepConsent onShowLegal={(page) => setLegalPage(page)} />;
  }

  // 8. Onboarding flow
  if (!profileRow.onboarding_complete) {
    return <OnboardingShell onComplete={() => { /* AuthContext refreshes */ }} />;
  }

  // 9. Main app
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
  const [legalPage, setLegalPage] = useState<LegalPage>(null);

  // Hash-based routing fallback (e.g. for email links to #terms or #privacy)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'terms') setLegalPage('terms');
      else if (hash === 'privacy') setLegalPage('privacy');
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        <div className="min-h-screen bg-white dark:bg-[#191919] text-gray-900 dark:text-gray-100 selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-200">
          <AppRouter
            legalPage={legalPage}
            setLegalPage={setLegalPage}
          />
          <CookieBanner onNavigateToPrivacy={() => setLegalPage('privacy')} />
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
    <div className="text-gray-400 text-sm">{label}</div>
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
        <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-2xl">⚠️</div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Couldn't load your profile</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{error}</p>
        {hint && <p className="text-xs text-gray-500 dark:text-gray-500 mb-4 italic">{hint}</p>}
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
        <p className="text-[11px] text-gray-400 mt-4">Open DevTools → Console for more detail.</p>
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
        <div className="w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center justify-center text-2xl">👋</div>
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
