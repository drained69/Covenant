/**
 * Minimal ABIs for the credit layer — only the functions the app calls.
 *
 * Written by hand rather than imported from forge artifacts so the frontend
 * build never depends on `out/`. Field orders MUST match
 * `src/interfaces/ICovenant.sol` byte for byte: the Market/Offer structs are
 * EIP-712-typed and content-addressed, so a reordered field is a different
 * market.
 */

export const COVENANT_ABI = [
  {
    type: "function",
    name: "fillOffer",
    stateMutability: "payable",
    inputs: [
      {
        name: "offer",
        type: "tuple",
        components: [
          {
            name: "market",
            type: "tuple",
            components: [
              { name: "loanToken", type: "address" },
              {
                name: "collateralParams",
                type: "tuple[]",
                components: [
                  { name: "token", type: "address" },
                  { name: "lltv", type: "uint256" },
                  { name: "maxLif", type: "uint256" },
                  { name: "oracle", type: "address" },
                ],
              },
              { name: "maturity", type: "uint256" },
              { name: "rcfThreshold", type: "uint256" },
              { name: "entryGate", type: "address" },
              { name: "seizureGate", type: "address" },
            ],
          },
          { name: "buy", type: "bool" },
          { name: "maker", type: "address" },
          { name: "start", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "tick", type: "uint256" },
          { name: "group", type: "bytes32" },
          { name: "callback", type: "address" },
          { name: "callbackData", type: "bytes" },
          { name: "receiverIfMakerIsSeller", type: "address" },
          { name: "notary", type: "address" },
          { name: "reduceOnly", type: "bool" },
          { name: "maxUnits", type: "uint256" },
          { name: "maxAssets", type: "uint256" },
        ],
      },
      { name: "notaryData", type: "bytes" },
      { name: "units", type: "uint256" },
      { name: "taker", type: "address" },
      { name: "receiverIfTakerIsSeller", type: "address" },
      { name: "takerCallback", type: "address" },
      { name: "takerCallbackData", type: "bytes" },
    ],
    outputs: [
      { name: "", type: "uint256" },
      { name: "", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "supplyCollateral",
    stateMutability: "payable",
    inputs: [
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          {
            name: "collateralParams",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "lltv", type: "uint256" },
              { name: "maxLif", type: "uint256" },
              { name: "oracle", type: "address" },
            ],
          },
          { name: "maturity", type: "uint256" },
          { name: "rcfThreshold", type: "uint256" },
          { name: "entryGate", type: "address" },
          { name: "seizureGate", type: "address" },
        ],
      },
      { name: "collateralIndex", type: "uint256" },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawCollateral",
    stateMutability: "payable",
    inputs: [
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          {
            name: "collateralParams",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "lltv", type: "uint256" },
              { name: "maxLif", type: "uint256" },
              { name: "oracle", type: "address" },
            ],
          },
          { name: "maturity", type: "uint256" },
          { name: "rcfThreshold", type: "uint256" },
          { name: "entryGate", type: "address" },
          { name: "seizureGate", type: "address" },
        ],
      },
      { name: "collateralIndex", type: "uint256" },
      { name: "assets", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "receiver", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "payable",
    inputs: [
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          {
            name: "collateralParams",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "lltv", type: "uint256" },
              { name: "maxLif", type: "uint256" },
              { name: "oracle", type: "address" },
            ],
          },
          { name: "maturity", type: "uint256" },
          { name: "rcfThreshold", type: "uint256" },
          { name: "entryGate", type: "address" },
          { name: "seizureGate", type: "address" },
        ],
      },
      { name: "units", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "callback", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  { type: "function", name: "debtOf", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }], outputs: [{ name: "", type: "uint128" }] },
  { type: "function", name: "collateral", stateMutability: "view", inputs: [{ name: "id", type: "bytes32" }, { name: "user", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ name: "", type: "uint128" }] },
] as const;

/**
 * isHealthy takes the Market struct, not the id — re-declared with full
 * components (viem needs the complete tuple shape to encode).
 */
export const COVENANT_IS_HEALTHY_ABI = [
  {
    type: "function",
    name: "isHealthy",
    stateMutability: "view",
    inputs: [
      {
        name: "market",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          {
            name: "collateralParams",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "lltv", type: "uint256" },
              { name: "maxLif", type: "uint256" },
              { name: "oracle", type: "address" },
            ],
          },
          { name: "maturity", type: "uint256" },
          { name: "rcfThreshold", type: "uint256" },
          { name: "entryGate", type: "address" },
          { name: "seizureGate", type: "address" },
        ],
      },
      { name: "id", type: "bytes32" },
      { name: "borrower", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ETHOS_GATE_ABI = [
  {
    type: "function",
    name: "authorize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "auth",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "score", type: "uint128" },
          { name: "deadline", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "chainId", type: "uint256" },
        ],
      },
      {
        name: "signature",
        type: "tuple",
        components: [
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
  { type: "function", name: "canIncreaseDebt", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "authorizedScore", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint128" }] },
  { type: "function", name: "authorizedUntil", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "MINIMUM_SCORE", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint128" }] },
] as const;

export const ORACLE_ABI = [
  { type: "function", name: "price", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;
