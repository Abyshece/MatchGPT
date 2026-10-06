import React, { useState, useEffect, useRef } from 'react';
import CompatibilityReport from './CompatibilityReport';
import LikeButton from './LikeButton';
import BlockReportModal from './BlockReportModal';
import { IconX, IconCheck, IconChevronLeft, IconChevronRight, IconUser } from '../constants';
import { SECT_LABEL, formatBirthTime, formatChildren, formatSiblings, profileManagedBy } from '../lib/profileDisplay';
import { isNativeApp } from '../lib/nativeApp';
import type { MatchCandidate } from '../types';

// ============================================================================
// ProfileModal — restyled to match the legacy Shaadi24 MatchProfileModal.
// Two-column grid: photo+thumbnails on left, scrollable content on right.
// Sticky footer with social links + a wide pill Like button.
// ============================================================================

interface ProfileModalProps {
  candidate: MatchCandidate;
  isPro: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  onMatched?: (matchId: string, candidate: MatchCandidate) => void;
  showLikeButton?: boolean;
}

// Rows are [field, label, text shown (defaults to the answer)]
type Row = [keyof MatchCandidate, string, (string | null)?];
// One section of a profile: the rows that have an answer (and aren't hidden)
const Section: React.FC<{
  title: string;
  rows: Row[];
  answer: (k: keyof MatchCandidate) => string | null;
  children?: React.ReactNode;
}> = ({ title, rows, answer, children }) => {
  const visible = rows
    .map(([k, label, text]) => [k, label, answer(k) ? (text ?? answer(k)) : null] as const)
    .filter(([, , text]) => !!text);
  if (visible.length === 0 && !children) return null;
  return (
    <div className="mb-6">
      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">{title}</h4>
      <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-3">
        {visible.map(([k, label, text]) => (
          <div key={k as string} className="flex justify-between gap-3 py-1.5 text-sm border-b border-gray-100 dark:border-zinc-800/50 last:border-0">
            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{label}</span>
            <span className="text-gray-900 dark:text-gray-200 font-medium text-right break-words min-w-0 max-w-[65%]">{text}</span>
          </div>
        ))}
        {children}
      </div>
    </div>
  );
};

const ProfileModal: React.FC<ProfileModalProps> = ({
  candidate, isPro, onClose, onUpgrade, onMatched, showLikeButton = true,
}) => {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showBlockReport, setShowBlockReport] = useState<null | 'block' | 'report'>(null);
  const [lightbox, setLightbox] = useState<{ open: boolean; idx: number }>({ open: false, idx: 0 });
  const photos = candidate.imageUrls ?? [];
  const hidden = candidate.hiddenFields ?? [];

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox.open) setLightbox({ open: false, idx: 0 });
        else onClose();
      }
      if (lightbox.open && photos.length > 0) {
        if (e.key === 'ArrowRight') setLightbox((p) => ({ ...p, idx: (p.idx + 1) % photos.length }));
        if (e.key === 'ArrowLeft') setLightbox((p) => ({ ...p, idx: (p.idx - 1 + photos.length) % photos.length }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lightbox.open, photos.length]);

  // An answer is shown unless it's empty or its owner hid it (the server
  // already leaves hidden answers out; this is a second check).
  const answer = (k: keyof MatchCandidate): string | null => {
    if (hidden.includes(k as string)) return null;
    const val = candidate[k];
    if (val === undefined || val === null || val === '' || val === 'Not specified') return null;
    return String(val);
  };

  const c = candidate;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 popup-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 z-20 flex-none">
          <h2 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <IconUser /> Profile Details
          </h2>
          <div className="flex items-center gap-1">
            {showLikeButton && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowOverflowMenu((v) => !v); }}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-300 transition-colors"
                  aria-label="More options"
                >
                  <span className="block w-5 h-5 leading-5 text-center font-bold">⋯</span>
                </button>
                {showOverflowMenu && (
                  <div
                    className="absolute top-12 right-0 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-2xl overflow-hidden min-w-[160px] py-1 z-30"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => { setShowOverflowMenu(false); setShowBlockReport('report'); }}
                      className="w-full px-3 py-2.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      🚩 Report
                    </button>
                    <button
                      onClick={() => { setShowOverflowMenu(false); setShowBlockReport('block'); }}
                      className="w-full px-3 py-2.5 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    >
                      🚫 Block user
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-gray-500 dark:text-gray-300"
              aria-label="Close"
            >
              <IconX />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {/* LEFT — main photo + thumbnails */}
            <div className="space-y-3">
              <div
                className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 relative cursor-pointer group"
                onClick={() => photos.length && setLightbox({ open: true, idx: photoIdx })}
              >
                {photos[photoIdx] ? (
                  <>
                    <img
                      src={photos[photoIdx]}
                      alt={candidate.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md">
                        View Photos
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300 dark:text-zinc-700">👤</div>
                )}
              </div>

              {photos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {photos.slice(0, 4).map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity border-2 ${
                        i === photoIdx ? 'border-black dark:border-white' : 'border-transparent'
                      }`}
                    >
                      <img src={url} alt={`thumb ${i}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RIGHT — name, badges, compatibility, fields */}
            <div className="flex flex-col">
              {(candidate.isVerified || candidate.isPremium) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {candidate.isVerified && (
                    <div className="inline-flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-green-200 dark:border-green-800 shadow-sm">
                      <IconCheck className="w-3.5 h-3.5" /> Verified
                    </div>
                  )}
                  {candidate.isPremium && (
                    <div className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border border-blue-200 dark:border-blue-800 shadow-sm">
                      <span className="text-sm leading-none">+</span> Plus Member
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-start mb-4 gap-3">
                <div className="min-w-0">
                  <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                    {candidate.name}{candidate.age ? `, ${candidate.age}` : ''}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1 text-sm">
                    <span className="text-base">📍</span> {candidate.location}
                  </p>
                  {candidate.jobTitle && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">
                      {candidate.jobTitle}{candidate.work ? ` · ${candidate.work}` : ''}
                    </p>
                  )}
                </div>
                {candidate.compatibilityScore > 0 && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-500">{candidate.compatibilityScore}%</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Match</div>
                  </div>
                )}
              </div>

              {candidate.compatibilityScore > 0 && (
                <div className="mb-6">
                  <CompatibilityReport
                    items={candidate.compatibilityReport ?? []}
                    score={candidate.compatibilityScore}
                    isPro={isPro}
                    onUpgrade={onUpgrade}
                  />
                </div>
              )}

              {candidate.bio && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">About</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {candidate.bio}
                  </p>
                </div>
              )}

              {candidate.tags && candidate.tags.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Interests</h4>
                  <div className="flex flex-wrap gap-2">
                    {candidate.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-xs rounded-full font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Section answer={answer} title="The Basics" rows={[
                ['profileCreatedFor', 'Profile managed by', profileManagedBy(c.profileCreatedFor)],
                ['maritalStatus', 'Marital status'],
                ['children', 'Children', formatChildren(c.children, answer('childrenCount'))],
                ['height', 'Height'],
                ['dietaryPreferences', 'Diet'],
                ['hometown', 'Grew up in'],
                ['residentialStatus', 'Residential status'],
                ['settlingAbroad', 'Settling abroad'],
                ['languages', 'Languages'],
                ['disability', 'Disability'],
              ]} />

              <Section answer={answer} title="Religion & Community" rows={[
                ['religion', 'Religion'],
                ['motherTongue', 'Mother tongue'],
                ['sect', SECT_LABEL[c.religion ?? ''] ?? 'Sect'],
                ['caste', 'Caste'],
                ['subCaste', 'Sub-caste'],
                ['gotra', 'Gotra'],
                ['openToOtherCommunities', 'Other communities'],
                ['ethnicity', 'Ethnicity'],
              ]} />

              <Section answer={answer} title="Horoscope" rows={[
                ['manglik', 'Manglik'],
                ['rashi', 'Rashi'],
                ['nakshatra', 'Nakshatra'],
                ['birthTime', 'Time of birth', formatBirthTime(c.birthTime)],
                ['birthPlace', 'Place of birth'],
                ['horoscopeMatch', 'Horoscope match'],
                ['zodiac', 'Zodiac'],
              ]} />

              <Section answer={answer} title="Education & Career" rows={[
                ['educationLevel', 'Highest qualification'],
                ['degree', 'Degree'],
                ['university', 'College / university'],
                ['employedIn', 'Employed in'],
                ['occupation', 'Occupation'],
                ['annualIncome', 'Annual income'],
                ['workStyle', 'Work style'],
              ]} />

              <Section answer={answer} title="Family" rows={[
                ['familyType', 'Family type'],
                ['familyStatus', 'Family status'],
                ['familyValues', 'Family values'],
                ['fatherOccupation', 'Father'],
                ['motherOccupation', 'Mother'],
                ['brothers', 'Brothers', formatSiblings(c.brothers, answer('brothersMarried'))],
                ['sisters', 'Sisters', formatSiblings(c.sisters, answer('sistersMarried'))],
                ['familyLocation', 'Family lives in'],
                ['livingWithFamily', 'Lives with family'],
                ['familyCloseness', 'Closeness to family'],
              ]}>
                {answer('aboutFamily') && (
                  <p className="pt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{answer('aboutFamily')}</p>
                )}
              </Section>

              <Section answer={answer} title="Looking For" rows={[
                ['datingIntention', 'Intent'],
                ['marriageTimeline', 'Marriage timeline'],
                ['familyPlans', 'Family plans'],
                ['loveLanguage', 'Love language'],
              ]} />

              <Section answer={answer} title="Lifestyle" rows={[
                ['drinking', 'Drinking'],
                ['smoking', 'Smoking'],
                ['gymRoutine', 'Exercise'],
                ['sleepSchedule', 'Sleep'],
                ['livingPreference', 'Living'],
                ['canCook', 'Cooking'],
              ]} />

              <Section answer={answer} title="Personality" rows={[
                ['socialBattery', 'Social battery'],
                ['attachmentStyle', 'Attachment'],
                ['conflictResolution', 'Conflict style'],
                ['financialApproach', 'Money'],
                ['politics', 'Politics'],
              ]} />

              <Section answer={answer} title="More Interests" rows={[
                ['hobbies', 'Hobbies'],
                ['travelStyle', 'Travel'],
                ['musicGenre', 'Music'],
                ['sportsInterest', 'Sports'],
                ['readingInterest', 'Reading'],
                ['nextTravelDestination', 'Next trip'],
              ]} />
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        {showLikeButton && (
          <div className="flex-none bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 p-4 z-10 flex items-center justify-between gap-3">
            <div className="flex gap-1 items-center">
              {candidate.linkedin ? (
                <a
                  href={`https://linkedin.com/in/${candidate.linkedin.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 dark:text-gray-400 hover:text-[#0077b5] transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center"
                  title="LinkedIn"
                  aria-label="LinkedIn"
                >
                  <SvgLinkedin />
                </a>
              ) : (
                <div className="text-gray-200 dark:text-zinc-800 p-2 rounded-md flex items-center justify-center cursor-not-allowed" title="LinkedIn not provided">
                  <SvgLinkedin />
                </div>
              )}
              {candidate.instagram ? (
                <a
                  href={`https://instagram.com/${candidate.instagram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 dark:text-gray-400 hover:text-[#E1306C] transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center"
                  title="Instagram"
                  aria-label="Instagram"
                >
                  <SvgInstagram />
                </a>
              ) : (
                <div className="text-gray-200 dark:text-zinc-800 p-2 rounded-md flex items-center justify-center cursor-not-allowed" title="Instagram not provided">
                  <SvgInstagram />
                </div>
              )}
              {/* Inside the app there's no web address to share yet */}
              {!isNativeApp() && <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: candidate.name, text: `Check out ${candidate.name} on Shaadi24`, url: window.location.href }).catch(() => {});
                  } else {
                    navigator.clipboard?.writeText(window.location.href).catch(() => {});
                  }
                }}
                className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md flex items-center justify-center"
                title="Share profile"
                aria-label="Share profile"
              >
                <SvgShare />
              </button>}
            </div>

            <div className="min-w-[180px]">
              <LikeButton
                candidate={candidate}
                variant="wide"
                showSuperLike={false}
                onMatched={onMatched}
                onLimitReached={onUpgrade}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox.open && photos.length > 0 && (
        <div
          className="fixed inset-0 z-[300] bg-black flex items-center justify-center animate-fade-in"
          data-popup
          onClick={(e) => { e.stopPropagation(); setLightbox({ open: false, idx: 0 }); }}
        >
          <button
            onClick={() => setLightbox({ open: false, idx: 0 })}
            className="absolute right-4 text-white/70 hover:text-white p-2 z-20"
            style={{ top: 'calc(1rem + var(--safe-top))' }}
            aria-label="Close"
          >
            <IconX />
          </button>
          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((p) => ({ ...p, idx: (p.idx - 1 + photos.length) % photos.length })); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-4 z-20 hidden md:block rounded-full hover:bg-white/10"
                aria-label="Previous"
              >
                <IconChevronLeft />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox((p) => ({ ...p, idx: (p.idx + 1) % photos.length })); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-4 z-20 hidden md:block rounded-full hover:bg-white/10"
                aria-label="Next"
              >
                <IconChevronRight />
              </button>
            </>
          )}
          <img
            src={photos[lightbox.idx]}
            alt="Full screen"
            className="max-w-full max-h-full object-contain p-4 select-none touch-pan-y"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { touchStartX.current = e.targetTouches[0].clientX; }}
            onTouchMove={(e) => { touchEndX.current = e.targetTouches[0].clientX; }}
            onTouchEnd={() => {
              const diff = touchStartX.current - touchEndX.current;
              if (Math.abs(diff) > 50) {
                if (diff > 0) setLightbox((p) => ({ ...p, idx: (p.idx + 1) % photos.length }));
                else setLightbox((p) => ({ ...p, idx: (p.idx - 1 + photos.length) % photos.length }));
              }
            }}
            loading="lazy"
            decoding="async"
          />
          {photos.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${i === lightbox.idx ? 'bg-white scale-125' : 'bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showBlockReport && (
        <BlockReportModal
          mode={showBlockReport}
          targetId={candidate.id}
          targetName={candidate.name}
          onClose={() => setShowBlockReport(null)}
          onComplete={() => { setShowBlockReport(null); onClose(); }}
        />
      )}
    </div>
  );
};

// Inline brand SVGs (no IconLinkedin/IconInstagram in constants)
const SvgLinkedin = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.98 3.5C4.98 4.881 3.87 6 2.5 6S.02 4.881.02 3.5C.02 2.12 1.13 1 2.5 1s2.48 1.12 2.48 2.5zM5 8H0v16h5V8zm7.982 0H8.014v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0V24h4.988V13.869c0-7.88-8.922-7.593-11.018-3.714V8z" />
  </svg>
);

const SvgInstagram = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const SvgShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export default ProfileModal;
