import React, { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OptionGroup } from '../lib/matrimonyOptions';

// ============================================================================
// Inputs for profile answers (Phase 12), used in onboarding and My Profile:
//
//   ChoiceField       one answer from a list you can type into to narrow down
//                     (mother tongue, caste, degree, country...). Short lists
//                     without typed answers use the browser's own select,
//                     which works best on phones.
//   ChipsField        several answers, tapped on and off (hobbies, languages),
//                     saved as "Reading, Cricket, Cooking"
//   DateOfBirthField  day, month and year
//   PillPicker        a short list as pills: one tap picks (My Profile saves it
//                     at once, like Bumble)
//   SheetPicker       a long list in a sheet that slides up from the bottom of
//                     the screen, like an iPhone's, with a search box; a tap
//                     picks and closes it
// ============================================================================

/** Short enough to show as pills (otherwise a sheet with a search box) */
export const PILL_LIMIT = 14;

const inputStyles = {
  form: 'w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all',
  compact: 'w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none text-gray-900 dark:text-gray-100',
};

// Letters and digits only, so "btech" finds "B.E/B.Tech" and "b.com" finds "B.Com".
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function matches(option: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (option.toLowerCase().includes(q)) return true;
  const c = compact(q);
  return c.length > 0 && compact(option).includes(c);
}

export function splitList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (value ?? '').split(/[,;]/)) {
    const item = part.trim();
    if (item && !seen.has(item.toLowerCase())) {
      seen.add(item.toLowerCase());
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ChoiceField
// ---------------------------------------------------------------------------

interface ChoiceFieldProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  groups?: OptionGroup[];
  allowCustom?: boolean;   // keep a typed answer that isn't in the list
  placeholder?: string;
  clearLabel?: string;     // the entry that clears the answer
  size?: 'form' | 'compact';
  autoFocus?: boolean;
  ariaLabel?: string;
}

const MAX_SHOWN = 120;

export const ChoiceField: React.FC<ChoiceFieldProps> = ({
  value, onChange, options, groups, allowCustom = false, placeholder = 'Select',
  clearLabel = 'Skip / prefer not to say', size = 'form', autoFocus = false, ariaLabel,
}) => {
  const allGroups = useMemo<OptionGroup[]>(
    () => groups ?? [{ label: '', options: options ?? [] }],
    [groups, options],
  );
  const total = allGroups.reduce((n, g) => n + g.options.length, 0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<string | null>(null);  // null: not typing
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // What the list shows for the current query: a typed answer first (when
  // allowed and new), then the matching options by group.
  const { entries, hidden } = useMemo(() => {
    const q = query ?? '';
    const out: { kind: 'header' | 'option' | 'custom' | 'clear'; text: string }[] = [];
    if (value && !q) out.push({ kind: 'clear', text: clearLabel });
    const typed = q.trim();
    const exact = typed && allGroups.some((g) => g.options.some((o) => o.toLowerCase() === typed.toLowerCase()));
    if (allowCustom && typed && !exact) out.push({ kind: 'custom', text: typed });
    let shown = 0;
    let skipped = 0;
    for (const g of allGroups) {
      const hits = g.options.filter((o) => matches(o, q));
      if (hits.length === 0) continue;
      if (shown >= MAX_SHOWN) { skipped += hits.length; continue; }
      if (g.label) out.push({ kind: 'header', text: g.label });
      for (const o of hits) {
        if (shown >= MAX_SHOWN) { skipped++; continue; }
        out.push({ kind: 'option', text: o });
        shown++;
      }
    }
    return { entries: out, hidden: skipped };
  }, [query, allGroups, allowCustom, value, clearLabel]);

  const choosable = entries.filter((e) => e.kind !== 'header');

  // Short fixed lists: the browser's own select
  if (!allowCustom && total <= 15) {
    const known = allGroups.some((g) => g.options.includes(value));
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputStyles[size]} cursor-pointer`}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      >
        <option value="">{value ? clearLabel : placeholder}</option>
        {value && !known && <option value={value}>{value}</option>}
        {allGroups.map((g) => (g.label
          ? <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o} value={o}>{o}</option>)}</optgroup>
          : g.options.map((o) => <option key={o} value={o}>{o}</option>)))}
      </select>
    );
  }

  const choose = (entry: { kind: string; text: string } | undefined) => {
    if (!entry) return;
    onChange(entry.kind === 'clear' ? '' : entry.text);
    setQuery(null);
    setOpen(false);
  };

  // Leaving the field: a typed answer is kept when allowed (matched to the
  // list's spelling when it's there); otherwise the field goes back to its answer.
  const commitTyped = () => {
    if (query === null) return;
    const typed = query.trim();
    if (allowCustom && typed && typed !== value) {
      const listed = allGroups.flatMap((g) => g.options).find((o) => o.toLowerCase() === typed.toLowerCase());
      onChange(listed ?? typed);
    }
    setQuery(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, choosable.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && choosable.length > 0) {
        e.preventDefault();
        choose(choosable[Math.min(active, choosable.length - 1)]);
      }
    } else if (e.key === 'Escape') {
      setQuery(null);
      setOpen(false);
    }
  };

  let optionIndex = -1;
  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={query ?? value}
        placeholder={value ? undefined : placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onBlur={() => { commitTyped(); setOpen(false); }}
        onKeyDown={onKeyDown}
        className={`${inputStyles[size]} pr-8`}
        autoComplete="off"
      />
      {value && query === null && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm leading-none px-1"
          aria-label="Clear"
          tabIndex={-1}
        >
          ×
        </button>
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg py-1 text-sm"
        >
          {entries.length === 0 && (
            <li className="px-3 py-2 text-gray-500 dark:text-gray-400">No match{allowCustom ? '' : ' in the list'}</li>
          )}
          {entries.map((entry, i) => {
            if (entry.kind === 'header') {
              return (
                <li key={`h-${entry.text}-${i}`} className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {entry.text}
                </li>
              );
            }
            optionIndex++;
            const isActive = optionIndex === active;
            const index = optionIndex;
            return (
              <li
                key={`${entry.kind}-${entry.text}-${i}`}
                role="option"
                aria-selected={entry.kind === 'option' && entry.text === value}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(entry)}
                className={`px-3 py-1.5 cursor-pointer ${isActive ? 'bg-gray-100 dark:bg-zinc-800' : ''} ${
                  entry.kind === 'option' && entry.text === value ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'
                } ${entry.kind === 'clear' ? 'text-gray-500 dark:text-gray-400 italic' : ''}`}
              >
                {entry.kind === 'custom' ? <>Use “{entry.text}”</> : entry.text}
              </li>
            );
          })}
          {hidden > 0 && (
            <li className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">{hidden} more — keep typing to narrow down</li>
          )}
        </ul>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ChipsField
// ---------------------------------------------------------------------------

interface ChipsFieldProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  groups?: OptionGroup[];
  allowCustom?: boolean;
  max?: number;
}

export const ChipsField: React.FC<ChipsFieldProps> = ({
  value, onChange, options, groups, allowCustom = true, max = 20,
}) => {
  const allGroups = groups ?? [{ label: '', options: options ?? [] }];
  const listed = allGroups.flatMap((g) => g.options);
  const [typed, setTyped] = useState('');

  // Answers saved before (maybe in other letter case) line up with the list
  const selected = splitList(value).map((v) => listed.find((o) => o.toLowerCase() === v.toLowerCase()) ?? v);
  const isOn = (o: string) => selected.some((s) => s.toLowerCase() === o.toLowerCase());
  const own = selected.filter((s) => !listed.some((o) => o.toLowerCase() === s.toLowerCase()));
  const full = selected.length >= max;

  const save = (items: string[]) => onChange(items.join(', '));
  const toggle = (o: string) => {
    if (isOn(o)) save(selected.filter((s) => s.toLowerCase() !== o.toLowerCase()));
    else if (!full) save([...selected, o]);
  };
  const addTyped = () => {
    const item = typed.trim().replace(/[,;]/g, ' ').slice(0, 40);
    if (item && !isOn(item) && !full) save([...selected, item]);
    setTyped('');
  };

  const chip = (o: string, on: boolean) => (
    <button
      key={o}
      type="button"
      onClick={() => toggle(o)}
      aria-pressed={on}
      disabled={!on && full}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        on
          ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
          : 'bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-zinc-700 hover:border-gray-500 disabled:opacity-40'
      }`}
    >
      {o}{on && own.includes(o) ? ' ×' : ''}
    </button>
  );

  return (
    <div className="space-y-3 w-full">
      {own.length > 0 && <div className="flex flex-wrap gap-2">{own.map((o) => chip(o, true))}</div>}
      {allGroups.map((g) => (
        <div key={g.label || 'all'}>
          {g.label && <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">{g.label}</div>}
          <div className="flex flex-wrap gap-2">{g.options.map((o) => chip(o, isOn(o)))}</div>
        </div>
      ))}
      {allowCustom && (
        <div className="flex gap-2">
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }}
            placeholder={full ? `Up to ${max}` : 'Add your own'}
            disabled={full}
            className="flex-1 h-9 px-3 text-sm border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white"
          />
          <button
            type="button"
            onClick={addTyped}
            disabled={!typed.trim() || full}
            className="px-3 h-9 text-xs font-bold rounded-md border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-200 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DateOfBirthField: "YYYY-MM-DD", or "" until day, month and year are chosen
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ageFromDateOfBirth(dob: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age;
}

export function formatDateOfBirth(dob: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

export const DateOfBirthField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  size?: 'form' | 'compact';
}> = ({ value, onChange, size = 'form' }) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [parts, setParts] = useState({ d: m ? String(Number(m[3])) : '', mo: m ? String(Number(m[2])) : '', y: m ? m[1] : '' });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 83 }, (_, i) => String(thisYear - 18 - i));
  const daysIn = parts.y && parts.mo ? new Date(Number(parts.y), Number(parts.mo), 0).getDate() : 31;

  const update = (next: typeof parts) => {
    if (next.d && Number(next.d) > (next.y && next.mo ? new Date(Number(next.y), Number(next.mo), 0).getDate() : 31)) next.d = '';
    setParts(next);
    onChange(next.d && next.mo && next.y
      ? `${next.y}-${next.mo.padStart(2, '0')}-${next.d.padStart(2, '0')}`
      : '');
  };

  const cls = `${inputStyles[size]} cursor-pointer`;
  return (
    <div className="grid grid-cols-[1fr_1.3fr_1.3fr] gap-2 w-full">
      <select value={parts.d} onChange={(e) => update({ ...parts, d: e.target.value })} className={cls} aria-label="Day">
        <option value="">Day</option>
        {Array.from({ length: daysIn }, (_, i) => String(i + 1)).map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={parts.mo} onChange={(e) => update({ ...parts, mo: e.target.value })} className={cls} aria-label="Month">
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={String(i + 1)}>{name}</option>)}
      </select>
      <select value={parts.y} onChange={(e) => update({ ...parts, y: e.target.value })} className={cls} aria-label="Year">
        <option value="">Year</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PillPicker: one answer from a short list, tapped
// ---------------------------------------------------------------------------

export const PillPicker: React.FC<{
  value: string;
  options: string[];
  onPick: (value: string) => void;
  label: string;
  allowClear?: boolean;    // tapping the chosen one again clears it (else keeps it)
  busy?: boolean;
}> = ({ value, options, onPick, label, allowClear = false, busy = false }) => {
  // An answer given before that's no longer in the list still shows
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2 py-0.5" data-testid="pill-picker">
      {all.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={busy}
            onClick={() => onPick(on && allowClear ? '' : o)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
              on
                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white disabled:opacity-100'
                : 'bg-white dark:bg-zinc-900 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-zinc-700 hover:border-gray-500 dark:hover:border-zinc-500 disabled:opacity-50'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SheetPicker: one answer from a long list, in a sheet with a search box
// ---------------------------------------------------------------------------

interface SheetPickerProps {
  title: string;
  value: string;
  options?: string[];
  groups?: OptionGroup[];
  allowCustom?: boolean;   // a typed answer that isn't in the list can be used
  allowClear?: boolean;
  hint?: string;
  onPick: (value: string) => void;
  onClose: () => void;
}

export const SheetPicker: React.FC<SheetPickerProps> = ({
  title, value, options, groups, allowCustom = false, allowClear = false, hint, onPick, onClose,
}) => {
  const allGroups = useMemo<OptionGroup[]>(() => groups ?? [{ label: '', options: options ?? [] }], [groups, options]);
  const total = allGroups.reduce((n, g) => n + g.options.length, 0);
  const [query, setQuery] = useState('');
  const titleId = useId();
  const chosenRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchable = allowCustom || total > 10;

  const onEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', onKey);
    // The chosen answer in view; the search box ready where there's a keyboard
    // to type with (on a phone the keyboard would cover the list)
    chosenRef.current?.scrollIntoView({ block: 'center' });
    if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) searchRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const typed = query.trim();
  const shown = allGroups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => matches(o, query)) }))
    .filter((g) => g.options.length > 0);
  const exact = typed && allGroups.some((g) => g.options.some((o) => o.toLowerCase() === typed.toLowerCase()));
  const known = !value || allGroups.some((g) => g.options.includes(value));

  const row = (text: string, on: boolean, onClick: () => void, extra = '') => (
    <button
      key={`${extra}${text}`}
      ref={on ? chosenRef : undefined}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`w-full min-h-[46px] flex items-center justify-between gap-3 px-5 py-2.5 text-left text-[15px] border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/70 ${
        on ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'
      }`}
    >
      <span className="min-w-0 break-words">{text}</span>
      {on && <span aria-hidden="true" className="flex-none text-gray-900 dark:text-white">✓</span>}
    </button>
  );

  return createPortal(
    <div data-popup className="fixed inset-0 z-[600] flex items-end sm:items-center justify-center popup-backdrop sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="picker-sheet"
        className={`w-full sm:max-w-md ${searchable ? 'h-[85vh] sm:h-[min(640px,85vh)]' : 'max-h-[85vh] sm:max-h-[min(640px,85vh)]'} flex flex-col rounded-t-[22px] sm:rounded-[22px] bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-800 shadow-2xl overflow-hidden pb-[var(--safe-bottom)] sm:pb-0`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The grabber, the title and Done, as on an iPhone */}
        <div className="flex-none pt-2">
          <div aria-hidden="true" className="sm:hidden mx-auto w-10 h-1.5 rounded-full bg-gray-300 dark:bg-zinc-700" />
          <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-2">
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white px-1 py-1">
              Done
            </button>
          </div>
          {hint && <p className="px-5 pb-2 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
          {searchable && (
            <div className="px-4 pb-3">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const first = shown[0]?.options[0];
                  if (first) onPick(first);
                  else if (allowCustom && typed) onPick(typed);
                }}
                placeholder="Search"
                aria-label={`Search ${title.toLowerCase()}`}
                autoComplete="off"
                className="w-full h-10 px-3.5 rounded-xl bg-gray-100 dark:bg-zinc-800 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
              />
            </div>
          )}
        </div>

        <div role="radiogroup" aria-labelledby={titleId} className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-gray-100 dark:border-zinc-800">
          {allowClear && value && !typed && row('None (clear the answer)', false, () => onPick(''), 'clear:')}
          {value && !known && !typed && row(value, true, () => onClose(), 'own:')}
          {allowCustom && typed && !exact && row(`Use “${typed}”`, false, () => onPick(typed), 'custom:')}
          {shown.map((g) => (
            <div key={g.label || 'all'}>
              {g.label && (
                <div className="sticky top-0 z-10 px-5 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-zinc-950">
                  {g.label}
                </div>
              )}
              {g.options.map((o) => row(o, o === value, () => (o === value ? onClose() : onPick(o))))}
            </div>
          ))}
          {shown.length === 0 && !(allowCustom && typed) && (
            <p className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">Nothing matches “{typed}”.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
