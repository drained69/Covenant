import { Link, useLocation } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Brand } from "./Brand";

// Small inline SVG icons, sized via .nav-tab-icon. Kept inline so the header has zero deps.
const IconMarkets = () => (
  <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" />
  </svg>
);
const IconPositions = () => (
  <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="4" /><path d="M2 22a7 7 0 0 1 14 0" /><circle cx="17" cy="8" r="3" /><path d="M22 20a5 5 0 0 0-4-4.9" />
  </svg>
);
const IconCompliance = () => (
  <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const IconHow = () => (
  <svg className="nav-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);

const NAV = [
  { to: "/markets",     label: "Markets",       Icon: IconMarkets },
  { to: "/positions",   label: "My positions",  Icon: IconPositions },
  { to: "/compliance",  label: "Compliance",    Icon: IconCompliance },
  { to: "/how-it-works",label: "How it works",  Icon: IconHow },
];

export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-ink-950/70 border-b border-line">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="text-slate-100 hover:text-brand-300 transition">
          <Brand />
        </Link>
        <nav className="hidden md:flex items-center gap-2">
          {NAV.map(({ to, label, Icon }) => (
            <Link key={to} to={to} className={pathname.startsWith(to) ? "nav-tab-active" : "nav-tab"}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
      </div>
    </header>
  );
}
