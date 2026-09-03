import { useDreamDexMarkets, useVenueTail } from "../hooks/useDreamDex";
import { MarketTable } from "../components/MarketTable";

/**
 * Markets — the trading surface.
 *
 * Purely discovery and execution: what is live right now, filtered and
 * sorted the way a trader scans (search, asset, ending-soon, sort), then
 * one row per market with the split, the volume, and the clock. Every
 * explanatory surface lives on Overview; every trading instrument lives
 * here. Nothing else competes for the attention.
 */
export function Markets() {
  const { data: markets, isLoading, isError } = useDreamDexMarkets();
  const tail = useVenueTail();

  const liveCount = markets?.length ?? 0;

  return (
    <>
      <section className="relative border-b border-line">
        <div className="shell py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="max-w-2xl">
              <div className="section-label text-brand-500">DreamDEX Event Contracts</div>
              <h1 className="mt-3 text-h1 text-slate-50 text-balance">Explore markets.</h1>
              <p className="mt-5 max-w-xl text-body-lg text-muted leading-relaxed">
                Discover live binary markets and take a position — probability, volume,
                and time to expiry, straight from the venue feed.
              </p>
            </div>

            {/* Trader vitals: the numbers that gate action, as one strip.
                Disconnected shows the venue's shape instead of blanks. */}
            <Vital
              label="Live markets"
              value={isLoading ? "…" : isError ? "—" : liveCount.toLocaleString()}
            />
          </div>
        </div>
      </section>

      {/* The instrument panel is intentionally the only product surface here. */}
      <section id="live-markets" className="shell py-6 lg:py-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-h3 text-slate-50">Live markets</h2>
          <div className="flex items-center gap-2 text-micro text-subtle" aria-live="polite">
            <span className={tail.connected ? "status-dot-ok" : "status-dot-warn"} />
            {tail.connected ? "Live venue feed" : "Reconnecting to venue"}
          </div>
        </div>
        {markets && markets.length > 0 ? (
          <MarketTable markets={markets} />
        ) : isError ? (
          <UnavailableState isError={isError} />
        ) : (
          <SkeletonTable />
        )}
      </section>
    </>
  );
}

/* ── small parts ─────────────────────────────────────────────────────── */

function Vital({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="text-right">
      <div className="stat-label">{label}</div>
      <div
        className={`mt-0.5 font-mono text-h3 leading-none font-semibold tabular-nums ${
          tone === "ok" ? "text-ok" : "text-slate-50"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Indexer unreachable: state it plainly, keep the page's shape. */
/**
 * The first-paint stand-in for the market list.
 *
 * A row of skeletons has one job the "Loading…" card never did: show the
 * reader WHERE the content will land. The layout is identical to a real
 * MarketRow (same grid template), so when data arrives, the columns don't
 * jump — the skeletons animate into text in the same slots. Waiting still
 * exists; it stops feeling like a stall.
 */
function SkeletonTable() {
  return (
    <div className="card overflow-hidden">
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_185px_110px_110px_92px] gap-x-4 px-4 py-3 border-b border-line text-micro uppercase tracking-widest text-subtle">
        <div>Market</div>
        <div>Up / Down</div>
        <div className="text-right">Volume</div>
        <div className="text-right">Settles in</div>
        <div />
      </div>
      <div className="divide-y divide-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_185px_110px_110px_92px] gap-x-4 gap-y-2 px-4 py-4 md:py-3.5"
          >
            <div className="min-w-0 space-y-2">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="hidden md:block space-y-2 pt-0.5">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-1 w-full" />
            </div>
            <div className="hidden md:block skeleton h-3 w-16 ml-auto mt-1" />
            <div className="hidden md:block skeleton h-3 w-14 ml-auto mt-1" />
            <div className="hidden md:block skeleton h-8 w-16 rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

function UnavailableState({ isError }: { isError: boolean }) {
  return (
    <div className="card">
      <div className="p-6 flex items-start gap-3">
        <span className={`status-dot mt-2 ${isError ? "status-dot-warn" : "status-dot-idle"}`} />
        <div>
          <div className="text-body font-semibold text-slate-100">
            {isError ? "Live indexer unavailable" : "Loading live markets"}
          </div>
          <p className="mt-1 text-body-sm text-subtle leading-relaxed">
            {isError
              ? "The DreamDEX market registry could not be reached. Markets return the moment the indexer responds — no preview data is fabricated here."
              : "Connecting to the DreamDEX market registry…"}
          </p>
        </div>
      </div>
    </div>
  );
}
