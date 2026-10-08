import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { banUser } from '../../lib/adminService';
import { SIGNAL_LABELS, fetchRiskAlerts, fingerprintAllPhotos, reviewRisk, type RiskAlert } from '../../lib/adminSafety';
import { BanModal } from './MemberModals';
import { MemberPanelById } from './MemberPanel';
import { Pill, ago } from './adminUi';

// ============================================================================
// Admin → Scam alerts: members who look like scammers or fake profiles, from
// what they do (admin_risk_signals()): the same photo as another account,
// money talk in chats, one message pasted to many people, likes by the dozen,
// reports from several members, a banned member back. Most serious first.
// Open the member, ban them, or mark the alert reviewed; it comes back if
// something new happens. "Check every photo" fingerprints the photos not
// checked yet (lib/photoFingerprint.ts), in this browser.
// ============================================================================

const SEVERITY: Record<number, { label: string; tone: 'red' | 'amber' | 'gray' }> = {
  3: { label: 'High', tone: 'red' }, 2: { label: 'Medium', tone: 'amber' }, 1: { label: 'Low', tone: 'gray' },
};

const AdminRiskTab: React.FC = () => {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<RiskAlert[] | null>(null);
  const [show, setShow] = useState<'open' | 'reviewed'>('open');
  const [member, setMember] = useState<string | null>(null);
  const [banning, setBanning] = useState<RiskAlert | null>(null);
  const [scan, setScan] = useState<{ done: number; left: number } | null>(null);

  const load = useCallback(async () => {
    const { alerts, error } = await fetchRiskAlerts();
    if (error) showToast(`Couldn't load alerts: ${error}`, 'error');
    setAlerts(alerts);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  const reviewed = async (a: RiskAlert) => {
    const { error } = await reviewRisk(a.user_id, a.signal);
    if (error) showToast(error, 'error');
    else {
      showToast('Marked reviewed', 'success');
      void load();
    }
  };

  const checkPhotos = async () => {
    setScan({ done: 0, left: 0 });
    const { done, error } = await fingerprintAllPhotos((d, left) => setScan({ done: d, left }));
    setScan(null);
    if (error) showToast(`Couldn't check every photo: ${error}`, 'error');
    else showToast(done ? `Checked ${done} photo${done === 1 ? '' : 's'}` : 'Every photo is checked already', 'success');
    void load();
  };

  const list = (alerts ?? []).filter((a) => (show === 'open' ? a.open : !a.open));
  const openCount = (alerts ?? []).filter((a) => a.open).length;

  return (
    <div className="space-y-4" data-testid="admin-risk">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Show">
          {(['open', 'reviewed'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}
              className={`h-8 px-3 rounded-md text-sm ${show === s ? 'bg-gray-200/70 dark:bg-zinc-700/60 font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
              {s === 'open' ? 'To look at' : 'Reviewed'}{s === 'open' && alerts ? <span className="ml-1 tabular-nums text-gray-600 dark:text-zinc-300">{openCount}</span> : null}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {scan && <span className="text-xs text-gray-500 dark:text-zinc-400" role="status">Checking photos… {scan.done} done{scan.left ? `, ${scan.left} to go` : ''}</span>}
          <button type="button" onClick={checkPhotos} disabled={!!scan} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40">
            Check every photo
          </button>
          <button type="button" onClick={() => void load()} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Refresh</button>
        </div>
      </div>

      {!alerts ? (
        <div className="h-48 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 p-10 text-center" data-testid="risk-empty">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{show === 'open' ? 'Nothing to look at' : 'None reviewed yet'}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Alerts come from the same photo on two accounts, money talk in chats, one message pasted to many people,
            dozens of likes in an hour, reports from several members, and banned members coming back.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-800">
          {list.map((a) => (
            <li key={`${a.user_id}-${a.signal}`} className="flex flex-wrap sm:flex-nowrap items-start gap-3 p-4" data-testid="risk-alert" data-signal={a.signal}>
              {a.photo ? (
                <img src={a.photo} alt="" className="w-12 h-12 rounded-full object-cover flex-none bg-gray-100 dark:bg-zinc-800" />
              ) : (
                <span className="w-12 h-12 rounded-full flex-none bg-gray-100 dark:bg-zinc-800" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Pill>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{SIGNAL_LABELS[a.signal]}</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-400">· {ago(a.evidence_at)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-700 dark:text-zinc-300 break-words">{a.detail}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  <button type="button" onClick={() => setMember(a.user_id)} className="font-medium text-gray-900 dark:text-white hover:underline">
                    {a.name ?? 'Member'}{a.age ? `, ${a.age}` : ''}
                  </button>
                  {a.place ? ` · ${a.place}` : ''} · joined {ago(a.account_created)}{a.is_verified ? ' · verified' : ''}
                  {a.reviewed_at && ` · reviewed ${ago(a.reviewed_at)}${a.reviewed_by ? ` by ${a.reviewed_by}` : ''}`}
                </p>
              </div>
              <div className="flex gap-2 flex-none">
                <button type="button" onClick={() => setMember(a.user_id)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Open</button>
                <button type="button" onClick={() => setBanning(a)} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700">Ban</button>
                {a.open && <button type="button" onClick={() => reviewed(a)} className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-800">Reviewed</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {member && <MemberPanelById userId={member} onClose={() => setMember(null)} onChanged={() => void load()} />}
      {banning && (
        <BanModal
          user={{ id: banning.user_id, name: banning.name, email: '', age: banning.age, gender: null, date_of_birth: null }}
          onCancel={() => setBanning(null)}
          onConfirm={async (reason) => {
            const who = banning.name ?? 'the member';
            setBanning(null);
            const { error } = await banUser(banning.user_id, reason);
            if (error) showToast(error, 'error');
            else {
              showToast(`Banned ${who}`, 'success');
              void load();
            }
          }}
        />
      )}
    </div>
  );
};

export default AdminRiskTab;
