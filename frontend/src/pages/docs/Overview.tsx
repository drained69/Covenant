import { Link } from "react-router-dom";
import { DOCS_NAV, REPO_URL } from "./docsNav";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconArrowRight, IconChevronRight, IconExternal } from "../../components/icons";
import { CHAIN } from "../../config/chain";

/*
  The docs index.

  Three jobs, in this order: say what Covenant is to someone who arrived from a
  link and has no context, route them to a page, and be honest about what this
  deployment currently is.

  Both the card grid and the page count are derived from `DOCS_NAV`, so adding a
  page adds a card and corrects the prose. The previous version hardcoded "Six
  pages" in a subtitle, which is the kind of sentence that goes quietly wrong the
  first time someone adds a seventh.
*/
export function Overview() {
  return (
    <DocPage
      eyebrow="Documentation"
      title="Covenant"
      lede={
        <>
          Reputation-aware trading capital for DreamDEX Event Contracts on Somnia. These pages
          cover how the protocol works, what the reputation layer actually enforces, and the
          math the contracts run.
        </>
      }
    >
      <Section
        title="What this is"
        subtitle="The argument in two paragraphs, then the three things that follow from it."
      >
        <Prose>
          <p>
            Prediction markets are capital-intensive. Traders must fully fund every position
            even when they carry a strong, portable on-chain reputation — and every wallet is
            treated identically regardless of how it has behaved across the ecosystem.
          </p>
          <p>
            Covenant combines two primitives: Ethos credibility as an underwriting signal, and
            collateral as the security mechanism. A wallet's score maps it to a transparent
            credit tier that sets the terms under which its collateral supports borrowed
            capital — and that capital flows straight into live DreamDEX markets. Reputation
            improves access; it never replaces collateral, and a falling score can never block
            an exit.
          </p>
        </Prose>

        {/* These three were one paragraph beginning "Everything else follows from
            that." They are a list wearing prose, and a list is what a reader
            arriving from a link can actually scan. Each carries the file that
            implements it, so the claim is checkable rather than asserted. */}
        <div className="grid md:grid-cols-3 gap-5">
          {CONSEQUENCES.map((c) => (
            <div key={c.title} className="card p-6 space-y-3">
              <div className="card-title">{c.title}</div>
              <p className="text-body-sm text-slate-300 leading-relaxed">{c.body}</p>
              <div className="pt-3 border-t border-line text-micro font-mono text-subtle">
                {c.source}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Start here"
        subtitle={`${spell(DOCS_NAV.length)} pages. The first is the one to read if you only read one.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {DOCS_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="card card-interactive p-5 flex flex-col gap-2 group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="card-title">{item.label}</div>
                <IconChevronRight
                  className="w-4 h-4 text-subtle flex-shrink-0 transition-transform duration-200
                             group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <p className="text-body-sm text-slate-300 leading-relaxed">{item.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Added because the card grid says what each page contains but not what
          order to take them in, and the right order depends entirely on why you
          opened the docs. An engineer evaluating the primitive and an integrator
          wiring a gate want almost disjoint subsets. */}
      <Section
        title="Reading paths"
        subtitle="The same pages, sequenced three ways. Pick the row that matches why you are here."
      >
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>If you came to…</th>
                  <th>Read, in order</th>
                </tr>
              </thead>
              <tbody>
                {READING_PATHS.map((path) => (
                  <tr key={path.goal}>
                    <td className="text-slate-100">{path.goal}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {path.steps.map((step, i) => (
                          <span key={step.to} className="inline-flex items-center gap-2">
                            {i > 0 && (
                              <span className="text-subtle" aria-hidden="true">
                                →
                              </span>
                            )}
                            <Link to={step.to} className="link">
                              {step.label}
                            </Link>
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Before you transact"
        subtitle="What this deployment is, and what it is not."
      >
        <Note title="Unaudited testnet software">
          <p>
            Covenant trades on {CHAIN.name} with test tokens. The contracts have not been
            audited. Nothing here should hold production funds, and the tokens in the
            markets have no value — the venue collateral drips from the{" "}
            <Link to="/faucet" className="link">
              faucet
            </Link>
            .
          </p>
          <p>
            The on-chain tier gates and three credit markets are deployed on Somnia testnet.
            Every DreamDEX order still settles against real TestUSDC held by your wallet;
            available credit must be borrowed into that balance before it can be traded. See{" "}
            <Link to="/docs/credit-ladder" className="link">
              Credit tiers
            </Link>{" "}
            for what is enforced today and what is next.
          </p>
        </Note>

        <div className="card p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <div className="text-h3 text-slate-50">Start reading</div>
            <p className="mt-1.5 text-body-sm text-muted max-w-md">
              Or go straight to the source —{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-1.5"
              >
                drained69/covenant
                <IconExternal className="w-3.5 h-3.5" />
              </a>{" "}
              carries the contracts, the Foundry suite, and the long-form derivations these
              pages condense.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 flex-shrink-0">
            <Link to="/docs/how-to" className="btn-secondary group">
              How to use Covenant
              <IconArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link to="/docs/how-it-works" className="btn-primary group">
              How it works
              <IconArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link to="/markets" className="btn-secondary">
              Browse markets
            </Link>
          </div>
        </div>
      </Section>
    </DocPage>
  );
}

/* ── data ───────────────────────────────────────────────────────────── */

/*
  Deliberately stated without figures. The credit ladder's numbers — the LLTVs,
  the collateral comparison — belong on the pages that derive them; repeating
  them here would mean two places to correct when a rung moves.
*/
const CONSEQUENCES = [
  {
    title: "Terms fixed at issuance",
    body: "Credit units are sold at a discount and redeemed 1:1 at maturity, so the discount is the interest. Nothing floats with utilisation — a borrower's cost is settled when they sign, not discovered later.",
    source: "src/Covenant.sol",
  },
  {
    title: "The gate is part of the market id",
    body: "A market id is the keccak of every field, gate address included. A market's underwriting policy cannot be rebound after creation, because rebinding it produces a different market with no shared state.",
    source: "src/libraries/IdLib.sol",
  },
  {
    title: "The reputation prices the terms",
    body: "A ladder of tiers turns a raw score into terms: higher Ethos credibility clears a higher bar, and a higher bar carries better collateral terms. The binding is in the market id, not in an operator's discretion.",
    source: "src/periphery/CreditLadderLens.sol",
  },
] as const;

/*
  Three audiences, and the pages each can skip. The trader path leads with
  How it works because a trader evaluating the product wants the flow before
  the policy detail.
*/
const READING_PATHS = [
  {
    goal: "Understand the primitive",
    steps: [
      { to: "/docs/how-it-works", label: "How it works" },
      { to: "/docs/architecture", label: "Architecture" },
      { to: "/docs/math", label: "Core math" },
    ],
  },
  {
    goal: "Qualify for capital",
    steps: [
      { to: "/credit", label: "Your tier" },
      { to: "/docs/credit-ladder", label: "Credit tiers" },
      { to: "/docs/reference", label: "Reference" },
    ],
  },
  {
    goal: "Assess what is actually enforced",
    steps: [
      { to: "/docs/credit-ladder", label: "Credit tiers" },
      { to: "/docs/math", label: "Core math" },
      { to: "/docs/reference", label: "Reference" },
    ],
  },
] as const;

/* ── helpers ────────────────────────────────────────────────────────── */

/*
  Small numbers read better spelled out in a sentence than as digits, but the
  count has to come from the array or it goes stale. Beyond the table, the
  numeral is fine — "12 pages" in a subtitle is not the sentence anyone is
  reading for style.
*/
const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five",
  "Six", "Seven", "Eight", "Nine", "Ten",
];

function spell(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}
