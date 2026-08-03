import { useReadContract } from "wagmi";
import { ADDRESSES } from "../config/chain";
import { CHAINLINK_FEED_ABI } from "../config/abis";

/** Reads latestRoundData from the Chainlink feed and returns the human-readable USD price. */
export function useOraclePrice() {
  const { data, isLoading, refetch } = useReadContract({
    address: ADDRESSES.chainlinkFeed,
    abi: CHAINLINK_FEED_ABI,
    functionName: "latestRoundData",
    query: { refetchInterval: 30_000 },
  });
  const answer = data ? (data[1] as bigint) : undefined;
  const updatedAt = data ? Number(data[3] as bigint) : undefined;
  const usd = answer !== undefined ? Number(answer) / 1e8 : undefined;
  const staleSec = updatedAt ? Math.max(0, Math.floor(Date.now() / 1000) - updatedAt) : undefined;
  return { usd, updatedAt, staleSec, isLoading, refetch };
}
