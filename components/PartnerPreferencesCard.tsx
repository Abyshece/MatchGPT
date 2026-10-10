import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { hasPreferences, preferenceSummary, usePartnerPreferences } from '../lib/partnerPreferences';
import PartnerPreferencesModal from './PartnerPreferencesModal';
import { IconHeart } from '../constants';

// ============================================================================
// PartnerPreferencesCard: what the member is looking for, with Edit
// (My Profile, and a short version on Standouts). See lib/partnerPreferences.ts.
// ============================================================================

const PartnerPreferencesCard: React.FC<{ compact?: boolean; onSaved?: () => void }> = ({ compact = false, onSaved }) => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const { prefs, loaded, reload } = usePartnerPreferences(session?.user.id);
  const [editing, setEditing] = useState(false);
  if (!loaded) return null;
  const set = hasPreferences(prefs);
  const summary = set ? preferenceSummary(prefs) : [];

  const modal = editing && (
    <PartnerPreferencesModal
      initial={prefs}
      onClose={() => setEditing(false)}
      onSaved={() => {
        setEditing(false);
        void reload();
        showToast('Preferences saved', 'success');
        onSaved?.();
      }}
    />
  );

  if (compact) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="prefs-note">
        {set ? 'Picked with your partner preferences first.' : 'Set your partner preferences, and Standouts show people who fit them first.'}{' '}
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-gray-700 dark:text-gray-200 hover:underline">
          {set ? 'Edit them' : 'Set them'}
        </button>
        {modal}
      </p>
    );
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5" data-testid="partner-prefs">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0 [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
          <IconHeart />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Partner preferences</h2>
          {set ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Your partner preferences">
              {summary.map((line) => (
                <li key={line} className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-700 dark:text-gray-200">{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Tell us who you're hoping to meet. Standouts show people who fit first, search can start from these, and we
              can tell you when someone new fits.
            </p>
          )}
          {set && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {prefs.alerts ? 'We tell you once a day when new members fit.' : 'Alerts about new members are off.'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-500 whitespace-nowrap"
          data-testid="edit-partner-prefs"
        >
          {set ? 'Edit' : 'Set preferences'}
        </button>
      </div>
      {modal}
    </section>
  );
};

export default PartnerPreferencesCard;
