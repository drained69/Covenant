import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { CREDIT, CREDIT_TOKENS, type TierKey } from "../config/credit";
import { ETHOS_TIERS } from "../config/dreamdex";
import { EXPLORER } from "../config/chain";
import { displayLoan, liquidationBonus, type MarketStats } from "../hooks/useCovenant";
import { fmtPct, shortAddr } from "../lib/format";
import { IconArrowRight, IconCheck, IconCopy, IconExternal } from "./icons";

export const TIERS: TierKey[] = ["open", "established", "reputable"];

export const tierMeta = (tier: TierKey) => ETHOS_TIERS.find((t) => t.name.toLowerCase() === tier)!;

export const MATURITY_LABEL = new Date(CREDIT.maturity * 1000).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const daysToMaturity = () => Math.max(0, Math.ceil((CREDIT.maturity * 1000 - Date.now()) / 86_400_000));

/* ── stat strip ─────────────────────────────────────────────────────── */

export type StatItem = { label: string; value: React.ReactNode; sub?: React.ReactNode };

export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="card grid grid-cols-2 lg:grid-flow-col lg:auto-cols-fr divide-line [&>*]:border-line">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`px-5 py-4 min-w-0 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i > 0 ? "lg:border-l" : ""}`}
        >
          <div className="stat-label">{item.label}</div>
          <div className="mt-1.5 text-[1.25rem] leading-tight font-semibold text-slate-50 tabular-nums tracking-[-0.02em] truncate">
            {item.value}
          </div>
          {item.sub && <div className="mt-1 text-micro text-subtle truncate">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── health ─────────────────────────────────────────────────────────── */

export function healthTone(hf: number | undefined): "ok" | "warn" | "bad" | "idle" {
  if (hf === undefined) return "idle";
  if (hf < 1) return "bad";
  if (hf < 1.25) return "warn";
  return "ok";
}

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad", idle: "text-subtle" } as const;
const TONE_BG = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", idle: "bg-subtle" } as const;

export function HealthFactor({ value, className = "" }: { value: number | undefined; className?: string }) {
  const tone = healthTone(value);
  return (
    <span className={`tabular-nums ${TONE_TEXT[tone]} ${className}`}>
      {value === undefined ? "∞" : value > 99 ? ">99" : value.toFixed(2)}
    </span>
  );
}

/** Position on a 1.0 → 3.0 scale; 1.0 is the liquidation line. */
export function HealthBar({ value }: { value: number | undefined }) {
  const tone = healthTone(value);
  const pct = value === undefined ? 100 : Math.max(2, Math.min(100, ((value - 1) / 2) * 100));
  return (
    <div className="relative h-1.5 rounded-full bg-ink-800 overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full ${TONE_BG[tone]} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function HealthBadge({ value, hasDebt }: { value: number | undefined; hasDebt: boolean }) {
  if (!hasDebt) return <span className="badge-neutral">No debt</span>;
  const tone = healthTone(value);
  if (tone === "bad") return <span className="badge-bad">Liquidatable</span>;
  if (tone === "warn") return <span className="badge-warn">At risk</span>;
  return <span className="badge-ok">Healthy</span>;
}

/* ── addresses ──────────────────────────────────────────────────────── */

export function AddressValue({ address, label }: { address: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <span className="text-subtle">—</span>;
  const isId = address.length > 42;
  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-body-sm text-slate-200">
      {label && <span className="font-sans text-slate-300">{label}</span>}
      <span title={address}>{shortAddr(address)}</span>
      <button
        type="button"
        onClick={copy}
        className="p-1 rounded text-subtle hover:text-slate-100 hover:bg-ink-900 transition-colors"
        aria-label={`Copy ${isId ? "id" : "address"}`}
      >
        {copied ? <IconCheck className="w-3.5 h-3.5 text-ok" /> : <IconCopy className="w-3.5 h-3.5" />}
      </button>
      {!isId && (
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="p-1 rounded text-subtle hover:text-slate-100 hover:bg-ink-900 transition-colors"
          aria-label="Open in explorer"
        >
          <IconExternal className="w-3.5 h-3.5" />
        </a>
      )}
    </span>
  );
}

export function ParamRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-body-sm text-slate-300">{label}</div>
        {hint && <div className="mt-0.5 text-micro text-subtle">{hint}</div>}
      </div>
      <div className="text-right text-body-sm font-medium text-slate-100 tabular-nums">{children}</div>
    </div>
  );
}

/* ── asset pair ─────────────────────────────────────────────────────── */

export function AssetPair({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[10px]";
  return (
    <span className="inline-flex -space-x-2 flex-shrink-0" aria-hidden="true">
      <span className={`${dim} rounded-full bg-[#f7931a] text-white font-bold grid place-items-center ring-2 ring-surface-raised`}>
        ₿
      </span>
      <span className={`${dim} rounded-full bg-brand-500 text-[#f4f0e5] font-bold grid place-items-center ring-2 ring-surface-raised`}>
        M
      </span>
    </span>
  );
}

/* ── markets table ──────────────────────────────────────────────────── */

export function MarketsTable({
  stats,
  yourTier,
  onBorrow,
}: {
  stats: Record<TierKey, MarketStats | undefined>;
  yourTier: TierKey | undefined;
  onBorrow: (tier: TierKey) => void;
}) {
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const loan = CREDIT_TOKENS.loan.symbol;

  return (
    <>
    <div className="md:hidden space-y-3">
      {TIERS.map((tier) => {
        const meta = tierMeta(tier);
        const s = stats[tier];
        const yours = isConnected && yourTier === tier;
        const locked = isConnected && yourTier !== undefined && yourTier !== tier;
        return (
          <div key={tier} className={`card p-4 ${yours ? "ring-1 ring-brand-500/30" : ""}`}>
            <Link to={`/markets/${tier}`} className="flex items-center gap-3">
              <AssetPair size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-body font-semibold text-slate-50">{meta.name}</span>
                  {yours && <span className="badge-info">Your tier</span>}
                </div>
                <div className="text-micro text-subtle">
                  {meta.minimum === 0 ? "Any Ethos score" : `Ethos ${meta.minimum.toLocaleString()}+`}
                </div>
              </div>
              <IconArrowRight className="w-4 h-4 text-subtle" />
            </Link>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-body-sm">
              <div>
                <dt className="text-micro text-subtle">Max LTV</dt>
                <dd className="font-mono tabular-nums text-slate-50">{meta.ltv}%</dd>
              </div>
              <div>
                <dt className="text-micro text-subtle">Fixed APR</dt>
                <dd className="font-mono tabular-nums text-slate-50">0.00%</dd>
              </div>
              <div>
                <dt className="text-micro text-subtle">Available</dt>
                <dd className="font-mono tabular-nums text-slate-50">{s?.liquidity !== undefined ? displayLoan(s.liquidity, 0) : "…"}</dd>
              </div>
            </dl>
            <div className="mt-4">
              {!isConnected ? (
                <button type="button" className="btn-secondary btn-sm w-full" onClick={openConnectModal}>Connect wallet</button>
              ) : locked ? (
                <p className="text-micro text-subtle text-center">{meta.minimum > 0 ? `Requires Ethos ${meta.minimum.toLocaleString()}+` : "Your score opens a higher tier"}</p>
              ) : (
                <button type="button" className="btn-primary btn-sm w-full" onClick={() => onBorrow(tier)}>Borrow {loan}</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
    <div className="card overflow-hidden hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[880px]">
          <thead>
            <tr className="text-micro uppercase text-subtle border-b border-line bg-ink-900/40">
              <th className="px-5 py-3 font-semibold">Market</th>
              <th className="px-3 py-3 font-semibold text-right">Max LTV</th>
              <th className="px-3 py-3 font-semibold text-right">Fixed APR</th>
              <th className="px-3 py-3 font-semibold text-right">Total borrowed</th>
              <th className="px-3 py-3 font-semibold text-right">Available</th>
              <th className="px-3 py-3 font-semibold text-right">Utilization</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {TIERS.map((tier) => {
              const meta = tierMeta(tier);
              const s = stats[tier];
              const yours = isConnected && yourTier === tier;
              const locked = isConnected && yourTier !== undefined && yourTier !== tier;
              return (
                <tr
                  key={tier}
                  onClick={() => navigate(`/markets/${tier}`)}
                  className={`cursor-pointer transition-colors hover:bg-ink-900/50 ${yours ? "bg-brand-500/[0.05]" : ""}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <AssetPair />
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/markets/${tier}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-body font-semibold text-slate-50"
                          >
                            {meta.name}
                          </Link>
                          {yours && <span className="badge-info">Your tier</span>}
                        </div>
                        <div className="mt-0.5 text-micro text-subtle">
                          BTC → {loan} · {meta.minimum === 0 ? "any Ethos score" : `Ethos ${meta.minimum.toLocaleString()}+`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="font-mono text-body text-slate-50 tabular-nums">{meta.ltv}%</div>
                    <div className="text-micro text-subtle">{fmtPct(liquidationBonus(tier), 1)} liq. bonus</div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <div className="font-mono text-body text-slate-50 tabular-nums">0.00%</div>
                    <div className="text-micro text-subtle">until {MATURITY_LABEL}</div>
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-body text-slate-100 tabular-nums">
                    {s ? displayLoan(s.borrowed) : <span className="skeleton h-4 w-16 inline-block" />}
                    <div className="text-micro text-subtle font-sans">{loan}</div>
                  </td>
                  <td className="px-3 py-4 text-right font-mono text-body text-slate-100 tabular-nums">
                    {s?.liquidity !== undefined ? displayLoan(s.liquidity) : <span className="skeleton h-4 w-16 inline-block" />}
                    <div className="text-micro text-subtle font-sans">{loan}</div>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <UtilizationCell value={s?.utilization} />
                  </td>
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {!isConnected ? (
                        <button type="button" className="btn-secondary btn-sm" onClick={openConnectModal}>
                          Connect
                        </button>
                      ) : locked ? (
                        <span className="text-micro text-subtle whitespace-nowrap" title="Your Ethos score opens a different market">
                          {meta.minimum > 0 ? `Needs ${meta.minimum.toLocaleString()}` : "Higher tier open"}
                        </span>
                      ) : (
                        <button type="button" className="btn-primary btn-sm" onClick={() => onBorrow(tier)}>
                          Borrow
                        </button>
                      )}
                      <Link to={`/markets/${tier}`} className="btn-ghost btn-sm" aria-label={`${meta.name} market details`}>
                        <IconArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function UtilizationCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="skeleton h-4 w-12 inline-block" />;
  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <span className="font-mono text-body text-slate-100 tabular-nums">{fmtPct(value, 1)}</span>
      <span className="w-16 h-1 rounded-full bg-ink-800 overflow-hidden">
        <span className="block h-full bg-brand-400" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
    </div>
  );
}
