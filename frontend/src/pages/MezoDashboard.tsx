import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CREDIT_TOKENS, tierForScore, type TierKey } from "../config/credit";
import { ETHOS_TIERS, ethosProfileUrl } from "../config/dreamdex";
import { MEZO_APP_URL, MEZO_FAUCET_URL } from "../config/chain";
import {
  collateralValue,
  displayCollateral,
  displayLoan,
  healthFactor,
  liquidationPrice,
  useCreditPortfolio,
  useGateAuthorization,
  useProtocolStats,
} from "../hooks/useCovenant";
import { useEthosCredit } from "../hooks/useEthosScore";
import { CapitalModal } from "../components/CapitalModal";
import {
  HealthBar,
  HealthBadge,
  HealthFactor,
  MATURITY_LABEL,
  MarketsTable,
  StatStrip,
  TIERS,
  daysToMaturity,
  tierMeta,
} from "../components/lending";
import { EthosMark, IconArrowRight, IconExternal } from "../components/icons";
import { EthosBindingCard } from "./Credit";

const usd = (n: number | undefined) =>
  n === undefined ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function MezoDashboard() {
  const { isConnected, address } = useAccount();
  const stats = useProtocolStats();
  const { data: ethos, isLoading: ethosLoading } = useEthosCredit();
  const yourTier = isConnected && ethos ? tierForScore(ethos.score) : undefined;
  const [borrow, setBorrow] = useState<{ tier?: TierKey } | null>(null);
  const loan = CREDIT_TOKENS.loan.symbol;

  return (
    <section className="shell py-10 lg:py-12 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="section-label text-brand-500">Mezo testnet · fixed-rate credit</div>
          <h1 className="mt-2 text-h1 text-slate-50">Borrow {loan} against your Bitcoin.</h1>
          <p className="mt-3 text-body-lg text-muted leading-relaxed">
            Post BTC, borrow {loan} at a fixed rate until {MATURITY_LABEL}. Your Ethos credibility
            score decides the loan-to-value you qualify for. Collateral always backs the loan, and
            repaying never needs a score.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setBorrow({ tier: yourTier })}
          >
            Borrow {loan}
          </button>
          <Link to="/markets" className="btn-secondary">View markets</Link>
        </div>
      </header>

      <StatStrip
        items={[
          {
            label: "Available liquidity",
            value: stats.totalLiquidity === undefined ? <Skel /> : `${displayLoan(stats.totalLiquidity, 0)} ${loan}`,
            sub: "ready to lend across 3 markets",
          },
          {
            label: "Total borrowed",
            value: stats.totalBorrowed === undefined ? <Skel /> : `${displayLoan(stats.totalBorrowed, 0)} ${loan}`,
            sub: "outstanding fixed-rate debt",
          },
          {
            label: "BTC price",
            value: stats.price === undefined ? <Skel /> : usd(stats.price),
            sub: "Skip oracle · on-chain",
          },
          { label: "Borrow APR", value: "0.00%", sub: "fixed · no variable rate" },
          { label: "Maturity", value: MATURITY_LABEL, sub: `${daysToMaturity()} days remaining` },
        ]}
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {isConnected ? <PositionSummary yourTier={yourTier} onBorrow={() => setBorrow({ tier: yourTier })} /> : <ConnectPanel />}

        <div className="card">
          <div className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="section-label">Ethos credit tier</div>
              <span className="inline-flex items-center gap-1.5 text-micro text-ethos-600">
                <EthosMark className="w-3.5 h-3.5" /> Ethos
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              {!isConnected ? (
                <span className="font-mono text-[2rem] leading-none font-semibold text-subtle">—</span>
              ) : ethosLoading ? (
                <span className="skeleton h-8 w-24" />
              ) : (
                <span className="font-mono text-[2rem] leading-none font-semibold text-ethos-600 tabular-nums">
                  {(ethos?.score ?? 0).toLocaleString()}
                </span>
              )}
              <span className="text-body-sm text-subtle">credibility score</span>
            </div>
            <TierLadder score={isConnected ? ethos?.score : undefined} />
            {isConnected && address && (
              <a
                href={ethosProfileUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="mt-5 link text-body-sm inline-flex items-center gap-1.5"
              >
                View profile on Ethos <IconExternal className="w-3.5 h-3.5 opacity-60" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-h3 text-slate-50">Markets</h2>
            <p className="mt-1 text-body-sm text-subtle">
              Same collateral, same loan asset. A higher Ethos tier unlocks a higher loan-to-value.
            </p>
          </div>
          <Link to="/markets" className="link text-body-sm inline-flex items-center gap-1.5 whitespace-nowrap">
            All markets <IconArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <MarketsTable stats={stats.markets} yourTier={yourTier} onBorrow={(tier) => setBorrow({ tier })} />
      </div>

      {isConnected && address && yourTier === "open" && <EthosBindingCard address={address} />}

      {borrow && <CapitalModal market={borrow.tier} onClose={() => setBorrow(null)} />}
    </section>
  );
}

function Skel() {
  return <span className="skeleton h-6 w-24 inline-block align-middle" />;
}

function TierLadder({ score }: { score: number | undefined }) {
  const current = score === undefined ? undefined : tierForScore(score);
  const next = ETHOS_TIERS.find((t) => score !== undefined && t.minimum > score);
  return (
    <div className="mt-5 space-y-2">
      {ETHOS_TIERS.map((t) => {
        const key = t.name.toLowerCase() as TierKey;
        const active = current === key;
        return (
          <div
            key={t.name}
            className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
              active ? "border-brand-500/40 bg-brand-500/[0.06]" : "border-line"
            }`}
          >
            <div>
              <div className={`text-body-sm font-semibold ${active ? "text-brand-600" : "text-slate-200"}`}>{t.name}</div>
              <div className="text-micro text-subtle">{t.minimum === 0 ? "Any score" : `${t.minimum.toLocaleString()}+`}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-body text-slate-50 tabular-nums">{t.ltv}%</div>
              <div className="text-micro text-subtle">max LTV</div>
            </div>
          </div>
        );
      })}
      {next && score !== undefined && (
        <p className="pt-1 text-micro text-subtle">
          {(next.minimum - score).toLocaleString()} more points to reach {next.name} ({next.ltv}% LTV).
        </p>
      )}
    </div>
  );
}

function ConnectPanel() {
  const { openConnectModal } = useConnectModal();
  const steps = [
    { n: "1", t: "Fund with testnet BTC", d: "BTC is gas and collateral on Mezo.", href: MEZO_FAUCET_URL, cta: "Faucet" },
    { n: "2", t: "Authorize your Ethos score", d: "One signature binds your tier to this wallet for six hours." },
    { n: "3", t: "Post BTC, borrow MUSD", d: "Fill a signed lender offer at a fixed rate." },
  ];
  return (
    <div className="card">
      <div className="p-6">
        <div className="section-label">Your position</div>
        <h2 className="mt-2 text-h3 text-slate-50">Connect a wallet to start borrowing</h2>
        <p className="mt-1.5 text-body-sm text-subtle max-w-lg">
          Covenant reads your Ethos score, your BTC balance, and any open loans. Nothing is signed until you confirm.
        </p>
        <ol className="mt-6 grid sm:grid-cols-3 gap-3">
          {steps.map((s) => (
            <li key={s.n} className="rounded-lg border border-line p-4">
              <span className="font-mono text-micro text-brand-300">0{s.n}</span>
              <div className="mt-1.5 text-body-sm font-semibold text-slate-50">{s.t}</div>
              <p className="mt-1 text-micro text-subtle leading-relaxed">{s.d}</p>
              {s.href && (
                <a href={s.href} target="_blank" rel="noreferrer" className="mt-2 link text-micro inline-flex items-center gap-1">
                  {s.cta} <IconExternal className="w-3 h-3" />
                </a>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={openConnectModal}>Connect wallet</button>
          <a href={MEZO_APP_URL} target="_blank" rel="noreferrer" className="link text-body-sm inline-flex items-center gap-1.5">
            Mezo testnet app <IconExternal className="w-3.5 h-3.5 opacity-60" />
          </a>
        </div>
      </div>
    </div>
  );
}

function PositionSummary({ yourTier, onBorrow }: { yourTier: TierKey | undefined; onBorrow: () => void }) {
  const portfolio = useCreditPortfolio();
  const stats = useProtocolStats();
  const tier = yourTier ?? "open";
  const gate = useGateAuthorization(tier);
  const authorized = gate.data === true;
  const loan = CREDIT_TOKENS.loan.symbol;
  const coll = CREDIT_TOKENS.collateral.symbol;

  // Worst health across markets drives the headline; that market's liquidation price is the one to watch.
  let worst: { tier: TierKey; hf: number } | undefined;
  let capacity = 0n;
  for (const key of TIERS) {
    const row = portfolio.rows[key];
    const hf = healthFactor(row.maxDebt, row.debt);
    if (hf !== undefined && (!worst || hf < worst.hf)) worst = { tier: key, hf };
    if (row.maxDebt !== undefined && row.debt !== undefined && row.maxDebt > row.debt) capacity += row.maxDebt - row.debt;
  }
  const worstRow = worst ? portfolio.rows[worst.tier] : undefined;
  const liqPrice = worst && worstRow ? liquidationPrice(worst.tier, worstRow.debt ?? 0n, worstRow.collateral ?? 0n) : undefined;
  const collateralUsd = collateralValue(portfolio.collateral, stats.priceRaw);
  const hasDebt = (portfolio.debt ?? 0n) > 0n;
  const wallet = portfolio.rows[tier].walletCollateral;
  const loading = portfolio.debt === undefined;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="section-label">Your position</div>
          <div className="mt-1 text-body-sm text-subtle">All three markets combined</div>
        </div>
        <HealthBadge value={worst?.hf} hasDebt={hasDebt} />
      </div>
      <div className="p-6 grid sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <Metric label="Collateral" value={loading ? undefined : `${displayCollateral(portfolio.collateral)} ${coll}`} sub={collateralUsd === undefined || collateralUsd === 0n ? "none posted" : `≈ ${displayLoan(collateralUsd)} ${loan}`} />
        <Metric label="Debt" value={loading ? undefined : `${displayLoan(portfolio.debt)} ${loan}`} sub="repay 1:1 at or before maturity" />
        <Metric label="Available to borrow" value={loading ? undefined : `${displayLoan(capacity)} ${loan}`} sub="at current collateral" />
        <div>
          <div className="stat-label">Health factor</div>
          <div className="mt-1.5 text-[1.25rem] leading-tight font-semibold">
            {loading ? <Skel /> : hasDebt ? <HealthFactor value={worst?.hf} /> : <span className="text-subtle">—</span>}
          </div>
          {hasDebt && <div className="mt-2"><HealthBar value={worst?.hf} /></div>}
          <div className="mt-1.5 text-micro text-subtle">
            {liqPrice === undefined ? "liquidation below 1.00" : `liquidation at BTC ≈ $${liqPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </div>
        </div>
      </div>
      <div className="card-footer flex-wrap">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
          <span className={authorized ? "status-dot-ok" : "status-dot-idle"} />
          <span className="text-slate-300">
            {authorized ? `Ethos score authorized at the ${tierMeta(tier).name} gate` : "Ethos score not yet authorized"}
          </span>
          {wallet !== undefined && <span className="text-subtle whitespace-nowrap">· wallet {displayCollateral(wallet)} {coll}</span>}
        </span>
        <span className="inline-flex gap-2">
          <button type="button" className="btn-primary btn-sm" onClick={onBorrow}>Borrow</button>
          <Link to="/positions" className="btn-secondary btn-sm">Manage</Link>
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | undefined; sub: string }) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className="mt-1.5 text-[1.25rem] leading-tight font-semibold text-slate-50 tabular-nums truncate">
        {value === undefined ? <Skel /> : value}
      </div>
      <div className="mt-1 text-micro text-subtle truncate">{sub}</div>
    </div>
  );
}
