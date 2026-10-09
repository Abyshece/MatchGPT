import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { chargeName, formatMoney, formatRupees } from '../../lib/billingService';
import AdminPacksCard from './AdminPacksCard';
import {
  SELLERS, SELLER_LABEL, addMonths, chargeStatus, chargesCsv, fetchAllCharges, fetchCharges, fetchFinanceSummary,
  indiaMonth, indiaTime, isSeller, monthBounds, monthLabel, rupeesShort,
  type Charge, type ChargeFilter, type FinanceMode, type FinanceMonth, type FinanceSummary, type MoneyTotals, type Seller,
} from '../../lib/financeService';
import { saveTextFile } from '../../lib/saveFile';
import RevenueChart, { FINANCE_VIZ_CSS, SELLER_COLOR } from './RevenueChart';

// ============================================================================
// AdminFinanceTab: the money
//
// Subscribers and recurring revenue now; what came in this month and since
// launch; net revenue by month and seller (chart, or the same as a table);
// and every charge, filtered by seller and month, exportable as CSV for the
// accounts. Live money and test purchases (Play licence testers, the App
// Store sandbox) are kept apart. Rupee figures count INR
// charges; months follow the calendar in India. The stores' commission is
// an estimate until their payout reports.
// ============================================================================

const SPANS = [6, 12, 24] as const;
type Span = (typeof SPANS)[number];
const PAGE = 50;
const NO_TOTALS: MoneyTotals = { gross: 0, refunds: 0, fees: 0, net: 0, charges: 0 };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

function addTotals(a: MoneyTotals, b: MoneyTotals | undefined): MoneyTotals {
  if (!b) return a;
  return { gross: a.gross + b.gross, refunds: a.refunds + b.refunds, fees: a.fees + b.fees, net: a.net + b.net, charges: a.charges + b.charges };
}

const AdminFinanceTab: React.FC = () => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<FinanceMode>('live');
  const [span, setSpan] = useState<Span>(12);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const [seller, setSeller] = useState<Seller | null>(null);
  const [month, setMonth] = useState<string | null>(null);  // null: every month shown
  const [charges, setCharges] = useState<Charge[]>([]);
  const [more, setMore] = useState(false);
  const [chargesLoading, setChargesLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refreshed, setRefreshed] = useState(0);

  const thisMonth = indiaMonth();
  const firstMonth = addMonths(thisMonth, 1 - span);

  // Only the newest request's answer counts (live and test can be switched quickly)
  const summaryRequest = useRef(0);
  const loadSummary = useCallback(async () => {
    const request = ++summaryRequest.current;
    setLoading(true);
    const { summary: s, error } = await fetchFinanceSummary(span, mode);
    if (request !== summaryRequest.current) return;
    setLoading(false);
    if (error) {
      setFailed(error);
      showToast(`Finance: ${error}`, 'error');
      return;
    }
    setFailed(null);
    setSummary(s);
  }, [span, mode, showToast]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // A month outside the months shown goes back to all of them
  useEffect(() => {
    if (month && (month < firstMonth || month > thisMonth)) setMonth(null);
  }, [month, firstMonth, thisMonth]);

  const filter: ChargeFilter = useMemo(() => ({
    mode,
    seller,
    from: monthBounds(month ?? firstMonth).from,
    to: month ? monthBounds(month).to : null,
  }), [mode, seller, month, firstMonth]);

  const currentFilter = useRef(filter);
  useEffect(() => { currentFilter.current = filter; }, [filter]);

  useEffect(() => {
    let live = true;
    setChargesLoading(true);
    fetchCharges(filter, PAGE + 1).then(({ charges: rows, error }) => {
      if (!live) return;
      setChargesLoading(false);
      if (error) {
        showToast(`Charges: ${error}`, 'error');
        return;
      }
      setCharges(rows.slice(0, PAGE));
      setMore(rows.length > PAGE);
    });
    return () => { live = false; };
  }, [filter, refreshed, showToast]);

  const showMore = async () => {
    setChargesLoading(true);
    const { charges: rows, error } = await fetchCharges(filter, PAGE + 1, charges.length);
    if (currentFilter.current !== filter) return;  // the filter changed meanwhile
    setChargesLoading(false);
    if (error) {
      showToast(`Charges: ${error}`, 'error');
      return;
    }
    setCharges((prev) => [...prev, ...rows.slice(0, PAGE)]);
    setMore(rows.length > PAGE);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { charges: rows, error } = await fetchAllCharges(filter);
      if (error) throw new Error(error);
      if (!rows.length) {
        showToast('No charges to export.', 'info');
        return;
      }
      const months = month ?? `${firstMonth}-to-${thisMonth}`;
      const name = `shaadi24-charges-${mode}-${months}${seller ? `-${seller.replace('_', '-')}` : ''}.csv`;
      if (await saveTextFile(name, chargesCsv(rows), 'text/csv;charset=utf-8')) {
        showToast(`Exported ${plural(rows.length, 'charge')}.`, 'success');
      }
    } catch (e) {
      showToast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // (While other months load, the previous ones stay, limited to those now shown)
  const months: FinanceMonth[] = useMemo(
    () => (summary?.months ?? []).filter((m) => m.month >= firstMonth), [summary, firstMonth]);
  const current = months.find((m) => m.month === thisMonth);
  const previous = months.find((m) => m.month === addMonths(thisMonth, -1));
  const sellers = SELLERS.filter((s) => months.some((m) => m.by_provider[s]));
  const anyMoney = months.some((m) => m.charges > 0);

  // The rupee totals behind the charges list's filter
  const listed = (month ? months.filter((m) => m.month === month) : months)
    .reduce((sum, m) => addTotals(sum, seller ? m.by_provider[seller] : m), NO_TOTALS);
  const others: [string, Omit<MoneyTotals, 'fees'>][] = summary ? Object.entries(summary.other_currencies) : [];

  return (
    <div className="fin-viz space-y-6" data-testid="finance-tab">
      <style>{FINANCE_VIZ_CSS}</style>

      {/* Filters for everything below */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Money"
          value={mode}
          options={[['live', 'Live money'], ['test', 'Test purchases']]}
          onChange={setMode}
        />
        <Segmented
          label="Months shown"
          value={span}
          options={SPANS.map((n) => [n, `${n} months`] as [Span, string])}
          onChange={setSpan}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {summary && <span>Updated {new Date(summary.generated_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>}
          <button
            onClick={() => { loadSummary(); setRefreshed((n) => n + 1); }}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {mode === 'test' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          Test purchases only: Google Play licence testers and the App Store sandbox. No real money.
        </div>
      )}

      {!summary && loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white dark:bg-zinc-800 rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      )}

      {!summary && !loading && (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
          Couldn't load the finances{failed ? `: ${failed}` : ''}.{' '}
          <button onClick={loadSummary} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Try again</button>
        </div>
      )}

      {summary && (
        // While new figures load, the old ones stay, dimmed
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <section>
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Subscribers now</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile
                label="Subscribers"
                value={summary.subscribers.total.toLocaleString('en-IN')}
                sub={`${summary.subscribers.paying.toLocaleString('en-IN')} paying · ${summary.subscribers.in_trial.toLocaleString('en-IN')} on free trial`}
                testId="tile-subscribers"
              />
              <Tile
                label="Monthly recurring revenue"
                value={rupeesShort(summary.mrr)}
                exact={formatRupees(summary.mrr)}
                sub="Paying subscribers at plan prices, before store fees"
                testId="tile-mrr"
              />
              <Tile
                label="Won't renew"
                value={summary.subscribers.ending.toLocaleString('en-IN')}
                sub="Cancelled; Pro until their period ends"
                testId="tile-ending"
              />
              <Tile
                label="Ended, last 30 days"
                value={summary.cancelled_last_30_days.toLocaleString('en-IN')}
                sub="Cancelled or expired"
                testId="tile-ended"
              />
            </div>
            {summary.subscribers.total > 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" data-testid="subscriber-split">
                {SELLERS.filter((s) => summary.subscribers.by_provider[s])
                  .map((s) => `${SELLER_LABEL[s]} ${summary.subscribers.by_provider[s]}`).join(' · ')}
                {Object.keys(summary.subscribers.by_plan).length > 0 && ' — '}
                {Object.entries(summary.subscribers.by_plan).sort(([a], [b]) => a.localeCompare(b))
                  .map(([plan, n]) => `${plan[0].toUpperCase()}${plan.slice(1)} ${n}`).join(' · ')}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Money</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile
                label="Net this month"
                value={rupeesShort(current?.net ?? 0)}
                exact={formatRupees(current?.net ?? 0)}
                sub={`${monthLabel(addMonths(thisMonth, -1), 'short')}: ${rupeesShort(previous?.net ?? 0)}`}
                testId="tile-net-month"
              />
              <Tile
                label="Paid this month"
                value={rupeesShort(current?.gross ?? 0)}
                exact={formatRupees(current?.gross ?? 0)}
                sub={`${plural(current?.charges ?? 0, 'charge')}${current?.refunds ? ` · ${formatRupees(current.refunds)} refunded` : ''}`}
                testId="tile-gross-month"
              />
              <Tile
                label="Store fees this month"
                value={rupeesShort(current?.fees ?? 0)}
                exact={formatRupees(current?.fees ?? 0)}
                sub="Estimated until the stores' payout reports"
                testId="tile-fees-month"
              />
              <Tile
                label="Net all time"
                value={rupeesShort(summary.all_time.net)}
                exact={formatRupees(summary.all_time.net)}
                sub={`${plural(summary.all_time.charges, 'charge')} · ${rupeesShort(summary.all_time.gross)} paid`}
                testId="tile-net-all"
              />
            </div>
          </section>

          {/* Net revenue by month */}
          <figure className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4" data-testid="finance-chart-card">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <figcaption>
                <div className="text-sm font-bold text-gray-900 dark:text-white">Net revenue by month</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  After store fees and refunds, in rupees · months in India time
                  {sellers.length === 1 && <> · all from {SELLER_LABEL[sellers[0]]}</>}
                </div>
              </figcaption>
              <Segmented
                label="Show as"
                value={view}
                options={[['chart', 'Chart'], ['table', 'Table']]}
                onChange={setView}
                small
              />
            </div>

            {!anyMoney ? (
              <div className="py-12 text-center text-sm text-gray-500 dark:text-gray-400" data-testid="finance-empty">
                No charges in these months{mode === 'test' ? '' : ' yet'}.
              </div>
            ) : view === 'chart' ? (
              <>
                {sellers.length > 1 && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2" aria-label="Sellers" data-testid="finance-legend">
                    {sellers.map((s) => (
                      <li key={s} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: SELLER_COLOR[s] }} />
                        {SELLER_LABEL[s]}
                      </li>
                    ))}
                  </ul>
                )}
                <RevenueChart
                  months={months}
                  sellers={sellers}
                  selected={month}
                  onSelect={(m) => setMonth((cur) => (cur === m ? null : m))}
                />
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Tap or click a month to list its charges below.</p>
              </>
            ) : (
              <MonthTable months={months} sellers={sellers} />
            )}

            {others.length > 0 && (
              <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400" data-testid="other-currencies">
                Not in the rupee figures, all time:{' '}
                {others.map(([currency, t]) => `${formatMoney(t.net, currency)} net from ${plural(t.charges, 'charge')} in ${currency}`).join('; ')}.
              </p>
            )}
          </figure>
        </div>
      )}

      <AdminPacksCard mode={mode} refreshed={refreshed} />

      {/* Every charge */}
      <section>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mr-auto">Charges</h2>
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            Seller
            <select
              aria-label="Seller"
              value={seller ?? ''}
              onChange={(e) => setSeller(isSeller(e.target.value) ? e.target.value : null)}
              className="rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-gray-900 dark:text-white"
            >
              <option value="">All sellers</option>
              {SELLERS.map((s) => <option key={s} value={s}>{SELLER_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            Month
            <select
              aria-label="Month"
              value={month ?? ''}
              onChange={(e) => setMonth(e.target.value || null)}
              className="rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-xs text-gray-900 dark:text-white"
            >
              <option value="">All {span} months</option>
              {Array.from({ length: span }, (_, i) => addMonths(thisMonth, -i)).map((m) => (
                <option key={m} value={m}>{monthLabel(m, 'long')}</option>
              ))}
            </select>
          </label>
          <button
            onClick={exportCsv}
            disabled={exporting || (!charges.length && !chargesLoading)}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        {summary && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400" data-testid="charges-totals">
            In rupees{month ? `, ${monthLabel(month, 'long')}` : ''}{seller ? `, ${SELLER_LABEL[seller]}` : ''}:{' '}
            {plural(listed.charges, 'charge')} · {formatRupees(listed.gross)} paid · {formatRupees(listed.fees)} store fees
            {listed.refunds > 0 && <> · {formatRupees(listed.refunds)} refunded</>} · <strong className="text-gray-700 dark:text-gray-200">{formatRupees(listed.net)} net</strong>
          </p>
        )}

        <div className={`bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 overflow-x-auto transition-opacity ${chargesLoading && charges.length ? 'opacity-60' : ''}`}>
          {!charges.length ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400" data-testid="charges-empty">
              {chargesLoading ? 'Loading…' : 'No charges here.'}
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-xs" data-testid="charges-table">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-700">
                  <th className="px-3 py-2 font-bold">Date (India)</th>
                  <th className="px-3 py-2 font-bold">Customer</th>
                  <th className="px-3 py-2 font-bold">Seller</th>
                  <th className="px-3 py-2 font-bold">Plan</th>
                  <th className="px-3 py-2 font-bold">Order</th>
                  <th className="px-3 py-2 font-bold text-right">Amount</th>
                  <th className="px-3 py-2 font-bold text-right">Fee</th>
                  <th className="px-3 py-2 font-bold text-right">Refunded</th>
                  <th className="px-3 py-2 font-bold text-right">Net</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {charges.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0 border-gray-100 dark:border-zinc-700/50 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{indiaTime(c.paid_at)}</td>
                    <td className="px-3 py-2 max-w-[200px]">
                      {c.user_id ? (
                        <>
                          <div className="font-semibold text-gray-900 dark:text-white truncate">{c.user_name || 'No name'}</div>
                          <div className="text-gray-500 dark:text-gray-400 truncate">{c.user_email}</div>
                        </>
                      ) : (
                        <span className="italic text-gray-500 dark:text-gray-400">Deleted account</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                      <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle"
                        style={{ background: isSeller(c.provider) ? SELLER_COLOR[c.provider] : 'transparent' }} />
                      {isSeller(c.provider) ? SELLER_LABEL[c.provider] : c.provider}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">{c.plan_id ? chargeName(null, c.plan_id) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400 block max-w-[150px] truncate" title={c.order_id ?? ''}>
                        {c.order_id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-900 dark:text-white">{formatMoney(c.amount, c.currency)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {c.fee_amount === null ? '—' : formatMoney(c.fee_amount, c.currency)}
                      {c.fee_amount !== null && c.fee_estimated && <span className="text-gray-500 dark:text-gray-400" title="Estimated until the store's payout report"> est.</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {c.refunded_amount > 0 ? formatMoney(c.refunded_amount, c.currency) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-gray-900 dark:text-white">{formatMoney(c.net_amount, c.currency)}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusBadge charge={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {more && (
          <button
            onClick={showMore}
            disabled={chargesLoading}
            className="mt-3 w-full py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            {chargesLoading ? 'Loading…' : 'Show more'}
          </button>
        )}
      </section>
    </div>
  );
};

// ---- Pieces ------------------------------------------------------------------------------

// T comes from `value` alone, so onChange can be the state's own setter
function Segmented<T extends string | number>({ label, value, options, onChange, small }: {
  label: string;
  value: T;
  options: [NoInfer<T>, string][];
  onChange: (value: NoInfer<T>) => void;
  small?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-0.5">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className={`${small ? 'px-2 py-1' : 'px-3 py-1.5'} rounded text-xs font-semibold transition-colors ${
            v === value
              ? 'bg-gray-900 text-white dark:bg-white dark:text-zinc-900'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

const Tile: React.FC<{ label: string; value: string; exact?: string; sub?: string; testId?: string }> = ({ label, value, exact, sub, testId }) => (
  <div className="rounded-lg p-4 border bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700" data-testid={testId}>
    <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white" title={exact && exact !== value ? exact : undefined}>{value}</div>
    {sub && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

function StatusBadge({ charge }: { charge: Charge }) {
  const label = chargeStatus(charge);
  const tone = label === 'Paid'
    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
    : label === 'Failed'
      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      : /refund/i.test(label)
        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${tone}`}>
      {label}{charge.mode === 'test' ? ' · test' : ''}
    </span>
  );
}

// The chart's numbers as a table, newest month first
function MonthTable({ months, sellers }: { months: FinanceMonth[]; sellers: Seller[] }) {
  const total = months.reduce((sum, m) => addTotals(sum, m), NO_TOTALS);
  const cells = 'px-3 py-2 text-right whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs" data-testid="finance-month-table">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-700">
            <th className="px-3 py-2 text-left font-bold">Month</th>
            {sellers.length > 1 && sellers.map((s) => <th key={s} className={`${cells} font-bold`}>{SELLER_LABEL[s]} net</th>)}
            <th className={`${cells} font-bold`}>Net</th>
            <th className={`${cells} font-bold`}>Paid</th>
            <th className={`${cells} font-bold`}>Refunded</th>
            <th className={`${cells} font-bold`}>Store fees</th>
            <th className={`${cells} font-bold`}>Charges</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
          {[...months].reverse().map((m) => (
            <tr key={m.month} className="border-b border-gray-100 dark:border-zinc-700/50 text-gray-700 dark:text-gray-200">
              <td className="px-3 py-2 whitespace-nowrap">{monthLabel(m.month, 'long')}</td>
              {sellers.length > 1 && sellers.map((s) => <td key={s} className={cells}>{formatRupees(m.by_provider[s]?.net ?? 0)}</td>)}
              <td className={`${cells} font-semibold text-gray-900 dark:text-white`}>{formatRupees(m.net)}</td>
              <td className={cells}>{formatRupees(m.gross)}</td>
              <td className={cells}>{formatRupees(m.refunds)}</td>
              <td className={cells}>{formatRupees(m.fees)}</td>
              <td className={cells}>{m.charges.toLocaleString('en-IN')}</td>
            </tr>
          ))}
          <tr className="font-bold text-gray-900 dark:text-white">
            <td className="px-3 py-2">Total</td>
            {sellers.length > 1 && sellers.map((s) => (
              <td key={s} className={cells}>{formatRupees(months.reduce((sum, m) => sum + (m.by_provider[s]?.net ?? 0), 0))}</td>
            ))}
            <td className={cells}>{formatRupees(total.net)}</td>
            <td className={cells}>{formatRupees(total.gross)}</td>
            <td className={cells}>{formatRupees(total.refunds)}</td>
            <td className={cells}>{formatRupees(total.fees)}</td>
            <td className={cells}>{total.charges.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default AdminFinanceTab;
