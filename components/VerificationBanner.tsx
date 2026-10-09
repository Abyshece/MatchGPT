import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import VerificationRequestModal from './VerificationRequestModal';
import { IconShield, IconIdCard } from '../constants';
import type { VerificationStatus } from '../lib/profileService';

// ============================================================================
// VerificationBanner (Phase 6 update)
//
// Shows when the user has missed the 72h grace period without verifying.
// Replaces the Phase 4 one-click stub with a real flow: clicking the button
// opens VerificationRequestModal where the user submits their social media
// profile links for admin review.
// ============================================================================

interface VerificationBannerProps {
  verification: VerificationStatus;
}

const VerificationBanner: React.FC<VerificationBannerProps> = ({ verification }) => {
  const { profile } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const status = profile?.verificationStatus;
  const isPending = status === 'pending';

  return (
    <>
      <div className={`mb-6 rounded-xl p-4 flex items-start gap-3 ${
        isPending
          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40'
      }`}>
        <div className={`flex-shrink-0 mt-0.5 ${isPending ? 'text-blue-500' : 'text-red-500'}`}>
          <IconShield />
        </div>
        <div className="flex-1">
          {isPending ? (
            <>
              <h3 className="font-bold text-blue-900 dark:text-blue-200 mb-1">Verification in review</h3>
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
                Your submission is being reviewed by our team. This usually takes 24-48 hours. You can keep using Shaadi24 while you wait.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 inline-flex items-center gap-1.5"
              >
                View / update submission
              </button>
            </>
          ) : (
            <>
              <h3 className="font-bold text-red-900 dark:text-red-200 mb-1">Verify your account to continue</h3>
              <p className="text-sm text-red-800 dark:text-red-300 mb-3">
                Your 72-hour grace period has ended. Verify your identity to keep searching and matching.
                {verification.hoursSinceCreation > 0 && (
                  <> Account is {Math.floor(verification.hoursSinceCreation / 24)}d {verification.hoursSinceCreation % 24}h old.</>
                )}
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm hover:bg-red-700 inline-flex items-center gap-1.5"
              >
                <span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconIdCard /></span> Get verified
              </button>
              <p className="text-[11px] text-red-700 dark:text-red-400 mt-2">
                Provide links to at least 2 of your social media profiles. Reviewed in 24-48 hours.
              </p>
            </>
          )}
        </div>
      </div>

      {showModal && <VerificationRequestModal onClose={() => setShowModal(false)} />}
    </>
  );
};

export default VerificationBanner;
