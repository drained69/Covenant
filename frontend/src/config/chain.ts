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

/**
 * The tiered credit ladder.
 *
 * A rung is a market whose gate requires a given CVI sub-tier and whose LLTV matches it.
 * The gate address is hashed into the market id (IdLib), so a 91.5% market is
 * cryptographically bound to its sub-tier-30 gate — the terms and the policy are one object.
 *
 * Live on Monad testnet as of the `DeployLadder.s.sol` + `DeployLadderLens.s.sol` broadcasts.
 * Each `marketId` is the content-addressed id printed by DeployLadder — it is the ONLY ladder
 * config that matters, because the lens re-derives each rung's gate, LLTV, and oracle from it
 * via `ICovenant.toMarket`. The `gate` and `lltv` fields below are display metadata that the
 * lens response confirms; if they ever disagree, the lens is right.
 *
 * `minSubTier` here is the bar the rung is *intended* to carry. It is display metadata only.
 * The authoritative value is read from the gate's rule list through the lens — and until each
 * gate completes its Cleanverse registration, that list is empty and the gate denies everyone.
 * All three gates are deployed and whitelisted but NOT yet registered, so `accessible` reads
 * false for every wallet and the panel should present that as "awaiting registration", not
 * "you do not qualify".
 */
export const LADDER = {
  /** CreditLadderLens deployment. Null until deployed. */
  lens: "0x4c18A570290FD0c7f4615ac24e5a42a72Ec2413D" as `0x${string}` | null,
  rungs: [
    {
      key: "institutional",
      label: "Institutional",
      minSubTier: 30,
      /** WAD-scaled LLTV, matching LLTV_4 in ConstantsLib. */
      lltv: 915000000000000000n,
      marketId: "0xf28a2f531ff4358d964da2597f2d582fb890416d158caabd4fdb372f822fd0a0" as
        | `0x${string}`
        | null,
      gate: "0xC8035E7672e31a552f16FFeaB60d5f115Bd90451" as `0x${string}` | null,
      qualifies: "Bank-verified entity holding a full-tier CVI credential.",
    },
    {
      key: "professional",
      label: "Verified professional",
      minSubTier: 20,
      /** LLTV_2. */
      lltv: 770000000000000000n,
      marketId: "0x8cc388da52a8a4ec54980250ff4ed940ed8fc677dc7f3aa94f4448a2acc1778c" as
        | `0x${string}`
        | null,
      gate: "0x51545c4f0A789BF7BA499CFD1Ac786D9E11d874d" as `0x${string}` | null,
      qualifies: "Verified individual at an elevated CVI sub-tier.",
    },
    {
      key: "retail",
      label: "Verified retail",
      minSubTier: 10,
      /** LLTV_0. */
      lltv: 385000000000000000n,
      marketId: "0x7abfc9587d08633fad01c76004629595b2be824b0d0a2a62882cb84e7cd2e588" as
        | `0x${string}`
        | null,
      gate: "0xB50A199cd20dfdaDFA5383eDB04b1B06474714d5" as `0x${string}` | null,
      qualifies: "Any wallet holding a valid A-Pass.",
    },
  ],
} as const;

/** True once the lens and every rung market id are present. */
export const LADDER_DEPLOYED =
  LADDER.lens !== null && LADDER.rungs.every((r) => r.marketId !== null);

export const EXPLORER = CHAIN.blockExplorers?.default.url ?? "https://testnet.monadexplorer.com";

/** Optional: paid WalletConnect project id enables mobile deep-links via QR. */
export const WC_PROJECT_ID = "8f3f5b09b1e8f0e6a9d5b0f4a6e8f2c1"; // public demo id
