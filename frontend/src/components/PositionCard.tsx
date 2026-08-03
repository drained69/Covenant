import { useAccount } from "wagmi";
import { usePosition } from "../hooks/usePosition";
import { fmtUnits } from "../lib/format";
import { MARKETS } from "../config/chain";

type MarketMeta = (typeof MARKETS)[number];

export function PositionCard({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data } = usePosition(market.id, address);
  const credit = data?.[0]?.result as bigint | undefined;
  const debt   = data?.[1]?.result as bigint | undefined;
  const collat = data?.[2]?.result as bigint | undefined;

  // Badge reflects EVERY position component, not just credit/debt. A wallet with
  // collateral but no loan is still a real position — it's a borrower who hasn't
  // borrowed yet. The previous "No position" label misled users who had just
  // deposited collateral into thinking their tx didn't work.
  const hasCredit = !!credit && credit > 0n;
  const hasDebt   = !!debt   && debt   > 0n;
  const hasCollat = !!collat && collat > 0n;
  const role =
    hasCredit && hasDebt         ? "Lender + Borrower"
    : hasCredit                  ? "Lender"
    : hasDebt && hasCollat       ? "Borrower"
    : hasDebt                    ? "Borrower · uncollateralized"
    : hasCollat                  ? "Collateral posted · no loan yet"
    : address                    ? "No position"
                                 : "—";

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Your position</div>
        <span className="badge-info">{role}</span>
      </div>
      <div className="card-body grid grid-cols-3 gap-6">
        <Row label="Credit"     value={credit !== undefined ? String(credit) : "—"}  color="text-ok"
             hint="Grows when a lender's offer is filled" />
        <Row label="Debt"       value={debt   !== undefined ? String(debt)   : "—"}  color="text-bad"
             hint="Grows when you fill a lender's offer" />
        <Row label="Collateral" value={fmtUnits(collat, market.collateralDecimals)}
             color="text-warn" hint={`${market.collateralSymbol} — set by Post collateral`} />
      </div>
    </div>
  );
}

function Row({ label, value, color, hint }:
  { label: string; value: string; color: string; hint?: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
