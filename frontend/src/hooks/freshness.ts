import { useEffect } from "react";
import { useBlockNumber } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";

/**
 * One refresh clock for every live chain read in the app.
 *
 * This exists because market reads and position reads had drifted onto different
 * schedules: `usePosition` refetched every 5s *and* invalidated on each new
 * block, while `useMarketVitals` polled on a bare 20s interval with no block
 * subscription. The two are shown side by side on the same page, so a fill would
 * move the position figures immediately and leave `totalUnits` up to 20 seconds
 * behind — the market and the position disagreeing on screen about what had just
 * happened. Sharing the policy makes them refresh together by construction
 * rather than by two independently maintained numbers that happen to match.
 *
 * Belt and braces, in order of who usually wins the race:
 *   1. `useTx` invalidates the whole cache after each confirmed transaction.
 *   2. `useInvalidateOnBlock` catches state moved by anyone else, same block.
 *   3. `refetchInterval` is the net if the block subscription drops.
 *   4. focus/mount cover tab switches and client-side navigation.
 */
export const LIVE_QUERY = {
  refetchInterval: 5_000,
  refetchOnWindowFocus: true,
  refetchOnMount: "always" as const,
} as const;

/**
 * Content-addressed reads: cache forever.
 *
 * For anything keyed by a hash of its own contents — the Market struct behind a
 * market id, a token's `symbol`/`decimals` — the answer cannot change for that
 * key. Re-fetching it burns an RPC round trip to learn what we already know, and
 * worse, it delays every read chained off it.
 */
export const IMMUTABLE_QUERY = {
  staleTime: Infinity,
  gcTime: Infinity,
} as const;

/**
 * Invalidate the given query keys on every new block.
 *
 * `keys` is deliberately absent from the effect's dependency list. wagmi returns
 * a fresh `queryKey` array identity on each render, so depending on it would
 * re-run the effect continuously — and since the effect's own invalidation
 * triggers a render, that is a loop. Block number is the only real trigger here.
 */
export function useInvalidateOnBlock(
  keys: readonly (readonly unknown[])[],
  enabled = true,
) {
  const queryClient = useQueryClient();
  const { data: blockNumber } = useBlockNumber({ watch: enabled });

  useEffect(() => {
    if (!enabled || !blockNumber) return;
    for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, enabled]);
}
