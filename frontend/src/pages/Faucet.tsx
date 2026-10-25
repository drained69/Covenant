import { Link } from "react-router-dom";
import { FaucetPanel } from "../components/Faucet";
import { IconArrowRight } from "../components/icons";
import { CHAIN } from "../config/chain";

/** Mezo testnet funding page: BTC from the public faucet; MUSD is borrowed, not dripped. */
export function Faucet() {
  return (
    <section className="shell py-12 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <span className="text-micro font-semibold uppercase text-muted">Testnet</span>
        <h1 className="text-h1 text-slate-50">Fund your wallet</h1>
        <p className="text-body text-muted">
          {`BTC from the Mezo faucet covers gas and collateral on ${CHAIN.name}. You do not need MUSD to start: Covenant lends it against your BTC.`}
        </p>
      </header>

      <FaucetPanel />

      <div className="card">
        <div className="card-body space-y-3">
          <p className="text-body-sm text-muted">Funded? Authorize your Ethos score and borrow MUSD against BTC.</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/" className="link inline-flex items-center gap-1.5 text-body-sm">
              Borrow MUSD
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link to="/markets" className="link inline-flex items-center gap-1.5 text-body-sm">
              Compare the three markets
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
