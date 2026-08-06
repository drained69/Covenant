import { Navigate, Route, Routes, Link } from "react-router-dom";
import { Header } from "./components/Header";
import { Markets } from "./pages/Markets";
import { MarketDetail } from "./pages/MarketDetail";
import { Positions } from "./pages/Positions";
import { Faucet } from "./pages/Faucet";
import { Compliance } from "./pages/Compliance";
import { HowItWorks } from "./pages/HowItWorks";
import { CHAIN, EXPLORER, ADDRESSES } from "./config/chain";
import { IconExternal } from "./components/icons";

export function App() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/markets" replace />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/markets/:marketId" element={<MarketDetail />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/faucet" element={<Faucet />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="*" element={<Navigate to="/markets" replace />} />
        </Routes>
      </main>

      {/*
        The footer was a single row: a tagline on the left, "© 2026 drained99" on
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
              Compliance-native institutional credit. Fixed-rate, fixed-maturity, gated in-transaction.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-10 gap-y-6" aria-label="Footer">
            <FooterGroup title="Protocol">
              <FooterLink to="/markets">Markets</FooterLink>
              <FooterLink to="/positions">Positions</FooterLink>
              <FooterLink to="/faucet">Testnet faucet</FooterLink>
            </FooterGroup>
            <FooterGroup title="Learn">
              <FooterLink to="/how-it-works">How it works</FooterLink>
              <FooterLink to="/compliance">Compliance</FooterLink>
            </FooterGroup>
            <FooterGroup title="On-chain">
              <FooterExternal href={`${EXPLORER}/address/${ADDRESSES.covenant}`}>
                Covenant core
              </FooterExternal>
              <FooterExternal href={`${EXPLORER}/address/${ADDRESSES.gate}`}>
                Compliance gate
              </FooterExternal>
            </FooterGroup>
          </nav>
        </div>

        <div className="border-t border-line">
          <div className="shell py-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-body-sm text-subtle">
            <span>© 2026 Covenant. Unaudited testnet software — not for production funds.</span>
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
