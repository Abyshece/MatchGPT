import React, { useState, useRef } from 'react';
import { IconCheck, IconZap, IconHeart, IconX, IconUser, IconSparkles, IconMessageCircle } from '../constants';
import LikeButton from './LikeButton';
import { playExit, type ExitKind } from '../lib/likeExit';
import type { MatchCandidate } from '../types';

// ============================================================================
// MatchCard — restyled to match the legacy Shaadi24 design:
//   - Photo on top with carousel (left/right arrows on hover, swipe on mobile,
//     dots indicator, online/offline status chip top-left, match% top-right)
//   - Below photo: badges row (Spotlight, New, Verified, Usually replies,
//     Plus), name + age, location
//   - Bottom: X (pass) + Like button row, separated from content with border
//   - Liked: the card bursts into sparkles and is gone in about 0.6 s; passed:
//     it drops away. onLiked / onReject fire once it's gone, for the list to
//     drop it (without onLiked a liked card stays, showing "Liked").
// ============================================================================

interface MatchCardProps {
  candidate: MatchCandidate;
  onClick: () => void;
  onMatched?: (matchId: string, candidate: MatchCandidate) => void;
  onLimitReached?: () => void;
  onLiked?: () => void;            // after the card has gone
  onReject?: (id: string) => void; // after the card has gone
  showLikeButton?: boolean;
}

const MatchCard: React.FC<MatchCardProps> = ({
  candidate, onClick, onMatched, onLimitReached, onLiked, onReject, showLikeButton = true,
}) => {
  const photos = candidate.imageUrls ?? [];
  const [photoIdx, setPhotoIdx] = useState(0);
  const [exiting, setExiting] = useState<ExitKind | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const score = candidate.compatibilityScore;

  // Plays the exit, then tells the list
  const leave = (kind: ExitKind, then: () => void) => {
    setExiting(kind);
    setTimeout(then, playExit(cardRef.current, kind));
  };

  // Touch swipe support
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setPhotoIdx((i) => (i + 1) % photos.length);
      else setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={() => !exiting && onClick()}
      data-exiting={exiting ?? undefined}
      data-testid="match-card"
      className={`group relative bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 hover:shadow-lg overflow-hidden flex flex-col h-full cursor-pointer transition-[border-color,box-shadow] duration-200 ${
        exiting ? 'pointer-events-none' : ''
      }`}
    >
      {/* Photo carousel */}
      <div
        className="relative w-full aspect-[3/4] bg-gray-100 dark:bg-zinc-800 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {photos.length > 0 ? (
          <img
            src={photos[photoIdx]}
            alt={candidate.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover select-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-zinc-700 [&_svg]:w-12 [&_svg]:h-12"><IconUser /></div>
        )}

        {/* Carousel arrows (desktop hover only) */}
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx - 1 + photos.length) % photos.length); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors z-10"
              aria-label="Previous photo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setPhotoIdx((photoIdx + 1) % photos.length); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors z-10"
              aria-label="Next photo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10 px-2 py-1 rounded-full bg-black/20 backdrop-blur-sm">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === photoIdx ? 'bg-white scale-110' : 'bg-white/50'}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Online / Offline pill — top-left */}
        <div className="absolute top-2 left-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur px-2 py-1 rounded-full text-[10px] font-bold shadow-sm flex items-center gap-1.5 z-10">
          {candidate.isOnline ? (
            <>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              <span className="text-green-700 dark:text-green-500">Online</span>
            </>
          ) : (
            <span className="text-gray-600 dark:text-gray-400">Offline</span>
          )}
        </div>

        {/* Match % — top-right */}
        {score > 0 && (
          <div className="absolute top-2 right-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur px-2 py-1 rounded text-xs font-bold shadow-sm text-green-700 dark:text-green-500 z-10">
            {score}% Match
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Badges */}
        {(candidate.isVerified || candidate.isPremium || candidate.spotlight || candidate.isNew || candidate.repliesUsually) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {candidate.spotlight && (
              <div data-testid="spotlight-badge" title="In Spotlight near you"
                className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-800">
                <span aria-hidden="true" className="[&>svg]:w-3 [&>svg]:h-3"><IconSparkles /></span> Spotlight
              </div>
            )}
            {candidate.isNew && (
              <div data-testid="new-badge" title="Joined this week"
                className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-violet-200 dark:border-violet-800">
                New
              </div>
            )}
            {candidate.isVerified && (
              <div className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-green-200 dark:border-green-800">
                <IconCheck className="w-3 h-3" /> Verified
              </div>
            )}
            {candidate.repliesUsually && (
              <div data-testid="replies-badge" title="Answers most people who write to them"
                className="inline-flex items-center gap-1 bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-sky-200 dark:border-sky-800">
                <span aria-hidden="true" className="[&>svg]:w-3 [&>svg]:h-3"><IconMessageCircle /></span> Usually replies
              </div>
            )}
            {candidate.isPremium && (
              <div className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-blue-200 dark:border-blue-800">
                <IconZap /> Plus
              </div>
            )}
          </div>
        )}

        {/* Name + location */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
            {candidate.name}{candidate.age ? `, ${candidate.age}` : ''}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{candidate.location}</p>
          {candidate.missed && (
            <p data-testid="near-miss-note" className="mt-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              Close, but: {candidate.missed}
            </p>
          )}
        </div>

        {/* Footer: X + Like button row */}
        <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 flex gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
          {onReject && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                leave('pass', () => onReject(candidate.id));
              }}
              className="px-3 h-9 rounded-lg border border-transparent text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-gray-400 hover:border-red-100 dark:hover:border-red-900/30 transition-colors flex items-center justify-center"
              title="Pass"
              aria-label="Pass"
              disabled={!!exiting}
            >
              <IconX />
            </button>
          )}
          {showLikeButton ? (
            <div className="flex-1">
              <LikeButton
                candidate={candidate}
                size="md"
                variant="wide"
                onMatched={onMatched}
                onLimitReached={onLimitReached}
                onLiked={onLiked && (() => leave('like', onLiked))}
              />
            </div>
          ) : (
            <div className="flex-1 h-9 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center gap-2">
              <IconHeart /> Like
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchCard;
