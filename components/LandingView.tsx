import React, { Suspense, useEffect, useState } from 'react';
import type { LegalPageName } from '../lib/legalInfo';
import { lazyScreen } from '../lib/lazyScreen';
import { isNativeApp } from '../lib/nativeApp';
import NativeSignInButtons from './NativeSignInButtons';

// The sign-in popup loads when it opens, and quietly before that, once the
// page has drawn, so it's there when someone taps to sign in
const loadAuth = () => import('./Auth');
const Auth = lazyScreen(loadAuth);

// ============================================================================
// LandingView
//
// The app's welcome screen, for someone signed out: Shaadi24 and what it does
// in the middle, the ways in at the bottom. In the phone apps those are Apple
// (iPhones) and Google, through the phone's own sign-in sheets, then email,
// which opens the sign-in popup (Auth) to sign in or create an account. The
// website shows this screen only in the app preview and local development
// (lib/website.ts). There's no looking around first: members' profiles are
// for members.
// ============================================================================

interface LandingViewProps {
  onSignupInitiated: (email: string) => void;
  onShowLegal: (page: LegalPageName) => void;
}

const LandingView: React.FC<LandingViewProps> = ({ onSignupInitiated, onShowLegal }) => {
  const [showAuth, setShowAuth] = useState(false);
  // Apple's or Google's sign-in not working, in words for the person
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { loadAuth().catch(() => { /* loaded again when opened */ }); }, 800);
    return () => clearTimeout(t);
  }, []);

  const legalLink = (page: LegalPageName, label: string) => (
    <button onClick={() => onShowLegal(page)} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919]" data-testid="welcome">
      <main className="flex-1 flex flex-col">
        {/* The name sits at the same height whichever buttons the phone offers
            (they appear once Supabase has said which are on) */}
        <div className="flex-1 flex flex-col items-center px-8 pt-[18vh] pb-10 text-center select-none animate-fade-in">
          <div className="text-5xl mb-4" aria-hidden="true">💍</div>
          <h1 className="text-[40px] leading-none font-bold tracking-tight text-gray-900 dark:text-white">Shaadi24</h1>
          <p className="mt-4 max-w-[19rem] text-[17px] leading-snug text-gray-500 dark:text-gray-400 text-balance">
            Find your life partner by personality, not just biodata.
          </p>
        </div>

        <div className="w-full max-w-md mx-auto px-5">
          {error && (
            <p role="alert" className="mb-3 px-4 py-2.5 rounded-2xl bg-red-50 dark:bg-red-900/20 text-[13px] leading-snug font-medium text-center text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            {isNativeApp() && <NativeSignInButtons onSignedIn={() => { /* the session shows the app */ }} onError={setError} />}
            <button
              onClick={() => { setError(null); setShowAuth(true); }}
              className="flex items-center justify-center w-full h-[52px] px-5 rounded-full border border-gray-300 dark:border-zinc-600 text-base font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-zinc-800 active:bg-gray-100 dark:active:bg-zinc-800 transition-colors"
            >
              Sign in or create account
            </button>
          </div>
          {/* The declaration the Government's advisory for matrimonial websites asks for */}
          <p className="mt-5 text-[11px] leading-relaxed text-center text-gray-500 dark:text-gray-400" data-testid="matrimony-only">
            Shaadi24 is for marriage only: no dating, no obscene material. Women 18+, men 21+.
          </p>
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto px-5 pt-2 pb-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        {legalLink('terms', 'Terms')}
        {legalLink('privacy', 'Privacy')}
        {legalLink('safety', 'Safety')}
        {legalLink('grievances', 'Grievances')}
      </footer>

      {/* Given onClose, Auth draws its own popup and backdrop. A sign-up that
          needs the emailed code goes up to App, which shows EmailVerification;
          a sign-in's session replaces this screen with the app. */}
      {showAuth && (
        <Suspense fallback={null}>
          <Auth
            onClose={() => setShowAuth(false)}
            onSignupInitiated={(email) => {
              setShowAuth(false);
              onSignupInitiated(email);
            }}
            onSignInSuccess={() => setShowAuth(false)}
            onShowLegal={onShowLegal}
          />
        </Suspense>
      )}
    </div>
  );
};

export default LandingView;
