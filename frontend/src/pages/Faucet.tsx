import { Link } from "react-router-dom";
import { FaucetPanel } from "../components/Faucet";
import { IconArrowRight } from "../components/icons";
import { CHAIN } from "../config/chain";
import { IS_MEZO } from "../config/target";

/**
 * Somnia testnet funding page: DreamDEX venue collateral (TestUSDC, dripped
 * through the official SDK) and STT gas (linked external faucet).
 */
export function Faucet() {
  return (
    <section className="shell py-12 space-y-8">
      <header className="space-y-3 max-w-2xl">
        <span className="text-micro font-semibold uppercase text-muted">Testnet</span>
        <h1 className="text-h1 text-slate-50">Fund your wallet</h1>
        <p className="text-body text-muted">
          {IS_MEZO
            ? `BTC from the Mezo faucet covers gas and collateral on ${CHAIN.name}. Borrow MUSD on the credit page — you do not need to mint it first.`
            : `Everything you need to trade Event Contracts on ${CHAIN.name}: DreamDEX test collateral from the SDK faucet, and STT for gas from the public Somnia faucet. Both are test tokens with no value.`}
        </p>
      </header>

      <FaucetPanel />

      <div className="card">
        <div className="card-body space-y-3">
          <p className="text-body-sm text-muted">
            {IS_MEZO
              ? "Funded? Open credit, authorize your Ethos score, and borrow MUSD against BTC."
              : "Funded? Pick a live Event Contract and take a side — your Ethos tier sets the credit terms you qualify for."}
          </p>
          <div className="flex flex-wrap gap-4">
            {IS_MEZO ? (
              <Link to="/" className="link inline-flex items-center gap-1.5 text-body-sm">
                Borrow MUSD
                <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link to="/markets" className="link inline-flex items-center gap-1.5 text-body-sm">
                Browse Event Contracts
                <IconArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            <Link to="/credit" className="link inline-flex items-center gap-1.5 text-body-sm">
              Check your credit tier
              <IconArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
