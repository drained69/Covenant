import { useState, useEffect } from "react";
import { fetchLiveOffers, STATIC_OFFERS, type DemoOffer } from "../config/demoOffers";

/**
 * Fetches live signed offers from the API server on mount, falling back to static
 * placeholder offers if the server is unreachable. The live offers have real EIP-712
 * signatures so fillOffer will actually settle on-chain.
 */
export function useOffers() {
  const [offers, setOffers] = useState<DemoOffer[]>(STATIC_OFFERS);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLiveOffers()
      .then((result) => {
        if (!cancelled) {
          setOffers(result);
          setLive(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { offers, live, error };
}
