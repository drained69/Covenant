#!/usr/bin/env node
/**
 * Generates a real signed offer book for the live target-testnet market.
 *
 * Outputs a JSON array of signed offers to frontend/src/config/offerBook.json.
 *
 * Everything in this file is derived from the protocol's own math:
 *  - Ticks come from target prices via the verified port of TickLib.sol
 *    (offchain/tick_math.js, byte-identical to the on-chain library).
 *  - rateBps is the annualized simple yield implied by the offer's price and
 *    the market's remaining time to maturity — the same numbers the contract
 *    settles. Display-only, but not approximate.
 *  - Each offer gets a distinct `group`, so consumption budgets stay
 *    independent: filling one offer never drains another's maxUnits.
 *
 * Run: node offchain/build_offer_book.js
 * Requires: PRIVATE_KEY in .env (the maker's key, also the collateral poster)
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { signOffer, MARKET } = require("./sign_offer");
const { tickToPrice, priceToTick, priceToRateBps } = require("./tick_math");

// Market maturity (2027-08-30). Offer expiries go 90 days out — real, fillable
// offers that never outlive the market they quote.
const EXPIRY_SECONDS = 90 * 24 * 60 * 60;

const TICK_SPACING = 4;

/**
 * The book is uncrossed, like a real order book: lenders (buy side) quote
 * lower prices / higher yields than borrowers (sell side) quote.
 *
 *   lend  buy @ 0.950  → ~4.9% APR     tick 3504
 *   lend  buy @ 0.960  → ~3.9% APR     tick 3548
 *   lend  buy @ 0.970  → ~2.9% APR     tick 3608
 *   borr  sell@ 0.980  → ~1.9% APR     tick 3692
 *   borr  sell@ 0.985  → ~1.4% APR     tick 3752
 *   borr  sell@ 0.990  → ~0.9% APR     tick 3832
 *
 * Ticks are resolved by priceToTick(target, 4) — the lowest tick accessible
 * at or above each target price — so every offer sits on the market's
 * tickSpacing grid and fillOffer cannot revert with TickNotAccessible.
 */
const SPECS = [
  { buy: true,  price: 0.95,  maxUnits: "100000000000", label: "Lend 100k" },
  { buy: true,  price: 0.96,  maxUnits: "50000000000",  label: "Lend 50k" },
  { buy: true,  price: 0.97,  maxUnits: "75000000000",  label: "Lend 75k" },
  { buy: false, price: 0.98,  maxUnits: "25000000000",  label: "Borrow 25k" },
  { buy: false, price: 0.985, maxUnits: "15000000000",  label: "Borrow 15k" },
  { buy: false, price: 0.99,  maxUnits: "30000000000",  label: "Borrow 30k" },
];

/** Deterministic consumption-bucket key: the same offer regenerates the same group. */
function deriveGroup(buy, tick, index) {
  const side = buy ? "LEND" : "BORROW";
  return ethers.keccak256(ethers.toUtf8Bytes(`${side}-${tick}-${index}`));
}

async function buildBook() {
  const now = Math.floor(Date.now() / 1000);
  const secondsToMaturity = MARKET.maturity - now;
  if (secondsToMaturity <= 0) throw new Error("Market has matured; cannot build a book");

  const offers = [];

  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    const priceWad = BigInt(Math.round(spec.price * 1e18));
    const tick = priceToTick(priceWad, TICK_SPACING);
    // The offer's actual price is the grid price for its tick, not the target.
    const price = tickToPrice(tick);
    const rateBps = priceToRateBps(price, secondsToMaturity);

    const result = await signOffer({
      buy: spec.buy,
      tick,
      maxUnits: spec.maxUnits,
      group: deriveGroup(spec.buy, tick, i),
      expirySeconds: EXPIRY_SECONDS,
    });

    const side = spec.buy ? "lend" : "borrow";
    offers.push({
      id: `${side}-${tick}-${i}`,
      label: `${spec.label} @ ${(rateBps / 100).toFixed(2)}%`,
      side,
      rateBps,
      price: price.toString(),
      maker: result.maker,
      maxUnits: spec.maxUnits,
      expiry: result.expiry,
      offer: result.offer,
      notaryData: result.notaryData,
    });
  }

  const outPath = path.join(__dirname, "..", "frontend", "src", "config", "offerBook.json");
  fs.writeFileSync(outPath, JSON.stringify(offers, null, 2), "utf8");

  console.log(`✓ Generated ${offers.length} real signed offers → ${outPath}`);
  console.log(`  Expiry: ${new Date((now + EXPIRY_SECONDS) * 1000).toISOString()} (90 days out)`);
  console.log(`  Market maturity: ${new Date(MARKET.maturity * 1000).toISOString()}`);
  for (const o of offers) {
    console.log(`  ${o.id.padEnd(16)} ${o.label.padEnd(22)} tick ${o.offer.tick.padStart(4)}  price ${o.price.padStart(20)}`);
  }
  console.log("  All offers have distinct groups → independent consumption budgets");
}

buildBook().catch((e) => {
  console.error(e);
  process.exit(1);
});
