import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchAlertMatches } from '../lib/searchService';
import { usePassProfile } from '../lib/usePassProfile';
import MatchCard from './MatchCard';
import { IconX } from '../constants';
import type { MatchCandidate } from '../types';

// ============================================================================
// NewMatchesModal: the new members a saved search's daily alert found (or
// the partner preferences' alert, id 'preferences'). Looking doesn't use a
// search (fetchAlertMatches()); it clears the "new" count. Under the profile
// popup (z-200), so a profile opened from here shows on top.
// ============================================================================

interface NewMatchesModalProps {
  id: string;
  title: string;
  onOpenProfile: (candidate: MatchCandidate) => void;
  onClose: () => void;
}

const NewMatchesModal: React.FC<NewMatchesModalProps> = ({ id, title, onOpenProfile, onClose }) => {
  const [people, setPeople] = useState<MatchCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pass = usePassProfile();

  useEffect(() => {
    let live = true;
    fetchAlertMatches(id)
      .then((list) => { if (live) setPeople(list); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Couldn\'t load them.'); });
    return () => { live = false; };
  }, [id]);

  const drop = (personId: string) => setPeople((prev) => prev?.filter((p) => p.id !== personId) ?? prev);
  const hide = (personId: string) => {
    const at = people?.findIndex((p) => p.id === personId) ?? -1;
    const candidate = people?.[at];
    drop(personId);
    if (candidate) pass(candidate, () => setPeople((prev) => (prev && !prev.some((p) => p.id === personId) ? [...prev.slice(0, at), candidate, ...prev.slice(at)] : prev)));
  };

  return createPortal(
    <div data-popup className="fixed inset-0 z-[190] flex overflow-y-auto p-4 popup-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="new-matches-title">
      <div className="m-auto bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-4xl p-6 border border-gray-200 dark:border-zinc-800" data-testid="new-matches">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="new-matches-title" className="text-lg font-bold text-gray-900 dark:text-white">New members for you</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">They joined recently and fit {title}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">
            <IconX />
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
        ) : people === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />)}
          </div>
        ) : people.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nobody new to show now: they may have been liked, hidden or paused since.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map((c) => (
              <MatchCard key={c.id} candidate={c} onClick={() => onOpenProfile(c)} onLiked={() => drop(c.id)} onReject={hide} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default NewMatchesModal;
