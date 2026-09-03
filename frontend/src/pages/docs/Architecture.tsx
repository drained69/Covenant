import { Link } from "react-router-dom";
import { DocPage, Section, LayerCard, Prose, Note } from "./_primitives";
import { IconArrowRight } from "../../components/icons";

/*
  Architecture.

  There is one through-line worth holding onto while reading this page: every
  structural decision exists to make a market's *policy* inseparable from its
  *identity*. The four-layer diagram is the shape of the system; the keccak
  fingerprint in §2 is the mechanism that makes the shape hold under an
  adversary who controls deployment.
*/
export function Architecture() {
  return (
    <DocPage
      eyebrow="Architecture"
      title="How the system fits together"
      lede="Four layers, each talking to the one below through a narrow, view-only interface — and a market id that is the hash of every parameter, gate addresses included, so a market's underwriting policy cannot be rebound after the market exists."
    >
      <Section
        title="The four layers"
        subtitle="Nothing above the credit engine can change what it enforces. Nothing below the frontend knows the frontend exists."
      >
        <div className="grid md:grid-cols-2 gap-5">
          <LayerCard
            index="01"
            title="Frontend"
            path="frontend/"
            body="React + wagmi SPA. Discovers live DreamDEX Event Contracts through the official Somnia Markets SDK, reads Ethos credibility per wallet, submits Up/Down orders, and tracks the unified credit and position portfolio. There is no backend of our own."
          />
          <LayerCard
            index="02"
            title="Off-chain services"
            path="offchain/"
            body="sign_offer.js produces EIP-712 credit offers; the Ethos score service reads credibility, checks status and freshness, and issues short-lived wallet-bound score authorizations — bounded underwriting signals, never fund-moving authority."
          />
          <LayerCard
            index="03"
            title="Credit engine"
            path="src/Covenant.sol"
            body="The fixed-maturity credit primitive: markets, positions, fills, settlement, seizure. It holds the funds and owns every state transition. It knows about gates only as an address it staticcalls."
          />
          <LayerCard
            index="04"
            title="Reputation surface"
            path="src/compliance/ · src/periphery/"
            body="Gates answer 'may this account take new exposure?' through narrow policy hooks — canIncreaseDebt, canIncreaseCredit, canLiquidate. Score authorizations are wallet-, chain-, contract-, nonce-, and expiry-bound, and fail closed."
            emphasized
          />
        </div>

        <Prose>
          <p>
            The direction of the arrows matters more than the boxes. The credit engine never
            calls up into the frontend, and it never calls out to anything that can change its
            own accounting — a gate is reached through <code className="code-inline">staticcall</code>,
            so it cannot write state, cannot re-enter, and cannot consume more than the gas it
            was budgeted. The worst a misbehaving gate can do is say no.
          </p>
        </Prose>
      </Section>

      <Section
        title="Market identity"
        subtitle="A market id is not assigned. It is derived — the keccak-256 of a fingerprint over every parameter that could change how the market behaves."
      >
        <div className="card p-5 overflow-x-auto">
          <pre className="text-body-sm font-mono text-slate-300 leading-relaxed whitespace-pre">
{`id = keccak256(abi.encodePacked(
      uint8(0xff),
      covenant,                    // this contract's address
      chainId,                     // frozen at construction
      keccak256(abi.encodePacked(
          SSTORE2_PREFIX,
          abi.encode(market)       // loanToken, collateralParams[],
      ))                           // maturity, rcfThreshold,
))                                 // entryGate, seizureGate`}
          </pre>
        </div>

        <Prose>
          <p>
            Four consequences fall directly out of that, and together they are most of what
            makes the underwriting story credible. They are stated as invariants I1.1–I1.4 in{" "}
            <code className="code-inline">docs/CoreMath.md</code>, and they are properties of
            keccak rather than of any access-control code we wrote.
          </p>
        </Prose>

        <div className="card">
          <div className="def-row">
            <div className="def-label">Uniqueness</div>
            <div className="def-value">
              Two markets differing in any field produce different ids. Positions in one market
              can never be mistaken for positions in another.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Immutability</div>
            <div className="def-value">
              There is no <code className="code-inline">updateMarket</code>. Parameters are fixed
              once initialised; only market <em>state</em> — fees, loss factor, withdrawable,
              total units — moves.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Chain separation</div>
            <div className="def-value">
              <code className="code-inline">chainId</code> is inside the hash, so identical
              parameters on two chains yield distinct ids. A signed offer cannot be replayed
              across chains.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Gate immutability</div>
            <div className="def-value">
              <code className="code-inline">entryGate</code> and{" "}
              <code className="code-inline">seizureGate</code> are inside the fingerprint. A
              market's compliance policy is structurally fixed at creation.
            </div>
          </div>
        </div>

        <Note title="Why a gate swap is a different market">
          <p>
            In a system where the gate is a mutable pointer, "this market requires a 2000
            score" is a statement about the current value of a storage slot — true until an
            admin key says otherwise, and unverifiable by anyone reading a past transaction.
            Here it is a statement about an identifier. Point a market at a different gate and
            you have not modified that market; you have described a different one, with a
            different id, holding none of the original's liquidity or positions.
          </p>
          <p>
            That is the whole reason the tiers in{" "}
            <Link to="/docs/credit-ladder" className="link">Credit tiers</Link> can bind an LTV
            to a reputation bar. The 77% market is not a market that happens to use the
            Reputable-tier gate today — the Reputable-tier gate is part of what makes it that
            market.
          </p>
        </Note>
      </Section>

      <Section
        title="Where market data lives"
        subtitle="Markets are written once to contract bytecode rather than to storage slots."
      >
        <Prose>
          <p>
            The <code className="code-inline">Market</code> struct is stored with{" "}
            <code className="code-inline">SSTORE2</code>: the encoded struct becomes the bytecode
            of a small contract, deployed via{" "}
            <code className="code-inline">CREATE2</code> with{" "}
            <code className="code-inline">salt = chainId</code>. Reading it is a{" "}
            <code className="code-inline">extcodecopy</code> rather than a chain of{" "}
            <code className="code-inline">SLOAD</code>s, which is cheaper for a struct this size
            and — more importantly here — physically immutable once written.
          </p>
          <p>
            That is also what closes the loop on identity. Because the deployment address is
            deterministic in the market's own contents, the mapping from a{" "}
            <code className="code-inline">Market</code> to its storage address is a pure function.
            There is no registry entry to corrupt and no pointer to redirect.
          </p>
        </Prose>
      </Section>

      <Section
        title="Offers off-chain, fills on-chain"
        subtitle="The order book is a signature format, not a contract."
      >
        <Prose>
          <p>
            A maker signs an EIP-712 <code className="code-inline">Offer</code> — market, side,
            price tick, expiry, maximum size — and publishes it wherever they like: a chat, an
            API, a file. Nothing is on-chain and nothing costs gas until a taker calls{" "}
            <code className="code-inline">fillOffer</code>, at which point the engine ratifies the
            signature through the offer's notary and only then touches positions.
          </p>
          <p>
            This is why the frontend has no backend to run and no orders to custody. It also means
            an offer is cancellable for free — stop publishing it, or let the expiry pass — and
            that two counterparties can trade a market this UI has never heard of, as long as both
            sides can compute the same id.
          </p>
        </Prose>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            The signing format, the notary interface, and a worked example live in{" "}
            <code className="code-inline">offchain/SIGNING.md</code>. The step-by-step version of
            the fill path is on the overview page.
          </p>
          <Link to="/docs/how-it-works" className="btn-secondary flex-shrink-0">
            How it works
            <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>
    </DocPage>
  );
}
