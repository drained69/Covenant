import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useEthosCredit } from "../hooks/useEthosScore";
import { useDreamDexQuoteBalance } from "../hooks/useDreamDex";
import { useGateAuthorization } from "../hooks/useCovenant";
import { useTradingCapacity } from "../hooks/useTradingCapacity";
import { CREDIT_DEPLOYED, tierForScore } from "../config/credit";
import { ETHOS_SETTINGS_URL, ETHOS_TIERS, ethosProfileUrl } from "../config/dreamdex";
import { EthosMark, IconExternal, IconArrowRight } from "../components/icons";
import { shortAddr } from "../lib/format";
import { useState } from "react";

/**
 * Credit — the capacity page.
 *
 * One number leads: available to trade, at figure scale. Everything else on
 * the page explains where that number came from:
 *
 *   Ethos credibility (attributed, violet)  →  the signal
 *   + wallet collateral                     →  the foundation
 *   − current exposure                      →  what's working
 *   = available                             →  what's spendable
 *
 * The tiers table and the linking flow for X-native users follow. As
 * everywhere else: missing data degrades to the conservative Open tier and
 * never blocks exits.
 */
export function Credit() {
  const { address, isConnected } = useAccount();
  const { data, isLoading, isError, error, tier } = useEthosCredit();
  const quote = useDreamDexQuoteBalance();
  const cap = useTradingCapacity();
  const tierKey = tierForScore(data?.score ?? 0);
  const gateAuth = useGateAuthorization(tierKey);
  const authorized = CREDIT_DEPLOYED && (gateAuth.data as boolean | undefined) === true;

  return (
    <section className="shell py-10 lg:py-12 space-y-8">
      <header className="max-w-2xl">
        <div className="section-label text-brand-500">Your credit</div>
        <h1 className="mt-2 text-h2 text-slate-50">Available capacity, explained.</h1>
        <p className="mt-3 text-body text-muted leading-relaxed">
          Every figure below is live: the reputation signal comes from Ethos, collateral
          comes from your wallet, and the limit they produce is transparent — never a
          black box.
        </p>
      </header>

      {/* The number, then its derivation. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-stretch">
        <div className="card">
          <div className="p-6">
            <div className="stat-label">Available to trade</div>
            <div className="mt-1.5 font-mono text-[2.75rem] leading-none font-semibold text-slate-50 tabular-nums tracking-[-0.03em]">
              {!isConnected ? (
                <span className="text-subtle">—</span>
              ) : cap.isLoading ? (
                <span className="skeleton h-11 w-40 inline-block align-middle" />
              ) : (
                <span className="text-ok">${cap.available.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              )}
            </div>
            <div className="mt-2 text-body-sm text-subtle">
              {!isConnected
                ? "Connect a Somnia wallet to compute your capacity."
                : `spendable across every live Event Contract · ${cap.positionCount} open position${cap.positionCount === 1 ? "" : "s"}`}
            </div>

            {/* The capacity bar: working vs ready against the total. */}
            <div className="mt-6">
              <CapacityBar cap={cap} />
            </div>

            {/* Derivation, ledger-style. */}
            <dl className="mt-6 divide-y divide-line border-t border-line">
              <DerivationRow
                label="Wallet collateral"
                value={quote.formatted !== undefined ? `$${quote.formatted.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                note="TestUSDC held — the foundation"
              />
              <DerivationRow
                label="Undrawn credit"
                value={CREDIT_DEPLOYED ? `$${cap.availableCredit.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                note={CREDIT_DEPLOYED ? `${tier.name} tier · up to ${tier.ltv}% LTV against posted collateral` : "tier credit markets pending deployment"}
              />
              <DerivationRow
                label="Working in positions"
                value={cap.inPositions > 0 ? `−$${cap.inPositions.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "$0"}
                note="mark-to-market value of open positions"
              />
            </dl>

            {CREDIT_DEPLOYED && (
               <div className="mt-5 rounded-lg border border-line bg-ink-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`status-dot ${authorized ? "status-dot-ok" : "status-dot-idle"}`} />
                  <span className="text-body-sm text-slate-300">
                    {authorized
                      ? `Score authorized at the ${tierKey} gate — borrowing is live`
                      : "Score not yet authorized at the gate"}
                  </span>
                </div>
                <Link
                  to="/markets"
                  className="link text-body-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  Borrow from any market
                  <IconArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {isError && (
              <p className="mt-4 text-body-sm text-subtle leading-relaxed">
                Ethos returned: {error instanceof Error ? error.message : "unknown error"}.
                Unscored wallets trade at the conservative Open tier — missing data never
                blocks trading or exits.
              </p>
            )}
          </div>
        </div>

        {/* The signal, attributed. */}
        <div className="space-y-5">
          <div className="card">
            <div className="p-6">
              <div className="section-label">Ethos credibility</div>
              <div className="mt-3 flex items-center gap-3">
                <EthosMark className="w-6 h-6 text-ethos-600 flex-shrink-0" />
                {isLoading ? (
                  <span className="skeleton h-9 w-20" />
                ) : (
                  <span className="font-mono text-[1.75rem] leading-none font-semibold text-ethos-600 tabular-nums">
                    {(data?.score ?? 0).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-2 text-body-sm text-subtle">
                {isError ? "no profile found for this address" : (data?.level ?? "—")} ·{" "}
                {tier.name} tier
              </div>
              <p className="mt-4 text-micro text-subtle leading-relaxed">
                A verified reputation signal, computed by Ethos from reviews earned on X.
                Covenant reads it — never generates it.
              </p>
              {isConnected && (
                <a
                  href={ethosProfileUrl(address!)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 link text-body-sm inline-flex items-center gap-1.5"
                >
                  {shortAddr(address)} on Ethos
                  <IconExternal className="w-3.5 h-3.5 opacity-60" />
                </a>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Credit tiers</div>
                <div className="text-body-sm text-subtle mt-0.5">
                  Published thresholds, not a black box
                </div>
              </div>
            </div>
            <div className="divide-y divide-line">
              {ETHOS_TIERS.map((t) => {
                const active = t.name === tier.name && isConnected;
                return (
                  <div
                    key={t.name}
                    className={`px-5 py-4 flex items-center justify-between gap-4 ${
                      active ? "bg-brand-500/[0.06]" : ""
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-body-sm font-semibold ${active ? "text-brand-300" : "text-slate-200"}`}>
                          {t.name}
                        </span>
                        {active && <span className="badge-info">your tier</span>}
                      </div>
                      <div className="mt-0.5 text-micro text-subtle">
                        Ethos score {t.minimum === 0 ? "below 1,600" : `${t.minimum.toLocaleString()}+`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-body-lg text-slate-50 tabular-nums">{t.ltv}%</div>
                      <div className="text-micro text-subtle">max LTV</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="card-footer">
              <span className="text-subtle">Illustrative testnet policy</span>
              <Link to="/docs/credit-ladder" className="link text-body-sm inline-flex items-center gap-1.5">
                How tiers work <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* X-native onboarding: only surfaces for wallets stuck at Open. */}
      {isConnected && !isLoading && tierKey === "open" && (
        <EthosBindingCard address={address!} />
      )}
    </section>
  );
}

/* ── capacity parts ──────────────────────────────────────────────────── */

function CapacityBar({ cap }: { cap: ReturnType<typeof useTradingCapacity> }) {
  const usedPct = cap.total > 0 ? Math.min(100, (cap.inPositions / cap.total) * 100) : 0;
  return (
    <div>
       <div className="h-2.5 rounded-full bg-ink-900 overflow-hidden flex">
        <div
          className="h-full bg-brand-500/70 transition-[width] duration-500"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-micro">
        <span className="text-muted">
          <span className="font-mono text-slate-200 tabular-nums">$0</span> ·{" "}
          <span className="font-mono text-brand-300 tabular-nums">
            ${cap.inPositions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>{" "}
          working
        </span>
        <span className="text-muted">
          <span className="font-mono text-ok tabular-nums">
            ${cap.available.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>{" "}
          available of{" "}
          <span className="font-mono text-slate-200 tabular-nums">
            ${cap.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
    </div>
  );
}

function DerivationRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="def-row py-3.5">
      <div>
        <dt className="text-body-sm text-slate-200">{label}</dt>
        <dd className="mt-0.5 text-micro text-subtle">{note}</dd>
      </div>
      <dd className="font-mono text-body-sm font-medium text-slate-100 tabular-nums">{value}</dd>
    </div>
  );
}

/* ── reputation onboarding ───────────────────────────────────────────── */

/**
 * The guided wallet-linking path for X-native users.
 *
 * Why there is no "connect X" button anywhere in Covenant: the on-chain tier
 * gates authorize WALLET-bound scores (the service signs wallet + score as
 * one authorization), so a handle-imported score would let any wallet claim
 * any handle's reputation. The X↔Ethos binding happens on Ethos's side —
 * users sign in there with X, and their profile lists the wallet addresses
 * the score applies to. Covenant's job is to send the user to that binding
 * with the exact address to paste, and to make the mechanism legible.
 */
function EthosBindingCard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard unavailable — the full address stays selectable below. */
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="section-label text-brand-300">Reputation onboarding</div>
          <div className="card-title mt-1">Bring your X reputation on-chain</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Scores are built on X, bound on Ethos, read here by wallet
          </div>
        </div>
        <span className="badge-neutral">Ethos</span>
      </div>
      <div className="card-body">
        <p className="text-body-sm text-slate-300 leading-relaxed max-w-3xl">
          Ethos credibility is built from reviews on X — but Covenant never reads your X
          account. It reads the score bound to <span className="text-slate-100">this
          wallet</span> on your Ethos profile. If your reputation isn't showing here, the
          two aren't linked yet; connect them and your tier upgrades automatically on the
          next visit.
        </p>

        <div className="mt-5 grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line rounded-lg border border-line">
          {[
            {
              n: "01",
              title: "Sign in on Ethos",
              text: "Your X account is the login at app.ethos.network — your score already lives there.",
            },
            {
              n: "02",
              title: "Add this wallet",
              text: "Paste the address below into your Ethos profile's wallet list.",
            },
            {
              n: "03",
              title: "Reconnect & trade",
              text: "Score, tier, and borrowing terms update automatically — nothing to re-apply.",
            },
          ].map((step) => (
            <div key={step.n} className="p-4">
              <span className="font-mono text-micro text-brand-300">{step.n}</span>
              <div className="mt-1.5 text-body-sm font-semibold text-slate-50">{step.title}</div>
              <p className="mt-1 text-body-sm text-subtle leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px] rounded-lg border border-line bg-ink-900/60 px-3 py-2 font-mono text-body-sm text-slate-200 break-all select-all">
            {address}
          </div>
          <button className="btn-secondary btn-sm" onClick={copyAddress}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <a
            href={ETHOS_SETTINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            Open Ethos settings
            <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className="mt-4 text-micro text-subtle leading-relaxed">
          Wallets with no Ethos profile trade at the conservative Open tier — missing data
          never blocks trading, borrowing below your tier, or exits.
        </p>
      </div>
    </div>
  );
}
