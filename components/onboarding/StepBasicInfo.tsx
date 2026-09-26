import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

interface StepBasicInfoProps {
  onComplete: () => void;
}

// Options shown in the form. These match what the matching algorithm expects.
const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer to self-describe'];
const PRONOUNS = ['She/Her', 'He/Him', 'They/Them', 'Other'];
const INTERESTED_IN = ['Men', 'Women', 'Everyone'];
const RELATIONSHIP_INTENTS = [
  'Marriage',
  'Long-term relationship',
  'Long-term, open to short',
  'Casual / Dating',
  'Friendship',
];

const StepBasicInfo: React.FC<StepBasicInfoProps> = ({ onComplete }) => {
  const { session, refreshProfile } = useAuth();
  // Google sign-ups arrive with a name; start from it.
  const [name, setName] = useState<string>(() => {
    const meta = session?.user.user_metadata ?? {};
    return String(meta.full_name ?? meta.name ?? '');
  });
  const [age, setAge] = useState<string>('');
  const [gender, setGender] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
  const [intention, setIntention] = useState('');
  const [location, setLocation] = useState('');
  const [hometown, setHometown] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    const ageNum = parseInt(age, 10);
    if (Number.isNaN(ageNum) || ageNum < 18 || ageNum > 99) return 'Age must be between 18 and 99.';
    if (!gender) return 'Please select your gender.';
    if (!interestedIn) return 'Please select who you\'re interested in.';
    if (!intention) return 'Please select what you\'re looking for.';
    if (!location.trim()) return 'Current location is required.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!session?.user.id) {
      setError('You must be signed in.');
      return;
    }

    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        age: parseInt(age, 10),
        gender,
        pronouns: pronouns || null,
        interested_in: interestedIn,
        dating_intention: intention,
        location: location.trim(),
        hometown: hometown.trim() || null,
        email_verified: true, // they got here, so the email is verified
      })
      .eq('id', session.user.id);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    onComplete();
  };

  return (
    <div className="max-w-xl w-full mx-auto py-8 px-6 animate-fade-in">
      <div className="mb-8">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Step 1 of 3</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">Tell us about yourself</h1>
        <p className="text-gray-500 dark:text-gray-400">The basics. We'll get to the fun stuff after.</p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Your name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As you'd like it shown"
            className="form-input"
            maxLength={60}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Age">
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="25"
              min={18}
              max={99}
              className="form-input"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">You can change your age once.</p>
          </Field>

          <Field label="Pronouns (optional)">
            <Select value={pronouns} onChange={setPronouns} options={PRONOUNS} placeholder="Select" />
          </Field>
        </div>

        <Field label="Gender">
          <Select value={gender} onChange={setGender} options={GENDERS} placeholder="Select your gender" />
        </Field>

        <Field label="I'm interested in">
          <Select value={interestedIn} onChange={setInterestedIn} options={INTERESTED_IN} placeholder="Select" />
        </Field>

        <Field label="What I'm looking for">
          <Select value={intention} onChange={setIntention} options={RELATIONSHIP_INTENTS} placeholder="Select" />
        </Field>

        <Field label="Current location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Mumbai, MH"
            className="form-input"
            required
          />
          <p className="text-[10px] text-gray-400 mt-1">City, State or City, Country.</p>
        </Field>

        <Field label="Hometown (optional)">
          <input
            type="text"
            value={hometown}
            onChange={(e) => setHometown(e.target.value)}
            placeholder="Where you grew up"
            className="form-input"
          />
        </Field>

        <div className="pt-4">
          <Button onClick={() => {}} className="w-full h-12 justify-center text-base font-semibold" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Continue'} <IconChevronRight />
          </Button>
        </div>
      </form>

      <style>{`
        .form-input {
          width: 100%;
          height: 2.75rem;
          padding: 0 0.75rem;
          border: 1px solid rgb(209 213 219);
          border-radius: 0.375rem;
          background: white;
          font-size: 0.95rem;
          outline: none;
          transition: all 150ms;
        }
        .form-input:focus {
          border-color: black;
          box-shadow: 0 0 0 1px black;
        }
        .dark .form-input {
          background: rgb(24 24 27);
          border-color: rgb(63 63 70);
          color: white;
        }
        .dark .form-input:focus {
          border-color: white;
          box-shadow: 0 0 0 1px white;
        }
      `}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
    {children}
  </div>
);

const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="form-input cursor-pointer"
  >
    <option value="" disabled>{placeholder || 'Select'}</option>
    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
  </select>
);

export default StepBasicInfo;
