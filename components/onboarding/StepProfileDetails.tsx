import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight, IconChevronLeft, IconCheck } from '../../constants';
import { supabase } from '../../lib/supabase';
import type { TablesUpdate } from '../../lib/database.types';
import { useAuth } from '../../lib/AuthContext';
import { ChipsField, ChoiceField } from '../ProfileInputs';
import {
  ANNUAL_INCOME, CASTES, DEGREES, DIETS, DISABILITY, EDUCATION_LEVELS, EMPLOYED_IN, FAMILY_STATUS, FAMILY_TYPE,
  FAMILY_VALUES, FATHER_OCCUPATION, GOTRA_RELIGIONS, GOTRAS, HOBBY_GROUPS, HOROSCOPE_MATCH, LANGUAGES_SPOKEN,
  LIVING_WITH_FAMILY, MANGLIK, MOTHER_OCCUPATION, MOTHER_TONGUES, NAKSHATRA, OCCUPATIONS, OPEN_TO_OTHER_COMMUNITIES,
  PREFER_NOT_TO_SAY, RASHI, RELIGIONS, RESIDENTIAL_STATUS, SECT_LABEL, SECTS, SETTLING_ABROAD, SIBLING_COUNTS,
  SUB_CASTES, educationLevelForDegree, type OptionGroup,
} from '../../lib/matrimonyOptions';

// ============================================================================
// Step 3: Profile Details
// 6 sub-pages, each focused on one cluster of attributes.
// All fields optional — users can fill more later from their profile.
// ============================================================================

interface StepProfileDetailsProps {
  onComplete: () => void;
  onBack: () => void;
}

type Values = Record<string, string>;

// Each "page" in the multi-page form
type Page = {
  title: string;
  subtitle: string;
  emoji: string;
  fields: FieldDef[];
};

type FieldDef = {
  key: string;             // db column name (snake_case)
  label: string | ((v: Values) => string);
  type: 'text' | 'textarea' | 'select' | 'chips' | 'time';
  options?: string[] | ((v: Values) => string[]);
  groups?: OptionGroup[];
  allowCustom?: boolean;   // a typed answer that isn't in the list is kept
  placeholder?: string;
  hint?: string;
  when?: (v: Values) => boolean;  // only asked when this is true
};

const hasSiblings = (n: string | undefined) => !!n && n !== '0';

const PAGES: Page[] = [
  {
    title: 'Religion & community',
    subtitle: 'What families often ask first. Every answer is optional, and you can hide any of them later.',
    emoji: '🙏',
    fields: [
      { key: 'religion', label: 'Religion', type: 'select', options: RELIGIONS },
      { key: 'mother_tongue', label: 'Mother tongue', type: 'select', groups: MOTHER_TONGUES },
      { key: 'sect', label: (v) => SECT_LABEL[v.religion] ?? 'Sect', type: 'select',
        options: (v) => SECTS[v.religion] ?? [], when: (v) => !!SECTS[v.religion] },
      { key: 'caste', label: (v) => (CASTES[v.religion] ? 'Caste' : 'Caste / community'), type: 'select',
        options: (v) => [PREFER_NOT_TO_SAY, ...(CASTES[v.religion] ?? [])], allowCustom: true,
        placeholder: 'Type to search or add yours', when: (v) => !!v.religion },
      { key: 'sub_caste', label: 'Sub-caste', type: 'select', options: (v) => SUB_CASTES[v.caste] ?? [],
        allowCustom: true, placeholder: 'Type to search or add yours',
        when: (v) => !!v.caste && v.caste !== PREFER_NOT_TO_SAY && (!!SUB_CASTES[v.caste] || GOTRA_RELIGIONS.includes(v.religion)) },
      { key: 'gotra', label: 'Gotra', type: 'select', options: GOTRAS, allowCustom: true,
        placeholder: 'Type to search or add yours', when: (v) => GOTRA_RELIGIONS.includes(v.religion) },
      { key: 'open_to_other_communities', label: 'Open to marrying outside your community?', type: 'select',
        options: OPEN_TO_OTHER_COMMUNITIES },
      { key: 'languages', label: 'Languages you speak', type: 'chips', options: LANGUAGES_SPOKEN },
    ],
  },
  {
    title: 'Education & career',
    subtitle: 'What you studied and what you do.',
    emoji: '🎓',
    fields: [
      { key: 'education_level', label: 'Highest qualification', type: 'select', options: EDUCATION_LEVELS },
      { key: 'degree', label: 'Degree', type: 'select', groups: DEGREES, allowCustom: true,
        placeholder: 'e.g. B.Tech, MBBS, MBA' },
      { key: 'university', label: 'College / university', type: 'text', placeholder: 'e.g. IIT Bombay' },
      { key: 'employed_in', label: 'Employed in', type: 'select', options: EMPLOYED_IN },
      { key: 'occupation', label: 'Occupation', type: 'select', groups: OCCUPATIONS, allowCustom: true,
        placeholder: 'e.g. Software Professional, Doctor' },
      { key: 'job_title', label: 'Job title', type: 'text', placeholder: 'e.g. Product Manager' },
      { key: 'work', label: 'Company / workplace', type: 'text', placeholder: 'e.g. Infosys' },
      { key: 'annual_income', label: 'Annual income', type: 'select', groups: ANNUAL_INCOME,
        hint: 'You can hide this from others on your profile.' },
      { key: 'residential_status', label: 'Residential status', type: 'select', options: RESIDENTIAL_STATUS,
        when: (v) => !!v.country && v.country !== 'India' },
    ],
  },
  {
    title: 'Family',
    subtitle: 'A little about your family.',
    emoji: '🏡',
    fields: [
      { key: 'family_type', label: 'Family type', type: 'select', options: FAMILY_TYPE },
      { key: 'family_status', label: 'Family status', type: 'select', options: FAMILY_STATUS },
      { key: 'family_values', label: 'Family values', type: 'select', options: FAMILY_VALUES },
      { key: 'father_occupation', label: "Father's occupation", type: 'select', options: FATHER_OCCUPATION },
      { key: 'mother_occupation', label: "Mother's occupation", type: 'select', options: MOTHER_OCCUPATION },
      { key: 'brothers', label: 'Brothers', type: 'select', options: SIBLING_COUNTS },
      { key: 'brothers_married', label: 'Of them married', type: 'select', options: SIBLING_COUNTS,
        when: (v) => hasSiblings(v.brothers) },
      { key: 'sisters', label: 'Sisters', type: 'select', options: SIBLING_COUNTS },
      { key: 'sisters_married', label: 'Of them married', type: 'select', options: SIBLING_COUNTS,
        when: (v) => hasSiblings(v.sisters) },
      { key: 'family_location', label: 'Family lives in', type: 'text', placeholder: 'e.g. Indore, Madhya Pradesh' },
      { key: 'living_with_family', label: 'Do you live with your family?', type: 'select', options: LIVING_WITH_FAMILY },
      { key: 'family_closeness', label: 'Family closeness', type: 'select', options: ['Very Close', 'Moderately Close', 'Distant', 'No Contact'] },
      { key: 'about_family', label: 'About your family', type: 'textarea',
        placeholder: 'A few lines about your family, in your own words.' },
    ],
  },
  {
    title: 'Horoscope',
    subtitle: "For families who match horoscopes. Skip this page if it doesn't matter to you.",
    emoji: '🪔',
    fields: [
      { key: 'manglik', label: 'Manglik', type: 'select', options: MANGLIK },
      { key: 'rashi', label: 'Rashi (moon sign)', type: 'select', options: RASHI },
      { key: 'nakshatra', label: 'Nakshatra', type: 'select', options: NAKSHATRA },
      { key: 'birth_time', label: 'Time of birth', type: 'time' },
      { key: 'birth_place', label: 'Place of birth', type: 'text', placeholder: 'e.g. Jaipur' },
      { key: 'horoscope_match', label: 'Horoscope match', type: 'select', options: HOROSCOPE_MATCH },
    ],
  },
  {
    title: 'Lifestyle & appearance',
    subtitle: 'How you spend your time and approach the everyday.',
    emoji: '🌱',
    fields: [
      { key: 'dietary_preferences', label: 'Diet', type: 'select', options: DIETS },
      { key: 'drinking', label: 'Drinking', type: 'select', options: ['No', 'Socially', 'Regularly'] },
      { key: 'smoking', label: 'Smoking', type: 'select', options: ['No', 'Socially', 'Regularly'] },
      { key: 'gym_routine', label: 'Exercise', type: 'select', options: ['Daily', '3-4 times a week', '1-2 times a week', 'Occasionally', 'Never'] },
      { key: 'sleep_schedule', label: 'Sleep schedule', type: 'select', options: ['Early Bird', 'Night Owl', 'Flexible', 'Irregular'] },
      { key: 'hobbies', label: 'Hobbies & interests', type: 'chips', groups: HOBBY_GROUPS },
      { key: 'body_type', label: 'Body type', type: 'select', options: ['Slim', 'Athletic', 'Average', 'Curvy', 'Plus Size', 'Muscular'] },
      { key: 'ethnicity', label: 'Ethnicity', type: 'select', options: ['Indian', 'Asian', 'Black', 'Caucasian', 'Hispanic', 'Middle Eastern', 'Mixed', 'Other'] },
      { key: 'hair_color', label: 'Hair color', type: 'select', options: ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Dyed/Other'] },
      { key: 'eye_color', label: 'Eye color', type: 'select', options: ['Brown', 'Black', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Other'] },
      { key: 'has_tattoos', label: 'Tattoos?', type: 'select', options: ['Yes', 'No'] },
      { key: 'disability', label: 'Disability', type: 'select', options: DISABILITY,
        hint: 'Optional. It is never used to filter anyone out.' },
    ],
  },
  {
    title: 'Relationship & you',
    subtitle: 'Where you stand on the bigger questions, and how you relate.',
    emoji: '💞',
    fields: [
      { key: 'marriage_timeline', label: 'Marriage timeline', type: 'select', options: ['ASAP', 'Within 6 Months', 'Within 1 Year', '1-2 Years', '3-5 Years', '5+ Years', 'Not sure yet'] },
      { key: 'family_plans', label: 'Family plans', type: 'select', options: ['Wants children', 'Open to children', 'Does not want children'] },
      { key: 'settling_abroad', label: 'Settling abroad', type: 'select', options: SETTLING_ABROAD },
      { key: 'love_language', label: 'Love language', type: 'select', options: ['Words of Affirmation', 'Acts of Service', 'Receiving Gifts', 'Quality Time', 'Physical Touch'] },
      { key: 'pets', label: 'Pets', type: 'text', placeholder: 'e.g. Dog, Cat, None' },
      { key: 'social_battery', label: 'Social battery', type: 'select', options: ['Introvert', 'Ambivert', 'Extrovert', 'Social Butterfly', 'Homebody'] },
      { key: 'attachment_style', label: 'Attachment style', type: 'select', options: ['Secure', 'Anxious', 'Avoidant', 'Disorganized', `Don't know`] },
      { key: 'conflict_resolution', label: 'When there\'s a disagreement, I…', type: 'select', options: ['Calm discussion', 'Needs space', 'Direct & assertive', 'Avoidant'] },
      { key: 'financial_approach', label: 'Money', type: 'select', options: ['Saver', 'Spender', 'Balanced', 'Investor'] },
      { key: 'politics', label: 'Politics', type: 'select', options: ['Liberal', 'Moderate', 'Conservative', 'Apolitical', 'Other'] },
      { key: 'description', label: 'About me', type: 'textarea', placeholder: 'A few sentences in your own voice. Optional but helpful.' },
    ],
  },
];

const labelOf = (field: FieldDef, v: Values) => (typeof field.label === 'function' ? field.label(v) : field.label);
const optionsOf = (field: FieldDef, v: Values) => (typeof field.options === 'function' ? field.options(v) : field.options);

// Answers that stop applying when another one changes
function withDependentsCleared(values: Values, key: string, val: string): Values {
  if ((values[key] ?? '') === val) return values;
  const next = { ...values, [key]: val };
  if (key === 'religion') {
    next.caste = '';
    next.sub_caste = '';
    if (!SECTS[val]) next.sect = '';
    else if (!SECTS[val].includes(values.sect ?? '')) next.sect = '';
    if (!GOTRA_RELIGIONS.includes(val)) next.gotra = '';
  }
  if (key === 'caste') next.sub_caste = '';
  if (key === 'brothers' && !hasSiblings(val)) next.brothers_married = '';
  if (key === 'sisters' && !hasSiblings(val)) next.sisters_married = '';
  // A degree fills in the qualification when that's still empty
  if (key === 'degree' && !values.education_level) {
    const level = educationLevelForDegree(val);
    if (level) next.education_level = level;
  }
  return next;
}

const StepProfileDetails: React.FC<StepProfileDetailsProps> = ({ onComplete, onBack }) => {
  const { session, profileRow, refreshProfile } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  // Start from what's already saved, so coming back to a page shows it
  const [values, setValues] = useState<Values>(() => {
    const row = (profileRow ?? {}) as Record<string, unknown>;
    const start: Values = {};
    for (const field of PAGES.flatMap((p) => p.fields)) {
      const saved = row[field.key];
      if (saved !== null && saved !== undefined) start[field.key] = String(saved);
    }
    return start;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const page = PAGES[pageIndex];
  const isLast = pageIndex === PAGES.length - 1;
  // Conditions can look at answers from step 1 too (country)
  const context: Values = { country: profileRow?.country ?? '', ...values };
  const shownFields = page.fields.filter((f) => !f.when || f.when(context));

  const setField = (key: string, val: string) => {
    setValues(prev => withDependentsCleared(prev, key, val));
  };

  // Save the current page's values to Supabase, then advance.
  // Saving page-by-page means a closed-tab user doesn't lose progress.
  const saveCurrentPage = async (): Promise<boolean> => {
    if (!session?.user.id) { setError('Not signed in.'); return false; }

    // Build the update payload from the fields on the current page that have
    // values (including answers cleared because another one changed).
    const update: Record<string, string | null> = {};
    for (const field of page.fields) {
      if (field.key in values) {
        update[field.key] = values[field.key].trim() || null;
      }
    }
    if (Object.keys(update).length === 0) return true; // nothing to save

    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update(update as TablesUpdate<'profiles'>)
      .eq('id', session.user.id);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    setError(null);
    const ok = await saveCurrentPage();
    if (!ok) return;
    if (isLast) {
      // Mark onboarding complete and finish.
      if (!session?.user.id) return;
      setIsSaving(true);
      const { error: finishError } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', session.user.id);
      setIsSaving(false);
      if (finishError) {
        setError(finishError.message);
        return;
      }
      await refreshProfile();
      onComplete();
    } else {
      setPageIndex(i => i + 1);
      // scroll to top so the next page starts at the title
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    setError(null);
    if (pageIndex === 0) {
      onBack();
    } else {
      setPageIndex(i => i - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSkip = () => {
    setError(null);
    if (isLast) {
      // skip = finish without saving page changes
      handleNext();
    } else {
      setPageIndex(i => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const filledOnPage = shownFields.filter(f => values[f.key]?.trim()).length;
  const textClass = 'w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all';

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#191919] animate-fade-in">
      <div className="flex-none flex items-center p-4 border-b border-gray-100 dark:border-zinc-800 bg-white dark:bg-[#191919] z-20">
        <button
          onClick={handlePrev}
          className="mr-3 p-2 -ml-2 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          title="Back"
        >
          <IconChevronLeft />
        </button>
        <div className="font-bold text-gray-700 dark:text-gray-100 text-lg">MatchGPT</div>
        <div className="ml-auto text-xs text-gray-400 font-medium">
          Page {pageIndex + 1} of {PAGES.length}
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex-none h-1 bg-gray-100 dark:bg-zinc-800">
        <div
          className="h-full bg-black dark:bg-white transition-all duration-300"
          style={{ width: `${((pageIndex + 1) / PAGES.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto py-10 px-6">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Step 3 of 3</div>
          <div className="text-5xl mb-4">{page.emoji}</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">{page.title}</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">{page.subtitle}</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {shownFields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  {labelOf(field, context)}
                </label>
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    maxLength={100}
                    className={textClass}
                  />
                )}
                {field.type === 'time' && (
                  <input
                    type="time"
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className={textClass}
                  />
                )}
                {field.type === 'textarea' && (
                  <textarea
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    maxLength={field.key === 'description' ? 2000 : 1000}
                    className="w-full p-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all resize-y"
                  />
                )}
                {field.type === 'select' && (
                  <ChoiceField
                    value={values[field.key] || ''}
                    onChange={(v) => setField(field.key, v)}
                    options={optionsOf(field, context)}
                    groups={field.groups}
                    allowCustom={field.allowCustom}
                    placeholder={field.placeholder ?? 'Skip / prefer not to say'}
                    ariaLabel={labelOf(field, context)}
                  />
                )}
                {field.type === 'chips' && (
                  <ChipsField
                    value={values[field.key] || ''}
                    onChange={(v) => setField(field.key, v)}
                    options={optionsOf(field, context)}
                    groups={field.groups}
                  />
                )}
                {field.hint && <p className="text-[10px] text-gray-400 mt-1">{field.hint}</p>}
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-4">
            <button onClick={handleSkip} className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
              Skip for now
            </button>

            <Button onClick={handleNext} disabled={isSaving} className="h-11 px-6 text-sm font-bold shadow-md">
              {isSaving
                ? 'Saving…'
                : isLast
                  ? <>Finish <IconCheck /></>
                  : <>Next <IconChevronRight /></>
              }
            </Button>
          </div>

          {filledOnPage > 0 && (
            <p className="mt-4 text-center text-[11px] text-gray-400">
              You've filled {filledOnPage} of {shownFields.length} on this page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepProfileDetails;
