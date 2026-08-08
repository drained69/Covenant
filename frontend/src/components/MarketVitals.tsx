import { formatUnits } from "viem";
import { MARKETS, ADDRESSES, EXPLORER } from "../config/chain";
import {
  useMarket,
  useMarketVitals,
  useMarketTokens,
  settlementFeePct,
  continuousFeeAprPct,
  lossPct,
} from "../hooks/useMarket";
import { useOraclePrice } from "../hooks/useOraclePrice";
import {
  daysUntil,
  isoDate,
  shortAddr,
  humanAge,
  hostOf,
  fmtUsd,
  fmtUnits,
} from "../lib/format";
import { Stat } from "./Stat";
import { MarketTokenRoles } from "./TokenRole";
import { IconExternal } from "./icons";

type MarketMeta = (typeof MARKETS)[number];

/**
 * The market's own state, on the page where a user commits to it.
 *
 * Until now this component was named for vitals it never read: it called
 * `useMarket` for the immutable struct and showed four contract terms, so the
 * detail page could tell you the LLTV and the maturity but not how much credit
 * existed, how much of it was withdrawable, whether lenders had been written
 * down for bad debt, or what a fill would cost. Every one of those lives in
 * `marketState`, and the list card was already showing some of them — so the
 * summary tile knew more about a market than the page you opened to inspect it.
 *
 * The card is now two ranked zones, because the two kinds of fact behave
 * differently and should not be read as one undifferentiated grid:
 *
 *   Contract terms   fixed at creation, cannot change for this id
 *   Live state       moves every block, on the same clock as the position below
 *
 * `useMarketVitals` shares `LIVE_QUERY` and per-block invalidation with
 * `usePosition`, so the totals here and the user's own credit in `PositionCard`
 * advance together after a fill instead of disagreeing on screen.
 */
export function MarketVitals({ market }: { market: MarketMeta }) {
  const { data, isLoading, isError } = useMarket(market.id);
  const { data: vitals, isLoading: vitalsLoading } = useMarketVitals(market.id);
  const { collateral, loan, isLoading: tokensLoading } = useMarketTokens(market.id);
  const { usd, staleSec } = useOraclePrice();

  const lltvPct = data
    ? `${(Number(formatUnits(data.collateralParams[0].lltv, 18)) * 100).toFixed(1)}%`
    : undefined;

  // `daysUntil` floors at 0, which is right for display and wrong for the fee
  // interpolation — the raw remaining seconds are what selects the tier, and a
  // matured market has no fill to price at all.
  const ttmSec = data ? Number(data.maturity) - Math.floor(Date.now() / 1000) : undefined;
  const matured = ttmSec !== undefined && ttmSec <= 0;

  const settlePct =
    ttmSec !== undefined && !matured
      ? settlementFeePct(vitals.settlementFeeCbp, ttmSec)
      : undefined;
  const contPct = continuousFeeAprPct(vitals.continuousFee);
  const writtenDown = lossPct(vitals.lossFactor);

  const stateHint = "This value could not be read from the chain.";

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Market vitals</div>

        {/*
          This was `<a className="badge-ok">` — a badge doing a link's job. Badges
          are non-interactive status labels; giving one a click target with no
          hover, no cursor affordance, and no external-link cue means the single
          most useful escape hatch on the page is invisible. It's now a proper
          link with an explicit icon, and the live/status semantic stays as a dot.
        */}
        <a
          href={`${EXPLORER}/address/${ADDRESSES.covenant}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 -mr-1 text-body-sm
                     text-slate-300 transition-colors hover:text-slate-50 hover:bg-white/[0.05]"
        >
          <span className="status-dot-ok" />
          <span className="hidden sm:inline">Live on {hostOf(EXPLORER)}</span>
          <span className="sm:hidden">Live</span>
          <IconExternal className="w-3.5 h-3.5 opacity-60" />
        </a>
      </div>

      {/*
        `tickSpacing === 0` is the protocol's own "no market behind this id"
        predicate — every entry point reverts `MarketNotCreated` on it. Without
        this, a config entry pointing at an uncreated market renders as a live
        market that happens to hold zero credit, and the action panel below
        invites a transaction that cannot succeed.
      */}
      {vitals.exists === false && (
        <div className="px-6 py-3 border-b border-line bg-warn/[0.06] text-body-sm text-warn/90">
          No market exists behind this id yet — the protocol reports it as not
          created. Offers and fills will revert until it is initialised.
        </div>
      )}

      {/*
        The token roles lead, above the metrics, because every figure below is
        denominated in one of them — an LLTV or an oracle price means nothing
        until you know which asset you post and which you owe. The addresses are
        shown here (unlike on the list card) since this is the page where a user
        verifies they're looking at the token they think they are.
      */}
      <div className="px-5 py-4 border-b border-line bg-white/[0.015]">
        <MarketTokenRoles collateral={collateral} loan={loan} loading={tokensLoading} />
      </div>

      {/* ── Contract terms ────────────────────────────────────────────── */}
      <div className="card-body">
        <div className="section-label">Contract terms</div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <Stat
            label={`Oracle · ${collateral.symbol}/USD`}
            value={usd ? fmtUsd(usd) : undefined}
            hint={staleSec !== undefined ? `Updated ${humanAge(staleSec)}` : undefined}
            loading={usd === undefined}
          />
          {/*
            Every term below comes from one `toMarket` call, so they share one
            failure: if the struct did not answer, none of them are known. They
            said "—" before, which is the same thing this card prints for a
            legitimate zero — a dropped RPC call read as a confident fact.
          */}
          <Stat
            label="LLTV"
            value={lltvPct}
            hint={
              !tokensLoading
                ? `Max ${loan.symbol} debt per ${collateral.symbol} posted`
                : undefined
            }
            loading={isLoading}
            error={isError}
            errorHint="The market's parameters could not be read from the chain."
          />
          <Stat
            label="Matures in"
            value={data ? (matured ? "Matured" : `${daysUntil(data.maturity)}d`) : undefined}
            hint={data ? isoDate(data.maturity) : undefined}
            loading={isLoading}
            error={isError}
            errorHint="The market's parameters could not be read from the chain."
          />
          {/*
            The gate address was rendered at `.stat-value` weight — 20px semibold,
            the same treatment as the oracle price. An address is an identifier, not
            a measurement; giving it the heaviest type in the row made the least
            scannable item the most prominent one. `mono` drops it to a size that
            sits alongside figures without competing with them.

            The hint was `whitelisted via covenant.setApprovedGate` — a raw Solidity
            function name shown to a user who will never call it.
          */}
          <Stat
            label="Entry gate"
            value={data ? shortAddr(data.entryGate) : undefined}
            hint="Compliance check run on every fill"
            mono
            loading={isLoading}
            error={isError}
            errorHint="The market's parameters could not be read from the chain."
          />
        </div>
      </div>

      {/* ── Live state ────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-5 border-t border-line">
        <div className="section-label">Live state</div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          {/*
            `totalUnits` and `withdrawable` arrive from a single `marketState`
            call, so the share below is a fact about one block rather than an
            artifact of two reads racing.
          */}
          <Stat
            label="Total credit"
            value={
              vitals.totalUnits !== undefined
                ? `${fmtUnits(vitals.totalUnits, loan.decimals, 2)} ${loan.symbol}`
                : undefined
            }
            hint="Lender credit outstanding in this market"
            loading={vitalsLoading}
            error={!vitalsLoading && vitals.totalUnits === undefined}
            errorHint={stateHint}
          />
          <Stat
            label="Withdrawable"
            value={
              vitals.withdrawable !== undefined
                ? `${fmtUnits(vitals.withdrawable, loan.decimals, 2)} ${loan.symbol}`
                : undefined
            }
            hint={
              vitals.withdrawablePct !== undefined
                ? `${vitals.withdrawablePct.toFixed(0)}% of total — the rest is lent out`
                : "Credit not currently lent out"
            }
            loading={vitalsLoading}
            error={!vitalsLoading && vitals.withdrawable === undefined}
            errorHint={stateHint}
          />
          {/*
            One number, not seven. `settlementFeeCbp` is seven tier values and the
            protocol interpolates between the two that bracket this market's
            remaining tenor, so quoting a single tier would misstate the cost for
            every market not sitting exactly on a breakpoint.
          */}
          <Stat
            label="Settlement fee"
            value={settlePct !== undefined ? `${settlePct.toFixed(3)}%` : undefined}
            hint={
              matured
                ? "Market has matured — no further fills"
                : ttmSec !== undefined
                  ? `Spread added to the buyer's price · ${Math.max(0, Math.floor(ttmSec / 86_400))}d tenor`
                  : "Spread added to the buyer's price at fill"
            }
            loading={vitalsLoading || isLoading}
            error={
              !vitalsLoading &&
              !isLoading &&
              !matured &&
              vitals.settlementFeeCbp === undefined
            }
            errorHint={stateHint}
          />
          {/*
            `continuousFee` is a per-SECOND rate; shown here annualised, which is
            the only form a lender can compare against anything else.
          */}
          <Stat
            label="Continuous fee"
            value={contPct !== undefined ? `${contPct.toFixed(2)}% / yr` : undefined}
            hint="Accrues out of lender credit until maturity"
            loading={vitalsLoading}
            error={!vitalsLoading && vitals.continuousFee === undefined}
            errorHint={stateHint}
          />
        </div>

        {/*
          A non-zero loss factor means lender credit here has been written down
          for bad debt. It is the single most consequential fact a lender can
          learn about a market, and until `marketState` was read as one call the
          detail page had no way to show it at any price.
        */}
        {vitals.hasLosses && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-warn/25 bg-warn/[0.06] px-3 py-2.5 text-body-sm text-warn/90">
            <span className="status-dot-warn mt-1.5 flex-shrink-0" />
            <span>
              Bad debt has been socialised in this market — lender credit is
              written down by{" "}
              <span className="tabular-nums font-medium">
                {writtenDown !== undefined ? `${writtenDown.toFixed(2)}%` : "an unread amount"}
              </span>{" "}
              cumulatively. Your own balance already reflects this.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
