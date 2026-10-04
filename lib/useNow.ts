import { useEffect, useState } from 'react';

/**
 * The time now, for screens that show times relative to it ("5m ago", "the
 * trial ends on…"): read when the screen opens, then again every `everyMs`, so
 * drawing the screen twice never gives two different answers.
 */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
