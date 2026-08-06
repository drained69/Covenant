import { useAccount } from "wagmi";
import { Link } from "react-router-dom";
import { MARKETS } from "../config/chain";
import { PositionCard } from "../components/PositionCard";
import { IconWallet, IconArrowRight } from "../components/icons";

export function Positions() {
  const { isConnected } = useAccount();

  return (
    <section className="shell py-12 space-y-8">
      {/* The page had a bare `<h2>` and nothing else. Every other surface in the
          app explains itself in a line under the title; this one dropped the
          reader straight into a wall of market cards. */}
      <header>
        <h1 className="text-h2 text-slate-50">Your positions</h1>
        <p className="mt-1.5 text-body-sm text-muted">
          Credit, debt, and collateral across every Covenant market.
        </p>
      </header>

      {!isConnected && (
        <div className="card">
          <div className="empty-state">
            {/* Was the literal character ◇ set in the body font. A text glyph in
                an icon slot inherits the text font's weight, baseline, and
                optical sizing, so it sat visibly off-centre and at a different
                stroke weight than every real icon around it. */}
            <div className="empty-state-icon">
              <IconWallet className="w-5 h-5" />
            </div>
            <div className="empty-state-title">No wallet connected</div>
            <p className="empty-state-body">
              Connect a wallet to see your credit, debt, and collateral across every market.
            </p>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="space-y-8">
          <div className="space-y-4">
            {/* Labels the market rows as a group so the list reads as a
                deliberate section rather than a bare stack under the title. */}
            <h2 className="text-micro font-semibold uppercase text-muted">By market</h2>

            {MARKETS.map((m) => {
              // The heading printed the full configured `name`, which packs pair,
              // tenor, and attribute into one string ("tWBTC / tUSDC · 90-day ·
              // compliance-gated"). MarketCard already splits this; the same split
              // here keeps the two views naming the same market the same way.
              const [pair, ...rest] = m.name.split("·").map((s) => s.trim());

              return (
                <div key={m.id} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                      <span className="text-body font-semibold text-slate-100 truncate">
                        {pair}
                      </span>
                      {rest.length > 0 && (
                        <span className="text-body-sm text-subtle truncate hidden sm:inline">
                          {rest.join(" · ")}
                        </span>
                      )}
                    </div>
                    {/* Was `Open →` — a raw arrow character in the text font,
                        which renders at a different weight and baseline than the
                        stroked icons used for the same gesture elsewhere. */}
                    <Link
                      to={`/markets/${m.id}`}
                      className="link text-body-sm inline-flex items-center gap-1.5 flex-shrink-0 group"
                    >
                      Open
                      <IconArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                  <PositionCard market={m} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
