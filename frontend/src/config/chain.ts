import { sepolia } from "wagmi/chains";

/**
 * Single source of truth for the target chain + deployed addresses.
 * Swap this file to move to a different chain; the rest of the app reads from it.
 */
export const CHAIN = sepolia;

export const ADDRESSES = {
  covenant: "0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4",
  oracle:   "0xfffd00df1ae41228b9b907999a82d7f15ba2f8a9",
  usdc:     "0x7130f8754b07a4782fd9deddfac5bb655fe720c9", // Test USDC, 6 dec
  wbtc:     "0x848d699dd82effbb3da355e190df6a005c7e963f", // Test WBTC, 8 dec
  gate:     "0x026a6cfbb2922322fb7c4956263088ee5a934fff", // PermissiveGate (demo)
  chainlinkFeed: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", // BTC/USD, 8 dec
} as const;

export const MARKETS = [
  {
    id: "0xf601e7aeff95d2c8aa1c542c4e65b5c762b0a573509e4bc1c2c6034b24923674" as `0x${string}`,
    name: "tWBTC / tUSDC · 90-day",
    // The rest is fetched live via covenant.toMarket(id) — this is display metadata only.
    loanSymbol: "tUSDC",
    loanDecimals: 6,
    collateralSymbol: "tWBTC",
    collateralDecimals: 8,
  },
];

export const EXPLORER = CHAIN.blockExplorers?.default.url ?? "https://sepolia.etherscan.io";

/** Optional: paid WalletConnect project id enables mobile deep-links via QR. */
export const WC_PROJECT_ID = "8f3f5b09b1e8f0e6a9d5b0f4a6e8f2c1"; // public demo id
