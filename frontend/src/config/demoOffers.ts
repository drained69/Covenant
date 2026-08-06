import { ADDRESSES, MARKETS } from "./chain";

export type DemoOffer = {
  id: string;
  label: string;
  side: "lend" | "borrow";
  rateBps: number;
  maker: `0x${string}`;
  maxUnits: string;
  expiry: number;
  offer: any;
  notaryData: `0x${string}`;
};

export const DEMO_MARKET_ID = MARKETS[0].id;

/**
 * Fetches freshly signed offers from the API server. Each offer has a real EIP-712 signature
 * and properly encoded notaryData so fillOffer will pass the EcrecoverNotary check on-chain.
 */
export async function fetchLiveOffers(): Promise<DemoOffer[]> {
  const resp = await fetch("/api/offers");
  const data = await resp.json();
  if (data.ok && Array.isArray(data.offers)) {
    return data.offers;
  }
  throw new Error(data.message || "Failed to fetch offers");
}

// Static fallback market definition — matches on-chain market exactly.
const DEMO_MARKET = {
  loanToken: ADDRESSES.usdc,
  collateralParams: [
    {
      token:  ADDRESSES.wbtc,
      lltv:   "860000000000000000",
      maxLif: "1036269430051813471",
      oracle: ADDRESSES.oracle,
    },
  ],
  maturity:     "1820000000",
  rcfThreshold: "0",
  entryGate:    ADDRESSES.gate,
  seizureGate:  ADDRESSES.gate,
};

// MAX_TICK from TickLib.sol — represents par (price ≈ 1.0). Divisible by tickSpacing (4).
const MAX_TICK = "5820";
const REAL_MAKER = "0x8C6eE34413f0c7D472Ab157fbED84De1234EF54F" as `0x${string}`;

/**
 * Static fallback offers. Used only when the API server is unreachable. These have placeholder
 * notaryData so fillOffer won't settle — the UI shows a warning banner in that case.
 */
export const STATIC_OFFERS: DemoOffer[] = [
  {
    id: "lender-100k-par",
    label: "Fixed-rate lend · 100,000 units @ par",
    side: "lend",
    rateBps: 0,
    maker: REAL_MAKER,
    maxUnits: "100000000000",
    expiry: Math.floor(Date.now() / 1000) + 3600,
    offer: {
      market: DEMO_MARKET,
      buy: true,
      maker: REAL_MAKER,
      start: "0",
      expiry: String(Math.floor(Date.now() / 1000) + 3600),
      tick: MAX_TICK,
      group: "0x0000000000000000000000000000000000000000000000000000000000000000",
      callback: "0x0000000000000000000000000000000000000000",
      callbackData: "0x",
      receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
      notary: ADDRESSES.notary,
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
    maker: REAL_MAKER,
    maxUnits: "25000000000",
    expiry: Math.floor(Date.now() / 1000) + 3600,
    offer: {
      market: DEMO_MARKET,
      buy: false,
      maker: REAL_MAKER,
      start: "0",
      expiry: String(Math.floor(Date.now() / 1000) + 3600),
      tick: MAX_TICK,
      group: "0x0000000000000000000000000000000000000000000000000000000000000000",
      callback: "0x0000000000000000000000000000000000000000",
      callbackData: "0x",
      receiverIfMakerIsSeller: REAL_MAKER,
      notary: ADDRESSES.notary,
      reduceOnly: false,
      maxUnits: "25000000000",
      maxAssets: "0",
    },
    notaryData: "0xdemo",
  },
];
