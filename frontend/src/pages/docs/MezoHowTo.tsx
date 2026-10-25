import { Link } from "react-router-dom";
import { IconArrowRight, IconExternal } from "../../components/icons";
import { CHAIN, EXPLORER, MEZO_APP_URL, MEZO_FAUCET_URL } from "../../config/chain";
import { CREDIT, CREDIT_TOKENS } from "../../config/credit";
import { ETHOS_SETTINGS_URL, ETHOS_TIERS } from "../../config/dreamdex";
import { DocPage, Note, Section, StepCard } from "./_primitives";

const loan = CREDIT_TOKENS.loan.symbol;
const collateral = CREDIT_TOKENS.collateral.symbol;
const maturity = new Date(CREDIT.maturity * 1000).toISOString().slice(0, 10);

/**
 * Operating guide for the Mezo credit app. The Somnia walkthrough stays in
 * HowTo.tsx and is not shown on this deployment.
 */
export function MezoHowTo() {
  return (
    <DocPage
      eyebrow="User guide"
      title="How to use Covenant"
      lede={
        <>
          Borrow {loan} against {collateral} on {CHAIN.name}. Your Ethos score picks the market.
          The market fixes the maximum loan-to-value. You repay the same amount of {loan}.
        </>
      }
    >
      <Section
        title="What you are using"
        subtitle="Three fixed-rate credit markets. There is no Event Contract book on this deployment."
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Markets"
            body={`Open, Established, and Reputable. Same ${loan}, same ${collateral}, different max LTV. Borrow is enabled only on the market your score qualifies for.`}
            hint="/markets"
          />
          <StepCard
            n={2}
            title="Borrow"
            body={`Authorize your score, post ${collateral}, and borrow the amount you type. The app does not add a hidden reserve, and it does not switch you to another market.`}
            hint="Borrow on the home page or a market"
            emphasized
          />
          <StepCard
            n={3}
            title="Positions"
            body={`See debt and collateral in every market. Repay ${loan}, add ${collateral}, or withdraw only the ${collateral} that is not backing the loan.`}
            hint="/positions"
          />
        </div>
        <Note title="Testnet only">
          <p>
            This app is on {CHAIN.name}, chain <code className="code-inline">{CHAIN.id}</code>.
            {` ${loan} and ${collateral} here are testnet assets. The contracts are unaudited. Do not point a wallet holding mainnet funds at these addresses. Mainnet ${loan} is a different token.`}
          </p>
        </Note>
      </Section>

      <Section
        title="Connect and fund"
        subtitle={`${collateral} pays gas and is the collateral. The faucet does not mint ${loan}.`}
      >
        <ol className="space-y-3 text-body-sm text-slate-300 leading-relaxed list-decimal pl-5">
          <li>Connect a wallet and switch it to {CHAIN.name} when the header asks.</li>
          <li>
            If the wallet has no {collateral} for gas, drip it from the{" "}
            <a href={MEZO_FAUCET_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
              Mezo faucet <IconExternal className="w-3.5 h-3.5" />
            </a>
            . The same balance is what you will post as collateral.
          </li>
          <li>
            You do not need {loan} to borrow. Lenders do. {loan} is minted by borrowing on{" "}
            <a href={MEZO_APP_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
              the Mezo testnet app <IconExternal className="w-3.5 h-3.5" />
            </a>
            , or received when someone fills your supply offer.
          </li>
        </ol>
      </Section>

      <Section
        title="See which market will lend to you"
        subtitle="The score is Ethos's. Covenant only reads it."
      >
        <div className="card overflow-hidden">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">Market</th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">Score</th>
                <th className="text-right font-semibold text-micro uppercase text-muted px-5 py-3">Max LTV</th>
              </tr>
            </thead>
            <tbody>
              {ETHOS_TIERS.map((tier) => (
                <tr key={tier.name} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 text-slate-100">{tier.name}</td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                    {tier.minimum === 0 ? "any" : `≥ ${tier.minimum.toLocaleString()}`}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate-100">{tier.ltv}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-sm text-muted leading-relaxed max-w-prose">
          A wallet with no Ethos profile borrows on Open. To raise the score, link the same
          address on{" "}
          <a href={ETHOS_SETTINGS_URL} target="_blank" rel="noreferrer" className="link">
            Ethos
          </a>
          . Borrowing a higher market before that score exists is refused. The app will not
          quietly open the loan on a different tier.
        </p>
      </Section>

      <Section
        title="Borrow"
        subtitle={`From Borrow or from your market. The amount you confirm is the amount you owe, repaid 1:1 in ${loan}, until ${maturity}.`}
      >
        <div className="grid md:grid-cols-3 gap-5">
          <StepCard
            n={1}
            title="Authorize the score"
            body="The credit service signs your current score for this wallet and this chain. You submit that signature to the market's gate. The signature lasts six hours. The browser keeps the last one, so a later outage does not erase it. The first signature still needs the service."
            hint="EthosTierGate.authorize"
          />
          <StepCard
            n={2}
            title={`Post ${collateral}`}
            body={`Enter the ${loan} amount first. The form suggests a ${collateral} deposit that leaves a 1.5 health factor and shows the minimum beside it. Approve Covenant, then deposit. A small ${collateral} reserve stays in the wallet for gas.`}
            hint="Covenant.supplyCollateral"
          />
          <StepCard
            n={3}
            title={`Borrow ${loan}`}
            body={`Confirm the fill. Covenant pulls ${loan} from a lender — a posted offer if one is large enough, otherwise the house lender — and sends it to you. Debt increases by that same amount.`}
            hint="Covenant.fillOffer"
            emphasized
          />
        </div>
        <Note title="What the market page is showing">
          <p>
            Liquidity is {loan} the house wallet can still lend, plus offers other wallets have
            posted on that market. The house balance is shared across the three markets: a fill
            on one reduces what the others can draw. Your debt, posted {collateral}, and health
            factor on the page are for that market only.
          </p>
        </Note>
      </Section>

      <Section
        title="Supply MUSD"
        subtitle="Lending is an offer, not a pool deposit. You can take it back until a borrower fills it."
      >
        <ol className="space-y-3 text-body-sm text-slate-300 leading-relaxed list-decimal pl-5">
          <li>Open the market you want to lend on. Supply is allowed on every tier, not only yours.</li>
          <li>Approve {loan} to Covenant, then authorize the offer notary. Both are one-time for this deployment.</li>
          <li>Enter the amount and choose Supply. The wallet signs a par offer that expires in one hour.</li>
          <li>
            Withdraw your offer from the same card if it has not been filled. Unfilled {loan} never left the wallet;
            Covenant pulls it only when a borrower takes the offer.
          </li>
        </ol>
        <p className="text-body-sm text-muted leading-relaxed max-w-prose">
          This deployment only accepts par offers. A borrower repays one {loan} per unit of debt,
          so the lender is not paid a rate. The offer is filled ahead of the house book when it
          covers the size the borrower requested.
        </p>
      </Section>

      <Section
        title="Repay, add collateral, withdraw"
        subtitle="Positions lists every market you have touched. A stale score cannot block an exit."
      >
        <ul className="space-y-3 text-body-sm text-slate-300 leading-relaxed list-disc pl-5 max-w-prose">
          <li>
            <span className="text-slate-100">Repay</span> pulls {loan} from your wallet and reduces debt
            one-for-one. The first repayment asks for an approval.
          </li>
          <li>
            <span className="text-slate-100">Add collateral</span> posts more {collateral} on that market
            and raises the health factor. It does not borrow.
          </li>
          <li>
            <span className="text-slate-100">Withdraw</span> sends back {collateral} that can leave while
            the loan stays above its liquidation threshold. Max is the most that can leave; the form warns
            when the result would sit close to liquidation.
          </li>
          <li>
            Every action shows the health factor before and after, so you see the effect before you sign.
          </li>
          <li>
            <span className="text-slate-100">Repay all and withdraw collateral</span> repays the full debt,
            then withdraws the remaining {collateral}.
          </li>
          <li>
            Health factor is borrowing capacity at the market's LLTV divided by debt. Below 1.00 the
            loan can be liquidated. The liquidation price is the {collateral} price at which that happens.
            The summary at the top covers all three markets, not only the tier your score opens.
          </li>
        </ul>
      </Section>

      <Section
        title="If something fails"
        subtitle="Read the wallet error once. Resubmitting the same prompt does not change the gate or the oracle."
      >
        <div className="card overflow-x-auto">
          <table className="w-full text-body-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">What you see</th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">Why</th>
                <th className="text-left font-semibold text-micro uppercase text-muted px-5 py-3">What to do</th>
              </tr>
            </thead>
            <tbody>
              {TROUBLESHOOTING.map((row) => (
                <tr key={row.issue} className="border-b border-line last:border-0 align-top">
                  <td className="px-5 py-3.5 text-slate-100">{row.issue}</td>
                  <td className="px-5 py-3.5 text-slate-300">{row.cause}</td>
                  <td className="px-5 py-3.5 text-slate-300">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-body-sm text-muted">
          Contract addresses for this deployment are on the{" "}
          <Link to="/docs/reference" className="link">reference</Link> page and on{" "}
          <a href={EXPLORER} target="_blank" rel="noreferrer" className="link">
            {EXPLORER.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </Section>

      <div className="card p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-brand-500/25">
        <div className="max-w-xl">
          <div className="section-label text-brand-300">Ready to borrow</div>
          <div className="mt-2 text-h3 text-slate-50">Open your market and post {collateral}.</div>
          <p className="mt-2 text-body-sm text-muted leading-relaxed">
            The Borrow page shows how much {loan} the {collateral} you have already posted can support.
            Markets shows the three books. Positions is where a loan is repaid.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 flex-shrink-0">
          <Link to="/faucet" className="btn-secondary">Get {collateral}</Link>
          <Link to="/markets" className="btn-primary">
            Markets <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </DocPage>
  );
}

const TROUBLESHOOTING = [
  {
    issue: "Switch network",
    cause: `The wallet is not on ${CHAIN.name}.`,
    action: "Use the switch button and approve chain 31611.",
  },
  {
    issue: `Not enough ${collateral}`,
    cause: "Gas and collateral come from the same balance.",
    action: "Drip BTC from the Mezo faucet, then retry.",
  },
  {
    issue: "Needs score …",
    cause: "That market's gate is above your Ethos score.",
    action: "Borrow on the market marked as yours, or raise the score on Ethos.",
  },
  {
    issue: "Credit service unavailable",
    cause: "The first score signature is signed off-chain.",
    action: "Retry. If you already authorized this wallet in the last six hours, submit the saved signature.",
  },
  {
    issue: "Borrow reverts as unhealthy",
    cause: "Posted collateral cannot cover the amount at this market's LTV, or the oracle is stale.",
    action: "Post more BTC or borrow less. Wait if the BTC price feed is older than six hours.",
  },
  {
    issue: "Withdraw does nothing",
    cause: "The remaining BTC is what keeps the loan inside its LTV.",
    action: "Repay part of the debt, or close the loan, then withdraw.",
  },
  {
    issue: "Supply was rejected",
    cause: "The offer is not par, the notary is not authorized, or the wallet cannot cover the size.",
    action: "Approve MUSD, authorize the notary, and post a size your balance can pay.",
  },
];
