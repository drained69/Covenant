import { useReadContract } from "wagmi";
import { ERC20_ABI } from "../config/abis";

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
