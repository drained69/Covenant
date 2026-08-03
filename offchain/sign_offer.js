#!/usr/bin/env node
/**
 * Off-chain Offer signing example.
 *
 * A lender in Covenant does NOT put their offer on-chain — that would waste gas and lock the offer to
 * a single market execution. Instead they sign the Offer struct with EIP-712 and publish the signature
 * off-chain (via API, database, or a marketplace). A borrower takes the offer on-chain by calling
 * `fillOffer(offer, notaryData, ...)`, and the `EcrecoverNotary` (bound to the offer) verifies
 * the signature was produced by the offer's `maker`.
 *
 * This script demonstrates the signing half. It produces a signature you can pass as `notaryData`
 * to the on-chain fillOffer call — no on-chain state changes here.
 *
 * Install once:
 *   npm i ethers@6
 *
 * Run:
 *   node offchain/sign_offer.js
 */

const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — replace with your deployment
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  chainId: 10143,
  ecrecoverNotary: "0x0000000000000000000000000000000000000000", // deploy periphery, paste address
  // Lender's private key — this key MUST correspond to the offer.maker address.
  // For hackathon demos use a throwaway key; for production a wallet does the signing.
  lenderPrivateKey: process.env.LENDER_PRIVATE_KEY,
};

// ─────────────────────────────────────────────────────────────────────────────
// EIP-712 TYPES — must exactly match src/interfaces/ICovenant.sol
// ─────────────────────────────────────────────────────────────────────────────
// Field NAMES matter (they hash into the typehash). If Covenant's structs change,
// update these. Verified against MARKET_TYPE / OFFER_TYPE in test/HashLibTest.sol.
const TYPES = {
  CollateralParams: [
    { name: "token",  type: "address" },
    { name: "lltv",   type: "uint256" },
    { name: "maxLif", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "loanToken",         type: "address" },
    { name: "collateralParams",  type: "CollateralParams[]" },
    { name: "maturity",          type: "uint256" },
    { name: "rcfThreshold",      type: "uint256" },
    { name: "entryGate",         type: "address" },
    { name: "seizureGate",       type: "address" },
  ],
  Offer: [
    { name: "market",                    type: "Market"  },
    { name: "buy",                       type: "bool"    },
    { name: "maker",                     type: "address" },
    { name: "start",                     type: "uint256" },
    { name: "expiry",                    type: "uint256" },
    { name: "tick",                      type: "uint256" },
    { name: "group",                     type: "bytes32" },
    { name: "callback",                  type: "address" },
    { name: "callbackData",              type: "bytes"   },
    { name: "receiverIfMakerIsSeller",   type: "address" },
    { name: "notary",                  type: "address" },
    { name: "reduceOnly",                type: "bool"    },
    { name: "maxUnits",                  type: "uint256" },
    { name: "maxAssets",                 type: "uint256" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SIGN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!CONFIG.lenderPrivateKey) {
    console.error("Set LENDER_PRIVATE_KEY in the env, e.g. `LENDER_PRIVATE_KEY=0x… node offchain/sign_offer.js`");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(CONFIG.lenderPrivateKey);
  console.log(`Signer (must equal offer.maker): ${wallet.address}\n`);

  // ── The market this offer trades in.
  // Every field must match the on-chain market exactly; the market id is derived from it.
  const market = {
    loanToken: "0x0000000000000000000000000000000000000001",         // your USDC
    collateralParams: [{
      token:  "0x0000000000000000000000000000000000000002",          // your WBTC
      lltv:   ethers.parseUnits("0.77", 18),                          // 77%
      maxLif: ethers.parseUnits("1.09", 18),                          // 9% max liquidation incentive
      oracle: "0x0000000000000000000000000000000000000003",           // your BtcUsdOracle
    }],
    maturity:     Math.floor(Date.now() / 1000) + 90 * 24 * 3600,     // 90 days
    rcfThreshold: 0,
    entryGate:    "0x0000000000000000000000000000000000000000",       // your CleanversePoolGate
    seizureGate:  "0x0000000000000000000000000000000000000000",       // your CleanversePoolGate
  };

  // ── The offer. `buy: true` = lender (buys credit); `maker: wallet.address`.
  const offer = {
    market,
    buy:                     true,
    maker:                   wallet.address,
    start:                   0,
    expiry:                  Math.floor(Date.now() / 1000) + 3600,   // 1h window to fill
    tick:                    ethers.toBigInt("0x7fffffffffffffffffffffffffff"), // MAX_TICK (par)
    group:                   ethers.ZeroHash,
    callback:                ethers.ZeroAddress,
    callbackData:            "0x",
    receiverIfMakerIsSeller: ethers.ZeroAddress,
    notary:                CONFIG.ecrecoverNotary,
    reduceOnly:              false,
    maxUnits:                ethers.MaxUint256,
    maxAssets:               0,
  };

  // ── EIP-712 domain. `EcrecoverNotary` uses (chainId, verifyingContract) only —
  // no name or version fields — matching EIP712_DOMAIN_TYPEHASH in the notary's interface.
  const domain = {
    chainId:            CONFIG.chainId,
    verifyingContract:  CONFIG.ecrecoverNotary,
  };

  const signature = await wallet.signTypedData(domain, TYPES, offer);
  console.log("EIP-712 signature (pass as notaryData to fillOffer):");
  console.log(`  ${signature}\n`);

  // ── The `notaryData` argument to `Covenant.fillOffer` for the simple (single-offer, no merkle
  // tree) case is exactly this signature. For batch/merkle flows see EcrecoverNotary tests.

  console.log("On-chain call the taker will make:");
  console.log("  covenant.fillOffer(offer, notaryData, units, taker, receiver, callback, data)");
  console.log("  where");
  console.log("    offer         = the same struct signed above");
  console.log("    notaryData  = the signature above");
  console.log("    units         = amount of credit units the taker wants to fill");
  console.log("    taker         = the taker's address (msg.sender or authorized delegate)");
  console.log("    receiver      = where loan tokens go if the taker is the seller");
  console.log("    callback/data = optional (address(0)/'0x' for none)");
}

main().catch((e) => { console.error(e); process.exit(1); });
