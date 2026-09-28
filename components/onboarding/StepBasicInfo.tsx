import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { ChoiceField, DateOfBirthField, ageFromDateOfBirth } from '../ProfileInputs';
import {
  CHILDREN, CHILDREN_COUNT, CITIES_BY_STATE, COUNTRIES, HEIGHTS, INDIAN_STATES, MARITAL_STATUS, PROFILE_CREATED_FOR,
} from '../../lib/matrimonyOptions';

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
// A profile made for a son is a man's profile, and so on
const GENDER_FOR: Record<string, string> = { Son: 'Male', Brother: 'Male', Daughter: 'Female', Sister: 'Female' };

const StepBasicInfo: React.FC<StepBasicInfoProps> = ({ onComplete }) => {
  const { session, refreshProfile } = useAuth();
  const [createdFor, setCreatedFor] = useState('Myself');
  // Google sign-ups arrive with a name; start from it.
  const [name, setName] = useState<string>(() => {
    const meta = session?.user.user_metadata ?? {};
    return String(meta.full_name ?? meta.name ?? '');
  });
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
  const [intention, setIntention] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [children, setChildren] = useState('');
  const [childrenCount, setChildrenCount] = useState('');
  const [height, setHeight] = useState('');
  const [country, setCountry] = useState('India');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [hometown, setHometown] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const forSomeoneElse = createdFor !== 'Myself';
  const inIndia = country === 'India';
  const askChildren = !!maritalStatus && maritalStatus !== 'Never Married';

  const chooseCreatedFor = (v: string) => {
    setCreatedFor(v);
    if (GENDER_FOR[v]) setGender(GENDER_FOR[v]);
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    if (!dateOfBirth) return 'Please choose the date of birth.';
    const age = ageFromDateOfBirth(dateOfBirth);
    if (age === null || age < 18 || age > 99) return 'You must be at least 18 to use MatchGPT.';
    if (!gender) return 'Please select the gender.';
    if (!interestedIn) return 'Please select who you\'re interested in.';
    if (!intention) return 'Please select what you\'re looking for.';
    if (!maritalStatus) return 'Please select the marital status.';
    if (!country) return 'Please choose the country you live in.';
    if (inIndia && !state) return 'Please choose the state.';
    if (!city.trim()) return 'Please enter the city.';
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
    // The database works out the age from the date of birth and the location
    // text ("Surat, Gujarat") from city, state and country.
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        profile_created_for: createdFor,
        name: name.trim(),
        date_of_birth: dateOfBirth,
        gender,
        pronouns: pronouns || null,
        interested_in: interestedIn,
        dating_intention: intention,
        marital_status: maritalStatus,
        children: askChildren ? children || null : null,
        children_count: askChildren && children && children !== 'No' ? childrenCount || null : null,
        height: height || null,
        country,
        state: state.trim() || null,
        city: city.trim(),
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          {forSomeoneElse ? 'Tell us about them' : 'Tell us about yourself'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">The basics. We'll get to the fun stuff after.</p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="This profile is for">
          <Select value={createdFor} onChange={chooseCreatedFor} options={PROFILE_CREATED_FOR} placeholder="Select" />
          {forSomeoneElse && (
            <p className="text-[10px] text-gray-400 mt-1">Answer every question about them, not yourself.</p>
          )}
        </Field>

        <Field label={forSomeoneElse ? 'Their name' : 'Your name'}>
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

        <Field label="Date of birth">
          <DateOfBirthField value={dateOfBirth} onChange={setDateOfBirth} />
          <p className="text-[10px] text-gray-400 mt-1">Others only see the age, never the date.</p>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Gender">
            <Select value={gender} onChange={setGender} options={GENDERS} placeholder="Select" />
          </Field>
          <Field label="Pronouns (optional)">
            <Select value={pronouns} onChange={setPronouns} options={PRONOUNS} placeholder="Select" />
          </Field>
        </div>

        <Field label="Interested in">
          <Select value={interestedIn} onChange={setInterestedIn} options={INTERESTED_IN} placeholder="Select" />
        </Field>

        <Field label="Looking for">
          <Select value={intention} onChange={setIntention} options={RELATIONSHIP_INTENTS} placeholder="Select" />
        </Field>

        <Field label="Marital status">
          <Select value={maritalStatus} onChange={setMaritalStatus} options={MARITAL_STATUS} placeholder="Select" />
        </Field>

        {askChildren && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Children (optional)">
              <Select value={children} onChange={setChildren} options={CHILDREN} placeholder="Select" />
            </Field>
            {children && children !== 'No' && (
              <Field label="How many">
                <Select value={childrenCount} onChange={setChildrenCount} options={CHILDREN_COUNT} placeholder="Select" />
              </Field>
            )}
          </div>
        )}

        <Field label="Height (optional)">
          <Select value={height} onChange={setHeight} options={HEIGHTS} placeholder="Select" />
        </Field>

        <Field label="Lives in">
          <ChoiceField
            value={country}
            onChange={(v) => { setCountry(v); setState(''); setCity(''); }}
            groups={COUNTRIES}
            placeholder="Country"
            clearLabel="Clear"
            ariaLabel="Country"
          />
          <div className="grid grid-cols-2 gap-4 mt-3">
            {inIndia ? (
              <ChoiceField
                value={state}
                onChange={(v) => { setState(v); setCity(''); }}
                options={INDIAN_STATES}
                placeholder="State"
                clearLabel="Clear"
                ariaLabel="State"
              />
            ) : (
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State / province (optional)"
                className="form-input"
                maxLength={60}
                aria-label="State or province"
              />
            )}
            <ChoiceField
              value={city}
              onChange={setCity}
              options={inIndia ? CITIES_BY_STATE[state] ?? [] : []}
              allowCustom
              placeholder="City"
              clearLabel="Clear"
              ariaLabel="City"
            />
          </div>
        </Field>

        <Field label="Grew up in (optional)">
          <input
            type="text"
            value={hometown}
            onChange={(e) => setHometown(e.target.value)}
            placeholder="Hometown"
            className="form-input"
            maxLength={100}
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
