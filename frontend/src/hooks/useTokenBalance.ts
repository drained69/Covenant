import { useReadContract, useReadContracts } from "wagmi";
import { ERC20_ABI } from "../config/abis";
import { TOKENS } from "../config/chain";

export function useTokenBalance(token: `0x${string}`, account?: `0x${string}`) {
  return useReadContract({
    address: token, abi: ERC20_ABI,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled: !!account, refetchInterval: 15_000 },
  });
}

export function useAllowance(token: `0x${string}`, owner?: `0x${string}`, spender?: `0x${string}`) {
  return useReadContract({
    address: token, abi: ERC20_ABI,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    // Poll so a stale allowance doesn't force the user through a redundant
    // approve. useTx also invalidates on confirm, this is the fallback for
    // approvals done outside our own UI.
    query: { enabled: !!owner && !!spender, refetchInterval: 15_000 },
  });
}

/**
 * Every deployment token's balance for one wallet, in one multicall.
 *
 * `useTokenBalance` is per-token and fine inside a form that touches exactly one
 * token. A persistent balances display needs all of them, and issuing N separate
 * `useReadContract` calls means N round-trips that land at different times — the
 * list visibly fills in row by row. `useReadContracts` batches them so the whole
 * set resolves together and shares a single loading state.
 *
 * Returns entries in `TOKENS` order so callers can render without re-joining.
 */
export function useWalletBalances(account?: `0x${string}`) {
  const query = useReadContracts({
    contracts: TOKENS.map((t) => ({
      address: t.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: account ? [account] : undefined,
    })),
    query: { enabled: !!account, refetchInterval: 15_000 },
  });

  const balances = TOKENS.map((token, i) => ({
    token,
    raw: query.data?.[i]?.result as bigint | undefined,
  }));

  return { balances, isLoading: query.isLoading, refetch: query.refetch };
}
