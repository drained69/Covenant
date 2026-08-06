import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Brand } from "./Brand";
import { WalletBalancesMenu } from "./WalletBalances";
import { IconMarkets, IconPositions, IconShield, IconInfo, IconCoins } from "./icons";

const NAV = [
  { to: "/markets",     label: "Markets",       Icon: IconMarkets },
  { to: "/positions",   label: "My positions",  Icon: IconPositions },
  { to: "/faucet",      label: "Faucet",        Icon: IconCoins },
  { to: "/compliance",  label: "Compliance",    Icon: IconShield },
  { to: "/how-it-works",label: "How it works",  Icon: IconInfo },
];

export function Header() {
  const { pathname } = useLocation();
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    /*
      The header no longer uses `backdrop-blur-xl`. A blurred chrome is the iOS
      Safari paradigm exported to web dashboards, and it is the second-clearest
      "this is a crypto app" tell after the blueprint grid. Stripe, Modern
      Treasury, Linear, and Vercel all use an opaque sticky bar with a rule
      below it — no glass, no acrylic, no diffusion. The fill deepens from
      `ink-950/85` to `ink-950` and the blur is gone.
    */
    <header className="sticky top-0 z-40 bg-ink-950 border-b border-line">
      <div className="shell h-16 flex items-center gap-6">
        <Link to="/" className="text-slate-100 hover:opacity-80 transition-opacity flex-shrink-0">
          <Brand />
        </Link>

        <div className="hidden md:block w-px h-6 bg-line flex-shrink-0" />

        {/* `flex-1` on the nav is what pushes ConnectButton right — the previous
            extra spacer div was competing with it for the same free space. */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {NAV.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              aria-current={isActive(to) ? "page" : undefined}
              className={isActive(to) ? "nav-tab-active" : "nav-tab"}
            >
              <Icon className="nav-tab-icon" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Balances sit left of the connect button so the wallet identity stays
            the rightmost element — the position users reach for to disconnect
            or switch chains. Hidden below `sm` where the header is already at
            capacity; the positions page carries the same data in a full card. */}
        <div className="hidden sm:block">
          <WalletBalancesMenu />
        </div>

        <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
      </div>

      {/* Mobile navigation. Previously the entire nav was `hidden md:flex`, so
          on a phone the app had a logo, a connect button, and no way to move
          between sections. A horizontally-scrolling tab strip is the standard
          fintech answer — it keeps every destination reachable in one tap
          without a hamburger menu's extra state. */}
      <nav className="md:hidden flex items-center gap-1 overflow-x-auto no-scrollbar px-4 pb-2 -mt-1">
        {NAV.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            aria-current={isActive(to) ? "page" : undefined}
            className={isActive(to) ? "nav-tab-active" : "nav-tab"}
          >
            <Icon className="nav-tab-icon" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
