import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  ROLES, fetchTeam, removeTeamMember, resetTwoStep, roleLabel, saveTeamMember, setRequireTwoStep,
  type AdminRole, type AdminStatus, type Team,
} from '../../lib/adminTeam';
import { Spinner, field, labelClass } from './BlogAiDialogs';
import { TwoStepCard } from './AdminTwoStep';
import { Pill, ago, date } from './adminUi';

// ============================================================================
// Admin → Team (owners): who's an admin and with which role, adding and
// removing them, their two-step sign-in (and resetting it for one who lost
// their phone), and requiring two-step sign-in of every admin. Someone added
// here signs in to the admin panel with that email (once they've confirmed
// it), with the sections their role allows.
// ============================================================================

const AdminTeamTab: React.FC<{ status: AdminStatus; onStatusChanged: () => void }> = ({ status, onStatusChanged }) => {
  const { showToast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('moderator');

  const load = useCallback(async () => {
    const { team, error } = await fetchTeam();
    if (error) showToast(`Couldn't load the team: ${error}`, 'error');
    setTeam(team);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, action: () => Promise<{ error: string | null }>, done: string) => {
    setBusy(key);
    const { error } = await action();
    setBusy(null);
    if (error) { showToast(error, 'error'); return false; }
    showToast(done, 'success');
    void load();
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (team?.members.some((m) => m.email.toLowerCase() === address)) { showToast('Already on the team: change their role below', 'error'); return; }
    if (await run('add', () => saveTeamMember(address, role), `${address} is a ${roleLabel(role).toLowerCase()} now`)) setEmail('');
  };

  const changeRole = (address: string, to: AdminRole) => run(address, () => saveTeamMember(address, to), `${address} is a ${roleLabel(to).toLowerCase()} now`);

  const remove = (address: string) => {
    if (!window.confirm(`Remove ${address} from the admin team? They lose the admin panel straight away.`)) return;
    void run(address, () => removeTeamMember(address), `${address} isn't an admin any more`);
  };

  const reset = (address: string) => {
    if (!window.confirm(`Reset ${address}'s two-step sign-in? Their authenticator app stops working for Shaadi24 and they're signed out everywhere; they set it up again when they next sign in. Do this only when you're sure it's them asking (they lost their phone).`)) return;
    void run(address, () => resetTwoStep(address), 'Reset and signed out: they set it up again when they sign in');
  };

  const setRequired = async (on: boolean) => {
    if (on && !window.confirm('Require two-step sign-in for every admin? Each admin needs an authenticator app and its code to open the admin panel; those who haven\'t set one up are asked to the next time they open it.')) return;
    if (await run('require', () => setRequireTwoStep(on), on ? 'Two-step sign-in is required now' : 'Two-step sign-in is optional now')) onStatusChanged();
  };

  if (!team) return <div className="h-64 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  const signedInWithCode = status.aal === 'aal2';

  return (
    <div className="space-y-6" data-testid="admin-team">
      <TwoStepCard required={team.require_two_step} onChanged={() => { onStatusChanged(); void load(); }} />

      <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="require-two-step-label" className="text-sm font-semibold text-gray-900 dark:text-white">Require two-step sign-in for every admin</h2>
          <p id="require-two-step-description" className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
            {team.require_two_step
              ? 'On: the admin panel, and everything it does, works only after the code from an authenticator app.'
              : signedInWithCode
                ? 'Off: each admin chooses. Turn it on so a leaked password alone can\'t open the admin panel.'
                : 'Off. To turn it on, set up your own two-step sign-in above first (so you know it works), and sign in with it.'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={team.require_two_step} aria-labelledby="require-two-step-label" aria-describedby="require-two-step-description"
          disabled={busy === 'require' || (!team.require_two_step && !signedInWithCode)} onClick={() => setRequired(!team.require_two_step)}
          className={`relative inline-flex h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${team.require_two_step ? 'bg-green-600' : 'bg-gray-300 dark:bg-zinc-600'}`}>
          <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${team.require_two_step ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Add an admin</h2>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="team-email" className={labelClass}>Their email (the one they sign in with)</label>
            <input id="team-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={field} />
          </div>
          <div>
            <label htmlFor="team-role" className={labelClass}>Role</label>
            <select id="team-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={field}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={busy === 'add' || !email.trim()} className="h-9 px-4 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
            {busy === 'add' ? <Spinner /> : 'Add'}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">They sign in on the website with that email, once they've confirmed it, and see the sections their role allows.</p>
      </section>

      <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm" data-testid="team-table">
          <thead className="bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400">
            <tr>
              <th scope="col" className="text-left font-medium px-3 py-2">Admin</th>
              <th scope="col" className="text-left font-medium px-3 py-2">Role</th>
              <th scope="col" className="text-left font-medium px-3 py-2">Two-step sign-in</th>
              <th scope="col" className="text-left font-medium px-3 py-2">Last signed in</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((m) => {
              const me = m.email.toLowerCase() === team.me;
              return (
                <tr key={m.email} className="border-t border-gray-100 dark:border-zinc-800" data-testid="team-member" data-email={m.email}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900 dark:text-white">{m.name ?? m.email}{me && <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-zinc-400">(you)</span>}</p>
                    {m.name && <p className="text-xs text-gray-500 dark:text-zinc-400">{m.email}</p>}
                    <p className="text-[11px] text-gray-500 dark:text-zinc-400">Added {date(m.added_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <label htmlFor={`role-${m.email}`} className="sr-only">Role of {m.email}</label>
                    <select id={`role-${m.email}`} value={m.role} disabled={busy === m.email} onChange={(e) => void changeRole(m.email, e.target.value as AdminRole)}
                      className="rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm">
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {m.two_step ? <Pill tone="green">On</Pill> : <Pill>Off</Pill>}
                      {m.two_step && !me && (
                        <button type="button" onClick={() => reset(m.email)} disabled={busy === m.email} className="text-xs underline text-gray-600 dark:text-zinc-300">
                          Reset<span className="sr-only"> two-step sign-in of {m.email}</span>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-zinc-300 whitespace-nowrap">
                    {m.signed_up ? ago(m.last_sign_in) : <span className="text-xs text-gray-500 dark:text-zinc-400">Hasn't signed up yet</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!me && (
                      <button type="button" onClick={() => remove(m.email)} disabled={busy === m.email}
                        className="h-7 px-2.5 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                        Remove<span className="sr-only"> {m.email}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">What each role can do</h2>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {ROLES.map((r) => (
            <div key={r.id}>
              <dt className="font-medium text-gray-900 dark:text-white">{r.label}</dt>
              <dd className="text-xs text-gray-500 dark:text-zinc-400">{r.what}{r.id === 'owner' ? '' : '; and the overview, errors and the app preview'}.</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
};

export default AdminTeamTab;
