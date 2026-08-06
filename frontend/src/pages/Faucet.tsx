import { Link } from "react-router-dom";
import { FaucetPanel } from "../components/Faucet";
import { IconArrowRight } from "../components/icons";

/**
 * Standalone faucet page. The same `FaucetPanel` also renders as a tab inside the
 * market-detail action panel, so a user who discovers they are short on tokens
 * mid-flow does not have to navigate away — and neither copy can drift.
 */
export function Faucet() {
  return (
    <section className="shell py-12 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <span className="text-micro font-semibold uppercase text-muted">Testnet</span>
        <h1 className="text-h1 text-slate-50">Token faucet</h1>
        <p className="text-body text-muted">
          Mint the two demo ERC20s that back every market on this deployment. Both are test
          tokens on Monad testnet with no value — mint as much as you need to exercise the
          lend, borrow, and repay flows.
        </p>
      </header>

      <FaucetPanel />

      <div className="card">
        <div className="card-body space-y-3">
          <p className="text-body-sm text-muted">
            Minting is permissionless and needs no A-Pass. Opening a position does — markets
            are compliance-gated, so a wallet holding tokens still cannot lend or borrow until
            its credential is valid.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link to="/compliance" className="link inline-flex items-center gap-1.5 text-body-sm">
              Check compliance status
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to="/markets" className="link inline-flex items-center gap-1.5 text-body-sm">
              Browse markets
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
