import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { IconHeart, IconMessageCircle, IconX } from '../constants';
import type { MatchCandidate } from '../types';

// ============================================================================
// MatchCelebrationModal
//
// Full-screen "It's a Match!" celebration. Shown once when a mutual like
// fires the `check_for_match` trigger. User can either start a chat or
// dismiss to keep browsing.
// ============================================================================

interface MatchCelebrationModalProps {
  matchedWith: MatchCandidate;
  matchId: string;
  onClose: () => void;
  onChat: (matchId: string) => void;
}

// Where the 12 hearts sit (% from the top and left): spread over the screen,
// and the same on every render, so they don't jump when the popup updates
const HEARTS = Array.from({ length: 12 }, (_, i) => ({ top: (i * 37 + 7) % 100, left: (i * 61 + 13) % 100 }));

const MatchCelebrationModal: React.FC<MatchCelebrationModalProps> = ({
  matchedWith, matchId, onClose, onChat,
}) => {
  const { profileRow } = useAuth();
  const myPhoto = profileRow?.photo_urls?.[0];
  const theirPhoto = matchedWith.imageUrls?.[0];

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 animate-fade-in"
      data-popup
      style={{
        background: 'linear-gradient(135deg, #ec4899 0%, #f97316 50%, #eab308 100%)',
      }}
    >
      {/* Pulsing decorative hearts */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {HEARTS.map(({ top, left }, i) => (
          <div
            key={i}
            className="absolute text-white/20 text-4xl animate-pulse"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              animationDelay: `${i * 0.2}s`,
              animationDuration: '2s',
            }}
          >
            ❤
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-6 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors z-50"
        style={{ top: 'calc(1.5rem + var(--safe-top))' }}
      >
        <IconX />
      </button>

      <div className="relative z-10 max-w-md w-full text-center text-white">
        <h1 className="text-5xl sm:text-6xl font-black mb-2 tracking-tight drop-shadow-lg">
          It's a Match!
        </h1>
        <p className="text-lg text-white/90 mb-10 drop-shadow">
          You and {matchedWith.name} liked each other.
        </p>

        {/* Two-photo composition */}
        <div className="relative w-full max-w-xs mx-auto h-48 mb-10">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-32 h-40 rounded-2xl overflow-hidden border-4 border-white shadow-2xl rotate-[-8deg] bg-gray-200">
            {myPhoto ? (
              <img src={myPhoto} alt="You" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">👤</div>
            )}
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-32 h-40 rounded-2xl overflow-hidden border-4 border-white shadow-2xl rotate-[8deg] bg-gray-200">
            {theirPhoto ? (
              <img src={theirPhoto} alt={matchedWith.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">👤</div>
            )}
          </div>
          {/* Heart in the middle */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl text-pink-500 z-20 animate-pulse">
            <span className="w-8 h-8 block"><IconHeart /></span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 max-w-xs mx-auto">
          <button
            onClick={() => onChat(matchId)}
            className="w-full py-3.5 bg-white text-pink-600 font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
          >
            <IconMessageCircle /> Send a Message
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-white/80 hover:text-white text-sm font-medium hover:bg-white/10 rounded-xl transition-colors"
          >
            Keep Searching
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchCelebrationModal;
