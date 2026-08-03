import { useAccount } from "wagmi";
import { Link } from "react-router-dom";
import { MARKETS } from "../config/chain";
import { PositionCard } from "../components/PositionCard";

export function Positions() {
  const { isConnected } = useAccount();
  return (
    <section className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <h2 className="text-2xl font-semibold">Your positions</h2>
      {!isConnected && (
        <div className="card"><div className="card-body text-muted">
          Connect a wallet to see your credit, debt, and collateral across every market.
        </div></div>
      )}
      {isConnected && MARKETS.map((m) => (
        <div key={m.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{m.name}</div>
            <Link to={`/markets/${m.id}`} className="link text-xs">Open →</Link>
          </div>
          <PositionCard market={m} />
        </div>
      ))}
    </section>
  );
}
