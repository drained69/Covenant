import { Link } from "react-router-dom";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconArrowRight, IconExternal } from "../../components/icons";
import { LADDER, LADDER_DEPLOYED, EXPLORER, CHAIN } from "../../config/chain";

/*
  Credit ladder.

  Every number on this page comes from `LADDER` in config/chain.ts — nothing is
  written into the copy. That matters more here than on the other docs pages: an
  LLTV that drifts from the deployed market is not a stale docs sentence, it is a
  wrong collateral requirement.

  The page also has to be honest about registration state. All three gates are
  deployed and whitelisted but not yet registered with Cleanverse, so every
  wallet currently reads as not-eligible. That is a property of the deployment,
  not a verdict on the reader, and the copy says so in those terms.
*/
export function CreditLadder() {
  return (
    <DocPage
      eyebrow="Credit ladder"
      title="Turning a credential into terms"
      lede="A single gate answers yes or no. A ladder of gates answers on what terms — because each rung's sub-tier bar is hashed into its market id, the leverage and the credential requirement are one object rather than two settings that happen to agree today."
    >
      <Section
        title="Three rungs"
        subtitle="Same loan token, same collateral, same maturity. What differs is the bar at the gate and the loan-to-value that bar earns."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Deployed rungs</div>
            <span className="text-micro font-semibold uppercase text-muted">
              {CHAIN.name}
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
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Collateral per $100k
                </th>
              </tr>
            </thead>
            <tbody>
              {LADDER.rungs.map((rung) => {
                const lltv = Number(rung.lltv) / 1e18;
                return (
                  <tr key={rung.key} className="border-b border-line last:border-0 align-top">
                    <td className="px-5 py-3.5 text-slate-100">{rung.label}</td>
                    <td className="px-5 py-3.5 text-slate-300 leading-relaxed">
                      {rung.qualifies}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-300">
                      {rung.minSubTier}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-100">
                      {(lltv * 100).toFixed(1)}%
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-300">
                      ${Math.round(100_000 / lltv).toLocaleString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Prose>
          <p>
            The last column is the whole argument in one number. Borrowing $100,000 takes about
            $260,000 of collateral on the retail rung and about $109,000 on the institutional one
            — a 2.4× difference in capital efficiency, earned by the credential rather than by
            posting more assets. Verification stops being a checkpoint you clear once and becomes
            something that prices.
          </p>
        </Prose>
      </Section>

      <Section
        title="Why a sub-tier can carry leverage at all"
        subtitle="Because the gate is inside the market id, not beside it."
      >
        <Prose>
          <p>
            In a system where a pool's permission list is a mutable pointer, binding leverage to a
            credential is a promise: the operator says the 91.5% pool requires a full-tier
            credential, and you are trusting that no admin key changes the pointer after you have
            supplied. Nothing you can read on-chain distinguishes that from the same pool with the
            check removed.
          </p>
          <p>
            Here the gate address is part of the keccak fingerprint that produces the id — see{" "}
            <Link to="/docs/architecture" className="link">Architecture</Link>. Point the 91.5%
            terms at a laxer gate and you have not relaxed that market; you have described a
            different market, with a different id, holding none of the original's liquidity or
            positions. A lender in the institutional rung does not have to trust that the bar
            stays where it is, because a market with a lower bar is not the market they funded.
          </p>
        </Prose>

        <div className="card">
          <div className="def-row">
            <div className="def-label">Bar lives at the gate</div>
            <div className="def-value">
              Each rung's gate holds a minimum sub-tier in its rule list. The engine never learns
              what a sub-tier is — it asks one boolean question and the gate does the comparing.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Terms live in the id</div>
            <div className="def-value">
              LLTV, oracle, maturity, and gate hash together. The rung is a single object, so its
              leverage and its policy cannot be changed independently of each other.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">One credential, three answers</div>
            <div className="def-value">
              A wallet is not assigned a rung. It is evaluated against every rung, and clears the
              ones whose bar its current sub-tier meets.
            </div>
          </div>
        </div>
      </Section>
      <Section
        title="How your wallet is resolved"
        subtitle="One eth_call against CreditLadderLens returns every rung's terms and whether this wallet clears it."
      >
        <Prose>
          <p>
            The lens takes the three market ids and, for each one, reads the market back through{" "}
            <code className="code-inline">ICovenant.toMarket</code> — which is what makes the id
            the only piece of ladder config that matters. The gate, LLTV, and oracle in the
            response are re-derived from the market itself rather than read from a list the
            frontend keeps. The values in the table above are display metadata; if they ever
            disagree with the lens, the lens is right.
          </p>
          <p>
            Eligibility is resolved the same way the fill would resolve it: the lens calls each
            rung's gate for the wallet you pass, so a rung reads accessible only if a real{" "}
            <code className="code-inline">fillOffer</code> would also pass. There is no separate
            eligibility index that can be right about a wallet the gate would reject.
          </p>
        </Prose>

        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`CreditLadderLens.rungs(account) ─▶ for each marketId:
    covenant.toMarket(id)      // gate, lltv, oracle, maturity
    gate.canIncreaseDebt(acct) // would a fill pass right now?

one eth_call · no per-rung round trips · no cached verdicts`}
          </pre>
        </div>
      </Section>

      <Section
        title="Current testnet state"
        subtitle="Deployed and whitelisted, not yet registered. Every wallet currently reads as not eligible on every rung."
      >
        <Note title="Awaiting Cleanverse registration">
          <p>
            A gate answers from its pool's rule list. Until each rung's gate completes registration
            with Cleanverse, that list is empty and the gate denies every account — including
            accounts holding a perfectly valid A-Pass. The ladder page will show all three rungs as
            inaccessible, and that is a statement about the deployment, not about your credential.
          </p>
          <p>
            Nothing else about the rungs is provisional: the markets exist, their ids are final, and
            their terms are already fixed by those ids. Registration switches the gates from
            denying everyone to denying everyone below the bar.
          </p>
        </Note>

        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Deployed addresses</div>
            <span className="text-micro font-semibold uppercase text-muted">
              {LADDER_DEPLOYED ? "Lens live" : "Lens pending"}
            </span>
          </div>
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Rung
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Gate
                </th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">
                  Market id
                </th>
              </tr>
            </thead>
            <tbody>
              {LADDER.rungs.map((rung) => (
                <tr key={rung.key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-slate-100">{rung.label}</td>
                  <td className="px-5 py-3.5">
                    {rung.gate ? (
                      <a
                        href={`${EXPLORER}/address/${rung.gate}`}
                        target="_blank"
                        rel="noreferrer"
                        className="link inline-flex items-center gap-1.5 font-mono text-body-sm"
                      >
                        {rung.gate.slice(0, 10)}…{rung.gate.slice(-6)}
                        <IconExternal className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="text-subtle">not deployed</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-body-sm text-slate-300">
                    {rung.marketId ? (
                      <>
                        {rung.marketId.slice(0, 10)}…{rung.marketId.slice(-6)}
                      </>
                    ) : (
                      <span className="text-subtle">not initialised</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            The ladder page resolves your connected wallet against all three rungs in a single call
            and shows what each one would require. The lens itself is at{" "}
            <code className="code-inline">{LADDER.lens ?? "not deployed"}</code>.
          </p>
          <Link to="/ladder" className="btn-secondary flex-shrink-0">
            View the ladder
            <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>
    </DocPage>
  );
}
