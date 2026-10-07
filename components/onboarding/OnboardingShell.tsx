import React, { Suspense, useEffect, useState } from 'react';
import { lazyScreen } from '../../lib/lazyScreen';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import StepPhotos from './StepPhotos';

// Steps 1 and 2 carry the long answer lists (lib/matrimonyOptions.ts), so they
// load only when someone is setting up their profile.
const StepBasicInfo = lazyScreen(() => import('./StepBasicInfo'));
const StepBackground = lazyScreen(() => import('./StepBackground'));

// ============================================================================
// OnboardingShell
//
// Sign-up, in three short steps (about two minutes): only what families judge
// a match on first. Everything else is optional, in My Profile, where each
// section completed earns a free search a day (ProfileRewardsPopup says so
// on the first visit to the Dashboard).
//
// Which step shows comes from what's already in the profile row, so someone
// who closes the app and comes back carries on where they left off:
//   - no name                                              → StepBasicInfo
//   - no religion, mother tongue, qualification or job     → StepBackground
//   - no photo                                             → StepPhotos
//   - else → finished: onboarding_complete is set, and App.tsx shows the
//     Dashboard.
// ============================================================================

interface OnboardingShellProps {
  onComplete: () => void;
}

type Step = 'BASIC' | 'BACKGROUND' | 'PHOTOS' | 'FINISH';

const OnboardingShell: React.FC<OnboardingShellProps> = ({ onComplete }) => {
  const { profileRow, refreshProfile } = useAuth();
  // Local override lets us advance immediately on save instead of waiting for
  // the auth context to refresh. We still call refreshProfile() so the
  // database is the source of truth — local state just bridges the gap.
  const [forcedStep, setForcedStep] = useState<Step | null>(null);

  const loading = (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919]">
      <div className="text-gray-500 dark:text-gray-400 text-sm">Loading…</div>
    </div>
  );

  if (!profileRow) return loading;

  const derivedStep: Step = (() => {
    if (!profileRow.name) return 'BASIC';
    const background = [profileRow.religion, profileRow.mother_tongue, profileRow.education_level, profileRow.occupation];
    if (background.some((v) => !v?.trim())) return 'BACKGROUND';
    if ((profileRow.photo_urls?.length ?? 0) < 1) return 'PHOTOS';
    return 'FINISH';
  })();

  const step: Step = forcedStep ?? derivedStep;

  if (step === 'BASIC') {
    return (
      <Suspense fallback={loading}>
        <StepBasicInfo
          onComplete={async () => {
            await refreshProfile();
            setForcedStep('BACKGROUND');
          }}
        />
      </Suspense>
    );
  }

  if (step === 'BACKGROUND') {
    return (
      <Suspense fallback={loading}>
        <StepBackground
          onComplete={async () => {
            await refreshProfile();
            setForcedStep('PHOTOS');
          }}
          onBack={() => setForcedStep('BASIC')}
        />
      </Suspense>
    );
  }

  if (step === 'PHOTOS') {
    return (
      <StepPhotos
        onComplete={() => setForcedStep('FINISH')}
        onBack={() => setForcedStep('BACKGROUND')}
      />
    );
  }

  return (
    <FinishOnboarding
      onDone={async () => {
        await refreshProfile();
        onComplete();
      }}
      onBack={() => setForcedStep('PHOTOS')}
    />
  );
};

// The last step: mark sign-up done. App.tsx then shows the Dashboard.
const FinishOnboarding: React.FC<{ onDone: () => Promise<void>; onBack: () => void }> = ({ onDone, onBack }) => {
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { error: finishError } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', userId);
      if (cancelled) return;
      if (finishError) { setError(finishError.message); return; }
      await onDone();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-white dark:bg-[#191919]">
      {error ? (
        <>
          <div className="max-w-sm px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-sm font-medium text-red-700 dark:text-red-300">
            Your profile couldn't be saved: {error}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onBack}
              className="h-10 px-4 rounded-md border border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Back
            </button>
            <button type="button" onClick={() => { setError(null); setAttempt((n) => n + 1); }}
              className="h-10 px-4 rounded-md bg-black dark:bg-white text-white dark:text-black text-sm font-semibold">
              Try again
            </button>
          </div>
        </>
      ) : (
        <div className="text-gray-500 dark:text-gray-400 text-sm">Setting up your profile…</div>
      )}
    </div>
  );
};

export default OnboardingShell;
