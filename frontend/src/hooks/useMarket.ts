import { useReadContract, useReadContracts } from "wagmi";
import { ADDRESSES, MARKETS } from "../config/chain";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";

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

export type MarketToken = {
  /** "Collateral token" | "Loan token" — the role this token plays in THIS market. */
  role: string;
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  /** True once the address, symbol and decimals all came back from the chain. */
  verified: boolean;
};

/**
 * The two tokens of a market, resolved from the chain and labelled by role.
 *
 * The markets UI previously implied roles rather than stating them: the pair
 * title reads "tWBTC / tUSDC" and the token marks are tinted amber and green,
 * which only tells you which is collateral if you already know. Worse, the
 * detail page hardcoded `Collateral (tWBTC)` against a config constant, so a
 * market whose collateral was anything else would have been labelled wrongly
 * with no way for the page to notice.
 *
 * This reads `loanToken` and `collateralParams[0].token` out of the market
 * struct that `useMarket` already fetches, then asks each token contract for
 * its own `symbol()` and `decimals()`. Config metadata is used only as the
 * first-paint fallback, so labels are correct before the reads land and
 * authoritative after.
 */
export function useMarketTokens(marketId: `0x${string}`) {
  const { data: market, isLoading: marketLoading } = useMarket(marketId);
  const meta = MARKETS.find((m) => m.id === marketId);

  const collateralAddr = market?.collateralParams[0]?.token as `0x${string}` | undefined;
  const loanAddr = market?.loanToken as `0x${string}` | undefined;

  // symbol()/decimals() are immutable for any sane ERC20, so these never need to
  // re-poll. Batched together to keep both labels arriving in the same paint.
  const erc20 = useReadContracts({
    contracts:
      collateralAddr && loanAddr
        ? ([collateralAddr, loanAddr].flatMap((address) => [
            { address, abi: ERC20_ABI, functionName: "symbol" as const },
            { address, abi: ERC20_ABI, functionName: "decimals" as const },
          ]))
        : [],
    query: { enabled: !!collateralAddr && !!loanAddr, staleTime: Infinity },
  });

  const at = (i: number) => erc20.data?.[i]?.result;

  const collateral: MarketToken = {
    role: "Collateral token",
    address: (collateralAddr ?? meta?.collateralToken) as `0x${string}`,
    symbol: (at(0) as string | undefined) ?? meta?.collateralSymbol ?? "—",
    decimals: (at(1) as number | undefined) ?? meta?.collateralDecimals ?? 18,
    verified: !!collateralAddr && at(0) !== undefined,
  };

  const loan: MarketToken = {
    role: "Loan token",
    address: (loanAddr ?? meta?.loanToken) as `0x${string}`,
    symbol: (at(2) as string | undefined) ?? meta?.loanSymbol ?? "—",
    decimals: (at(3) as number | undefined) ?? meta?.loanDecimals ?? 18,
    verified: !!loanAddr && at(2) !== undefined,
  };

  return { collateral, loan, isLoading: marketLoading || erc20.isLoading };
}
