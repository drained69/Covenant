import { Link } from "react-router-dom";
import { formatUnits } from "viem";
import { MARKETS } from "../config/chain";
import { useMarket, useMarketVitals, useMarketTokens } from "../hooks/useMarket";
import { useOraclePrice } from "../hooks/useOraclePrice";
import { daysUntil, isoDate, fmtUnits, fmtUsd } from "../lib/format";
import { TokenMark, IconArrowRight, IconShield } from "./icons";

type Market = (typeof MARKETS)[number];

/**
 * A market as an institutional credit instrument, not a dashboard tile.
 *
 * The previous card was four equal `Stat` blocks in a 2×2 grid between a header
 * and a footer. Four metrics at identical size is a specification sheet: it
 * tells you everything at once and therefore ranks nothing, so choosing between
 * markets meant reading eight labels and values in full. Modern Treasury and
 * Fireblocks solve this the way a term sheet does — one figure carries the
 * instrument's size, everything else is a terms ledger read label-left /
 * value-right, and status lives in the frame rather than the content.
 *
 * So the card is now three ranked zones separated by rules:
 *
 *   Identity   pair, instrument id, lifecycle state
 *   Size       total credit as the single large figure, with the withdrawable
 *              share shown as a meter beneath it
 *   Terms      LLTV, maturity, oracle — a ledger, not a grid
 *
 * plus a footer that carries the compliance attribute and the click affordance.
 */
export function MarketCard({ market }: { market: Market }) {
  const { data, isLoading } = useMarket(market.id);
  const { totalUnits, withdrawable } = useMarketVitals(market.id);
  const { collateral, loan } = useMarketTokens(market.id);
  const { usd } = useOraclePrice();

  const lltvPct = data
    ? `${(Number(formatUnits(data.collateralParams[0].lltv, 18)) * 100).toFixed(0)}%`
    : undefined;

  const days = data ? daysUntil(data.maturity) : undefined;
  // A matured market is a different instrument state, not a negative number of
  // days. The old card would have rendered "-3d" past maturity and still shown
  // "Open for fills" underneath it.
  const matured = days !== undefined && days <= 0;

  /*
    Withdrawable as a share of total credit, in basis points, computed in bigint
    so a large 18-decimal supply doesn't lose precision through a float. Guarded
    on `> 0n` because an empty market divides by zero, and clamped because the
    two reads are separate calls that can land a block apart.
  */
  const total = totalUnits.data;
  const avail = withdrawable.data;
  const availPct =
    total !== undefined && avail !== undefined && total > 0n
      ? Math.min(100, Math.max(0, Number((avail * 10_000n) / total) / 100))
      : undefined;

  // The configured `name` packs pair, tenor, and attribute into one string
  // ("tWBTC / tUSDC · 90-day · compliance-gated"). A title should be a name, not
  // a specification — tenor belongs with the maturity metric and the compliance
  // attribute belongs in the footer, where both are already shown.
  const [pair] = market.name.split("·").map((s) => s.trim());

  return (
    <Link
      to={`/markets/${market.id}`}
      className="card-interactive group block focus-visible:outline-none"
    >
      {/* ── Identity ──────────────────────────────────────────────────── */}
      <div className="card-header">
        <div className="flex items-center gap-3 min-w-0">
          {/* Overlapping token marks read as a pair. Symbol-derived rather than
              hardcoded glyphs, so they stay correct as markets are added. */}
          <div className="flex -space-x-1.5">
            <TokenMark symbol={collateral.symbol.replace(/^t/, "")} tone="warn" />
            <TokenMark symbol={loan.symbol.replace(/^t/, "")} tone="ok" />
          </div>
          <div className="min-w-0">
            <div className="card-title truncate">{pair}</div>
            {/* An instrument needs an identifier. Mono, `subtle`, one line. */}
            <div className="text-micro font-mono text-subtle mt-0.5 truncate">
              {market.id.slice(0, 10)}…{market.id.slice(-8)}
            </div>
          </div>
        </div>

        {/*
          A neutral chip with a coloured dot, not a coloured chip. Two filled
          status badges (the old `badge-ok "Compliance-gated"` here plus the
          green dot in the footer) meant the card asserted its status twice in
          two different visual languages. State belongs in the header; the
          durable product attribute moved to the footer as a trust mark.
        */}
        <span className="badge-neutral flex-shrink-0">
          <span className={matured ? "status-dot-warn" : "status-dot-ok"} />
          {matured ? "Matured" : "Open"}
        </span>
      </div>

      {/* ── Size ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-5">
        <div className="section-label">Total credit</div>

        {totalUnits.isLoading ? (
          <div className="skeleton mt-2 h-8 w-48" />
        ) : (
          /*
            One figure, one rank. At `h2` this outranks every other number on
            the card by a full step, so the eye lands on market size first and
            reads the terms only after it has decided the market is worth
            considering. The unit is a separate, subdued element — you read
            "how much" before "of what".
          */
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-h2 text-white tabular-nums">
              {fmtUnits(total, loan.decimals, 2)}
            </span>
            <span className="text-body-sm font-medium text-subtle">{loan.symbol}</span>
          </div>
        )}

        {/*
          The withdrawable share as a meter. This was previously a `hint` line
          under a stat — a bare second number the reader had to divide by the
          first to make sense of. A 4px track states the proportion without
          arithmetic. Neutral fill, no gradient: it is a quantity, and the brand
          accent is reserved for things you can click.
        */}
        {availPct !== undefined && (
          <div className="mt-4">
            <div
              className="h-1 rounded-full bg-white/[0.06] overflow-hidden"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-slate-300/60 transition-[width] duration-500 ease-out"
                style={{ width: `${availPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-4 text-body-sm">
              <span className="text-muted tabular-nums truncate">
                {fmtUnits(avail, loan.decimals, 2)} {loan.symbol} withdrawable
              </span>
              <span className="text-subtle tabular-nums flex-shrink-0">
                {availPct.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Terms ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-5 border-t border-line">
        <div className="section-label">Terms</div>
        <div className="mt-1">
          <Term label="Max LTV" value={lltvPct} loading={isLoading} />
          <Term
            label="Maturity"
            value={data ? isoDate(data.maturity) : undefined}
            sub={matured ? "matured" : days !== undefined ? `${days}d` : undefined}
            loading={isLoading}
          />
          <Term
            label={`Oracle · ${collateral.symbol}`}
            value={usd ? fmtUsd(usd) : undefined}
            loading={usd === undefined}
          />
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="card-footer">
        <span className="inline-flex items-center gap-2 min-w-0">
          <IconShield className="w-3.5 h-3.5 flex-shrink-0 text-ok" />
          <span className="truncate">Compliance-gated settlement</span>
        </span>
        {/* Click affordance: the accent and the 2px nudge both arrive on hover
            of the whole card, so the entire surface reads as one target rather
            than a card containing a link. */}
        <span className="inline-flex items-center gap-1.5 flex-shrink-0 font-medium text-slate-300 transition-colors group-hover:text-brand-300">
          View market
          <IconArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/**
 * One row of the terms ledger.
 *
 * `sub` is a qualifier that belongs to the value but must not compete with it —
 * "2026-11-03 · 90d" reads as one fact where two stacked metrics read as two.
 */
function Term({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value?: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="def-row">
      <span className="def-label">{label}</span>
      {loading ? (
        <span className="skeleton h-4 w-24 self-center" />
      ) : (
        <span className="def-value">
          {value ?? "—"}
          {sub && <span className="ml-2 font-normal text-subtle">· {sub}</span>}
        </span>
      )}
    </div>
  );
}
