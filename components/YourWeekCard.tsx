import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { dismissWeek, fetchMyWeek, weekDismissed, weekParts, type WeekGoTo, type WeekPart } from '../lib/yourWeek';
import { IconX } from '../constants';

// ============================================================================
// YourWeekCard (Find Match, before a search): the last 7 days in a line of
// numbers (lib/yourWeek.ts). Tapping one goes where it is; × puts the card
// away until next week. Nothing shows in a week with nothing to say.
// ============================================================================

const YourWeekCard: React.FC<{ onGo?: (to: WeekGoTo) => void }> = ({ onGo }) => {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [parts, setParts] = useState<WeekPart[] | null>(null);
  const [hidden, setHidden] = useState(() => (userId ? weekDismissed(userId) : true));

  useEffect(() => {
    if (!userId || hidden) return;
    let live = true;
    void fetchMyWeek().then((week) => { if (live && week) setParts(weekParts(week)); });
    return () => { live = false; };
  }, [userId, hidden]);

  if (!userId || hidden || !parts?.length) return null;

  const close = () => {
    dismissWeek(userId);
    setHidden(true);
  };

  // Phones: one line ("Your week", the numbers sliding sideways, ×), so Find
  // Match's start screen still fits without scrolling. Wider: a card.
  return (
    <section
      aria-label="Your week"
      data-testid="your-week"
      className="mb-3 sm:mb-5 mx-auto w-full max-w-2xl flex items-center gap-2 sm:gap-3 sm:rounded-xl sm:border sm:border-gray-200 sm:dark:border-zinc-800 sm:bg-white sm:dark:bg-zinc-900 sm:px-4 sm:py-3 animate-fade-in"
    >
      <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Your week</h2>
      <ul className="flex-1 min-w-0 flex gap-2 overflow-x-auto no-scrollbar">
        {parts.map((p) => {
          const body = (
            <>
              <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{p.count}</span>
              <span className="text-xs text-gray-600 dark:text-gray-300">{p.text}</span>
            </>
          );
          const chip = 'inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg bg-gray-100 sm:bg-gray-50 dark:bg-zinc-800 px-2.5 py-1';
          return (
            <li key={p.key} data-testid="your-week-part" data-key={p.key} className="shrink-0">
              {p.to && onGo ? (
                <button type="button" onClick={() => onGo(p.to!)} className={`${chip} hover:bg-gray-200 sm:hover:bg-gray-100 dark:hover:bg-zinc-700`}>
                  {body}
                </button>
              ) : (
                <span className={chip}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={close} aria-label="Hide until next week" className="shrink-0 p-1 -mr-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
        <span className="block w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"><IconX /></span>
      </button>
    </section>
  );
};

export default YourWeekCard;
