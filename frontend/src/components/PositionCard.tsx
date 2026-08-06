import { useAccount } from "wagmi";
import { usePosition } from "../hooks/usePosition";
import { fmtUnits } from "../lib/format";
import { MARKETS } from "../config/chain";
import { Stat } from "./Stat";

type MarketMeta = (typeof MARKETS)[number];

export function PositionCard({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data, isLoading } = usePosition(market.id, address);
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

  // A badge is a label, not a sentence. `.badge` is uppercase micro type with
  // letterspacing — the right treatment for one or two words and actively hostile
  // to "Collateral posted · no loan yet", which arrives as a wall of tracked-out
  // capitals. The role becomes short; the nuance moves to a caption where
  // sentence case can do its job.
  const { role, tone, note } =
    hasCredit && hasDebt
      ? { role: "Lender + borrower", tone: "badge-info",    note: "Supplying credit and carrying debt in this market." }
      : hasCredit
      ? { role: "Lender",            tone: "badge-ok",      note: "Your filled offer is earning fixed-rate credit." }
      : hasDebt && hasCollat
      ? { role: "Borrower",          tone: "badge-info",    note: "Collateralized loan outstanding until maturity." }
      : hasDebt
      ? { role: "Borrower",          tone: "badge-warn",    note: "Debt outstanding with no collateral posted." }
      : hasCollat
      ? { role: "Collateral posted", tone: "badge-neutral", note: "Ready to borrow — no loan taken yet." }
      : address
      ? { role: "No position",       tone: "badge-neutral", note: "Fill or sign an offer to open a position here." }
      : { role: "Not connected",     tone: "badge-neutral", note: "Connect a wallet to see your position." };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Your position</div>
          <div className="text-body-sm text-subtle mt-0.5">{note}</div>
        </div>
        <span className={`${tone} flex-shrink-0`}>{role}</span>
      </div>

      {/*
        All three values were previously coloured — green Credit, red Debt, amber
        Collateral. Colour is the strongest signal in a UI; spending it on all
        three cancels it out and leaves the row looking decorative rather than
        informative. Worse, green/red here read as gain/loss, but credit and debt
        are neutral facts about a position, not outcomes.

        Values are now neutral by default. Colour appears only when a figure is
        non-zero AND directional — debt you actually carry is worth flagging.
      */}
      <div className="card-body grid grid-cols-3 gap-x-6 gap-y-5">
        <Stat
          label="Credit"
          // Was `String(credit)` — a raw unscaled bigint, while Collateral in the
          // same row was correctly formatted. Two adjacent figures on different
          // scales is worse than either convention applied consistently.
          value={`${fmtUnits(credit, market.loanDecimals, 2)} ${market.loanSymbol}`}
          hint="Grows when your offer is filled"
          loading={isLoading}
        />
        <Stat
          label="Debt"
          value={`${fmtUnits(debt, market.loanDecimals, 2)} ${market.loanSymbol}`}
          tone={hasDebt ? "down" : "neutral"}
          hint="Grows when you fill a lender's offer"
          loading={isLoading}
        />
        <Stat
          label="Collateral"
          value={`${fmtUnits(collat, market.collateralDecimals, 4)} ${market.collateralSymbol}`}
          hint="Set by Post collateral"
          loading={isLoading}
        />
      </div>
    </div>
  );
}
