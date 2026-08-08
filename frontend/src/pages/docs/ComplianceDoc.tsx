import { Link } from "react-router-dom";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconCheck, IconX, IconArrowRight } from "../../components/icons";

/*
  Compliance.

  This is the page the protocol exists for, so it is the one page that should be
  readable by someone who does not write Solidity. The order is deliberate: what
  the check *is* before which functions run it, and which functions run it before
  the two deployment paths — because the coverage table is meaningless until you
  know what "gated" does, and the path comparison is meaningless until you know
  what both paths are preserving.

  The one thing this page must not do is imply more coverage than exists. The
  flash-loan section says plainly that a per-market gate cannot close a core-level
  function, and that the fix lives at the token.
*/
export function ComplianceDoc() {
  return (
    <DocPage
      eyebrow="Compliance"
      title="What the gate actually enforces"
      lede="A gate is a view function that answers one question — may this account increase this kind of exposure? — inside the transaction that would create it. Everything else on this page is a consequence of that sentence: which functions ask it, what happens when the answer cannot be obtained, and why exits are never gated."
    >
      <Section
        title="The shape of a single check"
        subtitle="Two reads against the CVI Compliance Validator, both bounded, both inside the fill."
      >
        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`// src/compliance/CleanversePoolGate.sol
validator.isRegistered(pool)                 // is this market's pool
                                             // known to the validator?
validator.complianceVerify(pool, account)    // does this account satisfy
                                             // that pool's rule list?

// both via staticcall, POOL_GAS_LIMIT = 150_000
// any revert, empty return, or out-of-gas  ─▶  not eligible`}
          </pre>
        </div>

        <Prose>
          <p>
            Both conditions are live. Neither result is cached on-chain, and there is no
            "verified" flag written to storage that could go stale — the pair of reads happens
            again on every gated action. A wallet that passed yesterday and has since been
            revoked fails today, and a wallet holding a valid A-Pass still fails on a market
            whose pool the validator does not recognise.
          </p>
        </Prose>

        <div className="card">
          <div className="def-row">
            <div className="def-label">View, not revert</div>
            <div className="def-value">
              The gate returns a boolean. The engine is what turns a{" "}
              <code className="code-inline">false</code> into a revert, so a gate can never
              propagate its own failure into the engine's accounting.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Bounded gas</div>
            <div className="def-value">
              Each read is capped at 150,000 gas. A misbehaving or adversarial pool cannot
              consume the transaction's budget and convert one denial into a market-wide
              denial of service.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Fail-closed</div>
            <div className="def-value">
              Reverting reads, unreachable pools, and malformed return data all resolve to
              <em> not eligible</em>. Unavailable verification is never read as clearance.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Increases only</div>
            <div className="def-value">
              Repay, withdraw, and collateral withdrawal stay open. An outage or a revoked
              credential can stop you opening new exposure; it can never strand capital
              already committed.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Bound to identity</div>
            <div className="def-value">
              The gate address hashes into the market id, so a live market's policy cannot be
              redirected — see{" "}
              <Link to="/docs/architecture" className="link">Architecture</Link>.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Two integration paths"
        subtitle="Both implement the same market-facing interface and preserve every property above. They differ in where the truth comes from."
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-3 border-brand-500/30">
            <div className="flex items-baseline justify-between gap-4">
              <div className="card-title">Path A — direct pool gate</div>
              <span className="text-micro font-mono text-subtle flex-shrink-0">recommended</span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">CleanversePoolGate</code> reads Cleanverse's own
              compliance pool inside the trade. The view a compliance officer would call through
              the API is the same view the gate calls. No attester, no bridge, no second copy of
              the rule list to keep in sync.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              src/compliance/CleanversePoolGate.sol
            </div>
          </div>

          <div className="card p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <div className="card-title">Path B — attestation registry</div>
              <span className="text-micro font-mono text-subtle flex-shrink-0">optional</span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">CovenantGate</code> reads a{" "}
              <code className="code-inline">CovenantRegistry</code> that an attester writes to
              from the Cooperate API. For per-action policy on top of Cleanverse eligibility, or
              for chains with no directly-callable pool. Attesters may only write attestations —
              they cannot move funds, alter markets, or grant themselves privileges.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              src/compliance/CovenantRegistry.sol
            </div>
          </div>
        </div>

        <Note title="What goes on-chain in Path B">
          <p>
            No personal data. A registry entry is a hash commitment to the off-chain verification
            record, plus jurisdiction, a validity window, and revocation state. Every write emits
            an event naming the attester and the source commitment, which is what makes the audit
            trail reconstructible after the fact by someone who was not there at the time.
          </p>
        </Note>
      </Section>

      <Section
        title="Which functions are gated"
        subtitle="Reviewed function by function against src/Covenant.sol. The rule is mechanical: gate the side that increases exposure, gate nothing else."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Position-mutating</div>
            <span className="text-micro font-semibold uppercase text-muted">User-facing</span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Function
                </th>
                <th className="text-center font-semibold text-micro uppercase text-muted px-5 py-3">
                  Gated
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Why
                </th>
              </tr>
            </thead>
            <tbody>
              {POSITION_FNS.map((row) => (
                <tr key={row.fn} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-3.5">
                    <code className="code-inline">{row.fn}</code>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {row.gated ? (
                      <IconCheck className="w-4 h-4 inline-block text-ok" />
                    ) : (
                      <IconX className="w-4 h-4 inline-block text-subtle" />
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-300 leading-relaxed">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Prose>
          <p>
            The infrastructure functions are ungated for reasons that are worth stating rather
            than assuming. <code className="code-inline">initMarket</code> is permissionless
            because a market with <code className="code-inline">entryGate = 0</code> is a
            different market id than a gated one — positions cannot merge across ids, so creating
            an open market takes nothing away from a compliant one.{" "}
            <code className="code-inline">setIsAuthorized</code> is delegation only: the position
            holder is what <code className="code-inline">fillOffer</code> screens, not the caller,
            so delegating to a non-compliant party cannot open a non-compliant position. And{" "}
            <code className="code-inline">multicall</code> runs through{" "}
            <code className="code-inline">delegatecall</code>, so every inner call is individually
            gated under the outer <code className="code-inline">msg.sender</code>.
          </p>
        </Prose>
      </Section>

      <Section
        title="The receiver is deliberately not gated"
        subtitle="fillOffer, withdraw, withdrawCollateral, and seize all take a receiver. None of them screen it."
      >
        <Prose>
          <p>
            This is a decision, not an oversight. Compliance is enforced on who holds the
            position, not on where the position holder chooses to send redeemed tokens. A
            verified borrower directing loan proceeds to a third-party wallet is doing what a
            bank customer does when they disburse a loan into someone else's account: the
            borrower's own obligations — Travel Rule reporting on the onward transfer, among
            others — still apply, and the market is not the enforcement point for them.
          </p>
          <p>
            Gating the receiver would also break the exit guarantee. A lender whose credential is
            frozen after they have committed capital needs a way out; a market that screens the
            destination of a settlement has turned an eligibility check into a freeze.
          </p>
        </Prose>
      </Section>

      <Section
        title="The flash-loan surface, and the honest limit of a market gate"
        subtitle="flashLoan lives on the core contract, not on a market. No per-market gate can reach it."
      >
        <Prose>
          <p>
            <code className="code-inline">flashLoan</code> lends any wallet an arbitrary slice of
            the Covenant contract's balance for the length of one transaction — and that balance
            includes loan tokens supplied by lenders of compliant markets. The{" "}
            <code className="code-inline">Market</code> struct has no{" "}
            <code className="code-inline">flashLoanGate</code> field to add, because flash loans
            span markets by construction. This is not something the compliance layer can close
            from outside the core.
          </p>
          <p>
            The fix is to move the check down a level, to the asset itself.{" "}
            <code className="code-inline">WrappedAToken</code> is a 1:1 wrapper over an origin
            ERC-20 that runs the same two reads — same validator, same 150k cap, same fail-closed
            rule — inside every inbound transfer. When a market's loan token is a wrapper, the
            flash loan reverts in the token before the callback is ever invoked.
          </p>
        </Prose>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-4 border-bad/25">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">Plain ERC-20 loan token</div>
              <span className="badge-bad">
                <IconX className="w-3 h-3" />
                Open
              </span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">flashLoan([USDC], amt, callback)</code> succeeds for
              any wallet. A non-compliant callback holds compliant-market liquidity for the
              duration of the transaction.
            </p>
          </div>

          <div className="card p-6 space-y-4 border-ok/25">
            <div className="flex items-center justify-between gap-3">
              <div className="stat-label">WrappedAToken loan token</div>
              <span className="badge-ok">
                <IconCheck className="w-3 h-3" />
                Closed
              </span>
            </div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              <code className="code-inline">safeTransfer(waUSDC → callback)</code> reverts with{" "}
              <code className="code-inline">RecipientNotCompliant</code> inside{" "}
              <code className="code-inline">_transfer</code>, before the callback runs.
            </p>
            <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
              test/compliance/WrappedATokenFlashLoanTest.sol
            </div>
          </div>
        </div>

        <div className="card">
          <div className="def-row">
            <div className="def-label">Immutable pool binding</div>
            <div className="def-value">
              Changing the compliance source requires a new token, and therefore a new market. A
              live loan asset cannot be silently repointed at a laxer policy.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Inbound only</div>
            <div className="def-value">
              <code className="code-inline">withdraw</code> — burn back to the origin token — is
              intentionally open. The token-layer version of the engine's gate-increases-not-exits
              rule.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Minimal exempt set</div>
            <div className="def-value">
              The owner may exempt infrastructure that must route the wrapper as pass-through
              liquidity — the Covenant core, a bundler, a router. Deliberately narrow.
            </div>
          </div>
        </div>

        <Note title="Where this leaves a real deployment">
          <p>
            Two layers, checked independently. The market gate screens the position holder on
            every increase in exposure; the token screens the recipient on every inbound transfer,
            including the ones no market ever sees. The remaining option for an institution that
            wants no flash-loan surface at all is a deployment choice — fork the core and remove
            or gate the function — which is governance, not compliance.
          </p>
        </Note>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            The ladder turns this binary check into pricing: a gate with a sub-tier bar, hashed
            into the market id, is what lets a better credential carry more leverage.
          </p>
          <Link to="/docs/credit-ladder" className="btn-secondary flex-shrink-0">
            Credit ladder
            <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>
    </DocPage>
  );
}

/*
  Transcribed from the function coverage table in README.md rather than
  paraphrased, because the whole value of this table is that a reader can check
  it against src/Covenant.sol line by line. The `why` column says which actor is
  screened — that is the part people get wrong about `seize`.
*/
const POSITION_FNS = [
  {
    fn: "fillOffer",
    gated: true,
    why: "canIncreaseCredit(buyer) fires iff buyerCreditIncrease > 0; canIncreaseDebt(seller) iff sellerDebtIncrease > 0. The reducing side of the same fill is never screened.",
  },
  {
    fn: "seize",
    gated: true,
    why: "canLiquidate(msg.sender) — the liquidator is the actor being screened, not the borrower. Taking on a seized position is taking on exposure.",
  },
  {
    fn: "withdraw",
    gated: false,
    why: "Exit path. Gating it would strand a lender who lost their credential after committing capital.",
  },
  {
    fn: "repay",
    gated: false,
    why: "Exit path. Also lets a third party repay on behalf of a borrower whose credential has since been frozen.",
  },
  {
    fn: "supplyCollateral",
    gated: false,
    why: "Cannot become debt without passing through the gated fillOffer. Supplying to someone else's position is a donation, not exposure.",
  },
  {
    fn: "withdrawCollateral",
    gated: false,
    why: "Exit path. isHealthy already prevents unsafe withdrawals; compliance is orthogonal to solvency.",
  },
];
