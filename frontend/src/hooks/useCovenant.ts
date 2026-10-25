import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { fmtAmount } from "../lib/format";
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

  // Covenant credits collateral with two floors: floor(floor(collateral * price / 1e36) * lltv / 1e18).
  // A single combined division overstates capacity and lets the UI request a borrow the contract rejects.
  const maxDebt =
    collateralRaw !== undefined && priceRaw !== undefined
      ? mulDivDown(mulDivDown(collateralRaw, priceRaw, 10n ** 36n), lltv, 10n ** 18n)
      : undefined;

  const minimumCollateral =
    debtRaw !== undefined && priceRaw !== undefined
      ? collateralNeeded(tier, debtRaw, priceRaw)
      : undefined;
  const excessCollateral =
    collateralRaw !== undefined && minimumCollateral !== undefined && collateralRaw > minimumCollateral
      ? collateralRaw - minimumCollateral
      : 0n;

  // Missing debt is "not loaded", not healthy. Missing price with open debt is not healthy.
  const healthy =
    debtRaw === undefined ? true : maxDebt === undefined ? debtRaw === 0n : debtRaw <= maxDebt;

  return {
    debt: debtRaw,
    collateral: collateralRaw,
    maxDebt,
    excessCollateral,
    healthy,
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
      const cacheKey = `covenant-score-auth:${address!.toLowerCase()}`;
      try {
        const response = await fetch(
          `${CREDIT_SERVICE_URL}/api/ethos-score?address=${encodeURIComponent(address!)}`,
        );
        if (!response.ok) throw new Error("Covenant credit service unavailable");
        const body = (await response.json()) as EthosScoreResponse;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(body));
        } catch {
          /* private mode */
        }
        return body;
      } catch (error) {
        // A signature already issued is still valid until its deadline. The
        // service being down must not wipe an authorization the user can submit.
        const cached = readCachedScore(cacheKey);
        if (cached) return cached;
        throw error;
      }
    },
    enabled: CREDIT_DEPLOYED && !!address,
    staleTime: 60_000,
    retry: 1,
  });
}

function readCachedScore(cacheKey: string): EthosScoreResponse | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const body = JSON.parse(raw) as EthosScoreResponse;
    const deadline = Number(body.authorizations?.open?.authorization?.deadline ?? 0);
    if (!Number.isFinite(deadline) || deadline <= Math.floor(Date.now() / 1000) + 60) return null;
    return body;
  } catch {
    return null;
  }
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

/** Raw loan units → exact decimal string for inputs ("10000.5"). Use `displayLoan` for text. */
export const fmtLoan = (raw: bigint | undefined) =>
  raw !== undefined ? formatUnits(raw, CREDIT_TOKENS.loan.decimals) : "0";

/** Raw loan units → "1,572.92". */
export const displayLoan = (raw: bigint | undefined, maxFrac = 2) =>
  fmtAmount(raw, CREDIT_TOKENS.loan.decimals, maxFrac);

/** Raw collateral units → "0.0125". */
export const displayCollateral = (raw: bigint | undefined, maxFrac = 6) =>
  fmtAmount(raw, CREDIT_TOKENS.collateral.decimals, maxFrac);

/** Oracle price → loan tokens per whole collateral token (e.g. MUSD per BTC). */
export function oraclePrice(priceRaw: bigint | undefined): number | undefined {
  if (priceRaw === undefined) return undefined;
  const { loan, collateral } = CREDIT_TOKENS;
  return Number(formatUnits(priceRaw * 10n ** BigInt(collateral.decimals), 36 + loan.decimals));
}

/** Loan-token value of a raw collateral amount at the oracle price. */
export function collateralValue(collateralRaw: bigint | undefined, priceRaw: bigint | undefined): bigint | undefined {
  if (collateralRaw === undefined || priceRaw === undefined) return undefined;
  return mulDivDown(collateralRaw, priceRaw, 10n ** 36n);
}

/** Health factor = borrowing capacity at LLTV / debt. Below 1 the position is liquidatable. */
export function healthFactor(maxDebt: bigint | undefined, debt: bigint | undefined): number | undefined {
  if (maxDebt === undefined || debt === undefined || debt === 0n) return undefined;
  return Number((maxDebt * 10_000n) / debt) / 10_000;
}

/** Collateral price (loan tokens per whole collateral token) at which the position hits its LLTV. */
export function liquidationPrice(tier: TierKey, debtRaw: bigint, collateralRaw: bigint): number | undefined {
  if (debtRaw === 0n || collateralRaw === 0n) return undefined;
  const { loan, collateral } = CREDIT_TOKENS;
  const debt = Number(formatUnits(debtRaw, loan.decimals));
  const coll = Number(formatUnits(collateralRaw, collateral.decimals));
  const lltv = Number(CREDIT.markets[tier].lltv) / 1e18;
  return debt / (coll * lltv);
}

/** Liquidation incentive implied by maxLif (1.18e18 → 0.18). */
export const liquidationBonus = (tier: TierKey) => Number(CREDIT.markets[tier].maxLif) / 1e18 - 1;

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

/** Collateral required so `isHealthy` holds. Undoes Covenant's two floors, lltv first then price. */
export function collateralNeeded(
  tier: TierKey,
  loanRaw: bigint,
  priceRaw: bigint | undefined,
): bigint | undefined {
  if (priceRaw === undefined || priceRaw === 0n) return undefined;
  const lltv = CREDIT.markets[tier].lltv;
  if (loanRaw === 0n || lltv === 0n) return 0n;
  // k = ceil(debt * 1e18 / lltv); collateral = ceil(k * 1e36 / price)
  const k = mulDivUp(loanRaw, 10n ** 18n, lltv);
  return mulDivUp(k, 10n ** 36n, priceRaw);
}

function mulDivDown(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b) / c;
}

function mulDivUp(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b + c - 1n) / c;
}

const TIERS: TierKey[] = ["open", "established", "reputable"];

/** Debt and posted collateral across every credit market, not only the score's current tier. */
export function useCreditPortfolio() {
  const open = useCovenantPosition("open");
  const established = useCovenantPosition("established");
  const reputable = useCovenantPosition("reputable");
  const rows = { open, established, reputable };
  const loaded = TIERS.every((tier) => rows[tier].debt !== undefined && rows[tier].collateral !== undefined);
  const debt = loaded ? TIERS.reduce((sum, tier) => sum + (rows[tier].debt ?? 0n), 0n) : undefined;
  const collateral = loaded ? TIERS.reduce((sum, tier) => sum + (rows[tier].collateral ?? 0n), 0n) : undefined;
  return {
    rows,
    debt,
    collateral,
    isLoading: TIERS.some((tier) => rows[tier].isLoading),
  };
}

export type BookOffer = {
  market: string;
  maker: string;
  maxUnits: string;
  expiry: number;
  tick?: string;
};

/** Posted par offers. Omit `market` to read every tier. */
export function useOfferBook(market?: TierKey) {
  return useQuery({
    queryKey: ["credit", "offers", market ?? "all"],
    queryFn: async () => {
      const query = market ? `?market=${market}` : "";
      const response = await fetch(`${CREDIT_SERVICE_URL}/api/offers${query}`);
      if (!response.ok) throw new Error("Offer book unavailable");
      return (await response.json()) as { offers: BookOffer[] };
    },
    refetchInterval: 15_000,
  });
}

/** MUSD the house lender can still fill, plus every other wallet's posted offer. */
export function useMarketLiquidity() {
  const book = useOfferBook();
  const health = useQuery({
    queryKey: ["credit", "health"],
    queryFn: async () => {
      const response = await fetch(`${CREDIT_SERVICE_URL}/api/health`);
      if (!response.ok) throw new Error("Credit service unavailable");
      return (await response.json()) as { ok: boolean; lender?: `0x${string}` };
    },
    staleTime: 60_000,
  });
  const lender = health.data?.lender;
  const balance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: lender ? [lender] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!lender, refetchInterval: 20_000 },
  });
  const house = balance.data as bigint | undefined;

  function forMarket(market: TierKey): bigint | undefined {
    if (house === undefined || !book.data) return undefined;
    const posted = book.data.offers.reduce((sum, row) => {
      if (row.market !== market) return sum;
      if (lender && row.maker.toLowerCase() === lender.toLowerCase()) return sum;
      try {
        return sum + BigInt(row.maxUnits);
      } catch {
        return sum;
      }
    }, 0n);
    return house + posted;
  }

  return {
    lender,
    house,
    book: book.data?.offers ?? [],
    forMarket,
    isLoading: book.isLoading || health.isLoading || (!!lender && balance.isLoading),
  };
}

/** The venue collateral symbol — tUSDC today, USDso on mainnet. */
export const VENUE_SYMBOL = QUOTE_TOKEN.symbol;

const MARKET_STATE_ABI = [
  {
    type: "function",
    name: "totalUnits",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "withdrawable",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ name: "", type: "uint128" }],
  },
] as const;

export type MarketStats = {
  /** Lender credit outstanding (MUSD lent, face value). */
  supplied: bigint;
  /** Debt still owed: lent units not yet repaid into `withdrawable`. */
  borrowed: bigint;
  /** MUSD lenders can still fill into new loans. */
  liquidity: bigint | undefined;
  /** borrowed / (borrowed + liquidity). */
  utilization: number | undefined;
};

/** Market-level state for every tier, read from the core plus the offer book. */
export function useProtocolStats() {
  const liquidity = useMarketLiquidity();
  const price = useCollateralPrice();
  const reads = useReadContracts({
    contracts: TIERS.flatMap((tier) => {
      const id = CREDIT.markets[tier].marketId!;
      return [
        { abi: MARKET_STATE_ABI, address: CREDIT.covenant!, chainId: CHAIN.id, functionName: "totalUnits", args: [id] },
        { abi: MARKET_STATE_ABI, address: CREDIT.covenant!, chainId: CHAIN.id, functionName: "withdrawable", args: [id] },
      ] as const;
    }),
    query: { enabled: CREDIT_DEPLOYED, refetchInterval: 20_000 },
  });

  const markets = {} as Record<TierKey, MarketStats | undefined>;
  TIERS.forEach((tier, i) => {
    const units = reads.data?.[i * 2]?.result as bigint | undefined;
    const withdrawable = reads.data?.[i * 2 + 1]?.result as bigint | undefined;
    if (units === undefined || withdrawable === undefined) {
      markets[tier] = undefined;
      return;
    }
    const borrowed = units > withdrawable ? units - withdrawable : 0n;
    const liq = liquidity.forMarket(tier);
    const denom = liq === undefined ? undefined : borrowed + liq;
    markets[tier] = {
      supplied: units,
      borrowed,
      liquidity: liq,
      utilization: denom === undefined ? undefined : denom === 0n ? 0 : Number((borrowed * 10_000n) / denom) / 10_000,
    };
  });

  const loaded = TIERS.every((tier) => markets[tier] !== undefined);
  const totalBorrowed = loaded ? TIERS.reduce((sum, t) => sum + markets[t]!.borrowed, 0n) : undefined;
  const totalSupplied = loaded ? TIERS.reduce((sum, t) => sum + markets[t]!.supplied, 0n) : undefined;
  // The house lender's balance backs every tier at once, so it counts once in the total.
  const postedElsewhere = liquidity.book
    .filter((row) => !liquidity.lender || row.maker.toLowerCase() !== liquidity.lender.toLowerCase())
    .reduce((sum, row) => {
      try {
        return sum + BigInt(row.maxUnits);
      } catch {
        return sum;
      }
    }, 0n);
  const totalLiquidity = liquidity.house === undefined ? undefined : liquidity.house + postedElsewhere;

  return {
    markets,
    totalBorrowed,
    totalSupplied,
    totalLiquidity,
    priceRaw: price.data as bigint | undefined,
    price: oraclePrice(price.data as bigint | undefined),
    isLoading: reads.isLoading || liquidity.isLoading,
  };
}

/** Borrowing capacity of `collateralRaw` in a tier, with the core's two floors. */
export function maxDebtFor(tier: TierKey, collateralRaw: bigint, priceRaw: bigint | undefined): bigint | undefined {
  if (priceRaw === undefined) return undefined;
  return mulDivDown(mulDivDown(collateralRaw, priceRaw, 10n ** 36n), CREDIT.markets[tier].lltv, 10n ** 18n);
}

/** Native BTC kept back for gas when a form offers "Max" collateral on Mezo. */
export const GAS_RESERVE = parseUnits("0.0002", CREDIT_TOKENS.collateral.decimals);
