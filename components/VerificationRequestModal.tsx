import React, { useState, useEffect, useEffectEvent, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { useNow } from '../lib/useNow';
import {
  submitVerificationRequest, getMyVerificationRequest,
} from '../lib/verificationService';
import type { VerificationRequestRow } from '../lib/verificationService';
import { fetchPose, POSES, reasonText, removeSelfie, uploadSelfie, type Pose } from '../lib/verificationSelfie';
import { IconX, IconCheck, IconShield, IconCamera, IconClock, IconChevronDown, IconLock } from '../constants';

// ============================================================================
// VerificationRequestModal
//
// The member needs two photos on their profile and takes a selfie doing the
// gesture shown (lib/verificationSelfie.ts); links to their social profiles
// are optional. An admin compares them and approves (Admin → Verifications),
// which gives the profile its verified badge, or says why not, which shows
// here (and in Settings → My requests) with a way to try again. A request in
// review shows since when; a new selfie replaces it.
//
// Rendered into <body> through a portal: it's opened from inside the sidebar,
// whose slide-in transform would otherwise squeeze it to the sidebar's width.
// ============================================================================

interface VerificationRequestModalProps {
  onClose: () => void;
  onSubmitted?: () => void;
  onAddPhotos?: () => void;  // where the member adds photos (My Profile), if not already there
}

type Platform = 'linkedin' | 'instagram' | 'facebook' | 'twitter';

const MIN_PHOTOS = 2;  // same rule as submit_verification_request

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

const REVIEW_HOURS = 48;  // what the modal promises; past it, "taking longer than usual"

const VerificationRequestModal: React.FC<VerificationRequestModalProps> = ({
  onClose, onSubmitted, onAddPhotos,
}) => {
  const { session, profile, profileRow, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [existing, setExisting] = useState<VerificationRequestRow | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changing, setChanging] = useState(false);       // a request in review: send a new one instead
  const [selfie, setSelfie] = useState<{ file: File; preview: string } | null>(null);
  const [showLinks, setShowLinks] = useState(false);
  const [touched, setTouched] = useState<Set<Platform>>(new Set());  // left the field: show its problem
  const [urls, setUrls] = useState<Record<Platform, string>>({
    linkedin: profile?.linkedin ?? '',
    instagram: profile?.instagram ?? '',
    facebook: profile?.facebook ?? '',
    twitter: profile?.twitter ?? '',
  });
  const selfieInput = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEffect(() => {
    if (!session?.user.id) return;
    void Promise.all([getMyVerificationRequest(session.user.id), fetchPose()]).then(([{ request }, todays]) => {
      setExisting(request);
      setPose(todays);
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

  // The preview's object URL goes when the selfie is replaced or the modal closes
  useEffect(() => () => { if (selfie) URL.revokeObjectURL(selfie.preview); }, [selfie]);

  const links = PLATFORMS.map((p) => ({ ...p, value: urls[p.key], url: toProfileUrl(urls[p.key], p.domains) }));
  const invalid = links.filter((l) => l.value.trim() && !l.url);
  const linkCount = links.filter((l) => l.url).length;

  const photoCount = profileRow?.photo_urls?.filter(Boolean).length ?? 0;
  const enoughPhotos = photoCount >= MIN_PHOTOS;
  const canSubmit = enoughPhotos && !!selfie && !!pose && invalid.length === 0;

  const isPending = existing?.status === 'pending';
  const wasRejected = existing?.status === 'rejected';
  const late = isPending && now - new Date(existing.created_at).getTime() > REVIEW_HOURS * 3_600_000;
  const showForm = !isPending || changing;

  const pickSelfie = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';  // the same photo again still counts as a change
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast("That isn't a photo. Please take the selfie again.", 'error');
      return;
    }
    setSelfie({ file, preview: URL.createObjectURL(file) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !session?.user.id || !selfie || !pose) return;
    setSubmitting(true);
    const uploaded = await uploadSelfie(session.user.id, selfie.file);
    if (!uploaded.path) {
      setSubmitting(false);
      showToast(`Your selfie didn't send: ${uploaded.error}`, 'error');
      return;
    }
    const link = (key: Platform) => links.find((l) => l.key === key)?.url ?? '';
    const { error } = await submitVerificationRequest({
      selfiePath: uploaded.path,
      pose,
      linkedinUrl: link('linkedin'),
      instagramUrl: link('instagram'),
      facebookUrl: link('facebook'),
      twitterUrl: link('twitter'),
      userNotes: '',
    });
    setSubmitting(false);
    if (error) {
      void removeSelfie(uploaded.path);
      showToast(error, 'error');
      return;
    }
    // The selfie this one replaces, if it was still waiting
    if (isPending && existing?.selfie_path) void removeSelfie(existing.selfie_path);
    showToast(isPending ? 'Sent again. We check it within 24–48 hours.' : "Sent for review. We'll tell you when it's done, usually within 24–48 hours.", 'success');
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

  const stepClass = 'rounded-xl border border-gray-200 dark:border-zinc-800 p-4';
  const stepTitle = 'flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white';
  const stepNumber = (n: number, done: boolean) => (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
      done ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
    }`} aria-hidden="true">
      {done ? <IconCheck className="w-3.5 h-3.5" /> : n}
    </span>
  );

  return (
    <Wrapper onClose={onClose} labelledBy="verify-title">
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" data-testid="verify-modal">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4 flex-shrink-0">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
            <IconShield />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="verify-title" className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {isPending && !changing ? 'Verification in review' : 'Get verified'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {isPending && !changing
                ? "We'll tell you as soon as it's decided."
                : 'Two photos of you and a quick selfie. Our team compares them, then your profile shows the Verified badge.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        <div className="px-6 py-2 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-[76px] rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse" />)
          ) : (
            <>
              {isPending && existing && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-900 dark:text-blue-200" data-testid="verify-status">
                  <p className="font-semibold flex items-center gap-1.5">
                    <span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconClock /></span>
                    Sent {formatDate(existing.created_at)}
                  </p>
                  <p className="mt-1 text-xs">
                    {late
                      ? "This one is taking longer than usual, sorry. It's still in the queue, and nothing is needed from you."
                      : 'We usually decide within 24–48 hours. You can keep using Shaadi24 while you wait.'}
                  </p>
                  {!changing && (
                    <button type="button" onClick={() => setChanging(true)} className="mt-2 text-xs font-semibold underline underline-offset-2" data-testid="verify-change">
                      Send a new selfie instead
                    </button>
                  )}
                </div>
              )}

              {wasRejected && existing && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-300" data-testid="verify-reason">
                  <p className="font-semibold">Your last request wasn't approved</p>
                  <p className="mt-1 text-xs">{reasonText(existing.reason_code)}</p>
                  {existing.admin_notes && <p className="mt-1 text-xs">Note from our team: {existing.admin_notes}</p>}
                  <p className="mt-1 text-xs">Try again below.</p>
                </div>
              )}

              {showForm && (
                <>
                  {/* 1. Two photos */}
                  <div className={stepClass} data-testid="verify-photos" data-ok={enoughPhotos}>
                    <p className={stepTitle}>{stepNumber(1, enoughPhotos)} Two photos of you on your profile</p>
                    <p className="mt-1 ml-8 text-xs text-gray-500 dark:text-gray-400">
                      {enoughPhotos
                        ? `You have ${photoCount}. Our team compares them with your selfie.`
                        : `You have ${photoCount}. Add ${photoCount === 0 ? 'two clear photos' : 'another clear photo'} of yourself in My Profile, then come back.`}
                    </p>
                    {!enoughPhotos && onAddPhotos && (
                      <button
                        type="button"
                        onClick={() => { onClose(); onAddPhotos(); }}
                        className="mt-2 ml-8 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-gray-500"
                      >
                        Add a photo
                      </button>
                    )}
                  </div>

                  {/* 2. The selfie */}
                  <div className={stepClass}>
                    <p className={stepTitle}>{stepNumber(2, !!selfie)} A selfie, doing this</p>
                    {pose ? (
                      <div className="mt-2 ml-8" data-testid="verify-pose" data-pose={pose}>
                        <p className="text-base font-bold text-gray-900 dark:text-white">{POSES[pose].label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{POSES[pose].how} Face the camera, in good light.</p>
                      </div>
                    ) : (
                      <p className="mt-1 ml-8 text-xs text-red-600 dark:text-red-400">Couldn't load the gesture. Close this and try again.</p>
                    )}
                    <div className="mt-3 ml-8 flex items-center gap-3">
                      {selfie && (
                        <img src={selfie.preview} alt="Your selfie" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-zinc-700" data-testid="verify-selfie-preview" />
                      )}
                      <button
                        type="button"
                        onClick={() => selfieInput.current?.click()}
                        disabled={!pose}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-black text-xs font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        <span aria-hidden="true" className="[&>svg]:w-4 [&>svg]:h-4"><IconCamera /></span>
                        {selfie ? 'Take it again' : 'Take the selfie'}
                      </button>
                      <input
                        ref={selfieInput}
                        type="file"
                        accept="image/*"
                        capture="user"
                        onChange={pickSelfie}
                        className="sr-only"
                        tabIndex={-1}
                        aria-label="Selfie"
                        data-testid="verify-selfie-input"
                      />
                    </div>
                  </div>

                  {/* 3. Links, if they like */}
                  <div className={stepClass}>
                    <button
                      type="button"
                      onClick={() => setShowLinks((v) => !v)}
                      aria-expanded={showLinks}
                      className={`${stepTitle} w-full text-left`}
                      data-testid="verify-links-toggle"
                    >
                      {stepNumber(3, linkCount > 0)}
                      <span className="flex-1">Social media links <span className="font-normal text-gray-500 dark:text-gray-400">(if you like)</span></span>
                      <span className={`transition-transform ${showLinks ? 'rotate-180' : ''}`} aria-hidden="true"><IconChevronDown /></span>
                    </button>
                    {!showLinks && (
                      <p className="mt-1 ml-8 text-xs text-gray-500 dark:text-gray-400">
                        {linkCount ? `${linkCount} added.` : 'Links to your LinkedIn, Instagram, Facebook or X help our team.'}
                      </p>
                    )}
                    {showLinks && (
                      <div className="mt-3 space-y-4">
                        {links.map((l) => {
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
                                  Paste the link to your {l.label} profile, like {l.placeholder}, or leave it empty
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pt-4 pb-6 mt-2 flex-shrink-0 border-t border-gray-100 dark:border-zinc-800">
          {showForm && (
            <p className="mb-3 text-xs text-gray-500 dark:text-zinc-500 flex items-start gap-1.5">
              <span aria-hidden="true" className="flex-none mt-px [&>svg]:w-3.5 [&>svg]:h-3.5"><IconLock /></span>
              Only our verification team sees your selfie and links. We delete the selfie once we've decided.
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {showForm ? 'Cancel' : 'Close'}
            </button>
            {showForm && (
              <button
                type="submit"
                disabled={submitting || loading || !canSubmit}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="verify-submit"
              >
                {submitting ? 'Sending…' : 'Send for review'}
              </button>
            )}
          </div>
        </div>
      </form>
    </Wrapper>
  );
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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
