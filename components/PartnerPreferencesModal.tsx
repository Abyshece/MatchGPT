import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { EMPTY_PREFERENCES, savePreferences, type PartnerPreferences } from '../lib/partnerPreferences';
import {
  COUNTRIES, DIETS, HEIGHTS, INDIAN_STATES, MANGLIK, MARITAL_STATUS, MOTHER_TONGUES, RELIGIONS,
} from '../lib/matrimonyOptions';
import { ChipsField, splitList } from './ProfileInputs';

// ============================================================================
// PartnerPreferencesModal: what the member is looking for
//
// Members of other matrimony apps complain that their "matches" ignore what
// they asked for. These preferences decide who comes first in Standouts,
// what search starts from ("Use my partner preferences" in the filters), and
// who the daily alert is about (lib/partnerPreferences.ts). Anything left
// empty means "any".
// ============================================================================

interface PartnerPreferencesModalProps {
  initial: PartnerPreferences | null;
  onSaved: () => void;
  onClose: () => void;
}

const AGES = Array.from({ length: 53 }, (_, i) => 18 + i);  // 18–70
const HEIGHT_CM = HEIGHTS.map((label) => ({ label, cm: Number(/\((\d+) cm\)/.exec(label)?.[1]) }));
// Where people live: India and the countries many Indians live in
const PLACES_ABROAD = COUNTRIES.slice(0, 2);

const selectClass = 'w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white';

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="py-4">
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">{title}</h3>
    {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    <div className="mt-2">{children}</div>
  </section>
);

// Several answers as chips, kept as a list
const Pick: React.FC<{ value: string[]; onChange: (v: string[]) => void; options?: string[]; groups?: typeof MOTHER_TONGUES }> = ({
  value, onChange, options, groups,
}) => (
  <ChipsField value={value.join(', ')} onChange={(v) => onChange(splitList(v))} options={options} groups={groups} allowCustom={false} max={40} />
);

const PartnerPreferencesModal: React.FC<PartnerPreferencesModalProps> = ({ initial, onSaved, onClose }) => {
  const { session } = useAuth();
  const [p, setP] = useState<PartnerPreferences>(initial ?? EMPTY_PREFERENCES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PartnerPreferences>(key: K, value: PartnerPreferences[K]) => setP((prev) => ({ ...prev, [key]: value }));
  const num = (v: string) => (v ? Number(v) : null);
  const badAge = p.ageMin !== null && p.ageMax !== null && p.ageMin > p.ageMax;
  const badHeight = p.heightMinCm !== null && p.heightMaxCm !== null && p.heightMinCm > p.heightMaxCm;

  const save = async () => {
    if (!session || badAge || badHeight) return;
    setBusy(true);
    setError(null);
    const { error: saveError } = await savePreferences(session.user.id, p);
    setBusy(false);
    if (saveError) {
      setError(`Couldn't save: ${saveError}`);
      return;
    }
    onSaved();
  };

  return createPortal(
    <div data-popup className="fixed inset-0 z-[300] flex overflow-y-auto p-4 popup-backdrop animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="partner-prefs-title">
      <div className="m-auto bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-zinc-800" data-testid="partner-prefs-modal">
        <div className="p-6 pb-2">
          <h2 id="partner-prefs-title" className="text-lg font-bold text-gray-900 dark:text-white">Partner preferences</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Who you're hoping to meet. Standouts show people who fit first, search can start from these, and we can tell you
            when someone new fits. Leave anything empty for "any".
          </p>
        </div>

        <div className="px-6 divide-y divide-gray-100 dark:divide-zinc-800">
          <Section title="Age">
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Youngest" value={p.ageMin ?? ''} onChange={(e) => set('ageMin', num(e.target.value))} className={selectClass}>
                <option value="">From: any</option>
                {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select aria-label="Oldest" value={p.ageMax ?? ''} onChange={(e) => set('ageMax', num(e.target.value))} className={selectClass}>
                <option value="">To: any</option>
                {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {badAge && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">The youngest age is above the oldest.</p>}
          </Section>

          <Section title="Height">
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Shortest" value={p.heightMinCm ?? ''} onChange={(e) => set('heightMinCm', num(e.target.value))} className={selectClass}>
                <option value="">From: any</option>
                {HEIGHT_CM.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}
              </select>
              <select aria-label="Tallest" value={p.heightMaxCm ?? ''} onChange={(e) => set('heightMaxCm', num(e.target.value))} className={selectClass}>
                <option value="">To: any</option>
                {HEIGHT_CM.map((h) => <option key={h.cm} value={h.cm}>{h.label}</option>)}
              </select>
            </div>
            {badHeight && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">The shortest height is above the tallest.</p>}
          </Section>

          <Section title="Religion">
            <Pick value={p.religions} onChange={(v) => set('religions', v)} options={RELIGIONS} />
          </Section>

          <Section title="Mother tongue">
            <Pick value={p.motherTongues} onChange={(v) => set('motherTongues', v)} groups={MOTHER_TONGUES} />
          </Section>

          <Section title="Marital status">
            <Pick value={p.maritalStatuses} onChange={(v) => set('maritalStatuses', v)} options={MARITAL_STATUS} />
          </Section>

          <Section title="Diet">
            <Pick value={p.diets} onChange={(v) => set('diets', v)} options={DIETS} />
          </Section>

          <Section title="Manglik">
            <Pick value={p.manglik} onChange={(v) => set('manglik', v)} options={MANGLIK.filter((m) => m !== "Don't know")} />
          </Section>

          <Section title="Lives in" hint="States in India, and countries. With both, anywhere in the countries outside India fits too.">
            <div className="space-y-3">
              <Pick value={p.states} onChange={(v) => set('states', v)} options={INDIAN_STATES} />
              <Pick value={p.countries} onChange={(v) => set('countries', v)} groups={PLACES_ABROAD} />
            </div>
          </Section>

          <Section title="Habits">
            <div className="space-y-2">
              {([['noSmoking', "Doesn't smoke"], ['noDrinking', "Doesn't drink"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input type="checkbox" checked={p[key]} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Alerts">
            <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input type="checkbox" checked={p.alerts} onChange={(e) => set('alerts', e.target.checked)} className="mt-1" data-testid="prefs-alerts" />
              <span>Tell me once a day when new members fit these (in a notification, and in Search History).</span>
            </label>
          </Section>
        </div>

        {error && <p role="alert" className="px-6 text-sm text-red-700 dark:text-red-300">{error}</p>}

        <div className="p-6 pt-4 flex gap-3 justify-between items-center">
          <button type="button" onClick={() => setP({ ...EMPTY_PREFERENCES, alerts: p.alerts })} className="text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline">
            Clear all
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button
              type="button" onClick={save} disabled={busy || badAge || badHeight}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PartnerPreferencesModal;
