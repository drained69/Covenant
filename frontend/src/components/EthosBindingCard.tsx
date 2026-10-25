import { useState } from "react";
import { ETHOS_SETTINGS_URL } from "../config/ethos";
import { IconExternal } from "./icons";

/**
 * The guided wallet-linking path for X-native users.
 *
 * Why there is no "connect X" button anywhere in Covenant: the on-chain tier
 * gates authorize WALLET-bound scores (the service signs wallet + score as
 * one authorization), so a handle-imported score would let any wallet claim
 * any handle's reputation. The X↔Ethos binding happens on Ethos's side —
 * users sign in there with X, and their profile lists the wallet addresses
 * the score applies to. Covenant's job is to send the user to that binding
 * with the exact address to paste, and to make the mechanism legible.
 */
export function EthosBindingCard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard unavailable — the full address stays selectable below. */
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="section-label text-brand-300">Reputation onboarding</div>
          <div className="card-title mt-1">Bring your X reputation on-chain</div>
          <div className="text-body-sm text-subtle mt-0.5">
            Scores are built on X, bound on Ethos, read here by wallet
          </div>
        </div>
        <span className="badge-neutral">Ethos</span>
      </div>
      <div className="card-body">
        <p className="text-body-sm text-slate-300 leading-relaxed max-w-3xl">
          Ethos credibility is built from reviews on X — but Covenant never reads your X
          account. It reads the score bound to <span className="text-slate-100">this
          wallet</span> on your Ethos profile. If your reputation isn't showing here, the
          two aren't linked yet; connect them and your tier upgrades automatically on the
          next visit.
        </p>

        <div className="mt-5 grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line rounded-lg border border-line">
          {[
            {
              n: "01",
              title: "Sign in on Ethos",
              text: "Your X account is the login at app.ethos.network — your score already lives there.",
            },
            {
              n: "02",
              title: "Add this wallet",
              text: "Paste the address below into your Ethos profile's wallet list.",
            },
            {
              n: "03",
              title: "Reconnect & borrow",
              text: "Score, tier, and borrowing terms update automatically — nothing to re-apply.",
            },
          ].map((step) => (
            <div key={step.n} className="p-4">
              <span className="font-mono text-micro text-brand-300">{step.n}</span>
              <div className="mt-1.5 text-body-sm font-semibold text-slate-50">{step.title}</div>
              <p className="mt-1 text-body-sm text-subtle leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[220px] rounded-lg border border-line bg-ink-900/60 px-3 py-2 font-mono text-body-sm text-slate-200 break-all select-all">
            {address}
          </div>
          <button className="btn-secondary btn-sm" onClick={copyAddress}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <a
            href={ETHOS_SETTINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm"
          >
            Open Ethos settings
            <IconExternal className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className="mt-4 text-micro text-subtle leading-relaxed">
          Wallets with no Ethos profile borrow at the conservative Open tier. Missing data
          never blocks borrowing at that tier, repaying, or withdrawing collateral.
        </p>
      </div>
    </div>
  );
}
