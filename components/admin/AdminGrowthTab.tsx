import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import {
  DIMENSIONS, fetchBiodataStats, fetchFamilyStats, fetchGrowth, type BiodataStats, type Dimension, type FamilyStats, type Growth,
} from '../../lib/adminInsights';
import DailyChart from './DailyChart';
import { FINANCE_VIZ_CSS } from './RevenueChart';

// ============================================================================
// Admin → Growth: members and who's active (today, this week, this month);
// how far the members who joined in the period got, step by step (joined →
// finished sign-up → photo → verified → liked → matched → messaged → bought
// Shaadi24+), each with its share of those who joined; sign-ups and active
// members a day (active: searched, liked or wrote that day); and members by
// city, community, religion, gender and age, with how many were active in
// the last 30 days. Days are India time. Then biodatas members shared
// (lib/biodata.ts): how many, how often their links were opened, the most
// opened; and Family Circle (lib/familyCircle.ts): circles, family who
// looked, their reactions.
// ============================================================================

const SPANS = [7, 30, 90] as const;
const fmt = (n: number) => n.toLocaleString('en-IN');
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

const Tile: React.FC<{ label: string; value: number; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4">
    <p className="text-xs text-gray-500 dark:text-zinc-400">{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">{fmt(value)}</p>
    {sub && <p className="text-xs text-gray-500 dark:text-zinc-400">{sub}</p>}
  </div>
);

// A bar that reads as a share: the mark in the chart colour, the number in text colours
const ShareBar: React.FC<{ value: number; max: number }> = ({ value, max }) => (
  <span className="block h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden" aria-hidden="true">
    <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0}%`, background: 'var(--viz-s1)' }} />
  </span>
);

const AdminGrowthTab: React.FC = () => {
  const { showToast } = useToast();
  const [days, setDays] = useState<(typeof SPANS)[number]>(30);
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [dimension, setDimension] = useState<Dimension>('city');
  const [biodata, setBiodata] = useState<BiodataStats | null>(null);
  const [family, setFamily] = useState<FamilyStats | null>(null);

  const load = useCallback(async (d: number) => {
    const [{ growth, error }, shared, circles] = await Promise.all([fetchGrowth(d), fetchBiodataStats(d), fetchFamilyStats(d)]);
    if (error) showToast(`Couldn't load growth: ${error}`, 'error');
    setGrowth(growth);
    setBiodata(shared.stats);
    setFamily(circles.stats);
  }, [showToast]);
  useEffect(() => { void load(days); }, [days, load]);

  if (!growth) return <div className="h-96 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;
  const joined = growth.funnel[0]?.n ?? 0;
  const rows = growth.breakdown[dimension] ?? [];
  const maxRow = Math.max(1, ...rows.map((r) => r.members));

  return (
    <div className="fin-viz space-y-5" data-testid="admin-growth">
      <style>{FINANCE_VIZ_CSS}</style>
      <div className="flex justify-end">
        <div className="inline-flex rounded-md border border-gray-200 dark:border-zinc-700 p-0.5" role="group" aria-label="Period">
          {SPANS.map((s) => (
            <button key={s} type="button" aria-pressed={days === s} onClick={() => setDays(s)}
              className={`h-7 px-3 rounded text-xs ${days === s ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-zinc-300'}`}>
              {s} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="growth-tiles">
        <Tile label="Members" value={growth.members} sub="finished sign-up, not banned" />
        <Tile label="Active today" value={growth.active_1} sub={pct(growth.active_1, growth.members) + ' of members'} />
        <Tile label="Active this week" value={growth.active_7} sub={pct(growth.active_7, growth.members) + ' of members'} />
        <Tile label="Active this month" value={growth.active_30} sub={pct(growth.active_30, growth.members) + ' of members'} />
      </div>

      <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="growth-funnel">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">How far new members get</h2>
        <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">The {fmt(joined)} who joined in the last {growth.days} days, and how many reached each step.</p>
        <table className="w-full text-sm">
          <thead className="sr-only"><tr><th scope="col">Step</th><th scope="col">Members</th><th scope="col">Share</th><th scope="col">Of those who joined</th></tr></thead>
          <tbody>
            {growth.funnel.map((f, i) => (
              <tr key={f.step} className="align-middle">
                <th scope="row" className="text-left font-normal py-1.5 pr-3 w-40 text-gray-700 dark:text-zinc-300 whitespace-nowrap">{f.step}</th>
                <td className="py-1.5 pr-3"><ShareBar value={f.n} max={joined} /></td>
                <td className="py-1.5 pr-2 w-16 text-right tabular-nums text-gray-900 dark:text-white">{fmt(f.n)}</td>
                <td className="py-1.5 w-14 text-right tabular-nums text-gray-500 dark:text-zinc-400">{i === 0 ? '' : pct(f.n, joined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        <DailyChart title="Sign-ups a day" unit={['sign-up', 'sign-ups']} points={growth.series.map((d) => ({ day: d.day, value: d.signups }))} testId="chart-signups" />
        <DailyChart title="Active members a day" unit={['member', 'members']} points={growth.series.map((d) => ({ day: d.day, value: d.active }))} testId="chart-active" />
      </div>

      <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="growth-breakdown">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Members by {DIMENSIONS.find((d) => d.id === dimension)?.label.toLowerCase()}</h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Members by">
            {DIMENSIONS.map((d) => (
              <button key={d.id} type="button" aria-pressed={dimension === d.id} onClick={() => setDimension(d.id)}
                className={`h-7 px-2.5 rounded-md text-xs ${dimension === d.id ? 'bg-gray-200/70 dark:bg-zinc-700/60 font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? <p className="text-sm text-gray-500 dark:text-zinc-400">No members yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-gray-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="text-left font-medium py-1.5 pr-3">{DIMENSIONS.find((d) => d.id === dimension)?.label}</th>
                <th scope="col" className="py-1.5 pr-3"><span className="sr-only">Share</span></th>
                <th scope="col" className="text-right font-medium py-1.5 pr-3">Members</th>
                <th scope="col" className="text-right font-medium py-1.5">Active (30 days)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-gray-100 dark:border-zinc-800">
                  <th scope="row" className="text-left font-normal py-1.5 pr-3 text-gray-900 dark:text-white">{r.label}</th>
                  <td className="py-1.5 pr-3 w-1/3"><ShareBar value={r.members} max={maxRow} /></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.members)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">{fmt(r.active)} <span className="text-gray-500 dark:text-zinc-400">({pct(r.active, r.members)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {biodata && (
        <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="growth-biodata">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Biodatas shared</h2>
          <p className="text-xs text-gray-500 dark:text-zinc-400">Members share their biodata on WhatsApp; its QR code and link open their page on the website, which sends people to the app.</p>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Members with a biodata" value={biodata.members} sub={`${fmt(biodata.made_in_period)} made one in ${days} days`} />
            <Tile label="Links on" value={biodata.active_links} sub="the rest were turned off" />
            <Tile label="Times opened" value={biodata.opens} sub="all time" />
            <Tile label={`Opened in ${days} days`} value={biodata.opened_in_period} sub="members whose biodata was opened" />
          </div>
          {biodata.top.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <caption className="text-left text-xs text-gray-500 dark:text-zinc-400 pb-1">Most opened</caption>
              <thead>
                <tr className="text-xs text-gray-500 dark:text-zinc-400">
                  <th scope="col" className="text-left font-medium py-1">Member</th>
                  <th scope="col" className="text-right font-medium py-1">Opened</th>
                  <th scope="col" className="text-right font-medium py-1">Last opened</th>
                </tr>
              </thead>
              <tbody>
                {biodata.top.map((t) => (
                  <tr key={t.user_id} className="border-t border-gray-100 dark:border-zinc-800">
                    <th scope="row" className="text-left font-normal py-1.5 pr-3 text-gray-900 dark:text-white">
                      {t.name || t.email || 'A member'}{t.turned_off && <span className="ml-2 text-xs text-gray-500 dark:text-zinc-400">(link off)</span>}
                    </th>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(t.opens)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-zinc-300">
                      {t.last_opened_at ? new Date(t.last_opened_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {family && (
        <section className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid="growth-family">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Family Circle</h2>
          <p className="text-xs text-gray-500 dark:text-zinc-400">Members invite family with a link; family see their shortlist and react.</p>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Members with family invited" value={family.circles} />
            <Tile label="Family invited" value={family.family}
              sub={Object.entries(family.by_relation).map(([r, n]) => `${n} ${r}`).join(', ') || undefined} />
            <Tile label={`Family who looked in ${days} days`} value={family.visited_in_period} />
            <Tile label="Reactions" value={family.reactions}
              sub={`👍 ${fmt(family.by_reaction.yes ?? 0)} · 🤔 ${fmt(family.by_reaction.maybe ?? 0)} · 👎 ${fmt(family.by_reaction.no ?? 0)}`} />
          </div>
        </section>
      )}
    </div>
  );
};

export default AdminGrowthTab;
