import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES, MARKETS } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";
import { IMMUTABLE_QUERY, LIVE_QUERY, useInvalidateOnBlock } from "./freshness";

/**
 * The Market struct behind an id.
 *
 * Cached for the session on purpose. A market id is the hash of the struct
 * (`IdLib.toId`) and the params live in the CREATE2 bytecode that `toMarket`
 * reads back, so for a given id the answer is immutable by construction —
 * changing any field yields a different id, i.e. a different market. wagmi's
 * default `staleTime` of 0 had all seven call sites re-fetching it on every
 * mount and window focus, and because `usePosition` chains `updatePositionView`
 * off this read, that refetch also delayed the user's own credit figure.
 */
export function useMarket(marketId: `0x${string}`) {
  return useReadContract({
    address: ADDRESSES.covenant,
    abi: COVENANT_ABI,
    functionName: "toMarket",
    args: [marketId],
    query: IMMUTABLE_QUERY,
  });
}

export type MarketVitalsData = {
  /** Total credit units outstanding — the size of the market. */
  totalUnits?: bigint;
  /**
   * Cumulative bad-debt slash factor. Non-zero means lender credit in this
   * market has been written down, which is the single most consequential fact a
   * lender can learn about it.
   */
  lossFactor?: bigint;
  /** Credit not currently lent out: what lenders could withdraw right now. */
  withdrawable?: bigint;
  /** Credit already earmarked for accrued continuous fees. */
  continuousFeeCredit?: bigint;
  /** Settlement fee per tier in cbp, indices 0-6. */
  settlementFeeCbp?: readonly number[];
  /** Continuous fee rate. */
  continuousFee?: number;
  /** Tick granularity. Doubles as the protocol's own "market exists" flag. */
  tickSpacing?: number;
  /**
   * Whether a market exists behind this id at all. `Covenant` gates every entry
   * point on `marketState[id].tickSpacing > 0` (`MarketNotCreated`), and
   * `initMarket` writes `DEFAULT_TICK_SPACING` only when the stored value is 0 —
   * so a zero here is authoritative, not a missing default.
   */
  exists?: boolean;
  /** `withdrawable` as a percentage of `totalUnits`. Undefined for an empty market. */
  withdrawablePct?: number;
  /** True when the market has slashed lender credit for bad debt. */
  hasLosses?: boolean;
};

/**
 * Whole-market state, in one atomic read.
 *
 * This was three separate `useReadContract` calls (`totalUnits`, `withdrawable`,
 * `tickSpacing`) on a 20s poll. Two problems, both visible on screen:
 *
 * 1. **Not atomic.** `withdrawable` and `totalUnits` are displayed as a ratio,
 *    and two independent calls can settle in different blocks — which is why
 *    `MarketCard` had to clamp the result to 100%. A single `marketState` call
 *    returns both from one block, so the ratio is now a fact rather than
 *    something to defend against.
 * 2. **Not in step with the position.** A 20s interval with no block
 *    subscription, next to a position that refreshed each block, is exactly the
 *    "market out of sync with positions" symptom: fill an offer and your credit
 *    moves while the market's total sits still. Both now share `LIVE_QUERY` and
 *    both invalidate per block.
 *
 * The same call also carries `lossFactor` and the fee parameters, which the UI
 * previously had no way to show at any price.
 */
export function useMarketVitals(marketId: `0x${string}`) {
  const state = useReadContract({
    address: ADDRESSES.covenant,
    abi: COVENANT_ABI,
    functionName: "marketState",
    args: [marketId],
    query: LIVE_QUERY,
  });

  useInvalidateOnBlock([state.queryKey]);

  const s = state.data as
    | readonly [
        bigint, bigint, bigint, bigint,
        number, number, number, number, number, number, number,
        number, number,
      ]
    | undefined;

  const totalUnits = s?.[0];
  const withdrawable = s?.[2];
  const lossFactor = s?.[1];
  const tickSpacing = s?.[12];

  // bigint arithmetic so an 18-decimal supply doesn't lose precision through a
  // float, and guarded on `> 0n` because an empty market divides by zero. No
  // clamp: both operands come from the same call at the same block, so a value
  // above 100% would be a real protocol fact and should not be hidden.
  const withdrawablePct =
    totalUnits !== undefined && withdrawable !== undefined && totalUnits > 0n
      ? Number((withdrawable * 10_000n) / totalUnits) / 100
      : undefined;

  const data: MarketVitalsData = {
    totalUnits,
    lossFactor,
    withdrawable,
    continuousFeeCredit: s?.[3],
    settlementFeeCbp: s
      ? [s[4], s[5], s[6], s[7], s[8], s[9], s[10]]
      : undefined,
    continuousFee: s?.[11],
    tickSpacing,
    exists: tickSpacing === undefined ? undefined : tickSpacing > 0,
    withdrawablePct,
    hasLosses: lossFactor === undefined ? undefined : lossFactor > 0n,
  };

  return {
    data,
    isLoading: state.isLoading,
    isError: state.isError,
    error: state.error,
    refetch: state.refetch,
  };
}

/* ── fee and loss scales ────────────────────────────────────────────── */

/*
  `marketState` returns the fees and the loss factor in the protocol's own
  encodings, and not one of them is a WAD. Rendering the raw integers would be
  meaningless and guessing at the scale is worse, so each conversion lives here
  next to the decode, tied to the line of `Covenant.sol` that defines it.
*/

const DAY = 86_400;
const CBP_PER_PERCENT = 10_000;
const SECONDS_PER_YEAR = 31_536_000n;
const MAX_UINT128 = 2n ** 128n - 1n;

/**
 * The settlement fee a fill would pay right now, in percent.
 *
 * `settlementFeeCbp` is seven tier values, not seven independent fees:
 * `settlementFee` (Covenant.sol:1089-1106) interpolates linearly between the two
 * tiers that bracket the remaining time to maturity, so a 45-day market pays
 * neither the 30-day nor the 90-day figure but a point between them. Showing one
 * tier would misstate the cost for every market that is not sitting exactly on a
 * breakpoint, which is most of them.
 *
 * Mirrored here rather than called on-chain: it is a pure function of
 * `marketState`'s own output, so it costs no extra round trip and needs no
 * `tickSpacing > 0` guard — the contract view reverts without one.
 *
 * A tier is fee-in-WAD divided by `CBP` (1e12), hence percent = cbp / 1e4.
 */
export function settlementFeePct(
  cbp: readonly number[] | undefined,
  timeToMaturitySec: number,
): number | undefined {
  if (!cbp || cbp.length < 7) return undefined;
  const t = Math.max(0, timeToMaturitySec);
  if (t >= 360 * DAY) return cbp[6] / CBP_PER_PERCENT;

  const [start, end, lower, upper] =
    t < DAY       ? [0,         DAY,       cbp[0], cbp[1]] :
    t < 7 * DAY   ? [DAY,       7 * DAY,   cbp[1], cbp[2]] :
    t < 30 * DAY  ? [7 * DAY,   30 * DAY,  cbp[2], cbp[3]] :
    t < 90 * DAY  ? [30 * DAY,  90 * DAY,  cbp[3], cbp[4]] :
    t < 180 * DAY ? [90 * DAY,  180 * DAY, cbp[4], cbp[5]] :
                    [180 * DAY, 360 * DAY, cbp[5], cbp[6]];

  return (lower * (end - t) + upper * (t - start)) / (end - start) / CBP_PER_PERCENT;
}

/**
 * The continuous fee as an annual percentage.
 *
 * `continuousFee` is a **per-second** WAD rate, not an annual one — the charge is
 * `credit * continuousFee * timeToMaturity / WAD` (Covenant.sol:372). Reading it
 * as an annual WAD understates the cost by seven orders of magnitude. The
 * protocol ceiling is ~1%/yr (`MAX_CONTINUOUS_FEE = 0.01e18 / 365 days`).
 *
 * bigint throughout: `continuousFee * SECONDS_PER_YEAR` exceeds 2^53.
 */
export function continuousFeeAprPct(fee: number | undefined): number | undefined {
  if (fee === undefined) return undefined;
  // ×1e6 is ×100 for percent and ×1e4 to carry four decimals through the divide.
  return Number((BigInt(fee) * SECONDS_PER_YEAR * 1_000_000n) / 10n ** 18n) / 10_000;
}

/**
 * Cumulative bad-debt write-down, as a percentage of lender credit.
 *
 * `lossFactor` is complement-encoded against `type(uint128).max` rather than
 * scaled to WAD: surviving credit is
 * `credit * (uint128.max - lossFactor) / (uint128.max - lastLossFactor)`
 * (Covenant.sol:855). From a zero baseline the loss fraction is therefore
 * `lossFactor / uint128.max` — a figure that would read as astronomically large
 * if it were mistaken for a WAD.
 */
export function lossPct(lossFactor: bigint | undefined): number | undefined {
  if (lossFactor === undefined) return undefined;
  return Number((lossFactor * 1_000_000n) / MAX_UINT128) / 10_000;
}

export type MarketToken = {
  /** "Collateral token" | "Loan token" — the role this token plays in THIS market. */
  role: string;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** True once the address, symbol and decimals all came back from the chain. */
  verified: boolean;
};

/**
 * The two tokens of a market, resolved from the chain and labelled by role.
 *
 * The markets UI previously implied roles rather than stating them: the pair
 * title reads "tWBTC / tUSDC" and the token marks are tinted amber and green,
 * which only tells you which is collateral if you already know. Worse, the
 * detail page hardcoded `Collateral (tWBTC)` against a config constant, so a
 * market whose collateral was anything else would have been labelled wrongly
 * with no way for the page to notice.
 *
 * This reads `loanToken` and EVERY entry of `collateralParams` out of the market
 * struct that `useMarket` already fetches, then asks each token contract for its
 * own `symbol()` and `decimals()`. Config metadata is used only as the
 * first-paint fallback, so labels are correct before the reads land and
 * authoritative after.
 *
 * `collaterals` is indexed to match `collateralParams`, which is what
 * `collateralBitmap` and `collateral(id, user, index)` are indexed by. This
 * matters for formatting: a market can declare up to 128 collaterals with
 * different decimals, so rendering a holding at index 1 with index 0's decimals
 * misplaces the decimal point by whatever the two tokens differ by — 7 tWBTC
 * (8 dp) shown as tUSDC (6 dp) reads as 700. `collateral` is kept as an alias
 * for index 0 so existing single-collateral call sites are unaffected.
 */
export function useMarketTokens(marketId: `0x${string}`) {
  const { data: market, isLoading: marketLoading } = useMarket(marketId);
  const meta = MARKETS.find((m) => m.id === marketId);

  const collateralAddrs = (market?.collateralParams ?? []).map(
    (p) => p.token as `0x${string}`,
  );
  const loanAddr = market?.loanToken as `0x${string}` | undefined;

  // The loan token is appended last so collateral indices line up with
  // `collateralParams` positions: collateral i is at 2i (symbol) and 2i+1 (decimals).
  const addrs = loanAddr ? [...collateralAddrs, loanAddr] : [];

  // symbol()/decimals() are immutable for any sane ERC20, so these never need to
  // re-poll. Batched together to keep every label arriving in the same paint.
  const erc20 = useReadContracts({
    contracts: addrs.flatMap((address) => [
      { address, abi: ERC20_ABI, functionName: "symbol" as const },
      { address, abi: ERC20_ABI, functionName: "decimals" as const },
    ]),
    query: { enabled: addrs.length > 0, staleTime: Infinity },
  });

  const at = (i: number) => erc20.data?.[i]?.result;

  // Config metadata describes index 0 only, so it is the fallback for index 0
  // alone. Guessing a later index's decimals from config would be worse than
  // admitting we do not know them yet.
  const collaterals: MarketToken[] = collateralAddrs.map((address, i) => ({
    role: collateralAddrs.length > 1 ? `Collateral ${i}` : "Collateral token",
    address,
    symbol:
      (at(i * 2) as string | undefined) ??
      (i === 0 ? meta?.collateralSymbol : undefined) ??
      "—",
    decimals:
      (at(i * 2 + 1) as number | undefined) ??
      (i === 0 ? meta?.collateralDecimals : undefined) ??
      18,
    verified: at(i * 2) !== undefined,
  }));

  const loanAt = collateralAddrs.length * 2;
  const loan: MarketToken = {
    role: "Loan token",
    address: (loanAddr ?? meta?.loanToken) as `0x${string}`,
    symbol: (at(loanAt) as string | undefined) ?? meta?.loanSymbol ?? "—",
    decimals: (at(loanAt + 1) as number | undefined) ?? meta?.loanDecimals ?? 18,
    verified: !!loanAddr && at(loanAt) !== undefined,
  };

  const collateral: MarketToken =
    collaterals[0] ?? {
      role: "Collateral token",
      address: meta?.collateralToken as `0x${string}`,
      symbol: meta?.collateralSymbol ?? "—",
      decimals: meta?.collateralDecimals ?? 18,
      verified: false,
    };

  return {
    collateral,
    collaterals,
    loan,
    isLoading: marketLoading || erc20.isLoading,
  };
}
