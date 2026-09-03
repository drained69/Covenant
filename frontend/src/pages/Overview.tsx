import { Fragment } from "react";
import { Link } from "react-router-dom";
import { EthosMark } from "../components/icons";

/**
 * Overview — the protocol's front door.
 *
 * This page is deliberately NOT a dashboard: no live market rows, no
 * capacity widgets. It is an editorial explanation of the complete Covenant
 * model — what the protocol is, how Ethos reputation is used, how
 * collateral works, how capital is unlocked and deployed on DreamDEX —
 * laid out in the Sotto discipline: label + headline + rule-divided
 * sections, prose on the left, structured figures on the right.
 *
 * The trading surfaces live one nav tab away (Markets, Credit, Positions);
 * the hero's primary action hands the reader to them.
 */

const layers = [
  {
    number: "01",
    label: "ETHOS",
    title: "Reputation signal",
    short: "Ethos provides a portable credibility signal.",
    body: "Ethos provides the credibility signal. Covenant reads a user's Ethos score and uses it to determine their credit tier.",
    aside: <EthosExample />,
  },
  {
    number: "02",
    label: "COVENANT CREDIT",
    title: "Borrowing terms",
    short: "Your score maps to a borrowing tier.",
    body: "The user's Ethos score maps them to a credit tier. The tier influences borrowing terms, such as the maximum loan-to-value ratio.",
    aside: (
      <p className="text-body-sm text-muted leading-relaxed">
        Reputation does not provide free money —{" "}
        <span className="text-slate-100">the user still provides collateral.</span>
      </p>
    ),
  },
  {
    number: "03",
    label: "COLLATERAL",
    title: "The safety layer",
    short: "Post collateral and borrow trading capital.",
    body: "Users deposit collateral before borrowing. Collateral remains the foundation of the system — the enforceable boundary of every position.",
    aside: (
      <p className="text-body-sm text-muted leading-relaxed">
        <span className="text-slate-100">
          Reputation improves borrowing terms. Collateral remains the safety net.
        </span>
      </p>
    ),
  },
  {
    number: "04",
    label: "DREAMDEX",
    title: "Deploy conviction",
    short: "Deploy capital on DreamDEX Event Contracts.",
    body: "Once a user borrows tUSDC, that capital becomes trading capital for binary Event Contracts on DreamDEX. They can take an Up / YES or Down / NO position.",
    aside: (
      <div className="flex items-center gap-2">
        <span className="badge-ok">Up / Yes</span>
        <span className="badge-bad">Down / No</span>
      </div>
    ),
  },
] as const;

const flow = [
  ["01", "Discover a market", "Browse live Event Contracts on DreamDEX — market probability, oracle price, strike price, liquidity, and time to expiry."],
  ["02", "Check your tier", "Covenant reads the credibility score computed by Ethos. Open, Established, or Reputable — your tier determines your borrowing terms."],
  ["03", "Unlock capital", "Authorize your Ethos score, post collateral, and borrow tUSDC. The capital is fully collateralized."],
  ["04", "Take a position", "The borrowed tUSDC becomes trading capital. Take an Up / YES or Down / NO position on DreamDEX."],
  ["05", "Manage and settle", "Track open positions, debt, collateral, PnL, and market settlement. Repay the loan or withdraw available collateral."],
] as const;

const signalChain = [
  "Ethos credibility",
  "Credit tier",
  "Borrowing terms",
  "Collateralized capital",
  "DreamDEX position",
] as const;

export function Overview() {
  return (
    <div>
      {/* ── Hero ───────────────────────────────────────────────────────
          Editorial split: the claim in large type on the left, the model's
          four steps as a ruled list on the right. The second headline line
          is set in the serif italic pull-phrase idiom — the one typographic
          flourish the page gets. */}
      <section className="border-b border-line">
        <div className="shell grid lg:grid-cols-[minmax(0,1fr)_23rem] gap-16 py-20 lg:py-28">
          <div className="max-w-3xl self-center">
            <div className="section-label text-brand-500">Reputation-aware trading</div>
            <h1 className="mt-5 text-[clamp(3rem,7vw,6.5rem)] leading-[.94] tracking-[-.065em] font-semibold text-slate-50">
              Trade conviction.
              <br />
              <span className="font-serif italic font-normal tracking-[-0.01em] text-muted">
                Unlock capacity.
              </span>
            </h1>
            <p className="mt-8 max-w-xl text-body-lg text-muted leading-relaxed">
              Covenant is a reputation-aware trading protocol on Somnia. It reads your
              Ethos credibility to improve your borrowing terms, allowing you to unlock
              collateralized trading capital for DreamDEX Event Contracts.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link to="/markets" className="btn-primary">
                Explore markets <span aria-hidden="true">→</span>
              </Link>
              <a
                href="#model"
                className="text-body-sm font-medium text-muted hover:text-slate-50 transition-colors"
              >
                How it works ↓
              </a>
            </div>
          </div>

          {/* The Covenant model, as a compact ruled block — the page's thesis
              in four lines, scannable before any prose is read. */}
          <div className="border-t border-line lg:border-t-0 lg:border-l lg:pl-10 self-center">
            <div className="section-label mb-2">The Covenant model</div>
            {layers.map((item) => (
              <div
                key={item.number}
                className="flex gap-4 py-4 border-b border-line first:pt-5"
              >
                <span className="font-mono text-micro text-brand-500 pt-0.5">{item.number}</span>
                <div>
                  <div className="text-body-sm font-semibold text-slate-50">{item.label}</div>
                  <div className="mt-1 text-body-sm text-muted leading-relaxed">{item.short}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The four layers ─────────────────────────────────────────────
          Each layer gets the same ruled row — number, name, explanation —
          plus its own aside: the Ethos score figure, the "not free money"
          caveat, the safety-net restatement, the Up/Down tokens. */}
      <section id="model" className="shell py-20 lg:py-28 border-b border-line">
        <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-14 lg:gap-24">
          <div>
            <div className="section-label text-brand-500">The Covenant model</div>
            <h2 className="mt-4 text-h2 sm:text-h1">
              One protocol.
              <br />
              Four layers.
            </h2>
          </div>
          <div className="border-t border-line">
            {layers.map((item) => (
              <article
                key={item.number}
                className="grid sm:grid-cols-[5rem_12rem_1fr] gap-x-4 gap-y-3 py-7 border-b border-line"
              >
                <span className="font-mono text-body-sm text-brand-500">{item.number}</span>
                <div>
                  <div className="section-label">{item.label}</div>
                  <h3 className="mt-2 text-h3">{item.title}</h3>
                </div>
                <div>
                  <p className="text-body-sm text-muted leading-relaxed">{item.body}</p>
                  {item.aside && <div className="mt-4">{item.aside}</div>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── The complete flow ─────────────────────────────────────────── */}
      <section className="bg-ink-900 border-b border-line">
        <div className="shell py-20 lg:py-24">
          <div className="max-w-2xl">
            <div className="section-label text-brand-500">From reputation to settlement</div>
            <h2 className="mt-4 text-h2 sm:text-h1">A complete path from signal to position.</h2>
          </div>
          <div className="mt-14 grid md:grid-cols-5 border-t border-line">
            {flow.map(([number, title, body]) => (
              <div
                key={number}
                className="py-6 md:px-5 md:first:pl-0 md:border-l md:border-line first:border-l-0"
              >
                <span className="font-mono text-micro text-brand-500">{number}</span>
                <h3 className="mt-5 text-body font-semibold">{title}</h3>
                <p className="mt-3 text-body-sm text-muted leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
          {/* The exit guarantee — the one promise that makes the whole model
              safe to approach, stated once, at the end of the path. */}
          <p className="mt-10 pt-6 border-t border-line text-body-sm text-muted leading-relaxed max-w-2xl">
            Reputation can affect <span className="text-slate-100">new borrowing</span> —
            it never prevents exiting. Users can repay debt and withdraw eligible
            collateral at any time.
          </p>
        </div>
      </section>

      {/* ── Ethos ─────────────────────────────────────────────────────── */}
      <section className="shell py-20 lg:py-28 border-b border-line">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-16 items-start">
          <div>
            <div className="section-label text-ethos-600">Portable reputation</div>
            <h2 className="mt-4 text-h2 sm:text-h1">
              Reputation improves access.
              <br />
              It does not replace collateral.
            </h2>
            <p className="mt-6 max-w-lg text-body-lg text-muted leading-relaxed">
              Covenant uses Ethos as a credibility signal when determining borrowing terms.
              A stronger reputation can unlock better capital efficiency, while collateral
              remains the foundation of every position.
            </p>
          </div>
          {/* The signal relationship as a vertical chain: each stage derives
              from the one above it. Centered on the connecting arrows, so
              the eye travels the derivation, not a numbered list. */}
          <div className="border border-line bg-surface-solid">
            <div className="px-6 py-4 border-b border-line flex items-center gap-3">
              <EthosMark className="w-5 h-5 text-ethos-600" />
              <span className="section-label">Signal relationship</span>
            </div>
            <div className="px-6 py-6">
              {signalChain.map((label, index) => (
                <Fragment key={label}>
                  <div className="py-2 text-center font-mono text-micro uppercase tracking-[0.08em] text-slate-200">
                    {label}
                  </div>
                  {index < signalChain.length - 1 && (
                    <div className="text-center text-body-sm text-subtle leading-none" aria-hidden="true">
                      ↓
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Safety model ──────────────────────────────────────────────── */}
      <section className="border-b border-line">
        <div className="shell py-20 lg:py-24">
          <div className="section-label text-brand-500">The safety model</div>
          <div className="mt-4 grid lg:grid-cols-[1fr_1fr] gap-12">
            <h2 className="text-h2 sm:text-h1">
              Reputation informs.
              <br />
              Collateral protects.
            </h2>
            <div className="text-body-lg text-muted leading-relaxed">
              <p>
                Ethos reputation affects borrowing terms. Collateral remains the safety
                mechanism. The protocol stays collateralized — reputation does not
                replace collateral, and it cannot prevent an exit.
              </p>
              <p className="mt-5">
                Users can repay debt and withdraw eligible collateral. A score can
                influence new borrowing, but it cannot strand a solvent position.
              </p>
              <Link
                to="/credit"
                className="mt-8 inline-flex text-body-sm font-semibold text-brand-300 hover:text-brand-500 transition-colors"
              >
                Review your credit capacity →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Credit tiers ────────────────────────────────────────────────
          A ladder, not a pricing table: three ruled rows whose LTV column
          is the only figure, so the progression reads as published policy. */}
      <section className="border-b border-line">
        <div className="shell py-20 lg:py-24">
          <div className="grid lg:grid-cols-[.7fr_1.3fr] gap-14">
            <div>
              <div className="section-label text-brand-500">Credit tiers</div>
              <h2 className="mt-4 text-h2 sm:text-h1">Open → Established → Reputable.</h2>
              <p className="mt-5 text-body text-muted leading-relaxed">
                A small, understandable ladder turns the Ethos signal into published
                borrowing terms. The collateral requirement never disappears.
              </p>
            </div>
            <div className="border-t border-line">
              {(
                [
                  ["OPEN", "Below 1,600", "38.5%", "Entry-level borrowing terms, for users beginning to establish credibility."],
                  ["ESTABLISHED", "1,600–1,999", "62.5%", "Improved borrowing terms, for users with stronger Ethos credibility."],
                  ["REPUTABLE", "2,000+", "77.0%", "The strongest borrowing terms, for users with high Ethos credibility."],
                ] as const
              ).map(([name, score, ltv, description], index) => (
                <div
                  key={name}
                  className="grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[3rem_1fr_8rem_10rem] gap-4 items-center py-5 border-b border-line"
                >
                  <span className="font-mono text-micro text-brand-500">0{index + 1}</span>
                  <div>
                    <div className="text-body-sm font-semibold text-slate-50">{name}</div>
                    <div className="mt-1 text-micro text-muted">Ethos score {score}</div>
                  </div>
                  <div className="text-right sm:text-left">
                    <div className="font-mono text-body-sm text-slate-50">{ltv}</div>
                    <div className="text-micro text-muted">max LTV</div>
                  </div>
                  <div className="hidden sm:block text-body-sm text-muted leading-relaxed">
                    {description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── asides ──────────────────────────────────────────────────────────── */

/**
 * The Ethos score figure, attributed. Shown beside layer 01 so the reader
 * meets the actual shape of the signal — mark, figure, level ramp — before
 * the tier table states what the figure buys.
 */
function EthosExample() {
  return (
    <div className="inline-flex items-center gap-4 border border-line bg-surface-solid px-4 py-3">
      <EthosMark className="w-5 h-5 text-ethos-600 flex-shrink-0" />
      <div>
        <div className="text-micro text-muted">Ethos score · Open</div>
      </div>
      <div className="hidden sm:block border-l border-line pl-4 text-micro text-subtle leading-relaxed">
        Open / Established
        <br />
        / Reputable
      </div>
    </div>
  );
}
