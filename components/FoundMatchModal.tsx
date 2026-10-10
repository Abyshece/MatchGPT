import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { foundMyMatch } from '../lib/freshProfiles';
import { IconHeart } from '../constants';

// ============================================================================
// FoundMatchModal: "I found my match" (Settings)
//
// Members of other matrimony apps complain that profiles of people who have
// already married stay up for months. Here the member says so: the profile
// is hidden from everyone (Pause, which Settings can undo), and they may tell
// their story and their partner's first name for the team, who publish it
// only once both partners agree (success_stories; found_my_match() in the
// database).
// ============================================================================

interface FoundMatchModalProps {
  onDone: () => void;      // the profile is hidden now
  onCancel: () => void;
}

const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white';

const FoundMatchModal: React.FC<FoundMatchModalProps> = ({ onDone, onCancel }) => {
  const [partner, setPartner] = useState('');
  const [story, setStory] = useState('');
  const [bothAgree, setBothAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storyTooShort = story.trim().length > 0 && story.trim().length < 20;

  const confirm = async () => {
    if (storyTooShort) return;
    setBusy(true);
    setError(null);
    const out = await foundMyMatch({ partner, story, bothAgree });
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    onDone();
  };

  return createPortal(
    <div data-popup className="fixed inset-0 z-[300] flex overflow-y-auto p-4 popup-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="found-match-title">
      <div className="m-auto bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-zinc-800" data-testid="found-match">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true"><IconHeart /></div>
        <h2 id="found-match-title" className="text-lg font-bold text-center text-gray-900 dark:text-white">Congratulations!</h2>
        <p className="mt-2 text-sm text-center text-gray-600 dark:text-gray-300">
          Your profile will be hidden from everyone, so nobody keeps sending you interests. You can show it again any time
          from Settings.
        </p>

        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Tell us your story (optional)</p>
          <label className="block">
            <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Your partner's first name</span>
            <input value={partner} onChange={(e) => setPartner(e.target.value.slice(0, 40))} className={inputClass} autoComplete="off" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">How you met</span>
            <textarea
              value={story} onChange={(e) => setStory(e.target.value.slice(0, 1500))} rows={4}
              className={`${inputClass} resize-y`} placeholder="We matched in March, our families met in May…"
            />
          </label>
          {storyTooShort && <p className="text-xs text-amber-700 dark:text-amber-300">A few more words, please (at least 20 letters).</p>}
          {story.trim() && (
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={bothAgree} onChange={(e) => setBothAgree(e.target.checked)} className="mt-1" />
              <span>We both agree Shaadi24 may share our story. We'll check with you before anything is published.</span>
            </label>
          )}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error}</p>}

        <div className="mt-6 flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
            Not yet
          </button>
          <button
            type="button" onClick={confirm} disabled={busy || storyTooShort}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Hiding…' : 'Hide my profile'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default FoundMatchModal;
