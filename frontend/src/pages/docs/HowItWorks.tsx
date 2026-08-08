import { Link } from "react-router-dom";
import { IconCheck, IconX, IconArrowRight, IconShield, IconLayers } from "../../components/icons";
import { LADDER } from "../../config/chain";
import { DocPage, Section, StepCard, LayerCard } from "./_primitives";

/**
 * Plain-language walkthrough of the whole stack, for people who prefer clicking to reading.
 * Fully static, no on-chain reads.
 *
 * Design note: this page previously described itself as following the app's "teal-glow design
 * language," which is the opposite of what the theme actually does — the theme builds depth from
 * elevation (borders + shadow), and reserves brand cyan for interactive affordance. Glow on static
 * panels is the single loudest crypto-dashboard tell, so the accent here is used only to mark the
 * two cards that carry the page's actual argument.
 *
 * It now lives inside the docs section rather than standing alone at /how-it-works. The page-level
 * header and the shell wrapper come from DocsLayout and DocPage; StepCard, LayerCard, and
 * SectionTitle moved to _primitives.tsx so the sibling pages share them.
 */
export function HowItWorks() {
  return (
    <DocPage
      eyebrow="Protocol overview"
      title="How Covenant works"
      lede="The whole system in one page — the offer flow, the compliance gate, the credit ladder that prices a credential into leverage, and the wrapped-A-token layer that closes the flash-loan surface."
    >
      {/* ── The offer lifecycle ────────────────────────────────────────── */}
      <Section
        title="The offer lifecycle"
        subtitle="Three steps from a signed message to a settled position. Credit units are sold at a discount and redeemed 1:1 at maturity — the discount is the interest."
      >
        {/* The StepIndicator marked step 1 `active: true` and steps 2-3 inactive,
            which reads as "you are on step 1 of a wizard." Nothing on this page
            is interactive and no step is in progress — it's an explanation of a
            sequence, not a form. The indicator is gone; the numbered cards below
            already carry the ordering, and they carry it with the detail that
            makes the ordering worth showing. */}
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
                <Link to="/markets" className="link">Take offer</Link> tab and calls{" "}
                <code className="code-inline">fillOffer(...)</code>. The engine ratifies the
                signature via the offer's notary.
              </>
            }
            hint="src/Covenant.sol · src/notaries/EcrecoverNotary.sol"
          />
          <StepCard
            n={3}
            title="Gate fires in-tx"
            body={
              <>
                Before positions update, the market gate runs{" "}
                <code className="code-inline">isRegistered()</code> →{" "}
                <code className="code-inline">complianceVerify()</code> against the CVI Compliance
                Validator (CCP V2). Any failure reverts the transaction. A-Pass credentials are{" "}
                <strong>reusable</strong> — a wallet that passed once needs no re-verification.
              </>
            }
            hint="src/compliance/CleanversePoolGate.sol"
            emphasized
          />
        </div>
      </Section>

      {/* ── Getting verified ───────────────────────────────────────────────
          Added because the page described the gate's *check* in detail but never
          said how a wallet comes to pass it — the reader could follow the whole
          offer flow and still not know what to do about step 3 denying them.
          The load-bearing fact is that the credential is issued once and reused,
          which is also what the Get verified tab now reflects. */}
      <Section
        title="Getting verified"
        subtitle="The gate checks a credential; it does not issue one. An A-Pass is issued once per wallet and then reused on every fill."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Submit intake once"
            body={
              <>
                Identity details and a document go to Cleanverse from the{" "}
                <Link to="/compliance?tab=register" className="link">Get verified</Link> tab.
                Nothing about this step is on-chain.
              </>
            }
            hint="offchain/cleanverse_client.py"
          />
          <StepCard
            n={2}
            title="A-Pass is issued"
            body="Cleanverse binds the credential to the wallet address. From then on complianceVerify(pool, wallet) returns true without any further action from the holder."
            hint="IAPassComplianceValidator"
            emphasized
          />
          <StepCard
            n={3}
            title="Reused on every fill"
            body={
              <>
                Every subsequent fill, transfer, and flash-loan receipt re-reads the same
                credential. Re-running intake issues nothing new — the{" "}
                <Link to="/compliance" className="link">My status</Link> tab shows the live verdict
                instead.
              </>
            }
            hint="frontend/src/hooks/useCompliance.ts"
          />
        </div>

        <div className="card p-6 flex items-start gap-4 border-brand-500/25">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-300">
            <IconShield className="w-4 h-4" />
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="text-body font-semibold text-slate-100">
              Two conditions, both checked live
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Holding an A-Pass is only half the gate. The pool itself must also be registered with
              the validator — <code className="code-inline">isRegistered(pool)</code> — so a
              verified wallet can still be denied on an unregistered market. Neither result is
              cached on-chain; both are staticcalls made at the moment of the fill.
            </p>
          </div>
        </div>
      </Section>

      {/* ── The credit ladder ──────────────────────────────────────────────
          Added because the gate story stopped at a binary: you pass or you don't.
          That undersells what the credential actually carries. An A-Pass has a
          sub-tier, and because a gate's sub-tier bar is hashed into the market id,
          a market's leverage and its credential requirement are one object. That
          is the mechanism that turns compliance from a checkpoint into pricing —
          and it is the part of the design a reader is least likely to infer. */}
      <Section
        title="The credit ladder"
        subtitle="One gate answers yes or no. A ladder of gates answers on what terms. Better credentials clear a higher bar, and a higher bar carries more leverage."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <IconLayers className="w-4 h-4 text-brand-400" />
              <div className="card-title">Rungs</div>
            </div>
            <span className="text-micro font-semibold uppercase text-muted">
              Sub-tier bar → leverage
            </span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Rung
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Who clears it
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Sub-tier
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  LLTV
                </th>
              </tr>
            </thead>
            <tbody>
              {LADDER.rungs.map((rung) => (
                <tr key={rung.key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-slate-100">{rung.label}</td>
                  <td className="px-5 py-3.5 text-slate-300">{rung.qualifies}</td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-300">
                    {rung.minSubTier}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-100">
                    {((Number(rung.lltv) / 1e18) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-3 border-brand-500/30">
            <div className="card-title">Terms and policy are one object</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              A market id is the keccak of every field, gate address included. So the 91.5% market
              is cryptographically bound to its sub-tier-30 gate — nobody can offer that leverage to
              a wallet that clears a lower bar, because doing so would be a different market with a
              different id.
            </p>
          </div>
          <div className="card p-6 space-y-3">
            <div className="card-title">Under-collateralisation, earned</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Higher LLTV means less collateral for the same loan. A $100k borrow needs about $260k
              of collateral on the retail rung and about $109k on the institutional one — 2.4× less.
              The credential is what closes that gap, which makes verification worth something
              beyond access.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              src/periphery/CreditLadderLens.sol
            </div>
          </div>
        </div>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            The ladder page resolves your wallet against every rung in one{" "}
            <code className="code-inline">eth_call</code> and shows what each would require. The{" "}
            <Link to="/docs/credit-ladder" className="link">Credit ladder</Link> doc covers the
            sub-tier model and the current registration state of each rung.
          </p>
          <Link to="/ladder" className="btn-secondary flex-shrink-0">
            View the ladder
            <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* ── The four layers ──────────────────────────────────────────────── */}
      <Section
        title="The four layers"
        subtitle="Each layer talks to the one below through a narrow, view-only interface."
      >
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
            body="Gates decide 'may this account open a position?'; WrappedAToken decides 'may this account receive these tokens?'. Same isRegistered + complianceVerify staticcall against the CCP V2 validator, same 150k gas cap, same fail-closed rule."
            emphasized
          />
        </div>
      </Section>

      {/* ── The flash-loan story ──────────────────────────────────────────── */}
      <Section
        title="Closing the flash-loan surface"
        subtitle="The one thing a per-market gate can't close is flashLoan — it lives on the core, not per-market. The fix is to move the check to the token."
      >
        {/*
          The before/after pair was two `space-y-2` columns inside one card, with
          the verdicts set in `stat-value-down` and `stat-value-up`. Those
          primitives are for *figures* — 20px semibold tabular — so "Open" and
          "Closed" arrived looking like numeric readouts, and red/green on a word
          reads as gain/loss rather than open/closed.

          It's now two sibling panels: the comparison is the point, so the two
          states should be visibly separate surfaces rather than two halves of one.
          The verdict is a badge (which is what a two-state label is), and each
          panel carries the border tint of its own state.
        */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-4 border-bad/25">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">Without WrappedAToken</div>
              <span className="badge-bad">
                <IconX className="w-3 h-3" />
                Open
              </span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">covenant.flashLoan([USDC], amt, callback)</code>{" "}
              succeeds for any wallet. A non-compliant callback receives compliant-market
              liquidity for a single transaction.
            </p>
          </div>

          <div className="card p-6 space-y-4 border-ok/25">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">With WrappedAToken</div>
              <span className="badge-ok">
                <IconCheck className="w-3 h-3" />
                Closed
              </span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">safeTransfer(waUSDC → callback)</code> reverts with{" "}
              <code className="code-inline">RecipientNotCompliant</code> inside the token, before
              the callback runs.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              Proven by WrappedATokenFlashLoanTest
            </div>
          </div>
        </div>

        {/*
          Deleted here: a 400×120 SVG area chart labelled "Coverage over exposure
          surface" rising to "gate + token = 100%".

          It plotted nothing. The curve was a hand-authored bezier, both axes were
          unlabelled and unitless, and no value in it came from the protocol — a
          chart shape used as decoration. That is the exact move that separates a
          crypto dashboard from Stripe or Modern Treasury: in enterprise software a
          chart is a promise that you are looking at data, and an invented curve on
          a compliance page spends the reader's trust on nothing. It also carried
          the page's three hardcoded hexes (#22d3c2 twice, #4feadb), none of which
          were palette tokens.

          The claim it gestured at — that the two mechanisms together leave no gap —
          is worth stating, so it's stated as a coverage table where each row is
          checkable against the code.
        */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Where each check applies</div>
            <span className="text-micro font-semibold uppercase text-muted">
              Full exposure surface
            </span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Entry path
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Enforced by
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Covered
                </th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.path} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-slate-100">{row.path}</td>
                  <td className="px-5 py-3.5">
                    <code className="code-inline">{row.by}</code>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <IconCheck className="w-4 h-4 inline-block text-ok" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Close ─────────────────────────────────────────────────────────
          The page previously just stopped after the decorative chart, leaving
          the reader at a dead end on a page whose whole job is to send them to
          the markets. */}
      <div className="card p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <div className="text-h3 text-slate-50">See it settle</div>
          <p className="mt-1.5 text-body-sm text-muted max-w-md">
            Markets are live on Monad Testnet. Fills run the exact path described above.
          </p>
        </div>
        <Link to="/markets" className="btn-primary flex-shrink-0">
          Browse markets
          <IconArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </DocPage>
  );
}

const COVERAGE = [
  { path: "Open a position (fill an offer)", by: "market gate" },
  { path: "Receive A-tokens by transfer", by: "WrappedAToken" },
  { path: "Receive A-tokens via flashLoan", by: "WrappedAToken" },
  { path: "Rebind a market's gate after creation", by: "market id = keccak" },
];
