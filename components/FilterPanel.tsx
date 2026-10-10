import React, { useState, useEffect } from 'react';
import { IconX, IconLock, IconZap } from '../constants';
import { ChoiceField } from './ProfileInputs';
import {
  CASTES, COUNTRIES, DIETS, EDUCATION_LEVELS, HEIGHTS, INDIAN_STATES, MANGLIK, MARITAL_STATUS, MOTHER_TONGUES,
  RELIGIONS,
} from '../lib/matrimonyOptions';
import type { FilterOptions } from '../types';
import { hasPreferences, preferenceSummary, type PartnerPreferences } from '../lib/partnerPreferences';
import { MANAGED_BY_OPTIONS } from '../lib/searchResults';

// ============================================================================
// FilterPanel
//
// Slide-out drawer from the right side. Free users see basic filters; Pro
// users see all filters with the lock icons removed.
// ============================================================================

interface FilterPanelProps {
  isOpen: boolean;
  initialFilters: FilterOptions;
  isPro: boolean;
  onApply: (filters: FilterOptions) => void;
  onClose: () => void;
  onUpgrade: () => void;
  /** The member's partner preferences (null: none yet), and a way to set them */
  preferences?: PartnerPreferences | null;
  onEditPreferences?: () => void;
}

// ---- helper components -----------------------------------------------------
// Outside FilterPanel, so typing in a field doesn't remount it.

const FilterRow = ({
  label, locked, onUpgrade, children,
}: { label: string; locked?: boolean; onUpgrade: () => void; children: React.ReactNode }) => (
  <div className={`py-3 ${locked ? 'opacity-60' : ''}`}>
    <div className="flex items-center justify-between mb-2">
      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        {label}
      </label>
      {locked && (
        <button
          onClick={onUpgrade}
          aria-label={`${label}: unlock with Shaadi24+`}
          className="flex items-center gap-1 text-[10px] font-bold text-gray-900 dark:text-white hover:underline"
        >
          <IconLock /> Shaadi24+
        </button>
      )}
    </div>
    <div className={locked ? 'pointer-events-none' : ''}>{children}</div>
  </div>
);

const selectClass = 'w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

const Select = ({
  value, onChange, options,
}: { value: string | undefined; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
  <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={selectClass}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

// "Any" plus the list, each answer as its own label
const anyOf = (list: string[]) => [{ value: '', label: 'Any' }, ...list.map((v) => ({ value: v, label: v }))];

const Toggle = ({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
      checked
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
        : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-zinc-600'
    }`}
  >
    <span className="text-sm">{label}</span>
    <div className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-zinc-600'}`}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
    </div>
  </button>
);

// Height list as cm values, for the height range
const HEIGHT_CM = HEIGHTS.map((label) => ({ label, cm: Number(/\((\d+) cm\)/.exec(label)?.[1]) }));

const FilterPanel: React.FC<FilterPanelProps> = ({
  isOpen, initialFilters, isPro, onApply, onClose, onUpgrade, preferences = null, onEditPreferences,
}) => {
  const [filters, setFilters] = useState<FilterOptions>(initialFilters);

  // Sync when re-opened
  useEffect(() => {
    if (isOpen) setFilters(initialFilters);
  }, [isOpen, initialFilters]);

  const update = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAll = () => {
    setFilters({
      isOnline: false,
      isVerified: false,
      isPremium: false,
    });
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const ageRange = filters.ageRange ?? [21, 45];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[200] popup-backdrop transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white dark:bg-zinc-900 z-[210] shadow-2xl border-l border-gray-200 dark:border-zinc-800 transition-transform overflow-hidden flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Filters</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Refine your search pool</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400"
          >
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100 dark:divide-zinc-800">
          {/* Partner preferences: what search starts from */}
          <div className="py-3" data-testid="filter-preferences">
            {hasPreferences(preferences) ? (
              <>
                <Toggle
                  checked={filters.usePreferences ?? false}
                  onChange={(v) => update('usePreferences', v)}
                  label="Use my partner preferences"
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {preferenceSummary(preferences).join(' · ')}
                  {!isPro && ' (age and place; the rest with Shaadi24+)'}
                  {onEditPreferences && (
                    <> · <button type="button" onClick={onEditPreferences} className="font-semibold text-gray-700 dark:text-gray-200 hover:underline">Edit</button></>
                  )}
                </p>
              </>
            ) : onEditPreferences && (
              <button
                type="button"
                onClick={onEditPreferences}
                className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-200 hover:border-gray-500"
              >
                <span className="font-semibold">Set your partner preferences</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Search starts from them, and Standouts follow them.</span>
              </button>
            )}
          </div>

          {/* Age range — always free */}
          <FilterRow label="Age range" onUpgrade={onUpgrade}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{ageRange[0]}</span>
              <div className="flex-1 px-2">
                <input
                  type="range"
                  min={18}
                  max={80}
                  value={ageRange[0]}
                  onChange={(e) => {
                    const v = Math.min(Number(e.target.value), ageRange[1] - 1);
                    update('ageRange', [v, ageRange[1]]);
                  }}
                  className="w-full"
                />
                <input
                  type="range"
                  min={18}
                  max={80}
                  value={ageRange[1]}
                  onChange={(e) => {
                    const v = Math.max(Number(e.target.value), ageRange[0] + 1);
                    update('ageRange', [ageRange[0], v]);
                  }}
                  className="w-full"
                />
              </div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{ageRange[1]}</span>
            </div>
          </FilterRow>

          {/* Where they live — always free */}
          <FilterRow label="Country" onUpgrade={onUpgrade}>
            <ChoiceField
              value={filters.country ?? ''}
              onChange={(v) => setFilters((prev) => ({ ...prev, country: v || undefined, state: undefined }))}
              groups={COUNTRIES}
              placeholder="Any"
              clearLabel="Any"
              size="compact"
              ariaLabel="Country"
            />
          </FilterRow>

          {(filters.country ?? '') === 'India' && (
            <FilterRow label="State" onUpgrade={onUpgrade}>
              <ChoiceField
                value={filters.state ?? ''}
                onChange={(v) => update('state', v || undefined)}
                options={INDIAN_STATES}
                placeholder="Any"
                clearLabel="Any"
                size="compact"
                ariaLabel="State"
              />
            </FilterRow>
          )}

          <FilterRow label="City or area contains" onUpgrade={onUpgrade}>
            <input
              type="text"
              value={filters.neighborhood ?? ''}
              onChange={(e) => update('neighborhood', e.target.value)}
              placeholder="e.g. Mumbai, Bangalore"
              className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FilterRow>

          <FilterRow label="Family from (state)" onUpgrade={onUpgrade}>
            <ChoiceField
              value={filters.familyState ?? ''}
              onChange={(v) => update('familyState', v || undefined)}
              options={INDIAN_STATES}
              placeholder="Any"
              clearLabel="Any"
              size="compact"
              ariaLabel="Family from (state)"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Where the family comes from (native place), wherever they live now.</p>
          </FilterRow>

          <FilterRow label="Profile managed by" onUpgrade={onUpgrade}>
            <Select
              value={filters.managedBy}
              onChange={(v) => update('managedBy', v || undefined)}
              options={[{ value: '', label: 'Anyone' }, ...MANAGED_BY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
            />
          </FilterRow>

          {/* Religion and community — Pro */}
          <FilterRow label="Religion" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.religion}
              onChange={(v) => setFilters((prev) => ({ ...prev, religion: v || undefined, caste: undefined }))}
              options={anyOf(RELIGIONS)}
            />
          </FilterRow>

          <FilterRow label="Mother tongue" locked={!isPro} onUpgrade={onUpgrade}>
            <ChoiceField
              value={filters.motherTongue ?? ''}
              onChange={(v) => update('motherTongue', v || undefined)}
              groups={MOTHER_TONGUES}
              placeholder="Any"
              clearLabel="Any"
              size="compact"
              ariaLabel="Mother tongue"
            />
          </FilterRow>

          <FilterRow label="Caste / community" locked={!isPro} onUpgrade={onUpgrade}>
            <ChoiceField
              value={filters.caste ?? ''}
              onChange={(v) => update('caste', v || undefined)}
              options={CASTES[filters.religion ?? ''] ?? Object.values(CASTES).flat().filter((c, i, all) => all.indexOf(c) === i && c !== 'Other')}
              allowCustom
              placeholder="Any"
              clearLabel="Any"
              size="compact"
              ariaLabel="Caste or community"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">People who chose "Prefer not to say" or hid it won't show up with this on.</p>
          </FilterRow>

          <FilterRow label="Marital status" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.maritalStatus}
              onChange={(v) => update('maritalStatus', v || undefined)}
              options={anyOf(MARITAL_STATUS)}
            />
          </FilterRow>

          <FilterRow label="Height" locked={!isPro} onUpgrade={onUpgrade}>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filters.heightRange?.[0] ?? ''}
                onChange={(e) => {
                  const min = e.target.value ? Number(e.target.value) : undefined;
                  const max = filters.heightRange?.[1];
                  update('heightRange', min || max ? [min ?? HEIGHT_CM[0].cm, Math.max(max ?? HEIGHT_CM[HEIGHT_CM.length - 1].cm, min ?? 0)] : undefined);
                }}
                className={selectClass}
                aria-label="Shortest"
              >
                <option value="">From: any</option>
                {HEIGHT_CM.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}
              </select>
              <select
                value={filters.heightRange?.[1] ?? ''}
                onChange={(e) => {
                  const max = e.target.value ? Number(e.target.value) : undefined;
                  const min = filters.heightRange?.[0];
                  update('heightRange', min || max ? [Math.min(min ?? HEIGHT_CM[0].cm, max ?? Infinity), max ?? HEIGHT_CM[HEIGHT_CM.length - 1].cm] : undefined);
                }}
                className={selectClass}
                aria-label="Tallest"
              >
                <option value="">To: any</option>
                {HEIGHT_CM.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}
              </select>
            </div>
          </FilterRow>

          <FilterRow label="Manglik" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.manglik}
              onChange={(v) => update('manglik', v || undefined)}
              options={anyOf(MANGLIK.filter((m) => m !== "Don't know"))}
            />
          </FilterRow>

          <FilterRow label="Diet" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.dietaryPreferences}
              onChange={(v) => update('dietaryPreferences', v || undefined)}
              options={anyOf(DIETS)}
            />
          </FilterRow>

          {/* Education — Pro */}
          <FilterRow label="Education" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.educationLevel}
              onChange={(v) => update('educationLevel', v || undefined)}
              options={anyOf(EDUCATION_LEVELS)}
            />
          </FilterRow>

          {/* Children — Pro */}
          <FilterRow label="Has children" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.children}
              onChange={(v) => update('children', v || undefined)}
              options={[{ value: '', label: 'Any' }, { value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }]}
            />
          </FilterRow>

          <FilterRow label="Wants children" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.familyPlans}
              onChange={(v) => update('familyPlans', v || undefined)}
              options={anyOf(['Wants children', 'Open to children', 'Does not want children'])}
            />
          </FilterRow>

          {/* Lifestyle filters — Pro */}
          <FilterRow label="Drinking" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.drinking}
              onChange={(v) => update('drinking', v || undefined)}
              options={anyOf(['No', 'Socially', 'Regularly'])}
            />
          </FilterRow>

          <FilterRow label="Smoking" locked={!isPro} onUpgrade={onUpgrade}>
            <Select
              value={filters.smoking}
              onChange={(v) => update('smoking', v || undefined)}
              options={anyOf(['No', 'Socially', 'Regularly'])}
            />
          </FilterRow>

          {/* Toggles */}
          <div className="py-3 space-y-2">
            <Toggle
              checked={filters.isVerified}
              onChange={(v) => update('isVerified', v)}
              label="Verified profiles only"
            />
            {/* Pro members filter removed — no paying users exist yet. */}
            <Toggle
              checked={filters.hasInstagram ?? false}
              onChange={(v) => update('hasInstagram', v)}
              label="Has Instagram"
            />
            <Toggle
              checked={filters.hasLinkedin ?? false}
              onChange={(v) => update('hasLinkedin', v)}
              label="Has LinkedIn"
            />
          </div>

          {/* Pro upsell at bottom for free users */}
          {!isPro && (
            <div className="py-4 mt-2">
              <div className="plus-soft border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="text-gray-900 dark:text-white flex-shrink-0 mt-0.5"><IconZap /></div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Unlock all filters</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      Shaadi24+ lets you filter by religion, mother tongue, community, height, education, lifestyle, and more.
                    </p>
                    <button
                      onClick={onUpgrade}
                      className="plus-solid text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90"
                    >
                      Get Shaadi24+
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-zinc-800 flex gap-2 bg-white dark:bg-zinc-900">
          <button
            onClick={clearAll}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Clear all
          </button>
          <button
            onClick={handleApply}
            className="flex-[2] py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold shadow-sm hover:opacity-90"
          >
            Apply filters
          </button>
        </div>
      </aside>
    </>
  );
};

export default FilterPanel;
