import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PageHeader, PropertyRow, InfoSection } from './NotionUI';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { updateProfile } from '../lib/profileService';
import { addPhoto, removePhoto, replacePhoto } from '../lib/photoService';
import { supabase } from '../lib/supabase';
import VerificationRequestModal from './VerificationRequestModal';
import { ChipsField, ChoiceField, DateOfBirthField, ageFromDateOfBirth, formatDateOfBirth } from './ProfileInputs';
import {
  IconCheck, IconUpload, IconEdit, IconX, IconZap, IconShield, IconClock,
} from '../constants';
import { profileCompletion } from '../lib/profileCompletion';
import { ABOUT_ME_MIN, REQUIRED_LABELS, fetchProfileSections, type ProfileSections, type SectionId } from '../lib/profileRewards';
import { DAILY_LIMITS } from '../lib/profileService';
import ProfileRewardsCard from './ProfileRewardsCard';
import { SECT_LABEL, formatBirthTime, formatChildren, formatSiblings } from '../lib/profileDisplay';
import {
  ANNUAL_INCOME, CASTES, CHILDREN, CHILDREN_COUNT, CITIES_BY_STATE, COUNTRIES, DEGREES, DIETS, DISABILITY,
  EDUCATION_LEVELS, EMPLOYED_IN, FAMILY_STATUS, FAMILY_TYPE, FAMILY_VALUES, FATHER_OCCUPATION, GENDERS, GOTRA_RELIGIONS,
  GOTRAS, HEIGHTS, HOBBY_GROUPS, HOROSCOPE_MATCH, INDIAN_STATES, INTERESTED_IN, LANGUAGES_SPOKEN, LIVING_WITH_FAMILY, MANGLIK,
  MARITAL_STATUS, MOTHER_OCCUPATION, MOTHER_TONGUES, NAKSHATRA, OCCUPATIONS, OPEN_TO_OTHER_COMMUNITIES,
  PREFER_NOT_TO_SAY, PROFILE_CREATED_FOR, RASHI, RELIGIONS, RESIDENTIAL_STATUS, SECTS, SETTLING_ABROAD,
  SIBLING_COUNTS, SUB_CASTES, educationLevelForDegree, type OptionGroup,
} from '../lib/matrimonyOptions';
import type { UserProfile } from '../types';
import { belowMarriageAge, tooYoungMessage } from '../lib/legalAge';

// The religions whose families often match horoscopes (as the database counts them)
const HOROSCOPE_RELIGIONS = ['Hindu', 'Jain', 'Sikh', 'Buddhist'];

const VISIBILITY_KEY: Partial<Record<keyof UserProfile, string>> = {
  country: 'location', state: 'location', city: 'location', dateOfBirth: 'age',
};

// When one answer changes, answers that depended on it no longer apply.
function dependentChanges(profile: UserProfile, field: keyof UserProfile, value: string): Partial<UserProfile> {
  const changes: Partial<UserProfile> = {};
  if (field === 'religion' && value !== profile.religion) {
    changes.caste = '';
    changes.subCaste = '';
    if (!SECTS[value]?.includes(profile.sect ?? '')) changes.sect = '';
    if (!GOTRA_RELIGIONS.includes(value)) changes.gotra = '';
  }
  if (field === 'caste' && value !== profile.caste) changes.subCaste = '';
  if (field === 'brothers' && (value === '' || value === '0')) changes.brothersMarried = '';
  if (field === 'sisters' && (value === '' || value === '0')) changes.sistersMarried = '';
  if (field === 'children' && (value === '' || value === 'No')) changes.childrenCount = '';
  if (field === 'country' && value !== profile.country) {
    changes.state = '';
    changes.city = '';
    if (value === 'India') changes.residentialStatus = '';
  }
  if (field === 'state' && value !== profile.state) changes.city = '';
  // The state list offered without a country is India's
  if ((field === 'state' || field === 'city') && value && !profile.country
    && INDIAN_STATES.includes(field === 'state' ? value : profile.state ?? '')) changes.country = 'India';
  if (field === 'degree' && !profile.educationLevel) {
    const level = educationLevelForDegree(value);
    if (level) changes.educationLevel = level;
  }
  return changes;
}

// ============================================================================
// ProfileView (Phase 3.1 — full attribute set)
//
// Renders all 90+ fields from the schema, organized into clear sections.
// Every edit hits Supabase via profileService.
// ============================================================================

const ProfileView: React.FC = () => {
  const { profile, profileRow, refreshProfile, session } = useAuth();
  const { showToast } = useToast();

  const [editingField, setEditingField] = useState<keyof UserProfile | null>(null);
  const [editValue, setEditValue] = useState<string | number>('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [summaryEditValue, setSummaryEditValue] = useState('');

  const photos = profileRow?.photo_urls ?? [];

  // ---- completion calc -----------------------------------------------------
  const { completionPercentage, estimatedMinutes } = useMemo(
    () => (profile ? profileCompletion(profile, photos.length) : { completionPercentage: 0, estimatedMinutes: 0 }),
    [profile, photos.length],
  );

  // ---- free searches for completed sections (lib/profileRewards.ts) ---------
  // The database counts them; read again after every save
  const [sections, setSections] = useState<ProfileSections | null>(null);
  const savedAt = profileRow?.updated_at;
  useEffect(() => {
    let live = true;
    fetchProfileSections().then((s) => { if (live && s) setSections(s); });
    return () => { live = false; };
  }, [savedAt]);

  // A section just completed: say what it earned
  const bonus = profile?.searchBonus ?? 0;
  const isPro = profile?.subscriptionTier === 'PRO';
  const lastBonus = useRef<number | null>(null);
  useEffect(() => {
    if (lastBonus.current !== null && bonus > lastBonus.current) {
      showToast(isPro
        ? 'Section complete! Your profile is stronger for it.'
        : `Section complete! You now get ${DAILY_LIMITS.FREE.searches + bonus} free AI searches a day.`, 'success');
    }
    lastBonus.current = bonus;
  }, [bonus, isPro, showToast]);

  // The badge on a section's heading: earned, or how many answers are left
  const rewardBadge = (id: SectionId): { badge?: string; badgeTone?: 'done' | 'todo' } => {
    const s = sections?.sections.find((x) => x.id === id);
    if (!s) return {};
    if (s.complete) return { badge: '✓ +1 search a day', badgeTone: 'done' };
    const left = s.needed - s.answered;
    return { badge: `${left} more for +1 search a day`, badgeTone: 'todo' };
  };

  // ---- helpers -------------------------------------------------------------
  const startEditing = (field: keyof UserProfile, currentValue: unknown) => {
    setEditingField(field);
    setEditValue((currentValue as string | number | null | undefined) ?? '');
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async () => {
    if (!editingField || !session?.user.id) return;
    // A required answer can be changed, not removed (state only in India)
    const required = editingField in REQUIRED_LABELS
      && (editingField !== 'state' || (profile?.country ?? 'India') === 'India');
    if (required && String(editValue ?? '').trim() === '') {
      showToast(`${REQUIRED_LABELS[editingField as keyof typeof REQUIRED_LABELS]} is required`, 'error');
      return;
    }
    // The legal age to marry in India depends on the gender (18 for women,
    // 21 for men), so a new age, date of birth or gender is checked against it
    const forSomeoneElse = (profile?.profileCreatedFor ?? 'Myself') !== 'Myself';
    const tooYoung = (gender: string | undefined, age: number | null | undefined) =>
      belowMarriageAge(gender, age) ? tooYoungMessage(gender, forSomeoneElse) : null;
    const refuse = (message: string) => showToast(message, 'error');

    const change: Partial<UserProfile> = {};
    if (editingField === 'age' || editingField === 'nationalityCount') {
      const n = Number(editValue);
      if (Number.isNaN(n)) return refuse('Must be a number');
      const young = editingField === 'age' ? tooYoung(profile?.gender, n) : null;
      if (young) return refuse(young);
      (change as Record<string, unknown>)[editingField] = n;
    } else if (editingField === 'dateOfBirth' && editValue !== '') {
      const age = ageFromDateOfBirth(String(editValue));
      if (age === null || age > 99) return refuse('Please choose a full date of birth');
      const young = tooYoung(profile?.gender, age);
      if (young) return refuse(young);
      change.dateOfBirth = String(editValue);
    } else {
      const young = editingField === 'gender' ? tooYoung(String(editValue), profile?.age) : null;
      if (young) return refuse(young);
      (change as Record<string, unknown>)[editingField] = editValue;
      if (profile) Object.assign(change, dependentChanges(profile, editingField, String(editValue)));
    }

    setSavingField(editingField as string);
    const result = await updateProfile(session.user.id, change);
    setSavingField(null);
    if (result.error) {
      showToast(`Couldn't save: ${result.error}`, 'error');
      return;
    }
    showToast('Saved', 'success');
    setEditingField(null);
    await refreshProfile();
  };

  const handleToggleVisibility = async (field: string) => {
    if (!session?.user.id || !profileRow) return;
    const currentHidden = profileRow.hidden_fields ?? [];
    const isHidden = currentHidden.includes(field);
    const newHidden = isHidden
      ? currentHidden.filter((k) => k !== field)
      : [...currentHidden, field];
    const { error } = await supabase
      .from('profiles')
      .update({ hidden_fields: newHidden })
      .eq('id', session.user.id);
    if (error) {
      showToast(`Couldn't update visibility: ${error.message}`, 'error');
      return;
    }
    showToast(isHidden ? 'Now visible' : 'Hidden', 'info');
    await refreshProfile();
  };

  const handleSaveSummary = async () => {
    if (!session?.user.id) return;
    if (summaryEditValue.trim().length < ABOUT_ME_MIN) {
      showToast(`Please write at least ${ABOUT_ME_MIN} characters about yourself.`, 'error');
      return;
    }
    setSavingField('description');
    const result = await updateProfile(session.user.id, { description: summaryEditValue });
    setSavingField(null);
    if (result.error) {
      showToast(`Couldn't save: ${result.error}`, 'error');
      return;
    }
    showToast('About Me updated', 'success');
    setIsEditingSummary(false);
    await refreshProfile();
  };

  // ---- photos --------------------------------------------------------------
  const [photoUploading, setPhotoUploading] = useState(false);

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user.id) return;
    e.target.value = '';
    setPhotoUploading(true);
    const result = await addPhoto(session.user.id, file, photos);
    setPhotoUploading(false);
    if (result.error) {
      showToast(`Upload failed: ${result.error}`, 'error');
      return;
    }
    showToast('Photo added', 'success');
    await refreshProfile();
  };

  const handleReplacePhoto = async (oldUrl: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user.id) return;
    e.target.value = '';
    setPhotoUploading(true);
    const result = await replacePhoto(session.user.id, oldUrl, file, photos);
    setPhotoUploading(false);
    if (result.error) {
      showToast(`Replace failed: ${result.error}`, 'error');
      return;
    }
    showToast('Photo replaced', 'success');
    await refreshProfile();
  };

  const handleRemovePhoto = async (url: string) => {
    if (!session?.user.id) return;
    if (!window.confirm('Remove this photo?')) return;
    const result = await removePhoto(session.user.id, url, photos);
    if (result.error) {
      showToast(`Couldn't remove: ${result.error}`, 'error');
      return;
    }
    showToast('Photo removed', 'success');
    await refreshProfile();
  };

  // ---- render row helper ---------------------------------------------------
  const renderRow = (
    field: keyof UserProfile,
    label: string,
    icon?: React.ReactNode,
    inputType: 'text' | 'number' | 'textarea' | 'select' = 'text',
    options: string[] = [],
    extra: { editor?: React.ReactNode; display?: string; editable?: boolean } = {},
  ) => {
    if (!profile) return null;
    // Some answers are shown or hidden together: country, state and city with
    // the location, the date of birth with the age
    const visibilityKey = VISIBILITY_KEY[field] ?? field;
    const isHidden = (profile.hiddenFields ?? []).includes(visibilityKey);
    return (
      <PropertyRow
        key={field}
        label={label}
        value={(profile[field] as string | number | null) ?? null}
        displayValue={extra.display}
        editor={editingField === field ? extra.editor : undefined}
        icon={icon}
        isEditable={extra.editable ?? true}
        isEditing={editingField === field}
        editValue={editValue}
        onEdit={() => startEditing(field, profile[field])}
        onEditChange={(val) => setEditValue(val)}
        onCancel={cancelEditing}
        onSave={saveField}
        inputType={inputType}
        options={options}
        isHidden={isHidden}
        onToggleVisibility={() => handleToggleVisibility(visibilityKey)}
      />
    );
  };

  // A list you can type into (long lists, or ones that take a typed answer)
  const renderChoice = (
    field: keyof UserProfile,
    label: string,
    list: { options?: string[]; groups?: OptionGroup[]; allowCustom?: boolean },
    display?: string,
  ) => renderRow(field, label, undefined, 'select', [], {
    display,
    editor: (
      <ChoiceField
        value={String(editValue ?? '')}
        onChange={(v) => setEditValue(v)}
        options={list.options}
        groups={list.groups}
        allowCustom={list.allowCustom}
        size="compact"
        clearLabel="Clear"
        autoFocus
        ariaLabel={label}
      />
    ),
  });

  // Several answers, tapped on and off
  const renderChips = (field: keyof UserProfile, label: string, list: { options?: string[]; groups?: OptionGroup[] }) =>
    renderRow(field, label, undefined, 'textarea', [], {
      editor: (
        <ChipsField
          value={String(editValue ?? '')}
          onChange={(v) => setEditValue(v)}
          options={list.options}
          groups={list.groups}
        />
      ),
    });

  // ---- subscription badge --------------------------------------------------
  const renderSubscriptionBadge = () => {
    const tier = profile?.subscriptionTier || 'FREE';
    if (tier === 'PRO') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs font-bold rounded-md shadow-sm uppercase tracking-widest">
          <IconZap /> PRO
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-zinc-700 text-xs font-bold rounded-md uppercase tracking-widest">
        FREE
      </div>
    );
  };

  if (!profile) {
    return <div className="p-12 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto py-12 px-6 lg:px-12 animate-fade-in">
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              My Profile {renderSubscriptionBadge()}
            </div>
          }
        />

        {/* Free searches for filling in the profile (lib/profileRewards.ts) */}
        <ProfileRewardsCard sections={sections} isPro={profile.subscriptionTier === 'PRO'}
          completionPercentage={completionPercentage} estimatedMinutes={estimatedMinutes} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* LEFT — INFORMATION */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 pb-2 mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Information</h2>
            </div>

            {/* About Me */}
            <div className="mb-8 group">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl" aria-hidden="true">✨</span>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">About Me</h3>
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300">Required</span>
              </div>

              {isEditingSummary ? (
                <div className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-lg shadow-sm overflow-hidden ring-2 ring-blue-50 dark:ring-blue-900/10">
                  <textarea
                    value={summaryEditValue}
                    onChange={(e) => setSummaryEditValue(e.target.value)}
                    className="w-full p-4 text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-transparent outline-none resize-none min-h-[140px] font-sans"
                    placeholder="Write a few sentences about yourself…"
                    autoFocus
                  />
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-zinc-800 px-3 py-2 border-t border-gray-100 dark:border-zinc-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{savingField === 'description' ? 'Saving…' : `${summaryEditValue.trim().length} characters (at least ${ABOUT_ME_MIN})`}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setIsEditingSummary(false)} disabled={savingField === 'description'} className="text-xs font-medium text-gray-600 hover:text-black dark:text-gray-400 dark:hover:text-white px-3 py-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">Cancel</button>
                      <button onClick={handleSaveSummary} disabled={savingField === 'description'} className="text-xs font-bold bg-black dark:bg-white text-white dark:text-black px-4 py-1.5 rounded shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60">Save</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="relative p-5 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/30 hover:bg-white dark:hover:bg-zinc-900 hover:border-gray-300 dark:hover:border-zinc-600 transition-all cursor-text group/summary"
                  onClick={() => { setSummaryEditValue(profile.description || ''); setIsEditingSummary(true); }}
                >
                  <p className="text-sm leading-7 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {profile.description || <span className="text-gray-500 dark:text-gray-400 italic">No summary yet. Click to add one.</span>}
                  </p>
                  <div className="absolute top-2 right-2 opacity-0 group-hover/summary:opacity-100 transition-all duration-200">
                    <button className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shadow-sm px-2 py-1 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors">
                      <IconEdit /> Edit
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* === REQUIRED === */}
            <InfoSection title="Required details" id="section-required" badge="Every member gives these" badgeTone="required">
              {renderRow('profileCreatedFor', 'Profile created for', undefined, 'select', PROFILE_CREATED_FOR)}
              {renderRow('name', 'Name')}
              {renderRow('dateOfBirth', 'Date of birth', undefined, 'text', [], {
                display: profile.dateOfBirth ? `${formatDateOfBirth(profile.dateOfBirth)} (only your age is shown)` : undefined,
                editor: <DateOfBirthField value={String(editValue ?? '')} onChange={(v) => setEditValue(v)} size="compact" />,
              })}
              {renderRow('age', 'Age', undefined, 'number', [], { editable: !profile.dateOfBirth })}
              {renderRow('gender', 'Gender', undefined, 'select', GENDERS)}
              {renderRow('interestedIn', 'Interested in', undefined, 'select', INTERESTED_IN)}
              {renderRow('maritalStatus', 'Marital status', undefined, 'select', MARITAL_STATUS)}
              {renderRow('children', 'Children', undefined, 'select', CHILDREN, {
                display: formatChildren(profile.children, profile.childrenCount),
              })}
              {profile.children && profile.children !== 'No' && renderRow('childrenCount', 'Number of children', undefined, 'select', CHILDREN_COUNT)}
              {renderChoice('height', 'Height', { options: HEIGHTS })}
              {renderChoice('country', 'Country', { groups: COUNTRIES })}
              {(profile.country ?? 'India') === 'India'
                ? renderChoice('state', 'State', { options: INDIAN_STATES })
                : renderRow('state', 'State / province')}
              {renderChoice('city', 'City', { options: CITIES_BY_STATE[profile.state ?? ''] ?? [], allowCustom: true })}
              {!profile.city && renderRow('location', 'Location (as typed before)')}
              {renderRow('religion', 'Religion', undefined, 'select', RELIGIONS)}
              {renderChoice('motherTongue', 'Mother tongue', { groups: MOTHER_TONGUES })}
              {renderRow('educationLevel', 'Highest qualification', undefined, 'select', EDUCATION_LEVELS)}
              {renderChoice('occupation', 'Occupation', { groups: OCCUPATIONS, allowCustom: true })}
            </InfoSection>

            {/* === RELIGION & COMMUNITY (a reward section) === */}
            <InfoSection title="Religion & community" id="section-community" {...rewardBadge('community')}>
              {SECTS[profile.religion] && renderChoice('sect', SECT_LABEL[profile.religion], { options: SECTS[profile.religion] })}
              {renderChoice('caste', CASTES[profile.religion] ? 'Caste' : 'Caste / community', {
                options: [PREFER_NOT_TO_SAY, ...(CASTES[profile.religion] ?? [])], allowCustom: true,
              })}
              {renderChoice('subCaste', 'Sub-caste', { options: SUB_CASTES[profile.caste ?? ''] ?? [], allowCustom: true })}
              {GOTRA_RELIGIONS.includes(profile.religion) && renderChoice('gotra', 'Gotra', { options: GOTRAS, allowCustom: true })}
              {renderRow('openToOtherCommunities', 'Other communities', undefined, 'select', OPEN_TO_OTHER_COMMUNITIES)}
              {renderChips('languages', 'Languages', { options: LANGUAGES_SPOKEN })}
              {HOROSCOPE_RELIGIONS.includes(profile.religion) && (
                <>
                  {renderRow('manglik', 'Manglik', undefined, 'select', MANGLIK)}
                  {renderRow('rashi', 'Rashi (moon sign)', undefined, 'select', RASHI)}
                  {renderChoice('nakshatra', 'Nakshatra', { options: NAKSHATRA })}
                  {renderRow('birthTime', 'Time of birth', undefined, 'text', [], {
                    display: formatBirthTime(profile.birthTime),
                    editor: (
                      <input
                        type="time"
                        value={String(editValue ?? '')}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm outline-none text-gray-900 dark:text-gray-100"
                        autoFocus
                      />
                    ),
                  })}
                  {renderRow('birthPlace', 'Place of birth')}
                  {renderRow('horoscopeMatch', 'Horoscope match', undefined, 'select', HOROSCOPE_MATCH)}
                </>
              )}
            </InfoSection>

            {/* === EDUCATION & CAREER (a reward section) === */}
            <InfoSection title="Education & career" id="section-career" {...rewardBadge('career')}>
              {renderChoice('degree', 'Degree', { groups: DEGREES, allowCustom: true })}
              {renderRow('university', 'College / university')}
              {renderRow('employedIn', 'Employed in', undefined, 'select', EMPLOYED_IN)}
              {profile.employedIn !== 'Not working' && renderRow('jobTitle', 'Job title')}
              {profile.employedIn !== 'Not working' && renderRow('work', 'Workplace')}
              {profile.employedIn !== 'Not working' && renderRow('workStyle', 'Work style', undefined, 'select', ['Remote', 'Hybrid', 'In-office', 'Self-employed', `Don't work`])}
              {renderChoice('annualIncome', 'Annual income', { groups: ANNUAL_INCOME })}
              {profile.country && profile.country !== 'India' && renderRow('residentialStatus', 'Residential status', undefined, 'select', RESIDENTIAL_STATUS)}
            </InfoSection>

            {/* === FAMILY (a reward section) === */}
            <InfoSection title="Family" id="section-family" {...rewardBadge('family')}>
              {renderRow('familyType', 'Family type', undefined, 'select', FAMILY_TYPE)}
              {renderRow('familyStatus', 'Family status', undefined, 'select', FAMILY_STATUS)}
              {renderRow('familyValues', 'Family values', undefined, 'select', FAMILY_VALUES)}
              {renderRow('fatherOccupation', "Father's occupation", undefined, 'select', FATHER_OCCUPATION)}
              {renderRow('motherOccupation', "Mother's occupation", undefined, 'select', MOTHER_OCCUPATION)}
              {renderRow('brothers', 'Brothers', undefined, 'select', SIBLING_COUNTS, {
                display: formatSiblings(profile.brothers, profile.brothersMarried),
              })}
              {profile.brothers && profile.brothers !== '0' && renderRow('brothersMarried', 'Brothers married', undefined, 'select', SIBLING_COUNTS)}
              {renderRow('sisters', 'Sisters', undefined, 'select', SIBLING_COUNTS, {
                display: formatSiblings(profile.sisters, profile.sistersMarried),
              })}
              {profile.sisters && profile.sisters !== '0' && renderRow('sistersMarried', 'Sisters married', undefined, 'select', SIBLING_COUNTS)}
              {renderRow('familyLocation', 'Family lives in')}
              {renderRow('livingWithFamily', 'Lives with family', undefined, 'select', LIVING_WITH_FAMILY)}
              {renderRow('familyCloseness', 'Closeness to family', undefined, 'select', ['Very close', 'Close', 'Moderate', `We're not close`])}
              {renderRow('aboutFamily', 'About my family', undefined, 'textarea')}
            </InfoSection>

            {/* === LIFESTYLE (a reward section) === */}
            <InfoSection title="Lifestyle" id="section-lifestyle" {...rewardBadge('lifestyle')}>
              {renderRow('dietaryPreferences', 'Diet', undefined, 'select', DIETS)}
              {renderRow('drinking', 'Drinking', undefined, 'select', ['No', 'Socially', 'Regularly'])}
              {renderRow('smoking', 'Smoking', undefined, 'select', ['No', 'Socially', 'Regularly'])}
              {renderRow('gymRoutine', 'Exercise', undefined, 'select', ['Daily', '3-4 times a week', '1-2 times a week', 'Occasionally', 'Never'])}
              {renderRow('sleepSchedule', 'Sleep schedule', undefined, 'select', ['Early Bird', 'Night Owl', 'Flexible', 'Irregular'])}
              {renderRow('canCook', 'Can cook?', undefined, 'select', ['Excellent', 'Decent', 'Basic', `Can't cook`])}
              {renderChips('hobbies', 'Hobbies & interests', { groups: HOBBY_GROUPS })}
              {renderRow('readingInterest', 'Reading', undefined, 'select', ['Avid reader', 'Occasional', `I prefer audiobooks`, `I don't read much`])}
              {renderRow('sportsInterest', 'Sports interest', undefined, 'select', ['Avid fan', 'Casual viewer', 'I play, not watch', 'Not interested'])}
              {renderRow('lovesTravel', 'Loves travel?', undefined, 'select', ['Yes, frequently', 'Occasionally', `I prefer staying home`])}
              {renderRow('travelStyle', 'Travel style', undefined, 'select', ['Budget/Backpacking', 'Standard', 'Luxury', 'Adventure', 'Relaxing', 'Cultural'])}
            </InfoSection>

            {/* === APPEARANCE (a reward section) === */}
            <InfoSection title="Appearance" id="section-appearance" {...rewardBadge('appearance')}>
              {renderRow('bodyType', 'Body type', undefined, 'select', ['Slim', 'Athletic', 'Average', 'Curvy', 'Plus Size', 'Muscular'])}
              {renderRow('hairColor', 'Hair colour', undefined, 'select', ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Dyed/Other'])}
              {renderRow('hairType', 'Hair type', undefined, 'select', ['Straight', 'Wavy', 'Curly', 'Coily', 'Bald'])}
              {renderRow('eyeColor', 'Eye colour', undefined, 'select', ['Brown', 'Blue', 'Green', 'Hazel', 'Gray', 'Amber', 'Other'])}
              {renderRow('wearsGlasses', 'Wears glasses?', undefined, 'select', ['Yes', 'No', 'Sometimes'])}
              {renderRow('hasTattoos', 'Tattoos?', undefined, 'select', ['Yes', 'No', 'A few small ones'])}
              {renderRow('clothingStyle', 'Style', undefined, 'select', ['Casual', 'Formal', 'Streetwear', 'Vintage', 'Minimalist', 'Sporty', 'Bohemian', 'Preppy'])}
            </InfoSection>

            {/* === PLANS & PERSONALITY (a reward section) === */}
            <InfoSection title="Plans & personality" id="section-plans" {...rewardBadge('plans')}>
              {renderRow('marriageTimeline', 'Marriage timeline', undefined, 'select', ['ASAP', 'Within 6 months', 'Within 1 year', '1-2 years', '3-5 years', '5+ years', 'Not sure yet'])}
              {renderRow('familyPlans', 'Wants children?', undefined, 'select', ['Wants children', 'Open to children', 'Does not want children', 'Already have, want more', 'Already have, no more'])}
              {renderRow('settlingAbroad', 'Settling abroad', undefined, 'select', SETTLING_ABROAD)}
              {renderRow('loveLanguage', 'Love language', undefined, 'select', ['Words of Affirmation', 'Acts of Service', 'Receiving Gifts', 'Quality Time', 'Physical Touch'])}
              {renderRow('socialBattery', 'Social battery', undefined, 'select', ['Introvert', 'Ambivert', 'Extrovert', 'Social Butterfly', 'Homebody'])}
              {renderRow('attachmentStyle', 'Attachment style', undefined, 'select', ['Secure', 'Anxious', 'Avoidant', 'Disorganized', `Don't know`])}
              {renderRow('conflictResolution', 'Conflict style', undefined, 'select', ['Calm discussion', 'Needs space', 'Direct & assertive', 'Avoidant'])}
              {renderRow('financialApproach', 'Money', undefined, 'select', ['Saver', 'Spender', 'Balanced', 'Investor'])}
              {renderRow('futurePlans', '5-year vision', undefined, 'textarea')}
              {renderRow('dreamHouseType', 'Dream home', undefined, 'select', ['Apartment in the city', 'Suburban house', 'Rural farm/cottage', 'Beach house', 'Travel & live nomadically', 'Off-grid'])}
              {renderRow('pets', 'Pets', undefined, 'select', ['Has pets', 'No pets', 'Wants pets', 'Allergic'])}
            </InfoSection>

            {/* === MORE ABOUT YOU (optional, not counted) === */}
            <InfoSection title="More about you">
              {renderRow('hometown', 'Grew up in')}
              {renderRow('disability', 'Disability', undefined, 'select', DISABILITY)}
              {renderRow('pronouns', 'Pronouns', undefined, 'select', ['He/Him', 'She/Her', 'They/Them', 'He/They', 'She/They', 'Other'])}
              {renderRow('sexuality', 'Sexuality', undefined, 'select', ['Straight', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Asexual', 'Queer', 'Other', 'Prefer not to say'])}
              {renderRow('ethnicity', 'Ethnicity')}
              {renderRow('race', 'Race', undefined, 'select', ['Asian', 'Black/African', 'Hispanic/Latino', 'Middle Eastern', 'Native American', 'Pacific Islander', 'South Asian', 'White/Caucasian', 'Mixed', 'Other'])}
              {renderRow('nationalityCount', 'Number of nationalities', undefined, 'number')}
              {renderRow('zodiac', 'Zodiac (sun sign)', undefined, 'select', ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'])}
              {renderRow('politics', 'Politics', undefined, 'select', ['Liberal', 'Moderate', 'Conservative', 'Apolitical', 'Other'])}
              {renderRow('facialHair', 'Facial hair', undefined, 'select', ['Clean shaven', 'Stubble', 'Beard', 'Moustache', 'Goatee', `Doesn't apply`])}
              {renderRow('makeupRoutine', 'Makeup', undefined, 'select', ['None', 'Minimal', 'Daily', 'Special occasions only', `Doesn't apply`])}
              {renderRow('dressesWell', 'Dresses well?', undefined, 'select', ['Yes', 'Sometimes', `I don't focus on it`])}
              {renderRow('wearsLenses', 'Wears contact lenses?', undefined, 'select', ['Yes', 'No', 'Sometimes'])}
              {renderRow('wearsJewelry', 'Wears jewelry?', undefined, 'select', ['Always', 'Sometimes', 'Rarely', 'Never'])}
              {renderRow('bodyHair', 'Body hair', undefined, 'select', ['Natural', 'Trimmed', 'Removed', 'Prefer not to say'])}
              {renderRow('hygiene', 'Hygiene', undefined, 'select', ['Very meticulous', 'Standard daily routine', 'Easygoing'])}
              {renderRow('covidVaccine', 'COVID vaccine', undefined, 'select', ['Vaccinated', 'Not vaccinated', 'Prefer not to say'])}
              {renderRow('bakingInterest', 'Baking', undefined, 'select', ['Love it', 'Occasionally', `Don't bake`])}
              {renderRow('favoriteDrink', 'Favourite drink')}
              {renderRow('shoppingPreference', 'Shopping', undefined, 'select', ['In-store', 'Online', 'Both', `I don't enjoy shopping`])}
              {renderRow('isOrganised', 'Organisation', undefined, 'select', ['Very organised', 'Somewhat', 'Messy but functional', 'Chaotic'])}
              {renderRow('snoring', 'Snoring', undefined, 'select', ['Never', 'Sometimes', 'Often', `I don't know`])}
              {renderRow('drivesCar', 'Drives a car?', undefined, 'select', ['Yes', 'No', 'Sometimes'])}
              {renderRow('hasDriversLicense', `Driver's licence`, undefined, 'select', ['Yes', 'No', 'Learner permit'])}
              {renderRow('livingPreference', 'Living situation', undefined, 'select', ['Lives alone', 'With roommates', 'With family', 'With partner', 'Other'])}
              {renderRow('phoneType', 'Phone', undefined, 'select', ['iPhone', 'Android', `Don't care`])}
              {renderRow('nextTravelDestination', 'Next destination')}
              {renderRow('musicGenre', 'Favourite music genre')}
              {renderRow('therapyHistory', 'Therapy', undefined, 'select', ['Currently', 'In the past', 'Open to it', 'Not for me'])}
              {renderRow('childhoodDescription', 'Childhood', undefined, 'textarea')}
              {renderRow('familyHealthHistory', 'Family health history', undefined, 'textarea')}
              {renderRow('criminalRecord', 'Criminal record', undefined, 'select', ['No', 'Minor offense', 'Yes — happy to explain'])}
              {renderRow('interracialMarriage', 'Open to interracial marriage?', undefined, 'select', ['Yes', 'No', 'Prefer same race'])}
              {renderRow('financialSplitting', 'Approach to splitting bills', undefined, 'select', ['50/50', 'Proportional to income', `One partner pays`, `It depends`])}
              {renderRow('sexStyle', 'Sex style', undefined, 'select', ['Adventurous', 'Romantic', 'Vanilla', 'Reserved', 'Open to explore', 'Prefer not to say'])}
            </InfoSection>

            {/* === SOCIAL === */}
            <InfoSection title="Socials">
              {renderRow('linkedin', 'LinkedIn URL')}
              {renderRow('instagram', 'Instagram handle')}
              {renderRow('facebook', 'Facebook URL')}
              {renderRow('twitter', 'X / Twitter handle')}
            </InfoSection>

            {/* Verification status */}
            <div className="pt-6 border-t border-gray-100 dark:border-zinc-800">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Verifications</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 p-2 rounded">
                  <span className="flex items-center gap-2"><IconShield /> Identity</span>
                  {profile.isVerified ? (
                    <span className="text-green-600 dark:text-green-400 font-bold text-xs flex items-center gap-1"><IconCheck /> Verified</span>
                  ) : profile.verificationStatus === 'pending' ? (
                    <span className="text-yellow-600 dark:text-yellow-400 font-bold text-xs flex items-center gap-1"><IconClock /> Pending</span>
                  ) : (
                    <button
                      onClick={() => setShowVerifyModal(true)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-xs"
                    >
                      Get verified →
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 p-2 rounded">
                  <span className="flex items-center gap-2">📧 Email</span>
                  <span className="text-green-600 dark:text-green-400 font-bold text-xs flex items-center gap-1"><IconCheck /> Verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — PHOTOS */}
          <div>
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 pb-2 mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Photos</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{photos.length}/12</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {photos.map((url, idx) => (
                <div key={idx} className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-800 group relative bg-gray-50 dark:bg-zinc-900">
                  <img src={url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={`photo-${idx}`} loading="lazy" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2 z-20">
                    <label className="cursor-pointer bg-white text-gray-800 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-gray-100 shadow-sm flex items-center gap-1 transition-transform hover:scale-105">
                      <IconEdit /> Replace
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleReplacePhoto(url, e)} />
                    </label>
                    <button onClick={() => handleRemovePhoto(url)} className="bg-red-500 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-red-600 shadow-sm flex items-center gap-1 transition-transform hover:scale-105">
                      <IconX /> Remove
                    </button>
                  </div>
                </div>
              ))}

              {photos.length < 12 && (
                <label className="aspect-[3/4] rounded-lg overflow-hidden border-2 border-dashed border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
                  {photoUploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-black dark:border-zinc-600 dark:border-t-white rounded-full animate-spin" />
                      <span className="text-[10px] uppercase font-bold">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <IconUpload />
                      <span className="text-xs font-bold uppercase">Add Photo</span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*" disabled={photoUploading} onChange={handleAddPhoto} />
                </label>
              )}
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">
              Hover any photo to replace or remove it. Up to 12 photos allowed.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4 text-xs text-blue-800 dark:text-blue-200">
              <p className="font-bold mb-1">💡 Privacy tip</p>
              <p>Click the eye icon next to any field to hide it from your profile. Hidden answers still help pick your matches, but nobody sees them or can search by them.</p>
            </div>
          </div>
        </div>
      </div>
      {showVerifyModal && <VerificationRequestModal onClose={() => setShowVerifyModal(false)} />}
    </div>
  );
};

export default ProfileView;
