import { Link } from "react-router-dom";
import { formatUnits } from "viem";
import { MARKETS } from "../config/chain";
import { useMarket, useMarketVitals } from "../hooks/useMarket";
import { useOraclePrice } from "../hooks/useOraclePrice";
import { daysUntil, isoDate } from "../lib/format";

type Market = (typeof MARKETS)[number];

export function MarketCard({ market }: { market: Market }) {
  const { data, isLoading } = useMarket(market.id);
  const { totalUnits, withdrawable } = useMarketVitals(market.id);
  const { usd } = useOraclePrice();

  const lltvPct = data ? (Number(formatUnits(data.collateralParams[0].lltv, 18)) * 100).toFixed(0) : "—";
  const days = data ? daysUntil(data.maturity) : "—";

  return (
    <Link
      to={`/markets/${market.id}`}
      className="card block hover:border-brand-500/50 transition group"
    >
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-warn/20 border border-warn/40 flex items-center justify-center text-[10px] font-bold text-warn">₿</div>
            <div className="w-8 h-8 rounded-full bg-ok/20 border border-ok/40 flex items-center justify-center text-[10px] font-bold text-ok">$</div>
          </div>
          <div>
            <div className="text-slate-100 font-semibold">{market.name}</div>
            <div className="text-xs text-subtle font-mono">{market.id.slice(0, 10)}…{market.id.slice(-8)}</div>
          </div>
        </div>
        <span className="badge-info">Compliance-gated</span>
      </div>
      <div className="card-body grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Oracle · BTC/USD" value={usd ? `$${Math.round(usd).toLocaleString()}` : "—"} />
        <Stat label="LLTV" value={`${lltvPct}%`} />
        <Stat label="Matures in" value={typeof days === "number" ? `${days} d` : "—"}
              hint={data ? isoDate(data.maturity) : ""} />
        <Stat label="Total credit" value={totalUnits.data !== undefined ? String(totalUnits.data) : "—"}
              hint={withdrawable.data !== undefined ? `${String(withdrawable.data)} withdrawable` : ""} />
      </div>
      <div className="px-5 py-3 border-t border-line flex justify-between items-center text-xs text-subtle">
        <span>{isLoading ? "loading…" : "Click to open market"}</span>
        <span className="text-brand-400 group-hover:translate-x-0.5 transition">→</span>
      </div>
    </Link>
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
