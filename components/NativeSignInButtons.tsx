import React, { useEffect, useState } from 'react';
import { IconApple, IconGoogle } from '../constants';
import { signInWith, socialProviders, SocialSignInError, type SocialProvider } from '../lib/socialSignIn';

// ============================================================================
// NativeSignInButtons
//
// "Continue with Apple" (iPhones) and "Continue with Google" on the phone
// apps' welcome screen (LandingView), through the phone's own sign-in sheets
// (lib/socialSignIn.ts). Shows only the ones this phone offers; Apple's comes
// first, in black (white in dark mode), as Apple's guidelines ask, and
// Google's in Google's neutral grey (its dark theme in dark mode).
// ============================================================================

// Big, fully rounded buttons, the logo just before the words
const PILL = 'flex items-center justify-center gap-2.5 w-full h-[52px] px-5 rounded-full text-base font-semibold transition disabled:opacity-50';
const ICON = 'flex-none [&>svg]:w-[18px] [&>svg]:h-[18px]';

interface NativeSignInButtonsProps {
  onSignedIn: () => void;
  onError: (message: string | null) => void;
}

const NativeSignInButtons: React.FC<NativeSignInButtonsProps> = ({ onSignedIn, onError }) => {
  const [offered, setOffered] = useState<Record<SocialProvider, boolean>>({ google: false, apple: false });
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    socialProviders().then((p) => { if (!cancelled) setOffered(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const go = async (provider: SocialProvider) => {
    onError(null);
    setBusy(provider);
    try {
      const outcome = await signInWith(provider);
      setBusy(null);
      if (outcome === 'signed-in') onSignedIn();
    } catch (e) {
      setBusy(null);
      onError(e instanceof SocialSignInError ? e.message : 'Sign-in didn\'t work. Please try again, or continue with email.');
    }
  };

  if (!offered.apple && !offered.google) return null;

  return (
    <>
      {offered.apple && (
        <button
          onClick={() => go('apple')}
          disabled={busy !== null}
          data-testid="signin-apple"
          className={`${PILL} bg-black text-white dark:bg-white dark:text-black hover:opacity-90 active:opacity-80`}
        >
          <span className={ICON}><IconApple /></span>
          <span>{busy === 'apple' ? 'Signing you in…' : 'Continue with Apple'}</span>
        </button>
      )}
      {offered.google && (
        <button
          onClick={() => go('google')}
          disabled={busy !== null}
          data-testid="signin-google"
          className={`${PILL} bg-[#f2f2f2] text-[#1f1f1f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:border dark:border-[#8e918f] hover:bg-[#e8e8e8] dark:hover:bg-[#1f1f20] active:bg-[#e0e0e0] dark:active:bg-[#262627]`}
        >
          <span className={ICON}><IconGoogle /></span>
          <span>{busy === 'google' ? 'Signing you in…' : 'Continue with Google'}</span>
        </button>
      )}
    </>
  );
};

export default NativeSignInButtons;
