import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { EthosMark, IconArrowRight } from "./icons";
import { useEthosCredit } from "../hooks/useEthosScore";
import { useTradingCapacity } from "../hooks/useTradingCapacity";
import { fmtMoney } from "../lib/format";
import { CREDIT_DEPLOYED } from "../config/credit";

/**
 * Trading capacity — the product's thesis as a component.
 *
 * Three stacked statements, top to bottom:
 *
 *   [Ethos mark] 1,305     ← the signal, ATTRIBUTED (violet = Ethos's number)
 *   ↓ terms at your tier
 *   $3,850 available        ← what an order can actually spend
 *   [ used | available ]    ← where the trader's capital stands
 *
 * The bar's filled segment is "working" capital (locked in positions), the
 * open segment is spendable, and the scale is the total. Collateral is the
 * foundation of both — the caption says so in one line, not a paragraph.
 *
 * Disconnected state is not a blank: the panel states the deal (capacity is
 * wallet-bound) and offers the connect action, so the module teaches the
 * product even before it has numbers.
 */
export function CapacityPanel() {
  const { isConnected } = useAccount();
  const ethos = useEthosCredit();
  const cap = useTradingCapacity();

  if (!isConnected) {
    return (
      <div className="card">
        <div className="p-5 flex flex-col">
          <div className="section-label">Trading capacity</div>
          <div className="mt-3 flex items-center gap-2.5">
            <EthosMark className="w-4 h-4 text-ethos-600" />
            <span className="text-body-sm text-slate-300">Ethos credibility</span>
          </div>
          <p className="mt-3 text-body-sm text-subtle leading-relaxed">
            Connect a Somnia wallet to see your Ethos-attributed credibility and the
            collateralized trading capacity it earns.
          </p>
           <div className="mt-5 h-1.5 rounded-full bg-ink-900 overflow-hidden flex">
            <div className="h-full flex-[2] bg-ok/40" />
            <div className="h-full flex-1 bg-ethos-500/40" />
          </div>
          <div className="mt-2 flex justify-between text-micro text-subtle">
            <span>collateral</span>
            <span>reputation</span>
          </div>
        </div>
      </div>
    );
  }

  const usedPct = cap.total > 0 ? Math.min(100, (cap.inPositions / cap.total) * 100) : 0;

  return (
    <div className="card">
      <div className="p-5 flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="section-label">Trading capacity</div>
          <Link
            to="/credit"
            className="link text-micro inline-flex items-center gap-1 whitespace-nowrap"
          >
            Breakdown
            <IconArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* The signal — attributed. Violet mark BESIDE the figure, Ethos's
            name on the label, "verified by" phrasing below. Nothing here can
            read as Covenant scoring the user. */}
        <div className="mt-4 flex items-center gap-2.5">
          <EthosMark className="w-[18px] h-[18px] text-ethos-600 flex-shrink-0" />
          {ethos.isLoading ? (
            <span className="skeleton h-6 w-16" />
          ) : (
            <span className="font-mono text-[1.375rem] leading-none font-semibold text-ethos-600 tabular-nums">
              {(ethos.data?.score ?? 0).toLocaleString()}
            </span>
          )}
          <span className="text-micro text-subtle">{ethos.tier.name} tier</span>
        </div>
        <div className="mt-1.5 text-micro text-subtle">
          Ethos credibility · verified reputation signal from{" "}
          <a
            href="https://app.ethos.network"
            target="_blank"
            rel="noreferrer"
            className="link"
          >
            Ethos
          </a>
        </div>

        {/* The number an order can spend. */}
        <div className="mt-5 pt-4 border-t border-line">
          <div className="stat-label">Available to trade</div>
          <div className="mt-1 font-mono text-[1.75rem] leading-tight font-semibold text-slate-50 tabular-nums tracking-[-0.02em]">
            {cap.isLoading ? <span className="skeleton h-8 w-24 inline-block align-middle" /> : fmtMoney(cap.available)}
          </div>
          <div className="mt-1 text-micro text-subtle">
            wallet collateral{CREDIT_DEPLOYED && cap.availableCredit > 0 ? " + undrawn credit" : ""}
          </div>
        </div>

        {/* Where capital stands: working vs ready. */}
        <div className="mt-4">
           <div className="h-1.5 rounded-full bg-ink-900 overflow-hidden flex">
            <div
              className="h-full bg-brand-500/70 transition-[width] duration-500"
              style={{ width: `${usedPct}%` }}
              title={`${fmtMoney(cap.inPositions)} in positions`}
            />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 text-micro">
            <span className="text-muted">
              <span className="font-mono text-slate-300 tabular-nums">
                {fmtMoney(cap.inPositions)}
              </span>{" "}
              in positions
            </span>
            <span className="text-subtle">
              total{" "}
              <span className="font-mono text-slate-300 tabular-nums">
                {fmtMoney(cap.total)}
              </span>
            </span>
          </div>
        </div>

        <p className="mt-4 pt-4 border-t border-line text-micro text-subtle leading-relaxed">
          Collateral remains the foundation of every position — Ethos credibility
          sets the terms, it never replaces it.
        </p>
      </div>
    </div>
  );
}
