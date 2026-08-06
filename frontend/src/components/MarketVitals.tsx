import { formatUnits } from "viem";
import { MARKETS, ADDRESSES, EXPLORER } from "../config/chain";
import { useMarket, useMarketTokens } from "../hooks/useMarket";
import { useOraclePrice } from "../hooks/useOraclePrice";
import { daysUntil, isoDate, shortAddr, humanAge, hostOf, fmtUsd } from "../lib/format";
import { Stat } from "./Stat";
import { MarketTokenRoles } from "./TokenRole";
import { IconExternal } from "./icons";

type MarketMeta = (typeof MARKETS)[number];

export function MarketVitals({ market }: { market: MarketMeta }) {
  const { data, isLoading } = useMarket(market.id);
  const { collateral, loan, isLoading: tokensLoading } = useMarketTokens(market.id);
  const { usd, staleSec } = useOraclePrice();

  const lltvPct = data
    ? `${(Number(formatUnits(data.collateralParams[0].lltv, 18)) * 100).toFixed(1)}%`
    : undefined;

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
        The token roles lead, above the metrics, because every figure below is
        denominated in one of them — an LLTV or an oracle price means nothing
        until you know which asset you post and which you owe. The addresses are
        shown here (unlike on the list card) since this is the page where a user
        verifies they're looking at the token they think they are.
      */}
      <div className="px-5 py-4 border-b border-line bg-white/[0.015]">
        <MarketTokenRoles collateral={collateral} loan={loan} loading={tokensLoading} />
      </div>

      <div className="card-body grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        <Stat
          label={`Oracle · ${collateral.symbol}/USD`}
          value={usd ? fmtUsd(usd) : undefined}
          hint={staleSec !== undefined ? `Updated ${humanAge(staleSec)}` : undefined}
          loading={usd === undefined}
        />
        <Stat
          label="LLTV"
          value={lltvPct}
          hint={
            !tokensLoading
              ? `Max ${loan.symbol} debt per ${collateral.symbol} posted`
              : undefined
          }
          loading={isLoading}
        />
        <Stat
          label="Matures in"
          value={data ? `${daysUntil(data.maturity)}d` : undefined}
          hint={data ? isoDate(data.maturity) : undefined}
          loading={isLoading}
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
          label="Compliance gate"
          value={data ? shortAddr(data.entryGate) : undefined}
          hint="Whitelisted by protocol governance"
          mono
          loading={isLoading}
        />
      </div>
    </div>
  );
}
