import React, { useEffect, useState } from 'react';
import { listPassedProfiles, unpassProfile, type PassedProfile } from '../lib/freshProfiles';
import { useToast } from '../lib/useToast';

// ============================================================================
// HiddenProfilesList (Settings)
//
// People the member said they're not interested in (lib/freshProfiles.ts),
// with Show again: they come back in search and Standouts.
// ============================================================================

const HiddenProfilesList: React.FC<{ userId: string }> = ({ userId }) => {
  const { showToast } = useToast();
  const [people, setPeople] = useState<PassedProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPassedProfiles().then(({ people: list, error: listError }) => {
      if (cancelled) return;
      if (listError) setError(listError);
      else setPeople(list);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const showAgain = async (person: PassedProfile) => {
    setBusyId(person.id);
    const { error: undoError } = await unpassProfile(userId, person.id);
    setBusyId(null);
    if (undoError) {
      showToast(`Couldn't show them again: ${undoError}`, 'error');
      return;
    }
    setPeople((prev) => (prev ?? []).filter((p) => p.id !== person.id));
    showToast(`${person.name} can show up in your searches again`, 'success');
  };

  if (error) return <p className="text-xs text-red-600 dark:text-red-400 px-2 py-3">Couldn't load hidden profiles: {error}</p>;
  if (!people) return <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-3">Loading…</p>;
  if (people.length === 0) {
    return <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-3">Nobody hidden. Tap the X on a profile to stop seeing them.</p>;
  }

  return (
    <div data-testid="hidden-profiles">
      {people.map((person) => (
        <div key={person.id} className="flex items-center justify-between py-2.5 px-2 border-b border-gray-50 dark:border-zinc-800/50 last:border-0">
          <div className="flex items-center gap-3 min-w-0">
            {person.photo ? (
              <img src={person.photo} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {person.name}{person.age ? `, ${person.age}` : ''}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Hidden {new Date(person.passedAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button
            onClick={() => showAgain(person)}
            disabled={busyId === person.id}
            className="text-xs font-semibold text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {busyId === person.id ? 'Showing…' : 'Show again'}
          </button>
        </div>
      ))}
    </div>
  );
};

export default HiddenProfilesList;
