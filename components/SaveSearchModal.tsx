import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { defaultSearchName, MAX_SAVED_SEARCHES, saveSearchWithAlert } from '../lib/savedSearches';
import { IconBell } from '../constants';
import type { FilterOptions } from '../types';

// ============================================================================
// SaveSearchModal: keep a search, with a daily alert about new members who
// fit it (lib/savedSearches.ts). Members of other matrimony apps complain
// they can't save a search, and that new profiles go unnoticed.
// ============================================================================

interface SaveSearchModalProps {
  prompt: string;
  filters: FilterOptions;
  onSaved: () => void;
  onClose: () => void;
}

const SaveSearchModal: React.FC<SaveSearchModalProps> = ({ prompt, filters, onSaved, onClose }) => {
  const { session } = useAuth();
  const [name, setName] = useState(defaultSearchName(prompt));
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    const out = await saveSearchWithAlert(session.user.id, name, prompt, filters, alerts);
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    onSaved();
  };

  return createPortal(
    <div data-popup className="fixed inset-0 z-[300] flex overflow-y-auto p-4 popup-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="save-search-title">
      <div className="m-auto bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm p-6 border border-gray-200 dark:border-zinc-800" data-testid="save-search-modal">
        <h2 id="save-search-title" className="text-lg font-bold text-gray-900 dark:text-white">Save this search</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Find it in Search History. You can keep {MAX_SAVED_SEARCHES}.
        </p>
        <label className="block mt-4">
          <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Name</span>
          <input
            value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
          />
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} className="mt-1" data-testid="save-search-alerts" />
          <span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <span aria-hidden="true" className="[&>svg]:w-3.5 [&>svg]:h-3.5"><IconBell /></span> Tell me about new members
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">Once a day at most, when someone new fits this search.</span>
          </span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="mt-6 flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="button" onClick={save} disabled={busy || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SaveSearchModal;
