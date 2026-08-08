import { Link } from "react-router-dom";
import { DocPage, Section, Prose, Note } from "./_primitives";
import { REPO_URL as REPO } from "./docsNav";
import { IconArrowRight, IconExternal } from "../../components/icons";
import { ADDRESSES, TOKENS, LADDER, LADDER_DEPLOYED, CHAIN, EXPLORER } from "../../config/chain";

/*
  Reference.

  The one page in this section that is a lookup rather than an argument. The
  other five explain a mechanism; this one answers "what is the gate address"
  in as few eye movements as possible. So it is almost entirely tables, and the
  prose that survives is only there to say what a row means.

  Every address, decimal, and chain id is read from `config/chain.ts` rather
  than transcribed. A reference page that restates its own source is a reference
  page that goes stale silently — and a wrong address here is worse than no page
  at all, because it looks authoritative. Swap the deployment in that file and
  this page follows.
*/

/* The repository URL is shared with the docs index; see `docsNav.ts`. */

export function Reference() {
  return (
    <DocPage
      eyebrow="Reference"
      title="Addresses and metadata"
      lede="The live Monad testnet deployment: core contracts, token decimals, the ladder's gates, and the chain parameters a wallet needs. Every value is read from the app's own configuration, so what you see here is what the interface is calling."
    >
      <Note title="Testnet deployment">
        <p>
          These are {CHAIN.name} addresses holding test assets. The tokens are mintable from the{" "}
          <Link to="/faucet" className="link">
            faucet
          </Link>{" "}
          and carry no value. The contracts are unaudited.
        </p>
      </Note>

      <Section
        title="Chain"
        subtitle="What your wallet needs to be pointed at. Covenant is deployed to one chain at a time."
      >
        <div className="card">
          <div className="def-row">
            <div className="def-label">Network</div>
            <div className="def-value">{CHAIN.name}</div>
          </div>
          <div className="def-row">
            <div className="def-label">Chain id</div>
            <div className="def-value">
              <code className="code-inline">{CHAIN.id}</code>
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Native currency</div>
            <div className="def-value">
              {CHAIN.nativeCurrency.name} ({CHAIN.nativeCurrency.symbol}),{" "}
              {CHAIN.nativeCurrency.decimals} decimals — gas only. Covenant itself never moves the
              native token.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">RPC</div>
            <div className="def-value">
              <code className="code-inline break-all">{CHAIN.rpcUrls.default.http[0]}</code>
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Explorer</div>
            <div className="def-value">
              <a href={EXPLORER} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
                {EXPLORER.replace(/^https?:\/\//, "")}
                <IconExternal className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Core contracts"
        subtitle="Six addresses. The engine, the price it reads, the notary that validates signatures, and the gate that answers the compliance question."
      >
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Address</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {CORE_CONTRACTS.map((c) => (
                  <tr key={c.address} className="table-row-hover">
                    <td className="text-slate-100 whitespace-nowrap">{c.name}</td>
                    <td>
                      <AddressLink address={c.address} />
                    </td>
                    <td className="text-slate-300">{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Prose>
          <p>
            The gate and the validator are two contracts because they answer to different owners.{" "}
            <code className="code-inline">CleanversePoolGate</code> is Covenant's — it holds the rule
            list and implements the one boolean method the engine calls. The validator behind it is
            Cleanverse's, CREATE2-deployed to the same address on every chain they support. Covenant
            never issues a credential; it only asks whether one clears a bar. See{" "}
            <Link to="/docs/compliance" className="link">
              Compliance
            </Link>{" "}
            for the two integration paths that address supports.
          </p>
        </Prose>
      </Section>

      <Section
        title="Tokens"
        subtitle="Decimals are the reason the oracle carries a 1e36 scale. Both are mintable test assets."
      >
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Decimals</th>
                  <th>Role</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {TOKENS.map((t) => (
                  <tr key={t.address} className="table-row-hover">
                    <td className="text-slate-100 font-medium whitespace-nowrap">{t.symbol}</td>
                    <td className="text-slate-300 whitespace-nowrap">{t.name}</td>
                    <td className="font-mono tabular-nums text-slate-300">{t.decimals}</td>
                    <td className="text-slate-300 whitespace-nowrap">{t.role}</td>
                    <td>
                      <AddressLink address={t.address} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Prose>
          <p>
            The engine stores raw balances and never learns what a decimal is. Converting between a
            6-decimal loan token and an 8-decimal collateral token is entirely the oracle wrapper's
            job, which is why its scale has to be larger than WAD —{" "}
            <Link to="/docs/math" className="link">
              Core math
            </Link>{" "}
            derives the identity.
          </p>
        </Prose>
      </Section>

      <Section
        title="Credit ladder"
        subtitle="Three rungs, each a market whose gate is hashed into its own id. The lens resolves all three in one call."
      >
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Rungs</div>
            <span className="text-micro font-semibold uppercase text-muted">
              {LADDER_DEPLOYED ? "Lens live" : "Lens pending"}
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Rung</th>
                  <th>Min sub-tier</th>
                  <th>LLTV</th>
                  <th>Gate</th>
                  <th>Market id</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.rungs.map((rung) => (
                  <tr key={rung.key} className="table-row-hover">
                    <td className="text-slate-100 whitespace-nowrap">{rung.label}</td>
                    <td className="font-mono tabular-nums text-slate-300">{rung.minSubTier}</td>
                    <td className="font-mono tabular-nums text-slate-300">{formatLltv(rung.lltv)}</td>
                    <td>
                      {rung.gate ? (
                        <AddressLink address={rung.gate} />
                      ) : (
                        <span className="text-subtle">not deployed</span>
                      )}
                    </td>
                    <td className="font-mono text-body-sm text-slate-300">
                      {rung.marketId ? truncate(rung.marketId) : (
                        <span className="text-subtle">not initialised</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="def-row">
            <div className="def-label">CreditLadderLens</div>
            <div className="def-value">
              {LADDER.lens ? (
                <AddressLink address={LADDER.lens} />
              ) : (
                <span className="text-subtle">not deployed</span>
              )}
            </div>
          </div>
        </div>

        <Note title="Gates are deployed but not yet registered">
          <p>
            Each gate reads its minimum sub-tier from a rule list held by the Cleanverse validator.
            Until a gate completes registration that list is empty and the gate denies every
            account — including one holding a valid A-Pass. All three rungs currently read as
            inaccessible, which is a statement about the deployment rather than about your
            credential.
          </p>
        </Note>
      </Section>

      <Section
        title="Repository"
        subtitle="The contracts and the long-form documentation these pages were condensed from."
      >
        <div className="card">
          {REPO_LINKS.map((l) => (
            <div key={l.href} className="def-row">
              <div className="def-label">
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="link inline-flex items-center gap-1.5"
                >
                  {l.label}
                  <IconExternal className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="def-value">{l.blurb}</div>
            </div>
          ))}
        </div>

        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <p className="text-body-sm text-muted max-w-xl">
            If you are reading this section first, the walkthrough is the page that makes the rest
            of these addresses mean something.
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

/* ── data ───────────────────────────────────────────────────────────── */

/*
  Ordered by how often a reader needs the row, not by deployment order. The
  engine and the gate are what people come here for; the notary is what they
  look up once when a signature is rejected.
*/
const CORE_CONTRACTS = [
  {
    name: "Covenant",
    address: ADDRESSES.covenant,
    role: "The engine. Holds every market, position, and offer fill.",
  },
  {
    name: "CleanversePoolGate",
    address: ADDRESSES.gate,
    role: "Covenant's gate. Holds the rule list and answers the engine's one boolean question.",
  },
  {
    name: "CVI Compliance Validator",
    address: ADDRESSES.validator,
    role: "Cleanverse's validator (CCP V2). Same address on every chain they support.",
  },
  {
    name: "BtcUsdOracle",
    address: ADDRESSES.oracle,
    role: "Owner-push price feed. Staleness window is disabled, so a pushed price does not expire.",
  },
  {
    name: "EcrecoverNotary",
    address: ADDRESSES.notary,
    role: "Validates the EIP-712 signature on an off-chain offer at fill time.",
  },
] as const;

const REPO_LINKS = [
  {
    href: REPO,
    label: "drained69/covenant",
    blurb: "Contracts, deployment scripts, and the Foundry test suite.",
  },
  {
    href: `${REPO}/blob/main/docs/CoreMath.md`,
    label: "docs/CoreMath.md",
    blurb:
      "The full derivation the Core math page condenses, including the sections on what the contracts deliberately do not enforce.",
  },
  {
    href: `${REPO}/blob/main/offchain/SIGNING.md`,
    label: "offchain/SIGNING.md",
    blurb:
      "Producing and validating an EIP-712 offer — the signing flow that precedes every fill.",
  },
  {
    href: `${REPO}/blob/main/README.md`,
    label: "README.md",
    blurb: "Build, test, and local deployment instructions.",
  },
] as const;

/* ── helpers ────────────────────────────────────────────────────────── */

/*
  WAD-scaled ratio to a percentage. The ladder's LLTVs are exact at one decimal
  place (91.5%, 77.0%, 38.5%), so this trims a trailing ".0" rather than
  padding every value to a fixed width.
*/
function formatLltv(wad: bigint): string {
  const tenths = Number((wad * 1000n) / 10n ** 18n) / 10;
  return `${tenths}%`;
}

function truncate(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="link inline-flex items-center gap-1.5 font-mono text-body-sm whitespace-nowrap"
    >
      {truncate(address)}
      <IconExternal className="w-3.5 h-3.5" />
    </a>
  );
}
