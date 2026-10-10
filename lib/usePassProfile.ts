// ============================================================================
// usePassProfile: "Not interested", with Undo
//
// The X on a card (search, Standouts) and "Not interested" on a profile keep
// that person out of the member's search and Standouts for good
// (passed_profiles; lib/freshProfiles.ts). The toast offers Undo for a few
// seconds; Settings → Hidden profiles undoes it later.
// ============================================================================

import { useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './useToast';
import { passProfile, unpassProfile } from './freshProfiles';
import type { MatchCandidate } from '../types';

/** pass(candidate, restore): hides them; restore puts the card back if it's undone */
export function usePassProfile() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const me = session?.user.id;

  return useCallback(async (candidate: MatchCandidate, restore?: () => void) => {
    if (!me) return;
    const { error } = await passProfile(me, candidate.id);
    if (error) {
      restore?.();
      showToast(`Couldn't hide ${candidate.name}: ${error}`, 'error');
      return;
    }
    showToast(`You won't see ${candidate.name} again`, 'info', {
      action: {
        label: 'Undo',
        onClick: async () => {
          const { error: undoError } = await unpassProfile(me, candidate.id);
          if (undoError) {
            showToast(`Couldn't undo: ${undoError}`, 'error');
            return;
          }
          restore?.();
          showToast(`${candidate.name} is back in your results`, 'success');
        },
      },
    });
  }, [me, showToast]);
}
