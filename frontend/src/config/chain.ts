import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

/**
 * Single source of truth for the target chain + protocol addresses.
 *
 * Covenant trades DreamDEX Event Contracts on Somnia testnet ("Shannon",
 * chain id 50312). The chain definition is re-exported from the official
 * markets SDK so RPC urls, explorer links, and the multicall address can never
 * drift from the ones DreamDEX itself ships.
 */
export const CHAIN = somniaShannon;

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
export const QUOTE_TOKEN = {
  address: (SOMNIA_TESTNET_ADDRESSES.collateral ??
    SOMNIA_TESTNET_ADDRESSES.testUsdc) as `0x${string}`,
  symbol: "TestUSDC",
  name: "DreamDEX Test Collateral",
  decimals: 6,
  role: "Trading collateral",
  tone: "ok" as const,
};

/** Native gas token — drip links live on the Faucet page. */
const STT_SYMBOL = CHAIN.nativeCurrency.symbol;

export const NATIVE_TOKEN = {
  symbol: STT_SYMBOL,
  name: "Somnia STT",
  role: "Gas token",
};

/** Optional WalletConnect project id for mobile deep-links via QR. */
export const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Public Somnia STT faucet (Discord-gated) — the SDK drip covers the quote token. */
export const SOMNIA_FAUCET_URL = "https://faucet.somnia.network";
