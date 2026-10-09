import React, { useState } from 'react';
import { IconBan } from '../../constants';

// ============================================================================
// The pop-ups for acting on a member (Admin → Customers): banning them, with
// the reason the audit log keeps, and correcting a date of birth after seeing
// an ID.
// ============================================================================

export interface MemberBasics {
  id: string;
  name: string | null;
  email: string;
  age: number | null;
  gender: string | null;
  date_of_birth: string | null;
}

// ============================================================================
// BanModal
// ============================================================================

export const BanModal: React.FC<{
  user: MemberBasics;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}> = ({ user, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('');

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div aria-hidden="true" className="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6">
            <IconBan />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ban {user.name ?? user.email}?</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            They won't be able to sign in or use Shaadi24. Their profile will be hidden from search.
          </p>
        </div>

        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
          Reason (required, shown in audit log)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why are you banning this user?"
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 shadow-sm disabled:opacity-50"
          >
            Ban user
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DateOfBirthModal
// ============================================================================

// "2006-02-02" → "2 Feb 2006" (the date as written, whatever the time zone)
const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const DateOfBirthModal: React.FC<{
  user: MemberBasics;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (dateOfBirth: string, note: string) => Promise<string | null>;
}> = ({ user, saving, onCancel, onConfirm }) => {
  const [dateOfBirth, setDateOfBirth] = useState(user.date_of_birth ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const changed = !!dateOfBirth && dateOfBirth !== user.date_of_birth;
  const who = user.name ?? user.email;

  const save = async () => {
    setError(null);
    setError(await onConfirm(dateOfBirth, note.trim()));
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dob-title"
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dob-title" className="text-lg font-bold text-gray-900 dark:text-white">Correct {who}'s date of birth</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Now: {user.date_of_birth ? `${formatDate(user.date_of_birth)}${user.age != null ? ` (${user.age})` : ''}` : 'not given'}
          {user.gender ? ` · ${user.gender}` : ''}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
          Only after seeing an ID that shows the date of birth (Aadhaar, passport, PAN or driving licence).
          Shaadi24 is for women of 18 and over and men of 21 and over, so a later date is refused. If the
          profile was hidden only because of the age, it becomes visible again.
        </p>

        <label htmlFor="dob-date" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mt-4 mb-2">
          Date of birth on the ID
        </label>
        <input
          id="dob-date"
          type="date"
          value={dateOfBirth}
          max={today}
          onChange={(e) => { setDateOfBirth(e.target.value); setError(null); }}
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label htmlFor="dob-note" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mt-4 mb-2">
          How you checked it (required, shown in the audit log)
        </label>
        <textarea
          id="dob-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Passport photo sent to support, ticket SH24-…"
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!changed || !note.trim() || saving}
            className="flex-1 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:bg-neutral-800 dark:hover:bg-gray-200 shadow-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save date of birth'}
          </button>
        </div>
      </div>
    </div>
  );
};
