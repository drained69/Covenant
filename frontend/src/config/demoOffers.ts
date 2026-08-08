import { MARKETS } from "./chain";
import { apiUrl } from "./api";
import offerBook from "./offerBook.json";

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
 * The order book shipped with the app.
 *
 * Every entry is a genuine EIP-712 offer signed by the maker and encoded into the
 * `notaryData` that `fillOffer` passes to `EcrecoverNotary` — not a placeholder.
 * Each one was checked against the deployed notary before being committed
 * (`node offchain/preflight_offers.js`), which calls the notary's `isNotarized`
 * view as the Covenant core and requires the `CALLBACK_SUCCESS` magic value back.
 * So these offers settle; there is no disabled state to explain to the user.
 *
 * Regenerate with `node offchain/build_offer_book.js`, then re-run the pre-flight.
 * Offers carry a 90-day expiry, so the book needs regenerating before then — the
 * pre-flight fails loudly on an expired offer rather than letting the UI list one.
 *
 * Every offer has a distinct `group`. `consumed[maker][group]` is shared across
 * offers with the same group, so identical groups would silently couple budgets:
 * filling one offer would eat into the next one's remaining size.
 */
export const STATIC_OFFERS: DemoOffer[] = offerBook as DemoOffer[];

/**
 * Fetches freshly signed offers from the API server, if one is running.
 *
 * This is an optional upgrade rather than a requirement: it re-signs offers on
 * demand, so expiries are always minutes away instead of months. When no server
 * is running the baked-in book above is used, and it is equally fillable.
 */
export async function fetchLiveOffers(): Promise<DemoOffer[]> {
  const resp = await fetch(apiUrl("/api/offers"));
  const data = await resp.json();
  if (data.ok && Array.isArray(data.offers)) {
    return data.offers;
  }
  throw new Error(data.message || "Failed to fetch offers");
}
