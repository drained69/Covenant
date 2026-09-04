import { Link } from "react-router-dom";
import { IconCheck, IconArrowRight, IconShield, IconLayers } from "../../components/icons";
import { ETHOS_TIERS } from "../../config/dreamdex";
import { DocPage, Section, StepCard, LayerCard, Note, Prose } from "./_primitives";

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
      lede="The whole system in one page — the offer flow, the reputation gate, the credit tiers that price credibility into terms, and the DreamDEX execution that turns borrowed capital into an on-chain position."
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
                A taker calls <code className="code-inline">fillOffer(...)</code> and the
                engine ratifies the signature via the offer's notary before touching
                positions.
              </>
            }
            hint="src/Covenant.sol · src/notaries/EcrecoverNotary.sol"
          />
          <StepCard
            n={3}
            title="Gate fires in-tx"
            body={
              <>
                Before debt increases, the market gate runs{" "}
                <code className="code-inline">canIncreaseDebt(borrower)</code>. Any failure
                reverts the transaction. Score authorizations are{" "}
                <strong>short-lived and wallet-bound</strong> — expired, replayed, or
                wrong-wallet authorizations never grant enhanced terms.
              </>
            }
            hint="src/periphery/EcrecoverAuthorizer.sol"
            emphasized
          />
        </div>
      </Section>

      <Section
        title="The lending model"
        subtitle="Covenant is a fixed-rate, fixed-maturity credit market. A loan is created from a signed price, not from a utilization curve."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <div className="card p-6 space-y-3">
            <div className="stat-label">Lender</div>
            <div className="card-title">Buys credit units</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              The lender supplies the loan token and receives a zero-coupon claim. One credit
              unit is redeemable for one loan token at face value, adjusted for protocol fees
              and any realized market loss.
            </p>
          </div>
          <div className="card p-6 space-y-3 border-brand-500/30">
            <div className="stat-label">Execution price</div>
            <div className="card-title">The discount is the interest</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              At a price of <code className="code-inline">0.95</code>, the borrower receives
              0.95 loan tokens and owes 1.00 at repayment. That difference fixes the financing
              cost for the remaining term.
            </p>
          </div>
          <div className="card p-6 space-y-3">
            <div className="stat-label">Borrower</div>
            <div className="card-title">Sells credit units</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              The borrower receives the loan token immediately and records matching debt units.
              Each debt unit is repaid with one unit of the loan token.
            </p>
          </div>
        </div>

        <Note title="Every market has immutable terms">
          <p>
            Loan token, collateral assets, oracle, LLTV, maturity, and gate addresses are all
            included in the market id. Changing any one of them describes a new market rather
            than altering existing lender claims or borrower debt.
          </p>
        </Note>
      </Section>

      <Section
        title="How a borrower receives capital"
        subtitle="Qualification, collateral custody, and loan execution are separate on-chain steps. The final fill either completes in full or reverts in full."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Authorize the tier"
            body="The service signs the observed Ethos score for one wallet, chain, gate, nonce, and expiry. The borrower submits it to the selected EthosTierGate."
            hint="EthosTierGate.authorize"
          />
          <StepCard
            n={2}
            title="Supply collateral"
            body="The borrower approves tBTC and deposits it into the selected market. Covenant records the amount against that borrower's position."
            hint="Covenant.supplyCollateral"
          />
          <StepCard
            n={3}
            title="Fill and borrow"
            body="Covenant pulls tUSDC from the lender, sends it to the borrower, grants credit units to the lender, records borrower debt, and checks the resulting health."
            hint="Covenant.fillOffer"
            emphasized
          />
        </div>

        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`signed lender offer + valid tier + posted collateral
                         |
                         v
                     fillOffer
                         |
              +----------+-----------+
              |                      |
       lender receives          borrower receives
        credit units                  tUSDC
              |                      |
              +----------+-----------+
                         |
                  health check passes
                         |
                         v
                  debt position opens`}
          </pre>
        </div>
      </Section>

      <Section
        title="Borrowing capacity and health"
        subtitle="Reputation selects a collateral policy; the oracle and LLTV enforce solvency on-chain."
      >
        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`maxDebt = sum(
  collateralAmount[i]
  * oraclePrice[i] / ORACLE_PRICE_SCALE
  * LLTV[i] / WAD
)

healthy := debt <= maxDebt`}
          </pre>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-3">
            <div className="card-title">When health is checked</div>
            <ul className="space-y-2 text-body-sm text-slate-300">
              <li>After a fill increases borrower debt</li>
              <li>Before collateral is withdrawn</li>
              <li>When a liquidator tests whether a position is seizable</li>
            </ul>
            <p className="text-body-sm text-subtle leading-relaxed">
              The calculation rounds down, so rounding can only reduce borrowing capacity.
              A position with zero debt is healthy without an oracle read.
            </p>
          </div>
          <div className="card p-6 space-y-3 border-brand-500/25">
            <div className="card-title">What reputation does not do</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Reputation never replaces collateral and never directly liquidates a position.
              It selects the market a wallet may enter — 38.5%, 62.5%, or 77% maximum LTV —
              while the oracle-priced health check remains the enforcement boundary.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Fees, repayment, and maturity"
        subtitle="The execution price determines interest; protocol fees are separate and bounded, and exits remain available without a fresh score authorization."
      >
        <div className="card">
          <div className="def-row">
            <div className="def-label">Settlement fee</div>
            <div className="def-value">
              Added to the buyer's execution price using a piecewise-linear schedule based on
              time to maturity. The schedule has seven bounded breakpoints from 0 to 360 days.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Continuous fee</div>
            <div className="def-value">
              Reserved when credit is issued for the remaining term. Its rate is locked at
              issuance, capped at 1% annualized, and cannot be raised retroactively.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Repayment</div>
            <div className="def-value">
              <code className="code-inline">repay</code> returns one loan token per debt unit.
              The repaid assets enter the market's withdrawable balance for lenders.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Redemption</div>
            <div className="def-value">
              <code className="code-inline">withdraw</code> exchanges lender credit for
              available loan tokens. At maturity, credit is redeemable at face value, adjusted
              for fees and any socialized loss. New debt cannot be created after maturity.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Liquidation and market losses"
        subtitle="Only an unhealthy collateral position can be liquidated. If collateral cannot cover the debt, the remaining loss is shared proportionally across lenders."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Health falls below the limit"
            body="Debt exceeds LLTV-weighted collateral value because debt increased, collateral was withdrawn, or the oracle price moved."
            hint="Covenant.isHealthy"
          />
          <StepCard
            n={2}
            title="A liquidator seizes"
            body="An eligible liquidator repays debt units and receives collateral at the market's liquidation incentive. The borrower does not need to approve the action."
            hint="Covenant.seize"
            emphasized
          />
          <StepCard
            n={3}
            title="Any shortfall is socialized"
            body="Uncovered debt increases the market loss factor, scaling every lender's outstanding credit by the same proportional amount."
            hint="marketState.lossFactor"
          />
        </div>

        <Prose>
          <p>
            Before maturity, an unhealthy position uses the maximum configured liquidation
            incentive. After maturity, the incentive ramps from 1.0 to its maximum over 15
            minutes, giving a marginally unhealthy borrower a short opportunity to repay first.
          </p>
          <p>
            Losses are cumulative and cannot be reversed. For exact rounding, fee curves, and
            loss-factor derivations, continue to the <Link to="/docs/math" className="link">Core math</Link> page.
          </p>
        </Prose>
      </Section>

      {/* ── Getting qualified ───────────────────────────────────────────────
          Added because the page described the gate's *check* in detail but never
          said how a wallet comes to pass it — the reader could follow the whole
          offer flow and still not know what to do about step 3 denying them.
          The load-bearing fact is that reputation accrues off-chain and is
          consumed on-chain, which is also what the credit page reflects. */}
      <Section
        title="Getting qualified"
        subtitle="The gate reads a score; it does not issue one. Ethos credibility accrues to the wallet through the ecosystem, and Covenant binds it to terms."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Reputation accrues"
            body={
              <>
                Reviews, vouches, and attestations on Ethos shape the wallet's credibility
                score over time. Covenant only reads it — see{" "}
                <Link to="/credit" className="link">your live score</Link>.
              </>
            }
            hint="Ethos v2 API"
          />
          <StepCard
            n={2}
            title="Score is authorized"
            body="A short-lived, wallet-bound authorization commits the observed score, its tier, a nonce, and an expiry. The on-chain registry verifies the signature and rejects stale or replayed data."
            hint="offchain/somnia-service.mjs"
            emphasized
          />
          <StepCard
            n={3}
            title="Tier sets the terms"
            body="Open, Established, or Reputable — each a published LTV bound to its own market. A falling score can limit new borrowing but never blocks repayment, exits, or collateral withdrawal."
            hint="src/reputation/EthosTierGate.sol"
          />
        </div>

        <div className="card p-6 flex items-start gap-4 border-brand-500/25">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-300">
            <IconShield className="w-4 h-4" />
          </div>
          <div className="space-y-1.5 min-w-0">
            <div className="text-body font-semibold text-slate-100">
              Reputation gates entry, never exit
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Policy checks apply only when exposure increases — new borrowing and new
              market entry. Repaying debt, redeeming credit, and withdrawing collateral carry no
              reputation check at all, so a stale or unavailable score can never strand funds.
            </p>
          </div>
        </div>
      </Section>

      {/* ── The credit ladder ──────────────────────────────────────────────
          Added because the gate story stopped at a binary: you pass or you don't.
          That undersells what the reputation signal actually carries. An Ethos
          score maps to a tier, and because a market's gate is hashed into the
          market id, a market's terms and its reputation requirement are one
          object. That is the mechanism that turns reputation from a checkpoint
          into pricing — and it is the part of the design a reader is least
          likely to infer. */}
      <Section
        title="The credit ladder"
        subtitle="One gate answers yes or no. A ladder of gates answers on what terms. Higher credibility clears a higher bar, and a higher bar carries better terms."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <IconLayers className="w-4 h-4 text-brand-400" />
              <div className="card-title">Tiers</div>
            </div>
            <span className="text-micro font-semibold uppercase text-muted">
              Ethos score bar → terms
            </span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Tier
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Who clears it
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Score bar
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Max LTV
                </th>
              </tr>
            </thead>
            <tbody>
              {ETHOS_TIERS.map((tier) => (
                <tr key={tier.name} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-slate-100">{tier.name}</td>
                  <td className="px-5 py-3.5 text-slate-300">
                    {tier.minimum === 0
                      ? "Any wallet — the conservative baseline market."
                      : `Wallets scoring ${tier.minimum.toLocaleString()} or above on Ethos.`}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-300">
                    {tier.minimum === 0 ? "—" : tier.minimum.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-100">
                    {tier.ltv}%
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
              A market id is the keccak of every field, gate address included. So the 77% LTV
              market is cryptographically bound to its Reputable-tier gate — nobody can offer
              those terms to a wallet that clears a lower bar, because doing so would be a
              different market with a different id.
            </p>
          </div>
          <div className="card p-6 space-y-3">
            <div className="card-title">Better terms, earned</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Higher LTV means more borrowing power for the same collateral. One tBTC supports
              about $41.6k of debt at the Open tier and $83.2k at Reputable — 2× the capital
              efficiency, earned by the credibility score rather than by posting more assets.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              src/periphery/CreditLadderLens.sol
            </div>
          </div>
        </div>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            The credit page reads your live Ethos score and shows what each tier would earn. The{" "}
            <Link to="/docs/credit-ladder" className="link">Credit tiers</Link> doc covers the
            thresholds and what is enforced on-chain today.
          </p>
          <Link to="/credit" className="btn-secondary flex-shrink-0">
            Check your tier
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
            body="React + wagmi SPA. Discovers DreamDEX Event Contracts through the official Somnia Markets SDK, reads Ethos credibility per wallet, submits Up/Down orders, and tracks the unified portfolio."
          />
          <LayerCard
            index="02"
            title="Off-chain services"
            path="offchain/"
            body="somnia-service.mjs reads Ethos, signs short-lived score authorizations for the deployed tier gates, and returns fresh EIP-712 lender offers. Its signers cannot override collateral health or move borrower funds."
          />
          <LayerCard
            index="03"
            title="Credit engine"
            path="src/Covenant.sol"
            body="The fixed-maturity credit primitive. Market identity is the keccak of every field including gate addresses, so a market's underwriting policy cannot be silently rebound after creation."
          />
          <LayerCard
            index="04"
            title="Reputation surface"
            path="src/reputation/"
            body="Gates decide 'may this account take new exposure?' through narrow hooks — canIncreaseDebt, canIncreaseCredit, canLiquidate. Score authorizations are wallet-, chain-, nonce-, and expiry-bound, and fail closed."
            emphasized
          />
        </div>
      </Section>

      {/* ── Trading execution ───────────────────────────────────────────── */}
      <Section
        title="From qualification to order"
        subtitle="Borrowed capital is spent, not rehypothecated: the integration issues DreamDEX TestUSDC as trading collateral rather than accepting outcome positions as loan collateral."
      >
        {/*
          The comparison is the point, so the two paths are visibly separate
          surfaces. The verdict is a badge (which is what a two-state label is),
          and each panel carries the border tint of its own state.
        */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-4 border-ok/25">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">In scope today</div>
              <span className="badge-ok">
                <IconCheck className="w-3 h-3" />
                Live
              </span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Borrowed collateral funds Up/Down orders on DreamDEX's on-chain limit order book.
              Positions settle as ERC-6909 outcome tokens; resolution, void, and redemption
              states surface in the portfolio.
            </p>
          </div>

          <div className="card p-6 space-y-4 border-line-strong">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">Future extension</div>
              <span className="badge-neutral">Planned</span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Direct ERC-6909 outcome-position collateral — token-ID-aware custody,
              pre-settlement valuation, liquidation liquidity, and void-market accounting.
              Intentionally outside the initial scope.
            </p>
          </div>
        </div>

        {/*
          A coverage table where each row is checkable against the code: every
          write path on the venue, and what bounds it.
        */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Where each control applies</div>
            <span className="text-micro font-semibold uppercase text-muted">
              Trading surface
            </span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Action
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Bounded by
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Checked
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
            Live DreamDEX Event Contracts on {""}
            Somnia Testnet. Orders run through the exact path described above.
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
  { path: "Increase borrower debt (fill an offer)", by: "entry gate · canIncreaseDebt" },
  { path: "Increase lender credit", by: "entry gate · canIncreaseCredit" },
  { path: "Repay, redeem, withdraw collateral", by: "no gate — exits always open" },
  { path: "Rebind a market's gate after creation", by: "market id = keccak" },
  { path: "Order size on DreamDEX", by: "wallet collateral balance" },
];
