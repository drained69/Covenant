import { useReadContract } from "wagmi";
import { ADDRESSES } from "../config/chain";

/**
 * Reads BTC/USD from the owner-push BtcUsdOracle deployed on Monad. Chainlink Data Feeds are not
 * on Monad testnet, so the oracle is a manual-push adapter; a keeper posts prices periodically.
 *
 * `rawPrice` is the raw 8-decimal price (Chainlink convention, e.g. $100_000 = 100_000e8).
 * `updatedAt` is the Unix seconds of the last push; `staleSec` is how old that push is.
 */
const BTC_USD_ORACLE_ABI = [
  { type: "function", stateMutability: "view", name: "rawPrice",  inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "updatedAt", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

export function useOraclePrice() {
  const raw = useReadContract({
    address: ADDRESSES.oracle,
    abi: BTC_USD_ORACLE_ABI,
    functionName: "rawPrice",
    query: { refetchInterval: 30_000 },
  });
  const upd = useReadContract({
    address: ADDRESSES.oracle,
    abi: BTC_USD_ORACLE_ABI,
    functionName: "updatedAt",
    query: { refetchInterval: 30_000 },
  });

  const rawPrice = raw.data as bigint | undefined;
  const updatedAt = upd.data !== undefined ? Number(upd.data as bigint) : undefined;
  const usd = rawPrice !== undefined ? Number(rawPrice) / 1e8 : undefined;
  const staleSec = updatedAt ? Math.max(0, Math.floor(Date.now() / 1000) - updatedAt) : undefined;

  return {
    usd,
    updatedAt,
    staleSec,
    isLoading: raw.isLoading || upd.isLoading,
    refetch: () => { void raw.refetch(); void upd.refetch(); },
  };
}
