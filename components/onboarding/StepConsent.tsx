import React, { useState } from 'react';
import { Button } from '../NotionUI';
import { IconChevronRight, BrandMark, IconCheck } from '../../constants';
import { useAuth } from '../../lib/AuthContext';
import { recordSignupConsent, TERMS_VERSION, PRIVACY_VERSION } from '../../lib/consentService';
import { LEGAL, type LegalPageName } from '../../lib/legalInfo';

// ============================================================================
// StepConsent: before anything else, every member reads what Shaadi24 does with
// their details and agrees, and again whenever the Terms or Privacy Policy
// change (needsConsent(); App.tsx). It asks, each on its own:
//   - the Terms and Privacy Policy (already ticked on the email sign-up form)
//   - looking to marry, and giving true details (the 2016 advisory for
//     matrimonial websites asks for both)
//   - the legal age to marry (Prohibition of Child Marriage Act 2006)
//   - consent to the sensitive details (SPDI Rules 2011, rule 5; DPDP Act 2023)
// and, optionally, emails with tips and news. The short notice above them is
// the one the DPDP Rules 2025 (rule 3) describe: what, why, and how to
// withdraw, use your rights and complain.
// ============================================================================

interface StepConsentProps {
  onShowLegal: (page: LegalPageName) => void;
}

const Check: React.FC<{
  id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; muted?: boolean;
}> = ({ id, checked, onChange, children, muted }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      data-testid={id}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-zinc-600 cursor-pointer flex-shrink-0"
    />
    <span className={`text-sm leading-snug ${muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
      {children}
    </span>
  </label>
);

const StepConsent: React.FC<StepConsentProps> = ({ onShowLegal }) => {
  const { session, profileRow, refreshProfile, signOut } = useAuth();
  const meta = session?.user.user_metadata ?? {};
  // Ticked on the email sign-up form, for these versions
  const acceptedAtSignup = meta.terms_version === TERMS_VERSION && meta.privacy_version === PRIVACY_VERSION;
  // Accepted earlier versions: the documents have changed since
  const isUpdate = !!profileRow?.terms_accepted_at;

  const [agreed, setAgreed] = useState(acceptedAtSignup);
  const [marriage, setMarriage] = useState(false);
  const [legalAge, setLegalAge] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(meta.marketing_opt_in === true || profileRow?.marketing_consent === true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = agreed && marriage && legalAge && sensitive;

  const save = async () => {
    if (!session || !ready) return;
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await recordSignupConsent(session.user.id, session.user.email ?? '', marketingOptIn);
    if (saveError) {
      setError(saveError);
      setIsSaving(false);
      return;
    }
    // App.tsx moves on once the profile shows the current versions accepted
    await refreshProfile();
  };

  const legalLink = (page: LegalPageName, label: string) => (
    <button type="button" onClick={() => onShowLegal(page)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
      {label}
    </button>
  );

  return (
    <div className="max-w-xl w-full mx-auto py-8 px-6 animate-fade-in" data-testid="consent-screen">
      <div className="mb-6">
        <BrandMark className="w-14 h-14 mb-6" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
          {isUpdate ? "We've updated our Terms" : 'Before you start'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {isUpdate
            ? `${LEGAL.brand}'s Terms of Service and Privacy Policy now follow India's laws for matrimonial services. Please read them, and agree to continue.`
            : `${LEGAL.brand} is for finding a life partner to marry. Please read how we use your details, and agree to continue.`}
        </p>
      </div>

      <section aria-labelledby="notice-title" className="mb-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 p-4 text-sm text-gray-700 dark:text-gray-300">
        <h2 id="notice-title" className="font-bold text-gray-900 dark:text-white mb-2">What we use, and why</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Your account</strong> (email, how you sign in): to sign you in and keep your account safe.</li>
          <li><strong>Your profile</strong> (name, age, photos, where you live, religion, community, family, education,
            work and anything else you add): to show it to people who may want to marry you, and to find your matches.</li>
          <li><strong>What you do here</strong> (likes, matches, messages, searches): to run {LEGAL.brand} and keep
            members safe.</li>
          <li><strong>Your device and internet address</strong>: for security, and the records Indian law requires.</li>
        </ul>
        <p className="mt-2">
          Your data is kept in India and never sold. You can withdraw your consent, and see, correct or delete your data,
          in Settings; you can complain to our Grievance Officer and then to the Data Protection Board of India. All of it
          is in the {legalLink('privacy', 'Privacy Policy')}.
        </p>
      </section>

      {error && (
        <div role="alert" className="mb-4 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
          Couldn't save your answer: {error}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        {acceptedAtSignup ? (
          <p className="text-sm text-gray-700 dark:text-gray-300" data-testid="consent-terms-done">
            <span aria-hidden="true" className="inline-block mr-1 align-[-3px] text-green-600 dark:text-green-400 [&>svg]:w-4 [&>svg]:h-4"><IconCheck /></span>You agreed to the {legalLink('terms', 'Terms of Service')} and {legalLink('privacy', 'Privacy Policy')} when you
            signed up.
          </p>
        ) : (
          <Check id="consent-terms" checked={agreed} onChange={setAgreed}>
            I agree to the {legalLink('terms', 'Terms of Service')} and the {legalLink('privacy', 'Privacy Policy')}.
          </Check>
        )}
        <Check id="consent-marriage" checked={marriage} onChange={setMarriage}>
          I am looking for a life partner to marry, and the details I give will be true.
        </Check>
        <Check id="consent-age" checked={legalAge} onChange={setLegalAge}>
          The person this profile is for (me, or the family member I'm making it for, with their permission) is of the
          legal age to marry in India: 18 or older for a woman, 21 or older for a man.
        </Check>
        <Check id="consent-sensitive" checked={sensitive} onChange={setSensitive}>
          I consent to {LEGAL.brand} using the sensitive details I choose to give, such as religion, caste, horoscope,
          health or disability, and who I'm interested in, to show my profile and find my matches.
        </Check>
        <Check id="consent-marketing" checked={marketingOptIn} onChange={setMarketingOptIn} muted>
          Send me occasional tips and news about {LEGAL.brand} by email. (Optional; turn off any time in Settings.)
        </Check>

        <div className="pt-6 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Sign out
          </button>
          <Button onClick={() => {}} className="flex-none h-11 px-6 justify-center text-sm font-bold shadow-md" disabled={!ready || isSaving}>
            {isSaving ? 'Saving…' : 'Agree and continue'} <IconChevronRight />
          </Button>
        </div>
      </form>
    </div>
  );
};

export default StepConsent;
