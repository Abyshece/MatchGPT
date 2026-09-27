import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { listBlockedByMe, unblockUser } from '../lib/blocksService';
import { displayName } from '../lib/profileMapping';
import { useToast } from '../lib/useToast';

// ============================================================================
// BlockedPeopleList (Settings)
//
// People the user blocked, with an Unblock button. Unblocking lets you both
// find each other in search again; it doesn't restore an old match.
// ============================================================================

interface BlockedPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  blockedAt: string;
}

const BlockedPeopleList: React.FC<{ userId: string }> = ({ userId }) => {
  const { showToast } = useToast();
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { ids, error: listError } = await listBlockedByMe(userId);
      if (listError) {
        if (!cancelled) setError(listError);
        return;
      }
      const { data: cards } = ids.length
        ? await supabase.rpc('get_profile_cards', { p_ids: ids.map((b) => b.blockedId) })
        : { data: [] };
      const byId = new Map((cards ?? []).map((p) => [p.id, p]));
      if (cancelled) return;
      setPeople(ids.map((b) => {
        // No card for someone who was banned or blocked you too
        const card = byId.get(b.blockedId);
        return {
          id: b.blockedId,
          name: card ? displayName(card.name) : 'Profile unavailable',
          photoUrl: card?.photo_urls?.[0] ?? null,
          blockedAt: b.createdAt,
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const handleUnblock = async (person: BlockedPerson) => {
    setBusyId(person.id);
    const { error: unblockError } = await unblockUser(userId, person.id);
    setBusyId(null);
    if (unblockError) {
      showToast(`Couldn't unblock: ${unblockError}`, 'error');
      return;
    }
    setPeople((prev) => (prev ?? []).filter((p) => p.id !== person.id));
    showToast(`${person.name} is unblocked`, 'success');
  };

  if (error) return <p className="text-xs text-red-600 dark:text-red-400 px-2 py-3">Couldn't load blocked people: {error}</p>;
  if (!people) return <p className="text-xs text-gray-400 px-2 py-3">Loading…</p>;
  if (people.length === 0) return <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-3">You haven't blocked anyone.</p>;

  return (
    <div>
      {people.map((person) => (
        <div
          key={person.id}
          className="flex items-center justify-between py-2.5 px-2 border-b border-gray-50 dark:border-zinc-800/50 last:border-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            {person.photoUrl ? (
              <img src={person.photoUrl} alt="" className="w-9 h-9 rounded-full object-cover bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{person.name}</p>
              <p className="text-[11px] text-gray-400">Blocked {new Date(person.blockedAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button
            onClick={() => handleUnblock(person)}
            disabled={busyId === person.id}
            className="text-xs font-bold px-3 py-1.5 rounded-md border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {busyId === person.id ? 'Unblocking…' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  );
};

export default BlockedPeopleList;
