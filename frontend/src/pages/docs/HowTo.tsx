import { Link } from "react-router-dom";
import {
  EthosMark,
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconCoins,
  IconExternal,
  IconInfo,
  IconLayers,
  IconLock,
  IconOutcomeDown,
  IconOutcomeUp,
  IconShield,
  IconWallet,
} from "../../components/icons";
import { CHAIN, SOMNIA_FAUCET_URL } from "../../config/chain";
import { ETHOS_SETTINGS_URL } from "../../config/dreamdex";
import { DocPage, Note, Section } from "./_primitives";

/**
 * Task-oriented operating guide for the live application.
 *
 * `HowItWorks` explains the protocol. This page answers a different question:
 * what should a user click, verify, and sign to complete the full journey?
 * It stays static so it remains useful before a wallet is connected and when a
 * live dependency is unavailable.
 */
export function HowTo() {
  return (
    <DocPage
      eyebrow="User guide"
      title="How to use Covenant"
      lede={
        <>
          A complete operating guide for funding a Somnia testnet wallet, assessing a
          DreamDEX Event Contract, unlocking reputation-backed capital, placing an order,
          managing risk, and settling the position.
        </>
      }
    >
      <GuideSummary />
      <GuideIndex />

      <Section
        title="Choose your path"
        subtitle="You can trade immediately with TestUSDC already in your wallet, or complete the credit flow first and trade with collateralized borrowed capital."
      >
        <div className="grid md:grid-cols-2 gap-5">
          <PathCard
            label="Fast path"
            title="Trade with wallet funds"
            time="About 3 minutes"
            steps={["Connect on Somnia", "Drip TestUSDC", "Choose YES or NO", "Submit the order"]}
            to="#place-order"
            action="Go to trading steps"
          />
          <PathCard
            label="Full Covenant path"
            title="Trade with unlocked capital"
            time="About 8 minutes"
            steps={["Fund gas and collateral", "Check your Ethos tier", "Authorize and borrow", "Trade on DreamDEX"]}
            to="#unlock-capital"
            action="Go to capital steps"
            emphasized
          />
        </div>

        <Note title="Testnet only">
          <p>
            Covenant currently operates on {CHAIN.name}, chain <code className="code-inline">{CHAIN.id}</code>.
            STT, TestUSDC, tBTC, Event Contract outcomes, and every displayed payout are
            testnet assets with no monetary value. The contracts are unaudited.
          </p>
        </Note>
      </Section>

      <GuideStep
        id="prepare-wallet"
        number="01"
        eyebrow="Preparation"
        title="Connect the correct wallet and network"
        summary="Use one wallet throughout the journey. Reputation authorization, credit positions, Event Contract outcomes, and settlement claims are all wallet-bound."
        icon={<IconWallet className="w-5 h-5" />}
      >
        <div className="grid md:grid-cols-2 gap-5">
          <InstructionCard title="Connect">
            <ol className="space-y-3">
              <Instruction n="1" text="Select Connect wallet in the application header." />
              <Instruction n="2" text="Choose the wallet that holds, or will hold, your Ethos-linked identity." />
              <Instruction n="3" text={`Approve the switch to ${CHAIN.name} if your wallet is on another network.`} />
              <Instruction n="4" text="Confirm that the address shown in the wallet menu is the address you intend to use." />
            </ol>
          </InstructionCard>
          <VerificationCard
            title="Ready when"
            items={[
              `The wallet reports ${CHAIN.name}`,
              `The network chain ID is ${CHAIN.id}`,
              "The same address appears in Covenant and your wallet",
              "The header exposes wallet balances and your Ethos pass",
            ]}
          />
        </div>

        <Callout tone="info" title="Why one address matters">
          An Ethos score authorization commits to the borrower address, gate, chain, nonce, and
          deadline. Funds or reputation attached to another address do not automatically follow
          the connected wallet.
        </Callout>
      </GuideStep>

      <GuideStep
        id="fund-wallet"
        number="02"
        eyebrow="Testnet funding"
        title="Fund gas, trading collateral, and credit collateral"
        summary="Three assets have three distinct roles. Acquire only what your chosen path needs."
        icon={<IconCoins className="w-5 h-5" />}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Purpose</th>
                <th>Required for</th>
                <th>How to obtain it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono text-warn">STT</td>
                <td>Pays Somnia transaction gas</td>
                <td>Every approval, order, borrow, cancel, repay, and claim</td>
                <td>
                  <a href={SOMNIA_FAUCET_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1.5">
                    Somnia faucet <IconExternal className="w-3.5 h-3.5" />
                  </a>
                </td>
              </tr>
              <tr>
                <td className="font-mono text-ok">TestUSDC</td>
                <td>DreamDEX venue collateral</td>
                <td>Buying Event Contract outcomes</td>
                <td>Drip through Covenant's DreamDEX SDK faucet</td>
              </tr>
              <tr>
                <td className="font-mono text-brand-300">tBTC</td>
                <td>Covenant credit collateral</td>
                <td>Borrowing additional TestUSDC</td>
                <td>Mint through the Covenant testnet faucet</td>
              </tr>
            </tbody>
          </table>
        </div>

        <InstructionCard title="Funding sequence">
          <ol className="grid md:grid-cols-3 gap-4">
            <Instruction n="1" text="Open Missions, then obtain STT from the linked public Somnia faucet." />
            <Instruction n="2" text="Select Drip TestUSDC and confirm the DreamDEX faucet transaction." />
            <Instruction n="3" text="For the credit path, select Mint 1 tBTC and confirm the Covenant collateral transaction." />
          </ol>
          <div className="pt-4 border-t border-line flex flex-wrap gap-3">
            <Link to="/faucet" className="btn-primary">
              Open testnet funding <IconArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </InstructionCard>

        <Callout tone="warn" title="Do not substitute tokens">
          Only the configured DreamDEX TestUSDC is spendable by this venue, and only the deployed
          Covenant tBTC is recognized by the demo credit markets. A token with the same symbol at
          another address is a different asset.
        </Callout>
      </GuideStep>

      <GuideStep
        id="check-tier"
        number="03"
        eyebrow="Reputation"
        title="Review your Ethos score and credit tier"
        summary="Covenant reads your wallet's credibility from Ethos and maps it to a published tier. The score changes the collateral terms, not the solvency rules."
        icon={<EthosMark className="w-5 h-5" />}
      >
        <div className="grid md:grid-cols-[minmax(0,1fr)_280px] gap-5">
          <InstructionCard title="What to review on the Credit page">
            <ol className="space-y-3">
              <Instruction n="1" text="Confirm the displayed wallet address matches the wallet you connected." />
              <Instruction n="2" text="Review the Ethos credibility score and level attributed to that address." />
              <Instruction n="3" text="Note the active Open, Established, or Reputable tier and its maximum LTV." />
              <Instruction n="4" text="Review available TestUSDC, undrawn credit, and capital already working in positions." />
            </ol>
          </InstructionCard>
          <div className="card overflow-hidden">
            <div className="card-header">
              <div className="card-title">Tier thresholds</div>
            </div>
            <div className="divide-y divide-line">
              <TierRow name="Open" score="Below 1,600" ltv="38.5%" />
              <TierRow name="Established" score="1,600–1,999" ltv="62.5%" />
              <TierRow name="Reputable" score="2,000+" ltv="77.0%" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/credit" className="btn-primary">
            Check your live tier <IconArrowRight className="w-4 h-4" />
          </Link>
          <a href={ETHOS_SETTINGS_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            Link a wallet on Ethos <IconExternal className="w-4 h-4" />
          </a>
        </div>

        <Callout tone="info" title="If your score is unavailable">
          Missing reputation data never grants enhanced terms. The credit service falls back to a
          score of zero and the conservative Open tier. Existing repayment, redemption, and
          collateral exits remain available.
        </Callout>
      </GuideStep>

      <GuideStep
        id="choose-market"
        number="04"
        eyebrow="Market assessment"
        title="Choose and evaluate an Event Contract"
        summary="Do not select a market from its headline alone. Review the event definition, live lifecycle, reference price, liquidity, and time remaining before taking a side."
        icon={<IconLayers className="w-5 h-5" />}
      >
        <div className="grid md:grid-cols-2 gap-5">
          <InstructionCard title="Find a market">
            <ol className="space-y-3">
              <Instruction n="1" text="Open Trade to load active DreamDEX Event Contracts." />
              <Instruction n="2" text="Search by question or filter by the underlying asset." />
              <Instruction n="3" text="Sort by volume for activity or by ending time for near-term settlement." />
              <Instruction n="4" text="Open the market row to inspect the full contract and order book." />
            </ol>
          </InstructionCard>
          <VerificationCard
            title="Review before trading"
            items={[
              "The on-chain status says Trading",
              "The question and settlement condition are understood",
              "The live oracle, strike, and expiry match your view",
              "The selected outcome has sufficient bid or ask liquidity",
              "The spread and expected execution price are acceptable",
            ]}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <OutcomeMeaning
            up
            title="YES / UP"
            body="Pays one unit of venue collateral per winning contract when the displayed event resolves true."
          />
          <OutcomeMeaning
            title="NO / DOWN"
            body="Pays one unit of venue collateral per winning contract when the displayed event resolves false."
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/markets" className="btn-primary">
            Browse live markets <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </GuideStep>

      <GuideStep
        id="unlock-capital"
        number="05"
        eyebrow="Credit flow"
        title="Unlock reputation-backed trading capital"
        summary="From any market ticket, Get trading capital opens a three-stage checklist. Complete the stages in order and verify each on-chain result before proceeding."
        icon={<IconLock className="w-5 h-5" />}
        emphasized
      >
        <div className="space-y-4">
          <TransactionStep
            n="1"
            title="Authorize your score"
            action="Select Authorize score and confirm the gate transaction."
            effect="The tier gate verifies the service signature and records a short-lived authorization for your wallet."
            verify="The checklist marks the score authorization complete and shows its active tier."
          />
          <TransactionStep
            n="2"
            title="Post tBTC collateral"
            action="Review the calculated collateral amount, then select Approve & deposit. Your wallet may request an approval before the deposit."
            effect="tBTC moves into Covenant and is assigned to the immutable credit market for your tier."
            verify="The modal reports posted collateral and the maximum debt that collateral supports."
          />
          <TransactionStep
            n="3"
            title="Borrow TestUSDC"
             action="Enter the capital you need, confirm that the score is still authorized, then select Borrow. Covenant adds a rounded-up 10% volatility reserve and checks the full amount against collateral capacity before submitting."
            effect="A fresh EIP-712 lender offer is filled on-chain, creating debt and transferring DreamDEX TestUSDC to your wallet."
            verify="Your debt increases and the TestUSDC wallet balance used by the order ticket also increases."
          />
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Check before borrowing</th>
                <th>Why it matters</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Requested amount</td>
                 <td>Enter the TestUSDC needed for the intended exposure; Covenant adds a 10% volatility reserve.</td>
              </tr>
              <tr>
                <td>Required tBTC</td>
                <td>The amount follows the oracle price and your tier's LLTV.</td>
              </tr>
              <tr>
                <td>Fixed maturity</td>
                <td>Debt must be managed against the market's published maturity date.</td>
              </tr>
              <tr>
                <td>Debt capacity used</td>
                <td>Using less than the maximum leaves room for adverse collateral-price movement.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Callout tone="warn" title="Capacity is not the same as wallet balance">
          Undrawn credit can appear in total capacity, but a DreamDEX order can spend only TestUSDC
          already held by the wallet. Complete the Borrow step before sizing an order against that
          credit.
        </Callout>
      </GuideStep>

      <GuideStep
        id="place-order"
        number="06"
        eyebrow="DreamDEX execution"
        title="Build and place the order"
        summary="The ticket follows the selected outcome's executable book. Review direction, side, quantity, price, and payoff as one decision before confirming the wallet transaction."
        icon={<IconOutcomeUp className="w-5 h-5" />}
        emphasized
      >
        <div className="grid md:grid-cols-2 gap-5">
          <InstructionCard title="Order-entry sequence">
            <ol className="space-y-3">
              <Instruction n="1" text="Select YES or NO. The book switches to the selected outcome." />
              <Instruction n="2" text="Choose Buy to open or add exposure, or Sell to reduce an outcome balance you already hold." />
              <Instruction n="3" text="Enter the number of contracts or use 25%, 50%, or Max as a balance-aware shortcut." />
              <Instruction n="4" text="Review the limit price, total notional, winning payout, and potential profit." />
              <Instruction n="5" text="Select the final Buy or Sell button and inspect the wallet request before confirming." />
            </ol>
          </InstructionCard>
          <div className="card p-5 space-y-4">
            <div className="card-title">Payoff example</div>
            <p className="text-body-sm text-slate-300 leading-relaxed">
              Buying 100 YES contracts at <span className="font-mono text-slate-100">0.62</span>
              costs approximately <span className="font-mono text-slate-100">62 TestUSDC</span>.
              If YES wins, the contracts pay <span className="font-mono text-ok">100 TestUSDC</span>,
              producing <span className="font-mono text-ok">38 TestUSDC</span> of gross profit before
              gas and any protocol-level effects.
            </p>
            <dl className="divide-y divide-line border-t border-line">
              <Definition label="Notional" value="contracts × execution price" />
              <Definition label="Winning payout" value="contracts × 1 TestUSDC" />
              <Definition label="Gross upside" value="payout − notional" />
              <Definition label="Maximum buy loss" value="notional paid" />
            </dl>
          </div>
        </div>

        <Callout tone="info" title="Execution behavior">
          Prototype orders use immediate-or-cancel limit instructions. Available liquidity may fill
          all, some, or none of the requested quantity. The success notification reports the actual
          fill and links to the Somnia transaction.
        </Callout>
      </GuideStep>

      <GuideStep
        id="manage-position"
        number="07"
        eyebrow="Portfolio"
        title="Monitor the complete position"
        summary="Portfolio joins the DreamDEX outcome exposure with the credit that funded it. Review both legs instead of treating market PnL and debt health as unrelated screens."
        icon={<IconShield className="w-5 h-5" />}
      >
        <div className="grid md:grid-cols-3 gap-5">
          <MonitorCard
            label="Credit"
            items={["Outstanding TestUSDC debt", "Posted tBTC", "Debt capacity used", "Healthy or at-risk status"]}
          />
          <MonitorCard
            label="Event exposure"
            items={["YES and NO balances", "Average entry cost", "Current mark value", "Unrealized PnL"]}
          />
          <MonitorCard
            label="Activity"
            items={["Recent fills", "Any resting orders", "Explorer transactions", "Settlement and claims"]}
          />
        </div>

        <InstructionCard title="Risk-management routine">
          <ol className="grid md:grid-cols-2 gap-4">
            <Instruction n="1" text="Revisit the live oracle and time remaining as the market approaches expiry." />
            <Instruction n="2" text="Keep debt capacity usage below your personal risk limit; maximum LTV is not a target." />
            <Instruction n="3" text="Sell outcome contracts only up to the balance shown for the selected side." />
            <Instruction n="4" text="Repay debt before withdrawing collateral if the withdrawal would make the position unhealthy." />
          </ol>
          <div className="pt-4 border-t border-line">
            <Link to="/positions" className="btn-secondary">
              Open your portfolio <IconArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </InstructionCard>
      </GuideStep>

      <GuideStep
        id="settle-exit"
        number="08"
        eyebrow="Settlement and exits"
        title="Claim winnings, repay debt, and recover collateral"
        summary="DreamDEX settlement and Covenant credit settlement are separate operations. Complete each applicable leg to return assets to a fully available state."
        icon={<IconClock className="w-5 h-5" />}
      >
        <div className="grid md:grid-cols-2 gap-5">
          <InstructionCard title="Event Contract settlement">
            <ol className="space-y-3">
              <Instruction n="1" text="Wait for the market to resolve or be voided after its trading window closes." />
              <Instruction n="2" text="Open Portfolio and locate Claimable winnings." />
              <Instruction n="3" text="Claim the winning side; on a void market, claim each held side separately." />
              <Instruction n="4" text="Confirm that redeemed TestUSDC returns to the wallet balance." />
            </ol>
          </InstructionCard>
          <InstructionCard title="Credit exit">
            <ol className="space-y-3">
              <Instruction n="1" text="Review outstanding debt in the Trading credit section." />
              <Instruction n="2" text="Enter a repayment amount and approve TestUSDC if the wallet requests it." />
              <Instruction n="3" text="Submit repayment and wait for the debt figure to refresh." />
              <Instruction n="4" text="Withdraw collateral only when the interface reports it as available." />
            </ol>
          </InstructionCard>
        </div>

        <Callout tone="ok" title="Exits do not require fresh reputation">
          A lower score, expired authorization, or unavailable Ethos API can prevent new borrowing,
          but it does not block repayment, DreamDEX redemption, or a solvent collateral withdrawal.
        </Callout>
      </GuideStep>

      <Section
        title="Troubleshooting"
        subtitle="Start with the visible state and the wallet transaction rather than repeatedly resubmitting the same action."
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Message or symptom</th>
                <th>Likely cause</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {TROUBLESHOOTING.map((row) => (
                <tr key={row.issue}>
                  <td className="text-slate-100">{row.issue}</td>
                  <td>{row.cause}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Transaction safety checklist"
        subtitle="Apply these checks to every wallet prompt, even on testnet."
      >
        <div className="card p-6">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {SAFETY_CHECKS.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-ok/30 bg-ok/[0.08] text-ok">
                  <IconCheck className="w-3 h-3" />
                </span>
                <span className="text-body-sm text-slate-300 leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <div className="card p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-brand-500/25">
        <div className="max-w-xl">
          <div className="section-label text-brand-300">Ready to begin</div>
          <div className="mt-2 text-h3 text-slate-50">Fund once. Trade the complete flow.</div>
          <p className="mt-2 text-body-sm text-muted leading-relaxed">
            Start with testnet funding if this wallet is new, or go directly to live Event
            Contracts if it already holds STT and TestUSDC.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 flex-shrink-0">
          <Link to="/faucet" className="btn-secondary">Fund wallet</Link>
          <Link to="/markets" className="btn-primary">
            Browse markets <IconArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </DocPage>
  );
}

function GuideIndex() {
  const items = [
    ["01", "Connect", "#prepare-wallet"],
    ["02", "Fund", "#fund-wallet"],
    ["03", "Check tier", "#check-tier"],
    ["04", "Choose market", "#choose-market"],
    ["05", "Unlock capital", "#unlock-capital"],
    ["06", "Place order", "#place-order"],
    ["07", "Manage", "#manage-position"],
    ["08", "Settle", "#settle-exit"],
  ] as const;

  return (
    <nav
      aria-label="Guide steps"
       className="sticky top-[6.5rem] md:top-20 z-30 -mx-2 rounded-xl border border-line bg-ink-900 p-2 shadow-card backdrop-blur"
    >
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {items.map(([n, label, href]) => (
          <a
            key={href}
            href={href}
            className="group flex min-w-max items-center gap-2.5 rounded-lg px-3 py-2.5 text-body-sm transition-colors hover:bg-ink-900"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line-strong bg-ink-900 font-mono text-[10px] text-brand-300 transition-colors group-hover:border-brand-500/35 group-hover:bg-brand-500/10">
              {n}
            </span>
            <span className="font-medium text-slate-300 group-hover:text-slate-100">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function GuideStep({
  id,
  number,
  eyebrow,
  title,
  summary,
  icon,
  emphasized,
  children,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: React.ReactNode;
  emphasized?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 sm:gap-x-6">
      <span
        className="absolute left-[21px] top-11 -bottom-16 w-px bg-gradient-to-b from-line-strong via-line to-transparent"
        aria-hidden="true"
      />
      <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border shadow-card ${emphasized ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-line-strong bg-surface-solid text-slate-300"}`}>
          {icon}
      </div>
      <div className="min-w-0 max-w-2xl pt-0.5">
          <div className="flex items-center gap-2 section-label">
            <span className="font-mono text-brand-300">{number}</span>
            <span>{eyebrow}</span>
          </div>
          <h2 className="mt-1.5 text-h3 text-slate-50">{title}</h2>
          <p className="mt-2 text-body-sm text-muted leading-relaxed">{summary}</p>
      </div>
      <div className="col-start-2 mt-6 min-w-0 space-y-6">{children}</div>
    </section>
  );
}

function GuideSummary() {
  return (
    <div className="card overflow-hidden border-brand-500/20">
      <div className="grid sm:grid-cols-3 divide-y sm:divide-x sm:divide-y-0 divide-line">
        <SummaryMetric label="Network" value={CHAIN.name} note={`Chain ${CHAIN.id}`} />
        <SummaryMetric label="Complete workflow" value="8 stages" note="Wallet to settlement" />
        <SummaryMetric label="Execution venue" value="DreamDEX" note="Live Event Contracts" />
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-5 py-4">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-body font-semibold text-slate-100">{value}</div>
      <div className="mt-0.5 text-micro text-subtle">{note}</div>
    </div>
  );
}

function PathCard({ label, title, time, steps, to, action, emphasized }: { label: string; title: string; time: string; steps: string[]; to: string; action: string; emphasized?: boolean }) {
  return (
    <div className={`card p-6 flex flex-col gap-5 ${emphasized ? "border-brand-500/30" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`section-label ${emphasized ? "text-brand-300" : ""}`}>{label}</div>
          <div className="mt-1.5 card-title">{title}</div>
        </div>
        <span className="badge-neutral"><IconClock className="w-3 h-3" />{time}</span>
      </div>
      <ol className="space-y-2.5 flex-1">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-body-sm text-slate-300">
            <span className="font-mono text-micro text-subtle">{String(i + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
      <a href={to} className="link text-body-sm inline-flex items-center gap-1.5">
        {action} <IconArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

function InstructionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card p-5 space-y-4"><div className="card-title">{title}</div>{children}</div>;
}

function Instruction({ n, text }: { n: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-ink-900 font-mono text-micro text-slate-300">{n}</span>
      <span className="text-body-sm text-slate-300 leading-relaxed">{text}</span>
    </li>
  );
}

function VerificationCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card p-5 space-y-4 border-ok/20">
      <div className="card-title">{title}</div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-body-sm text-slate-300 leading-relaxed">
            <IconCheck className="mt-0.5 w-4 h-4 text-ok flex-shrink-0" />{item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Callout({ tone, title, children }: { tone: "info" | "warn" | "ok"; title: string; children: React.ReactNode }) {
  const styles = {
    info: "border-brand-500/25 text-brand-300",
    warn: "border-warn/25 text-warn",
    ok: "border-ok/25 text-ok",
  } as const;
  const Icon = tone === "warn" ? IconAlert : tone === "ok" ? IconCheck : IconInfo;
  return (
    <div className={`card p-5 flex items-start gap-4 ${styles[tone].split(" ")[0]}`}>
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles[tone].split(" ")[1]}`} />
      <div>
        <div className="text-body-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-1 text-body-sm text-slate-300 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function TierRow({ name, score, ltv }: { name: string; score: string; ltv: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center justify-between gap-4">
      <div><div className="text-body-sm font-medium text-slate-100">{name}</div><div className="text-micro text-subtle">{score}</div></div>
      <div className="text-right"><div className="font-mono text-body-sm text-slate-100">{ltv}</div><div className="text-micro text-subtle">max LTV</div></div>
    </div>
  );
}

function OutcomeMeaning({ up = false, title, body }: { up?: boolean; title: string; body: string }) {
  const Icon = up ? IconOutcomeUp : IconOutcomeDown;
  return (
    <div className={`card p-5 flex items-start gap-4 ${up ? "border-ok/20" : "border-bad/20"}`}>
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${up ? "bg-ok/[0.08] text-ok" : "bg-bad/[0.08] text-bad"}`}><Icon className="w-4 h-4" /></div>
      <div><div className="card-title">{title}</div><p className="mt-1.5 text-body-sm text-slate-300 leading-relaxed">{body}</p></div>
    </div>
  );
}

function TransactionStep({ n, title, action, effect, verify }: { n: string; title: string; action: string; effect: string; verify: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="grid md:grid-cols-[64px_minmax(0,1fr)]">
        <div className="flex md:flex-col items-center justify-center gap-2 p-4 bg-brand-500/[0.06] border-b md:border-b-0 md:border-r border-line">
          <span className="font-mono text-body-lg font-semibold text-brand-300">{n}</span>
          <span className="text-micro uppercase text-subtle">Tx</span>
        </div>
        <div className="p-5">
          <div className="card-title">{title}</div>
          <dl className="mt-3 divide-y divide-line">
            <Definition label="You do" value={action} />
            <Definition label="Protocol effect" value={effect} />
            <Definition label="Verify" value={verify} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return <div className="grid sm:grid-cols-[130px_1fr] gap-1 sm:gap-4 py-3"><dt className="text-body-sm text-subtle">{label}</dt><dd className="text-body-sm text-slate-300 leading-relaxed">{value}</dd></div>;
}

function MonitorCard({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="card p-5">
      <div className="section-label text-brand-300">{label}</div>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => <li key={item} className="flex items-center gap-2.5 text-body-sm text-slate-300"><span className="status-dot-idle" />{item}</li>)}
      </ul>
    </div>
  );
}

const TROUBLESHOOTING = [
  { issue: "Switch to Somnia", cause: "The wallet is connected to another chain.", action: `Use the switch button and approve ${CHAIN.name} in the wallet.` },
  { issue: "Insufficient STT", cause: "The wallet cannot pay transaction gas.", action: "Obtain STT from the public Somnia faucet, then retry once." },
  { issue: "Live indexer unavailable", cause: "The DreamDEX registry endpoint is temporarily unreachable.", action: "Wait for live inventory to return; Covenant does not substitute mock markets." },
  { issue: "Trading closed on-chain", cause: "The Event Contract is no longer in Trading status.", action: "Return to Markets and select a currently active contract." },
  { issue: "Notional exceeds balance", cause: "The buy costs more TestUSDC than the wallet currently holds.", action: "Borrow or drip TestUSDC, or reduce the contract quantity." },
  { issue: "Score not authorized", cause: "No valid authorization exists at the selected tier gate.", action: "Open Get trading capital and complete Authorize score again." },
  { issue: "Authorization expired", cause: "The signed score authorization or recorded access passed its deadline.", action: "Request a fresh authorization and resubmit it before borrowing." },
  { issue: "Borrow failed", cause: "Common causes are insufficient collateral, lender allowance/liquidity, or stale authorization.", action: "Read the displayed error, verify each checklist stage, and retry only after correcting it." },
  { issue: "No claim shown", cause: "The market may not be finalized yet, or the wallet holds no redeemable outcome.", action: "Confirm the connected address and wait for finalized settlement." },
] as const;

const SAFETY_CHECKS = [
  `Confirm the wallet network is ${CHAIN.name} before every write.`,
  "Match the connected address to the address whose reputation and balances you intend to use.",
  "Read the wallet's contract interaction and value before approving it.",
  "Use only token addresses displayed in Covenant or the Somnia explorer links.",
  "Treat maximum LTV as a protocol boundary, not a recommended borrowing target.",
  "Review the Event Contract question, strike, expiry, and selected outcome immediately before signing.",
  "Open the transaction link after execution if the interface state does not refresh as expected.",
  "Never use production funds or production credentials with this unaudited testnet prototype.",
] as const;
