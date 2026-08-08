import { useParams, Link } from "react-router-dom";
import { MARKETS, EXPLORER, ADDRESSES } from "../config/chain";
import { useMarket, useMarketTokens } from "../hooks/useMarket";
import { MarketVitals } from "../components/MarketVitals";
import { PositionCard } from "../components/PositionCard";
import { ActionPanel } from "../components/ActionPanel";
import { OfferBook } from "../components/OfferBook";
import { IconArrowLeft, IconExternal, IconLayers } from "../components/icons";

export function MarketDetail() {
  // Route is declared as `/markets/:marketId` in App.tsx — the param name must match.
  const { marketId } = useParams<{ marketId: string }>();
  const match = MARKETS.find((m) => m.id === marketId);
  // Hooks must run unconditionally, so resolve to a market for the hook call and
  // decide what to render afterwards.
  const market = match ?? MARKETS[0];
  const { collateral, loan } = useMarketTokens(market.id);
  // Free: `useMarket` is cached for the session (`IMMUTABLE_QUERY`) and
  // `useMarketTokens` already reads it, so this shares that one response.
  const { data, isLoading } = useMarket(market.id);

  // Previously `?? MARKETS[0]` was the whole story: an unknown or stale market id
  // silently rendered a *different* market under the requested URL, with its real
  // vitals and a working action panel. On a page where the user is about to sign
  // for collateral, quietly substituting the subject is the worst kind of wrong.
  if (!match) {
    return (
      <section className="shell py-12">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconLayers className="w-5 h-5" />
            </div>
            <div className="empty-state-title">Market not found</div>
            <p className="empty-state-body">
              No market on this network matches that id. It may have been created on a different
              deployment.
            </p>
            <Link to="/markets" className="btn-secondary btn-sm mt-2">
              <IconArrowLeft className="w-3.5 h-3.5" />
              All markets
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // The configured `name` packs pair, tenor, and attribute into one string
  // ("tWBTC / tUSDC · 90-day · compliance-gated"). MarketCard and Positions both
  // split it; printing the packed form here made the breadcrumb the one place
  // that named the market differently from everywhere else — and it ran long
  // enough to wrap on narrow screens.
  const [pair, ...rest] = market.name.split("·").map((s) => s.trim());

  return (
    <section className="shell py-8 space-y-6">
      {/* Was `← All markets` — the arrow was a literal character set in the body
          font, so it rendered at a different weight, size, and baseline than the
          stroked icons used for exactly this gesture elsewhere in the app. */}
      <nav className="flex items-center gap-2.5 text-body-sm min-w-0" aria-label="Breadcrumb">
        <Link to="/markets" className="link inline-flex items-center gap-1.5 group flex-shrink-0">
          <IconArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
          All markets
        </Link>
        <span className="text-subtle" aria-hidden="true">
          /
        </span>
        <span className="text-slate-100 font-semibold truncate">{pair}</span>
        {rest.length > 0 && (
          <span className="text-subtle truncate hidden sm:inline">{rest.join(" · ")}</span>
        )}
      </nav>

      <MarketVitals market={market} />
      <PositionCard market={market} />
      <OfferBook />
      <ActionPanel market={market} />

      <div className="card">
        <div className="card-header">
          <div className="card-title">Addresses</div>
          <span className="text-micro font-semibold uppercase text-muted">Verify on explorer</span>
        </div>
        {/* `gap-4` here against `gap-x-6 gap-y-5` in every other two-column card
            body left this grid visibly tighter than its neighbours on the same
            page. The `font-mono` on the wrapper also leaked into the labels, so
            "Compliance gate" was set in mono while every other stat label on the
            site is sans. */}
        <div className="card-body grid sm:grid-cols-2 gap-x-6 gap-y-5">
          <AddrRow label="Covenant core" addr={ADDRESSES.covenant} />
          <AddrRow label="Price oracle" addr={ADDRESSES.oracle} />
          {/*
            These two were hardcoded to `ADDRESSES.usdc` / `ADDRESSES.wbtc` with
            the symbol baked into the label — a list of the deployment's tokens
            presented as if it were this market's configuration. They now come
            from the market struct, so the addresses shown are the ones the
            market will actually pull from and push to.
          */}
          <AddrRow label={`Collateral token (${collateral.symbol})`} addr={collateral.address} />
          <AddrRow label={`Loan token (${loan.symbol})`} addr={loan.address} />
          {/*
            Two gates, both from the struct. This row was a single "Compliance
            gate" pointing at `ADDRESSES.gate` — the deployment's gate, not this
            market's, and only one of the two the market actually carries. A
            market can name a different `entryGate` and `seizureGate`, or leave
            either unset, and the page verifying addresses against a second
            source was the last place that should have been guessing.
          */}
          <AddrRow label="Entry gate" addr={data?.entryGate} loading={isLoading} />
          <AddrRow label="Seizure gate" addr={data?.seizureGate} loading={isLoading} />
          <AddrRow label="Market id" addr={market.id} isMarket />
        </div>
      </div>
    </section>
  );
}

function AddrRow({ label, addr, isMarket }: { label: string; addr: string; isMarket?: boolean }) {
  const href = isMarket
    ? `${EXPLORER}/address/${ADDRESSES.covenant}#readContract`
    : `${EXPLORER}/address/${addr}`;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="stat-label">{label}</span>
      {/*
        Was `link break-all`. `break-all` breaks after *any* character, so a hex
        string could split mid-byte — "0xA3f...9c" wrapping between the `9` and
        the `c` — which is exactly the kind of address a person is supposed to be
        eyeballing against a second source. It also produced ragged 2-3 line
        blocks of unequal height, so the six rows never lined up.

        These fit on one line at every breakpoint the grid uses, so they're kept
        on one line and truncated in the pathological case, with the full value
        available on hover and to assistive tech.
      */}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={addr}
        className="link inline-flex items-center gap-1.5 text-body-sm font-mono tabular-nums min-w-0 group"
      >
        <span className="truncate">{addr}</span>
        <IconExternal className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
      </a>
    </div>
  );
}
