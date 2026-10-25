import { useAccount, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { CHAIN, LOAN_TOKEN } from "../config/chain";

/** The connected wallet's MUSD balance, polled so it moves after a borrow or repay. */
export function useLoanTokenBalance() {
  const { address } = useAccount();
  /* `chainId` is pinned: without it wagmi executes the read on whatever
     chain the WALLET is connected to, and a wallet on any other network
     errors ("chain not configured") instead of returning a balance. */
  const balance = useReadContract({
    abi: erc20Abi,
    address: LOAN_TOKEN.address,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const raw = balance.data as bigint | undefined;
  return {
    raw,
    decimals: LOAN_TOKEN.decimals,
    formatted: raw !== undefined ? Number(formatUnits(raw, LOAN_TOKEN.decimals)) : undefined,
    isLoading: balance.isLoading,
    symbol: LOAN_TOKEN.symbol,
  };
}
