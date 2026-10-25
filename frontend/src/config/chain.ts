import { defineChain } from "viem";

/** Mezo testnet (chain 31611). Native gas is BTC, mirrored by the BTC precompile. */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

/** Single source of truth for the chain Covenant runs on. */
export const CHAIN = mezoTestnet;

/** wagmi transport — Mezo's public testnet RPC. */
export const CHAIN_RPC_HTTP = CHAIN.rpcUrls.default.http[0];

export const EXPLORER = CHAIN.blockExplorers.default.url;

/** The loan token: testnet MUSD, Mezo's Bitcoin-backed stablecoin. */
export const LOAN_TOKEN = {
  address: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as `0x${string}`,
  symbol: "MUSD",
  name: "Mezo USD",
  decimals: 18,
  role: "Loan token",
  tone: "ok" as const,
};

/** Native gas token, which is also the collateral. Drip links live on the Faucet page. */
export const NATIVE_TOKEN = { symbol: "BTC", name: "Mezo BTC", role: "Gas and collateral" };

/** Optional WalletConnect project id for mobile deep-links via QR. */
export const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

/** Mezo testnet BTC drip. MUSD itself is borrowed here or minted at testnet.mezo.org, not dripped. */
export const MEZO_FAUCET_URL = "https://faucet.test.mezo.org";
export const MEZO_APP_URL = "https://testnet.mezo.org";
