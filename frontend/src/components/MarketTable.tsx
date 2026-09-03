import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { UnifiedMarket } from "@somnia-chain/markets-sdk";
import { useNow } from "../hooks/useNow";
import { countdown, fmtCents, fmtMoney } from "../lib/format";
import { IconSearch } from "./icons";

/**
 * The live-market table — the homepage's primary surface.
 *
 * Design answer: traders scan, rank, and compare; a table is the layout that
 * comparison actually works in. Each row answers the four questions in the
 * order they're asked — WHAT is the question, WHICH WAY is the crowd, HOW
 * REAL is the market, and HOW LONG do I have — then presents the action.
 *
 * UP/DOWN are quoted in cents (the event-contract convention: a share costs
 * 62¢ and pays $1), with a hairline probability bar under the pair so the
 * split is legible before any number is read.
 *
 * Filtering stays honest to the venue: DreamDEX lists crypto-direction
 * Event Contracts, so categories are asset-based (All / BTC / ETH / SOL /
 * Ending soon) — a Politics or Sports tab with zero rows would be furniture.
 */

type SortKey = "ending" | "volume" | "probability";

/** Indexer fields needed for filtering/sorting, without the book. */
function rowMeta(m: UnifiedMarket) {
  const info = m.info.marketType === "BINARY" ? m.info : undefined;
  const expiresAt = info ? Number(info.expiry) * 1000 : undefined;
  const volume =
    info && info.quoteDecimals
      ? Number(info.cumulativeQuoteVolume) / 10 ** info.quoteDecimals
      : 0;
  // lastPrice is raw: YES probability × 10^quoteDecimals (null until first
  // fill). Dividing through normalizes ACROSS markets — raw comparison would
  // rank an 18-decimal market at p=0.01 above a 6-decimal one at p=0.99.
  const lastPrice =
    info?.lastPrice != null ? Number(info.lastPrice) / 10 ** info.quoteDecimals : 0;
  return { info, expiresAt, volume, lastPrice };
}

export function MarketTable({ markets }: { markets: UnifiedMarket[] }) {
  const [query, setQuery] = useState("");
  const [asset, setAsset] = useState<string>("all");
  const [endingSoon, setEndingSoon] = useState(false);
  const [sort, setSort] = useState<SortKey>("volume");
  const now = useNow();

  const assets = useMemo(() => {
    const set = new Set<string>();
    for (const m of markets) {
      const { info } = rowMeta(m);
      if (info?.asset) set.add(info.asset);
    }
    return ["all", ...Array.from(set).sort()];
  }, [markets]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = markets.filter((m) => {
      const { info, expiresAt } = rowMeta(m);
      if (!info) return false;
      if (asset !== "all" && info.asset !== asset) return false;
       if (
         endingSoon &&
         (expiresAt === undefined || expiresAt <= now || expiresAt - now > 24 * 3600 * 1000)
       )
         return false;
      if (q && !`${info.question} ${info.asset}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // Sort keys are indexer-native (no per-row book hook — hooks can't run in
    // a loop, and the live mid belongs to the row display anyway). `ending`
    // is soonest-first; the others run hot-first, hence the sign flip.
    return [...filtered].sort((a, b) => {
      const A = rowMeta(a);
      const B = rowMeta(b);
      if (sort === "ending") {
        const ta = A.expiresAt ?? Infinity;
        const tb = B.expiresAt ?? Infinity;
        return ta - tb;
      }
      if (sort === "volume") return B.volume - A.volume;
      return B.lastPrice - A.lastPrice;
    });
  }, [markets, query, asset, endingSoon, sort, now]);

  return (
    <div className="card overflow-hidden">
      {/* Toolbar: search, asset filters, sort. One row, hairline-bounded —
          controls are part of the table, not a toolbar above it. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line">
        <label className="relative flex-1 min-w-[180px]">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets…"
            spellCheck={false}
            aria-label="Search markets"
            className="field-input !pl-9 !py-2 !rounded-md text-body-sm"
          />
        </label>

        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by asset">
          {assets.map((a) => (
            <FilterChip key={a} active={asset === a} onClick={() => setAsset(a)}>
              {a === "all" ? "All" : a}
            </FilterChip>
          ))}
          <FilterChip active={endingSoon} onClick={() => setEndingSoon(!endingSoon)}>
            Ending soon
          </FilterChip>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-micro text-subtle uppercase hidden sm:inline">Sort</span>
          {(
            [
              ["volume", "Volume"],
              ["ending", "Ending"],
              ["probability", "Probability"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <FilterChip key={key} active={sort === key} onClick={() => setSort(key)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Head — desktop only; on mobile the row blocks carry their own labels. */}
       <div className="hidden md:grid grid-cols-[minmax(0,1fr)_185px_110px_110px_92px] gap-4 px-4 py-2.5 border-b border-line bg-ink-900">
        <span className="text-micro font-semibold uppercase text-muted">Market</span>
        <span className="text-micro font-semibold uppercase text-muted">Up / Down</span>
        <span className="text-micro font-semibold uppercase text-muted text-right">Volume</span>
        <span className="text-micro font-semibold uppercase text-muted text-right">Settles in</span>
        <span className="text-micro font-semibold uppercase text-muted text-right"></span>
      </div>

      <div className="divide-y divide-line">
        {rows.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-body-sm font-semibold text-slate-200">No markets match</div>
            <p className="mt-1 text-body-sm text-subtle">
              Adjust the search or filters — live Event Contracts appear here as the venue lists them.
            </p>
          </div>
        ) : (
          rows.map((m) => <MarketRow key={m.id} market={m} now={now} />)
        )}
      </div>
    </div>
  );
}

/* ── row ─────────────────────────────────────────────────────────────── */

/**
 * One market. The whole row is the link target (the largest possible hit
 * area for the primary action); the Trade button is a visual affordance
 * inside it — pointer-events off, so it never fights the row for the click.
 */
function MarketRow({ market, now }: { market: UnifiedMarket; now: number }) {
  const { info, expiresAt, volume } = rowMeta(market);
  // Show the indexer's last-fill price directly, DO NOT open a live book
  // watch for every visible row. A page listing 14 markets used to open 14
  // WebSocket subscriptions + GraphQL hydrations on first paint, so the
  // slowest hydration (the indexer serialises them) blocked the entire list
  // at 6-8 seconds. `lastPrice` is a normal indexer field on the market row
  // — no extra network — and it is the market's most recent traded
  // probability, which is exactly what a scan-the-list reader wants. The
  // fresh live book still streams on the market detail page.
  const lastPriceRaw = info?.lastPrice;
  const mid =
    lastPriceRaw != null && info?.quoteDecimals
      ? Number(lastPriceRaw) / 10 ** info.quoteDecimals
      : undefined;
  const isLoading = false;
  const live = expiresAt !== undefined && expiresAt > now;

  return (
    <Link
      to={`/markets/${encodeURIComponent(market.id)}`}
      className="relative grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_185px_110px_110px_92px]
                 gap-x-4 gap-y-2 px-4 py-4 md:py-3.5
                 transition-[background-color] duration-150
                 hover:bg-ink-900 focus-visible:bg-ink-900 group"
    >
      {/* Market — the question, then its coordinates. */}
      <div className="min-w-0">
        <div className="text-body font-medium text-slate-100 leading-snug group-hover:text-slate-50 transition-colors">
          {info?.question ?? market.base}
        </div>
        <div className="mt-1 text-micro text-subtle">
          {info?.asset ?? "Event"}
          {info?.interval && <> · {info.interval} window</>}
          <span className="md:hidden">
            {volume > 0 && <> · {fmtMoney(volume)} vol</>}
            {expiresAt !== undefined && <> · {live ? countdown(expiresAt / 1000, now) : "settled"}</>}
          </span>
        </div>
      </div>

      {/* Up/Down in cents with a hairline split bar. Loading reads as a flat
          50/50 so the grid never flashes empty cells. On mobile the Trade
          affordance rides this line — market, probability, action in one
          glance, per the mobile priority order. */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3 font-mono text-body-sm tabular-nums">
            <span className="text-ok">
              UP {isLoading && mid === undefined ? "—" : fmtCents(mid)}
            </span>
            <span className="text-bad/90">
              DOWN{" "}
              {isLoading && mid === undefined ? "—" : fmtCents(mid !== undefined ? 1 - mid : undefined)}
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full overflow-hidden flex bg-bad/25">
            <div
              className="h-full bg-ok/70 transition-[width] duration-500 ease-out"
              style={{ width: `${(mid ?? 0.5) * 100}%` }}
            />
          </div>
        </div>
        <span
          className="btn-primary btn-sm pointer-events-none md:hidden flex-shrink-0"
          aria-hidden="true"
        >
          Trade →
        </span>
      </div>

      <div className="hidden md:block text-right font-mono text-body-sm text-slate-300 tabular-nums self-center">
        {volume > 0 ? fmtMoney(volume) : "—"}
      </div>

      <div className="hidden md:block text-right font-mono text-body-sm tabular-nums self-center">
        <span className={live && expiresAt! - now < 3_600_000 ? "text-warn" : "text-slate-300"}>
          {expiresAt !== undefined ? (live ? countdown(expiresAt / 1000, now) : "settled") : "—"}
        </span>
      </div>

      <div className="hidden md:flex justify-end items-center">
        <span
          className="btn-primary btn-sm pointer-events-none transition-colors"
          aria-hidden="true"
        >
          Trade →
        </span>
      </div>
    </Link>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 h-7 rounded-md border text-[13px] font-medium whitespace-nowrap
                  transition-colors duration-150 select-none ${
                    active
                      ? "border-brand-500/40 bg-brand-500/10 text-brand-300"
                      : "border-line text-muted hover:text-slate-100 hover:border-line-strong"
                  }`}
    >
      {children}
    </button>
  );
}
