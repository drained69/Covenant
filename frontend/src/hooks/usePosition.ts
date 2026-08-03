import { useEffect } from "react";
import { useReadContracts, useBlockNumber } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { ADDRESSES } from "../config/chain";
import { COVENANT_ABI } from "../config/abis";

/**
 * Reads a wallet's credit/debt/collateral in one batched call.
 *
 * Freshness strategy (belt + suspenders — the previous single 20s interval
 * missed same-block updates and depended on cache invalidation reaching):
 *   1. useBlockNumber({ watch: true }) → invalidate this query on every new
 *      block. Realtime without polling overhead on Sepolia's ~12s blocks.
 *   2. refetchInterval: 5_000 as safety net if block subscription drops.
 *   3. refetchOnWindowFocus + refetchOnMount catch tab-refocus and route changes.
 *   4. useTx also invalidates queryClient globally after every confirmed tx.
 */
export function usePosition(marketId: `0x${string}`, account?: `0x${string}`) {
  const queryClient = useQueryClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const query = useReadContracts({
    contracts: account
      ? [
          { address: ADDRESSES.covenant, abi: COVENANT_ABI, functionName: "creditOf",   args: [marketId, account] },
          { address: ADDRESSES.covenant, abi: COVENANT_ABI, functionName: "debtOf",     args: [marketId, account] },
          { address: ADDRESSES.covenant, abi: COVENANT_ABI, functionName: "collateral", args: [marketId, account, 0n] },
        ]
      : [],
    query: {
      enabled: !!account,
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  });

  useEffect(() => {
    if (blockNumber && account) {
      queryClient.invalidateQueries({ queryKey: query.queryKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, account]);

  return query;
}
