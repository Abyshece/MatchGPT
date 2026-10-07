import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight } from '../../constants';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { ChoiceField, DateOfBirthField, ageFromDateOfBirth } from '../ProfileInputs';
import { Field, FormInputStyles, Select } from './formParts';
import {
  CHILDREN, CHILDREN_COUNT, CITIES_BY_STATE, COUNTRIES, GENDERS, HEIGHTS, INDIAN_STATES, INTERESTED_IN, MARITAL_STATUS,
  PROFILE_CREATED_FOR,
} from '../../lib/matrimonyOptions';
import { belowMarriageAge, tooYoungMessage } from '../../lib/legalAge';
import { TERMS_VERSION, recordConsent } from '../../lib/consentService';

interface StepBasicInfoProps {
  onComplete: () => void;
}

// A profile made for a son is a man's profile, and so on
const GENDER_FOR: Record<string, string> = { Son: 'Male', Brother: 'Male', Daughter: 'Female', Sister: 'Female' };
// Who someone is most likely looking for, filled in from the gender (it can be changed)
const LIKELY_INTEREST: Record<string, string> = { Male: 'Women', Female: 'Men' };

const StepBasicInfo: React.FC<StepBasicInfoProps> = ({ onComplete }) => {
  const { session, profileRow, refreshProfile } = useAuth();
  // Coming back from step 2 shows what was saved
  const saved = profileRow;
  const [createdFor, setCreatedFor] = useState(saved?.profile_created_for ?? 'Myself');
  // Google sign-ups arrive with a name; start from it.
  const [name, setName] = useState<string>(() => {
    if (saved?.name) return saved.name;
    const meta = session?.user.user_metadata ?? {};
    return String(meta.full_name ?? meta.name ?? '');
  });
  const [dateOfBirth, setDateOfBirth] = useState(saved?.date_of_birth ?? '');
  const [gender, setGender] = useState(saved?.gender ?? '');
  const [interestedIn, setInterestedIn] = useState(saved?.interested_in ?? '');
  // Picked from the gender until they choose it themselves
  const [interestChosen, setInterestChosen] = useState(!!saved?.interested_in);
  const [maritalStatus, setMaritalStatus] = useState(saved?.marital_status ?? '');
  const [children, setChildren] = useState(saved?.children ?? '');
  const [childrenCount, setChildrenCount] = useState(saved?.children_count ?? '');
  const [height, setHeight] = useState(saved?.height ?? '');
  const [country, setCountry] = useState(saved?.country || 'India');
  const [state, setState] = useState(saved?.state ?? '');
  const [city, setCity] = useState(saved?.city ?? '');
  const [theyAgreed, setTheyAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const forSomeoneElse = createdFor !== 'Myself';
  const inIndia = country === 'India';
  const askChildren = !!maritalStatus && maritalStatus !== 'Never Married';

  const chooseGender = (v: string) => {
    setGender(v);
    if (!interestChosen) setInterestedIn(LIKELY_INTEREST[v] ?? '');
  };
  const chooseCreatedFor = (v: string) => {
    setCreatedFor(v);
    if (GENDER_FOR[v]) chooseGender(GENDER_FOR[v]);
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required.';
    if (!dateOfBirth) return 'Please choose the date of birth.';
    const age = ageFromDateOfBirth(dateOfBirth);
    if (age === null || age > 99) return 'Please check the date of birth.';
    if (age < 18) return tooYoungMessage('Female', forSomeoneElse);
    if (!gender) return 'Please select the gender.';
    if (belowMarriageAge(gender, age)) return tooYoungMessage(gender, forSomeoneElse);
    if (!interestedIn) return 'Please select who you\'re interested in.';
    if (!maritalStatus) return 'Please select the marital status.';
    if (!height) return 'Please choose the height.';
    if (!country) return 'Please choose the country you live in.';
    if (inIndia && !state) return 'Please choose the state.';
    if (!city.trim()) return 'Please enter the city.';
    if (forSomeoneElse && !theyAgreed) return 'Please confirm they know about this profile and want it.';
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
        interested_in: interestedIn,
        dating_intention: 'Marriage', // for marriage only (the database insists too)
        marital_status: maritalStatus,
        children: askChildren ? children || null : null,
        children_count: askChildren && children && children !== 'No' ? childrenCount || null : null,
        height,
        country,
        state: state.trim() || null,
        city: city.trim(),
        email_verified: true, // they got here, so the email is verified
      })
      .eq('id', session.user.id);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    // A profile made for a son, daughter, sibling, relative or friend: keep the
    // record that they agreed to it (the DPDP Act asks for the person's own
    // consent; the 2016 advisory for matrimonial sites for the creator's word)
    if (forSomeoneElse) {
      await recordConsent({
        userId: session.user.id, email: session.user.email, eventType: 'profile_for_other_consent',
        consented: true, documentVersion: `${TERMS_VERSION}:${createdFor}`,
      });
    }
    await refreshProfile();
    onComplete();
  };

  return (
    <div className="max-w-xl w-full mx-auto py-8 px-6 animate-fade-in">
      <div className="mb-8">
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Step 1 of 3</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          {forSomeoneElse ? 'Tell us about them' : 'Tell us about yourself'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Just the basics: about two minutes for all three steps. The rest can wait for your profile.</p>
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
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Answer every question about them, not yourself.</p>
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
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Others only see the age, never the date.</p>
        </Field>

        <div className="grid grid-cols-2 gap-4 items-end">
          <Field label="Gender">
            <Select value={gender} onChange={chooseGender} options={GENDERS} placeholder="Select" />
          </Field>
          <Field label="Interested in">
            <Select value={interestedIn} onChange={(v) => { setInterestedIn(v); setInterestChosen(true); }} options={INTERESTED_IN} placeholder="Select" />
          </Field>
        </div>

        <Field label="Marital status">
          <Select value={maritalStatus} onChange={setMaritalStatus} options={MARITAL_STATUS} placeholder="Select" />
        </Field>

        {askChildren && (
          <div className="grid grid-cols-2 gap-4 items-end">
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

        <Field label="Height">
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


        {forSomeoneElse && (
          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-zinc-700 cursor-pointer" data-testid="for-other-consent">
            <input type="checkbox" checked={theyAgreed} onChange={(e) => setTheyAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 flex-none accent-black dark:accent-white" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {name.trim() || 'They'} know{name.trim() ? 's' : ''} about this profile and want{name.trim() ? 's' : ''} it,
              {' '}{name.trim() ? 'is' : 'are'} looking to marry, and {name.trim() ? 'is' : 'are'} of the legal age to marry.
              Everything I write about them is true.
            </span>
          </label>
        )}

        {/* Like the other steps: the button on the right */}
        <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end">
          <Button onClick={() => {}} className="flex-none h-11 px-6 justify-center text-sm font-bold shadow-md" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Continue'} <IconChevronRight />
          </Button>
        </div>
      </form>

      <FormInputStyles />
    </div>
  );
};

export default StepBasicInfo;
