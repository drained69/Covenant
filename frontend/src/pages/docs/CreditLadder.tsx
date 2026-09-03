import { Link } from "react-router-dom";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconArrowRight } from "../../components/icons";
import { ETHOS_TIERS } from "../../config/dreamdex";

/**
 * Credit tiers (docs).
 *
 * Every threshold on this page comes from `ETHOS_TIERS` in config/dreamdex.ts
 * — the same constant the /credit page and the trade panel read — so the docs,
 * the qualification page, and the order preview can never disagree about what
 * a score is worth.
 */
export function CreditLadder() {
  return (
    <DocPage
      eyebrow="Credit tiers"
      title="Turning reputation into terms"
      lede="A single gate answers yes or no. A ladder of tiers answers on what terms — each Ethos score threshold is bound to a market whose collateral parameters carry exactly the borrowing power that tier earns."
    >
      <Section
        title="Three tiers"
        subtitle="Same loan token, same collateral type, same maturity. What differs is the reputation bar at the gate and the loan-to-value that bar earns."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Testnet tier policy</div>
            <span className="text-micro font-semibold uppercase text-muted">
              Illustrative
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
                  Ethos score
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Max LTV
                </th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">
                  Debt per $100 collateral
                </th>
              </tr>
            </thead>
            <tbody>
              {ETHOS_TIERS.map((tier) => (
                <tr key={tier.name} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-3.5 text-slate-100">{tier.name}</td>
                  <td className="px-5 py-3.5 text-slate-300 leading-relaxed">
                    {tier.minimum === 0
                      ? "Any wallet. The conservative baseline — no score required."
                      : `Wallets with an Ethos credibility score of ${tier.minimum.toLocaleString()} or above.`}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-300">
                    {tier.minimum === 0 ? "—" : `≥ ${tier.minimum.toLocaleString()}`}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-100">
                    {tier.ltv}%
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums text-slate-100">
                    ${tier.ltv.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Note title="Policy, not a guarantee">
          Thresholds and ratios are Covenant application policy, not Ethos recommendations.
          Ethos credibility is a mutable signal — it can rise or fall with reviews, vouches,
          and attestations — and it is never the sole basis for unsecured credit. Collateral
          remains the primary security mechanism in every tier.
        </Note>
      </Section>

      <Section
        title="What the tier gates"
        subtitle="Reputation checks apply only when exposure increases. Exits stay open no matter what the score does."
      >
        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-6 space-y-3">
            <div className="card-title">Gated by reputation</div>
            <ul className="space-y-2 text-body-sm text-slate-300">
              <li>New borrowing (debt-increasing fills)</li>
              <li>First entry into a score-gated market</li>
            </ul>
            <p className="text-body-sm text-subtle leading-relaxed">
              Both require a fresh, wallet-bound score authorization. Expired, replayed,
              cross-chain, or wrong-wallet authorizations are rejected on-chain.
            </p>
          </div>
          <div className="card p-6 space-y-3">
            <div className="card-title">Never gated by reputation</div>
            <ul className="space-y-2 text-body-sm text-slate-300">
              <li>Repaying debt</li>
              <li>Redeeming lender credit</li>
              <li>Supplying or withdrawing collateral</li>
              <li>Trading exits on DreamDEX</li>
            </ul>
            <p className="text-body-sm text-subtle leading-relaxed">
              A score that falls may prevent new borrowing, but it cannot liquidate an
              otherwise solvent position or strand an exit.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Where this is enforced" subtitle="Honest status of the on-chain layer.">
        <Prose>
          <p>
            The engine's policy hooks — <code className="code-inline">canIncreaseDebt</code>,{" "}
            <code className="code-inline">canIncreaseCredit</code>,{" "}
            <code className="code-inline">canLiquidate</code> — are live in the core contract and
            every market binds its gate address into its content-addressed id. The Ethos score
            registry and threshold gates (short-lived signed authorizations with nonce, expiry,
            wallet, chain, and policy-version binding) are the active build milestone; until
            they deploy to Somnia, the tiers shown in this app are a preview policy and every
            DreamDEX order settles against your real wallet collateral.
          </p>
        </Prose>
        <Link to="/credit" className="link text-body-sm inline-flex items-center gap-2">
          Check your live tier on the credit page
          <IconArrowRight className="w-3.5 h-3.5" />
        </Link>
      </Section>
    </DocPage>
  );
}
