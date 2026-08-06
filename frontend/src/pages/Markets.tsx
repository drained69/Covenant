import { Hero } from "../components/Hero";
import { MarketCard } from "../components/MarketCard";
import { MARKETS } from "../config/chain";
import { IconLayers } from "../components/icons";

export function Markets() {
  return (
    <>
      <Hero />
      <section className="shell py-12 lg:py-16">
        {/* Was `flex items-baseline justify-between` with a bare `<h2>` and a
            "{n} active" count. Baseline-aligning a 32px heading against 14px
            body text puts the small text's baseline on the heading's, which
            leaves it looking dropped rather than aligned. The count also had no
            noun, so "2 active" floated unattached to anything.

            Now the heading gets a subtitle like every other section on the site,
            and the count becomes a badge — which is what a small piece of state
            beside a title is. */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-h2 text-slate-50">Available markets</h1>
            <p className="mt-1.5 text-body-sm text-muted">
              Fixed-rate, fixed-maturity credit. Every fill is compliance-checked in-transaction.
            </p>
          </div>
          <span className="badge-neutral mt-1">
            <span className="status-dot-ok" />
            {MARKETS.length} {MARKETS.length === 1 ? "market" : "markets"} open
          </span>
        </div>

        {/* The grid adapts to how many markets exist. One market spans full width
            so it doesn't render at half-width with an empty right column; two or
            more use two columns from `lg` (keeps the metric grid at scannable
            measure — single-column cards stretch label/value pairs ~1100px apart
            at this container width). MARKETS.length is small today, so
            `xl:grid-cols-3` would leave holes; two columns is the right ceiling
            until there are enough markets to justify three. */}
        {MARKETS.length === 0 ? (
          // There was no empty branch at all — an unconfigured or filtered
          // deployment rendered a bare heading over blank space.
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <IconLayers className="w-5 h-5" />
              </div>
              <div className="empty-state-title">No markets available</div>
              <p className="empty-state-body">
                No credit markets are configured for this network yet.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-5 ${
              MARKETS.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            }`}
          >
            {MARKETS.map((m) => <MarketCard key={m.id} market={m} />)}
          </div>
        )}
      </section>
    </>
  );
}
