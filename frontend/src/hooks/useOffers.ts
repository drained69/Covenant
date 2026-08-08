import { useState, useEffect } from "react";
import { fetchLiveOffers, STATIC_OFFERS, type DemoOffer } from "../config/demoOffers";

/**
 * Fetches freshly signed offers from the API server on mount, falling back to the
 * book that ships with the app if no server is running.
 *
 * Both are real: every offer in either source carries a genuine EIP-712 signature
 * and `fillOffer` settles it. `live` therefore reports provenance, not whether the
 * offers work — it is false whenever the API is absent, which is the normal case
 * for someone who just opened the app.
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
