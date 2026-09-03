import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
} from "@somnia-chain/markets-sdk";
import type { WalletClient } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

export const DREAMDEX_CHAIN = somniaShannon;
export const DREAMDEX_INDEXER_URL =
  import.meta.env.VITE_DREAMDEX_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
export const DREAMDEX_WS_RPC_URL =
  import.meta.env.VITE_DREAMDEX_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";
export const DREAMDEX_ADDRESSES = SOMNIA_TESTNET_ADDRESSES;
export const DREAMDEX_PRICE_FEED = SOMNIA_TESTNET_PRICE_FEED;

export const ETHOS_API_URL = "https://api.ethos.network/api/v2";
export const ETHOS_CLIENT = "covenant-prediction-markets@0.1.0";

export const ETHOS_TIERS = [
  { name: "Open", minimum: 0, ltv: 38.5, color: "neutral" },
  { name: "Established", minimum: 1600, ltv: 62.5, color: "brand" },
  { name: "Reputable", minimum: 2000, ltv: 77, color: "ok" },
] as const;

export function ethosTier(score: number) {
  return [...ETHOS_TIERS].reverse().find((tier) => score >= tier.minimum) ?? ETHOS_TIERS[0];
}

/**
 * Illustrative borrowing capacity for a tier, given collateral the trader
 * holds (README credit-tier policy: maxDebt = collateral × LTV).
 *
 * PREVIEW ONLY — on-chain enforcement lands with the Somnia credit-market
 * deployment. It never gates real orders today; real spends are bounded by
 * the wallet's actual TestUSDC balance.
 */
export function borrowCapacity(score: number, collateral: number): number {
  return (collateral * ethosTier(score).ltv) / 100;
}

/**
 * Ethos profile page for a wallet address.
 *
 * The address sits directly on the profile path — no `/addr/` or `/address/`
 * segment. Verified against live profiles: `app.ethos.network/profile/0x…`
 * resolves (case-insensitive) for both registered wallets and bare addresses
 * (unregistered ones render a default 1200 · Neutral page), while the
 * old `ethos.network/profile/addr/…` form 404s — ethos.network is now the
 * marketing site; the app lives on the `app.` subdomain.
 */
export function ethosProfileUrl(address: string): string {
  return `https://app.ethos.network/profile/${address}`;
}

/**
 * Where a user links wallet addresses to their Ethos profile.
 *
 * Ethos identity is X-based (sign-in + reviews on X), but Covenant never
 * talks to X: the on-chain tier gates authorize WALLET-bound scores, so the
 * only valid binding is wallet↔Ethos-profile, made on Ethos's side. This URL
 * is the target of every "bring your X reputation" affordance in the app.
 */
export const ETHOS_SETTINGS_URL = "https://app.ethos.network/profile/settings";

/* ─────────────────────────────────────────────────────────────────────────────
 * The live venue connection
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The single DreamDEX connection this app holds, for its whole lifetime.
 *
 * The SDK's engine tier is event-sourced: one WebSocket carries chain logs into
 * a local store, and the `/react` hooks read that store synchronously. That
 * only works if every hook shares ONE client — a per-query client would open a
 * socket, hydrate from scratch, and close before the tail ever caught up, which
 * is why the read path used to poll on intervals instead of streaming.
 *
 * `.client` is what `SomniaMarketsProvider` distributes. The exchange wrapper
 * is kept alongside it for the unified write helpers (`createOrder`), which
 * take their signer from `setSigner` rather than from construction — see
 * `bindSigner` below.
 */
export const dreamdexExchange = new SomniaMarkets({
  chain: DREAMDEX_CHAIN,
  indexerUrl: DREAMDEX_INDEXER_URL,
  wsRpcUrl: DREAMDEX_WS_RPC_URL,
  addresses: DREAMDEX_ADDRESSES,
  priceFeed: DREAMDEX_PRICE_FEED,
});

/** The engine-tier client the `/react` hooks read from. */
export const dreamdexClient = dreamdexExchange.client;

/**
 * Point the shared exchange at the connected wallet.
 *
 * Writes go through the same instance the reads tail, so an order placed here
 * lands in the live store over the socket that is already open — the fill shows
 * up in the tape without a refetch. Called from the trader hook whenever the
 * wallet client changes; passing `undefined` is a no-op rather than an error so
 * a disconnect doesn't throw during render.
 */
export function bindSigner(walletClient?: WalletClient): void {
  if (!walletClient) return;
  dreamdexExchange.setSigner({ walletClient });
}
