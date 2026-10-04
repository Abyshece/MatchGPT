import React, { useEffect, useState } from 'react';
import { IconApple, IconGoogle } from '../constants';
import { signInWith, socialProviders, SocialSignInError, type SocialProvider } from '../lib/socialSignIn';

// ============================================================================
// NativeSignInButtons
//
// "Continue with Apple" (iPhones) and "Continue with Google" in the phone
// apps, through the phone's own sign-in sheets (lib/socialSignIn.ts). Shows
// only the ones this phone offers; Apple's comes first, in black (white in
// dark mode), as Apple's guidelines ask.
// ============================================================================

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
          className="relative flex items-center justify-center w-full h-10 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-opacity text-[13px] font-semibold disabled:opacity-50"
        >
          <span className="absolute left-4"><IconApple /></span>
          <span>{busy === 'apple' ? 'Signing you in…' : 'Continue with Apple'}</span>
        </button>
      )}
      {offered.google && (
        <button
          onClick={() => go('google')}
          disabled={busy !== null}
          data-testid="signin-google"
          className="relative flex items-center justify-center w-full h-10 px-4 border border-gray-300 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-xs font-semibold text-gray-900 dark:text-gray-100 group disabled:opacity-50"
        >
          <span className="absolute left-4 opacity-80 group-hover:opacity-100 transition-opacity"><IconGoogle /></span>
          <span>{busy === 'google' ? 'Signing you in…' : 'Continue with Google'}</span>
        </button>
      )}
    </>
  );
};

export default NativeSignInButtons;
