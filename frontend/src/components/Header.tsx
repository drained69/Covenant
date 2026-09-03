import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Brand } from "./Brand";
import { WalletBalancesMenu } from "./WalletBalances";
import { useDreamDexQuoteBalance } from "../hooks/useDreamDex";
import { EthosMark, IconMenu, IconX } from "./icons";
import { useEthosCredit } from "../hooks/useEthosScore";

/*
  Product chrome in the Sotto idiom — an editorial masthead, not a toolbar.

  Bar shape, one line, three tracks (1fr · auto · 1fr):
    [Brand]        [Overview Markets Credit Positions Docs]        [Ethos · Token · Wallet]

  The brand anchors the left track with room to breathe; the nav is CENTRED
  (the specific Sotto geometry — the tab set floats equidistant from both
  edges at every viewport width, which reads as a masthead rather than an
  app toolbar); the right track carries the trader's three live facts in
  reading order: who vouches for me (Ethos), what can I spend (TestUSDC),
  and which wallet am I (address). Each is a compact bordered instrument,
  not a pill — Sotto's discipline is rectangles with hairlines.

  The active tab is a 2px ink underline flush with the bar's bottom rule
  (Sotto's nav signal). No filled chips, no pills.

  Mobile is not a scaled-down desktop:
    Bar   → [Brand]                                [Wallet] [☰]
    Sheet → full-height panel from the right with the five tabs, the Ethos
            surface, and the wallet trigger — every action reachable in one
            tap, every hit target ≥44px.
*/

const PRIMARY_NAV = [
  { to: "/", label: "Overview" },
  { to: "/markets", label: "Markets" },
  { to: "/credit", label: "Credit" },
  { to: "/positions", label: "Positions" },
  { to: "/docs", label: "Docs" },
] as const;

export function Header() {
  const { pathname } = useLocation();
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
  const [menuOpen, setMenuOpen] = useState(false);

  // Route change closes the mobile sheet — the pattern every user expects and
  // the only reliable "did I tap a link inside the panel?" signal here.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Lock the body scroll while the sheet is open. Without this, a tap on the
  // panel's own scrollable content bubbles up to the page beneath.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // Escape closes the sheet — keyboard parity with the ✕ button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-ink-950/90 backdrop-blur-md border-b border-line">
      {/* Three-track grid. Mobile collapses the centre track (nav hidden)
          leaving brand left / cluster right on the outer tracks. */}
      <div
        className="shell grid items-center h-16 gap-3
                   grid-cols-[auto_minmax(0,1fr)_auto]
                   md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        {/* ── LEFT: brand — the visual anchor, with breathing room ─────── */}
        <Link
          to="/"
          aria-label="Covenant home"
          className="justify-self-start text-slate-100 hover:opacity-80 transition-opacity flex-shrink-0"
        >
          <Brand />
        </Link>

        {/* ── CENTER: primary nav — centred, underline-active ──────────── */}
        <nav aria-label="Primary" className="hidden md:flex items-center justify-self-center">
          {PRIMARY_NAV.map((item) => (
            <NavTab key={item.to} {...item} active={isActive(item.to)} />
          ))}
        </nav>

        {/* ── RIGHT: Ethos → token → wallet, flush right ───────────────── */}
        <div className="justify-self-end flex items-center gap-2 flex-shrink-0">
          <EthosStatus />
          <TokenStatus />
          <WalletsButton />
          <MobileMenuButton open={menuOpen} onToggle={() => setMenuOpen((v) => !v)} />
        </div>
      </div>

      <MobileSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isActive={isActive}
      />
    </header>
  );
}

/* ── nav primitives ─────────────────────────────────────────────────── */

/**
 * A primary tab in the editorial idiom.
 *
 * Active is a 2px ink underline flush with the bar's bottom rule plus full
 * ink text — the Sotto signal. Inactive tabs are muted and weight-regular;
 * hover darkens toward ink without borrowing the underline.
 */
function NavTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 h-16 inline-flex items-center text-body-sm select-none
                   transition-colors duration-150
                   after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px]
                   after:transition-colors ${
                     active
                       ? "font-semibold text-slate-50 after:bg-slate-50"
                       : "font-medium text-muted hover:text-slate-100"
                   }`}
    >
      {label}
    </Link>
  );
}

/* ── right-cluster instruments ─────────────────────────────────────── */

/**
 * The reputation instrument — the Ethos-attributed credibility figure.
 *
 * One compact line: [Ethos mark] 1,305 · Open. The circular Ethos mark
 * attributes the number where it belongs — Ethos computes it, Covenant
 * consumes it — so the figure cannot be misread as "Covenant scored me".
 * The tier name beside the score lets the masthead answer "what terms am I
 * on" without a page visit. Links to the full credit breakdown.
 *
 * Hidden until connected: an unfilled identity slot for a disconnected
 * wallet is chrome that lies. On mobile it lives in the sheet.
 */
function EthosStatus() {
  const { isConnected } = useAccount();
  const { data, isLoading, tier } = useEthosCredit();
  if (!isConnected) return null;

  const score = data?.score;

  return (
    <Link
      to="/credit"
      title="Your Ethos credibility · click for the credit tier breakdown"
      className="hidden lg:inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-md
                  border border-line hover:border-line-strong hover:bg-ink-900
                  transition-colors duration-150"
    >
      <EthosMark className="w-4 h-4 text-ethos-600 flex-shrink-0" />
      <span className="font-mono text-body-sm text-slate-100 tabular-nums">
        {isLoading ? "…" : score !== undefined ? score.toLocaleString() : "—"}
      </span>
      <span className="text-micro text-muted whitespace-nowrap">· {tier.name}</span>
    </Link>
  );
}

/**
 * The capital instrument — spendable venue collateral, live.
 *
 * The number that gates every order size, stated in the masthead the way a
 * trading terminal states cash: figure + unit, mono, tabular. Hidden until
 * connected and below xl (the Ethos instrument takes the scarce width
 * first — reputation is Covenant's differentiating fact, the balance is
 * one tap away in the wallet menu).
 */
function TokenStatus() {
  const { isConnected } = useAccount();
  const quote = useDreamDexQuoteBalance();
  if (!isConnected) return null;

  return (
    <div
      title="Spendable DreamDEX venue collateral in your wallet"
      className="hidden xl:inline-flex items-center h-9 px-3 rounded-md border border-line"
    >
      {quote.isLoading ? (
        <span className="skeleton h-3.5 w-16" />
      ) : (
        <>
          <span className="font-mono text-body-sm text-slate-100 tabular-nums">
            {quote.formatted ?? "0"}
          </span>
          <span className="ml-1.5 text-micro text-muted whitespace-nowrap">{quote.symbol}</span>
        </>
      )}
    </div>
  );
}

/**
 * The wallet instrument.
 *
 * Disconnected → a compact bordered "Connect wallet" control that opens
 * RainbowKit (the filled brand button belongs to page content; chrome is
 * quieter).
 *
 * Connected → WalletBalancesMenu's trigger showing the shortened address
 * (its dropdown covers balances, chain state, Ethos, and disconnect).
 */
function WalletsButton() {
  const { isConnected } = useAccount();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        if (!mounted) return <div aria-hidden="true" className="h-9 w-24" />;

        if (!isConnected || !account) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="inline-flex items-center h-9 px-3 sm:px-4 rounded-md
                          bg-brand-500 text-ink-950 text-body-sm font-semibold
                          hover:bg-brand-400 transition-colors duration-150"
            >
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect wallet</span>
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="inline-flex items-center h-9 px-3 sm:px-4 rounded-md
                          bg-brand-500 text-ink-950 text-body-sm font-semibold
                          hover:bg-brand-400 transition-colors duration-150"
            >
              Switch network
            </button>
          );
        }

        if (!chain) return null;

        return <WalletBalancesMenu />;
      }}
    </ConnectButton.Custom>
  );
}

/* ── mobile menu ────────────────────────────────────────────────────── */

/**
 * The hamburger, mobile-only.
 *
 * ≥44px hit target (the Apple/WCAG floor) so a thumb tap is reliable. The
 * icon flips to ✕ when the sheet is open — the affordance to CLOSE reads
 * where the affordance to OPEN was, in exactly the same slot, so a user
 * never has to hunt for the counterpart action.
 */
function MobileMenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls="mobile-nav-sheet"
      className="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-md
                  border border-line text-slate-100 hover:bg-ink-900
                  transition-colors duration-150"
    >
      {open ? <IconX className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
    </button>
  );
}

/**
 * The mobile navigation sheet.
 *
 * A right-anchored panel — thumb reach on a phone favours the right edge, and
 * a right-anchored close ✕ ends up under the same thumb that opened it. The
 * sheet holds:
 *
 *   • The five primary tabs, at full-row hit height (56px) so the tap target
 *     is unambiguous even on the narrowest phones.
 *   • The Ethos surface — the chip is out of the bar at this width, but
 *     the reputation figure still belongs in the "who am I" surface.
 *   • The wallet trigger — a disconnected wallet gets a clear CTA here too.
 *
 * A dimmed overlay behind the panel catches taps and closes the sheet — the
 * standard iOS/Android idiom for a modal drawer.
 */
function MobileSheet({
  open,
  onClose,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  isActive: (to: string) => boolean;
}) {
  // The header uses `backdrop-blur`, which promotes it to a containing block
  // for fixed descendants. Rendered in place, the sheet's `fixed inset-0`
  // resolves against the header's 64px box — the sheet reads as a header-
  // shaped strip instead of a full-height panel. Portalling to document.body
  // takes the sheet out of the header entirely so `fixed` resolves to the
  // viewport, as intended.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={`md:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-[rgba(15,17,9,0.55)] backdrop-blur-sm"
      />

      {/* Panel */}
      <aside
        id="mobile-nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Primary navigation"
        className={`absolute top-0 right-0 h-full w-[85%] max-w-sm bg-surface-raised
                    border-l border-line shadow-2xl flex flex-col
                    transition-transform duration-200 ease-out
                    ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Panel header mirrors the top bar so the ✕ lives where ☰ was. */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-line">
          <span className="text-slate-100">
            <Brand />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex items-center justify-center h-11 w-11 rounded-md
                        border border-line text-slate-100 hover:bg-ink-900"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label="Mobile primary" className="flex-1 overflow-y-auto px-3 py-3">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item.to) ? "page" : undefined}
              className={`flex items-center h-14 px-3 rounded-md text-body font-medium
                          transition-colors duration-150 ${
                            isActive(item.to)
                              ? "text-slate-50 bg-ink-900 font-semibold"
                              : "text-slate-200 hover:bg-ink-900"
                          }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Sheet footer: identity + wallet, always visible without scrolling. */}
        <div className="border-t border-line p-4 space-y-3">
          <MobileEthosRow />
          <MobileWalletRow />
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function MobileEthosRow() {
  const { isConnected } = useAccount();
  const { data, isLoading, tier } = useEthosCredit();
  if (!isConnected) return null;
  const score = data?.score;

  return (
    <Link
      to="/credit"
      className="flex items-center gap-3 h-14 px-3 rounded-md border border-line
                  hover:bg-ink-900 transition-colors duration-150"
    >
      <span
        className="flex items-center justify-center h-9 w-9 rounded-full
                   bg-ethos-500/10 border border-ethos-500/25 flex-shrink-0"
        aria-hidden="true"
      >
        <EthosMark className="w-4 h-4 text-ethos-600" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-body-sm font-medium text-slate-100">Ethos · {tier.name}</span>
        <span className="text-micro text-muted tabular-nums">
          {isLoading
            ? "reading credibility…"
            : score !== undefined
              ? `${score.toLocaleString()} credibility`
              : "credibility unavailable"}
        </span>
      </span>
    </Link>
  );
}

function MobileWalletRow() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        if (!mounted) return null;

        if (!account) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="w-full inline-flex items-center justify-center h-12 rounded-md
                          bg-brand-500 text-ink-950 text-body-sm font-semibold
                          hover:bg-brand-400 transition-colors duration-150"
            >
              Connect wallet
            </button>
          );
        }

        if (chain?.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="w-full inline-flex items-center justify-center h-12 rounded-md
                          bg-brand-500 text-ink-950 text-body-sm font-semibold
                          hover:bg-brand-400 transition-colors duration-150"
            >
              Switch network
            </button>
          );
        }

        // When connected, the top bar already carries the balances trigger —
        // repeating it here would compete with itself. The scrim closes the
        // sheet and the bar's own WalletBalancesMenu opens the drawer.
        return null;
      }}
    </ConnectButton.Custom>
  );
}
