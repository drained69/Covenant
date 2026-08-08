import type { ComponentType, SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Brand } from "./Brand";
import { WalletBalancesMenu } from "./WalletBalances";
import { IconMarkets, IconPositions, IconShield, IconDocument, IconCoins, IconLayers } from "./icons";

/*
  Nav is split into two groups rather than one flat row of six.

  The working set — Markets, My positions, Credit ladder — is what a user moves
  between while actually transacting: browse a market, check what you hold,
  compare the curve across maturities. Those three carry the traffic and sit
  left, immediately after the wordmark, in descending frequency.

  Compliance, Faucet, and Docs are visited once or on an exception: Compliance
  when a transaction fails the gate, Faucet once to fund a testnet wallet, Docs
  while learning the protocol. Presenting them at equal weight to Markets made
  the bar read as six peers and cost the primary destinations their prominence.
  They move to a right-aligned utility cluster next to the wallet — reachable in
  one click, but no longer competing.

  Docs points at `/docs`, the section index, rather than at a single page. Its
  `isActive` check is a prefix match, so the tab stays lit on every page inside
  the section while the docs sidebar handles navigation within it.
*/
const PRIMARY_NAV = [
  { to: "/markets",   label: "Markets",       Icon: IconMarkets },
  { to: "/positions", label: "My positions",  Icon: IconPositions },
  { to: "/ladder",    label: "Credit ladder", Icon: IconLayers },
];

const UTILITY_NAV = [
  { to: "/compliance",   label: "Compliance", Icon: IconShield },
  { to: "/faucet",       label: "Faucet",     Icon: IconCoins },
  { to: "/docs",         label: "Docs",       Icon: IconDocument },
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

        {/* `flex-1` on the primary nav is what pushes the utility cluster and
            ConnectButton right — the previous extra spacer div was competing
            with it for the same free space. */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-1 flex-1 min-w-0"
        >
          {PRIMARY_NAV.map((item) => (
            <NavTab key={item.to} {...item} active={isActive(item.to)} />
          ))}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Utility group. One flex child rather than four so it adds a single
            `gap-6` to the bar instead of three — at the `md` breakpoint the
            header is already near capacity. Labels collapse to icons below
            `lg`, where the six full labels plus the wallet cluster no longer
            fit; the accessible name survives on the `title`/`aria-label`. */}
        <nav aria-label="Reference" className="hidden md:flex items-center gap-1">
          {/*
            A LEADING rule, not just a trailing one. Between `md` and `lg` these
            three tabs collapse to bare icons, and an icon carrying no label of
            its own binds by proximity to the nearest text — which sits to its
            left, in the last primary tab. That is why the shield read as an
            icon belonging to "Credit ladder" instead of as Compliance's own
            tab. The cluster has to be bounded on BOTH sides to read as a group;
            the mobile strip below already does this and reads correctly.
          */}
          <div className="w-px h-6 bg-line mr-2 flex-shrink-0" aria-hidden="true" />
          {UTILITY_NAV.map((item) => (
            <NavTab key={item.to} {...item} active={isActive(item.to)} compact />
          ))}
          <div className="w-px h-6 bg-line ml-2 flex-shrink-0" aria-hidden="true" />
        </nav>

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
          without a hamburger menu's extra state.

          The same priority order applies here, and it matters more: horizontal
          scroll means anything past the third tab is off-screen at rest. The
          three primary destinations occupy that visible region, and a hairline
          divider marks where the utility group begins so the strip reads as two
          groups rather than one undifferentiated run. */}
      <nav
        aria-label="Primary"
        className="md:hidden flex items-center gap-1 overflow-x-auto no-scrollbar px-4 pb-2 -mt-1"
      >
        {PRIMARY_NAV.map((item) => (
          <NavTab key={item.to} {...item} active={isActive(item.to)} />
        ))}

        <div className="w-px h-5 bg-line mx-1.5 flex-shrink-0" aria-hidden="true" />

        {UTILITY_NAV.map((item) => (
          <NavTab key={item.to} {...item} active={isActive(item.to)} />
        ))}
      </nav>
    </header>
  );
}

/* ── nav primitives ─────────────────────────────────────────────────── */

/*
  `compact` collapses the tab to its icon below `lg`. The label stays in the DOM
  as an `lg:inline` span rather than being swapped for an icon-only variant, so
  there is one element and one active state to reason about. `title` plus
  `aria-label` carry the name when the text is hidden — an icon-only link with
  no accessible name is unusable with a screen reader and ambiguous with one.
*/
function NavTab({
  to,
  label,
  Icon,
  active,
  compact = false,
}: {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={active ? "nav-tab-active" : "nav-tab"}
    >
      <Icon className="nav-tab-icon" />
      <span className={compact ? "hidden lg:inline" : undefined}>{label}</span>
    </Link>
  );
}
