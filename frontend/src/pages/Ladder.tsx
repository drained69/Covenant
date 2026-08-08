import { useAccount } from "wagmi";
import { useState } from "react";
import { useLadder } from "../hooks/useLadder";
import { useCompliance } from "../hooks/useCompliance";
import { IconLayers, IconShield, IconLock, IconCheck, IconAlert, TokenMark } from "../components/icons";

/** tUSDC has 6 decimals. Parses display text to base units, or null if unusable. */
function parseBorrow(text: string): bigint | null {
  const n = Number(text);
  // Rejects "", "abc" (NaN), "1e999" (Infinity), and negatives. Without this guard
  // BigInt(Math.floor(NaN)) and BigInt(Infinity) both throw RangeError and blank the page.
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.floor(n * 1e6));
}

export function Ladder() {
  const { address, isConnected } = useAccount();

  // The raw text is the source of truth, not the bigint: a controlled numeric input driven by
  // `Number(bigint) / 1e6` erases the trailing separator the moment you type "1000." and makes
  // the field feel broken. The bigint is derived, and only when the text parses.
  const [borrowText, setBorrowText] = useState("100000");
  const parsed = parseBorrow(borrowText);
  const borrowAmount = parsed ?? 0n;

  const { deployed, loading, resolved, rungs, best, next } = useLadder(address, borrowAmount);

  // The validator exposes no per-wallet sub-tier read, so the page never claims to know
  // the wallet's own bar. What it can say is whether the wallet clears the primary
  // market gate at all — `eligible` is registered && complianceVerify, the same two
  // staticcalls the gate makes. A wallet that fails that has no A-Pass to upgrade.
  const { eligible: hasApass } = useCompliance(address);

  // `minSubTier === 0` from the lens is the unregistered sentinel, not a real bar of zero — an
  // unregistered gate carries an empty rule list and denies every wallet, credentialed or not.
  // So while the target rung reads 0, the honest framing is "awaiting registration"; telling the
  // visitor to acquire an A-Pass would blame their credentials for the protocol's own pending step.
  const nextUnregistered = deployed && next !== null && next.minSubTier === 0;
  const nextBar =
    next && next.minSubTier && next.minSubTier > 0 ? next.minSubTier : next?.config.minSubTier;

  return (
    <div className="shell py-12">
      <div className="max-w-4xl">
        <div className="flex items-start gap-4 mb-8">
          <IconLayers className="w-8 h-8 text-brand-400 shrink-0 mt-1" />
          <div>
            <h1 className="text-h1">Credit ladder</h1>
            <p className="mt-2 text-body text-subtle max-w-2xl">
              Tiered markets with graduated leverage. Better credentials, better terms — your
              on-chain reputation translates directly into borrowing power.
            </p>
          </div>
        </div>

        {!deployed && (
          <div className="card p-6 flex items-start gap-4 border-warn/30 bg-warn/5">
            <IconAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-warn">Ladder not yet deployed</div>
              <p className="mt-1.5 text-body-sm text-subtle">
                The credit ladder contract deployment is pending. The rung structure below shows
                the intended terms, but no on-chain markets exist yet.
              </p>
            </div>
          </div>
        )}

        {deployed && !isConnected && (
          <div className="card p-6 flex items-start gap-4">
            <IconShield className="w-5 h-5 text-muted shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Connect wallet to see your standing</div>
              <p className="mt-1.5 text-body-sm text-subtle">
                The ladder will show which rung you qualify for based on your credential level.
              </p>
            </div>
          </div>
        )}

        {/* Borrow amount. Uses the `.field` primitives rather than a bare label + input so the
            control matches every other form in the app. */}
        <div className="mt-8 card p-6">
          <div className="field max-w-md">
            <label htmlFor="borrowAmount" className="field-label">
              Borrow amount (tUSDC)
            </label>
            <input
              id="borrowAmount"
              type="number"
              inputMode="decimal"
              value={borrowText}
              onChange={(e) => setBorrowText(e.target.value)}
              className="field-input"
              min="0"
              step="1000"
              aria-invalid={parsed === null}
              aria-describedby="borrowAmountHint"
            />
            <p id="borrowAmountHint" className="mt-2 text-body-sm text-subtle">
              {parsed === null
                ? "Enter an amount above zero to see collateral requirements."
                : "Collateral requirements below are shown for this amount."}
            </p>
          </div>
        </div>

        {/* Rungs. The loading note sits here, above the list it describes, rather than at the
            very bottom of the page where it was — a spinner below three cards of stale numbers
            reads as "page finished" until you scroll past the thing you came to read. */}
        <div className="mt-10 flex items-center justify-between gap-4">
          <div className="section-label">Rungs</div>
          {loading && (
            <div className="text-body-sm text-subtle" role="status">
              Resolving your standing…
            </div>
          )}
        </div>
        <div className="mt-4 space-y-4">
          {rungs.map((rung) => {
            const isBest = best?.index === rung.index;
            const isNext = next?.index === rung.index;
            const isAccessible = rung.accessible === true;
            const isRegistered = deployed && rung.minSubTier !== undefined && rung.minSubTier > 0;
            const gateUnregistered = deployed && rung.minSubTier === 0;

            return (
              <div
                key={rung.config.key}
                className={`card p-6 transition-all ${
                  isBest
                    ? "ring-2 ring-brand-500/40 bg-brand-500/5"
                    : isNext
                      ? "ring-1 ring-brand-500/20"
                      : ""
                }`}
              >
                <div>
                  {/* Status pills use the shared `.badge-*` primitives rather than hand-rolled
                      pills. The hand-rolled versions were `rounded-full`, semibold, and
                      borderless, so a rung's state chip did not match the state chips on
                      Markets or Positions — three visual languages for one concept. */}
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="card-title">{rung.config.label}</h3>
                    {isBest && (
                      <span className="badge-info">
                        <IconCheck className="w-3 h-3" />
                        Your rung
                      </span>
                    )}
                    {isNext && !isBest && <span className="badge-warn">Next target</span>}
                    {!isAccessible && deployed && resolved && (
                      <span className="badge-neutral">
                        <IconLock className="w-3 h-3" />
                        Locked
                      </span>
                    )}
                  </div>

                    <p className="text-body-sm text-subtle mb-4">{rung.config.qualifies}</p>

                    {/* Flex-wrap rather than a fixed grid: the third stat
                        (collateral) only exists once the lens read lands, and a
                        fixed 3-column grid leaves a visible hole until it does. */}
                    <div className="flex flex-wrap gap-x-12 gap-y-4 text-body-sm">
                      <div>
                        <div className="text-micro uppercase font-semibold text-muted mb-1">
                          Leverage (LLTV)
                        </div>
                        <div className="font-mono">
                          {((Number(rung.lltv) / 1e18) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-micro uppercase font-semibold text-muted mb-1">
                          Credential bar
                        </div>
                        <div>
                          {deployed && rung.minSubTier !== undefined && rung.minSubTier > 0
                            ? `Sub-tier ${rung.minSubTier}`
                            : `Sub-tier ${rung.config.minSubTier}${deployed && rung.minSubTier === 0 ? ' (gate unregistered)' : deployed ? '' : ' (intended)'}`}
                        </div>
                      </div>
                      {rung.collateralRequired !== undefined && (
                        <div>
                          <div className="text-micro uppercase font-semibold text-muted mb-1">
                            Collateral required
                          </div>
                          <div className="flex items-center gap-1.5">
                            <TokenMark symbol="tWBTC" tone="warn" className="w-4 h-4" />
                            <span className="font-mono">
                              {(Number(rung.collateralRequired) / 1e8).toFixed(4)} tWBTC
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {gateUnregistered && (
                      <div className="mt-4 flex items-start gap-2 text-body-sm text-warn">
                        <IconAlert className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          Gate not yet registered with Cleanverse — this rung denies all wallets
                          until registration completes.
                        </span>
                      </div>
                    )}

                    {deployed && isRegistered && !isAccessible && resolved && (
                      <div className="mt-4 text-body-sm text-muted">
                        {hasApass
                          ? "Your A-Pass does not meet this rung's sub-tier bar."
                          : "Acquire an A-Pass to access the credit ladder."}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Upgrade path */}
        {deployed && isConnected && next && !best && resolved && !nextUnregistered && (
          <div className="mt-8 card p-6 border-brand-500/30 bg-brand-500/5">
            <div className="flex items-start gap-4">
              <IconShield className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-brand-300">Upgrade to unlock</div>
                <p className="mt-1.5 text-body-sm">
                  {hasApass ? (
                    <>
                      Your A-Pass clears the primary market gate but not this rung. Upgrade to
                      sub-tier {nextBar} to access{" "}
                      <span className="font-semibold">{next.config.label}</span> at{" "}
                      {((Number(next.lltv) / 1e18) * 100).toFixed(1)}% LLTV.
                    </>
                  ) : (
                    <>
                      Acquire an A-Pass credential to access the credit ladder. Entry starts at{" "}
                      <span className="font-semibold">{next.config.label}</span> with sub-tier{" "}
                      {nextBar}.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pre-registration state: the rung markets exist, but no gate carries rules yet. This
            replaces the upgrade panel rather than sitting beside it, so the page states one cause
            for the denial instead of two competing ones. */}
        {deployed && isConnected && next && !best && resolved && nextUnregistered && (
          <div className="mt-8 card p-6 border-warn/30 bg-warn/5">
            <div className="flex items-start gap-4">
              <IconAlert className="w-5 h-5 text-warn shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-warn">Ladder awaiting Cleanverse registration</div>
                <p className="mt-1.5 text-body-sm text-subtle">
                  The rung markets are live and their gates are deployed, but no gate has completed
                  registration with the CVI validator yet. Until it does, every gate carries an empty
                  rule list and denies all wallets — so nothing on this page reflects your
                  credentials. Intended entry is{" "}
                  <span className="font-semibold">{next.config.label}</span> at sub-tier{" "}
                  {next.config.minSubTier}.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
