import React, { useEffect, useState } from 'react';
import { Button } from './NotionUI';
import { IconMail, IconGoogle, IconChevronRight, IconX } from '../constants';
import { supabase } from '../lib/supabase';
import { TERMS_VERSION, PRIVACY_VERSION } from '../lib/consentService';
import { GOOGLE_CLIENT_ID } from '../lib/googleSignIn';
import GoogleSignInButton from './GoogleSignInButton';
import NativeSignInButtons from './NativeSignInButtons';
import { isNativeApp } from '../lib/nativeApp';

interface AuthProps {
  // Sign-up that needs the emailed code: parent shows the email-verification screen.
  onSignupInitiated: (email: string) => void;
  // Signed in (sign-in, or a sign-up that needed no code): parent can dismiss.
  onSignInSuccess: () => void;
  onClose?: () => void;
  // Phase 6: navigate to legal pages from the signup form
  onShowLegal?: (page: 'terms' | 'privacy') => void;
  // The website's admin sign-in (components/website/AdminSite.tsx): no
  // sign-up, and Google brings the admin back to /admin
  forAdmins?: boolean;
}

const Auth: React.FC<AuthProps> = ({ onSignupInitiated, onSignInSuccess, onClose, onShowLegal, forAdmins = false }) => {
  const [mode, setMode] = useState<'MENU' | 'SIGNIN' | 'SIGNUP' | 'FORGOT' | 'RESET_CODE'>('MENU');
  // Password reset: the code from the email, and when another can be sent
  const [resetCode, setResetCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Phase 6: consent state for signup
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const clearMessages = () => {
    setError(null);
    setInfo(null);
  };

  // Classic Google sign-in, used until Google's own button is switched on
  // (GOOGLE_CLIENT_ID in lib/googleSignIn.ts). Google's screen then names the
  // Supabase address.
  const handleGoogle = async () => {
    clearMessages();
    setIsLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${forAdmins ? '/admin' : ''}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
    // On success, the browser redirects to Google. We never reach here.
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setIsLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    onSignInSuccess();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!agreedToTerms) {
      setError('You must agree to the Terms and Privacy Policy to create an account.');
      return;
    }
    setIsLoading(true);
    // The ticked boxes travel with the new account; StepConsent records them
    // once the user is signed in (recording needs a session).
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: marketingOptIn,
        },
      },
    });
    setIsLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // "Confirm email" off: the account is already signed in.
    if (signUpData.session) {
      onSignInSuccess();
      return;
    }

    // "Confirm email" on: Supabase has emailed a 6-digit code. Hand off to the
    // email-verification screen.
    onSignupInitiated(email);
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // The reset email has a code to type in here (the apps have no link to come
  // back to) and, for the website, a link
  const handleForgot = async (e?: React.FormEvent) => {
    e?.preventDefault();
    clearMessages();
    if (!email) {
      setError('Email is required.');
      return;
    }
    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // The site has one page; the app spots the reset link and asks for the new
      // password. Inside the phone app there's no web address to come back to,
      // so the link opens the website (Supabase's Site URL) instead.
      redirectTo: isNativeApp() ? undefined : window.location.origin,
    });
    setIsLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setResetCode('');
    setResendIn(60);
    setMode('RESET_CODE');
    setInfo(`If an account exists for ${email}, we've emailed it a code.`);
  };

  // The code signs the person in for the reset; the app then asks for the new
  // password (Supabase reports PASSWORD_RECOVERY, see AuthContext)
  const handleResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!/^\d{6,10}$/.test(resetCode)) {
      setError('Please enter the code from the email.');
      return;
    }
    setIsLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: resetCode, type: 'recovery' });
    setIsLoading(false);
    if (verifyError) {
      setError(verifyError.status === 429
        ? 'Too many tries. Please wait a few minutes and try again.'
        : "That code isn't right or has expired. Check the email, or send a new code.");
      return;
    }
    onSignInSuccess();
  };

  // ---- presentation ----------------------------------------------------------

  // As a popup, the card centres itself with m-auto, so on a short screen it
  // starts at the top and scrolls instead of being cut off.
  const containerClasses = onClose
    ? 'fixed inset-0 z-[200] flex overflow-y-auto p-4 popup-backdrop animate-fade-in font-sans'
    : 'flex flex-col items-center justify-center p-6 min-h-screen bg-white dark:bg-[#191919] font-sans';

  const cardClasses = onClose
    ? 'm-auto w-full max-w-[340px] py-6 px-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl relative'
    : 'w-full max-w-sm p-8 shadow-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl relative';

  return (
    <div className={containerClasses}>
      <div className={cardClasses}>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-black dark:text-gray-500 dark:hover:text-white transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <div className="transform scale-75"><IconX /></div>
          </button>
        )}

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="text-4xl mb-2">💍</div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white leading-tight mb-0.5">MatchGPT</h1>
          <p className="text-gray-500 dark:text-gray-400 text-[10px] font-medium uppercase tracking-wide">
            {mode === 'SIGNUP' ? 'Create your account' : mode === 'FORGOT' || mode === 'RESET_CODE' ? 'Reset your password' : forAdmins ? 'Admin sign-in' : 'Welcome back'}
          </p>
          {forAdmins && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">For MatchGPT's team. Members sign in in the MatchGPT app.</p>
          )}
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-3 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 text-xs font-medium text-blue-700 dark:text-blue-300">
            {info}
          </div>
        )}

        {mode === 'MENU' && (
          <div className="flex flex-col gap-2.5">
            {/* Google doesn't allow its sign-in page inside apps: the apps use
                the phone's own sign-in sheets (Google, and Apple on iPhones) */}
            {isNativeApp() ? (
              <NativeSignInButtons
                onSignedIn={onSignInSuccess}
                onError={(message) => { setInfo(null); setError(message); }}
              />
            ) : GOOGLE_CLIENT_ID ? (
              <GoogleSignInButton
                clientId={GOOGLE_CLIENT_ID}
                onSignedIn={onSignInSuccess}
                onError={(message) => { setInfo(null); setError(message); }}
              />
            ) : (
              <button
                onClick={handleGoogle}
                disabled={isLoading}
                className="relative flex items-center justify-center w-full h-10 px-4 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold text-gray-900 dark:text-gray-100 group disabled:opacity-50"
              >
                <span className="absolute left-4 opacity-80 group-hover:opacity-100 transition-opacity"><IconGoogle /></span>
                <span>Continue with Google</span>
              </button>
            )}

            <button
              onClick={() => { clearMessages(); setMode('SIGNIN'); }}
              className="relative flex items-center justify-center w-full h-10 px-4 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold text-gray-900 dark:text-gray-100 group"
            >
              <span className="absolute left-4 opacity-80 group-hover:opacity-100 transition-opacity"><IconMail /></span>
              <span>Continue with Email</span>
            </button>

            <div className="mt-4">
              {!forAdmins && (
                <>
                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white dark:bg-zinc-900 text-gray-400 dark:text-gray-500 text-[10px] uppercase tracking-wider font-semibold">New here?</span>
                    </div>
                  </div>

                  <button
                    onClick={() => { clearMessages(); setMode('SIGNUP'); }}
                    className="group w-full flex items-center justify-center gap-2 h-10 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black rounded-lg text-xs font-bold transition-all shadow-sm hover:shadow-md"
                  >
                    Create Account
                    <span className="opacity-70 group-hover:translate-x-1 transition-transform"><IconChevronRight /></span>
                  </button>
                </>
              )}

              <div className="text-center mt-3">
                <button
                  onClick={() => { clearMessages(); setMode('FORGOT'); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'SIGNIN' && (
          <form onSubmit={handleSignIn} className="flex flex-col gap-3 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon shown={showPassword} />
                </button>
              </div>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => { clearMessages(); setMode('FORGOT'); }}
                  className="text-[10px] uppercase font-bold text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  Forgot?
                </button>
              </div>
            </div>

            <Button
              onClick={() => {}}
              className="w-full h-9 justify-center mt-1 text-xs font-bold rounded-md"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in…' : 'Log In'}
            </Button>

            <button
              type="button"
              onClick={() => { clearMessages(); setMode('MENU'); }}
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1 text-center"
            >
              ← Back
            </button>
          </form>
        )}

        {mode === 'SIGNUP' && (
          <form onSubmit={handleSignUp} className="flex flex-col gap-3 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                  placeholder="At least 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon shown={showPassword} />
                </button>
              </div>
            </div>

            {/* Phase 6: Required consent checkbox */}
            <label className="flex items-start gap-2 cursor-pointer group mt-1">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer flex-shrink-0"
              />
              <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
                I agree to the{' '}
                <button
                  type="button"
                  onClick={() => onShowLegal?.('terms')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Terms of Service
                </button>
                {' '}and{' '}
                <button
                  type="button"
                  onClick={() => onShowLegal?.('privacy')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Privacy Policy
                </button>
                . I confirm I am 18 years or older.
              </span>
            </label>

            {/* Phase 6: Optional marketing consent */}
            <label className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer flex-shrink-0"
              />
              <span className="text-[11px] text-gray-500 dark:text-gray-500 leading-snug">
                Send me occasional tips and news about MatchGPT. (Optional, you can unsubscribe anytime.)
              </span>
            </label>

            <Button
              onClick={() => {}}
              className="w-full h-9 justify-center mt-1 text-xs font-bold rounded-md"
              disabled={isLoading || !agreedToTerms}
            >
              {isLoading ? 'Creating account…' : 'Create Account'}
            </Button>

            <button
              type="button"
              onClick={() => { clearMessages(); setMode('MENU'); }}
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1 text-center"
            >
              ← Back
            </button>
          </form>
        )}

        {mode === 'FORGOT' && (
          <form onSubmit={handleForgot} className="flex flex-col gap-3 animate-fade-in">
            <div className="text-center mb-1">
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Enter your email and we'll send you a code to reset your password.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            <Button
              onClick={() => {}}
              className="w-full h-9 justify-center mt-1 text-xs font-bold rounded-md"
              disabled={isLoading}
            >
              {isLoading ? 'Sending…' : 'Send Code'}
            </Button>

            <button
              type="button"
              onClick={() => { clearMessages(); setMode('MENU'); }}
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-1 text-center"
            >
              ← Back
            </button>
          </form>
        )}

        {mode === 'RESET_CODE' && (
          <form onSubmit={handleResetCode} className="flex flex-col gap-3 animate-fade-in" data-testid="reset-code">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Code from the email</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full h-12 border border-gray-300 dark:border-zinc-700 rounded-md p-2 text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                placeholder="123456"
                autoFocus
              />
            </div>
            <Button
              onClick={() => {}}
              className="w-full h-9 justify-center mt-1 text-xs font-bold rounded-md"
              disabled={isLoading || resetCode.length < 6}
            >
              {isLoading ? 'Checking…' : 'Continue'}
            </Button>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-relaxed">
              The email's link works too: it opens the website to choose a new password.
            </p>
            <div className="flex justify-between text-[10px]">
              <button
                type="button"
                onClick={() => { clearMessages(); setMode('FORGOT'); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ← Back
              </button>
              {resendIn > 0
                ? <span className="text-gray-400">Send again in {resendIn}s</span>
                : <button type="button" onClick={() => handleForgot()} className="font-medium text-blue-600 dark:text-blue-400">Send a new code</button>}
            </div>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-zinc-800 text-center">
          <p className="text-[9px] text-gray-400 dark:text-gray-500 max-w-xs mx-auto leading-relaxed">
            By continuing, you agree to our <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300 underline">Terms</a> & <a href="#" className="hover:text-gray-600 dark:hover:text-gray-300 underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};

// EyeIcon — inline SVG for show/hide password toggle (no IconEye in constants).
const EyeIcon: React.FC<{ shown: boolean }> = ({ shown }) => (
  shown ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
);

export default Auth;
