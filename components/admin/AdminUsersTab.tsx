import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../lib/useToast';
import {
  searchUsers, banUser, unbanUser, verifyUser, correctDateOfBirth,
} from '../../lib/adminService';
import type { AdminUserRow } from '../../lib/adminService';
import { belowMarriageAge, minimumAge } from '../../lib/legalAge';

// ============================================================================
// AdminUsersTab
//
// Search the user base by name or email. Each result row shows account info
// and actions: ban / unban / verify, and correcting the date of birth (for
// members under the legal age who write in with an ID that shows otherwise).
// ============================================================================

interface AdminUsersTabProps {
  onAuditUpdate: () => void;
}

const AdminUsersTab: React.FC<AdminUsersTabProps> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [banModal, setBanModal] = useState<AdminUserRow | null>(null);
  const [dobModal, setDobModal] = useState<AdminUserRow | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const { users, error } = await searchUsers(q);
    setLoading(false);
    if (error) {
      showToast(`Search failed: ${error}`, 'error');
      return;
    }
    setUsers(users);
  }, [showToast]);

  // Load all on mount
  useEffect(() => { search(''); }, [search]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => { search(query); }, 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleBan = async (user: AdminUserRow, reason: string) => {
    setActioningId(user.id);
    const { error } = await banUser(user.id, reason);
    setActioningId(null);
    setBanModal(null);
    if (error) {
      showToast(`Couldn't ban: ${error}`, 'error');
      return;
    }
    showToast(`Banned ${user.name ?? user.email}`, 'success');
    onAuditUpdate();
    search(query);
  };

  const handleUnban = async (user: AdminUserRow) => {
    if (!confirm(`Unban ${user.name ?? user.email}? They'll be able to use Shaadi24 again immediately.`)) return;
    setActioningId(user.id);
    const { error } = await unbanUser(user.id);
    setActioningId(null);
    if (error) {
      showToast(`Couldn't unban: ${error}`, 'error');
      return;
    }
    showToast(`Unbanned ${user.name ?? user.email}`, 'success');
    onAuditUpdate();
    search(query);
  };

  const handleVerify = async (user: AdminUserRow) => {
    if (!confirm(`Mark ${user.name ?? user.email} as verified?`)) return;
    setActioningId(user.id);
    const { error } = await verifyUser(user.id);
    setActioningId(null);
    if (error) {
      showToast(`Couldn't verify: ${error}`, 'error');
      return;
    }
    showToast(`Verified ${user.name ?? user.email}`, 'success');
    onAuditUpdate();
    search(query);
  };

  // Returns the error, so the pop-up stays open to try again
  const handleCorrectDob = async (user: AdminUserRow, dateOfBirth: string, note: string): Promise<string | null> => {
    setActioningId(user.id);
    const { error } = await correctDateOfBirth(user.id, dateOfBirth, note);
    setActioningId(null);
    if (error) return error;
    setDobModal(null);
    showToast(`Date of birth corrected for ${user.name ?? user.email}`, 'success');
    onAuditUpdate();
    search(query);
    return null;
  };

  return (
    <div>
      {/* Search input */}
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users by name or email…"
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
          Showing {users.length}{users.length === 50 ? '+' : ''} results
        </p>
      </div>

      {/* User list */}
      {loading && users.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-zinc-800 rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">No users matching "{query}"</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-800 rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-700">
          {users.map((u, idx) => (
            <div
              key={u.id}
              className={`p-4 ${idx !== users.length - 1 ? 'border-b border-gray-100 dark:border-zinc-700/50' : ''} ${
                u.is_banned ? 'bg-red-50/30 dark:bg-red-900/10' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                      {u.name ?? '(no name)'} {u.age ? `· ${u.age}` : ''}
                    </h4>
                    {u.is_banned && <Badge color="red">Banned</Badge>}
                    {u.is_verified && <Badge color="blue">Verified</Badge>}
                    {u.subscription_tier === 'PRO' && <Badge color="yellow">Pro</Badge>}
                    {belowMarriageAge(u.gender, u.age) && <Badge color="red">Under {minimumAge(u.gender)}</Badge>}
                    {u.is_paused && <Badge color="gray">Hidden</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 break-words">
                    {[u.email, u.location].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    {[
                      u.gender,
                      u.date_of_birth && `Born ${formatDate(u.date_of_birth)}`,
                      `Joined ${new Date(u.account_created).toLocaleDateString()}`,
                      `${u.daily_search_count} searches today`,
                      `${u.daily_like_count} likes today`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {u.ban_reason && (
                    <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 italic">
                      Banned: "{u.ban_reason}"{u.banned_at ? ` on ${new Date(u.banned_at).toLocaleDateString()}` : ''}
                    </div>
                  )}
                </div>

                <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => setDobModal(u)}
                    disabled={actioningId === u.id}
                    className="px-2.5 py-1 text-[11px] font-bold border border-gray-300 dark:border-zinc-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                  >
                    Date of birth
                  </button>
                  {!u.is_verified && (
                    <button
                      onClick={() => handleVerify(u)}
                      disabled={actioningId === u.id}
                      className="px-2.5 py-1 text-[11px] font-bold border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 disabled:opacity-50"
                    >
                      Verify
                    </button>
                  )}
                  {u.is_banned ? (
                    <button
                      onClick={() => handleUnban(u)}
                      disabled={actioningId === u.id}
                      className="px-2.5 py-1 text-[11px] font-bold border border-gray-300 dark:border-zinc-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Unban
                    </button>
                  ) : (
                    <button
                      onClick={() => setBanModal(u)}
                      disabled={actioningId === u.id}
                      className="px-2.5 py-1 text-[11px] font-bold bg-red-600 text-white rounded hover:bg-red-700 shadow-sm disabled:opacity-50"
                    >
                      Ban
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ban modal */}
      {banModal && (
        <BanModal
          user={banModal}
          onCancel={() => setBanModal(null)}
          onConfirm={(reason) => handleBan(banModal, reason)}
        />
      )}

      {dobModal && (
        <DateOfBirthModal
          user={dobModal}
          saving={actioningId === dobModal.id}
          onCancel={() => setDobModal(null)}
          onConfirm={(dateOfBirth, note) => handleCorrectDob(dobModal, dateOfBirth, note)}
        />
      )}
    </div>
  );
};

// ============================================================================
// Badge
// ============================================================================

const Badge: React.FC<{ color: 'red' | 'blue' | 'yellow' | 'green' | 'gray'; children: React.ReactNode }> = ({ color, children }) => {
  const classes = {
    gray: 'bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-300',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  }[color];
  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${classes}`}>
      {children}
    </span>
  );
};

// ============================================================================
// BanModal
// ============================================================================

const BanModal: React.FC<{
  user: AdminUserRow;
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
          <div className="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center text-xl">
            🚫
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

const DateOfBirthModal: React.FC<{
  user: AdminUserRow;
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

export default AdminUsersTab;
