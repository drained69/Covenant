/**
 * ABIs typed for viem/wagmi. Kept minimal — only the surface the UI touches.
 * The Market tuple is declared once and reused inside every write signature.
 */

const MARKET_COMPONENTS = [
  { name: "loanToken", type: "address" },
  {
    name: "collateralParams",
    type: "tuple[]",
    components: [
      { name: "token",  type: "address" },
      { name: "lltv",   type: "uint256" },
      { name: "maxLif", type: "uint256" },
      { name: "oracle", type: "address" },
    ],
  },
  { name: "maturity",     type: "uint256" },
  { name: "rcfThreshold", type: "uint256" },
  { name: "entryGate",    type: "address" },
  { name: "seizureGate",  type: "address" },
] as const;

export const COVENANT_ABI = [
  { type: "function", stateMutability: "view", name: "toMarket",   inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "tuple", components: MARKET_COMPONENTS }] },
  { type: "function", stateMutability: "view", name: "tickSpacing", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "totalUnits",  inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "withdrawable",inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "creditOf",    inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "debtOf",      inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "collateral",  inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "REQUIRE_COMPLIANCE", inputs: [], outputs: [{ type: "bool" }] },

  { type: "function", stateMutability: "nonpayable", name: "supplyCollateral",
    inputs: [
      { name: "market", type: "tuple", components: MARKET_COMPONENTS },
      { name: "collateralIndex", type: "uint256" },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
    ], outputs: [] },

  { type: "function", stateMutability: "nonpayable", name: "withdrawCollateral",
    inputs: [
      { name: "market", type: "tuple", components: MARKET_COMPONENTS },
      { name: "collateralIndex", type: "uint256" },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ], outputs: [] },

  { type: "function", stateMutability: "nonpayable", name: "repay",
    inputs: [
      { name: "market", type: "tuple", components: MARKET_COMPONENTS },
      { name: "units", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "callback", type: "address" },
      { name: "data", type: "bytes" },
    ], outputs: [] },

  { type: "function", stateMutability: "nonpayable", name: "withdraw",
    inputs: [
      { name: "market", type: "tuple", components: MARKET_COMPONENTS },
      { name: "units", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ], outputs: [] },

  { type: "function", stateMutability: "nonpayable", name: "fillOffer",
    inputs: [
      { name: "offer", type: "tuple", components: [
        { name: "market",                  type: "tuple", components: MARKET_COMPONENTS },
        { name: "buy",                     type: "bool"    },
        { name: "maker",                   type: "address" },
        { name: "start",                   type: "uint256" },
        { name: "expiry",                  type: "uint256" },
        { name: "tick",                    type: "uint256" },
        { name: "group",                   type: "bytes32" },
        { name: "callback",                type: "address" },
        { name: "callbackData",            type: "bytes"   },
        { name: "receiverIfMakerIsSeller", type: "address" },
        { name: "notary",                  type: "address" },
        { name: "reduceOnly",              type: "bool"    },
        { name: "maxUnits",                type: "uint256" },
        { name: "maxAssets",               type: "uint256" },
      ] },
      { name: "notaryData",              type: "bytes" },
      { name: "units",                   type: "uint256" },
      { name: "taker",                   type: "address" },
      { name: "receiverIfTakerIsSeller", type: "address" },
      { name: "takerCallback",           type: "address" },
      { name: "takerCallbackData",       type: "bytes" },
    ], outputs: [{ type: "uint256" }, { type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", stateMutability: "view",       name: "balanceOf", inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view",       name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view",       name: "decimals",  inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view",       name: "symbol",    inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "nonpayable", name: "approve",   inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "nonpayable", name: "mint",      inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

export const ORACLE_ABI = [
  { type: "function", stateMutability: "view", name: "price",     inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "SCALE",     inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "STALENESS", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

// The raw Chainlink feed itself — the oracle wraps this.
export const CHAINLINK_FEED_ABI = [
  { type: "function", stateMutability: "view", name: "latestRoundData", inputs: [],
    outputs: [
      { name: "roundId",        type: "uint80" },
      { name: "answer",         type: "int256" },
      { name: "startedAt",      type: "uint256" },
      { name: "updatedAt",      type: "uint256" },
      { name: "answeredInRound",type: "uint80" },
    ] },
  { type: "function", stateMutability: "view", name: "decimals",    inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", stateMutability: "view", name: "description", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const CLEANVERSE_POOL_ABI = [
  { type: "function", stateMutability: "view", name: "isRegistered", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "paused",       inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "verify",       inputs: [{ name: "user", type: "address" }], outputs: [{ type: "bool" }] },
] as const;
