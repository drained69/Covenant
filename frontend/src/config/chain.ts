import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { defineChain } from "viem";
import { IS_MEZO } from "./target";

/** Mezo testnet (chain 31611). Native gas is BTC, mirrored by the BTC precompile. */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

/**
 * Single source of truth for the target chain + protocol addresses.
 *
 * Covenant trades DreamDEX Event Contracts on Somnia testnet ("Shannon",
 * chain id 50312). The chain definition is re-exported from the official
 * markets SDK so RPC urls, explorer links, and the multicall address can never
 * drift from the ones DreamDEX itself ships.
 */
export const CHAIN = IS_MEZO ? mezoTestnet : somniaShannon;

/** wagmi transport for the connected chain — first public Somnia RPC. */
export const CHAIN_RPC_HTTP = CHAIN.rpcUrls.default.http[0];

export const EXPLORER = CHAIN.blockExplorers.default.url;

/**
 * The DreamDEX venue collateral: the quote token every binary Event Contract
 * prices and settles against (TestUSDC on testnet-development). Its address is
 * taken from the SDK's baked-in deployment manifest, never hardcoded here.
 *
 * Decimals are per-venue (docs warn 6dp TestUSDC vs 18dp USDso); the UI reads
 * them live via the SDK and treats this constant only as a fallback.
 */
const SOMNIA_QUOTE = {
  address: (SOMNIA_TESTNET_ADDRESSES.collateral ??
    SOMNIA_TESTNET_ADDRESSES.testUsdc) as `0x${string}`,
  symbol: "TestUSDC",
  name: "DreamDEX Test Collateral",
  decimals: 6,
  role: "Trading collateral",
  tone: "ok" as const,
};

const MEZO_QUOTE = {
  address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  symbol: "MUSD",
  name: "Mezo USD",
  decimals: 18,
  role: "Loan token",
  tone: "ok" as const,
};

export const QUOTE_TOKEN = IS_MEZO ? MEZO_QUOTE : SOMNIA_QUOTE;

/** Native gas token — drip links live on the Faucet page. */
const STT_SYMBOL = CHAIN.nativeCurrency.symbol;

export const NATIVE_TOKEN = IS_MEZO
  ? { symbol: "BTC", name: "Mezo BTC", role: "Gas and collateral" }
  : { symbol: STT_SYMBOL, name: "Somnia STT", role: "Gas token" };

/** Optional WalletConnect project id for mobile deep-links via QR. */
export const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Public Somnia STT faucet (Discord-gated) — the SDK drip covers the quote token. */
export const SOMNIA_FAUCET_URL = "https://faucet.somnia.network";

/** Mezo testnet BTC drip. MUSD itself is borrowed at testnet.mezo.org, not dripped. */
export const MEZO_FAUCET_URL = "https://faucet.test.mezo.org";
export const MEZO_APP_URL = "https://testnet.mezo.org";
