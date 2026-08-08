#!/usr/bin/env node
/**
 * Off-chain Offer signing for Covenant.
 *
 * Signs an Offer struct with EIP-712 and produces the complete `notaryData` bytes
 * needed for `Covenant.fillOffer`. Supports two modes:
 *
 *   Interactive:  node offchain/sign_offer.js
 *   JSON output:  node offchain/sign_offer.js --json [--buy] [--sell] [--units N] [--expiry N]
 *
 * The JSON mode is consumed by the API server to generate fresh signed offers on demand.
 *
 * Install once:
 *   cd offchain && npm i ethers@6
 */

const { ethers } = require("ethers");

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — Monad testnet deployment addresses
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  chainId: 10143,
  ecrecoverNotary: process.env.ECRECOVER_NOTARY_ADDRESS || "0xc35B4e48940D68Dd449d19D3657e754632CC873C",
  lenderPrivateKey: process.env.PRIVATE_KEY,
};

// ─────────────────────────────────────────────────────────────────────────────
// EIP-712 TYPES — must exactly match src/interfaces/ICovenant.sol
// ─────────────────────────────────────────────────────────────────────────────
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
    { name: "notary",                    type: "address" },
    { name: "reduceOnly",                type: "bool"    },
    { name: "maxUnits",                  type: "uint256" },
    { name: "maxAssets",                 type: "uint256" },
  ],
  // The field MUST be named `offerTree`. HashLib.offerTreeTypeHash(0) hashes the
  // string "OfferTree(Offer offerTree)…"; naming it `offer` yields a different
  // typehash, a different digest, and ecrecover returns an unrelated address —
  // which the notary rejects with Unauthorized().
  OfferTree: [
    { name: "offerTree", type: "Offer" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Typehashes — must match HashLib.sol exactly
// ─────────────────────────────────────────────────────────────────────────────
const COLLATERAL_PARAMS_TYPEHASH = "0xaf44a88eb50ebdbbebd980e5a23045c44f61ece5f80ab708a1bbe8718102e6af";
const MARKET_TYPEHASH = "0x4d629a25703924f44fdc6d27bc80b822f48f46c8093e48ee1d9f917b651ce5ab";
const OFFER_TYPEHASH = "0x511c15b0860ce049695d22079788e07bf20c7091820f0d8677a4a18886c0a9ef";

// ─────────────────────────────────────────────────────────────────────────────
// HashLib port — replicate HashLib.hashOffer in JS to compute the Merkle root
// ─────────────────────────────────────────────────────────────────────────────
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function hashCollateralParams(cp) {
  return ethers.keccak256(abiCoder.encode(
    ["bytes32", "address", "uint256", "uint256", "address"],
    [COLLATERAL_PARAMS_TYPEHASH, cp.token, cp.lltv, cp.maxLif, cp.oracle]
  ));
}

function hashMarket(market) {
  const cpHashes = market.collateralParams.map(hashCollateralParams);
  const collateralParamsHash = ethers.keccak256(ethers.concat(cpHashes));
  return ethers.keccak256(abiCoder.encode(
    ["bytes32", "address", "bytes32", "uint256", "uint256", "address", "address"],
    [MARKET_TYPEHASH, market.loanToken, collateralParamsHash, market.maturity, market.rcfThreshold, market.entryGate, market.seizureGate]
  ));
}

function hashOffer(offer) {
  return ethers.keccak256(abiCoder.encode(
    ["bytes32", "bytes32", "bool", "address", "uint256", "uint256", "uint256", "bytes32", "address", "bytes32", "address", "address", "bool", "uint256", "uint256"],
    [
      OFFER_TYPEHASH,
      hashMarket(offer.market),
      offer.buy,
      offer.maker,
      offer.start,
      offer.expiry,
      offer.tick,
      offer.group,
      offer.callback,
      ethers.keccak256(offer.callbackData),
      offer.receiverIfMakerIsSeller,
      offer.notary,
      offer.reduceOnly,
      offer.maxUnits,
      offer.maxAssets,
    ]
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// The live Monad testnet market (must match on-chain exactly).
//
// Market ids are content-addressed — the id is keccak of this struct — so every
// field here must equal the on-chain market byte for byte. A single wrong field
// addresses a different, uninitialized market and fillOffer reverts.
// ─────────────────────────────────────────────────────────────────────────────
const MARKET = {
  loanToken: "0x7dbe32f1e1d3db45123f60ec5a79312863a7e279",
  collateralParams: [{
    token:  "0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad",
    lltv:   "860000000000000000",
    maxLif: "1036269430051813471",
    oracle: "0x2E09f0566A87Bb27615873aBCF18855d37b000F9", // STALENESS=0 — price never expires
  }],
  maturity:     1820000000,
  rcfThreshold: 0,
  entryGate:    "0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c",
  seizureGate:  "0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c",
};

// ─────────────────────────────────────────────────────────────────────────────
// SIGN + ENCODE
// ─────────────────────────────────────────────────────────────────────────────
async function signOffer({
  buy = true,
  maxUnits = null,
  expirySeconds = 3600,
  // MAX_TICK (par). Any override must be a multiple of the market's tickSpacing (4)
  // or fillOffer reverts with TickNotAccessible.
  tick = 5820n,
  // Consumption bucket. `consumed[maker][group]` is shared across every offer with
  // the same group, so a book of independently-fillable offers needs a distinct
  // group per offer — otherwise filling one drains the others' budgets.
  group = ethers.ZeroHash,
} = {}) {
  if (!CONFIG.lenderPrivateKey) {
    throw new Error("PRIVATE_KEY env var is required");
  }

  const wallet = new ethers.Wallet(CONFIG.lenderPrivateKey);
  const now = Math.floor(Date.now() / 1000);

  const offer = {
    market: MARKET,
    buy,
    maker:                   wallet.address,
    start:                   0,
    expiry:                  now + expirySeconds,
    tick:                    BigInt(tick),
    group,
    callback:                ethers.ZeroAddress,
    callbackData:            "0x",
    receiverIfMakerIsSeller: buy ? ethers.ZeroAddress : wallet.address,
    notary:                  CONFIG.ecrecoverNotary,
    reduceOnly:              false,
    maxUnits:                maxUnits ? BigInt(maxUnits) : ethers.MaxUint256,
    maxAssets:               0,
  };

  const domain = {
    chainId:           CONFIG.chainId,
    verifyingContract: CONFIG.ecrecoverNotary,
  };

  const offerTree = { offerTree: offer };
  const signature = await wallet.signTypedData(domain, TYPES, offerTree);
  const sig = ethers.Signature.from(signature);

  // Compute root = HashLib.hashOffer(offer) — must match Solidity exactly
  const root = hashOffer(offer);

  // Encode notaryData = abi.encode(Signature{v,r,s}, root, leafIndex=0, proof=[])
  const notaryData = abiCoder.encode(
    ["tuple(uint8 v, bytes32 r, bytes32 s)", "bytes32", "uint256", "bytes32[]"],
    [{ v: sig.v, r: sig.r, s: sig.s }, root, 0, []]
  );

  // Build the offer with all values as decimal strings (safe for JSON)
  const offerJSON = {
    market: {
      loanToken: offer.market.loanToken,
      collateralParams: offer.market.collateralParams.map(cp => ({
        token:  cp.token,
        lltv:   String(cp.lltv),
        maxLif: String(cp.maxLif),
        oracle: cp.oracle,
      })),
      maturity:     String(offer.market.maturity),
      rcfThreshold: String(offer.market.rcfThreshold),
      entryGate:    offer.market.entryGate,
      seizureGate:  offer.market.seizureGate,
    },
    buy:                     offer.buy,
    maker:                   offer.maker,
    start:                   String(offer.start),
    expiry:                  String(offer.expiry),
    tick:                    String(offer.tick),
    group:                   offer.group,
    callback:                offer.callback,
    callbackData:            offer.callbackData,
    receiverIfMakerIsSeller: offer.receiverIfMakerIsSeller,
    notary:                  offer.notary,
    reduceOnly:              offer.reduceOnly,
    maxUnits:                String(offer.maxUnits),
    maxAssets:               String(offer.maxAssets),
  };

  return {
    maker: wallet.address,
    offer: offerJSON,
    notaryData,
    expiry: offer.expiry,
    root,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const buy = !args.includes("--sell");
  const unitsIdx = args.indexOf("--units");
  const maxUnits = unitsIdx >= 0 ? args[unitsIdx + 1] : null;
  const expiryIdx = args.indexOf("--expiry");
  const expirySeconds = expiryIdx >= 0 ? parseInt(args[expiryIdx + 1]) : 3600;

  if (!CONFIG.lenderPrivateKey) {
    console.error("Set PRIVATE_KEY in the env.");
    process.exit(1);
  }

  const result = await signOffer({ buy, maxUnits, expirySeconds });

  if (jsonMode) {
    console.log(JSON.stringify(result));
    return;
  }

  const wallet = new ethers.Wallet(CONFIG.lenderPrivateKey);
  console.log(`Signer (offer.maker): ${wallet.address}`);
  console.log(`Side: ${buy ? "BUY credit (lender)" : "SELL credit (borrower)"}`);
  console.log(`Expiry: ${new Date(Number(result.expiry) * 1000).toLocaleString()}\n`);
  console.log(`notaryData (pass to fillOffer):\n  ${result.notaryData}\n`);
  console.log(`Root (hashOffer): ${result.root}\n`);
  console.log("Full offer struct (JSON):");
  console.log(JSON.stringify(result.offer, null, 2));
}

module.exports = { signOffer, MARKET, TYPES, hashOffer, CONFIG };

// Only run the CLI when invoked directly — `require`-ing this module (e.g. from
// build_offer_book.js) must not trigger a signing run.
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
