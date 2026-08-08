import { Link } from "react-router-dom";
import { DOCS_NAV } from "./docsNav";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { IconArrowRight, IconChevronRight } from "../../components/icons";
import { CHAIN } from "../../config/chain";

/*
  The docs index.

  Two jobs, in this order: say what Covenant is to someone who arrived from a
  link and has no context, then route them. The card grid is generated from
  `DOCS_NAV`, so adding a page adds a card — there is no second list to update.
*/
export function Overview() {
  return (
    <DocPage
      eyebrow="Documentation"
      title="Covenant"
      lede={
        <>
          Fixed-rate, fixed-maturity credit where the compliance check is part of the
          transaction rather than a promise made beside it. These pages cover how the
          protocol works, what the gate actually enforces, and the math the contracts run.
        </>
      }
    >
      <Section
        title="What this is"
        subtitle="A one-paragraph version, for readers who arrived from a link."
      >
        <Prose>
          <p>
            Institutional credit on-chain has an unresolved tension. Permissionless pools
            are liquid but cannot say who is on the other side of a position, so regulated
            capital cannot touch them. Permissioned venues can say who, but do it with an
            allowlist maintained off-chain — which means the guarantee lives in an
            operator's database, not in the contract.
          </p>
          <p>
            Covenant takes the third option: the eligibility check runs inside the state
            transition. A position cannot be opened unless a bounded call to a compliance
            validator returns true in the same transaction that moves the funds. There is
            no window between "verified" and "settled", because they are the same
            transaction. If the validator reverts, is missing, or runs out of the gas it
            was budgeted, the fill reverts — the gate fails closed.
          </p>
          <p>
            Everything else follows from that. Terms are fixed at issuance rather than
            floating with utilisation. Markets are content-addressed, so a market's gate
            is part of its identity and cannot be swapped after the fact. And the credit
            ladder binds a borrower's verified tier to a specific loan-to-value, in the
            market id itself.
          </p>
        </Prose>
      </Section>

      <Section
        title="Start here"
        subtitle="Six pages. The first is the one to read if you only read one."
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

      <Section
        title="Before you transact"
        subtitle="What this deployment is, and what it is not."
      >
        <Note title="Unaudited testnet software">
          <p>
            Covenant is deployed on {CHAIN.name} with test tokens. The contracts have not
            been audited. Nothing here should hold production funds, and the tokens in the
            markets have no value — they are mintable from the{" "}
            <Link to="/faucet" className="link">
              faucet
            </Link>
            .
          </p>
          <p>
            The compliance gates for the credit ladder are deployed and whitelisted but
            have not completed Cleanverse registration. Until they do, their rule lists are
            empty and every wallet reads as not-yet-eligible. That is a registration state,
            not a verdict on any particular wallet — see{" "}
            <Link to="/docs/credit-ladder" className="link">
              Credit ladder
            </Link>{" "}
            for the current status of each rung.
          </p>
        </Note>

        <div className="flex flex-wrap gap-3">
          <Link to="/docs/how-it-works" className="btn btn-primary group">
            How it works
            <IconArrowRight
              className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
          <Link to="/markets" className="btn btn-secondary">
            Browse markets
          </Link>
        </div>
      </Section>
    </DocPage>
  );
}
