import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/useToast';
import { likeUser, hasLiked, unlikeUser } from '../lib/likesService';
import { DAILY_LIMITS } from '../lib/profileService';
import { IconHeart, IconStar } from '../constants';
import type { MatchCandidate } from '../types';

// ============================================================================
// LikeButton
//
// A pair of buttons: regular Like (heart) and Super Like (star, Pro only).
//
// Behavior:
//   - Free user: clicking heart shows confirmation with the likes left today
//     (the database enforces DAILY_LIMITS.FREE.likes and keeps the count)
//   - Pro user: clicking heart sends immediately
//   - If like causes a mutual match, fires onMatched(matchId) so caller can
//     show the celebration modal
// ============================================================================

interface LikeButtonProps {
  candidate: MatchCandidate;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'icon' | 'wide';   // 'icon' = round button (default), 'wide' = pill bar for cards
  showSuperLike?: boolean;
  onMatched?: (matchId: string, candidate: MatchCandidate) => void;
  onLiked?: () => void;
  onLimitReached?: () => void;
}

const LikeButton: React.FC<LikeButtonProps> = ({
  candidate, size = 'md', variant = 'icon', showSuperLike = true, onMatched, onLiked, onLimitReached,
}) => {
  const { profile, session, refreshProfile, hasPro } = useAuth();
  const { showToast } = useToast();

  const [liked, setLiked] = useState<boolean | null>(null); // null = unknown yet
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState<null | 'like' | 'super'>(null);

  // Check on mount whether we've already liked this person
  useEffect(() => {
    let mounted = true;
    if (!session?.user.id) return;
    hasLiked(session.user.id, candidate.id).then((result) => {
      if (mounted) setLiked(result);
    });
    return () => { mounted = false; };
  }, [session?.user.id, candidate.id]);

  if (!profile || !session?.user.id) return null;

  // The daily limit follows the subscription; Super Likes follow Shaadi24+'s
  // one rule (hasPro: also everyone's while Shaadi24+ for everyone is on)
  const unlimited = profile.subscriptionTier === 'PRO';
  const superLikes = hasPro;

  // Daily limit check (free accounts; subscribers are unlimited)
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = profile.lastLikeDate?.slice(0, 10);
  const usedToday = lastDate === today ? (profile.dailyLikeCount ?? 0) : 0;
  const remaining = unlimited ? Infinity : Math.max(0, DAILY_LIMITS.FREE.likes - usedToday);
  const atLimit = !unlimited && remaining === 0;

  // ---- handlers -----------------------------------------------------------

  const performLike = async (isSuperLike: boolean) => {
    if (!session?.user.id) return;
    if (atLimit) {
      showToast(`Daily like limit reached. Get Shaadi24+ for unlimited likes.`, 'info');
      onLimitReached?.();
      return;
    }
    if (isSuperLike && !superLikes) {
      showToast('Super Likes are a Pro feature', 'info');
      onLimitReached?.();
      return;
    }

    setBusy(true);
    setShowConfirm(null);

    // Optimistic UI
    setLiked(true);

    const result = await likeUser(session.user.id, candidate.id, isSuperLike);

    if (!result.success) {
      // Revert
      setLiked(false);
      setBusy(false);
      showToast(result.error ?? 'Failed to like', 'error');
      return;
    }

    // The database counted this like; refresh so "likes left today" updates.
    await refreshProfile();

    setBusy(false);

    if (result.matched && result.matchId) {
      // It's a match — caller handles the celebration
      onMatched?.(result.matchId, candidate);
    } else {
      showToast(isSuperLike ? `Super liked ${candidate.name} ⭐` : `Liked ${candidate.name} ❤️`, 'success');
    }
    onLiked?.();
  };

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liked || busy) return;
    // Free likes are counted, so each one is confirmed first
    if (unlimited) {
      performLike(false);
    } else {
      setShowConfirm('like');
    }
  };

  const handleSuperLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liked || busy) return;
    if (!superLikes) {
      showToast('Super Likes are a Pro feature', 'info');
      onLimitReached?.();
      return;
    }
    performLike(true);
  };

  const handleUnlike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user.id || busy) return;
    setBusy(true);
    setLiked(false); // optimistic
    const { error } = await unlikeUser(session.user.id, candidate.id);
    setBusy(false);
    if (error) {
      setLiked(true);
      showToast(`Couldn't undo: ${error}`, 'error');
    } else {
      showToast('Like removed', 'info');
    }
  };

  // ---- styling ------------------------------------------------------------

  const sizes = {
    sm: { btn: 'w-8 h-8', icon: 'w-4 h-4' },
    md: { btn: 'w-10 h-10', icon: 'w-5 h-5' },
    lg: { btn: 'w-14 h-14', icon: 'w-7 h-7' },
  }[size];

  // ---- render -------------------------------------------------------------

  // Wide variant: a single pill-shaped bar that fills its container. Used in
  // MatchCard footer. Never shows super-like (cards have limited space).
  if (variant === 'wide') {
    return (
      <>
        <button
          onClick={liked ? handleUnlike : handleHeartClick}
          disabled={busy || liked === null}
          title={liked ? 'Undo like' : 'Like'}
          className={`w-full h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all ${
            busy
              ? 'bg-gray-100 dark:bg-zinc-800 text-gray-300 dark:text-zinc-600 cursor-wait'
              : liked
                ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/50'
                : 'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200'
          }`}
        >
          <IconHeart /> {liked ? 'Liked' : 'Like'}
        </button>
        {showConfirm && renderConfirmModal()}
      </>
    );
  }

  // Rendered into <body> through a portal: inside a match card, whose
  // transform would otherwise squeeze the popup into the card. Clicks still
  // bubble to the card in React, so the backdrop stops them there.
  function renderConfirmModal() {
    return createPortal(
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
        onClick={(e) => { e.stopPropagation(); setShowConfirm(null); }}
      >
        <div
          className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-200 dark:border-zinc-800 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-4 bg-pink-100 dark:bg-pink-900/30 text-pink-500 rounded-full flex items-center justify-center">
              <IconHeart />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Like {candidate.name}?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              You have <strong>{remaining} of {DAILY_LIMITS.FREE.likes}</strong> likes remaining today.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => performLike(false)}
                className="flex-1 py-2.5 bg-pink-500 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-pink-600 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? 'Sending…' : 'Yes, Like'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3">
              <strong>Pro tip:</strong> Pro users have unlimited likes.
            </p>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
        {showSuperLike && (
          <button
            onClick={liked ? undefined : handleSuperLikeClick}
            disabled={busy || liked === true}
            title={superLikes ? 'Super Like' : 'Super Like (Pro)'}
            className={`${sizes.btn} flex items-center justify-center rounded-full shadow-sm transition-all ${
              liked
                ? 'bg-gray-100 dark:bg-zinc-800 text-gray-300 dark:text-zinc-600 cursor-not-allowed'
                : superLikes
                  ? 'bg-white dark:bg-zinc-800 text-blue-500 hover:scale-110 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-gray-200 dark:border-zinc-700'
                  : 'bg-white dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700'
            }`}
          >
            <span className={sizes.icon}><IconStar /></span>
          </button>
        )}
        <button
          onClick={liked ? handleUnlike : handleHeartClick}
          disabled={busy || liked === null}
          title={liked ? 'Undo like' : 'Like'}
          className={`${sizes.btn} flex items-center justify-center rounded-full shadow-sm transition-all ${
            busy
              ? 'bg-gray-100 dark:bg-zinc-800 text-gray-300 dark:text-zinc-600'
              : liked
                ? 'bg-pink-500 text-white hover:bg-pink-600 hover:scale-105'
                : 'bg-white dark:bg-zinc-800 text-pink-500 hover:scale-110 hover:bg-pink-50 dark:hover:bg-pink-900/30 border border-gray-200 dark:border-zinc-700'
          }`}
        >
          <span className={sizes.icon}><IconHeart /></span>
        </button>
      </div>

      {/* Confirm modal for free users */}
      {showConfirm && renderConfirmModal()}
    </>
  );
};

export default LikeButton;
