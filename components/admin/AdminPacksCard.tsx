import React, { useEffect, useState } from 'react';
import { chargeName, formatRupees } from '../../lib/billingService';
import { fetchBoostStats, type BoostStats, type FinanceMode } from '../../lib/financeService';

// ============================================================================
// Admin → Finance: Spotlight and Super Interest, the packs bought one at a time
// (lib/boosts.ts): what sold in the last 30 days, how Spotlights did, and how
// often a Super Interest becomes a match next to an ordinary like.
// ============================================================================

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((100 * n) / of)}%` : '—');
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const Figure: React.FC<{ label: string; value: string | number; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-lg p-4 border bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
    <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    {sub && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
  </div>
);

const AdminPacksCard: React.FC<{ mode: FinanceMode; refreshed?: number }> = ({ mode, refreshed }) => {
  const [stats, setStats] = useState<BoostStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchBoostStats(30, mode).then(({ stats: s, error: e }) => {
      if (!live) return;
      setStats(s);
      setError(e);
    });
    return () => { live = false; };
  }, [mode, refreshed]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">Spotlight and Super Interest: {error}</p>;
  if (!stats) return <div className="h-40 rounded-lg bg-gray-100 dark:bg-zinc-800 animate-pulse" />;

  const sold = stats.products.reduce((n, p) => n + p.sold, 0);
  const gross = stats.products.reduce((n, p) => n + p.gross, 0);
  const net = stats.products.reduce((n, p) => n + p.net, 0);
  const si = stats.super_interests;
  return (
    <section data-testid="finance-packs" aria-labelledby="packs-title" className="space-y-3">
      <div>
        <h2 id="packs-title" className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          Spotlight and Super Interest · last {stats.days} days{mode === 'test' ? ' · test purchases' : ''}
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Bought one at a time in the apps, by members with or without Shaadi24+. Already in the money figures above.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Figure label="Packs sold" value={sold}
          sub={`${stats.buyers} ${stats.buyers === 1 ? 'buyer' : 'buyers'} · ${stats.repeat_buyers} bought again`} />
        <Figure label="Net" value={formatRupees(net)} sub={`${formatRupees(gross)} paid`} />
        <Figure label="Spotlights" value={stats.spotlights.started}
          sub={`${stats.spotlights.on_now} on now · each one: ${count(stats.spotlights.avg_views, 'search', 'searches')}, ${count(stats.spotlights.avg_likes, 'like')}`} />
        <Figure label="Super Interests sent" value={si.sent}
          sub={`${pct(si.matched, si.sent)} matched (likes: ${stats.likes_matched_pct === null ? '—' : `${stats.likes_matched_pct}%`})`} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-zinc-700">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-700">
              <th className="px-3 py-2 text-left">Pack</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Sold</th>
              <th className="px-3 py-2 text-right">Refunded</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {stats.products.map((p) => (
              <tr key={p.id} className="border-b last:border-0 border-gray-100 dark:border-zinc-700/60 text-gray-700 dark:text-gray-200">
                <td className="px-3 py-2">{chargeName(p.id)}{p.active ? '' : ' (not on sale)'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupees(p.price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.sold}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.refunded}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupees(p.gross)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupees(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Super Interests: {si.with_plan} came with Shaadi24+, {si.with_credit} bought, {si.with_note} with a note.
        Not used yet: {stats.unused.spotlight} Spotlights and {stats.unused.super_interest} Super Interests.
      </p>
    </section>
  );
};

export default AdminPacksCard;
