import { useParams, Link } from "react-router-dom";
import { MARKETS, EXPLORER, ADDRESSES } from "../config/chain";
import { MarketVitals } from "../components/MarketVitals";
import { PositionCard } from "../components/PositionCard";
import { ActionPanel } from "../components/ActionPanel";
import { OfferBook } from "../components/OfferBook";

export function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const market = MARKETS.find((m) => m.id === id) ?? MARKETS[0];

  return (
    <section className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/markets" className="link">← All markets</Link>
        <span className="text-subtle">/</span>
        <span className="text-slate-100 font-semibold">{market.name}</span>
      </div>

      <MarketVitals market={market} />
      <PositionCard market={market} />
      <OfferBook />
      <ActionPanel market={market} />

      <div className="card">
        <div className="card-header"><div className="card-title">Addresses</div></div>
        <div className="card-body grid md:grid-cols-2 gap-4 text-xs font-mono">
          <AddrRow label="Covenant core"   addr={ADDRESSES.covenant} />
          <AddrRow label="Chainlink oracle" addr={ADDRESSES.oracle} />
          <AddrRow label="Loan token (tUSDC)" addr={ADDRESSES.usdc} />
          <AddrRow label="Collateral (tWBTC)" addr={ADDRESSES.wbtc} />
          <AddrRow label="Compliance gate"    addr={ADDRESSES.gate} />
          <AddrRow label="Market id"          addr={market.id} isMarket />
        </div>
      </div>
    </section>
  );
}

function AddrRow({ label, addr, isMarket }:
  { label: string; addr: string; isMarket?: boolean }) {
  const href = isMarket
    ? `${EXPLORER}/address/${ADDRESSES.covenant}#readContract`
    : `${EXPLORER}/address/${addr}`;
  return (
    <div className="flex flex-col">
      <span className="text-muted text-[10px] tracking-widest uppercase font-sans font-semibold">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="link break-all">{addr}</a>
    </div>
  );
}
