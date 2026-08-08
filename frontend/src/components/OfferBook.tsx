import { useNavigate, useSearchParams } from "react-router-dom";
import { useOffers } from "../hooks/useOffers";
import { fmtUnits, shortAddr } from "../lib/format";
import { IconCheck, IconArrowRight, IconDocument } from "./icons";

/**
 * Order book for the current market. Clicking an offer sets `?offer=<id>&tab=take` on the URL,
 * which the ActionPanel reads to prefill the Take offer flow. Offers are fetched from the API
 * server when one is running, falling back to the book that ships with the app. Both carry real
 * EIP-712 signatures and both settle — the fallback is checked against the deployed notary
 * before it is committed (`node offchain/preflight_offers.js`).
 */
export function OfferBook() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selected = params.get("offer");
  const { offers, live } = useOffers();

  function pick(id: string) {
    const next = new URLSearchParams(params);
    next.set("offer", id);
    next.set("tab", "take");
    navigate(`?${next.toString()}`, { replace: false });
    setTimeout(
      () =>
        document
          .getElementById("actions-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <div>
          <div className="card-title">Order book</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Signed off-chain, filled on-chain. Select a row to take it.
          </div>
        </div>
        {/*
          This badge reports *provenance*, not health. Both sources are genuine
          signed offers that settle, so neither gets the caution tone — amber
          here used to mean "these will revert", and that is no longer true of
          the fallback. What still differs is expiry horizon: the API re-signs on
          request, the shipped book carries a fixed 90-day expiry. That is what
          the tooltip explains, and it is the only reason a reader would care
          which one they are looking at.
        */}
        <span
          className="badge-neutral"
          title={live
            ? "Offers re-signed on request by the local API server."
            : "The offer API is not running, so the book that ships with the app is shown. These are real signed offers and settle on-chain."}
        >
          <span className="status-dot-ok" />
          {live ? "Freshly signed" : "Shipped book"}
        </span>
      </div>

      {offers.length === 0 ? (
        // There was no empty branch — an empty book rendered a header over a
        // hairline and nothing else.
        <div className="empty-state">
          <div className="empty-state-icon">
            <IconDocument className="w-5 h-5" />
          </div>
          <div className="empty-state-title">No open offers</div>
          <p className="empty-state-body">
            Nothing is quoted on this market right now. Makers publish signed offers off-chain.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {offers.map((o) => {
            const isSelected = selected === o.id;
            return (
              <button
                key={o.id}
                onClick={() => pick(o.id)}
                aria-pressed={isSelected}
                /*
                  `bg-brand-500/8` is not a Tailwind step — the opacity scale
                  jumps 5 → 10, so `/8` was silently dropped and the selected row
                  rendered identically to an unselected one until hovered. That is
                  the whole selection affordance on this control.

                  Now: an arbitrary-value wash that actually compiles, plus an
                  inset left rule. The rule is what carries the state at a glance
                  down a column of rows — a 6% fill difference does not.
                */
                className={`relative w-full text-left px-5 py-4 flex items-center gap-4
                            transition-colors duration-150
                            focus-visible:outline-none focus-visible:bg-white/[0.04]
                            ${isSelected ? "bg-brand-500/[0.07]" : "hover:bg-white/[0.03]"}`}
              >
                {isSelected && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-400"
                    aria-hidden="true"
                  />
                )}

                {/*
                  Was `badge-info` for lend and `badge-warn` for borrow. Brand
                  cyan is the interactive-affordance colour, so LEND looked
                  clickable in a way BORROW did not; and amber is the app's
                  caution tone, so BORROW read as a warning about the offer
                  rather than as its direction. These are two symmetric sides of
                  a book, so they get the two directional tones the rest of the
                  app already uses for up/down.
                */}
                <span
                  className={`${o.side === "lend" ? "badge-ok" : "badge-bad"} flex-shrink-0 w-[74px] justify-center`}
                >
                  {o.side === "lend" ? "Lend" : "Borrow"}
                </span>

                <div className="flex-1 min-w-0">
                  {/*
                    `label` from the API packs side, size, and price into one
                    string ("Fixed-rate lend · 100,000 units @ par") — all three
                    of which are already columns on this row, so every row
                    printed its own contents twice. The rate is what an order
                    book is for, and it was the one field never rendered.
                  */}
                  <div className="text-body-sm font-semibold text-slate-100 tabular-nums">
                    {o.rateBps === 0 ? "Par" : `${(o.rateBps / 100).toFixed(2)}%`}
                    <span className="ml-1.5 font-normal text-subtle">
                      {o.rateBps === 0 ? "· 1.0000" : "fixed"}
                    </span>
                  </div>
                  <div className="text-micro font-mono text-subtle truncate mt-0.5">
                    {shortAddr(o.maker)}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-body-sm font-mono tabular-nums text-slate-100">
                    {fmtUnits(BigInt(o.maxUnits), 6)}
                    <span className="ml-1 text-subtle font-sans">units</span>
                  </div>
                  {/*
                    Was `stat-label` (uppercase 11px muted) reading "Selected ✓"
                    or "Take →" — a figure label used for an action, with the
                    tick and arrow as literal characters in the body font, so
                    they sat at a different weight and baseline than the stroked
                    icons doing the same job elsewhere.
                  */}
                  <div
                    className={`mt-1 inline-flex items-center gap-1.5 text-micro font-semibold
                                ${isSelected ? "text-brand-300" : "text-subtle"}`}
                  >
                    {isSelected ? (
                      <>
                        <IconCheck className="w-3 h-3" />
                        Selected
                      </>
                    ) : (
                      <>
                        Take
                        <IconArrowRight className="w-3 h-3" />
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
