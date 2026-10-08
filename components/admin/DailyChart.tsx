import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FINANCE_VIZ_CSS } from './RevenueChart';

// ============================================================================
// DailyChart: one number a day as columns (Growth: sign-ups, active members;
// Search insights: searches). One series, so one colour (the finance chart's
// first slot, checked for colour blindness in light and dark) and no legend:
// the title names it. Hover, tap or arrow-key to a day for its number; the
// same words go to screen readers, and "Show the numbers" lists every day.
// ============================================================================

const TOP = 18;
const PLOT_H = 150;
const AXIS_H = 22;
const HEIGHT = TOP + PLOT_H + AXIS_H;
const FONT = 11;

const dayLabel = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });

function niceStep(max: number): number {
  const raw = Math.max(max / 4, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
}

// A column with its top corners rounded (4px), its foot on the baseline
function column(x: number, top: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`;
}

export interface DailyPoint { day: string; value: number }

const DailyChart: React.FC<{ title: string; unit: [string, string]; points: DailyPoint[]; testId?: string }> = ({ title, unit, points, testId }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setActive(null), [points]);

  const words = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? unit[0] : unit[1]}`;
  const max = Math.max(0, ...points.map((p) => p.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = useMemo(() => { const t: number[] = []; for (let v = 0; v <= top; v += step) t.push(v); return t; }, [top, step]);
  const left = Math.max(...ticks.map((t) => String(t).length)) * FONT * 0.62 + 10;
  const plotW = Math.max(0, width - left - 4);
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.max(1, band - 2);  // a 2px gap between days
  const y = (v: number) => TOP + ((top - v) / top) * PLOT_H;
  const every = Math.max(1, Math.ceil(52 / Math.max(band, 1)));
  const last = points.length - 1;
  const total = points.reduce((s, p) => s + p.value, 0);

  const indexAt = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || !band) return null;
    const i = Math.floor((clientX - rect.left - left) / band);
    return i >= 0 && i < points.length ? i : null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const from = active ?? last;
    const go = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[e.key];
    if (go !== undefined) {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, go)));
    }
  };

  const shown = active !== null ? points[active] : null;
  const tipW = 160;
  const colX = left + band * ((active ?? 0) + 0.5);
  const tipX = colX > width / 2 ? Math.max(0, colX - band / 2 - 6 - tipW) : Math.min(width - tipW, colX + band / 2 + 6);

  return (
    <section className="fin-viz rounded-lg border border-gray-200 dark:border-zinc-800 p-4" data-testid={testId}>
      <style>{FINANCE_VIZ_CSS}</style>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        <span className="text-xs text-gray-500 dark:text-zinc-400 tabular-nums">{words(total)} in {points.length} days</span>
      </div>
      <div ref={wrap} className="relative select-none" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            aria-roledescription="chart"
            tabIndex={0}
            aria-label={`${title}, ${words(total)} in ${points.length} days. Use the left and right arrow keys to read each day.`}
            onKeyDown={onKeyDown}
            onFocus={() => setActive((a) => a ?? last)}
            onBlur={() => setActive(null)}
            onPointerMove={(e) => setActive(indexAt(e.clientX))}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setActive(null); }}
            onClick={(e) => setActive(indexAt(e.clientX))}
            style={{ touchAction: 'pan-y' }}
          >
            {active !== null && (
              <rect x={left + band * active} y={TOP - 4} width={band} height={PLOT_H + 8} rx={3} style={{ fill: 'var(--viz-wash)' }} />
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} strokeWidth={1} shapeRendering="crispEdges"
                  style={{ stroke: t === 0 ? 'var(--viz-base)' : 'var(--viz-grid)' }} />
                <text x={left - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={FONT}
                  style={{ fill: 'var(--viz-axis)', fontVariantNumeric: 'tabular-nums' }}>{t.toLocaleString('en-IN')}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const h = (p.value / top) * PLOT_H;
              return h > 0 && <path key={p.day} d={column(left + band * i + 1, y(p.value), barW, h)} style={{ fill: 'var(--viz-s1)' }} />;
            })}
            {points.map((p, i) => (last - i) % every === 0 && (
              <text key={`d-${p.day}`} x={left + band * (i + 0.5)} y={TOP + PLOT_H + 15} textAnchor="middle" fontSize={FONT}
                style={{ fill: 'var(--viz-axis)' }}>{dayLabel(p.day)}</text>
            ))}
          </svg>
        )}
        <div aria-live="polite" className="sr-only">{shown ? `${dayLabel(shown.day, true)}: ${words(shown.value)}` : ''}</div>
        {shown && (
          <div aria-hidden="true" data-testid="daily-tooltip"
            className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg px-3 py-2 text-xs"
            style={{ left: tipX, top: TOP, width: tipW }}>
            <div className="text-gray-500 dark:text-zinc-400">{dayLabel(shown.day, true)}</div>
            <div className="text-base font-bold text-gray-900 dark:text-white tabular-nums">{words(shown.value)}</div>
          </div>
        )}
      </div>
      <button type="button" onClick={() => setTable((t) => !t)} aria-expanded={table}
        className="mt-2 text-xs text-gray-600 dark:text-zinc-300 underline underline-offset-2">
        {table ? 'Hide the numbers' : 'Show the numbers'}
      </button>
      {table && (
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-500 dark:text-zinc-400"><th scope="col" className="text-left font-medium py-1">Day</th><th scope="col" className="text-right font-medium py-1">{unit[1]}</th></tr></thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-gray-100 dark:border-zinc-800">
                  <th scope="row" className="text-left font-normal py-1">{dayLabel(p.day, true)}</th>
                  <td className="text-right tabular-nums py-1">{p.value.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default DailyChart;
