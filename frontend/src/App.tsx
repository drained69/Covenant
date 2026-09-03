import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { Markets } from "./pages/Markets";
import { DreamDexMarketDetail } from "./pages/DreamDexMarketDetail";
import { Positions } from "./pages/Positions";
import { Credit } from "./pages/Credit";
import { Faucet } from "./pages/Faucet";
import { DocsLayout } from "./pages/docs/DocsLayout";
import { Overview } from "./pages/docs/Overview";
import { HowItWorks } from "./pages/docs/HowItWorks";
import { HowTo } from "./pages/docs/HowTo";
import { Architecture } from "./pages/docs/Architecture";
import { CreditLadder } from "./pages/docs/CreditLadder";
import { CoreMath } from "./pages/docs/CoreMath";
import { Reference } from "./pages/docs/Reference";
import { Overview as HomeOverview } from "./pages/Overview";
import { TelegramConnect } from "./pages/TelegramConnect";
import { TelegramLink } from "./pages/TelegramLink";
import { CHAIN, EXPLORER } from "./config/chain";
import { IconExternal } from "./components/icons";

export function App() {
  /* Route transitions. The wrapper is keyed by pathname — except inside
     /docs, where every key would remount DocsLayout and re-render its sticky
     rail, losing the sidebar scroll position the layout exists to preserve.
     Docs navigation therefore swaps pages without a transition, by design;
     every other route gets one 280ms entrance that masks the data-swap. */
  const { pathname } = useLocation();
  const routeKey = pathname.startsWith("/docs") ? "docs" : pathname;

  /* Telegram opens /telegram/connect as a Mini App; /telegram/link is the
     one-time browser page its QR and button lead to. Both render focused,
     single-purpose surfaces — not the normal product chrome — so the user
     stays inside an intentional connection or verification flow. */
  if (pathname === "/telegram/connect" || pathname === "/telegram/link") {
    return (
      <Routes>
        <Route path="/telegram/connect" element={<TelegramConnect />} />
        <Route path="/telegram/link" element={<TelegramLink />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      {/*
        Skip link: the first focusable element on every page. Keyboard users
        otherwise start each navigation at the wordmark and Tab through the
        entire header — nav, utility cluster, wallet — on every route change.
        `sr-only` until focused, then a fixed brand pill above the header.
        `[id]` scroll-margin (index.css) lands #main-content below the sticky
        header rather than underneath it.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only fixed top-3 left-3 z-50 rounded-lg
                   bg-brand-400 px-4 py-2.5 text-body-sm font-semibold text-ink-950"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <div key={routeKey} className="animate-page-enter">
          <Routes>
            <Route path="/" element={<HomeOverview />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/markets/:marketId" element={<DreamDexMarketDetail />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/credit" element={<Credit />} />
            <Route path="/faucet" element={<Faucet />} />

            {/* Legacy paths from the pre-pivot app stay reachable as redirects
                so shared links and muscle memory don't 404 into the catch-all. */}
            <Route path="/ladder" element={<Navigate to="/credit" replace />} />
            <Route path="/compliance" element={<Navigate to="/docs" replace />} />

            {/*
              Docs are a layout route: `DocsLayout` renders the sidebar and the
              breadcrumb once and swaps these children through its `<Outlet />`.
              The index route is the overview, which is why it is `index` rather
              than a `/docs/overview` path — the sidebar's "Overview" entry uses
              `end` to match it exactly.

              The child paths are relative, but they must stay in sync with the
              absolute `to` values in `docsNav.ts`, which is what the sidebar and
              the index cards both render from.
            */}
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<Overview />} />
              <Route path="how-to" element={<HowTo />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="architecture" element={<Architecture />} />
              <Route path="credit-ladder" element={<CreditLadder />} />
              <Route path="math" element={<CoreMath />} />
              <Route path="reference" element={<Reference />} />
            </Route>

            {/* The walkthrough moved into the docs section. The old URL is kept
                as a redirect rather than deleted: it was in the header, the
                footer, and any link anyone has already shared. */}
            <Route path="/how-it-works" element={<Navigate to="/docs/how-it-works" replace />} />

            {/* With the homepage as the protocol overview, an unknown path
                belongs at the front door — not deep inside the trading
                surface, where a typo'd URL would look like a real (empty)
                page. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      {/*
        The footer was a single row: a tagline on the left, "© 2026 Covenant Team" on
        the right. Three problems.

        1. `justify-between` with no wrap — at ~640px the two strings met in the
           middle and then overlapped, because neither could shrink.
        2. It was a dead end. Every product this interface is being measured
           against (Stripe, Linear, Vercel) uses the footer as the place where
           the durable, non-navigational facts live: what network am I on, where
           is the contract, where are the docs. Covenant has all three and showed
           none of them.
        3. A personal handle in the copyright line is the single loudest signal
           that a page is a side project rather than infrastructure. The
           attribution stays — it's just presented as the project rather than as
           a username.
      */}
      <footer className="border-t border-line mt-20">
        <div className="shell py-8 flex flex-col md:flex-row md:items-start justify-between gap-8">
          <div className="max-w-sm">
            <div className="text-body-sm font-semibold text-slate-200">Covenant</div>
            <p className="mt-1.5 text-body-sm text-subtle leading-relaxed">
              Reputation-aware trading capital for DreamDEX Event Contracts.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-10 gap-y-6" aria-label="Footer">
            {/* Groups mirror the header's split: the three transacting
                destinations under Protocol, the reference and one-time pages
                under Learn. The faucet moves out of Protocol — it is testnet
                scaffolding, not part of the credit product. */}
            <FooterGroup title="Protocol">
              <FooterLink to="/markets">Markets</FooterLink>
              <FooterLink to="/positions">Positions</FooterLink>
              <FooterLink to="/credit">Credit</FooterLink>
            </FooterGroup>
            <FooterGroup title="Learn">
              <FooterLink to="/docs/how-to">How to use Covenant</FooterLink>
              <FooterLink to="/docs">Documentation</FooterLink>
              <FooterLink to="/docs/how-it-works">How it works</FooterLink>
              <FooterLink to="/faucet">Testnet faucet</FooterLink>
            </FooterGroup>
            <FooterGroup title="On-chain">
              <FooterExternal href={EXPLORER}>Somnia explorer</FooterExternal>
              <FooterExternal href="https://docs.dreamdex.io/developers/event-contracts">
                DreamDEX Event Contracts
              </FooterExternal>
              <FooterExternal href="https://www.ethos.network/">Ethos</FooterExternal>
            </FooterGroup>
          </nav>
        </div>

        <div className="border-t border-line">
          <div className="shell py-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-body-sm text-subtle">
            <span>© 2026 Covenant</span>
            <span className="inline-flex items-center gap-2 font-mono text-micro">
              <span className="status-dot-ok" />
              {CHAIN.name}
              <span className="text-line-strong" aria-hidden="true">
                ·
              </span>
              chain {CHAIN.id}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── footer primitives ──────────────────────────────────────────────── */

function FooterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-micro font-semibold uppercase text-muted">{title}</div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-body-sm text-slate-400 hover:text-slate-100 transition-colors">
        {children}
      </Link>
    </li>
  );
}

function FooterExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-body-sm text-slate-400 hover:text-slate-100 transition-colors"
      >
        {children}
        <IconExternal className="w-3 h-3 opacity-60" />
      </a>
    </li>
  );
}
