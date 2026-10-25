import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CREDIT, CREDIT_DEPLOYED, CREDIT_TOKENS, type TierKey } from "../config/credit";
import { COVENANT_ABI, ERC20_ABI } from "../config/abis";
import { CHAIN, EXPLORER } from "../config/chain";
import { useEthosCredit } from "../hooks/useEthosScore";
import {
  GAS_RESERVE,
  collateralValue,
  displayCollateral,
  displayLoan,
  fmtCollateral,
  fmtLoan,
  healthFactor,
  liquidationPrice,
  marketArgs,
  maxDebtFor,
  oraclePrice,
  parseCollateralInput,
  parseLoanInput,
  useCollateralPrice,
  useCovenantPosition,
  useCreditPortfolio,
} from "../hooks/useCovenant";
import { useTx } from "../hooks/useTx";
import {
  AssetPair,
  HealthBadge,
  HealthBar,
  HealthFactor,
  MATURITY_LABEL,
  StatStrip,
  TIERS,
  daysToMaturity,
  tierMeta,
} from "../components/lending";
import { IconExternal, IconWallet } from "../components/icons";
import { shortAddr } from "../lib/format";

const MAX_UINT = 2n ** 256n - 1n;

function truncate(raw: bigint, decimals: number, places: number): bigint {
  if (decimals <= places) return raw;
  const step = 10n ** BigInt(decimals - places);
  return (raw / step) * step;
}
const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** Mezo portfolio: debt, collateral, health, and the three exit actions. */
export function MezoPositions() {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { tier } = useEthosCredit();
  const portfolio = useCreditPortfolio();
  const price = useCollateralPrice();
  const priceRaw = price.data as bigint | undefined;
  const loan = CREDIT_TOKENS.loan.symbol;
  const coll = CREDIT_TOKENS.collateral.symbol;

  const active = TIERS.filter((key) => {
    const row = portfolio.rows[key];
    return (row.debt ?? 0n) > 0n || (row.collateral ?? 0n) > 0n;
  });
  const idle = TIERS.filter((key) => !active.includes(key));

  let worst: number | undefined;
  let capacity = 0n;
  for (const key of TIERS) {
    const row = portfolio.rows[key];
    const hf = healthFactor(row.maxDebt, row.debt);
    if (hf !== undefined && (worst === undefined || hf < worst)) worst = hf;
    if (row.maxDebt !== undefined && row.debt !== undefined && row.maxDebt > row.debt) capacity += row.maxDebt - row.debt;
  }
  const collateralUsd = collateralValue(portfolio.collateral, priceRaw);

  return (
    <section className="shell py-10 lg:py-12 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="section-label text-brand-500">Portfolio</div>
          <h1 className="mt-2 text-h2 text-slate-50">Your loans</h1>
          <p className="mt-2 text-body-sm text-muted max-w-xl">
            Repay {loan}, add {coll}, or withdraw spare collateral. None of these actions check your Ethos score.
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

      {!isConnected ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconWallet className="w-5 h-5" />
            </div>
            <div className="empty-state-title">Connect a wallet to see your loans</div>
            <p className="empty-state-body">Debt, collateral, health factor, and liquidation price for every market.</p>
            <button type="button" className="btn-primary btn-sm mt-4" onClick={openConnectModal}>
              Connect wallet
            </button>
          </div>
        </div>
      ) : (
        <>
          <StatStrip
            items={[
              {
                label: "Collateral",
                value: portfolio.collateral === undefined ? "…" : `${displayCollateral(portfolio.collateral)} ${coll}`,
                sub: collateralUsd === undefined ? undefined : `≈ ${displayLoan(collateralUsd)} ${loan}`,
              },
              {
                label: "Debt",
                value: portfolio.debt === undefined ? "…" : `${displayLoan(portfolio.debt)} ${loan}`,
                sub: `due ${MATURITY_LABEL} · ${daysToMaturity()} days`,
              },
              { label: "Available to borrow", value: portfolio.debt === undefined ? "…" : `${displayLoan(capacity)} ${loan}` },
              {
                label: "Lowest health factor",
                value: worst === undefined ? <span className="text-subtle">—</span> : <HealthFactor value={worst} />,
                sub: "liquidation below 1.00",
              },
              { label: "Credit tier", value: tier.name, sub: `up to ${tier.ltv}% LTV` },
            ]}
          />

          {CREDIT_DEPLOYED && !portfolio.isLoading && active.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-title">No open loans</div>
                <p className="empty-state-body">Post {coll} and borrow {loan} on the market your Ethos score opens.</p>
                <div className="mt-4 flex gap-2">
                  <Link to="/" className="btn-primary btn-sm">Borrow {loan}</Link>
                  <Link to="/markets" className="btn-secondary btn-sm">View markets</Link>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {active.map((key) => (
              <PositionCard key={key} tier={key} current={key === tier.name.toLowerCase()} priceRaw={priceRaw} />
            ))}
          </div>

          {active.length > 0 && idle.length > 0 && (
            <p className="text-body-sm text-subtle">
              No position in{" "}
              {idle.map((key, i) => (
                <span key={key}>
                  {i > 0 && (i === idle.length - 1 ? " or " : ", ")}
                  <Link to={`/markets/${key}`} className="link">{tierMeta(key).name}</Link>
                </span>
              ))}
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}

type Action = "repay" | "add" | "withdraw";

function PositionCard({ tier, current, priceRaw }: { tier: TierKey; current: boolean; priceRaw: bigint | undefined }) {
  const { address } = useAccount();
  const position = useCovenantPosition(tier);
  const { send, pending } = useTx();
  const [action, setAction] = useState<Action>("repay");
  const [input, setInput] = useState("");
  const [closing, setClosing] = useState(false);
  const loan = CREDIT_TOKENS.loan.symbol;
  const coll = CREDIT_TOKENS.collateral.symbol;
  const meta = tierMeta(tier);

  const loanAllowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    chainId: CHAIN.id,
    functionName: "allowance",
    args: address ? [address, CREDIT.covenant!] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });
  const collAllowance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.collateralToken ?? undefined,
    chainId: CHAIN.id,
    functionName: "allowance",
    args: address ? [address, CREDIT.covenant!] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });
  const loanBalance = useReadContract({
    abi: ERC20_ABI,
    address: CREDIT.loanToken,
    chainId: CHAIN.id,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: CREDIT_DEPLOYED && !!address, refetchInterval: 10_000 },
  });

  const debt = position.debt ?? 0n;
  const posted = position.collateral ?? 0n;
  const walletLoan = (loanBalance.data as bigint | undefined) ?? 0n;
  const walletColl = position.walletCollateral ?? 0n;
  const hf = healthFactor(position.maxDebt, position.debt);
  const liq = liquidationPrice(tier, debt, posted);
  const postedValue = collateralValue(posted, priceRaw);
  const spot = oraclePrice(priceRaw);

  const isLoan = action === "repay";
  const amount = isLoan ? parseLoanInput(input) : parseCollateralInput(input);
  const max =
    action === "repay"
      ? debt < walletLoan ? debt : walletLoan
      : action === "add"
        ? walletColl > GAS_RESERVE ? walletColl - GAS_RESERVE : 0n
        : position.excessCollateral;

  const nextDebt = action === "repay" ? (amount > debt ? 0n : debt - amount) : debt;
  const nextColl = action === "add" ? posted + amount : action === "withdraw" ? (amount > posted ? 0n : posted - amount) : posted;
  const nextHf = amount > 0n ? healthFactor(maxDebtFor(tier, nextColl, priceRaw), nextDebt) : undefined;
  const overMax = amount > max;
  const riskyWithdraw = action === "withdraw" && nextHf !== undefined && nextHf < 1.1;

  async function approveIfNeeded(token: `0x${string}`, current: bigint | undefined, needed: bigint, symbol: string) {
    if ((current ?? 0n) >= needed) return true;
    const hash = await send(`Approve ${symbol}`, {
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CREDIT.covenant!, MAX_UINT],
    });
    return !!hash;
  }

  async function submit() {
    if (amount <= 0n || overMax || !address) return;
    let hash: `0x${string}` | undefined;
    if (action === "repay") {
      if (!(await approveIfNeeded(CREDIT.loanToken, loanAllowance.data as bigint | undefined, amount, loan))) return;
      hash = await send(`Repay ${displayLoan(amount)} ${loan}`, {
        address: CREDIT.covenant!,
        abi: COVENANT_ABI,
        functionName: "repay",
        args: [marketArgs(tier), amount, address, ZERO, "0x"],
      });
    } else if (action === "add") {
      if (!(await approveIfNeeded(CREDIT.collateralToken!, collAllowance.data as bigint | undefined, amount, coll))) return;
      hash = await send(`Add ${displayCollateral(amount)} ${coll}`, {
        address: CREDIT.covenant!,
        abi: COVENANT_ABI,
        functionName: "supplyCollateral",
        args: [marketArgs(tier), 0n, amount, address],
      });
    } else {
      hash = await send(`Withdraw ${displayCollateral(amount)} ${coll}`, {
        address: CREDIT.covenant!,
        abi: COVENANT_ABI,
        functionName: "withdrawCollateral",
        args: [marketArgs(tier), 0n, amount, address, address],
      });
    }
    if (hash) setInput("");
  }

  async function closePosition() {
    if (closing || pending || !address) return;
    setClosing(true);
    try {
      if (debt > 0n) {
        if (!(await approveIfNeeded(CREDIT.loanToken, loanAllowance.data as bigint | undefined, debt, loan))) return;
        const repaid = await send(`Repay ${displayLoan(debt)} ${loan}`, {
          address: CREDIT.covenant!,
          abi: COVENANT_ABI,
          functionName: "repay",
          args: [marketArgs(tier), debt, address, ZERO, "0x"],
        });
        if (!repaid) return;
      }
      if (posted > 0n) {
        await send(`Withdraw ${displayCollateral(posted)} ${coll}`, {
          address: CREDIT.covenant!,
          abi: COVENANT_ABI,
          functionName: "withdrawCollateral",
          args: [marketArgs(tier), 0n, posted, address, address],
        });
      }
    } finally {
      setClosing(false);
    }
  }

  const tabs: { key: Action; label: string }[] = [
    { key: "repay", label: "Repay" },
    { key: "add", label: "Add collateral" },
    { key: "withdraw", label: "Withdraw" },
  ];
  const actionLabel = tabs.find((t) => t.key === action)!.label;

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <AssetPair size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <Link to={`/markets/${tier}`} className="text-body font-semibold text-slate-50">{meta.name} market</Link>
              {current && <span className="badge-info">Your tier</span>}
            </div>
            <div className="text-micro text-subtle">{meta.ltv}% LLTV · matures {MATURITY_LABEL}</div>
          </div>
        </div>
        <HealthBadge value={hf} hasDebt={debt > 0n} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] divide-y lg:divide-y-0 lg:divide-x divide-line">
        <div className="p-6 grid sm:grid-cols-2 gap-6 content-start">
          <Figure label="Collateral" value={`${displayCollateral(posted)} ${coll}`} sub={postedValue === undefined ? "—" : `≈ ${displayLoan(postedValue)} ${loan}`} />
          <Figure label="Debt" value={`${displayLoan(debt)} ${loan}`} sub="fixed · repay 1:1" />
          <Figure
            label="Liquidation price"
            value={liq === undefined ? "—" : `$${liq.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            sub={
              spot === undefined || liq === undefined
                ? "no debt"
                : `BTC $${spot.toLocaleString("en-US", { maximumFractionDigits: 0 })} now · ${(((spot - liq) / spot) * 100).toFixed(1)}% buffer`
            }
          />
          <div>
            <div className="stat-label">Health factor</div>
            <div className="mt-1.5 text-[1.25rem] leading-tight font-semibold">
              {debt > 0n ? <HealthFactor value={hf} /> : <span className="text-subtle">—</span>}
            </div>
            {debt > 0n && <div className="mt-2"><HealthBar value={hf} /></div>}
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div role="tablist" className="grid grid-cols-3 rounded-lg bg-ink-900 p-1 text-body-sm">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={action === t.key}
                onClick={() => {
                  setAction(t.key);
                  setInput("");
                }}
                className={`rounded-md py-1.5 font-medium transition-colors ${
                  action === t.key ? "bg-surface-raised text-slate-50 shadow-card" : "text-subtle hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2.5 focus-within:shadow-focus-ring">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none font-mono text-body-lg tabular-nums text-slate-50 placeholder:text-subtle"
                placeholder="0.00"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                inputMode="decimal"
                spellCheck={false}
                autoComplete="off"
                aria-label={`${actionLabel} amount`}
              />
              <span className="text-body-sm font-medium text-slate-300">{isLoan ? loan : coll}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-micro text-subtle">
              <span>
                {action === "repay" && `Wallet ${displayLoan(walletLoan)} ${loan}`}
                {action === "add" && `Wallet ${displayCollateral(walletColl)} ${coll}`}
                {action === "withdraw" && `Withdrawable ${displayCollateral(position.excessCollateral)} ${coll}`}
              </span>
              <button
                type="button"
                className="link font-semibold disabled:opacity-40"
                disabled={max === 0n}
                onClick={() => setInput(isLoan ? fmtLoan(max) : fmtCollateral(truncate(max, CREDIT_TOKENS.collateral.decimals, 6)))}
              >
                Max
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-body-sm">
            <span className="text-subtle">Health factor</span>
            <span className="tabular-nums">
              {debt > 0n ? <HealthFactor value={hf} /> : <span className="text-subtle">—</span>}
              {amount > 0n && debt > 0n && (
                <>
                  <span className="text-subtle mx-1.5">→</span>
                  {nextDebt === 0n ? <span className="text-ok">∞</span> : <HealthFactor value={nextHf} />}
                </>
              )}
            </span>
          </div>

          {overMax && amount > 0n && (
            <p className="text-micro text-warn">
              {action === "repay"
                ? `Exceeds your debt or ${loan} balance.`
                : action === "add"
                  ? `Exceeds your balance after a ${displayCollateral(GAS_RESERVE)} ${coll} gas reserve.`
                  : "Would leave the loan below its liquidation threshold."}
            </p>
          )}
          {riskyWithdraw && !overMax && <p className="text-micro text-warn">This leaves almost no buffer before liquidation.</p>}

          <button type="button" className="btn-primary w-full" onClick={submit} disabled={pending || closing || amount <= 0n || overMax}>
            {amount <= 0n ? "Enter an amount" : actionLabel}
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm w-full"
            onClick={closePosition}
            disabled={pending || closing || walletLoan < debt}
          >
            {closing ? "Closing…" : walletLoan < debt ? `Close loan · needs ${displayLoan(debt)} ${loan}` : "Repay all and withdraw collateral"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className="mt-1.5 text-[1.25rem] leading-tight font-semibold text-slate-50 tabular-nums truncate">{value}</div>
      <div className="mt-1 text-micro text-subtle truncate">{sub}</div>
    </div>
  );
}
