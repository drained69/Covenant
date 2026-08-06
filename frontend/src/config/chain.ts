import { monadTestnet } from "wagmi/chains";

/**
 * Single source of truth for the target chain + deployed addresses.
 * Swap this file to move to a different chain; the rest of the app reads from it.
 *
 * All addresses below are the live Monad testnet deployment. The gate is bound to Cleanverse's
 * CVI Compliance Validator (CCP V2) at 0xaC7e5179C2C7f03f209136886c172eb34F161792 — the same
 * validator address CREATE2-deployed across every chain Cleanverse supports.
 */
export const CHAIN = monadTestnet;

export const ADDRESSES = {
  covenant: "0xcdc06aae7617c3b6f44cc1f2a9a7163252d8a797",
  // BtcUsdOracle (owner-push). STALENESS=0 — the staleness check is disabled, so a
  // pushed price never expires. The predecessor at 0x41244829… used a 1-hour window,
  // which made every fillOffer revert with StalePrice() an hour after the last push.
  oracle:   "0x2E09f0566A87Bb27615873aBCF18855d37b000F9",
  usdc:     "0x7dbe32f1e1d3db45123f60ec5a79312863a7e279", // Test USDC, 6 dec
  wbtc:     "0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad", // Test WBTC, 8 dec
  gate:     "0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c", // CleanversePoolGate (Ownable) → CCP V2 validator
  validator:"0xaC7e5179C2C7f03f209136886c172eb34F161792", // IAPassComplianceValidator (Cleanverse)
  notary:   "0xc35B4e48940D68Dd449d19D3657e754632CC873C", // EcrecoverNotary (EIP-712 offer signing)
} as const;

/**
 * Every ERC20 this deployment touches, with the role it plays in the protocol.
 *
 * This exists because balances were previously only reachable from inside two
 * ActionPanel tabs — a user could not answer "what do I hold?" without opening
 * a form they had no intention of submitting. A registry lets the header and
 * the positions page render holdings without knowing which market is on screen.
 *
 * `role` is the deployment-wide role. Per-market roles are read from the chain
 * (`useMarketTokens`), because a future market could invert them.
 */
export const TOKENS = [
  {
    address: ADDRESSES.usdc,
    symbol: "tUSDC",
    name: "Test USDC",
    decimals: 6,
    role: "Loan token",
    tone: "ok",
  },
  {
    address: ADDRESSES.wbtc,
    symbol: "tWBTC",
    name: "Test WBTC",
    decimals: 8,
    role: "Collateral",
    tone: "warn",
  },
] as const;

export const MARKETS = [
  {
    // Market ids are content-addressed: the id is the hash of the Market struct, so
    // changing the oracle address alone yields a different market. This id binds the
    // non-expiring oracle above and a 2027-08 maturity.
    id: "0xb6f650917d8ca609c9b53e75f5adf5c1110a063d3360be24c941d81248a48e7c" as `0x${string}`,
    name: "tWBTC / tUSDC · compliance-gated",
    // The rest is fetched live via covenant.toMarket(id) — this is display metadata only.
    // The two token addresses are the pre-resolution fallback for that read: they
    // let the UI label roles on first paint instead of flashing a placeholder,
    // and they are replaced by the on-chain values as soon as they arrive.
    loanToken: ADDRESSES.usdc,
    loanSymbol: "tUSDC",
    loanDecimals: 6,
    collateralToken: ADDRESSES.wbtc,
    collateralSymbol: "tWBTC",
    collateralDecimals: 8,
  },
];

export const EXPLORER = CHAIN.blockExplorers?.default.url ?? "https://testnet.monadexplorer.com";

/** Optional: paid WalletConnect project id enables mobile deep-links via QR. */
export const WC_PROJECT_ID = "8f3f5b09b1e8f0e6a9d5b0f4a6e8f2c1"; // public demo id
