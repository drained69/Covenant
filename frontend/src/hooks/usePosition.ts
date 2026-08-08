import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { ADDRESSES } from "../config/chain";
import { COVENANT_ABI } from "../config/abis";
import { useMarket } from "./useMarket";
import { LIVE_QUERY, useInvalidateOnBlock } from "./freshness";

export type CollateralHolding = {
  /** Index into the market's `collateralParams` array. */
  index: number;
  amount: bigint;
};

export type PositionData = {
  /**
   * What the lender can actually withdraw right now: `credit` after bad-debt
   * slashing and continuous-fee accrual have been applied. Falls back to the
   * stored checkpoint if the adjusting read is unavailable — see `creditIsLive`.
   */
  credit?: bigint;
  /** The raw stored checkpoint, before lazy adjustments. */
  storedCredit?: bigint;
  /**
   * False when `credit` above is the stored checkpoint rather than the adjusted
   * figure, which happens if the market struct or the adjusting read failed.
   * The number is then an upper bound, not a balance.
   */
  creditIsLive: boolean;
  /** Continuous fee owed out of credit before withdrawal. */
  pendingFee?: bigint;
  /** Borrower principal. Not slashed, not fee-adjusted — the stored value is current. */
  debt?: bigint;
  collateralBitmap?: bigint;
  /** One entry per activated collateral index, in index order. */
  collaterals: CollateralHolding[];
  /**
   * Sum of raw units across every activated index. **Not a displayable amount.**
   * Each collateral index can be a different token with different decimals, so
   * adding their base units produces a number with no unit — render per-index
   * amounts instead, each with that index's own decimals. This exists only as an
   * all-zero test, which is decimals-independent and therefore valid.
   * Undefined when any activated index failed to read.
   */
  rawCollateralSum?: bigint;
  /**
   * True when at least one activated index holds a non-zero amount. Undefined
   * (not false) when the reads failed — absence of collateral and inability to
   * check for it are different answers.
   */
  anyCollateral?: boolean;
};

/** Indices of the set bits in a uint128 bitmap, low to high. */
function activatedIndices(bitmap: bigint | undefined): number[] {
  if (bitmap === undefined) return [];
  const out: number[] = [];
  for (let i = 0; i < 128; i++) if (((bitmap >> BigInt(i)) & 1n) === 1n) out.push(i);
  return out;
}

/**
 * A wallet's full position in one market.
 *
 * Two things this deliberately does NOT do, both of which it used to:
 *
 * 1. **It does not read `creditOf`.** That getter returns the stored struct
 *    field, which the protocol syncs lazily — bad-debt slashes and continuous
 *    fees are only written in when something touches the position. So `creditOf`
 *    is a checkpoint that drifts above the real claim between updates.
 *    `updatePositionView` returns what `updatePosition` *would* write, which is
 *    the number a lender should be shown. It needs the Market struct (for
 *    `maturity`, which bounds fee accrual), hence the dependent read on
 *    `useMarket` before it can run.
 *
 * 2. **It does not assume collateral lives at index 0.** A market can carry up
 *    to 128 collaterals and `collateralBitmap` says which of them this user has
 *    activated. Reading only index 0 silently reports zero for a borrower whose
 *    collateral sits anywhere else — the position looks empty when it is not.
 *
 * Failure is kept distinguishable from zero throughout: a field is `undefined`
 * when its read failed and a real `0n` when the chain says zero. Callers must
 * not coalesce the two, because "we could not reach the node" and "you have no
 * position" are opposite messages.
 *
 * Freshness (belt + braces — a single 20s interval used to miss same-block
 * updates):
 *   1. `useBlockNumber({ watch: true })` invalidates every stage each block.
 *   2. `refetchInterval` as the safety net if the block subscription drops.
 *   3. `refetchOnWindowFocus` + `refetchOnMount` cover tab refocus and routing.
 *   4. `useTx` invalidates the whole cache after each confirmed transaction.
 */
export function usePosition(marketId: `0x${string}`, account?: `0x${string}`) {
  // The market struct is content-addressed by its id, so it can never change for
  // a given id — `useMarket` caches it forever rather than re-fetching it every
  // block, which also stops it from delaying stage 2 below.
  const market = useMarket(marketId);

  // The same policy the market reads use, plus this hook's own account gate.
  // `LIVE_QUERY` carries no `enabled` of its own, so each stage must re-add one
  // or it would fire with an undefined account.
  const freshness = { ...LIVE_QUERY, enabled: !!account };

  // Stage 1: the six scalar fields, in one call so credit and debt can never be
  // read a block apart from each other.
  const core = useReadContracts({
    contracts: account
      ? [
          {
            address: ADDRESSES.covenant,
            abi: COVENANT_ABI,
            functionName: "position",
            args: [marketId, account],
          } as const,
        ]
      : [],
    query: freshness,
  });

  // Stage 2: the slash- and fee-adjusted credit. Depends on the market struct.
  const marketStruct = market.data;
  const live = useReadContracts({
    contracts:
      account && marketStruct
        ? [
            {
              address: ADDRESSES.covenant,
              abi: COVENANT_ABI,
              functionName: "updatePositionView",
              args: [marketStruct, marketId, account],
            } as const,
          ]
        : [],
    query: { ...freshness, enabled: !!account && !!marketStruct },
  });

  const positionResult = core.data?.[0];
  const stored = positionResult?.status === "success"
    ? (positionResult.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint])
    : undefined;

  const collateralBitmap = stored?.[5];
  const indices = useMemo(() => activatedIndices(collateralBitmap), [collateralBitmap]);

  // Stage 3: one read per activated collateral index. Skipped entirely when the
  // bitmap is zero, which is the common case and costs nothing.
  const collateralReads = useReadContracts({
    contracts:
      account && indices.length > 0
        ? indices.map(
            (index) =>
              ({
                address: ADDRESSES.covenant,
                abi: COVENANT_ABI,
                functionName: "collateral",
                args: [marketId, account, BigInt(index)],
              }) as const,
          )
        : [],
    query: { ...freshness, enabled: !!account && indices.length > 0 },
  });

  // Every stage refreshes on each new block, on the same clock the market reads
  // use — so a fill moves the position and the market's totals together.
  useInvalidateOnBlock(
    [core.queryKey, live.queryKey, collateralReads.queryKey],
    !!account,
  );

  const liveResult = live.data?.[0];
  const adjusted = liveResult?.status === "success"
    ? (liveResult.result as readonly [bigint, bigint, bigint])
    : undefined;

  const collaterals: CollateralHolding[] = indices.flatMap((index, i) => {
    const r = collateralReads.data?.[i];
    return r?.status === "success"
      ? [{ index, amount: r.result as bigint }]
      : [];
  });

  // Only aggregate when every activated index came back. A partial sum reads as
  // a smaller position rather than as a broken read.
  const allCollateralIn = indices.length === collaterals.length;
  const aggregable = collateralBitmap !== undefined && allCollateralIn;
  const rawCollateralSum = aggregable
    ? collaterals.reduce((sum, c) => sum + c.amount, 0n)
    : undefined;
  const anyCollateral = aggregable
    ? collaterals.some((c) => c.amount > 0n)
    : undefined;

  const data: PositionData = {
    credit: adjusted?.[0] ?? stored?.[0],
    storedCredit: stored?.[0],
    creditIsLive: adjusted !== undefined,
    pendingFee: adjusted?.[1] ?? stored?.[1],
    debt: stored?.[4],
    collateralBitmap,
    collaterals,
    rawCollateralSum,
    anyCollateral,
  };

  // The position is only "loaded" once the core read has landed; the adjusting
  // and collateral stages are chained off it, so reporting their idle state as
  // loading would leave the card in a skeleton forever for an empty position.
  const isLoading = core.isLoading || market.isLoading || live.isLoading ||
    (indices.length > 0 && collateralReads.isLoading);

  // A stage that never ran (no account, empty contract list) is not an error.
  const isError =
    core.isError ||
    positionResult?.status === "failure" ||
    market.isError ||
    liveResult?.status === "failure" ||
    collateralReads.isError ||
    !allCollateralIn;

  const error =
    (positionResult?.status === "failure" ? positionResult.error : undefined) ??
    core.error ??
    market.error ??
    (liveResult?.status === "failure" ? liveResult.error : undefined) ??
    collateralReads.error ??
    undefined;

  const refetch = () => {
    core.refetch();
    market.refetch();
    live.refetch();
    collateralReads.refetch();
  };

  return { data, isLoading, isError, error, refetch };
}
