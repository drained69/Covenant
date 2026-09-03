import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract, useWalletClient } from "wagmi";
import { formatUnits, erc20Abi } from "viem";
import type {
  BinaryMarket,
  BookLevel,
  UnifiedMarket,
  UnifiedOrderBook,
  Portfolio,
  OpenPositionPnL,
  MarketOnchain,
} from "@somnia-chain/markets-sdk";
import {
  useWatchMarket,
  useLiveBinaryOrderBookByMarket,
  useLiveFills,
  useLiveStatus,
  useLivePrice as useSdkLivePrice,
} from "@somnia-chain/markets-sdk/react";
import { bindSigner, dreamdexClient, dreamdexExchange } from "../config/dreamdex";
import { CHAIN, QUOTE_TOKEN } from "../config/chain";

/**
 * Every read below rides ONE connection.
 *
 * The previous shape built a `new SomniaMarkets(...)` per query and closed it in
 * a `finally`, which meant each read paid a fresh WebSocket handshake and could
 * only ever poll — the live tail never survived long enough to stream. The
 * client now lives in `config/dreamdex.ts` for the app's lifetime, so the
 * order-book, price and fill hooks read a locally-materialized store that the
 * socket keeps current, and the indexer-backed reads reuse the same transport.
 */

export function useDreamDexMarkets() {
  return useQuery({
    queryKey: ["dreamdex", "live-binary-markets"],
    queryFn: async () => {
      // `loadMarkets(false)` uses the SDK's own in-memory cache when warm,
      // so a return-visit to /markets is instant; only the FIRST call in a
      // browser session hits the indexer. Under `true` the app blocked on
      // a 4-8s GraphQL round-trip on every mount, even when the same list
      // was already in memory a second earlier.
      await dreamdexExchange.loadMarkets(false);
      return Object.values(dreamdexExchange.markets).filter(
        (market) => market.type === "binary" && market.active,
      );
    },
    // Longer stale window than the SDK ttl. React Query serves the cached
    // list synchronously for a minute, and a background refetch runs only
    // when the tab regains focus — the market universe changes on the
    // hour-scale, not the second-scale, so this is not stale in practice.
    staleTime: 60_000,
    // The prior page render stays on screen while a refetch is in flight —
    // no more "Connecting to the DreamDEX market registry…" flash between
    // navigations for the same list.
    placeholderData: (prev) => prev,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useDreamDexMarket(marketId?: string) {
  return useQuery({
    queryKey: ["dreamdex", "market", marketId],
    queryFn: async () => {
      if (!marketId) throw new Error("Market id is required");
      return await dreamdexClient.getBinaryMarket(marketId);
    },
    enabled: !!marketId,
    staleTime: 10_000,
  });
}

/**
 * The resting book of one Event Contract outcome — streamed, not polled.
 *
 * `useLiveBinaryOrderBookByMarket` reads a book the SDK materializes locally
 * from order events arriving over the venue socket, so a level appears the
 * moment its `OrderPlaced` log lands rather than on the next refetch tick.
 *
 * Keyed by MARKET, deliberately. A BinaryPool is recycled across expiry
 * windows, so a pool-keyed read on a tab left open would silently start
 * rendering the *successor* market's orders. The by-market read returns an
 * empty book once this market is no longer the pool's current binding, which
 * is the honest answer for a market that has rolled.
 *
 * `useWatchMarket` opens the pool subscription that hydrates it; the SDK
 * ref-counts watches, so several components on one market share a single
 * subscription and it closes when the last of them unmounts.
 *
 * Returned in the venue's human terms — price as probability in [0,1], size in
 * whole outcome tokens — using the market's own `quoteDecimals`/`baseDecimals`
 * rather than an assumed 6dp, because collateral is 6dp tUSDC on testnet and
 * 18dp USDso on mainnet.
 */
export function useDreamDexBook(
  market?: BinaryMarket,
  outcome: "up" | "down" = "up",
  depth = 12,
) {
  const status = useWatchMarket(market?.poolAddress);
  const raw = useLiveBinaryOrderBookByMarket(market?.marketId, depth);
  return useMemo(() => {
    if (!market) {
      return { data: undefined, isLoading: false, isLive: false, status };
    }

    const priceScale = 10 ** market.quoteDecimals;
    const sizeScale = 10 ** market.baseDecimals;
    const toLevels = (levels: BookLevel[]): [number, number][] =>
      levels.map((level) => [
        Number(level.price) / priceScale,
        Number(level.quantity) / sizeScale,
      ]);

    // The SDK already derives the NO side by inverting YES (price = 1 − yes),
    // so a DOWN order books against real NO-token liquidity rather than a
    // number this hook synthesized.
    const data: UnifiedOrderBook = {
      symbol: outcome === "up" ? "UP" : "DOWN",
      bids: toLevels(outcome === "up" ? raw.yesBids : raw.noBids),
      asks: toLevels(outcome === "up" ? raw.yesAsks : raw.noAsks),
      timestamp: Date.now(),
      info: raw,
    };

    return {
      data,
      // "hydrating" is the first-paint state: the watch is open but the seam
      // between the indexer snapshot and the socket has not closed yet.
      isLoading: status === "hydrating",
      isLive: status === "live",
      status,
    };
  }, [market, outcome, raw, status]);
}

/**
 * Live underlying price for the asset an Event Contract settles on.
 *
 * The same EMA feed the market's resolution is decided against, now read from
 * the price-feed tail: the value changes when a tick is pushed, not when a
 * timer fires. Wrapped as `{ data }` so callers read `live.data?.price`
 * exactly as they did against the polled version.
 */
export function useLivePrice(asset?: string) {
  const data = useSdkLivePrice(asset);
  return useMemo(() => ({ data: data ?? undefined }), [data]);
}

/**
 * The venue's live trade tape for one market.
 *
 * Fills as the socket sees them, newest first — the read that makes the tail
 * visible to a trader. Watches the market's pool while mounted.
 */
export function useDreamDexTape(market?: BinaryMarket, limit = 20) {
  useWatchMarket(market?.poolAddress);
  return useLiveFills(market?.poolAddress, limit);
}

/**
 * Connection state of the DreamDEX tail, for a status indicator.
 *
 * `wsConnected` is the socket itself; `lag` is how far the locally-materialized
 * store trails the chain head. A UI that claims to be live owes the user a way
 * to see when it is not.
 */
export function useVenueTail() {
  const status = useLiveStatus();
  return useMemo(
    () => ({
      connected: status.wsConnected,
      watching: status.watchCount,
      headBlock: status.headBlock,
      lastBlock: status.lastBlock,
      lag: Math.max(0, status.headBlock - status.lastBlock),
      mode: status.mode,
    }),
    [status],
  );
}

/**
 * A market's LIVE on-chain state: status enum, winning outcome, and the
 * outcome-token ids needed for redemption.
 *
 * The indexer trails the chain by a few seconds, so every write path gates on
 * this read: `status === 1` means the pool will actually accept an order.
 * After expiry it carries `winningOutcome`/`isVoided` — the redemption truth.
 */
export function useMarketOnchain(marketId?: string) {
  return useQuery<MarketOnchain>({
    queryKey: ["dreamdex", "onchain", marketId],
    queryFn: async () => {
      if (!marketId) throw new Error("Market id is required");
      return await dreamdexClient.getMarketOnchain(marketId as `0x${string}`);
    },
    enabled: !!marketId,
    refetchInterval: 5_000,
  });
}

/** A settled market the wallet still holds claimable outcome tokens in. */
export type ClaimablePosition = {
  marketId: string;
  question: string;
  asset: string;
  interval: string | null;
  /** 0 = Up won, 1 = Down won; on a void both sides pay 0.5. */
  voided: boolean;
  winningOutcome: 0 | 1 | null;
  /** Raw outcome-token balances held. */
  upBalance: bigint;
  downBalance: bigint;
  /** Raw collateral the redemption would pay, if claimed now. */
  payout: bigint;
  quoteDecimals: number;
  expiresAt: number;
};

/**
 * Winnings sitting unredeemed across recently settled markets.
 *
 * This is the step prediction-market UIs usually miss: settled markets leave
 * the live list, so winnings silently sit in the ERC-6909 singleton. This scan
 * walks the Finalized tail, reads the wallet's outcome balances per market
 * from the chain, and prices the claim — winning side net of the venue's
 * settlement fee (both sides at 0.5 on a void).
 */
export function useSettledClaimables() {
  const { address } = useAccount();
  return useQuery<ClaimablePosition[]>({
    queryKey: ["dreamdex", "claimables", address],
    queryFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      const settled = await dreamdexClient.listBinaryMarkets({
        status: "Finalized",
        limit: 120,
      });
      // Server sorts newest-created; newest-EXPIRED is what we want.
      const recent = [...settled]
        .sort((a, b) => Number(b.expiry ?? 0) - Number(a.expiry ?? 0))
        .slice(0, 40);

      const claimables: ClaimablePosition[] = [];
      for (const row of recent) {
        const onchain = await dreamdexClient.getMarketOnchain(
          row.marketId as `0x${string}`,
        );
        if (!onchain.isResolved && !onchain.isVoided) continue;

        const up = await dreamdexClient.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: address,
          id: onchain.yesId,
        });
        const down = await dreamdexClient.getOutcomeBalance({
          outcomeToken: onchain.outcomeToken,
          account: address,
          id: onchain.noId,
        });
        if (up === 0n && down === 0n) continue;

        /* The venue skims a settlement fee from the WINNING payout at redeem
           (SDK estPayoutFor: amount × (10_000 − feeBps) / 10_000). Voids pay
           both sides a half with no fee. Pricing the winner at full par
           overstated the claim; net it the way the contract will. */
        const fees = await dreamdexClient.getMarketFees(row.marketId);
        const feeBps = BigInt(fees?.settlementFeeBps ?? "0");

        const dec = onchain.decimals;
        const net = (amount: bigint) => (amount * (10_000n - feeBps)) / 10_000n;
        // A void redeems every complete pair at par → each side pays 0.5.
        const payout = onchain.isVoided
          ? (up + down) / 2n
          : onchain.winningOutcome === 0
            ? net(up)
            : net(down);

        claimables.push({
          marketId: row.marketId,
          question: row.question,
          asset: row.asset,
          interval: row.interval ?? null,
          voided: onchain.isVoided,
          winningOutcome: (onchain.winningOutcome as 0 | 1) ?? null,
          upBalance: up,
          downBalance: down,
          payout,
          quoteDecimals: dec,
          expiresAt: Number(row.expiry ?? 0),
        });
      }
      return claimables;
    },
    enabled: !!address,
    refetchInterval: 15_000,
    retry: 1,
  });
}

/**
 * The connected wallet's DreamDEX collateral balance.
 *
 * `raw` is the ERC-20 balance; `formatted` scales it by the token's live
 * decimals read (per-venue: 6dp TestUSDC today, 18dp USDso elsewhere).
 */
export function useDreamDexQuoteBalance() {
  const { address } = useAccount();
  /* `chainId` is pinned: without it wagmi executes the read on whatever
     chain the WALLET is connected to, and a wallet on any other network
     errors ("chain not configured") instead of returning a balance. These
     are Somnia balances and must always read through Somnia's transport. */
  const balance = useReadContract({
    abi: erc20Abi,
    address: QUOTE_TOKEN.address,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const decimals = useReadContract({
    abi: erc20Abi,
    address: QUOTE_TOKEN.address,
    chainId: CHAIN.id,
    functionName: "decimals",
    query: { staleTime: Infinity },
  });

  const dec = (decimals.data as number | undefined) ?? QUOTE_TOKEN.decimals;
  const raw = balance.data as bigint | undefined;

  return {
    raw,
    decimals: dec,
    formatted: raw !== undefined ? Number(formatUnits(raw, dec)) : undefined,
    isLoading: balance.isLoading,
    symbol: QUOTE_TOKEN.symbol,
  };
}

/** Indexed binary portfolio: open outcome positions, resting orders, recent fills. */
export function useDreamDexPortfolio() {
  const { address } = useAccount();
  return useQuery<Portfolio>({
    queryKey: ["dreamdex", "portfolio", address],
    queryFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      return await dreamdexClient.getPortfolio(address);
    },
    enabled: !!address,
    refetchInterval: 10_000,
  });
}

/** Open outcome positions joined with avg-cost PnL (raw collateral units). */
export function useDreamDexPositions() {
  const { address } = useAccount();
  return useQuery<OpenPositionPnL[]>({
    queryKey: ["dreamdex", "positions-pnl", address],
    queryFn: async () => {
      if (!address) throw new Error("Connect a wallet first");
      return await dreamdexClient.getOpenPositionsWithPnL(address);
    },
    enabled: !!address,
    refetchInterval: 10_000,
  });
}

/**
 * Write-side trader bound to the connected wallet.
 *
 * Orders settle on Somnia (chain 50312). If the wallet is connected to another
 * network every action throws before signing rather than submitting a
 * transaction the DreamDEX contracts will never see.
 */
export function useDreamDexTrader() {
  const { data: walletClient } = useWalletClient();
  const { address, chainId } = useAccount();
  const queryClient = useQueryClient();

  const onSomnia = chainId === CHAIN.id;

  // Point the shared exchange at this wallet. Writes then travel the same
  // connection the reads tail, so a fill lands in the live store over an
  // already-open socket instead of waiting for the next refetch. An effect,
  // not a memo: binding is a side effect on the shared exchange, and render
  // (where useMemo runs, potentially on aborted passes) must not mutate it.
  useEffect(() => {
    bindSigner(walletClient ?? undefined);
  }, [walletClient]);

  return {
    address,
    onSomnia,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["dreamdex"] }),
    /**
     * Places an IOC limit order, gated on the market's LIVE on-chain status.
     *
     * The indexer trails the chain, so a market that just expired can still
     * show as active in the UI. Reading `getMarketOnchain` before signing
     * means the wallet is never asked to confirm an order the pool has
     * already stopped accepting — status must be Trading (1).
     */
    placeOrder: async (
      marketId: string,
      symbol: string,
      side: "buy" | "sell",
      amount: number,
      price: number,
    ) => {
      if (!address) throw new Error("Connect a Somnia wallet first");
      if (!walletClient) throw new Error("Wallet not ready — try again");
      if (!onSomnia) throw new Error(`Switch your wallet to ${CHAIN.name} (chain ${CHAIN.id})`);

      const { status } = await dreamdexClient.getMarketOnchain(
        marketId as `0x${string}`,
      );
      if (status !== 1) {
        throw new Error(
          status === 0
            ? "Market is not open for trading yet (Listed)"
            : status === 2
              ? "Market is locked — settlement in progress"
              : "Market has settled; trading is closed",
        );
      }

      return await dreamdexExchange.createOrder(symbol, "limit", side, amount, price, {
        timeInForce: "IOC",
      });
    },
    cancelOrder: async (pool: string, orderId: string) => {
      if (!walletClient) throw new Error("Wallet not ready — try again");
      if (!onSomnia) throw new Error(`Switch your wallet to ${CHAIN.name} (chain ${CHAIN.id})`);
      return await dreamdexClient
        .createTrader({ walletClient })
        .cancelOrder({ pool: pool as `0x${string}`, orderId });
    },
    /** Sell a held binary outcome at the live crossing price with IOC semantics. */
    closePosition: async (marketId: string, outcome: "up" | "down", amount: number) => {
      if (!walletClient) throw new Error("Wallet not ready — try again");
      if (!onSomnia) throw new Error(`Switch your wallet to ${CHAIN.name} (chain ${CHAIN.id})`);
      const { status } = await dreamdexClient.getMarketOnchain(marketId as `0x${string}`);
      if (status !== 1) {
        throw new Error(
          status === 0
            ? "Market is not open for trading yet"
            : status === 2
              ? "Market is locked — settlement is in progress"
              : "Market has settled; claim the position instead",
        );
      }
      const symbol = `${marketId}#${outcome === "up" ? "YES" : "NO"}`;
      return await dreamdexExchange.createOrder(symbol, "market", "sell", amount, undefined, {
        timeInForce: "IOC",
        slippage: 0.05,
      });
    },
    /**
     * Burns winning outcome tokens for collateral on a settled market.
     *
     * Module-routed redemption: the call finalizes the market if needed and
     * pays out through the settlement singleton. On a void both sides pay
     * 0.5 — the caller picks which outcome to claim.
     */
    redeemOutcome: async (marketId: string, outcomeIdx: 0 | 1, amount: bigint) => {
      if (!walletClient) throw new Error("Connect a Somnia wallet first");
      if (!onSomnia) throw new Error(`Switch your wallet to ${CHAIN.name} (chain ${CHAIN.id})`);
      return await dreamdexClient.createTrader({ walletClient }).redeem({
        marketId: marketId as `0x${string}`,
        amount,
        outcomeIdx,
      });
    },
    /** Mint venue TestUSDC to the connected wallet (testnet scaffolding). */
    faucet: async () => {
      if (!walletClient) throw new Error("Connect a Somnia wallet first");
      if (!onSomnia) throw new Error(`Switch your wallet to ${CHAIN.name} (chain ${CHAIN.id})`);
      return await dreamdexClient.createTrader({ walletClient }).faucet();
    },
  };
}

export type DreamDexMarket = BinaryMarket;
export type DreamDexDisplayMarket = UnifiedMarket;
export type DreamDexBook = UnifiedOrderBook;
