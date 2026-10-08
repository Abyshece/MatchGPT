import React, { useEffect, useState } from 'react';
import { fetchMyMessages, markMyMessage, type MessageTarget, type MyMessage } from '../lib/adminGrowth';
import type { SectionId } from '../lib/profileRewards';
import UpgradeModal from './UpgradeModal';
import VerificationRequestModal from './VerificationRequestModal';

// ============================================================================
// Messages from the Shaadi24 team (Admin → Messages and Profiles): the newest
// one the member hasn't answered, as a card at the bottom of the screen with
// its button (say, "Fill in Family", which opens that section of My Profile)
// and "Not now". Each is marked seen when shown, and done when either is
// tapped, so it doesn't come back.
// ============================================================================

export type MessageGoTo = { tab: 'profile'; section?: SectionId } | { tab: 'search' };

const MemberMessages: React.FC<{ onGo: (to: MessageGoTo) => void }> = ({ onGo }) => {
  const [message, setMessage] = useState<MyMessage | null>(null);
  const [modal, setModal] = useState<'verify' | 'upgrade' | null>(null);

  useEffect(() => {
    let live = true;
    // After the screen has settled (the other pop-ups first)
    const t = setTimeout(() => {
      void fetchMyMessages().then((list) => {
        if (!live || !list.length) return;
        setMessage(list[0]);
        if (!list[0].seen_at) void markMyMessage(list[0].id, 'seen');
      });
    }, 2500);
    return () => { live = false; clearTimeout(t); };
  }, []);

  const go = (target: MessageTarget | null) => {
    if (!message) return;
    void markMyMessage(message.id, 'clicked');
    setMessage(null);
    if (!target) return;
    if (target === 'verify' || target === 'upgrade') setModal(target);
    else if (target === 'search') onGo({ tab: 'search' });
    else if (target === 'profile') onGo({ tab: 'profile' });
    else onGo({ tab: 'profile', section: target.slice('profile:'.length) as SectionId });
  };

  const later = () => {
    if (!message) return;
    void markMyMessage(message.id, 'dismissed');
    setMessage(null);
  };

  return (
    <>
      {message && (
        <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px] z-[200] animate-fade-in" data-popup>
          <div role="dialog" aria-labelledby="member-message-title" data-testid="member-message" className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">💍</span>
              <div className="min-w-0 flex-1">
                <p id="member-message-title" className="text-sm font-semibold text-gray-900 dark:text-white">{message.title}</p>
                <p className="mt-0.5 text-sm text-gray-600 dark:text-zinc-300 whitespace-pre-line">{message.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.cta_label && message.cta_target && (
                    <button type="button" onClick={() => go(message.cta_target)} className="rounded-full plus-solid px-4 py-2 text-sm font-semibold">
                      {message.cta_label}
                    </button>
                  )}
                  <button type="button" onClick={message.cta_target ? later : () => go(null)} className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800">
                    {message.cta_target ? 'Not now' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {modal === 'verify' && <VerificationRequestModal onClose={() => setModal(null)} />}
      {modal === 'upgrade' && <UpgradeModal reason="pro_feature" onClose={() => setModal(null)} />}
    </>
  );
};

export default MemberMessages;
