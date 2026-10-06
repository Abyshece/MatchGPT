import React, { useState } from 'react';
import { Button } from './NotionUI';
import { IconChevronRight } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import type { TablesUpdate } from '../lib/database.types';
import { ChoiceField, DateOfBirthField, ageFromDateOfBirth } from './ProfileInputs';
import { ABOUT_ME_MIN, REQUIRED_LABELS, missingRequired, type RequiredKey } from '../lib/profileRewards';
import {
  CITIES_BY_STATE, COUNTRIES, EDUCATION_LEVELS, GENDERS, HEIGHTS, INDIAN_STATES, INTERESTED_IN, MARITAL_STATUS,
  MOTHER_TONGUES, OCCUPATIONS, PROFILE_CREATED_FOR, RELATIONSHIP_INTENTS, RELIGIONS,
} from '../lib/matrimonyOptions';

// ============================================================================
// RequiredDetails: members who joined before an answer became required give it
// here, before anything else (lib/profileRewards.ts). Only what's missing is
// asked; new members give all of it while signing up.
// ============================================================================

const COLUMN: Record<RequiredKey, string> = {
  profileCreatedFor: 'profile_created_for', name: 'name', dateOfBirth: 'date_of_birth', gender: 'gender',
  interestedIn: 'interested_in', datingIntention: 'dating_intention', maritalStatus: 'marital_status',
  height: 'height', country: 'country', state: 'state', city: 'city', religion: 'religion',
  motherTongue: 'mother_tongue', educationLevel: 'education_level', occupation: 'occupation',
  description: 'description',
};

const inputClass = 'w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all';

const RequiredDetails: React.FC = () => {
  const { session, profile, refreshProfile, signOut } = useAuth();
  // What's missing when the screen opens stays asked, even once typed in
  const [asked] = useState<RequiredKey[]>(() => (profile ? missingRequired(profile) : []));
  const [values, setValues] = useState<Partial<Record<RequiredKey, string>>>(() => {
    const start: Partial<Record<RequiredKey, string>> = {};
    for (const key of Object.keys(COLUMN) as RequiredKey[]) {
      const v = profile?.[key];
      if (typeof v === 'string' && v.trim()) start[key] = v;
    }
    return start;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!profile) return null;
  const value = (key: RequiredKey) => values[key] ?? '';
  const set = (key: RequiredKey, v: string) => setValues((prev) => {
    const next = { ...prev, [key]: v };
    if (key === 'country' && v !== prev.country) { next.state = ''; next.city = ''; }
    if (key === 'state' && v !== prev.state) next.city = '';
    return next;
  });
  // The place is asked together when any part of it is missing
  const askPlace = asked.some((k) => k === 'country' || k === 'state' || k === 'city');
  const inIndia = value('country') === 'India';

  const save = async () => {
    setError(null);
    const update: Record<string, string> = {};
    const missing: string[] = [];
    for (const key of asked) {
      if (key === 'state' && !inIndia) continue;
      const v = value(key).trim();
      if (key === 'description' ? v.length < ABOUT_ME_MIN : !v) missing.push(REQUIRED_LABELS[key]);
      update[COLUMN[key]] = v;
    }
    if (askPlace) {
      for (const key of ['country', 'state', 'city'] as RequiredKey[]) {
        if (key === 'state' && !inIndia) continue;
        const v = value(key).trim();
        if (!v && !missing.includes(REQUIRED_LABELS[key])) missing.push(REQUIRED_LABELS[key]);
        update[COLUMN[key]] = v;
      }
    }
    if (missing.length) {
      setError(missing.length === 1 && missing[0] === REQUIRED_LABELS.description
        ? `Please write at least ${ABOUT_ME_MIN} characters about yourself.`
        : `Please answer: ${missing.join(', ')}.`);
      return;
    }
    if (update.date_of_birth) {
      const age = ageFromDateOfBirth(update.date_of_birth);
      if (age === null || age < 18 || age > 99) {
        setError('You must be at least 18 to use Shaadi24.');
        return;
      }
    }
    if (!session?.user.id) return;
    setSaving(true);
    const { error: saveError } = await supabase
      .from('profiles')
      .update(update as TablesUpdate<'profiles'>)
      .eq('id', session.user.id);
    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }
    await refreshProfile();
    setSaving(false);
  };

  const field = (key: RequiredKey, control: React.ReactNode, hint?: string) => (
    <div key={key}>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        {REQUIRED_LABELS[key]}
      </label>
      {control}
      {hint && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  const choice = (key: RequiredKey, list: { options?: string[]; groups?: typeof COUNTRIES; allowCustom?: boolean }) => field(key, (
    <ChoiceField
      value={value(key)}
      onChange={(v) => set(key, v)}
      options={list.options}
      groups={list.groups}
      allowCustom={list.allowCustom}
      placeholder="Select"
      clearLabel="Clear"
      ariaLabel={REQUIRED_LABELS[key]}
    />
  ));

  const controls: Partial<Record<RequiredKey, () => React.ReactNode>> = {
    profileCreatedFor: () => choice('profileCreatedFor', { options: PROFILE_CREATED_FOR }),
    name: () => field('name', (
      <input type="text" value={value('name')} onChange={(e) => set('name', e.target.value)} maxLength={60}
        placeholder="As you'd like it shown" className={inputClass} aria-label="Name" />
    )),
    dateOfBirth: () => field('dateOfBirth', <DateOfBirthField value={value('dateOfBirth')} onChange={(v) => set('dateOfBirth', v)} />,
      'Others only see the age, never the date.'),
    gender: () => choice('gender', { options: GENDERS }),
    interestedIn: () => choice('interestedIn', { options: INTERESTED_IN }),
    datingIntention: () => choice('datingIntention', { options: RELATIONSHIP_INTENTS }),
    maritalStatus: () => choice('maritalStatus', { options: MARITAL_STATUS }),
    height: () => choice('height', { options: HEIGHTS }),
    religion: () => choice('religion', { options: RELIGIONS }),
    motherTongue: () => choice('motherTongue', { groups: MOTHER_TONGUES }),
    educationLevel: () => choice('educationLevel', { options: EDUCATION_LEVELS }),
    occupation: () => choice('occupation', { groups: OCCUPATIONS, allowCustom: true }),
    description: () => field('description', (
      <>
        <textarea
          value={value('description')}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={`A few sentences in your own voice (at least ${ABOUT_ME_MIN} characters).`}
          aria-label="About me"
          className="w-full p-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all resize-y"
        />
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 text-right">
          {value('description').trim().length} / {ABOUT_ME_MIN} characters at least
        </p>
      </>
    )),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919] animate-fade-in" data-testid="required-details">
      <div className="max-w-xl mx-auto py-10 px-6">
        <div className="text-4xl mb-4" aria-hidden="true">📝</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">A few details to finish</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Shaadi24 now asks every member for these, so the right people can find you. It takes a minute.
        </p>

        {error && (
          <div role="alert" className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {asked.filter((k) => k !== 'country' && k !== 'state' && k !== 'city').map((key) => controls[key]?.())}
          {askPlace && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Lives in</label>
              <ChoiceField value={value('country')} onChange={(v) => set('country', v)} groups={COUNTRIES}
                placeholder="Country" clearLabel="Clear" ariaLabel="Country" />
              <div className="grid grid-cols-2 gap-4 mt-3">
                {inIndia ? (
                  <ChoiceField value={value('state')} onChange={(v) => set('state', v)} options={INDIAN_STATES}
                    placeholder="State" clearLabel="Clear" ariaLabel="State" />
                ) : (
                  <input type="text" value={value('state')} onChange={(e) => set('state', e.target.value)} maxLength={60}
                    placeholder="State / province (optional)" className={inputClass} aria-label="State or province" />
                )}
                <ChoiceField value={value('city')} onChange={(v) => set('city', v)}
                  options={inIndia ? CITIES_BY_STATE[value('state')] ?? [] : []} allowCustom
                  placeholder="City" clearLabel="Clear" ariaLabel="City" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button onClick={save} disabled={saving} className="w-full h-12 justify-center text-base font-semibold">
            {saving ? 'Saving…' : 'Save and continue'} <IconChevronRight />
          </Button>
          <button onClick={() => signOut()} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequiredDetails;
