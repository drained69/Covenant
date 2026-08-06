import { EXPLORER } from "../config/chain";
import type { MarketToken } from "../hooks/useMarket";
import { shortAddr } from "../lib/format";
import { TokenMark, IconExternal } from "./icons";

/**
 * States which token fills which role in a market, in words.
 *
 * The markets UI used to leave this to inference — an amber mark before a green
 * one, and a pair title where collateral happens to come first. That reads fine
 * to someone who already knows the convention and not at all to anyone else,
 * and it silently breaks for any market that inverts the pair. These rows say
 * "Collateral token" and "Loan token" outright and take their values from the
 * on-chain market struct, so the label and the deployment cannot disagree.
 *
 * `compact` drops the address line for dense grids (the market list card),
 * where the symbol and role carry the meaning and the address is a detail the
 * user can get one click away.
 */
export function TokenRole({
  token,
  tone,
  compact = false,
  loading = false,
}: {
  token: MarketToken;
  tone: "warn" | "ok";
  compact?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="skeleton h-7 w-7 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-4 w-16 mt-1.5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <TokenMark symbol={token.symbol.replace(/^t/, "")} tone={tone} />
      <div className="min-w-0">
        <div className="stat-label">{token.role}</div>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-body font-semibold text-slate-100 truncate">{token.symbol}</span>
          {!compact && (
            <a
              href={`${EXPLORER}/address/${token.address}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="link inline-flex items-center gap-1 font-mono text-micro"
            >
              {shortAddr(token.address)}
              <IconExternal className="w-3 h-3 opacity-60" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Both roles side by side. Collateral first because that is what a borrower
 * has to hand over, and it is the half users most often get wrong.
 */
export function MarketTokenRoles({
  collateral,
  loan,
  compact = false,
  loading = false,
}: {
  collateral: MarketToken;
  loan: MarketToken;
  compact?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
      <TokenRole token={collateral} tone="warn" compact={compact} loading={loading} />
      <TokenRole token={loan} tone="ok" compact={compact} loading={loading} />
    </div>
  );
}
