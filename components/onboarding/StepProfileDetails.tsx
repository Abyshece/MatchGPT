import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight, IconChevronLeft, IconCheck } from '../../constants';
import { supabase } from '../../lib/supabase';
import type { TablesUpdate } from '../../lib/database.types';
import { useAuth } from '../../lib/AuthContext';

// ============================================================================
// Step 3: Profile Details
// 5 sub-pages, each focused on one cluster of attributes.
// All fields optional — users can fill more later from their profile.
// ============================================================================

interface StepProfileDetailsProps {
  onComplete: () => void;
  onBack: () => void;
}

// Each "page" in the multi-page form
type Page = {
  title: string;
  subtitle: string;
  emoji: string;
  fields: FieldDef[];
};

type FieldDef = {
  key: string;             // db column name (snake_case)
  label: string;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
  placeholder?: string;
};

const PAGES: Page[] = [
  {
    title: 'Appearance',
    subtitle: 'Just the basics — fully optional.',
    emoji: '✨',
    fields: [
      { key: 'height', label: 'Height', type: 'text', placeholder: `e.g. 5'8"` },
      { key: 'body_type', label: 'Body type', type: 'select', options: ['Slim', 'Athletic', 'Average', 'Curvy', 'Plus Size', 'Muscular'] },
      { key: 'ethnicity', label: 'Ethnicity', type: 'select', options: ['Indian', 'Asian', 'Black', 'Caucasian', 'Hispanic', 'Middle Eastern', 'Mixed', 'Other'] },
      { key: 'hair_color', label: 'Hair color', type: 'select', options: ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Dyed/Other'] },
      { key: 'eye_color', label: 'Eye color', type: 'select', options: ['Brown', 'Black', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Other'] },
      { key: 'has_tattoos', label: 'Tattoos?', type: 'select', options: ['Yes', 'No'] },
    ],
  },
  {
    title: 'Lifestyle',
    subtitle: 'How you spend your time and approach the everyday.',
    emoji: '🌱',
    fields: [
      { key: 'drinking', label: 'Drinking', type: 'select', options: ['No', 'Socially', 'Regularly'] },
      { key: 'smoking', label: 'Smoking', type: 'select', options: ['No', 'Socially', 'Regularly'] },
      { key: 'marijuana', label: 'Marijuana', type: 'select', options: ['No', 'Socially', 'Regularly'] },
      { key: 'drugs', label: 'Other drugs', type: 'select', options: ['No', 'Sometimes', 'Often'] },
      { key: 'gym_routine', label: 'Exercise', type: 'select', options: ['Daily', '3-4 times a week', '1-2 times a week', 'Occasionally', 'Never'] },
      { key: 'dietary_preferences', label: 'Diet', type: 'select', options: ['No restrictions', 'Vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Halal', 'Kosher', 'Gluten-free'] },
      { key: 'sleep_schedule', label: 'Sleep schedule', type: 'select', options: ['Early Bird', 'Night Owl', 'Flexible', 'Irregular'] },
      { key: 'hobbies', label: 'Hobbies', type: 'textarea', placeholder: 'e.g. reading, hiking, photography' },
    ],
  },
  {
    title: 'Career & Background',
    subtitle: 'What you do and where you come from.',
    emoji: '🎓',
    fields: [
      { key: 'job_title', label: 'Job title', type: 'text', placeholder: 'e.g. Product Manager' },
      { key: 'work', label: 'Workplace', type: 'text', placeholder: 'e.g. Tech startup' },
      { key: 'education_level', label: 'Education level', type: 'select', options: ['High School', `Bachelor's`, `Master's`, 'PhD', 'Trade School'] },
      { key: 'university', label: 'University', type: 'text', placeholder: 'e.g. IIT Bombay' },
      { key: 'religion', label: 'Religion', type: 'select', options: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Jewish', 'Spiritual', 'Agnostic', 'Atheist', 'Other'] },
      { key: 'politics', label: 'Politics', type: 'select', options: ['Liberal', 'Moderate', 'Conservative', 'Apolitical', 'Other'] },
      { key: 'languages', label: 'Languages', type: 'text', placeholder: 'e.g. English, Hindi' },
      { key: 'zodiac', label: 'Zodiac', type: 'select', options: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] },
    ],
  },
  {
    title: 'Family & Dating',
    subtitle: 'Where you stand on the bigger questions.',
    emoji: '💞',
    fields: [
      { key: 'relationship_type', label: 'Relationship type', type: 'select', options: ['Monogamous', 'Polyamorous', 'Open', 'Casual'] },
      { key: 'marriage_timeline', label: 'Marriage timeline', type: 'select', options: ['ASAP', 'Within 6 Months', 'Within 1 Year', '1-2 Years', '3-5 Years', '5+ Years', 'Not sure yet'] },
      { key: 'children', label: 'Children', type: 'select', options: ['Has children', 'No children'] },
      { key: 'family_plans', label: 'Family plans', type: 'select', options: ['Wants children', 'Open to children', 'Does not want children'] },
      { key: 'love_language', label: 'Love language', type: 'select', options: ['Words of Affirmation', 'Acts of Service', 'Receiving Gifts', 'Quality Time', 'Physical Touch'] },
      { key: 'pets', label: 'Pets', type: 'text', placeholder: 'e.g. Dog, Cat, None' },
      { key: 'family_closeness', label: 'Family closeness', type: 'select', options: ['Very Close', 'Moderately Close', 'Distant', 'No Contact'] },
    ],
  },
  {
    title: 'A bit about you',
    subtitle: 'How you relate. This shapes who you match well with.',
    emoji: '🧠',
    fields: [
      { key: 'social_battery', label: 'Social battery', type: 'select', options: ['Introvert', 'Ambivert', 'Extrovert', 'Social Butterfly', 'Homebody'] },
      { key: 'attachment_style', label: 'Attachment style', type: 'select', options: ['Secure', 'Anxious', 'Avoidant', 'Disorganized', `Don't know`] },
      { key: 'conflict_resolution', label: 'When there\'s a disagreement, I…', type: 'select', options: ['Calm discussion', 'Needs space', 'Direct & assertive', 'Avoidant'] },
      { key: 'financial_approach', label: 'Money', type: 'select', options: ['Saver', 'Spender', 'Balanced', 'Investor'] },
      { key: 'description', label: 'About me', type: 'textarea', placeholder: 'A few sentences in your own voice. Optional but helpful.' },
    ],
  },
];

const StepProfileDetails: React.FC<StepProfileDetailsProps> = ({ onComplete, onBack }) => {
  const { session, refreshProfile } = useAuth();
  const [pageIndex, setPageIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const page = PAGES[pageIndex];
  const isLast = pageIndex === PAGES.length - 1;

  const setField = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  // Save the current page's values to Supabase, then advance.
  // Saving page-by-page means a closed-tab user doesn't lose progress.
  const saveCurrentPage = async (): Promise<boolean> => {
    if (!session?.user.id) { setError('Not signed in.'); return false; }

    // Build the update payload from the fields on the current page that have values.
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

  const filledOnPage = page.fields.filter(f => values[f.key]?.trim()).length;

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
            {page.fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                  {field.label}
                </label>
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                  />
                )}
                {field.type === 'textarea' && (
                  <textarea
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                    className="w-full p-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all resize-y"
                  />
                )}
                {field.type === 'select' && field.options && (
                  <select
                    value={values[field.key] || ''}
                    onChange={(e) => setField(field.key, e.target.value)}
                    className="w-full h-11 px-3 border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition-all cursor-pointer"
                  >
                    <option value="">Skip / prefer not to say</option>
                    {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
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
              You've filled {filledOnPage} of {page.fields.length} on this page.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepProfileDetails;
