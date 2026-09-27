import React, { useState } from 'react';
import Auth from './Auth';

// ============================================================================
// LandingView
//
// Public-facing landing page shown to logged-out users. The prompt input is
// the focal hero element. When the user types something and clicks Search,
// we save their prompt to sessionStorage and pop the Auth modal. After they
// sign up / sign in, the SearchView auto-loads with their prompt pre-filled
// and runs the search immediately.
// ============================================================================

const PENDING_PROMPT_KEY = 'shaadigpt_pending_prompt';

const EXAMPLE_PROMPTS = [
  'Find a match near me',
  'Show me all online matches',
  'Find coffee lovers',
  'Hiking partners',
  'Find an ambitious introvert',
  'Most compatible matches',
  'Looking for friends',
];

interface LandingViewProps {
  onSignupInitiated: (email: string) => void;
  onShowLegal: (page: 'terms' | 'privacy') => void;
}

const LandingView: React.FC<LandingViewProps> = ({ onSignupInitiated, onShowLegal }) => {
  const [prompt, setPrompt] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  const handleSearchAttempt = () => {
    // Save the prompt so SearchView can pick it up post-auth
    if (prompt.trim()) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, prompt.trim());
    }
    setShowAuth(true);
  };

  const handleExampleClick = (ex: string) => {
    setPrompt(ex);
    // Don't auto-trigger auth — let the user click Search themselves
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919]">
      {/* Top bar — minimal */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 select-none">
          <span className="text-2xl">💍</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">MatchGPT</span>
        </div>
        <button
          onClick={() => setShowAuth(true)}
          className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero — mirrors the signed-in SearchView dashboard exactly so guests
          see the experience they'll get after signing up. */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl">
          {/* Sparkle + headline */}
          <div className="text-center mb-10 animate-fade-in">
            <div className="text-6xl mb-4">✨</div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
              Find your meaningful match
            </h1>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
              Search by personality, interests, or vibe.
            </p>
          </div>

          {/* Pill-shaped prompt input — matches SearchView */}
          <div className="w-full relative flex items-center gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-[32px] p-1.5 mb-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)] focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.12)] transition-shadow">
            <div className="ml-1 w-9 h-9 flex-none flex items-center justify-center text-gray-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSearchAttempt();
                }
              }}
              placeholder="Say something like I'm looking for someone who loves coffee, hikes and works in finance."
              rows={1}
              style={{ minHeight: '44px' }}
              className="w-full max-h-40 bg-transparent border-0 focus:ring-0 resize-none py-3 px-2 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:text-sm focus:outline-none leading-relaxed text-sm overflow-hidden"
            />
            <button
              onClick={handleSearchAttempt}
              className="mr-1 w-9 h-9 flex-none flex items-center justify-center rounded-full bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 shadow-sm transition-colors"
              aria-label="Search"
              title="Search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>

          {/* Trending Near You — matches SearchView */}
          <div className="mt-8 animate-fade-in">
            <p className="text-center text-[11px] uppercase font-bold text-gray-400 tracking-widest mb-4">
              Trending near you
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExampleClick(ex)}
                  className="px-5 py-2 rounded-full bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-white hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Trust line */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-12">
            Verified profiles · Built for serious relationships · Real people
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-zinc-800 py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-5 text-xs text-gray-400">
          <button onClick={() => onShowLegal('terms')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Terms
          </button>
          <button onClick={() => onShowLegal('privacy')} className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            Privacy
          </button>
          <span>© 2026 MatchGPT</span>
        </div>
      </footer>

      {/* Auth modal — rendered as overlay when triggered.
          When signup is initiated, the email flows up to App which unmounts
          LandingView and renders EmailVerification. We don't handle that here. */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSignupInitiated={(email) => {
            setShowAuth(false);          // Close our modal; App will show EmailVerification
            onSignupInitiated(email);
          }}
          onSignInSuccess={() => {
            // Auth context picks up the session, App.tsx unmounts LandingView,
            // and SearchView reads the pending prompt from sessionStorage on mount
            setShowAuth(false);
          }}
          onShowLegal={onShowLegal}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------------------
// AuthModal — wraps the existing Auth component in a centered modal
// ----------------------------------------------------------------------------

interface AuthModalProps {
  onClose: () => void;
  onSignupInitiated: (email: string) => void;
  onSignInSuccess: () => void;
  onShowLegal: (page: 'terms' | 'privacy') => void;
}

const AuthModal: React.FC<AuthModalProps> = ({
  onClose, onSignupInitiated, onSignInSuccess, onShowLegal,
}) => {
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto border border-gray-200 dark:border-zinc-800 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <Auth
          onSignupInitiated={onSignupInitiated}
          onSignInSuccess={onSignInSuccess}
          onClose={onClose}
          onShowLegal={onShowLegal}
        />
      </div>
    </div>
  );
};

export default LandingView;
