import React from 'react';
import { IconCheck, IconStar, IconZap, IconClock } from '../constants';
import LikeButton from './LikeButton';
import { likeReceivedToCandidate } from '../lib/likesService';
import type { LikeReceived } from '../lib/likesService';
import type { MatchCandidate } from '../types';

// ============================================================================
// LikedYouCard
//
// Card on the Likes-You tab. Free users see blurred photos with name hidden;
// Pro users see everything clearly.
// ============================================================================

interface LikedYouCardProps {
  like: LikeReceived;
  isPro: boolean;
  onView: (candidate: MatchCandidate) => void;
  onUpgrade: () => void;
  onMatched: (matchId: string, candidate: MatchCandidate) => void;
}

const formatRelativeTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const LikedYouCard: React.FC<LikedYouCardProps> = ({ like, isPro, onView, onUpgrade, onMatched }) => {
  const photo = like.liker.photos?.[0];
  const candidate = likeReceivedToCandidate(like);

  return (
    <div className="group relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:shadow-md transition-all">
      <div
        className="aspect-[3/4] bg-gray-100 dark:bg-zinc-800 overflow-hidden relative cursor-pointer"
        onClick={() => isPro ? onView(candidate) : onUpgrade()}
      >
        {photo ? (
          <img
            src={photo}
            alt={isPro ? like.liker.name : 'Liked you'}
            loading="lazy"
            className={`w-full h-full object-cover transition-all ${
              isPro ? 'group-hover:scale-[1.02]' : 'blur-xl scale-110 opacity-70'
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300 dark:text-zinc-700">👤</div>
        )}

        {/* Super-Like crown */}
        {like.isSuperLike && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg flex items-center gap-1">
            <IconStar /> Super Like
          </div>
        )}

        {/* Verified */}
        {isPro && like.liker.isVerified && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full" title="Verified">
            <IconCheck className="w-3 h-3" />
          </div>
        )}

        {/* Pro badge */}
        {isPro && like.liker.subscriptionTier === 'PRO' && (
          <div className={`absolute ${like.liker.isVerified ? 'top-9' : 'top-2'} right-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-1 rounded-full`} title="Pro user">
            <IconZap />
          </div>
        )}

        {/* Free user upgrade overlay */}
        {!isPro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-10">
            <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg mb-3 animate-bounce">
              <span className="text-white"><IconZap /></span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
              className="text-[11px] font-bold text-gray-800 uppercase bg-white/90 px-3 py-1.5 rounded backdrop-blur-sm hover:bg-white shadow-sm tracking-wide"
            >
              Upgrade to See
            </button>
          </div>
        )}

        {/* Bottom info — hidden for free users */}
        {isPro && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
            <h3 className="text-white font-bold text-base truncate">
              {like.liker.name}{like.liker.age ? `, ${like.liker.age}` : ''}
            </h3>
            <p className="text-white/80 text-xs truncate">{like.liker.location}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 flex items-center justify-between">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <IconClock /> {formatRelativeTime(like.likedAt)}
        </span>
        {isPro ? (
          <LikeButton
            candidate={candidate}
            size="sm"
            showSuperLike={false}
            onMatched={onMatched}
          />
        ) : (
          <button
            onClick={onUpgrade}
            className="text-[11px] font-bold text-yellow-700 dark:text-yellow-400 hover:underline"
          >
            See & Like Back
          </button>
        )}
      </div>
    </div>
  );
};

export default LikedYouCard;
