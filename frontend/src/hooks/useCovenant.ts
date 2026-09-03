import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { CREDIT, CREDIT_DEPLOYED, CREDIT_SERVICE_URL, CREDIT_TOKENS, type TierKey } from "../config/credit";
import { COVENANT_ABI, ERC20_ABI, ETHOS_GATE_ABI, ORACLE_ABI } from "../config/abis";
import { CHAIN, QUOTE_TOKEN } from "../config/chain";

/* ── market struct ─────────────────────────────────────────────────────── */

/**
 * The on-chain `Market` struct for a tier, as viem tuple args.
 *
 * This exact shape — field order, raw values — is the market's identity: it is
 * EIP-712-hashed into the market id and into every signed offer. The values
 * come from `config/credit.ts`, which mirrors the deployment manifest.
 */
export function marketArgs(tier: TierKey) {
  const m = CREDIT.markets[tier];
  return [
    CREDIT.loanToken,
    [[CREDIT.collateralToken, m.lltv, m.maxLif, CREDIT.oracle]],
    BigInt(CREDIT.maturity),
    0n,
    m.gate!,
    m.gate!,
  ] as const;
}

/* ── reads ─────────────────────────────────────────────────────────────── */

/** The wallet's debt (raw loan units) in a tier market. */
export function useCovenantDebt(tier: TierKey) {
  const { address } = useAccount();
  const m = CREDIT.markets[tier];
  return useReadContract({
    abi: COVENANT_ABI,
    address: CREDIT.covenant ?? undefined,
    chainId: CHAIN.id,
    functionName: "debtOf",
    args: address && m.marketId ? [m.marketId, address] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });
}

/** The wallet's posted collateral (raw tBTC units) in a tier market. */
export function useCovenantCollateral(tier: TierKey) {
  const { address } = useAccount();
  const m = CREDIT.markets[tier];
  return useReadContract({
    abi: COVENANT_ABI,
    address: CREDIT.covenant ?? undefined,
    chainId: CHAIN.id,
    functionName: "collateral",
    args: address && m.marketId ? [m.marketId, address, 0n] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });
}

/** The BTC/USD oracle price (ORACLE_PRICE_SCALE-scaled). */
export function useCollateralPrice() {
  return useReadContract({
    abi: ORACLE_ABI,
    address: CREDIT.oracle ?? undefined,
    chainId: CHAIN.id,
    functionName: "price",
    query: { enabled: CREDIT_DEPLOYED, staleTime: 60_000 },
  });
}

/** Whether the wallet has a live score authorization at a tier gate. */
export function useGateAuthorization(tier: TierKey) {
  const { address } = useAccount();
  const m = CREDIT.markets[tier];
  return useReadContract({
    abi: ETHOS_GATE_ABI,
    address: m.gate ?? undefined,
    chainId: CHAIN.id,
    functionName: "canIncreaseDebt",
    args: address ? [address] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 15_000 },
  });
}

/**
 * The wallet's standing in one tier market: debt, collateral, and derived
 * health. All figures raw; formatting belongs to the caller.
 */
export function useCovenantPosition(tier: TierKey) {
  const debt = useCovenantDebt(tier);
  const collateral = useCovenantCollateral(tier);
  const price = useCollateralPrice();

  const debtRaw = debt.data as bigint | undefined;
  const collateralRaw = collateral.data as bigint | undefined;
  const priceRaw = price.data as bigint | undefined;

  const lltv = CREDIT.markets[tier].lltv;

  // maxDebt = collateral * price / 1e36 * lltv / 1e18  (loan-token raw units)
  const maxDebt =
    collateralRaw !== undefined && priceRaw !== undefined
      ? (collateralRaw * priceRaw * lltv) / 10n ** 36n / 10n ** 18n
      : undefined;

  return {
    debt: debtRaw,
    collateral: collateralRaw,
    maxDebt,
    healthy: debtRaw !== undefined && maxDebt !== undefined ? debtRaw <= maxDebt : true,
    // utilization 0..1+ — at 1 the position is at its limit
    utilization: debtRaw !== undefined && maxDebt !== undefined && maxDebt > 0n
      ? Number(debtRaw) / Number(maxDebt)
      : debtRaw !== undefined && (maxDebt === undefined || maxDebt === 0n)
        ? debtRaw > 0n
          ? Infinity
          : 0
        : 0,
    loanDecimals: CREDIT_TOKENS.loan.decimals,
    collateralDecimals: CREDIT_TOKENS.collateral.decimals,
    loanSymbol: CREDIT_TOKENS.loan.symbol,
    collateralSymbol: CREDIT_TOKENS.collateral.symbol,
    isLoading: debt.isLoading || collateral.isLoading,
    /** Wallet's tBTC balance (raw). */
    walletCollateral: useTokenBalance(CREDIT.collateralToken ?? undefined),
  };
}

function useTokenBalance(token?: `0x${string}`) {
  const { address } = useAccount();
  const { data } = useReadContract({
    abi: ERC20_ABI,
    address: token,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!token && !!address, refetchInterval: 10_000 },
  });
  return data as bigint | undefined;
}

/* ── service client ────────────────────────────────────────────────────── */

export type ScoreAuthPayload = {
  authorization: {
    wallet: string;
    score: string;
    deadline: string;
    nonce: string;
    chainId: string;
  };
  signature: { v: number; r: string; s: string };
  gate: string;
  deadline: number;
};

export type EthosScoreResponse = {
  ok: boolean;
  address: string;
  score: number;
  level: string;
  tier: TierKey;
  authorizations: Record<TierKey, ScoreAuthPayload>;
  ttlSeconds: number;
};

export type LenderOfferResponse = {
  ok: boolean;
  maker: string;
  marketId: string;
  /** Offer as viem-ready camelCase args — see fillOfferBorrow. */
  offer: Record<string, unknown>;
  notaryData: string;
  expiry: number;
};

/**
 * Fetches the wallet's live Ethos score with service-signed authorizations
 * for every tier gate. The signature — not the fetch — carries authority.
 */
export function useScoreAuthorization() {
  const { address } = useAccount();
  return useQuery<EthosScoreResponse>({
    queryKey: ["credit", "ethos-auth", address],
    queryFn: async () => {
      const response = await fetch(
        `${CREDIT_SERVICE_URL}/api/ethos-score?address=${encodeURIComponent(address!)}`,
      );
      if (!response.ok) throw new Error("Covenant credit service unavailable");
      return (await response.json()) as EthosScoreResponse;
    },
    enabled: CREDIT_DEPLOYED && !!address,
    staleTime: 60_000,
    retry: 1,
  });
}

/** Fetches a fresh signed lender offer for `units` (raw loan units). One-shot. */
export async function fetchLenderOffer(tier: TierKey, units: bigint): Promise<LenderOfferResponse> {
  const response = await fetch(
    `${CREDIT_SERVICE_URL}/api/offer?market=${tier}&units=${units.toString()}`,
  );
  if (!response.ok) throw new Error("Could not fetch a lender offer");
  return (await response.json()) as LenderOfferResponse;
}

/* ── formatting helpers ────────────────────────────────────────────────── */

/** Raw loan units → human string ("10000"). */
export const fmtLoan = (raw: bigint | undefined) =>
  raw !== undefined ? formatUnits(raw, CREDIT_TOKENS.loan.decimals) : "0";

/** Human loan string → raw units. */
export const parseLoan = (human: string) =>
  parseUnits(human || "0", CREDIT_TOKENS.loan.decimals);

/** Parse an in-progress decimal input without crashing the borrow modal. */
export function parseLoanInput(human: string): bigint {
  try {
    return parseLoan(human);
  } catch {
    return 0n;
  }
}

/** Add a rounded-up 10% volatility reserve to a requested loan amount. */
export function borrowWithVolatilityBuffer(requestedRaw: bigint): bigint {
  return (requestedRaw * 110n + 99n) / 100n;
}

/** Raw collateral units → human string. */
export const fmtCollateral = (raw: bigint | undefined) =>
  raw !== undefined ? formatUnits(raw, CREDIT_TOKENS.collateral.decimals) : "0";

/** Human collateral string → raw units. */
export const parseCollateral = (human: string) =>
  parseUnits(human || "0", CREDIT_TOKENS.collateral.decimals);

/** Parse an in-progress collateral input without crashing the borrow modal. */
export function parseCollateralInput(human: string): bigint {
  try {
    return parseCollateral(human);
  } catch {
    return 0n;
  }
}

/** tBTC needed (human) to support `loanHuman` debt at the tier's LLTV. */
export function collateralNeeded(
  tier: TierKey,
  loanRaw: bigint,
  priceRaw: bigint | undefined,
): bigint | undefined {
  if (priceRaw === undefined || priceRaw === 0n) return undefined;
  const lltv = CREDIT.markets[tier].lltv;
  // collateral = ceil(debt * 1e36 * 1e18 / (price * lltv))
  return (
    (loanRaw * 10n ** 36n * 10n ** 18n + priceRaw * lltv - 1n) /
    (priceRaw * lltv)
  );
}

/** The venue collateral symbol — tUSDC today, USDso on mainnet. */
export const VENUE_SYMBOL = QUOTE_TOKEN.symbol;
