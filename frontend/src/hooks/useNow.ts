import { useEffect, useState } from "react";

/**
 * A wall clock that re-renders the caller every `intervalMs`.
 *
 * Countdowns on market cards and the trade panel previously froze at whatever
 * minute the page loaded on, because `Date.now()` inside a render only moves
 * when something else triggers a re-render. One shared ticking value keeps
 * every countdown in the app live without each component owning a timer.
 *
 * 1000ms by default — fine for "12m left" labels and the detail-page
 * countdown, which never need sub-second precision.
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
