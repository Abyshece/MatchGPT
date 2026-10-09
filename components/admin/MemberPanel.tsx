import React, { useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { fetchCustomers, place, signInLabel, storeLabel, type CustomerRow } from '../../lib/adminCustomers';
import { banUser, correctDateOfBirth, unbanUser, verifyUser } from '../../lib/adminService';
import { BanModal, DateOfBirthModal } from './MemberModals';
import MemberTimeline from './MemberTimeline';
import { Pill, ago, dash, date, planPill, profileCell, verificationPill } from './adminUi';
import { IconX } from '../../constants';

// ============================================================================
// One member, opened from Customers, Moderation or Scam alerts: everything
// about them grouped, and the actions (verify, ban or unban, correct the date
// of birth), each kept in the audit log.
// ============================================================================

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-gray-500 dark:text-zinc-400">{label}</span>
    <span className="text-right text-gray-900 dark:text-zinc-100 min-w-0 break-words">{children}</span>
  </div>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-5">
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1">{title}</h3>
    <div className="divide-y divide-gray-100 dark:divide-zinc-800">{children}</div>
  </section>
);

export const MemberPanel: React.FC<{ member: CustomerRow; onClose: () => void; onChanged: () => void }> = ({ member: m, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [banning, setBanning] = useState(false);
  const [dob, setDob] = useState(false);
  const [view, setView] = useState<'details' | 'timeline'>('details');
  const who = m.name ?? m.email;
  const basics = { id: m.id, name: m.name, email: m.email, age: m.age, gender: m.gender, date_of_birth: m.date_of_birth };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !banning && !dob) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, banning, dob]);

  const act = async (run: () => Promise<{ error: string | null }>, done: string) => {
    setBusy(true);
    const { error } = await run();
    setBusy(false);
    if (error) {
      showToast(error, 'error');
      return false;
    }
    showToast(done, 'success');
    onChanged();
    return true;
  };

  return (
    <>
    <div className="fixed inset-0 z-[300] flex justify-end bg-black/20 dark:bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={who}
        data-testid="member-panel"
        className="h-full w-full max-w-md bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{who}</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{m.email}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 [&>svg]:w-4 [&>svg]:h-4"><IconX /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {verificationPill(m)} {planPill(m)}
            {m.banned && <Pill tone="red">Banned</Pill>}
            {m.paused && <Pill>Paused</Pill>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {!m.verified && (
              <button type="button" disabled={busy} onClick={() => { if (confirm(`Mark ${who} as verified?`)) void act(() => verifyUser(m.id), `Verified ${who}`); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Verify</button>
            )}
            <button type="button" disabled={busy} onClick={() => setDob(true)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Date of birth</button>
            {m.banned ? (
              <button type="button" disabled={busy} onClick={() => { if (confirm(`Unban ${who}? They'll be able to use Shaadi24 again immediately.`)) void act(() => unbanUser(m.id), `Unbanned ${who}`); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50">Unban</button>
            ) : (
              <button type="button" disabled={busy} onClick={() => setBanning(true)} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50">Ban</button>
            )}
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(m.id); showToast('Member ID copied', 'success'); }} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Copy ID</button>
          </div>
        </div>

        <div className="px-5 pb-8">
          <div className="mt-4 flex gap-1 border-b border-gray-100 dark:border-zinc-800" role="tablist" aria-label={`About ${who}`}>
            {(['details', 'timeline'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`h-9 px-3 -mb-px text-sm border-b-2 ${view === v ? 'border-gray-900 dark:border-white font-medium text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white'}`}>
                {v === 'details' ? 'Details' : 'Timeline'}
              </button>
            ))}
          </div>
          {view === 'timeline' ? <MemberTimeline userId={m.id} /> : (
            <>
            {m.ban_reason && <p className="mt-4 text-sm text-red-600 dark:text-red-400">Banned: “{m.ban_reason}”</p>}
            <Group title="About">
              <Field label="Gender">{dash(m.gender)}</Field>
              <Field label="Age">{m.age != null ? `${m.age} (born ${date(m.date_of_birth)})` : '—'}</Field>
              <Field label="Profile for">{dash(m.created_for)}</Field>
              <Field label="Marital status">{dash(m.marital_status)}</Field>
              <Field label="Height">{m.height_cm ? `${m.height_cm} cm` : '—'}</Field>
              <Field label="Location">{dash(place(m))}</Field>
              <Field label="Phone">{dash(m.phone)}</Field>
            </Group>
            <Group title="Background">
              <Field label="Religion">{dash(m.religion)}</Field>
              <Field label="Community">{dash(m.caste)}</Field>
              <Field label="Mother tongue">{dash(m.mother_tongue)}</Field>
              <Field label="Education">{dash(m.education)}</Field>
              <Field label="Occupation">{dash(m.occupation)}</Field>
              <Field label="Income">{dash(m.income)}</Field>
            </Group>
            <Group title="Account">
              <Field label="Joined">{date(m.joined)}</Field>
              <Field label="Last active">{ago(m.last_active)}</Field>
              <Field label="Sign-in">{signInLabel(m.sign_in)}{m.sign_in === 'email' ? (m.email_confirmed ? ' · confirmed' : ' · not confirmed') : ''}</Field>
              <Field label="Phones">{m.phones.length ? m.phones.join(', ') : '—'}</Field>
              <Field label="Plan">{m.tier === 'PRO' ? `Shaadi24+ ${m.plan ?? ''}${m.store ? ` · ${storeLabel(m.store)}` : ''}` : 'Free'}</Field>
              <Field label="Renews">{date(m.renews)}</Field>
              <Field label="Marketing emails">{m.marketing ? 'Yes' : 'No'}</Field>
            </Group>
            <Group title="Profile and activity">
              <Field label="Profile">{profileCell(m)}</Field>
              <Field label="Photos">{m.photos}</Field>
              <Field label="Likes sent / received">{m.likes_sent} / {m.likes_received}</Field>
              <Field label="Matches">{m.matches}</Field>
              <Field label="Messages sent">{m.messages}</Field>
              <Field label="Today">{m.searches_today} searches · {m.likes_today} likes</Field>
              <Field label="Reported / blocked by">{m.reports} / {m.blocked_by}</Field>
            </Group>
            </>
          )}
        </div>
      </aside>
    </div>

      {banning && (
        <BanModal
          user={basics}
          onCancel={() => setBanning(false)}
          onConfirm={async (reason) => { setBanning(false); await act(() => banUser(m.id, reason), `Banned ${who}`); }}
        />
      )}
      {dob && (
        <DateOfBirthModal
          user={basics}
          saving={busy}
          onCancel={() => setDob(false)}
          onConfirm={async (dateOfBirth, note) => {
            setBusy(true);
            const { error } = await correctDateOfBirth(m.id, dateOfBirth, note);
            setBusy(false);
            if (error) return error;
            setDob(false);
            showToast(`Date of birth corrected for ${who}`, 'success');
            onChanged();
            return null;
          }}
        />
      )}
    </>
  );
};


/** The member panel for a member known only by ID (Moderation, Scam alerts) */
export const MemberPanelById: React.FC<{ userId: string; onClose: () => void; onChanged?: () => void }> = ({ userId, onClose, onChanged }) => {
  const { showToast } = useToast();
  const [member, setMember] = useState<CustomerRow | null>(null);
  const close = React.useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const load = React.useCallback(async () => {
    const { rows, error } = await fetchCustomers({ query: userId, filter: 'all', sort: 'joined', limit: 1, offset: 0 });
    if (error || !rows[0]) {
      showToast(error ?? "Couldn't find that member", 'error');
      close.current();
      return;
    }
    setMember(rows[0]);
  }, [userId, showToast]);
  useEffect(() => { void load(); }, [load]);
  if (!member) return null;
  return <MemberPanel member={member} onClose={onClose} onChanged={() => { void load(); onChanged?.(); }} />;
};
