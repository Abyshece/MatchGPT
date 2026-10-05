import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadGoogleIdentity, makeNonce } from '../lib/googleSignIn';

// ============================================================================
// GoogleSignInButton
//
// Google's own "Continue with Google" button (see lib/googleSignIn.ts). Google
// opens its account chooser in a popup and hands back an ID token, which
// signs the user in to Supabase; new accounts are created the same way.
// ============================================================================

interface GoogleSignInButtonProps {
  clientId: string;
  onSignedIn: () => void;
  onError: (message: string) => void;
}

const BUTTON_HEIGHT = 40;  // Google's "large" button

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ clientId, onSignedIn, onError }) => {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [signingIn, setSigningIn] = useState(false);
  // The latest callbacks, for Google's callback (set up once per mount)
  const signedIn = useEffectEvent(() => onSignedIn());
  const failed = useEffectEvent((message: string) => onError(message));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [google, { nonce, hashed }] = await Promise.all([loadGoogleIdentity(), makeNonce()]);
        if (cancelled || !container.current) return;
        google.initialize({
          client_id: clientId,
          nonce: hashed,
          ux_mode: 'popup',
          callback: async ({ credential }) => {
            if (!credential) {
              failed('Google sign-in did not finish. Please try again.');
              return;
            }
            setSigningIn(true);
            const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce });
            setSigningIn(false);
            if (error) failed(error.message);
            else signedIn();
          },
        });
        const dark = document.documentElement.classList.contains('dark');
        google.renderButton(container.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, Math.max(200, Math.floor(container.current.offsetWidth))),
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (status === 'failed') {
    return (
      <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
        Google sign-in couldn't load. Check your connection, or continue with email.
      </p>
    );
  }

  return (
    <div className="relative w-full" style={{ minHeight: BUTTON_HEIGHT }} data-testid="google-signin">
      {status === 'loading' && (
        <div className="absolute inset-0 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 animate-pulse" />
      )}
      {/* Google draws its button in here */}
      <div ref={container} className={`w-full flex justify-center ${signingIn ? 'opacity-50 pointer-events-none' : ''}`} />
      {signingIn && (
        <p className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">Signing you in…</p>
      )}
    </div>
  );
};

export default GoogleSignInButton;
