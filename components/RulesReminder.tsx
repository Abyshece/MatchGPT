import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { markRulesReminded, needsRulesReminder } from '../lib/consentService';
import { LEGAL, openLegalPage } from '../lib/legalInfo';

// ============================================================================
// The reminder of the rules that the IT Rules 2021 (rule 3(1)(c), as amended on
// 10 February 2026) ask intermediaries to give their users at least once every
// three months: what happens if the rules are broken. Shown over the app when
// the last reminder (or the consent screen) was 90 days ago or more.
// ============================================================================

const RulesReminder: React.FC = () => {
  const { session, profileRow, refreshProfile } = useAuth();
  const [closed, setClosed] = useState(false);
  if (closed || !session || !profileRow || !needsRulesReminder(profileRow.rules_reminded_at)) return null;

  const done = async () => {
    setClosed(true);
    await markRulesReminded(session.user.id);
    await refreshProfile();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      role="dialog" aria-modal="true" aria-labelledby="rules-title" data-testid="rules-reminder">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-xl p-6 mb-[var(--safe-bottom)]">
        <h2 id="rules-title" className="text-lg font-bold text-gray-900 dark:text-white">A reminder of {LEGAL.brand}'s rules</h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {LEGAL.brand} is for finding a life partner to marry. As Indian law asks, we remind every member every few months:
        </p>
        <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>If you break our Terms, Privacy Policy or Community Guidelines, we can remove what you posted and suspend or
            close your account straight away.</li>
          <li>Posting or sharing unlawful content, such as obscene material, threats, fraud or dowry demands, can lead to
            penalties or punishment under the Information Technology Act and other laws.</li>
          <li>Where the law requires it, for example for offences involving children, we report them to the authorities.</li>
        </ul>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Read the <button type="button" className="underline" onClick={() => openLegalPage('terms')}>Terms</button> and the{' '}
          <button type="button" className="underline" onClick={() => openLegalPage('safety')}>Community Guidelines</button>.
        </p>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={done} data-testid="rules-reminder-ok"
            className="h-11 px-6 rounded-lg bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black text-sm font-bold">
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};

export default RulesReminder;
