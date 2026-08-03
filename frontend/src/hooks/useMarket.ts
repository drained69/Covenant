import { useReadContract } from "wagmi";
import { ADDRESSES } from "../config/chain";
import { COVENANT_ABI } from "../config/abis";

/** Live-fetches the Market struct from covenant.toMarket(id). */
export function useMarket(marketId: `0x${string}`) {
  return useReadContract({
    address: ADDRESSES.covenant,
    abi: COVENANT_ABI,
    functionName: "toMarket",
    args: [marketId],
  });
}

export function useMarketVitals(marketId: `0x${string}`) {
  // Poll every 20s so the market-wide counters stay fresh under activity from
  // other users. useTx also invalidates after our own transactions, which is
  // the primary refresh path for the connected user.
  const poll = { query: { refetchInterval: 20_000 } };
  const totalUnits = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "totalUnits", args: [marketId], ...poll,
  });
  const withdrawable = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "withdrawable", args: [marketId], ...poll,
  });
  const tickSpacing = useReadContract({
    address: ADDRESSES.covenant, abi: COVENANT_ABI,
    functionName: "tickSpacing", args: [marketId], ...poll,
  });
  return { totalUnits, withdrawable, tickSpacing };
}
