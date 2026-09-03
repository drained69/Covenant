import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import toast from "react-hot-toast";
import { formatUnits } from "viem";
import {
  useDreamDexPortfolio,
  useDreamDexPositions,
  useDreamDexTrader,
  useSettledClaimables,
} from "../hooks/useDreamDex";
import { useEthosCredit } from "../hooks/useEthosScore";
import {
  fmtCollateral,
  fmtLoan,
  marketArgs,
  parseLoan,
  useCovenantPosition,
} from "../hooks/useCovenant";
import { CREDIT, CREDIT_DEPLOYED, tierForScore, type TierKey } from "../config/credit";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";
import { useTx } from "../hooks/useTx";
import { EXPLORER } from "../config/chain";
import { describeError } from "../lib/errors";
import { fmtUnits, humanUntil, shortAddr } from "../lib/format";
import { IconExternal, IconWallet } from "../components/icons";
import type { OpenPositionPnL, PortfolioOrder, PortfolioTrade } from "@somnia-chain/markets-sdk";

/**
 * The unified portfolio — the demo's closing screen. Three sections, one story:
 * the credit that funded the trades (debt, collateral, health, repay), the
 * Event Contract positions those trades opened (Up/Down with PnL), and the
 * resting orders and fills in between.
 */
export function Positions() {
  const { isConnected, address } = useAccount();
  const positions = useDreamDexPositions();
  const portfolio = useDreamDexPortfolio();
  const { tier } = useEthosCredit();

  /* PnL fields are RAW collateral units with PER-MARKET decimals — summing
     the raw bigints and formatting at the first market's decimals breaks on
     a mixed 6dp/18dp portfolio. Normalize per position, then aggregate. */
  const totals = positions.data?.reduce(
    (acc, p) => {
      const dec = p.market.quoteDecimals;
      return {
        mark: acc.mark + Number(formatUnits(p.markValue, dec)),
        cost: acc.cost + Number(formatUnits(p.costBasis, dec)),
        pnl: acc.pnl + Number(formatUnits(p.unrealizedPnl, dec)),
      };
    },
    { mark: 0, cost: 0, pnl: 0 },
  );
  const openOrders = portfolio.data?.openOrders ?? [];

  return (
    <section className="shell py-12 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="section-label text-brand-500">Your portfolio</div>
          <h1 className="mt-2 text-h2 text-slate-50">Positions & credit.</h1>
          <p className="mt-2 text-body-sm text-muted">
            Event Contract positions, debt, collateral health, and PnL — the whole trade, one page.
          </p>
        </div>
        {isConnected && (
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="link font-mono text-body-sm inline-flex items-center gap-1.5"
          >
            {shortAddr(address)}
            <IconExternal className="w-3.5 h-3.5 opacity-60" />
          </a>
        )}
      </header>

      {!isConnected && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconWallet className="w-5 h-5" />
            </div>
            <div className="empty-state-title">No wallet connected</div>
            <p className="empty-state-body">
              Connect a Somnia wallet to see your credit, collateral, and Event Contract
              positions.
            </p>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat
            label="Credit tier"
            value={tier.name}
            sub={`up to ${tier.ltv}% LTV`}
          />
          <Stat
            label="Borrowed"
            value={CREDIT_DEPLOYED ? <BorrowedStat /> : "—"}
            sub={CREDIT_DEPLOYED ? "tUSDC debt across tier markets" : "credit markets pending deployment"}
            skeleton={false}
          />
          <Stat
            label="Position value"
            value={totals ? `${totals.mark.toLocaleString(undefined, { maximumFractionDigits: 2 })} TestUSDC` : "—"}
            skeleton={positions.isLoading}
          />
          <Stat
            label="Unrealized PnL"
            value={totals ? signedNum(totals.pnl) : "—"}
            sub={totals && totals.cost > 0 ? `${((totals.pnl / totals.cost) * 100).toFixed(1)}%` : undefined}
            tone={totals && totals.pnl > 0 ? "ok" : totals && totals.pnl < 0 ? "bad" : undefined}
            skeleton={positions.isLoading}
          />
        </div>
      )}

      {isConnected && CREDIT_DEPLOYED && (
        <div className="space-y-4">
          <h2 className="text-micro font-semibold uppercase text-muted">Trading credit</h2>
          <CreditCards />
        </div>
      )}

      {isConnected && <Claimables />}

      {isConnected && (
        <div className="space-y-4">
          <div>
            <h2 className="text-micro font-semibold uppercase text-muted">Outcome positions</h2>
            <p className="mt-1 text-body-sm text-subtle">Live holdings can be closed while the market is Trading. Settled holdings move to Claimable winnings above.</p>
          </div>
          {positions.isLoading ? (
            <div className="card divide-y divide-line">
              {[0, 1].map((i) => (
                <div key={i} className="px-6 py-5 flex items-center justify-between gap-6">
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-4 w-24" />
                    <div className="skeleton h-3 w-3/4" />
                  </div>
                  <div className="skeleton h-8 w-40" />
                </div>
              ))}
            </div>
          ) : (positions.data?.length ?? 0) === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-title">No outcome positions yet</div>
                <p className="empty-state-body">
                  Buy Up or Down on any live Event Contract and the position appears here with
                  average cost and mark-to-market PnL.
                </p>
                <Link to="/markets" className="btn-secondary btn-sm mt-2">
                  Explore markets
                </Link>
              </div>
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {positions.data!.map((p) => (
                <PositionRow key={p.market.id} p={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {isConnected && (
        <div className="space-y-4">
          <div>
            <h2 className="text-micro font-semibold uppercase text-muted">Open orders</h2>
            <p className="mt-1 text-body-sm text-subtle">Resting orders reserve balances until they fill or you cancel them.</p>
          </div>
          {portfolio.isLoading ? (
            <div className="card"><div className="card-body"><div className="skeleton h-4 w-48" /></div></div>
          ) : portfolio.isError ? (
            <div className="card"><div className="card-body text-body-sm text-warn">Open orders are temporarily unavailable. Refresh the page before submitting another order.</div></div>
          ) : openOrders.length === 0 ? (
            <div className="card">
              <div className="card-body text-body-sm text-subtle">
                No resting orders. Orders are immediate-or-cancel by default in this prototype, so
                only unfilled remainders would rest.
              </div>
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {openOrders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      )}

      {isConnected && (portfolio.data?.trades.length ?? 0) > 0 && (
        <div className="space-y-4">
          <h2 className="text-micro font-semibold uppercase text-muted">Recent fills</h2>
          <div className="card divide-y divide-line">
            {portfolio.data!.trades.slice(0, 10).map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── redemption ─────────────────────────────────────────────────────────── */

/**
 * Winnings waiting to be claimed across settled markets.
 *
 * Settled markets leave DreamDEX's live list, so unredeemed ERC-6909 outcome
 * tokens are invisible to every portfolio that only watches live markets. This
 * scan walks the Finalized tail on-chain, prices each claim (winning side at
 * par, both sides at 0.5 on a void), and redeems through the venue's
 * module-routed settlement — completing the trade lifecycle inside Covenant.
 */
function Claimables() {
  const claimables = useSettledClaimables();
  const trader = useDreamDexTrader();
  const [claiming, setClaiming] = useState<string | null>(null);

  async function claim(
    marketId: string,
    outcomeIdx: 0 | 1,
    amount: bigint,
    label: string,
  ) {
    const t = toast.loading(`Claiming ${label} — confirm in wallet…`);
    setClaiming(marketId);
    try {
      const result = await trader.redeemOutcome(marketId, outcomeIdx, amount);
      const hash = result.hash;
      toast.success(
        <span>
          Winnings claimed
          {hash && (
            <>
              {" "}
              <a
                href={`${EXPLORER}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                tx <IconExternal className="w-3 h-3" />
              </a>
            </>
          )}
        </span>,
        { id: t, duration: 8_000 },
      );
      await trader.refresh();
    } catch (error) {
      toast.error(`Claim failed: ${describeError(error).slice(0, 160)}`, {
        id: t,
        duration: 9_000,
      });
    } finally {
      setClaiming(null);
    }
  }

  if (claimables.isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="skeleton h-4 w-48" />
        </div>
      </div>
    );
  }
  if ((claimables.data?.length ?? 0) === 0) return null;

  return (
    <div className="card border-ok/25">
      <div className="card-header">
        <div>
          <div className="card-title">Claimable winnings</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Settled markets you still hold outcome tokens in — claim them to receive collateral
          </div>
        </div>
        <span className="badge-ok">
          <span className="status-dot-ok" />
          Ready to redeem
        </span>
      </div>
      <div className="divide-y divide-line">
        {claimables.data!.map((c) => {
          const payout = fmtUnits(c.payout, c.quoteDecimals, 2);
          return (
            <div key={c.marketId} className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  {/* A voided market has no winner — the contract's
                      winningOutcome default (0) must not read as an Up win. */}
                  {c.voided ? (
                    <span className="badge-neutral">Void</span>
                  ) : (
                    <OutcomePill up={c.winningOutcome === 0} />
                  )}
                  <span className="text-body-sm text-slate-200 truncate">{c.question}</span>
                </div>
                <div className="mt-1 font-mono text-micro text-subtle tabular-nums">
                  {c.voided
                    ? "voided · both sides pay 0.5"
                    : `settled ${agoLabel(c.expiresAt)} · ${c.winningOutcome === 0 ? "Up" : "Down"} won`}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="stat-label">Payout</div>
                  <div className="mt-0.5 font-mono text-body-sm text-ok tabular-nums">
                    {payout}
                  </div>
                </div>
                {/* Resolved: claim the winning side. Voided: both sides pay
                    0.5, so claim each held side separately. */}
                {c.voided ? (
                  <div className="flex gap-2">
                    {c.upBalance > 0n && (
                      <button
                        className="btn-primary btn-sm"
                        disabled={claiming === c.marketId}
                        onClick={() => claim(c.marketId, 0, c.upBalance, "Up side")}
                      >
                        Claim Up
                      </button>
                    )}
                    {c.downBalance > 0n && (
                      <button
                        className="btn-primary btn-sm"
                        disabled={claiming === c.marketId}
                        onClick={() => claim(c.marketId, 1, c.downBalance, "Down side")}
                      >
                        Claim Down
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn-primary btn-sm"
                    disabled={claiming === c.marketId}
                    onClick={() =>
                      claim(
                        c.marketId,
                        (c.winningOutcome ?? 0) as 0 | 1,
                        c.winningOutcome === 0 ? c.upBalance : c.downBalance,
                        "winnings",
                      )
                    }
                  >
                    {claiming === c.marketId ? "Claiming…" : "Claim"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── credit leg ────────────────────────────────────────────────────────── *//** Total borrowed across tier markets, for the stat row. */
function BorrowedStat() {
  const { data: ethos } = useEthosCredit();
  const tier = tierForScore(ethos?.score ?? 0);
  const position = useCovenantPosition(tier);
  /* "0" while the read is in flight would assert the wallet carries no debt —
     show pending instead. */
  return <>{position.isLoading ? "…" : fmtLoan(position.debt)}</>;
}

/**
 * The tier market the wallet actually has exposure in (falls back to the
 * earned tier). Debt, collateral, health, repay, and withdraw — the exits that
 * reputation never gates.
 */
function CreditCards() {
  const { data: ethos } = useEthosCredit();
  const currentTier = tierForScore(ethos?.score ?? 0);
  return (
    <div className="space-y-4">
      {(["open", "established", "reputable"] as TierKey[]).map((tier) => (
        <CreditCard key={tier} tier={tier} primary={tier === currentTier} />
      ))}
    </div>
  );
}

function CreditCard({ tier, primary }: { tier: TierKey; primary: boolean }) {
  const { address } = useAccount();
  const position = useCovenantPosition(tier);
  const { send, pending } = useTx();
  const [repayInput, setRepayInput] = useState("");
  const [closing, setClosing] = useState(false);
  const loanAllowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    functionName: "allowance",
    args: address ? [address, CREDIT.covenant!] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });

  const debt = position.debt ?? 0n;
  const collateral = position.collateral ?? 0n;
  const hasExposure = debt > 0n || collateral > 0n;

  const healthPct =
    position.maxDebt !== undefined && position.maxDebt > 0n
      ? Math.min(100, (Number(debt) / Number(position.maxDebt)) * 100)
      : 0;

  if (position.isLoading) {
    /* Pending reads render as undefined→0n; without this gate a wallet with
       real exposure flashes "No credit drawn" before the chain answers. */
    return (
      <div className="card">
        <div className="card-body">
          <div className="skeleton h-5 w-40" />
          <div className="mt-3 skeleton h-4 w-64" />
        </div>
      </div>
    );
  }

  if (!hasExposure) {
    return null;
  }

  /* parseUnits THROWS on malformed input, and the disabled expression below
     evaluates during render — a bad keystroke ("1.2.3") would crash the page
     instead of disabling the button. Parse once, safely. */
  const repayRaw = useMemo(() => {
    try {
      return parseLoan(repayInput || fmtLoan(debt));
    } catch {
      return undefined;
    }
  }, [repayInput, debt]);

  async function repay() {
    if (repayRaw === undefined) {
      toast.error("Enter a valid repayment amount.");
      return;
    }
    if (repayRaw <= 0n || repayRaw > debt) return;
    await send("Repay debt", {
      address: CREDIT.covenant!,
      abi: COVENANT_ABI,
      functionName: "repay",
      args: [marketArgs(tier), repayRaw, address!, "0x0000000000000000000000000000000000000000", "0x"],
    });
  }

  async function withdrawCollateral() {
    const free = (position.maxDebt ?? 0n) > debt ? collateral : 0n;
    if (free <= 0n) return;
    await send("Withdraw collateral", {
      address: CREDIT.covenant!,
      abi: COVENANT_ABI,
      functionName: "withdrawCollateral",
      args: [marketArgs(tier), 0n, free, address!, address!],
    });
  }

  async function closeCreditPosition() {
    if (closing || pending) return;
    setClosing(true);
    try {
      // Repay first. Only after the receipt is confirmed can all collateral be
      // withdrawn without risking an unhealthy intermediate state.
      if (debt > 0n) {
        const allowance = (loanAllowance.data as bigint | undefined) ?? 0n;
        if (allowance < debt) {
          const approval = await send("Approve tUSDC repayment", {
            address: CREDIT.loanToken,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CREDIT.covenant!, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
          });
          if (!approval) return;
        }
        const repayment = await send("Repay full debt", {
          address: CREDIT.covenant!,
          abi: COVENANT_ABI,
          functionName: "repay",
          args: [marketArgs(tier), debt, address!, "0x0000000000000000000000000000000000000000", "0x"],
        });
        if (!repayment) return;
      }
      if (collateral > 0n) {
        await send("Withdraw all collateral", {
          address: CREDIT.covenant!,
          abi: COVENANT_ABI,
          functionName: "withdrawCollateral",
          args: [marketArgs(tier), 0n, collateral, address!, address!],
        });
      }
    } finally {
      setClosing(false);
    }
  }

  const withdrawable = (position.maxDebt ?? 0n) > debt ? collateral : 0n;

  return (
    <div className="card">
      <div className="card-header">
        <div>
            <div className="card-title">
              {tier[0].toUpperCase() + tier.slice(1)} market
              {primary && <span className="badge-info ml-2">current tier</span>}
            </div>
          <div className="text-body-sm text-subtle mt-0.5">
            Fixed maturity · {new Date(CREDIT.maturity * 1000).toISOString().slice(0, 10)}
          </div>
        </div>
        <span className={`badge-${position.healthy ? "ok" : "bad"}`}>
          {position.healthy ? "Healthy" : "At risk"}
        </span>
      </div>
      <div className="card-body space-y-5">
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <div className="stat-label">Debt</div>
            <div className="mt-1 text-xl font-semibold text-slate-50 tabular-nums">
              {fmtLoan(debt)}
            </div>
            <div className="mt-0.5 text-micro text-subtle">tUSDC · repaid 1:1</div>
          </div>
          <div>
            <div className="stat-label">Collateral</div>
            <div className="mt-1 text-xl font-semibold text-slate-50 tabular-nums">
              {fmtCollateral(collateral)}
            </div>
            <div className="mt-0.5 text-micro text-subtle">tBTC posted</div>
          </div>
          <div>
            <div className="stat-label">Debt capacity used</div>
            <div className="mt-1 text-xl font-semibold text-slate-50 tabular-nums">
              {healthPct.toFixed(0)}%
            </div>
             <div className="mt-1.5 h-1.5 rounded-full bg-ink-900 overflow-hidden">
              <div
                className={`h-full rounded-full ${healthPct > 85 ? "bg-bad" : healthPct > 60 ? "bg-warn" : "bg-ok"}`}
                style={{ width: `${healthPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-4 border-t border-line">
          <label className="field flex-1 min-w-[140px]">
            <span className="field-label">Repay (tUSDC)</span>
            <input
              className="field-input font-mono tabular-nums"
              placeholder={fmtLoan(debt)}
              value={repayInput}
              onChange={(e) => setRepayInput(e.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
           <button
            className="btn-secondary btn-sm"
            onClick={repay}
            disabled={
              pending ||
              debt === 0n ||
              repayRaw === undefined ||
              repayRaw <= 0n ||
              repayRaw > debt
            }
          >
            Repay
          </button>
          {/* The tooltip lives on a wrapper, not the button. Disabled buttons
              are removed from the tab order, so a tooltip only they can
              reveal is invisible to keyboard users — hover from the wrapper
              still works for pointer users on any device. */}
          <span data-tip={`${fmtCollateral(withdrawable)} tBTC free`} className="inline-flex">
            <button
              className="btn-secondary btn-sm"
              onClick={withdrawCollateral}
              disabled={pending || withdrawable === 0n}
            >
             Withdraw collateral
           </button>
          </span>
          <button
            className="btn-primary btn-sm"
            onClick={closeCreditPosition}
            disabled={pending || closing || debt === 0n && collateral === 0n}
          >
            {closing ? "Closing…" : "Close credit position"}
          </button>
        </div>
        <p className="text-micro text-subtle leading-relaxed">
          Repayment and withdrawal are never reputation-gated — a stale score can stop new
          borrowing but cannot strand an exit.
        </p>
      </div>
    </div>
  );
}

/* ── rows ────────────────────────────────────────────────────────────── */

function PositionRow({ p }: { p: OpenPositionPnL }) {
  const dec = p.market.quoteDecimals;
  const upSize = fmtUnits(p.balanceYes, dec, 2);
  const downSize = fmtUnits(p.balanceNo, dec, 2);
  const trader = useDreamDexTrader();
  const [closing, setClosing] = useState<"up" | "down" | null>(null);
  const pnlTone =
    p.unrealizedPnl > 0n ? "text-ok" : p.unrealizedPnl < 0n ? "text-bad" : "text-slate-300";

  async function close(outcome: "up" | "down", amount: bigint) {
    if (amount <= 0n) return;
    setClosing(outcome);
    const label = outcome === "up" ? "UP" : "DOWN";
    const t = toast.loading(`Closing ${label} — confirm in wallet…`);
    try {
      const result = await trader.closePosition(
        p.market.id,
        outcome,
        Number(formatUnits(amount, dec)),
      );
      toast.success(
        `${label} close submitted${result.filled > 0 ? ` · ${result.filled} filled` : ""}${result.remaining > 0 ? ` · ${result.remaining} still open` : ""}`,
        { id: t, duration: 8_000 },
      );
      await trader.refresh();
    } catch (error) {
      toast.error(`Close failed: ${describeError(error).slice(0, 160)}`, {
        id: t,
        duration: 9_000,
      });
    } finally {
      setClosing(null);
    }
  }

  const canClose = p.market.status === "Trading";
  const settled = p.market.status === "Finalized" || p.market.status === "Resolved" || p.market.status === "Voided";

  return (
    <div className="px-6 py-5 hover:bg-ink-900 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.market.status} />
            <span className="badge-neutral">{p.market.asset}</span>
            {p.market.interval && <span className="badge-neutral">{p.market.interval}</span>}
          </div>
          <div className="mt-2 text-body font-medium text-slate-100 leading-snug">
            {p.market.question}
          </div>
          <div className="mt-1 text-micro text-subtle">
            settles {humanUntil(Number(p.market.expiry))}
          </div>
          <Link
            to={`/markets/${encodeURIComponent(p.market.id)}`}
            className="mt-1 inline-flex link text-micro"
          >
            Open market
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-right">
          <Cell label="Up / Down" value={`${upSize} / ${downSize}`} />
          <Cell label="Avg entry" value={p.avgCost > 0n ? pct(p.avgCost, dec) : "—"} />
          <Cell label="Mark value" value={fmtUnits(p.markValue, dec, 2)} />
          <div>
            <div className="stat-label">uPnL</div>
            <div className={`mt-0.5 font-mono text-body-sm tabular-nums ${pnlTone}`}>
              {signed(p.unrealizedPnl, dec)}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        <span className="text-micro text-subtle mr-auto">
          {canClose ? "Close position" : settled ? "Claim settlement above" : "Closing unavailable while market is not Trading"}
        </span>
        {canClose && p.balanceYes > 0n && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => close("up", p.balanceYes)}
            disabled={closing !== null}
          >
            {closing === "up" ? "Closing…" : `Close UP · ${upSize}`}
          </button>
        )}
        {canClose && p.balanceNo > 0n && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => close("down", p.balanceNo)}
            disabled={closing !== null}
          >
            {closing === "down" ? "Closing…" : `Close DOWN · ${downSize}`}
          </button>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: PortfolioOrder }) {
  const dec = order.market.quoteDecimals;
  const trader = useDreamDexTrader();
  const [pending, setPending] = useState(false);
  const up = isUp(order.side);

  async function cancel() {
    const t = toast.loading("Canceling order — confirm in wallet…");
    setPending(true);
    try {
      await trader.cancelOrder(order.market.poolAddress, order.orderId);
      toast.success("Order canceled", { id: t });
      await trader.refresh();
    } catch (error) {
      toast.error(`Cancel failed: ${describeError(error).slice(0, 160)}`, {
        id: t,
        duration: 9_000,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <OutcomePill up={up} />
          <span className="text-body-sm text-slate-200 truncate">{order.market.question}</span>
        </div>
        <div className="mt-1 font-mono text-micro text-subtle tabular-nums">
          limit {pct(BigInt(order.price), dec)} ·{" "}
          {fmtUnits(BigInt(order.quantityRemaining), dec, 2)} of{" "}
          {fmtUnits(BigInt(order.fullQuantity), dec, 2)} open
        </div>
      </div>
      <button className="btn-secondary btn-sm" onClick={cancel} disabled={pending}>
        {pending ? "Canceling…" : "Cancel"}
      </button>
    </div>
  );
}

function TradeRow({ trade }: { trade: PortfolioTrade }) {
  const dec = trade.market.quoteDecimals;
  return (
    <a
      href={`${EXPLORER}/tx/${trade.txHash}`}
      target="_blank"
      rel="noreferrer"
       className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-ink-900 transition-colors"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {trade.side !== null && <OutcomePill up={isUp(trade.side)} />}
        <span className="text-body-sm text-subtle truncate">
          {trade.market.asset} · {trade.market.interval ?? "event"}
        </span>
      </div>
      <div className="font-mono text-micro text-subtle flex items-center gap-5 tabular-nums">
        <span>{pct(BigInt(trade.fillPrice), dec)}</span>
        <span>{fmtUnits(BigInt(trade.quantity), dec, 2)}</span>
        <span className="inline-flex items-center gap-1">
          {shortAddr(trade.txHash)}
          <IconExternal className="w-3 h-3 opacity-60" />
        </span>
      </div>
    </a>
  );
}

/* ── primitives ──────────────────────────────────────────────────────── */

/** YES orders (BUY_YES/SELL_YES) are UP; NO orders (BUY_NO/SELL_NO) are DOWN. */
function isUp(side: string | null): boolean {
  return side?.endsWith("YES") ?? false;
}

/** A binary outcome rendered as a badge — the app-wide "UP"/"DOWN" token. */
function OutcomePill({ up }: { up: boolean }) {
  return (
    <span className={up ? "badge-ok" : "badge-bad"}>{up ? "Up" : "Down"}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Trading: "badge-ok",
    Listed: "badge-neutral",
    Locked: "badge-warn",
    Settling: "badge-warn",
    Resolved: "badge-info",
    Voided: "badge-bad",
    Finalized: "badge-neutral",
  };
  return <span className={map[status] ?? "badge-neutral"}>{status}</span>;
}

function Stat({
  label,
  value,
  sub,
  tone,
  skeleton,
}: {
  label: string;
  value: string | React.ReactNode;
  sub?: string;
  tone?: "ok" | "bad";
  skeleton?: boolean;
}) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="stat-label">{label}</div>
        {skeleton ? (
          <div className="mt-2 skeleton h-6 w-24" />
        ) : (
          <div
            className={`mt-1 text-xl font-semibold tabular-nums ${
              tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-slate-50"
            }`}
          >
            {value}
          </div>
        )}
        {sub && <div className="mt-1 text-micro text-subtle tabular-nums">{sub}</div>}
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 font-mono text-body-sm tabular-nums text-slate-200">{value}</div>
    </div>
  );
}

/** Raw price → implied probability, e.g. 0.62 → "62.0%". */
function pct(raw: bigint, decimals: number): string {
  return `${(Number(formatUnits(raw, decimals)) * 100).toFixed(1)}%`;
}

/** "12m ago" / "3h ago" for a past unix timestamp. */
function agoLabel(unixSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function signed(raw: bigint, decimals: number): string {
  const sign = raw < 0n ? "−" : "+";
  return `${sign}${fmtUnits(raw < 0n ? -raw : raw, decimals, 2)}`;
}

/** Signed rendering for already-normalized (human-unit) PnL totals. */
function signedNum(value: number): string {
  return `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
