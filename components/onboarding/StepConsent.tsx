import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight } from '../../constants';
import { useAuth } from '../../lib/AuthContext';
import { recordSignupConsent, TERMS_VERSION, PRIVACY_VERSION } from '../../lib/consentService';

// ============================================================================
// StepConsent
//
// Shown to a signed-in user whose profile has no recorded Terms acceptance:
//   - Google sign-ups (they never see the sign-up form's checkboxes)
//   - accounts created before consent was recorded
//   - email sign-ups: their ticked boxes travel in the account's metadata
//     (see Auth.tsx) and are recorded here without asking again
// ============================================================================

interface StepConsentProps {
  onShowLegal: (page: 'terms' | 'privacy') => void;
}

const StepConsent: React.FC<StepConsentProps> = ({ onShowLegal }) => {
  const { session, refreshProfile, signOut } = useAuth();
  const meta = session?.user.user_metadata ?? {};
  const acceptedAtSignup = meta.terms_version === TERMS_VERSION && meta.privacy_version === PRIVACY_VERSION;

  const [agreed, setAgreed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [isSaving, setIsSaving] = useState(acceptedAtSignup);
  const [error, setError] = useState<string | null>(null);
  const autoRecorded = useRef(false);

  const save = async (marketing: boolean) => {
    if (!session) return;
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await recordSignupConsent(session.user.id, session.user.email ?? '', marketing);
    if (saveError) {
      setError(saveError);
      setIsSaving(false);
      return;
    }
    // App.tsx moves on to onboarding once the profile shows the acceptance.
    await refreshProfile();
  };

  useEffect(() => {
    if (acceptedAtSignup && !autoRecorded.current) {
      autoRecorded.current = true;
      save(meta.marketing_opt_in === true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (acceptedAtSignup && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-[#191919] gap-3">
        <div className="w-8 h-8 border-3 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
        <div className="text-gray-400 text-sm">Setting up your account…</div>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full mx-auto py-8 px-6 animate-fade-in">
      <div className="mb-8">
        <div className="text-5xl mb-6">💍</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Before you start</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Please review and accept our Terms of Service and Privacy Policy to use MatchGPT.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
          Couldn't save your answer: {error}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (agreed) save(marketingOptIn); }}
        className="space-y-4"
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-zinc-600 cursor-pointer flex-shrink-0"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            I agree to the{' '}
            <button type="button" onClick={() => onShowLegal('terms')} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Terms of Service
            </button>
            {' '}and{' '}
            <button type="button" onClick={() => onShowLegal('privacy')} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Privacy Policy
            </button>
            . I confirm I am 18 years or older.
          </span>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-zinc-600 cursor-pointer flex-shrink-0"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400 leading-snug">
            Send me occasional tips and news about MatchGPT. (Optional, you can unsubscribe anytime.)
          </span>
        </label>

        <div className="pt-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Sign out
          </button>
          <Button onClick={() => {}} className="h-11 px-6 justify-center text-sm font-bold" disabled={!agreed || isSaving}>
            {isSaving ? 'Saving…' : 'Continue'} <IconChevronRight />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default StepConsent;
