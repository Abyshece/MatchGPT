import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { LEGAL } from '../lib/legalInfo';
import { minimumAge } from '../lib/legalAge';
import { BrandMark } from '../constants';

// ============================================================================
// For members younger than the legal age to marry in India (lib/legalAge.ts):
// their profile is paused (hidden from everyone) and the app goes no further.
// They can sign out, or delete the account on the website's page.
// ============================================================================

const UnderAgeScreen: React.FC = () => {
  const { profile, signOut } = useAuth();
  const age = minimumAge(profile?.gender);
  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] flex items-center justify-center px-6" data-testid="under-age">
      <div className="max-w-md text-center">
        <BrandMark className="w-10 h-10 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Shaadi24 is for {age} and over</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {LEGAL.brand} is a matrimony service, so it follows India's legal ages to marry: 21 for men and 18 for women.
          Your profile is hidden from everyone, and you're welcome back once you're {age}.
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          If your date of birth is wrong, write to <a className="underline" href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <a href={`${LEGAL.websiteUrl}/delete-account`} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            Delete my account
          </a>
          <button onClick={() => signOut()}
            className="h-11 px-6 rounded-lg bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black text-sm font-bold">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnderAgeScreen;
