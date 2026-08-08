import { Link } from "react-router-dom";
import { IconCheck, IconArrowRight } from "./icons";

const TRUST_ITEMS = [
  "Compliance verified in-transaction",
  "Fixed-rate, fixed-maturity credit",
  "Non-custodial settlement",
];

export function Hero() {
  return (
    <section className="border-b border-line">
      {/*
        The blueprint grid overlay is gone. A faint tiled graticule behind a
        headline is the single most recognisable "crypto landing page" tell —
        Stripe, Modern Treasury and Linear all put their hero on flat ground
        and let type and spacing carry it. Removing it also removes the
        `overflow-hidden` that was clipping the flow diagram's fork.

        Column split moves from 1.05fr/0.95fr to 1fr/1fr and gap widens to 20.
        The old ratio made the copy column marginally wider than the diagram
        while both were near-equal, which reads as a mistake rather than a
        decision; equal columns with a wider gutter reads as intentional.
      */}
      <div className="shell py-20 lg:py-28 grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        {/* ── Copy column ─────────────────────────────────────────────── */}
        <div>
          {/*
            The status dot no longer pulses. A perpetual animation in the first
            element of the page is decoration that never resolves; in premium
            software motion marks a state change, and "deployed" is not a
            changing state. The dot alone carries the signal.
          */}
          <div className="inline-flex items-center gap-2 mb-7 px-2.5 py-1 rounded border border-line-strong bg-white/[0.03] text-micro font-medium uppercase text-muted">
            <span className="status-dot-ok" />
            Monad Testnet · Live deployment
          </div>

          {/*
            The accent clause was `brand-300` — the interactive colour, spent on
            a non-interactive phrase. On a page whose only accent-filled element
            should be the primary CTA, colouring half the headline the same hue
            splits the eye between two "most important" things. The emphasis is
            now carried by weight and value contrast, which leaves the accent
            free to mean "you can click this".
          */}
          <h1 className="text-h1 md:text-display text-white max-w-xl text-balance">
            Institutional credit,{" "}
            <span className="text-slate-400">compliance-enforced at settlement.</span>
          </h1>

          {/*
            Vertical rhythm through the stack: 28 / 24 / 40 / 48. The paragraph
            sits closer to the headline than the buttons sit to the paragraph,
            so headline+paragraph group as one unit and the CTAs read as the
            response to it. Previously all three gaps were within 8px of each
            other, which left the block evenly spaced and therefore unranked.

            Measure tightens to max-w-md and colour lifts from `muted` to
            slate-300: at `body-lg` over ~32rem the old line length ran past
            comfortable, and `muted` (#9ca3af) on a paragraph this size is
            below where sustained reading is pleasant.
          */}
          <p className="mt-6 text-body-lg text-slate-300 max-w-md">
            Fixed-rate, fixed-maturity credit markets that check every counterparty's
            eligibility inside the settlement transaction — not once at onboarding,
            not from a cached flag, not off-chain.
          </p>

          {/*
            These were `<a href="/markets">` and `<a href="/how-it-works">`. In a
            react-router SPA a bare anchor triggers a full document reload: the
            bundle re-downloads, wagmi re-initialises, the wallet reconnects, and
            every query cache is discarded. The user sees a white flash and a
            second wallet handshake on the primary call to action — the single
            most damaging place in the product for that to happen.

            CTA hierarchy: the two buttons were a filled control and a bordered
            control of identical size, which reads as a pair of equals. The
            secondary is now a ghost link with a directional glyph, so there is
            exactly one filled control in the viewport and the ranking is
            unambiguous at a glance.
          */}
          <div className="mt-10 flex flex-wrap items-center gap-2">
            <Link to="/markets" className="btn-primary">
              Browse markets
            </Link>
            <Link to="/docs/how-it-works" className="btn-ghost group">
              How it works
              <IconArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/*
            Was a `<dl>` containing bare `<div>`s — a description list with no
            `<dt>`/`<dd>` pair inside it. Assistive tech announces "list, 0 items".
            It is a list of claims, so it is a `<ul>`.

            The checks were `brand-400`, again spending the interactive accent on
            static content. They are `ok` now, which is what a satisfied
            condition actually means in this palette.
          */}
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 pt-8 border-t border-line max-w-xl">
            {TRUST_ITEMS.map((label) => (
              <li key={label} className="flex items-center gap-2 text-body-sm text-slate-400">
                <IconCheck className="w-3.5 h-3.5 flex-shrink-0 text-ok" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Settlement flow ─────────────────────────────────────────── */}
        <SettlementFlow />
      </div>
    </section>
  );
}

/**
 * The settlement path, as an execution record rather than a diagram.
 *
 * The previous version was three rounded, tinted, individually-bordered node
 * cards joined by dashed rails, with the denial branch hung off an elbow. Every
 * node competing as its own surface is what made it read as an infographic —
 * the thing a marketing site draws — instead of a workflow a financial product
 * would show you.
 *
 * What institutional software actually renders here is a run log: one rule per
 * step, a fixed-width gutter carrying the sequence, the call that executes, and
 * the outcome right-aligned. That form is legible at a glance, survives more
 * steps being added, and needs no colour to establish its order — so the accent
 * can be reserved for the one node where the product's actual claim lives.
 */
function SettlementFlow() {
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <div>
          <div className="section-label">Settlement path</div>
          <div className="mt-1 text-body-sm font-mono text-slate-300">Covenant.fillOffer</div>
        </div>
        <span className="badge-neutral">Atomic</span>
      </div>

      <div>
        <FlowStep
          step="01"
          title="Offer signed off-chain"
          call="EIP-712 · lender or borrower"
          outcome="Zero gas"
        />
        <FlowStep
          step="02"
          title="Compliance gate fires"
          call="isRegistered() → complianceVerify()"
          outcome="Enforced"
          emphasized
        />
        <FlowStep
          step="03"
          title="Position settles on-chain"
          call="credit · debt · collateral"
          outcome="Atomic"
          last
        />
      </div>

      {/*
        The denial path was a chip on an elbow inside the diagram. As a footer
        rule it stops competing with the three steps for the same visual weight
        while still stating the outcome the product depends on — and it is now
        adjacent to the sentence that explains it, rather than floating above.
      */}
      <div className="px-6 py-4 border-t border-line bg-ink-950/40">
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-bad flex-shrink-0" />
          <p className="text-body-sm text-subtle">
            If the gate returns ineligible, the transaction reverts. There is no code
            path that settles a fill without this check.
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowStep({
  step, title, call, outcome, emphasized, last,
}: {
  step: string;
  title: string;
  call: string;
  outcome: string;
  emphasized?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`relative flex items-start gap-4 px-6 py-4 ${
        last ? "" : "border-b border-line"
      } ${emphasized ? "bg-brand-500/[0.04]" : ""}`}
    >
      {/* A 2px rule on the emphasized step's leading edge. This is the whole
          accent budget for the diagram — enough to say "this is the one that
          matters" without tinting a border, a fill and a badge to say it. */}
      {emphasized && (
        <span className="absolute left-0 inset-y-0 w-0.5 bg-brand-400" aria-hidden="true" />
      )}

      <span
        className={`mt-px flex-shrink-0 font-mono text-micro font-medium tabular-nums ${
          emphasized ? "text-brand-300" : "text-subtle"
        }`}
      >
        {step}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-0.5 text-micro font-mono text-subtle truncate">{call}</div>
      </div>

      <span
        className={`mt-px flex-shrink-0 text-micro font-medium uppercase ${
          emphasized ? "text-brand-300" : "text-subtle"
        }`}
      >
        {outcome}
      </span>
    </div>
  );
}
