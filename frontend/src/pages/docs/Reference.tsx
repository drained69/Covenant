import { Link } from "react-router-dom";
import { DocPage, Section, Note } from "./_primitives";
import { REPO_URL as REPO } from "./docsNav";
import { IconArrowRight, IconExternal } from "../../components/icons";
import { CHAIN, EXPLORER, MEZO_FAUCET_URL } from "../../config/chain";
import { CREDIT, CREDIT_TOKENS } from "../../config/credit";

/*
  Reference.

  The one page in this section that is a lookup rather than an argument. The
  other five explain a mechanism; this one answers "what is the collateral
  address" in as few eye movements as possible. So it is almost entirely
  tables, and the prose that survives is only there to say what a row means.

  Every chain value is read from `config/chain.ts` and every contract address
  from `config/credit.ts`, rather than transcribed. A
  reference page that restates its own source is a reference page that goes
  stale silently — and a wrong address here is worse than no page at all,
  because it looks authoritative. Swap the deployment and this page follows.
*/

export function Reference() {
  const loan = CREDIT_TOKENS.loan.symbol;
  const collateral = CREDIT_TOKENS.collateral.symbol;
  const maturity = new Date(CREDIT.maturity * 1000).toISOString().slice(0, 10);
  const tiers = [
    { key: "open" as const, name: "Open", ltv: "38.5%" },
    { key: "established" as const, name: "Established", ltv: "62.5%" },
    { key: "reputable" as const, name: "Reputable", ltv: "77%" },
  ];

  return (
    <DocPage
      eyebrow="Reference"
      title="Networks and addresses"
      lede={`What ${CHAIN.name} this app calls, and the ${loan} and ${collateral} addresses it lends against. Every value is read from the app's own configuration.`}
    >
      <Note title="Testnet deployment">
        <p>
          Covenant lends on {CHAIN.name} with testnet {loan} and {collateral}. The{" "}
          <a href={MEZO_FAUCET_URL} target="_blank" rel="noreferrer" className="link">
            faucet
          </a>{" "}
          drips {collateral} for gas and collateral. It does not mint {loan}. The contracts are
          unaudited. Do not send mainnet funds to these addresses. Mainnet {loan}{" "}
          <code className="code-inline">0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186</code> is a
          different token.
        </p>
      </Note>

      <Section
        title="Chain"
        subtitle="What the wallet has to be pointed at before a borrow or a supply will submit."
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
              {CHAIN.nativeCurrency.decimals} decimals. The same balance pays gas and is the
              collateral once you deposit it. The BTC precompile mirrors it.
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
          <div className="def-row">
            <div className="def-label">Maturity</div>
            <div className="def-value">
              <code className="code-inline">{maturity}</code>. No new debt after this time.
              Repayment stays open.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Contracts"
        subtitle={`The credit engine, the ${loan} you borrow, the ${collateral} you post, and the three markets.`}
      >
        <div className="card overflow-hidden">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Address</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                <tr className="table-row-hover">
                  <td className="text-slate-100 whitespace-nowrap">Covenant</td>
                  <td>{CREDIT.covenant ? <AddressLink address={CREDIT.covenant} /> : "unset"}</td>
                  <td className="text-slate-300">Holds collateral and debt. Every fill, repayment, and withdrawal lands here.</td>
                </tr>
                <tr className="table-row-hover">
                  <td className="text-slate-100 whitespace-nowrap">Notary</td>
                  <td>{CREDIT.notary ? <AddressLink address={CREDIT.notary} /> : "unset"}</td>
                  <td className="text-slate-300">Checks the lender&apos;s EIP-712 offer before a fill moves {loan}.</td>
                </tr>
                <tr className="table-row-hover">
                  <td className="text-slate-100 whitespace-nowrap">Oracle</td>
                  <td>{CREDIT.oracle ? <AddressLink address={CREDIT.oracle} /> : "unset"}</td>
                  <td className="text-slate-300">Skip BTC/USD adapter. Feed decimals are hardcoded at 18. Stale after six hours.</td>
                </tr>
                <tr className="table-row-hover">
                  <td className="text-slate-100 whitespace-nowrap">{loan}</td>
                  <td><AddressLink address={CREDIT.loanToken} /></td>
                  <td className="text-slate-300">Loan token, {CREDIT_TOKENS.loan.decimals} decimals. Testnet {loan}, not the mainnet token.</td>
                </tr>
                <tr className="table-row-hover">
                  <td className="text-slate-100 whitespace-nowrap">{collateral}</td>
                  <td>
                    {CREDIT.collateralToken ? <AddressLink address={CREDIT.collateralToken} /> : "unset"}
                  </td>
                  <td className="text-slate-300">Collateral precompile, {CREDIT_TOKENS.collateral.decimals} decimals. balanceOf mirrors native BTC.</td>
                </tr>
                {tiers.map((tier) => {
                  const market = CREDIT.markets[tier.key];
                  return (
                    <tr key={tier.key} className="table-row-hover">
                      <td className="text-slate-100 whitespace-nowrap">{tier.name}</td>
                      <td>
                        <div className="space-y-1">
                          <div>{market.gate ? <AddressLink address={market.gate} /> : "unset"}</div>
                          <div className="font-mono text-micro text-subtle break-all">{market.marketId}</div>
                        </div>
                      </td>
                      <td className="text-slate-300">
                        Gate, then market id. Score bar {market.threshold === 0 ? "none" : `≥ ${market.threshold}`}. Max LTV {tier.ltv}.
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Reputation"
        subtitle="The score is Ethos's. The gate that enforces it is already part of each market."
      >
        <div className="card">
          <div className="def-row">
            <div className="def-label">Score source</div>
            <div className="def-value">
              Ethos credibility for the connected wallet. A wallet with no profile borrows on Open.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">Tier policy</div>
            <div className="def-value">
              Open, Established, and Reputable are live. Thresholds and max LTVs are on{" "}
              <Link to="/docs/credit-ladder" className="link">Credit tiers</Link>.
            </div>
          </div>
          <div className="def-row">
            <div className="def-label">On-chain enforcement</div>
            <div className="def-value">
              Borrowing calls <code className="code-inline">canIncreaseDebt</code> on that
              market&apos;s gate. The authorization lasts six hours, is bound to this wallet and
              chain {CHAIN.id}, and is cached in the browser. The first signature still needs the
              credit service. Liquidation does not read the score. Repay, solvent withdraw, and
              cancelling an unfilled offer are not score-gated.
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Repository"
        subtitle="The contracts and the long-form notes these pages were written from."
      >
        <div className="card">
          {MEZO_REPO_LINKS.map((l) => (
            <div key={l.href} className="def-row">
              <div className="def-label">
                <a href={l.href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
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
            The operating steps — fund BTC, borrow, supply, repay — are on the how-to page.
          </p>
          <Link to="/docs/how-to" className="btn-secondary flex-shrink-0">
            How to use Covenant
            <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>
    </DocPage>
  );
}

/* ── data ───────────────────────────────────────────────────────────── */

const MEZO_REPO_LINKS = [
  {
    href: REPO,
    label: "drained69/covenant",
    blurb: "Contracts, the Mezo deploy script, and the Foundry test suite.",
  },
  {
    href: `${REPO}/blob/main/docs/Mezo.md`,
    label: "docs/Mezo.md",
    blurb: "Chain parameters, the Skip oracle caveat, and how this testnet deployment was produced.",
  },
  {
    href: `${REPO}/blob/main/docs/CoreMath.md`,
    label: "docs/CoreMath.md",
    blurb: "Oracle scaling, health, fees, and liquidation. The in-app math page is the short form.",
  },
  {
    href: `${REPO}/blob/main/offchain/SIGNING.md`,
    label: "offchain/SIGNING.md",
    blurb: "The EIP-712 offer the notary checks, including chain 31611.",
  },
] as const;

/* ── helpers ────────────────────────────────────────────────────────── */

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
