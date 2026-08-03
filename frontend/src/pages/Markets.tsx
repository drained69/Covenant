import { Hero } from "../components/Hero";
import { MarketCard } from "../components/MarketCard";
import { MARKETS } from "../config/chain";

export function Markets() {
  return (
    <>
      <Hero />
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-semibold">Available markets</h2>
          <span className="text-sm text-muted">{MARKETS.length} active</span>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {MARKETS.map((m) => <MarketCard key={m.id} market={m} />)}
        </div>
      </section>
    </>
  );
}
