import { useAccount } from "wagmi";
import { usePosition } from "../hooks/usePosition";
import { useMarketTokens } from "../hooks/useMarket";
import { fmtUnits } from "../lib/format";
import { MARKETS } from "../config/chain";
import { Stat } from "./Stat";

type MarketMeta = (typeof MARKETS)[number];

/**
 * A wallet's position in one market.
 *
 * The rule this card is built around: **a value that could not be read is never
 * rendered as zero.** `usePosition` returns `undefined` for a failed read and a
 * real `0n` when the chain says zero, and the two are kept apart all the way to
 * the screen — the figure becomes `unavailable` and the badge says so. Collapsing
 * them is what made a dropped RPC call look like an empty position, which is the
 * worst outcome available, because the user has no way to tell it from the truth.
 *
 * Collateral is rendered per activated index using that index's own decimals.
 * There is no cross-token total on purpose: base units of different tokens do not
 * add, so a "total collateral" figure across a multi-collateral market would be a
 * number with no unit.
 */
export function PositionCard({ market }: { market: MarketMeta }) {
  const { address } = useAccount();
  const { data, isLoading, isError } = usePosition(market.id, address);
  const { collaterals: tokens, loan } = useMarketTokens(market.id);

  const { credit, debt, pendingFee, collaterals, anyCollateral, creditIsLive } = data;

  const hasCredit = credit !== undefined && credit > 0n;
  const hasDebt = debt !== undefined && debt > 0n;
  const hasCollat = anyCollateral === true;

  // Nothing came back at all: not an empty position, an unanswered question.
  const blind =
    credit === undefined && debt === undefined && anyCollateral === undefined;

  const held = collaterals.filter((c) => c.amount > 0n);

  const tokenAt = (index: number) =>
    tokens[index] ?? {
      symbol: market.collateralSymbol,
      decimals: market.collateralDecimals,
    };

  const fmtHolding = (c: { index: number; amount: bigint }) => {
    const t = tokenAt(c.index);
    return `${fmtUnits(c.amount, t.decimals, 4)} ${t.symbol}`;
  };

  // A badge is a label, not a sentence: `.badge` is uppercase micro type with
  // letterspacing, which turns anything longer than two words into a wall of
  // tracked-out capitals. The role stays short and the nuance moves to the note.
  const { role, tone, note } = !address
    ? { role: "Not connected", tone: "badge-neutral", note: "Connect a wallet to see your position." }
    : blind
    ? { role: "Unavailable", tone: "badge-warn", note: "Your position could not be read from the chain. Figures are withheld rather than shown as zero." }
    : hasCredit && hasDebt
    ? { role: "Lender + borrower", tone: "badge-info", note: "Supplying credit and carrying debt in this market." }
    : hasCredit
    ? { role: "Lender", tone: "badge-ok", note: "Your filled offer is earning fixed-rate credit." }
    : hasDebt && hasCollat
    ? { role: "Borrower", tone: "badge-info", note: "Collateralized loan outstanding until maturity." }
    : hasDebt
    ? { role: "Borrower", tone: "badge-warn", note: "Debt outstanding with no collateral posted." }
    : hasCollat
    ? { role: "Collateral posted", tone: "badge-neutral", note: "Ready to borrow — no loan taken yet." }
    : isError
    ? { role: "Partially read", tone: "badge-warn", note: "Some values could not be read. What is shown is confirmed; the rest is marked unavailable." }
    : { role: "No position", tone: "badge-neutral", note: "Fill or sign an offer to open a position here." };

  const creditHint = !hasCredit
    ? "Grows when your offer is filled"
    : !creditIsLive
    ? "Checkpoint only — fee and loss adjustments not applied"
    : pendingFee !== undefined && pendingFee > 0n
    ? `After ${fmtUnits(pendingFee, loan.decimals, 2)} ${loan.symbol} pending fee`
    : "Withdrawable claim, after fees and losses";

  const collateralValue =
    held.length === 0
      ? `${fmtUnits(0n, tokenAt(0).decimals, 4)} ${tokenAt(0).symbol}`
      : held.length === 1
      ? fmtHolding(held[0])
      : `${held.length} assets`;

  const collateralHint =
    held.length > 1
      ? "Across several collateral indices — listed below"
      : held.length === 1 && tokens.length > 1
      ? `At index ${held[0].index} of ${tokens.length}`
      : "Set by Post collateral";

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
        Colour is the strongest signal available, so it is spent on one thing.
        All three figures used to be tinted — green Credit, red Debt, amber
        Collateral — which cancels out to decoration, and green/red additionally
        read as gain/loss when credit and debt are neutral facts about a position.
      */}
      <div className="card-body grid grid-cols-3 gap-x-6 gap-y-5">
        <Stat
          label="Credit"
          value={`${fmtUnits(credit, loan.decimals, 2)} ${loan.symbol}`}
          hint={creditHint}
          loading={isLoading}
          error={credit === undefined}
          errorHint="Neither position() nor updatePositionView() answered for this market."
        />
        <Stat
          label="Debt"
          value={`${fmtUnits(debt, loan.decimals, 2)} ${loan.symbol}`}
          tone={hasDebt ? "down" : "neutral"}
          hint="Grows when you fill a lender's offer"
          loading={isLoading}
          error={debt === undefined}
          errorHint="position() did not answer for this market."
        />
        <Stat
          label="Collateral"
          value={collateralValue}
          hint={collateralHint}
          loading={isLoading}
          error={anyCollateral === undefined}
          errorHint="An activated collateral index could not be read, so the amount is withheld rather than under-reported."
        />
      </div>

      {held.length > 1 && (
        <div className="border-t border-line px-6 py-4">
          <div className="stat-label mb-2">Collateral by index</div>
          <div className="flex flex-col gap-1">
            {held.map((c) => (
              <div key={c.index} className="flex justify-between text-body-sm">
                <span className="text-subtle">
                  {tokenAt(c.index).symbol}
                  <span className="text-subtle/60"> · index {c.index}</span>
                </span>
                <span className="font-mono">{fmtHolding(c)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasCredit && !creditIsLive && (
        <div className="border-t border-line px-6 py-4 text-body-sm text-warn/80">
          Credit shown is the stored checkpoint. The adjusting read failed, so
          bad-debt slashing and accrued fees are not reflected — treat it as an
          upper bound on what you can withdraw, not a balance.
        </div>
      )}
    </div>
  );
}
