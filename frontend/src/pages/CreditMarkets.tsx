import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { CREDIT_TOKENS, tierForScore, type TierKey } from "../config/credit";
import { displayLoan, useProtocolStats } from "../hooks/useCovenant";
import { useEthosCredit } from "../hooks/useEthosScore";
import { CapitalModal } from "../components/CapitalModal";
import { MATURITY_LABEL, MarketsTable, StatStrip, daysToMaturity } from "../components/lending";

/** Mezo credit markets: one isolated BTC → MUSD market per Ethos tier. */
export function CreditMarkets() {
  const { isConnected } = useAccount();
  const { data } = useEthosCredit();
  const yourTier = isConnected && data ? tierForScore(data.score) : undefined;
  const stats = useProtocolStats();
  const [borrowTier, setBorrowTier] = useState<TierKey | null>(null);
  const loan = CREDIT_TOKENS.loan.symbol;

  return (
    <section className="shell py-10 lg:py-12 space-y-8">
      <header className="max-w-2xl">
        <div className="section-label text-brand-500">Markets</div>
        <h1 className="mt-2 text-h2 text-slate-50">BTC-backed {loan} markets</h1>
        <p className="mt-3 text-body text-muted leading-relaxed">
          Three isolated, fixed-rate markets that share one collateral asset and one loan asset. Each
          market's Ethos gate and LLTV are hashed into its id, so terms cannot change after creation.
        </p>
      </header>

      <StatStrip
        items={[
          {
            label: "Available liquidity",
            value: stats.totalLiquidity === undefined ? "…" : `${displayLoan(stats.totalLiquidity, 0)} ${loan}`,
          },
          {
            label: "Total borrowed",
            value: stats.totalBorrowed === undefined ? "…" : `${displayLoan(stats.totalBorrowed, 0)} ${loan}`,
          },
          {
            label: "Total lent",
            value: stats.totalSupplied === undefined ? "…" : `${displayLoan(stats.totalSupplied, 0)} ${loan}`,
          },
          {
            label: "BTC oracle",
            value: stats.price === undefined ? "…" : `$${stats.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          },
          { label: "Maturity", value: MATURITY_LABEL, sub: `${daysToMaturity()} days` },
        ]}
      />

      <MarketsTable stats={stats.markets} yourTier={yourTier} onBorrow={setBorrowTier} />

      <div className="grid md:grid-cols-3 gap-4 text-body-sm">
        <Note title="Liquidity">
          The house lender's {loan} plus every open lender offer. Anyone can supply {loan} from a market page.
        </Note>
        <Note title="Fixed terms">
          You repay exactly what you borrowed at or before {MATURITY_LABEL}. There is no floating rate to watch.
        </Note>
        <Note title="Exits are never gated">
          Repaying and withdrawing collateral do not check your Ethos score. Manage loans from{" "}
          <Link to="/positions" className="link">Positions</Link>.
        </Note>
      </div>

      {borrowTier && <CapitalModal market={borrowTier} onClose={() => setBorrowTier(null)} />}
    </section>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-body-sm font-semibold text-slate-100">{title}</div>
      <p className="mt-1 text-subtle leading-relaxed">{children}</p>
    </div>
  );
}
