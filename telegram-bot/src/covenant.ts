import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  type Address,
} from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { config, COVENANT, ORACLE, TEST_USDC, TIERS, tierFor, type TierKey } from "./config.js";

const covenantAbi = [
  {
    type: "function",
    name: "debtOf",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint128" }],
  },
  {
    type: "function",
    name: "collateral",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "user", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint128" }],
  },
] as const;

const oracleAbi = [
  {
    type: "function",
    name: "price",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const client = createPublicClient({
  chain: somniaShannon,
  transport: http(config.rpcUrl),
});

export interface EthosSummary {
  score: number;
  level: string;
  tier: TierKey;
}

export interface CapacitySummary extends EthosSummary {
  address: Address;
  walletCollateral: number;
  postedCollateral: number;
  debt: number;
  maxDebt: number;
  undrawnCredit: number;
  available: number;
}

export async function ethosSummary(address: Address): Promise<EthosSummary> {
  const response = await fetch(
    `${config.apiUrl}/api/ethos-score?address=${encodeURIComponent(address)}`,
  );
  if (!response.ok) throw new Error(`Covenant credit service returned ${response.status}.`);
  const data = (await response.json()) as {
    ok: boolean;
    score: number;
    level: string;
    tier?: TierKey;
  };
  if (!data.ok) throw new Error("Ethos score unavailable.");
  /* The tier key is remote input — an unexpected value would make
     TIERS[ethos.tier] undefined and crash capacitySummary deep inside the
     contract-read fan-out. Fall back to the score-derived tier. */
  const tier: TierKey =
    data.tier !== undefined && data.tier in TIERS ? data.tier : tierFor(data.score);
  return { score: data.score, level: data.level, tier };
}

export async function capacitySummary(address: Address): Promise<CapacitySummary> {
  const ethos = await ethosSummary(address);
  const tier = TIERS[ethos.tier];
  const [walletRaw, decimals, debtRaw, collateralRaw, priceRaw] = await Promise.all([
    client.readContract({
      abi: erc20Abi,
      address: TEST_USDC,
      functionName: "balanceOf",
      args: [address],
    }),
    client.readContract({ abi: erc20Abi, address: TEST_USDC, functionName: "decimals" }),
    client.readContract({
      abi: covenantAbi,
      address: COVENANT,
      functionName: "debtOf",
      args: [tier.marketId, address],
    }),
    client.readContract({
      abi: covenantAbi,
      address: COVENANT,
      functionName: "collateral",
      args: [tier.marketId, address, 0n],
    }),
    client.readContract({ abi: oracleAbi, address: ORACLE, functionName: "price" }),
  ]);

  // Mirrors frontend/src/hooks/useCovenant.ts exactly. Loan token is 6dp;
  // posted collateral is 8dp; the oracle/LLTV scales cancel through 1e36/1e18.
  const maxDebtRaw = (collateralRaw * priceRaw * tier.lltv) / 10n ** 36n / 10n ** 18n;
  const undrawnRaw = maxDebtRaw > debtRaw ? maxDebtRaw - debtRaw : 0n;
  const human = (value: bigint) => Number(formatUnits(value, decimals));
  return {
    ...ethos,
    address,
    walletCollateral: human(walletRaw),
    postedCollateral: Number(formatUnits(collateralRaw, 8)),
    debt: human(debtRaw),
    maxDebt: human(maxDebtRaw),
    undrawnCredit: human(undrawnRaw),
    available: human(walletRaw + undrawnRaw),
  };
}

export async function nativeBalance(address: Address): Promise<number> {
  return Number(formatUnits(await client.getBalance({ address }), 18));
}
