import React, { useState, useEffect, useEffectEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import {
  submitVerificationRequest, getMyVerificationRequest,
} from '../lib/verificationService';
import type { VerificationRequestRow } from '../lib/verificationService';
import { IconX, IconCheck, IconShield } from '../constants';

// ============================================================================
// VerificationRequestModal
//
// The user adds links to their social profiles; an admin checks them and
// approves (Admin → Verifications), which gives the profile its verified
// badge. The server needs at least 2 of the 4 links
// (submit_verification_request); a pending request can be updated.
//
// Rendered into <body> through a portal: it's opened from inside the sidebar,
// whose slide-in transform would otherwise squeeze it to the sidebar's width.
// ============================================================================

interface VerificationRequestModalProps {
  onClose: () => void;
  onSubmitted?: () => void;
}

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'twitter';

const MIN_LINKS = 2;  // same rule as submit_verification_request

const PLATFORMS: {
  key: Platform; label: string; domains: string[]; placeholder: string; badgeClass: string; mark: React.ReactNode;
}[] = [
  {
    key: 'linkedin', label: 'LinkedIn', domains: ['linkedin.com'], placeholder: 'linkedin.com/in/your-name',
    badgeClass: 'bg-[#0A66C2] text-white text-[13px]', mark: 'in',
  },
  {
    key: 'instagram', label: 'Instagram', domains: ['instagram.com'], placeholder: 'instagram.com/your-name',
    badgeClass: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
    mark: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.com'], placeholder: 'facebook.com/your-name',
    badgeClass: 'bg-[#1877F2] text-white text-[15px]', mark: 'f',
  },
  {
    key: 'twitter', label: 'X (Twitter)', domains: ['x.com', 'twitter.com'], placeholder: 'x.com/your-name',
    badgeClass: 'bg-black dark:bg-white text-white dark:text-black text-[13px]', mark: '𝕏',
  },
];

// "linkedin.com/in/asha" or a full link → a full https link, or null if it
// isn't a profile link on one of the platform's domains.
function toProfileUrl(value: string, domains: string[]): string | null {
  const text = value.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  const onPlatform = domains.some((d) => host === d || host.endsWith(`.${d}`));
  const hasProfile = url.pathname.replace(/\/+$/, '').length > 1;
  return onPlatform && hasProfile ? `https://${host}${url.pathname}${url.search}` : null;
}

const VerificationRequestModal: React.FC<VerificationRequestModalProps> = ({
  onClose, onSubmitted,
}) => {
  const { session, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [existing, setExisting] = useState<VerificationRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Set<Platform>>(new Set());  // left the field: show its problem
  const [urls, setUrls] = useState<Record<Platform, string>>({
    linkedin: profile?.linkedin ?? '',
    instagram: profile?.instagram ?? '',
    facebook: profile?.facebook ?? '',
    twitter: profile?.twitter ?? '',
  });

  useEffect(() => {
    if (!session?.user.id) return;
    getMyVerificationRequest(session.user.id).then(({ request }) => {
      setExisting(request);
      if (request) {
        setUrls((prev) => ({
          linkedin: request.linkedin_url ?? prev.linkedin,
          instagram: request.instagram_url ?? prev.instagram,
          facebook: request.facebook_url ?? prev.facebook,
          twitter: request.twitter_url ?? prev.twitter,
        }));
      }
      setLoading(false);
    });
  }, [session?.user.id]);

  const links = PLATFORMS.map((p) => ({ ...p, value: urls[p.key], url: toProfileUrl(urls[p.key], p.domains) }));
  const invalid = links.filter((l) => l.value.trim() && !l.url);
  const validCount = links.filter((l) => l.url).length;
  const canSubmit = validCount >= MIN_LINKS && invalid.length === 0;

  const isPending = existing?.status === 'pending';
  const wasRejected = existing?.status === 'rejected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const link = (key: Platform) => links.find((l) => l.key === key)?.url ?? '';
    const { error } = await submitVerificationRequest({
      linkedinUrl: link('linkedin'),
      instagramUrl: link('instagram'),
      facebookUrl: link('facebook'),
      twitterUrl: link('twitter'),
      userNotes: '',
    });
    setSubmitting(false);
    if (error) {
      showToast(`Couldn't submit: ${error}`, 'error');
      return;
    }
    showToast(isPending ? 'Links updated.' : "Sent for review. We'll check your links within 24–48 hours.", 'success');
    await refreshProfile();
    onSubmitted?.();
    onClose();
  };

  if (profile?.isVerified) {
    return (
      <Wrapper onClose={onClose} labelledBy="verify-title">
        <div className="p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
            <IconCheck className="w-7 h-7" />
          </div>
          <h2 id="verify-title" className="text-xl font-bold text-gray-900 dark:text-white mb-2">You're verified</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your profile shows the verified badge to other people.</p>
          <button
            onClick={onClose}
            className="mt-6 w-full py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90"
          >
            Close
          </button>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper onClose={onClose} labelledBy="verify-title">
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 flex-shrink-0">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
            <IconShield />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="verify-title" className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {isPending ? 'Verification in review' : 'Verify your identity'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isPending
                ? "We're checking your links, usually within 24–48 hours. You can still change them below."
                : 'Add links to at least 2 of your social profiles. We check they belong to you, then add a verified badge to your profile.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {wasRejected && (
          <div className="mx-6 mb-2 flex-shrink-0 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-300">
            <p className="font-semibold">Your last request wasn't approved.</p>
            {existing?.admin_notes && <p className="mt-1 text-xs">Reason: {existing.admin_notes}</p>}
            <p className="mt-1 text-xs">Check your links and send them again.</p>
          </div>
        )}

        {/* Links */}
        <div className="px-6 py-2 space-y-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            [1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] rounded-lg bg-gray-100 dark:bg-zinc-800 animate-pulse" />)
          ) : (
            links.map((l) => {
              const showError = !!l.value.trim() && !l.url && touched.has(l.key);
              return (
                <div key={l.key}>
                  <label htmlFor={`verify-${l.key}`} className="flex items-center gap-2 mb-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200">
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold flex-shrink-0 ${l.badgeClass}`} aria-hidden="true">
                      {l.mark}
                    </span>
                    {l.label}
                    {l.url && <span className="ml-auto text-green-600 dark:text-green-400"><IconCheck className="w-4 h-4" /></span>}
                  </label>
                  <input
                    id={`verify-${l.key}`}
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={l.value}
                    onChange={(e) => setUrls((prev) => ({ ...prev, [l.key]: e.target.value }))}
                    onBlur={() => setTouched((prev) => new Set(prev).add(l.key))}
                    placeholder={l.placeholder}
                    aria-invalid={showError}
                    className={`w-full rounded-lg border bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 outline-none transition-shadow focus:ring-2 ${
                      showError
                        ? 'border-red-400 focus:ring-red-200 dark:focus:ring-red-900/50'
                        : 'border-gray-300 dark:border-zinc-700 focus:border-gray-900 dark:focus:border-zinc-400 focus:ring-gray-200 dark:focus:ring-zinc-800'
                    }`}
                  />
                  {showError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      Paste the link to your {l.label} profile, like {l.placeholder}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pt-4 pb-6 mt-2 flex-shrink-0 border-t border-gray-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className={validCount >= MIN_LINKS ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}>
              {validCount >= MIN_LINKS ? `${validCount} links added` : `${validCount} of ${MIN_LINKS} links added`}
            </span>
            <span className="text-gray-400 dark:text-zinc-500">Only our review team sees these.</span>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading || !canSubmit}
              className="px-5 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending…' : isPending ? 'Update links' : 'Send for review'}
            </button>
          </div>
        </div>
      </form>
    </Wrapper>
  );
};

// Full-screen backdrop and centred card (a bottom sheet on phones), rendered
// into <body>. Escape or a click outside closes it.
const Wrapper: React.FC<{ onClose: () => void; labelledBy: string; children: React.ReactNode }> = ({
  onClose, labelledBy, children,
}) => {
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';  // the page behind doesn't scroll
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center sm:p-4 popup-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full sm:max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

export default VerificationRequestModal;
