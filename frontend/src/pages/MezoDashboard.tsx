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
  oraclePrice,
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
          <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface-raised px-3 py-1 text-micro font-semibold uppercase text-slate-300">
            <span className="status-dot-ok" /> Live on Mezo testnet · {loan} credit
          </div>
          <h1 className="mt-4 text-h1 text-slate-50">
            Your reputation, priced into
            <br className="hidden sm:block" /> your Bitcoin loan.
          </h1>
          <p className="mt-3 text-body-lg text-muted leading-relaxed">
            Covenant lends {loan} against BTC at a fixed rate. Your Ethos credibility score sets the
            loan-to-value, up to twice the borrowing power on the same collateral. BTC always secures
            the loan, and repaying never needs a score.
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

      <BorrowingPower yourTier={yourTier} priceRaw={stats.priceRaw} />

      <HowItWorks />

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

/** The product in one picture: the same BTC borrows more as Ethos credibility rises. */
function BorrowingPower({ yourTier, priceRaw }: { yourTier: TierKey | undefined; priceRaw: bigint | undefined }) {
  const { isConnected } = useAccount();
  const portfolio = useCreditPortfolio();
  const wallet = portfolio.rows.open.walletCollateral;
  const [input, setInput] = useState("");
  const loan = CREDIT_TOKENS.loan.symbol;
  const coll = CREDIT_TOKENS.collateral.symbol;
  const fallback = isConnected && wallet !== undefined && wallet > 0n ? Number(displayCollateral(wallet, 4).replace(/,/g, "")) : 0.1;
  const btc = input === "" ? fallback : Math.max(0, Number(input) || 0);
  const price = oraclePrice(priceRaw);
  const value = price === undefined ? undefined : btc * price;
  const max = value === undefined ? 0 : value * (ETHOS_TIERS[ETHOS_TIERS.length - 1].ltv / 100);

  return (
    <div className="card">
      <div className="p-6 grid lg:grid-cols-[320px_minmax(0,1fr)] gap-8">
        <div>
          <div className="section-label text-ethos-600">Reputation-priced credit</div>
          <h2 className="mt-2 text-h3 text-slate-50">Same Bitcoin. More {loan} as your credibility grows.</h2>
          <p className="mt-2 text-body-sm text-subtle leading-relaxed">
            Ethos credibility moves a wallet into a higher tier, and each tier lends at a higher
            loan-to-value. The collateral rules and liquidation math stay the same.
          </p>
          <label className="mt-5 block">
            <span className="field-label">Collateral</span>
            <div className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 flex items-center gap-2 focus-within:shadow-focus-ring">
              <input
                className="flex-1 min-w-0 bg-transparent outline-none focus-visible:outline-none font-mono text-body-lg tabular-nums text-slate-50"
                value={input === "" ? String(fallback) : input}
                onChange={(e) => setInput(e.target.value)}
                inputMode="decimal"
                aria-label={`${coll} collateral`}
              />
              <span className="text-body-sm font-medium text-slate-300">{coll}</span>
            </div>
            <span className="mt-1 block text-micro text-subtle">
              {value === undefined ? "Loading oracle price…" : `≈ $${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} at the on-chain BTC price`}
            </span>
          </label>
        </div>

        <div className="space-y-4 self-center">
          {ETHOS_TIERS.map((t) => {
            const key = t.name.toLowerCase() as TierKey;
            const amount = value === undefined ? undefined : value * (t.ltv / 100);
            const yours = yourTier === key;
            return (
              <div key={t.name}>
                <div className="flex items-baseline justify-between gap-3 text-body-sm">
                  <span className="flex items-center gap-2">
                    <span className={`font-semibold ${yours ? "text-brand-600" : "text-slate-200"}`}>{t.name}</span>
                    <span className="text-micro text-subtle">{t.minimum === 0 ? "any score" : `Ethos ${t.minimum.toLocaleString()}+`} · {t.ltv}% LTV</span>
                    {yours && <span className="badge-info">You</span>}
                  </span>
                  <span className="font-mono tabular-nums text-slate-50 font-semibold">
                    {amount === undefined ? "…" : `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${loan}`}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${yours ? "bg-brand-500" : "bg-ethos-400/70"}`}
                    style={{ width: `${max > 0 && amount !== undefined ? (amount / max) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-micro text-subtle">
            Maximum borrow at each tier's LLTV. The borrow form suggests less, keeping a 1.5 health factor.
          </p>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const items = [
    {
      n: "01",
      t: "Reputation sets the terms",
      d: "Your Ethos score is signed for your wallet and checked on-chain by the market's gate. It decides which tier, and which LTV, you can open debt on.",
    },
    {
      n: "02",
      t: "Bitcoin secures the loan",
      d: "BTC on Mezo is the only collateral. An on-chain oracle values it, and a loan below a 1.0 health factor can be liquidated by anyone.",
    },
    {
      n: "03",
      t: "Fixed terms, open exits",
      d: `MUSD is lent at a fixed rate until ${MATURITY_LABEL}. Repaying and withdrawing collateral never check your score.`,
    },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {items.map((i) => (
        <div key={i.n} className="rounded-xl border border-line p-5">
          <span className="font-mono text-micro text-brand-300">{i.n}</span>
          <div className="mt-1.5 text-body font-semibold text-slate-50">{i.t}</div>
          <p className="mt-1.5 text-body-sm text-subtle leading-relaxed">{i.d}</p>
        </div>
      ))}
    </div>
  );
}
