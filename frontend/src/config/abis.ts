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

  /*
    Position and market state.

    `creditOf` / `debtOf` above return the *stored* struct fields. Credit is
    synced lazily: bad-debt slashes (`lossFactor`) and continuous-fee accrual are
    only written into the position when something touches it. So `creditOf` is a
    checkpoint, not a balance, and a lender's real claim drifts below it between
    updates. `updatePositionView` applies both adjustments and returns what
    `updatePosition` *would* write — that is the number a lender should be shown.
    It takes the full Market struct rather than the id because it needs `maturity`
    to bound fee accrual, so any caller must resolve `toMarket(id)` first.

    `debt` needs no equivalent: it is not slashed and not fee-adjusted, so the
    stored value is always current.

    `position` returns all six scalar fields in one call, which is both cheaper
    than six getters and atomic — the fields are read from a single storage slot
    group at one block, so credit and debt can never be shown a block apart.
  */
  { type: "function", stateMutability: "view", name: "position",
    inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }],
    outputs: [
      { name: "credit",           type: "uint128" },
      { name: "pendingFee",       type: "uint128" },
      { name: "lastLossFactor",   type: "uint128" },
      { name: "lastAccrual",      type: "uint128" },
      { name: "debt",             type: "uint128" },
      { name: "collateralBitmap", type: "uint128" },
    ] },

  { type: "function", stateMutability: "view", name: "updatePositionView",
    inputs: [
      { name: "market", type: "tuple", components: MARKET_COMPONENTS },
      { name: "id",     type: "bytes32" },
      { name: "user",   type: "address" },
    ],
    outputs: [
      { name: "credit",     type: "uint128" },
      { name: "pendingFee", type: "uint128" },
      { name: "accruedFee", type: "uint128" },
    ] },

  { type: "function", stateMutability: "view", name: "collateralBitmap", inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "pendingFee",       inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }], outputs: [{ type: "uint128" }] },

  // Whole-market state in one atomic read, for the same reason `position` is one
  // call: totalUnits and withdrawable are shown as a ratio, and two separate
  // reads can land in different blocks and produce a ratio above 100%.
  { type: "function", stateMutability: "view", name: "marketState",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "totalUnits",          type: "uint128" },
      { name: "lossFactor",          type: "uint128" },
      { name: "withdrawable",        type: "uint128" },
      { name: "continuousFeeCredit", type: "uint128" },
      { name: "settlementFeeCbp0",   type: "uint16"  },
      { name: "settlementFeeCbp1",   type: "uint16"  },
      { name: "settlementFeeCbp2",   type: "uint16"  },
      { name: "settlementFeeCbp3",   type: "uint16"  },
      { name: "settlementFeeCbp4",   type: "uint16"  },
      { name: "settlementFeeCbp5",   type: "uint16"  },
      { name: "settlementFeeCbp6",   type: "uint16"  },
      { name: "continuousFee",       type: "uint32"  },
      { name: "tickSpacing",         type: "uint8"   },
    ] },

  { type: "function", stateMutability: "view", name: "lossFactor",    inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint128" }] },
  { type: "function", stateMutability: "view", name: "continuousFee", inputs: [{ name: "id", type: "bytes32" }], outputs: [{ type: "uint32"  }] },

  { type: "function", stateMutability: "view", name: "isHealthy",
    inputs: [
      { name: "market",   type: "tuple", components: MARKET_COMPONENTS },
      { name: "id",       type: "bytes32" },
      { name: "borrower", type: "address" },
    ], outputs: [{ type: "bool" }] },

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

  // Custom errors. viem needs these in the ABI to decode a revert into a name —
  // without them a failed fillOffer surfaces only a raw 4-byte selector.
  { type: "error", name: "TakerUnauthorized",        inputs: [] },
  { type: "error", name: "MarketLossFactorMaxedOut", inputs: [] },
  { type: "error", name: "MultipleNonZero",          inputs: [] },
  { type: "error", name: "TickNotAccessible",        inputs: [] },
  { type: "error", name: "TickOutOfRange",           inputs: [] },
  { type: "error", name: "OfferNotStarted",          inputs: [] },
  { type: "error", name: "OfferExpired",             inputs: [] },
  { type: "error", name: "SelfTake",                 inputs: [] },
  { type: "error", name: "NotaryUnauthorized",       inputs: [] },
  { type: "error", name: "NotaryFail",               inputs: [] },
  { type: "error", name: "SellerIsLiquidatable",     inputs: [] },
  { type: "error", name: "UnhealthyBorrower",        inputs: [] },
  { type: "error", name: "MarketNotCreated",         inputs: [] },
  { type: "error", name: "MissingComplianceGate",    inputs: [] },
  { type: "error", name: "GateNotApproved",          inputs: [{ name: "gate", type: "address" }] },
  { type: "error", name: "LenderIneligible",         inputs: [] },
  { type: "error", name: "BorrowerIneligible",       inputs: [] },
  { type: "error", name: "ConsumedUnits",            inputs: [] },
  { type: "error", name: "ConsumedAssets",           inputs: [] },
  { type: "error", name: "AlreadyConsumed",          inputs: [] },
  { type: "error", name: "InconsistentInput",        inputs: [] },
  { type: "error", name: "CannotIncreaseDebtPostMaturity", inputs: [] },
  { type: "error", name: "MakerCreditOrDebtIncreased",     inputs: [] },
  { type: "error", name: "TransferFromReturnedFalse", inputs: [] },
  { type: "error", name: "TransferReturnedFalse",     inputs: [] },
  { type: "error", name: "Unauthorized",              inputs: [] },
  // EcrecoverNotary — reached through fillOffer's isNotarized call.
  { type: "error", name: "InvalidProof",              inputs: [] },
  { type: "error", name: "InvalidSignature",          inputs: [] },
  { type: "error", name: "RootCanceled",              inputs: [] },
  { type: "error", name: "NotCovenant",               inputs: [] },
  { type: "error", name: "LeafIndexOutOfRange",       inputs: [] },
  // BtcUsdOracle — reached through fillOffer's health check (isHealthy → IOracle.price()).
  // Without these, an expired or unset price surfaces as a bare selector (0x19abf40e).
  { type: "error", name: "StalePrice",                inputs: [] },
  { type: "error", name: "PriceUnset",                inputs: [] },
  // CleanversePoolGate / BtcUsdOracle ownership guards.
  { type: "error", name: "NotOwner",                  inputs: [] },
  { type: "error", name: "ZeroAddress",               inputs: [] },
  { type: "error", name: "ZeroValidator",             inputs: [] },
  { type: "error", name: "ZeroOwner",                 inputs: [] },
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

// CCP V2 — IAPassComplianceValidator. The validator is a single global contract per chain that
// indexes pools by address. Every gate/wrapper on Covenant asks the validator about *itself*:
//   validator.isRegistered(address(gate))
//   validator.complianceVerify(address(gate), user)
export const CLEANVERSE_VALIDATOR_ABI = [
  { type: "function", stateMutability: "view", name: "isRegistered",
    inputs: [{ name: "poolAddress", type: "address" }],
    outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "complianceVerify",
    inputs: [{ name: "poolAddress", type: "address" }, { name: "userAddress", type: "address" }],
    outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "getRulesV2",
    inputs: [{ name: "poolAddress", type: "address" }],
    outputs: [{ type: "tuple[]", components: [
      { name: "allowedGroup",     type: "bytes2"  },
      { name: "allowedSubGroup",  type: "bytes2"  },
      { name: "minTier",          type: "uint8"   },
      { name: "minSubTier",       type: "uint8"   },
      { name: "poolCountryBitmap",type: "uint256" },
    ] }] },
] as const;

/** @deprecated Kept as an alias so existing pages don't break during the CCP V2 rename. */
export const CLEANVERSE_POOL_ABI = CLEANVERSE_VALIDATOR_ABI;

// CreditLadderLens — pure-view router over the credit ladder. Holds no state and no rung
// config: it reconstructs each rung's gate, LLTV, and oracle out of the market id via
// covenant.toMarket(id), so a single `ladder()` call answers "which rung does this wallet
// clear, and what would it have to post there".
const RUNG_VIEW_COMPONENTS = [
  { name: "marketId",           type: "bytes32" },
  { name: "gate",               type: "address" },
  { name: "lltv",               type: "uint256" },
  { name: "collateralRequired", type: "uint256" },
  { name: "minSubTier",         type: "uint8"   },
  { name: "accessible",         type: "bool"    },
] as const;

export const CREDIT_LADDER_LENS_ABI = [
  { type: "function", stateMutability: "view", name: "ladder",
    inputs: [
      { name: "wallet",        type: "address"   },
      { name: "rungMarketIds", type: "bytes32[]" },
      { name: "borrowAmount",  type: "uint256"   },
    ],
    outputs: [
      // type(uint256).max when the wallet clears no rung.
      { name: "bestRung", type: "uint256" },
      { name: "rungs",    type: "tuple[]", components: RUNG_VIEW_COMPONENTS },
    ] },

  { type: "function", stateMutability: "view", name: "bestRungFor",
    inputs: [
      { name: "wallet",        type: "address"   },
      { name: "rungMarketIds", type: "bytes32[]" },
      { name: "borrowAmount",  type: "uint256"   },
    ],
    outputs: [
      { name: "marketId",           type: "bytes32" },
      { name: "lltv",               type: "uint256" },
      { name: "collateralRequired", type: "uint256" },
    ] },

  { type: "function", stateMutability: "view", name: "COVENANT", inputs: [], outputs: [{ type: "address" }] },
] as const;
