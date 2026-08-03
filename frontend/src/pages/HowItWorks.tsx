import { Link } from "react-router-dom";

/**
 * Plain-language walkthrough of the whole stack. Mirrors Explanation.md but for people who prefer
 * clicking to reading — a hackathon-friendly explainer. Fully static, no on-chain reads.
 *
 * Styled to match the app's teal-glow design language: numbered step indicators for the offer flow,
 * card layout for each layer, a decorative gradient "trust curve" chart at the end.
 */
export function HowItWorks() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="text-center space-y-3">
        <div className="badge-info inline-flex">Covenant · compliance-native credit</div>
        <h1 className="text-3xl md:text-4xl font-bold text-slate-50 tracking-tight">How Covenant works</h1>
        <p className="max-w-2xl mx-auto text-sm text-muted">
          Fixed-rate credit for regulated institutions. The whole system in one page — the offer
          flow, the compliance gate, and the wrapped-A-token layer that closes the flash-loan surface.
        </p>
      </header>

      {/* ── Step indicator: the offer lifecycle ──────────────────────── */}
      <StepIndicator
        steps={[
          { n: 1, label: "Lender signs offer",   active: true  },
          { n: 2, label: "Taker fills on-chain", active: false },
          { n: 3, label: "Compliance verified",  active: false },
        ]}
      />

      {/* ── Three cards: the offer's journey ─────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-5">
        <StepCard
          n={1}
          title="Sign off-chain"
          body="A lender signs an EIP-712 Offer struct — market, side, price, expiry, max size — and publishes the signature. Zero gas until someone fills."
          hint="offchain/sign_offer.js"
        />
        <StepCard
          n={2}
          title="Fill on-chain"
          body={
            <>
              A taker pastes the signed JSON into the{" "}
              <Link to="/markets" className="link">Take offer</Link> tab and calls <code className="text-brand-300">fillOffer(...)</code>.
              The engine ratifies the signature via the offer's notary.
            </>
          }
          hint="src/Covenant.sol · src/notaries/EcrecoverNotary.sol"
        />
        <StepCard
          n={3}
          title="Gate fires in-tx"
          body="Before positions update, the market gate does isRegistered → paused → verify(wallet) against a Cleanverse compliance pool. Any failure denies, in the same transaction."
          hint="src/compliance/CleanversePoolGate.sol"
          glow
        />
      </div>

      {/* ── The four layers ──────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle title="The four layers" subtitle="Each layer talks to the one below through a narrow, view-only interface." />
        <div className="grid md:grid-cols-2 gap-5">
          <LayerCard
            index="01"
            title="Frontend"
            path="frontend/"
            body="React + wagmi SPA. Reads market state from Covenant.toMarket(id); submits fills via fillOffer. No backend of our own — the marketplace is whatever channel the maker uses to publish signed offers."
          />
          <LayerCard
            index="02"
            title="Off-chain services"
            path="offchain/"
            body="sign_offer.js (EIP-712 offer producer) and cleanverse_client.py (Cooperate API client, AES-CBC, api-id header). The client's attestable property mirrors the on-chain gate's fail-closed rule so the two halves can never disagree."
          />
          <LayerCard
            index="03"
            title="Credit engine"
            path="src/Covenant.sol"
            body="The fixed-maturity credit primitive. Market identity is the keccak of every field including gate addresses, so a market's compliance policy cannot be silently rebound after creation."
          />
          <LayerCard
            index="04"
            title="Compliance surface"
            path="src/compliance/"
            body="Gates decide 'may this account open a position?'; WrappedAToken decides 'may this account receive these tokens?'. Same isRegistered → paused → verify staticcall, same 150k gas cap, same fail-closed rule."
            glow
          />
        </div>
      </section>

      {/* ── The flash-loan story ──────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionTitle
          title="Closing the flash-loan surface"
          subtitle="The one thing a per-market gate can't close is flashLoan — it lives on the core, not per-market. The fix is to move the check to the token."
        />
        <div className="card p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="stat-label">Without WrappedAToken</div>
              <div className="stat-value-down">Open</div>
              <p className="text-sm text-muted">
                <code className="text-slate-200">covenant.flashLoan([USDC], amt, callback)</code> succeeds for any wallet.
                A non-compliant callback receives compliant-market liquidity for a single transaction.
              </p>
            </div>
            <div className="space-y-2">
              <div className="stat-label">With WrappedAToken</div>
              <div className="stat-value-up">Closed</div>
              <p className="text-sm text-muted">
                <code className="text-slate-200">safeTransfer(waUSDC → callback)</code> reverts with{" "}
                <code className="text-brand-300">RecipientNotCompliant</code> inside the token, before the callback runs.
                Proven by <span className="font-mono text-slate-200">WrappedATokenFlashLoanTest</span>.
              </p>
            </div>
          </div>
          {/* Decorative "trust curve" chart in the reference style. */}
          <div className="relative h-40 rounded-xl border border-line bg-ink-900/40 overflow-hidden">
            <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="trustFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="#22d3c2" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#22d3c2" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 110 C 60 100, 120 70, 200 45 S 340 20, 400 15 L 400 120 L 0 120 Z"
                fill="url(#trustFill)"
              />
              <path
                d="M0 110 C 60 100, 120 70, 200 45 S 340 20, 400 15"
                fill="none" stroke="#4feadb" strokeWidth="1.5"
              />
            </svg>
            <div className="absolute top-3 left-4 text-[11px] uppercase tracking-widest text-muted">Coverage over exposure surface</div>
            <div className="absolute bottom-3 right-4 text-[11px] uppercase tracking-widest text-brand-300">gate + token = 100%</div>
          </div>
        </div>
      </section>

    </section>
  );
}

/* ── primitives ─────────────────────────────────────────────────────── */

function StepIndicator({ steps }: { steps: { n: number; label: string; active: boolean }[] }) {
  return (
    <div className="step-row">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className={s.active ? "step-dot-active" : "step-dot"}>{s.n}</div>
            <span className={s.active ? "step-label-active" : "step-label"}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="step-connector" />}
        </div>
      ))}
    </div>
  );
}

function StepCard(
  { n, title, body, hint, glow }: { n: number; title: string; body: React.ReactNode; hint: string; glow?: boolean }
) {
  return (
    <div className={glow ? "card-glow p-5 space-y-3" : "card p-5 space-y-3"}>
      <div className="flex items-center gap-3">
        <div className={n === 3 ? "step-dot-active" : "step-dot-done"}>{n}</div>
        <div className="card-title">{title}</div>
      </div>
      <div className="text-sm text-slate-300 leading-relaxed">{body}</div>
      <div className="stat-hint font-mono">{hint}</div>
    </div>
  );
}

function LayerCard(
  { index, title, path, body, glow }: { index: string; title: string; path: string; body: string; glow?: boolean }
) {
  return (
    <div className={glow ? "card-glow p-5 space-y-3" : "card p-5 space-y-3"}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] font-mono text-brand-300 tracking-widest">{index}</span>
          <div className="card-title">{title}</div>
        </div>
        <span className="text-[10px] font-mono text-subtle">{path}</span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <p className="text-sm text-muted">{subtitle}</p>
    </div>
  );
}
