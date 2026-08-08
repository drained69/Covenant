import { useReadContract } from "wagmi";
import { LADDER, LADDER_DEPLOYED } from "../config/chain";
import { CREDIT_LADDER_LENS_ABI } from "../config/abis";

/** Sentinel the lens returns when a wallet clears no rung: `type(uint256).max`. */
const NO_RUNG = (1n << 256n) - 1n;

type StaticRung = (typeof LADDER.rungs)[number];

export type LadderRung = {
  /** Static config: label, intended sub-tier bar, documented LLTV, who qualifies. */
  readonly config: StaticRung;
  /** Position in the ladder, 0 = top rung. Stable regardless of what the chain says. */
  readonly index: number;
  /** LLTV in WAD — on-chain value when available, otherwise the documented one. */
  readonly lltv: bigint;
  /** Collateral to post for `borrowAmount` at this rung, in collateral-token units. */
  readonly collateralRequired?: bigint;
  /**
   * Credential bar read from the gate's rule list. `undefined` before the read lands.
   * Zero is meaningful and distinct from the config's intended bar: it means the gate
   * exposes no rules, which is what an unregistered gate looks like.
   */
  readonly minSubTier?: number;
  /** Whether this wallet may increase debt here right now. `undefined` before the read. */
  readonly accessible?: boolean;
  /** The rung's gate, read from the market id. */
  readonly gate?: `0x${string}`;
};

/**
 * Resolves a wallet against the credit ladder through `CreditLadderLens.ladder()`.
 *
 * One `eth_call` answers the whole panel: which rungs exist, which one this wallet clears,
 * what it would have to post at each, and what credential bar each gate enforces. The lens
 * derives all of that from the market ids alone, so there is no per-rung config here that
 * could drift from the chain.
 *
 * Two states the caller must distinguish and this hook keeps separate:
 *
 *   `deployed === false` — `script/DeployLadder.s.sol` has not been broadcast, so there is
 *   no lens and no market ids. Rungs carry their documented terms and nothing else. No call
 *   is made; this is not an error state and must not be rendered as one.
 *
 *   `deployed === true` but a rung reads `minSubTier === 0` and `accessible === false` —
 *   the market exists but its gate has not completed Cleanverse registration, so its rule
 *   list is empty and it denies every wallet, credentialed or not.
 *
 * Failures fail closed, matching the lens and the gate: an unreachable read leaves
 * `accessible` undefined rather than optimistically true.
 */
export function useLadder(wallet: `0x${string}` | undefined, borrowAmount: bigint) {
  const marketIds = LADDER.rungs
    .map((r) => r.marketId)
    .filter((id): id is `0x${string}` => id !== null);

  const enabled = LADDER_DEPLOYED && !!wallet;

  const { data, isLoading, refetch } = useReadContract({
    address: (LADDER.lens ?? undefined) as `0x${string}` | undefined,
    abi: CREDIT_LADDER_LENS_ABI,
    functionName: "ladder",
    args: [wallet as `0x${string}`, marketIds, borrowAmount],
    query: { enabled },
  });

  const [bestRaw, live] = data ?? [undefined, undefined];

  // Rungs are declared top-first in config and passed to the lens in that order, so the
  // returned array indexes line up. Merge rather than replace: the static label and the
  // "who qualifies" copy have no on-chain counterpart.
  const rungs: LadderRung[] = LADDER.rungs.map((config, index) => {
    const chain = live?.[index];
    return {
      config,
      index,
      lltv: chain?.lltv ?? config.lltv,
      collateralRequired: chain?.collateralRequired,
      minSubTier: chain ? Number(chain.minSubTier) : undefined,
      accessible: chain?.accessible,
      gate: chain?.gate,
    };
  });

  // `bestRung` is an index into the array we supplied, or the max-uint sentinel.
  const bestIndex =
    bestRaw !== undefined && bestRaw !== NO_RUNG ? Number(bestRaw) : null;

  const best = bestIndex !== null ? (rungs[bestIndex] ?? null) : null;

  /**
   * The rung immediately above the one the wallet reached — the gap a credential upgrade
   * would close. With no rung reached, the target is the ladder's entry point (the bottom
   * rung), because that is the upgrade that matters first.
   */
  const next =
    bestIndex === null
      ? (rungs[rungs.length - 1] ?? null)
      : bestIndex > 0
        ? (rungs[bestIndex - 1] ?? null)
        : null;

  return {
    deployed: LADDER_DEPLOYED,
    loading: enabled && isLoading,
    /** True once the lens has answered — distinguishes "no rung" from "not asked". */
    resolved: bestRaw !== undefined,
    rungs,
    bestIndex,
    best,
    next,
    refetch,
  };
}
