import { Link } from "react-router-dom";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconArrowRight } from "../../components/icons";

/*
  Core math.

  Condensed from docs/CoreMath.md. Two rules held while writing it:

  1. Every formula is transcribed, not paraphrased. A reader should be able to
     put this page beside the contract and check it symbol for symbol. Where a
     rounding direction matters (mulDivDown vs mulDivUp) it is stated, because
     the direction is the safety property — not a detail.

  2. The last section is the one that earns the rest. A math page that only
     lists what the contracts guarantee is marketing; §12 of CoreMath.md
     enumerates what they deliberately do not enforce, and that belongs here at
     full strength rather than as a footnote.
*/
export function CoreMath() {
  return (
    <DocPage
      eyebrow="Core math"
      title="What the contracts compute"
      lede="Oracle scaling, the health check, the two fee curves, liquidation and loss socialisation — with the rounding directions that make each one safe, and a closing section on what the math deliberately leaves to the operator."
    >
      <Section
        title="Fixed-point conventions"
        subtitle="Three scales, used consistently. Everything else on this page is these units combined."
      >
        <div className="card">
          <div className="def-row">
            <div className="def-label">
              <code className="code-inline">WAD = 1e18</code>
            </div>
            <div className="def-value">
              The fixed-point unit. Ratios, LLTVs, and fee rates are WAD-scaled — an LLTV of
              91.5% is stored as <code className="code-inline">915000000000000000</code>.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">
              <code className="code-inline">ORACLE_PRICE_SCALE = 1e36</code>
            </div>
            <div className="def-value">
              The oracle scale. Deliberately larger than WAD so a price can carry both the
              feed's own precision and the decimal difference between collateral and loan
              tokens without losing significant digits.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">
              <code className="code-inline">CBP = 1e12</code>
            </div>
            <div className="def-value">
              A centi-basis point, <code className="code-inline">1e-6</code>. Settlement fee
              breakpoints are stored in these units.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">
              <code className="code-inline">mulDivDown</code> /{" "}
              <code className="code-inline">mulDivUp</code>
            </div>
            <div className="def-value">
              Full-precision multiply-then-divide, rounding toward zero or away from it. Which
              one appears at a given site is a solvency decision, not a style choice.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Oracle scaling"
        subtitle="One identity, and everything a wrapper does exists to satisfy it for its particular pair of tokens."
      >
        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`collateral_raw * price / ORACLE_PRICE_SCALE  =  value_in_loan_token_raw

price = feed_answer * 10^loanDecimals * ORACLE_PRICE_SCALE
                    / (10^feedDecimals * 10^collateralDecimals)

SCALE = ORACLE_PRICE_SCALE * 10^loanDecimals
                / 10^(collateralDecimals + feedDecimals)   // at deploy`}
          </pre>
        </div>

        <Prose>
          <p>
            The engine never learns what a decimal is. It multiplies a raw collateral balance by
            a price and divides by a constant; the wrapper is what makes that arithmetic mean
            something for a specific pair. <code className="code-inline">SCALE</code> is computed
            once in the constructor, so a read is one feed call and one multiply.
          </p>
          <p>
            The wrapper reverts on a stale feed —{" "}
            <code className="code-inline">updatedAt {"<"} block.timestamp - STALENESS</code> — and
            on any answer at or below zero. That propagates:{" "}
            <code className="code-inline">isHealthy</code> reverts too, so liquidation on a stale
            market is impossible rather than mispriced. This is the intended behaviour. A market
            held open by a price nobody can vouch for is worse for lenders than a market where
            liquidation is briefly paused.
          </p>
          <p>
            The identity holds for any combination of{" "}
            <code className="code-inline">feedDecimals</code>,{" "}
            <code className="code-inline">collateralDecimals</code>, and{" "}
            <code className="code-inline">loanDecimals</code>, which is fuzzed directly by{" "}
            <code className="code-inline">testFuzz_priceIdentity</code>.
          </p>
        </Prose>
      </Section>

      {/* CONT_MATH */}
    </DocPage>
  );
}
