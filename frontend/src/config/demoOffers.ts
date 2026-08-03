import { ADDRESSES, MARKETS } from "./chain";

/**
 * Demo signed offers for the Sepolia demo market. In production these would be served by a
 * marketplace API (Telegram bot, web app, inter-institutional bus). For the hackathon demo we
 * seed a few realistic-looking offers so a taker can click straight into `fillOffer` without
 * having to run the off-chain signer first.
 *
 * The `notaryData` on these is deliberately a placeholder — the on-chain notary will refuse to
 * ratify them because the deployed EcrecoverNotary requires a real EIP-712 signature over the
 * exact Offer struct. That's the correct outcome: the UI proves the *flow* (click → preview →
 * sign → submit → gate), and the notary is the honest ratifier that will only accept genuinely
 * signed offers. Replace `notaryData` with the output of `offchain/sign_offer.js` to submit a
 * fill that actually settles.
 */

// The one demo market defined in chain.ts. Every field must match the on-chain market so the
// derived id (keccak of every field including gate) matches — otherwise Covenant.fillOffer
// reverts before the notary is even consulted.
const DEMO_MARKET = {
  loanToken: ADDRESSES.usdc,
  collateralParams: [
    {
      token:  ADDRESSES.wbtc,
      lltv:   "770000000000000000",           // 0.77 * 1e18
      maxLif: "1093023255813953488",          // maxLif(0.77e18, LIQUIDATION_CURSOR_LOW)
      oracle: ADDRESSES.oracle,
    },
  ],
  maturity:     "1780000000",                 // demo maturity — replace with actual on-chain value
  rcfThreshold: "0",
  entryGate:    ADDRESSES.gate,
  seizureGate:  ADDRESSES.gate,
};

const MAX_TICK = "0x7fffffffffffffffffffffffffff"; // par pricing
const ONE_HOUR = 60 * 60;
const now = Math.floor(Date.now() / 1000);

export type DemoOffer = {
  id: string;                // stable identifier for URL param
  label: string;             // human-readable card title
  side: "lend" | "borrow";
  rateBps: number;           // annualized, for display
  maker: `0x${string}`;
  maxUnits: string;          // stringified bigint
  expiry: number;            // unix seconds
  offer: any;                // the exact Offer struct (uint256s as decimal strings, ready for BigInt coerce)
  notaryData: `0x${string}`;
};

export const DEMO_MARKET_ID = MARKETS[0].id;

/** Two demo offers: one lender-side (maker BUYS credit), one borrower-side (maker SELLS credit). */
export const DEMO_OFFERS: DemoOffer[] = [
  {
    id: "lender-100k-par",
    label: "Fixed-rate lend · 100,000 units @ par",
    side: "lend",
    rateBps: 0,
    maker: "0x1111111111111111111111111111111111111111",
    maxUnits: "100000000000",   // 100_000e6
    expiry: now + ONE_HOUR,
    offer: {
      market: DEMO_MARKET,
      buy: true,                // maker buys credit → they're the lender
      maker: "0x1111111111111111111111111111111111111111",
      start: "0",
      expiry: String(now + ONE_HOUR),
      tick: MAX_TICK,
      group: "0x0000000000000000000000000000000000000000000000000000000000000000",
      callback: "0x0000000000000000000000000000000000000000",
      callbackData: "0x",
      receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
      notary: "0x0000000000000000000000000000000000000000",  // demo — replace with real EcrecoverNotary
      reduceOnly: false,
      maxUnits: "100000000000",
      maxAssets: "0",
    },
    notaryData: "0xdemo",
  },
  {
    id: "borrower-25k-par",
    label: "Fixed-rate borrow · 25,000 units @ par",
    side: "borrow",
    rateBps: 0,
    maker: "0x2222222222222222222222222222222222222222",
    maxUnits: "25000000000",    // 25_000e6
    expiry: now + ONE_HOUR,
    offer: {
      market: DEMO_MARKET,
      buy: false,               // maker sells credit → they're the borrower
      maker: "0x2222222222222222222222222222222222222222",
      start: "0",
      expiry: String(now + ONE_HOUR),
      tick: MAX_TICK,
      group: "0x0000000000000000000000000000000000000000000000000000000000000000",
      callback: "0x0000000000000000000000000000000000000000",
      callbackData: "0x",
      receiverIfMakerIsSeller: "0x2222222222222222222222222222222222222222",
      notary: "0x0000000000000000000000000000000000000000",
      reduceOnly: false,
      maxUnits: "25000000000",
      maxAssets: "0",
    },
    notaryData: "0xdemo",
  },
];
