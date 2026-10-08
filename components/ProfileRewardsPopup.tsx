import React, { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronRight, IconX } from '../constants';
import { useAuth } from '../lib/AuthContext';
import { needsRulesReminder } from '../lib/consentService';
import { DAILY_LIMITS } from '../lib/profileService';
import {
  fetchProfileSections, markProfileNudged, profileNudgeDue, sectionMinutes, type ProfileSection, type SectionId,
} from '../lib/profileRewards';

// ============================================================================
// ProfileRewardsPopup: what filling in My Profile earns. Sign-up asks only the
// basics; this shows on the first visit after it, then every few days until
// every section is complete: each section completed adds one free AI search a
// day, and about how long each one takes. A section, or "Complete my
// profile", opens My Profile there.
// ============================================================================

const DAY = 24 * 60 * 60 * 1000;

const ProfileRewardsPopup: React.FC<{ onOpenSection: (id: SectionId) => void }> = ({ onOpenSection }) => {
  const { session, profile, profileRow } = useAuth();
  const userId = session?.user.id;
  // The reminder of the rules comes first, when it's due
  const rulesFirst = !!profileRow && needsRulesReminder(profileRow.rules_reminded_at);
  const [open, setOpen] = useState<{ todo: ProfileSection[]; total: number; base: number | null; justJoined: boolean } | null>(null);

  const nudgedAt = profileRow?.profile_nudged_at;
  useEffect(() => {
    if (!userId || rulesFirst || !profileNudgeDue(userId, nudgedAt)) return;
    let live = true;
    fetchProfileSections().then((s) => {
      if (!live || !s) return;
      const todo = s.sections.filter((x) => !x.complete);
      if (!todo.length) return;
      void markProfileNudged(userId);
      setOpen({ todo, total: s.sections.length, base: s.freeDailySearches, justJoined: Date.now() - (profile?.accountCreated ?? 0) < DAY });
    }).catch(() => { /* it can wait for next time */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, rulesFirst, nudgedAt]);

  const close = useEffectEvent(() => setOpen(null));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  // (no daily limit for free accounts: nothing to earn, as with Shaadi24+)
  const isPro = profile?.subscriptionTier === 'PRO' || open.base === null;
  const base = open.base ?? DAILY_LIMITS.FREE.searches;
  const minutes = open.todo.reduce((sum, s) => sum + sectionMinutes(s), 0);
  const forSomeoneElse = (profile?.profileCreatedFor ?? 'Myself') !== 'Myself';
  const firstName = (profile?.name ?? '').trim().split(/\s+/)[0];
  const whose = forSomeoneElse && firstName ? `${firstName}'s` : 'your';
  const go = (id: SectionId) => { setOpen(null); onOpenSection(id); };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4 popup-backdrop animate-fade-in" onClick={() => setOpen(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nudge-title"
        data-testid="profile-rewards-popup"
        className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(null)}
          className="absolute top-3 right-3 p-1.5 rounded-full text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-zinc-800"
          aria-label="Close"
        >
          <IconX />
        </button>

        <div className="text-3xl mb-2" aria-hidden="true">{isPro ? '📝' : '🎁'}</div>
        <h2 id="nudge-title" className="pr-8 text-xl font-bold text-gray-900 dark:text-white">
          {isPro ? `Complete ${whose} profile` : 'Unlock more free searches'}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {open.justJoined && <>{forSomeoneElse && firstName ? `${firstName}'s profile is live! ` : 'Your profile is live! '}</>}
          {isPro
            ? 'A complete profile helps families get to know each other, and makes the matches better.'
            : <>You get {base} free AI searches a day. Each section of {whose} profile you complete adds one more,
              every day: up to <strong>{base + open.total} a day</strong>.</>}
        </p>

        <ul className="mt-4 rounded-xl border border-gray-200 dark:border-zinc-800 divide-y divide-gray-100 dark:divide-zinc-800">
          {open.todo.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(s.id)}
                data-testid={`nudge-${s.id}`}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/60 first:rounded-t-xl last:rounded-b-xl"
              >
                <span className="flex-1 min-w-0 text-sm font-semibold leading-snug text-gray-900 dark:text-white">{s.title}</span>
                <span className="flex-none text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {!isPro && <span className="font-semibold text-green-700 dark:text-green-400">+1 search · </span>}
                  ~{sectionMinutes(s)} min
                </span>
                <span className="flex-none text-gray-400 dark:text-gray-500 scale-75" aria-hidden="true"><IconChevronRight /></span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" data-testid="nudge-total">
          {open.todo.length === 1 ? 'About' : `All ${open.todo.length}: about`} {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
          {' '}Every answer is optional, and you can hide any of them.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => go(open.todo[0].id)}
            data-testid="nudge-complete"
            className="h-11 rounded-lg bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black text-sm font-bold"
          >
            Complete my profile
          </button>
          <button
            type="button"
            onClick={() => setOpen(null)}
            data-testid="nudge-later"
            className="h-11 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProfileRewardsPopup;
