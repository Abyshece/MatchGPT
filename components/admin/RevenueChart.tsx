import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatRupees } from '../../lib/billingService';
import {
  SELLERS, SELLER_LABEL, monthLabel, rupeesCompact, type FinanceMonth, type Seller,
} from '../../lib/financeService';

// ============================================================================
// RevenueChart: net revenue by month, stacked by seller
//
// One column per month (India time); its segments are the sellers, always in
// the same order and colours (slots 1–2 of a palette checked for colour
// blindness against these cards in light and dark: Google Play blue, App
// Store orange). Hover, tap or arrow-key to a month for its
// figures; clicking it (or Enter) lists that month's charges. The table view
// shows every number in the chart.
// ============================================================================

export const SELLER_COLOR: Record<Seller, string> = {
  google_play: 'var(--viz-s1)',
  app_store: 'var(--viz-s2)',
};

// The chart's colours, one set per theme (the app's dark mode is the "dark" class)
export const FINANCE_VIZ_CSS = `
.fin-viz {
  --viz-s1: #2a78d6; --viz-s2: #eb6834;
  --viz-grid: #e5e7eb; --viz-base: #d1d5db; --viz-axis: #6b7280; --viz-ink: #111827;
  --viz-wash: rgba(17, 24, 39, 0.04); --viz-wash-strong: rgba(17, 24, 39, 0.08); --viz-focus: #3b82f6;
}
.dark .fin-viz {
  --viz-s1: #3987e5; --viz-s2: #d95926;
  --viz-grid: #3f3f46; --viz-base: #52525b; --viz-axis: #a1a1aa; --viz-ink: #ffffff;
  --viz-wash: rgba(255, 255, 255, 0.05); --viz-wash-strong: rgba(255, 255, 255, 0.1); --viz-focus: #60a5fa;
}
.fin-viz svg:focus { outline: none; }
.fin-viz svg:focus-visible { outline: 2px solid var(--viz-focus); outline-offset: 2px; border-radius: 6px; }
`;

const TOP = 22;      // room for the value on a column's cap
const PLOT_H = 200;
const AXIS_H = 34;   // month names, and the year under January
const HEIGHT = TOP + PLOT_H + AXIS_H;
const LABEL_FONT = 11;

interface Segment { seller: Seller; value: number; from: number; to: number }
interface Column { month: FinanceMonth; segments: Segment[]; up: number; down: number; total: number }

function niceStep(span: number): number {
  const raw = Math.max(span / 4, 100);  // at least ₹1
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const textWidth = (text: string) => text.length * LABEL_FONT * 0.62;

// A bar with rounded corners at the top (rt) or the bottom (rb) only
function barPath(x: number, top: number, w: number, h: number, rt: number, rb: number): string {
  rt = Math.min(rt, h, w / 2);
  rb = Math.min(rb, h, w / 2);
  return `M${x},${top + rt}`
    + (rt ? `a${rt},${rt} 0 0 1 ${rt},${-rt}` : '')
    + `h${w - 2 * rt}`
    + (rt ? `a${rt},${rt} 0 0 1 ${rt},${rt}` : '')
    + `v${h - rt - rb}`
    + (rb ? `a${rb},${rb} 0 0 1 ${-rb},${rb}` : '')
    + `h${-(w - 2 * rb)}`
    + (rb ? `a${rb},${rb} 0 0 1 ${-rb},${-rb}` : '')
    + 'Z';
}

/** What a month comes to, for its tooltip and for screen readers. */
export function monthSummary(m: FinanceMonth): string {
  const parts = SELLERS.filter((s) => m.by_provider[s])
    .map((s) => `${SELLER_LABEL[s]} ${formatRupees(m.by_provider[s]!.net)}`);
  return `${monthLabel(m.month, 'long')}: ${formatRupees(m.net)} net${parts.length > 1 ? ` (${parts.join(', ')})` : ''}; `
    + `${formatRupees(m.gross)} paid, ${formatRupees(m.fees)} store fees, ${formatRupees(m.refunds)} refunded; `
    + `${m.charges} ${m.charges === 1 ? 'charge' : 'charges'}.`;
}

interface RevenueChartProps {
  months: FinanceMonth[];   // oldest first
  sellers: Seller[];        // those with money in these months, in SELLERS order
  selected: string | null;  // the month the charges list shows
  onSelect: (month: string) => void;
}

const RevenueChart: React.FC<RevenueChartProps> = ({ months, sellers, selected, onSelect }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // New months (another span, or live vs test): nothing is under the pointer yet
  useEffect(() => setActive(null), [months]);

  const columns: Column[] = useMemo(() => months.map((month) => {
    let up = 0;
    let down = 0;
    const segments: Segment[] = [];
    for (const seller of SELLERS) {
      const value = month.by_provider[seller]?.net ?? 0;
      if (value > 0) { segments.push({ seller, value, from: up, to: up + value }); up += value; }
      if (value < 0) { segments.push({ seller, value, from: down, to: down + value }); down += value; }
    }
    return { month, segments, up, down, total: up + down };
  }), [months]);

  const maxUp = Math.max(0, ...columns.map((c) => c.up));
  const minDown = Math.min(0, ...columns.map((c) => c.down));
  const step = niceStep(maxUp - minDown);
  const top = Math.max(step, Math.ceil(maxUp / step) * step);
  const bottom = Math.floor(minDown / step) * step;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);

  const left = Math.ceil(Math.max(...ticks.map((t) => textWidth(rupeesCompact(t))))) + 10;
  const plotW = Math.max(0, width - left - 4);
  const band = columns.length ? plotW / columns.length : 0;
  const barW = Math.max(4, Math.min(24, band * 0.6));
  const y = (v: number) => TOP + ((top - v) / (top - bottom)) * PLOT_H;
  const zero = y(0);

  // Month names: as many as fit, counted back from this month
  const every = Math.max(1, Math.ceil(34 / Math.max(band, 1)));
  const named = (i: number) => (columns.length - 1 - i) % every === 0;
  const firstNamed = columns.findIndex((_, i) => named(i));

  // The total on top of this month's column, and on the best month's if it's elsewhere and there's room
  const last = columns.length - 1;
  const best = columns.reduce((b, c, i) => (c.total > columns[b].total ? i : b), Math.max(0, last));
  const capLabels = (columns.length ? [last, best] : [])
    .filter((i, k, all) => all.indexOf(i) === k && columns[i].total !== 0)
    .map((i) => ({ i, text: rupeesCompact(columns[i].total), x: left + band * (i + 0.5) }))
    .filter((label, k, all) => k === 0 || Math.abs(label.x - all[0].x) > (textWidth(label.text) + textWidth(all[0].text)) / 2 + 8);

  const indexAt = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || !band) return null;
    const i = Math.floor((clientX - rect.left - left) / band);
    return i >= 0 && i < columns.length ? i : null;
  };

  // The figures sit beside the month, on the side with more room
  const shown = active !== null ? columns[active] ?? null : null;
  const tipW = 208;
  const colX = left + band * ((active ?? 0) + 0.5);
  const tipX = colX > width / 2
    ? Math.max(0, colX - band / 2 - 6 - tipW)
    : Math.max(0, Math.min(width - tipW, colX + band / 2 + 6));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const from = active ?? last;
    const go = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[e.key];
    if (go !== undefined) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, go)));
    } else if ((e.key === 'Enter' || e.key === ' ') && shown) {
      e.preventDefault();
      onSelect(shown.month.month);
    }
  };

  return (
    <div ref={wrap} className="relative select-none" style={{ height: HEIGHT }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="group"
          aria-roledescription="chart"
          tabIndex={0}
          aria-label="Net revenue by month. Use the left and right arrow keys to read each month; Enter lists its charges."
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? (selected ? Math.max(0, months.findIndex((m) => m.month === selected)) : last))}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(indexAt(e.clientX))}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
          onClick={(e) => {
            const i = indexAt(e.clientX);
            if (i !== null) { setActive(i); onSelect(columns[i].month.month); }
          }}
          style={{ touchAction: 'pan-y', cursor: 'pointer' }}
        >
          {/* The picked month, and the one under the pointer */}
          {columns.map((c, i) => (c.month.month === selected || i === active) && (
            <rect
              key={`wash-${c.month.month}`}
              x={left + band * i + 1}
              y={TOP - 4}
              width={Math.max(0, band - 2)}
              height={PLOT_H + 8}
              rx={4}
              style={{ fill: c.month.month === selected ? 'var(--viz-wash-strong)' : 'var(--viz-wash)' }}
            />
          ))}

          {/* Grid and the y-axis */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} strokeWidth={1}
                style={{ stroke: t === 0 ? 'var(--viz-base)' : 'var(--viz-grid)' }} shapeRendering="crispEdges" />
              <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={LABEL_FONT}
                style={{ fill: 'var(--viz-axis)', fontVariantNumeric: 'tabular-nums' }}>
                {rupeesCompact(t)}
              </text>
            </g>
          ))}

          {/* Columns: 2px gaps between sellers, rounded only at the far end */}
          {columns.map((c, i) => {
            const x = left + band * (i + 0.5) - barW / 2;
            const ups = c.segments.filter((s) => s.value > 0);
            const downs = c.segments.filter((s) => s.value < 0);
            return (
              <g key={c.month.month}>
                {ups.map((s, k) => {
                  const capEnd = k === ups.length - 1;
                  const segTop = y(s.to) + (capEnd ? 0 : 1);
                  const segBottom = y(s.from) - (k === 0 ? 0 : 1);
                  const h = segBottom - segTop;
                  return h > 0 && (
                    <path key={s.seller} d={barPath(x, segTop, barW, h, capEnd ? 4 : 0, 0)} style={{ fill: SELLER_COLOR[s.seller] }} />
                  );
                })}
                {downs.map((s, k) => {
                  const capEnd = k === downs.length - 1;
                  const segTop = y(s.from) + (k === 0 ? 0 : 1);
                  const segBottom = y(s.to) - (capEnd ? 0 : 1);
                  const h = segBottom - segTop;
                  return h > 0 && (
                    <path key={s.seller} d={barPath(x, segTop, barW, h, 0, capEnd ? 4 : 0)} style={{ fill: SELLER_COLOR[s.seller] }} />
                  );
                })}
              </g>
            );
          })}

          {/* Totals on a cap or two */}
          {capLabels.map(({ i, text, x }) => (
            <text
              key={`cap-${i}`}
              x={Math.min(Math.max(x, left + textWidth(text) / 2), left + plotW - textWidth(text) / 2)}
              y={columns[i].total >= 0 ? y(columns[i].up) - 6 : y(columns[i].down) + 14}
              textAnchor="middle"
              fontSize={LABEL_FONT}
              fontWeight={600}
              style={{ fill: 'var(--viz-ink)' }}
            >
              {text}
            </text>
          ))}

          {/* Months */}
          {columns.map((c, i) => named(i) && (
            <text key={`m-${c.month.month}`} x={left + band * (i + 0.5)} y={TOP + PLOT_H + 15} textAnchor="middle"
              fontSize={LABEL_FONT} fontWeight={c.month.month === selected ? 700 : 400}
              style={{ fill: c.month.month === selected ? 'var(--viz-ink)' : 'var(--viz-axis)' }}>
              {monthLabel(c.month.month, 'short')}
              {(i === firstNamed || c.month.month.endsWith('-01')) && (
                <tspan x={left + band * (i + 0.5)} dy={13}>{c.month.month.slice(0, 4)}</tspan>
              )}
            </text>
          ))}
          <line x1={left} x2={left + plotW} y1={zero} y2={zero} strokeWidth={1} style={{ stroke: 'var(--viz-base)' }} shapeRendering="crispEdges" />
        </svg>
      )}

      {/* The month's figures (the same words go to screen readers) */}
      <div aria-live="polite" className="sr-only">{shown ? monthSummary(shown.month) : ''}</div>
      {shown && (
        <div
          aria-hidden="true"
          data-testid="finance-tooltip"
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg px-3 py-2.5 text-xs"
          style={{ left: tipX, top: TOP, width: tipW }}
        >
          <div className="text-gray-500 dark:text-zinc-400">{monthLabel(shown.month.month, 'long')}</div>
          <div className="text-base font-bold text-gray-900 dark:text-white">
            {formatRupees(shown.month.net)} <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">net</span>
          </div>
          {sellers.length > 1 && (
            <ul className="mt-1.5 space-y-1">
              {sellers.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: SELLER_COLOR[s] }} />
                  <span className="font-semibold text-gray-900 dark:text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRupees(shown.month.by_provider[s]?.net ?? 0)}
                  </span>
                  <span className="text-gray-500 dark:text-zinc-400">{SELLER_LABEL[s]}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-400 space-y-0.5"
            style={{ fontVariantNumeric: 'tabular-nums' }}>
            <div><span className="font-semibold text-gray-700 dark:text-gray-200">{formatRupees(shown.month.gross)}</span> paid</div>
            <div><span className="font-semibold text-gray-700 dark:text-gray-200">{formatRupees(shown.month.fees)}</span> store fees</div>
            {shown.month.refunds > 0 && (
              <div><span className="font-semibold text-gray-700 dark:text-gray-200">{formatRupees(shown.month.refunds)}</span> refunded</div>
            )}
            <div>
              {shown.month.charges} {shown.month.charges === 1 ? 'charge' : 'charges'}
              {shown.month.month !== selected && shown.month.charges > 0 && <> · click to list them</>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RevenueChart;
