import React, { useEffect, useState } from 'react';
import { KIND_ICONS, TIMELINE_GROUPS, fetchTimeline, type TimelineEvent } from '../../lib/adminInsights';

// ============================================================================
// A member's timeline (the member panel's second tab): everything they did and
// what was done about them, newest first, day by day: joining and consents,
// searches, likes, matches, messages (a count per chat a day, never the
// text), reports and blocks either way, verification, photos and texts and
// their approval, Shaadi24+, messages from the team, admin actions.
// ============================================================================

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

const MemberTimeline: React.FC<{ userId: string }> = ({ userId }) => {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<(typeof TIMELINE_GROUPS)[number]['id']>('all');

  useEffect(() => {
    let live = true;
    setEvents(null);
    void fetchTimeline(userId).then(({ events, error }) => {
      if (!live) return;
      setEvents(events);
      setError(error);
    });
    return () => { live = false; };
  }, [userId]);

  if (error) return <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">Couldn't load the timeline: {error}</p>;
  if (!events) return <div className="mt-4 h-40 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />;

  const kinds = TIMELINE_GROUPS.find((g) => g.id === group)?.kinds;
  const shown = kinds ? events.filter((e) => kinds.includes(e.kind)) : events;
  const days: { day: string; items: TimelineEvent[] }[] = [];
  for (const e of shown) {
    const day = dayOf(e.at);
    if (days[days.length - 1]?.day !== day) days.push({ day, items: [] });
    days[days.length - 1].items.push(e);
  }

  return (
    <div className="mt-4" data-testid="member-timeline">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
        {TIMELINE_GROUPS.map((g) => (
          <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}
            className={`h-7 px-2.5 rounded-md text-xs ${group === g.id ? 'bg-gray-200/70 dark:bg-zinc-700/60 font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
            {g.label}
          </button>
        ))}
      </div>
      {days.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-zinc-400">Nothing here yet.</p>
      ) : (
        <ol className="mt-3 space-y-4">
          {days.map((d) => (
            <li key={d.day}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-1.5">{d.day}</h3>
              <ul className="space-y-1.5">
                {d.items.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex gap-2.5 text-sm" data-testid="timeline-event" data-kind={e.kind}>
                    <span aria-hidden="true" className="flex-none w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-[11px]">{KIND_ICONS[e.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-900 dark:text-zinc-100 break-words">{e.title}</p>
                      {e.detail && (
                        e.kind === 'profile' && /^https?:\/\//.test(e.detail)
                          ? <img src={e.detail} alt="" className="mt-1 w-16 h-20 rounded object-cover" loading="lazy" />
                          : <p className="text-xs text-gray-500 dark:text-zinc-400 break-words">{e.detail}</p>
                      )}
                    </div>
                    <time dateTime={e.at} className="flex-none text-[11px] text-gray-500 dark:text-zinc-400 tabular-nums">{timeOf(e.at)}</time>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default MemberTimeline;
