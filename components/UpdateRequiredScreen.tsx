import React from 'react';
import { updateUrl } from '../lib/appUpdate';
import { BrandMark } from '../constants';

// ============================================================================
// UpdateRequiredScreen: this version of the app no longer works (the owner
// raised the oldest working build in Admin → Errors, usually after a broken
// release). One button, to the store.
// ============================================================================

const UpdateRequiredScreen: React.FC = () => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-white dark:bg-[#191919]" role="alertdialog" aria-labelledby="update-title" data-testid="update-required">
    <div className="max-w-sm text-center">
      <div className="flex justify-center mb-4 [&>svg]:w-12 [&>svg]:h-12" aria-hidden="true"><BrandMark /></div>
      <h1 id="update-title" className="text-xl font-bold text-gray-900 dark:text-white">Please update Shaadi24</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        This version has a problem we've fixed. Update to the newest one to carry on; your profile, matches and chats are
        all there.
      </p>
      <a
        href={updateUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex w-full justify-center py-3 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-bold hover:opacity-90"
      >
        Update now
      </a>
    </div>
  </div>
);

export default UpdateRequiredScreen;
