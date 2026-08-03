import { formatUnits } from "viem";
import { MARKETS, ADDRESSES, EXPLORER } from "../config/chain";
import { useMarket } from "../hooks/useMarket";
import { useOraclePrice } from "../hooks/useOraclePrice";
import { daysUntil, isoDate, shortAddr } from "../lib/format";

type MarketMeta = (typeof MARKETS)[number];

export function MarketVitals({ market }: { market: MarketMeta }) {
  const { data } = useMarket(market.id);
  const { usd, staleSec } = useOraclePrice();

  const lltvPct = data ? (Number(formatUnits(data.collateralParams[0].lltv, 18)) * 100).toFixed(1) : "—";

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Market vitals</div>
        <a href={`${EXPLORER}/address/${ADDRESSES.covenant}`}
           target="_blank" rel="noreferrer" className="badge-ok">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          Live on {EXPLORER.split("//")[1]?.replace(/\/.*/, "")}
        </a>
      </div>
      <div className="card-body grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Oracle · BTC/USD"
              value={usd ? `$${Math.round(usd).toLocaleString()}` : "—"}
              hint={staleSec !== undefined ? `updated ${humanAge(staleSec)}` : ""} />
        <Stat label="LLTV" value={`${lltvPct}%`} />
        <Stat label="Matures in" value={data ? `${daysUntil(data.maturity)} d` : "—"}
              hint={data ? isoDate(data.maturity) : ""} />
        <Stat label="Compliance gate"
              value={data ? shortAddr(data.entryGate) : "—"}
              hint="whitelisted via covenant.setApprovedGate" />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function humanAge(sec: number) {
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
