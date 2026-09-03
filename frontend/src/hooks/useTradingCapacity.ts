import { useAccount } from "wagmi";
import { useDreamDexPositions, useDreamDexQuoteBalance } from "./useDreamDex";
import { useEthosCredit } from "./useEthosScore";
import { fmtLoan, useCovenantPosition } from "./useCovenant";
import { CREDIT_DEPLOYED, tierForScore } from "../config/credit";

/**
 * The user's Covenant trading capacity — the number the whole product is
 * organized around, in one place.
 *
 * The model, stated plainly:
 *
 *   available  = spendable collateral in the wallet (TestUSDC)
 *              + undrawn credit at the wallet's Ethos tier (when deployed)
 *   inPositions = mark-to-market value locked in open Event Contracts
 *   total       = available + inPositions
 *
 * "Available" is what an order can actually spend right now — that is the
 * figure the header chip, the market panel, and the credit page all quote,
 * so they can never disagree with each other. Position value is tracked
 * separately so the capacity bar shows where the trader's capital stands:
 * ready versus working.
 *
 * Every surface renders from this hook (React Query dedupes the underlying
 * reads by key), which is what makes "how much can I trade?" a property of
 * the product rather than a per-page calculation.
 */
export function useTradingCapacity() {
  const { isConnected } = useAccount();
  const quote = useDreamDexQuoteBalance();
  const positions = useDreamDexPositions();
  const { data: ethos, tier } = useEthosCredit();
  const credit = useCovenantPosition(tierForScore(ethos?.score ?? 0));

  const availableCredit =
    CREDIT_DEPLOYED &&
    credit.maxDebt !== undefined &&
    credit.debt !== undefined &&
    credit.maxDebt > credit.debt
      ? Number(fmtLoan(credit.maxDebt - credit.debt))
      : 0;

  const available = (quote.formatted ?? 0) + availableCredit;

  /* markValue is RAW collateral, but quoteDecimals is PER-MARKET — a mixed
     6dp/18dp portfolio summed raw and formatted at one market's decimals
     totals garbage. Normalize each position before summing. */
  const inPositions =
    positions.data?.reduce(
      (acc, p) => acc + Number(p.markValue) / 10 ** p.market.quoteDecimals,
      0,
    ) ?? 0;

  return {
    isConnected,
    available,
    availableCredit,
    inPositions,
    total: available + inPositions,
    positionCount: positions.data?.length ?? 0,
    ethosScore: ethos?.score,
    tier,
    isLoading: quote.isLoading || positions.isLoading,
  };
}
