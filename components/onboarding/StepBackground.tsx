import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronLeft, IconChevronRight } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { BACK, useBackHandler } from '../../lib/nativeApp';
import { ChoiceField } from '../ProfileInputs';
import { EDUCATION_LEVELS, MOTHER_TONGUES, OCCUPATIONS, RELIGIONS } from '../../lib/matrimonyOptions';
import { Field, FormInputStyles, Select } from './formParts';

// ============================================================================
// StepBackground: sign-up step 2. The four things families ask about first,
// after the basics: religion, mother tongue, highest qualification and
// occupation. Everything else (community, career, family, horoscope,
// lifestyle, About me) is optional in My Profile, where each section
// completed earns a free search a day.
// ============================================================================

interface StepBackgroundProps {
  onComplete: () => void;
  onBack: () => void;
}

const StepBackground: React.FC<StepBackgroundProps> = ({ onComplete, onBack }) => {
  const { session, profileRow } = useAuth();
  // Start from what's saved, so coming back to this step shows it
  const [religion, setReligion] = useState(profileRow?.religion ?? '');
  const [motherTongue, setMotherTongue] = useState(profileRow?.mother_tongue ?? '');
  const [educationLevel, setEducationLevel] = useState(profileRow?.education_level ?? '');
  const [occupation, setOccupation] = useState(profileRow?.occupation ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const forSomeoneElse = (profileRow?.profile_created_for ?? 'Myself') !== 'Myself';

  // Android back button: back to step 1
  useBackHandler(BACK.PAGE, () => { if (!isSaving) onBack(); return true; });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const missing = [
      !religion && 'religion', !motherTongue.trim() && 'mother tongue',
      !educationLevel && 'highest qualification', !occupation.trim() && 'occupation',
    ].filter(Boolean);
    if (missing.length) {
      setError(`Please choose the ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`);
      return;
    }
    if (!session?.user.id) { setError('You must be signed in.'); return; }
    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        religion,
        mother_tongue: motherTongue.trim(),
        education_level: educationLevel,
        occupation: occupation.trim(),
      })
      .eq('id', session.user.id);
    setIsSaving(false);
    if (updateError) { setError(updateError.message); return; }
    onComplete();
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in">
      <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#191919] z-20">
        <button
          type="button"
          onClick={onBack}
          className="mr-3 p-2 -ml-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          title="Back"
          aria-label="Back"
        >
          <IconChevronLeft />
        </button>
        <div className="font-bold text-gray-700 dark:text-gray-100 text-lg">Shaadi24</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto py-8 px-6">
          <div className="mb-8">
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Step 2 of 3</div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
              {forSomeoneElse ? 'Their background' : 'Your background'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">What families ask about first. Four quick answers.</p>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Religion">
              <Select value={religion} onChange={setReligion} options={RELIGIONS} placeholder="Select" />
            </Field>
            <Field label="Mother tongue">
              <ChoiceField value={motherTongue} onChange={setMotherTongue} groups={MOTHER_TONGUES}
                placeholder="Select" clearLabel="Clear" ariaLabel="Mother tongue" />
            </Field>
            <Field label="Highest qualification">
              <Select value={educationLevel} onChange={setEducationLevel} options={EDUCATION_LEVELS} placeholder="Select" />
            </Field>
            <Field label="Occupation">
              <ChoiceField value={occupation} onChange={setOccupation} groups={OCCUPATIONS} allowCustom
                placeholder="e.g. Software Professional, Doctor" clearLabel="Clear" ariaLabel="Occupation" />
            </Field>

            <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end">
              <Button onClick={() => {}} className="flex-none h-11 px-6 justify-center text-sm font-bold shadow-md" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Continue'} <IconChevronRight />
              </Button>
            </div>
          </form>
        </div>
      </div>
      <FormInputStyles />
    </div>
  );
};

export default StepBackground;
