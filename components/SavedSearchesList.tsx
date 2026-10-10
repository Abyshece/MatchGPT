import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { listSavedSearches, removeSavedSearch, setSearchAlerts, type SavedSearchEntry } from '../lib/savedSearches';
import { usePartnerPreferences } from '../lib/partnerPreferences';
import { activeFilterChips } from '../lib/searchResults';
import NewMatchesModal from './NewMatchesModal';
import { IconBell, IconSearch, IconTrash, IconHeart } from '../constants';
import type { FilterOptions, MatchCandidate } from '../types';

// ============================================================================
// SavedSearchesList (Search History): the searches a member saved, each with
// its daily alert on or off, and the new members the last alert found; and
// the new members who fit their partner preferences.
// ============================================================================

interface SavedSearchesListProps {
  onRun: (prompt: string, filters: FilterOptions) => void;
  onOpenProfile: (candidate: MatchCandidate) => void;
}

const SavedSearchesList: React.FC<SavedSearchesListProps> = ({ onRun, onOpenProfile }) => {
  const { session } = useAuth();
  const { showToast } = useToast();
  const userId = session?.user.id;
  const [searches, setSearches] = useState<SavedSearchEntry[]>([]);
  const { prefs, reload: reloadPrefs } = usePartnerPreferences(userId);
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { searches: list } = await listSavedSearches(userId);
    setSearches(list);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const toggleAlerts = async (s: SavedSearchEntry) => {
    const { error } = await setSearchAlerts(s.id, !s.alerts);
    if (error) {
      showToast(`Couldn't change it: ${error}`, 'error');
      return;
    }
    setSearches((prev) => prev.map((x) => (x.id === s.id ? { ...x, alerts: !s.alerts } : x)));
    showToast(s.alerts ? `No more alerts for “${s.name}”` : `We'll tell you when someone new fits “${s.name}”`, 'success');
  };

  const remove = async (s: SavedSearchEntry) => {
    if (!window.confirm(`Remove the saved search “${s.name}”?`)) return;
    const { error } = await removeSavedSearch(s.id);
    if (error) {
      showToast(`Couldn't remove it: ${error}`, 'error');
      return;
    }
    setSearches((prev) => prev.filter((x) => x.id !== s.id));
  };

  const prefsNew = prefs?.newCount ?? 0;
  if (searches.length === 0 && prefsNew === 0) return null;

  return (
    <section className="mb-8" data-testid="saved-searches">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-3">Saved searches</h2>
      <div className="space-y-2">
        {prefsNew > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800" data-testid="prefs-new">
            <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0 [&>svg]:w-5 [&>svg]:h-5">
              <IconHeart />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">Your partner preferences</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">New members who fit what you're looking for</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen({ id: 'preferences', title: 'your partner preferences' })}
              className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold"
            >
              {prefsNew} new
            </button>
          </div>
        )}
        {searches.map((s) => {
          const summary = activeFilterChips(s.filters).map((c) => c.label).join(' · ');
          return (
            <div key={s.id} className="flex items-center gap-3 p-4 rounded-xl border bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800" data-testid="saved-search">
              <div className="w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                <IconSearch />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {[s.prompt && s.prompt !== s.name ? `“${s.prompt}”` : '', summary].filter(Boolean).join(' · ') || 'No filters'}
                </p>
              </div>
              {s.newCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen({ id: s.id, title: `“${s.name}”` })}
                  className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold whitespace-nowrap"
                  data-testid="saved-search-new"
                >
                  {s.newCount} new
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleAlerts(s)}
                aria-pressed={s.alerts}
                aria-label={s.alerts ? `Alerts on for ${s.name}: turn off` : `Alerts off for ${s.name}: turn on`}
                title={s.alerts ? 'Alerts on: we tell you about new members once a day' : 'Alerts off'}
                className={`p-2 rounded-lg [&>svg]:w-4 [&>svg]:h-4 ${s.alerts ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-zinc-800' : 'text-gray-400 dark:text-zinc-600'}`}
                data-testid="saved-search-alerts"
              >
                <IconBell />
              </button>
              <button
                type="button"
                onClick={() => onRun(s.prompt, s.filters)}
                className="px-3 py-1.5 rounded-full border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-500 whitespace-nowrap"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => remove(s)}
                aria-label={`Remove ${s.name}`}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <IconTrash />
              </button>
            </div>
          );
        })}
      </div>

      {open && (
        <NewMatchesModal
          id={open.id}
          title={open.title}
          onOpenProfile={onOpenProfile}
          onClose={() => {
            setOpen(null);
            // Looked at: the "new" count goes
            void load();
            void reloadPrefs();
          }}
        />
      )}
    </section>
  );
};

export default SavedSearchesList;
