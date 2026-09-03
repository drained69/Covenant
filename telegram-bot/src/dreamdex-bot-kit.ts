/**
 * @license
 * Adapted from DreamDEX Bot Kit packages/ec-core (MIT).
 * Copyright DreamDEX S.A. See ../THIRD_PARTY_NOTICES.md.
 *
 * This is a narrow Event Contract adapter for Telegram. It deliberately keeps
 * the kit's protocol-safety behavior: one exchange instance, venue scoping,
 * authoritative on-chain status, exact tick/lot conversion, preflight funding,
 * expiry headroom, and receipt-status checks.
 */
import {
  ORDER_TYPE,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  SomniaMarkets,
  type BinarySide,
  type MarketOnchain,
  type UnifiedMarket,
} from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { config } from "./config.js";

export type Outcome = "YES" | "NO";

export interface BotKitContext {
  exchange: SomniaMarkets;
  canTrade: boolean;
  decimals: number;
  tick: bigint;
  lot: bigint;
}

export interface OrderPreview {
  market: UnifiedMarket;
  onchain: MarketOnchain;
  outcome: Outcome;
  side: "buy" | "sell";
  price: number;
  size: number;
  notional: number;
}

export interface PlacedOrder extends OrderPreview {
  filled: number;
  rested: boolean;
  orderId?: bigint;
  hash?: string;
}

/**
 * Telegram handlers cannot wait forever on an indexer or live-tail seam. The
 * Bot Kit examples are long-running loops and can tolerate one slow cycle; a
 * command needs a bounded answer. Keep the underlying request intact, but fail
 * with an operator-actionable message after the deadline.
 */
async function withDeadline<T>(label: string, work: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${milliseconds / 1000}s. Try again.`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function retryOnce<T>(label: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      return await work();
    } catch (second) {
      throw new Error(
        `${label} failed twice: ${(second as Error).message || (first as Error).message}`,
      );
    }
  }
}

const SIDES: Record<`${Outcome}-${"buy" | "sell"}`, BinarySide> = {
  "YES-buy": "BUY_YES",
  "YES-sell": "SELL_YES",
  "NO-buy": "BUY_NO",
  "NO-sell": "SELL_NO",
};

export function createBotKitContext(): BotKitContext {
  const privateKey = config.tradingEnabled ? config.botPrivateKey : undefined;
  const exchange = new SomniaMarkets({
    chain: somniaShannon,
    indexerUrl: config.indexerUrl,
    wsRpcUrl: config.wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    priceFeed: SOMNIA_TESTNET_PRICE_FEED,
    privateKey,
  });
  return { exchange, canTrade: Boolean(privateKey), decimals: 6, tick: 1000n, lot: 1n };
}

function sameVenue(a?: string | null, b?: string | null): boolean {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

export async function activeMarkets(ctx: BotKitContext, max = 50): Promise<UnifiedMarket[]> {
  let markets = Object.values(
    await retryOnce("DreamDEX market registry", () =>
      withDeadline("DreamDEX market registry", ctx.exchange.loadMarkets(true)),
    ),
  ).filter(
    (market) => market.type === "binary" && market.active,
  );
  if (config.venueId) {
    markets = markets.filter(
      (market) =>
        market.info.marketType === "BINARY" && sameVenue(market.info.venueId, config.venueId),
    );
  } else {
    const venues = new Set(
      markets
        .map((market) =>
          market.info.marketType === "BINARY" ? market.info.venueId?.toLowerCase() : undefined,
        )
        .filter(Boolean),
    );
    if (venues.size > 1) {
      throw new Error("Live markets span multiple venues. Set VENUE_ID before trading.");
    }
  }
  return markets
    .sort((a, b) => {
      const expiry = (market: UnifiedMarket) =>
        market.info.marketType === "BINARY" ? Number(market.info.expiry ?? 0) : 0;
      return expiry(a) - expiry(b);
    })
    .slice(0, max);
}

export function outcomeSymbols(market: UnifiedMarket): { yes: string; no: string } {
  return {
    yes: market.outcomes?.[0]?.symbol ?? `${market.symbol}#YES`,
    no: market.outcomes?.[1]?.symbol ?? `${market.symbol}#NO`,
  };
}

export async function marketOnchain(
  ctx: BotKitContext,
  market: UnifiedMarket,
): Promise<MarketOnchain> {
  if (market.info.marketType !== "BINARY") throw new Error("Not an Event Contract market.");
  return withDeadline(
    "DreamDEX on-chain market status",
    ctx.exchange.client.getMarketOnchain(market.info.marketId as `0x${string}`),
  );
}

export async function book(
  ctx: BotKitContext,
  market: UnifiedMarket,
  outcome: Outcome,
  depth = 5,
) {
  const symbols = outcomeSymbols(market);
  return withDeadline(
    "DreamDEX order book",
    ctx.exchange.fetchOrderBook(outcome === "YES" ? symbols.yes : symbols.no, depth),
  );
}

function toSteps(human: number, one: bigint, step: bigint, mode: "round" | "floor"): bigint {
  const stepsPerOne = Number(one / step);
  const count = mode === "round" ? Math.round(human * stepsPerOne) : Math.floor(human * stepsPerOne + 1e-9);
  return BigInt(Math.max(0, count)) * step;
}

function assertReceipt(result: { hash?: string; receipt?: { status?: string } }, label: string): void {
  if (result.receipt?.status === "reverted") {
    throw new Error(`${label} reverted on-chain (${result.hash ?? "unknown tx"}).`);
  }
}

export async function previewOrder(
  ctx: BotKitContext,
  market: UnifiedMarket,
  outcome: Outcome,
  side: "buy" | "sell",
  sizeRequested: number,
  priceRequested?: number,
): Promise<OrderPreview> {
  const onchain = await marketOnchain(ctx, market);
  if (onchain.status !== 1) throw new Error("Market is not Trading on-chain.");
  const orderBook = await book(ctx, market, outcome, 3);
  const touch = side === "buy" ? orderBook.asks[0]?.[0] : orderBook.bids[0]?.[0];
  const price = priceRequested ?? touch;
  if (!(price !== undefined && price > 0 && price < 1)) {
    throw new Error("No executable touch. Pass a price between 0 and 1.");
  }
  const one = 10n ** BigInt(ctx.decimals);
  const sizeRaw = toSteps(sizeRequested, one, ctx.lot, "floor");
  const priceRaw = toSteps(price, one, ctx.tick, "round");
  if (sizeRaw <= 0n) throw new Error("Size is below the venue lot grid.");
  if (priceRaw <= 0n || priceRaw >= one) throw new Error("Price is outside the venue tick grid.");
  const size = Number(sizeRaw) / Number(one);
  const snappedPrice = Number(priceRaw) / Number(one);
  return { market, onchain, outcome, side, price: snappedPrice, size, notional: snappedPrice * size };
}

export async function placeIoc(
  ctx: BotKitContext,
  preview: OrderPreview,
): Promise<PlacedOrder> {
  if (!config.tradingEnabled || !ctx.canTrade) {
    throw new Error("Live bot trading is disabled. Set BOT_TRADING_ENABLED=true with a dedicated key.");
  }
  if (preview.notional > config.maxOrderUsd) {
    throw new Error(`Order notional exceeds the ${config.maxOrderUsd} USD bot cap.`);
  }

  const one = 10n ** BigInt(ctx.decimals);
  const quantity = toSteps(preview.size, one, ctx.lot, "floor");
  const ownPrice = toSteps(preview.price, one, ctx.tick, "round");
  const yesPrice = preview.outcome === "YES" ? ownPrice : one - ownPrice;
  const wallet = ctx.exchange.walletAddress;
  if (!wallet) throw new Error("Bot signer is not configured.");

  if (preview.side === "buy") {
    const needed = (ownPrice * quantity) / one;
    const balance = await ctx.exchange.client.getErc20Balance(preview.onchain.collateral, wallet);
    if (balance < needed) throw new Error("Bot wallet has insufficient DreamDEX collateral.");
  } else {
    const id = preview.outcome === "YES" ? preview.onchain.yesId : preview.onchain.noId;
    const held = await ctx.exchange.client.getOutcomeBalance({
      outcomeToken: preview.onchain.outcomeToken,
      account: wallet,
      id,
    });
    if (held < quantity) throw new Error(`Bot wallet has insufficient ${preview.outcome} inventory.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(now + 300, Number(preview.onchain.expiry));
  if (expiresAt <= now) throw new Error("Market is too close to expiry.");

  const result = await ctx.exchange.trader.placeOrder({
    pool: preview.onchain.pool,
    side: SIDES[`${preview.outcome}-${preview.side}`],
    price: yesPrice,
    quantity,
    outcomeToken: preview.onchain.outcomeToken,
    yesId: preview.onchain.yesId,
    noId: preview.onchain.noId,
    orderType: ORDER_TYPE.MARKET,
    expireTimestampNs: BigInt(expiresAt) * 1_000_000_000n,
  });
  assertReceipt(result, `${preview.outcome} ${preview.side}`);
  const filledRaw = (result.fills ?? []).reduce((sum, fill) => sum + fill.quantityFilled, 0n);
  return {
    ...preview,
    filled: Number(filledRaw) / Number(one),
    rested: result.orderId !== undefined && filledRaw < quantity,
    orderId: result.orderId,
    hash: result.hash,
  };
}

export async function closeBotKit(ctx: BotKitContext): Promise<void> {
  await Promise.race([
    Promise.resolve(ctx.exchange.close()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
}
