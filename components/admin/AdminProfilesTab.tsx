import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { fetchProfileStats, fieldLabel, sectionNudge, SECTION_TITLES, type MessageDraft, type ProfileStats } from '../../lib/adminGrowth';
import MessageComposer from './MessageComposer';

// ============================================================================
// Admin → Profiles: how much of their profiles members have filled in (by how
// much, by sections complete, each section, and the answers most often
// missing), and for each section a message to everyone who hasn't completed
// it, with a button that opens that section in their app.
// ============================================================================

const Bar: React.FC<{ value: number; max: number }> = ({ value, max }) => (
  <span className="block h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
    <span className="block h-full rounded-full bg-gray-900 dark:bg-white" style={{ width: `${max ? Math.round((value / max) * 100) : 0}%` }} />
  </span>
);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`rounded-lg border border-gray-200 dark:border-zinc-800 p-4 ${className}`}>
    <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h2>
    {children}
  </section>
);

const AdminProfilesTab: React.FC = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [draft, setDraft] = useState<MessageDraft | null>(null);

  const load = useCallback(async () => {
    const { stats, error } = await fetchProfileStats();
    if (error) showToast(`Couldn't load profiles: ${error}`, 'error');
    setStats(stats);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  if (!stats) return <div className="h-64 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  const maxBand = Math.max(...stats.bands.map((b) => b.count), 1);
  const maxDone = Math.max(...stats.sections_done.map((b) => b.count), 1);

  return (
    <div className="space-y-5" data-testid="admin-profiles">
      <div className="grid md:grid-cols-2 gap-5">
        <Card title={`How much is filled in (${stats.members.toLocaleString()} members)`}>
          <ul className="space-y-2">
            {stats.bands.map((b) => (
              <li key={b.label} className="grid grid-cols-[96px_1fr_48px] items-center gap-3 text-sm">
                <span className="text-gray-600 dark:text-zinc-300">{b.label}</span>
                <Bar value={b.count} max={maxBand} />
                <span className="text-right tabular-nums text-gray-900 dark:text-white">{b.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Sections complete">
          <ul className="space-y-2">
            {stats.sections_done.map((b) => (
              <li key={b.done} className="grid grid-cols-[96px_1fr_48px] items-center gap-3 text-sm">
                <span className="text-gray-600 dark:text-zinc-300">{b.done} of 6</span>
                <Bar value={b.count} max={maxDone} />
                <span className="text-right tabular-nums text-gray-900 dark:text-white">{b.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Each section">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="profile-sections">
            <thead className="text-gray-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="text-left font-medium py-2 pr-3">Section</th>
                <th scope="col" className="text-right font-medium py-2 px-3">Complete</th>
                <th scope="col" className="text-right font-medium py-2 px-3">Not complete</th>
                <th scope="col" className="text-left font-medium py-2 px-3 w-48">Answers given</th>
                <th scope="col" className="py-2 pl-3"><span className="sr-only">Message</span></th>
              </tr>
            </thead>
            <tbody>
              {stats.sections.map((s) => (
                <tr key={s.id} className="border-t border-gray-100 dark:border-zinc-800">
                  <th scope="row" className="text-left font-medium py-2.5 pr-3 text-gray-900 dark:text-white">{SECTION_TITLES[s.id] ?? s.title}</th>
                  <td className="text-right tabular-nums py-2.5 px-3">{s.complete}</td>
                  <td className="text-right tabular-nums py-2.5 px-3">{s.incomplete}</td>
                  <td className="py-2.5 px-3">
                    <span className="flex items-center gap-2"><Bar value={s.answered_pct ?? 0} max={100} /><span className="tabular-nums w-10 text-right">{s.answered_pct ?? 0}%</span></span>
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <button
                      type="button"
                      disabled={s.incomplete === 0}
                      onClick={() => setDraft(sectionNudge(s.id))}
                      className="h-8 px-3 rounded-md border border-gray-200 dark:border-zinc-700 text-xs font-medium whitespace-nowrap hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Message them<span className="sr-only">: the {s.incomplete} members whose {SECTION_TITLES[s.id] ?? s.title} isn't complete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Answers most often missing">
        <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
          {stats.missing_fields.map((f) => (
            <li key={`${f.section}-${f.key}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-gray-900 dark:text-white">{fieldLabel(f.key)}</span>
                <span className="text-gray-500 dark:text-zinc-400"> · {SECTION_TITLES[f.section] ?? f.section}</span>
              </span>
              <span className="tabular-nums text-gray-600 dark:text-zinc-300 whitespace-nowrap">{f.missing} of {f.of} missing</span>
            </li>
          ))}
        </ul>
      </Card>

      {draft && <MessageComposer initial={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); void load(); }} />}
    </div>
  );
};

export default AdminProfilesTab;
