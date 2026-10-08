import React, { useEffect, useRef, useState } from 'react';
import { SORTS, levelLabel, type LevelId, type MatchLevel, type SortId } from '../lib/searchResults';

// ============================================================================
// ResultsSortMenu — the Sort button above Find Match's results. Opens a small
// panel: the order (best match first, lowest first, online or verified first,
// youngest or oldest first) and the match level to show (the top, middle or
// lower third of the results, or any), with the scores and how many each has.
// ============================================================================

interface ResultsSortMenuProps {
  sort: SortId;
  level: LevelId;
  levels: MatchLevel[];
  onSort: (sort: SortId) => void;
  onLevel: (level: LevelId) => void;
}

const SortIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
  </svg>
);

const optionClass = (on: boolean) => `w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
  on
    ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-semibold'
    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800/60'
}`;

const ResultsSortMenu: React.FC<ResultsSortMenuProps> = ({ sort, level, levels, onSort, onLevel }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Closes on a tap outside it, or Escape
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const current = SORTS.find((s) => s.id === sort) ?? SORTS[0];

  return (
    <div ref={box} className="relative flex-none">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="sort-button"
        className={`flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
          sort !== 'best' || level !== 'all'
            ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
            : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700'
        }`}
      >
        <SortIcon />
        {/* The level when one is picked (the count beside it says how many),
            otherwise the order; the menu shows both */}
        <span>{level !== 'all' ? levelLabel(level) : current.short}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sort results"
          data-testid="sort-menu"
          className="absolute right-0 top-full mt-2 z-30 w-64 max-w-[calc(100vw-2rem)] p-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-xl animate-fade-in"
        >
          <p className="px-3 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400" id="sort-by">Sort by</p>
          <div role="radiogroup" aria-labelledby="sort-by">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === sort}
                onClick={() => onSort(s.id)}
                className={optionClass(s.id === sort)}
              >
                {s.label}
                {s.id === sort && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>

          <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-zinc-800 mt-2" id="match-level">Match level</p>
          <div role="radiogroup" aria-labelledby="match-level">
            {levels.map((l) => {
              const none = l.id !== 'all' && l.count === 0;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={l.id === level}
                  disabled={none}
                  onClick={() => onLevel(l.id)}
                  className={`${optionClass(l.id === level)} disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed`}
                >
                  <span className="flex flex-col">
                    {l.label}
                    {l.range && <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">{l.range} match</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {l.count}
                    {l.id === level && <span aria-hidden="true" className="text-gray-900 dark:text-white">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); button.current?.focus(); }}
            className="mt-2 w-full py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

export default ResultsSortMenu;
