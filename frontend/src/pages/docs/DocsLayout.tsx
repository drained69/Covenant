import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DOCS_NAV } from "./docsNav";
import { IconChevronRight } from "../../components/icons";

/*
  The docs shell.

  This is a layout route: the sidebar mounts once and stays mounted while the
  `<Outlet />` swaps pages underneath it. The alternative — repeating the nav
  inside each of the six pages — remounts it on every navigation, which loses
  the sidebar's scroll position and makes the whole column flash.

  Above `lg` the nav is a sticky left rail. Below `lg` it becomes a horizontal
  scroll strip, which is the same answer `Header.tsx` reached for mobile: every
  destination stays one tap away, with no hamburger and no extra state to
  manage. The rail is 15rem — wide enough for "How it works" and "Credit
  ladder" on one line each, narrow enough that the prose column keeps its
  measure on a 13" screen.
*/
export function DocsLayout() {
  const { pathname } = useLocation();
  const current = DOCS_NAV.find((item) => pathname === item.to || pathname.startsWith(item.to + "/"));

  return (
    <div className="shell py-10 lg:py-14">
      {/* The overview lives at /docs itself, so it is not in DOCS_NAV — it is
          the index those entries point away from. It gets its own sidebar row
          above the rule, which is also what makes the rule meaningful: it
          separates "you are here" from "where you can go". */}
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        {/* ── desktop rail ───────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <nav
            aria-label="Documentation"
            /* `top-24` clears the 4rem sticky header plus the page's own top
               padding. `max-h` + `overflow-y-auto` matter once the nav outgrows
               a short viewport — without them the last entries are unreachable
               on a laptop in a browser with a large toolbar. */
            className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar space-y-1"
          >
            <div className="section-label px-3 pb-2">Documentation</div>

            <DocsNavLink to="/docs" end>
              Overview
            </DocsNavLink>

            <div className="my-2 h-px bg-line" aria-hidden="true" />

            {DOCS_NAV.map((item) => (
              <DocsNavLink key={item.to} to={item.to}>
                {item.label}
              </DocsNavLink>
            ))}
          </nav>
        </aside>

        {/* ── mobile strip ───────────────────────────────────────────── */}
        <nav
          aria-label="Documentation"
          className="lg:hidden flex items-center gap-1 overflow-x-auto no-scrollbar -mx-6 px-6 pb-4 mb-6 border-b border-line"
        >
          <DocsNavLink to="/docs" end compact>
            Overview
          </DocsNavLink>
          <div className="w-px h-5 bg-line mx-1.5 flex-shrink-0" aria-hidden="true" />
          {DOCS_NAV.map((item) => (
            <DocsNavLink key={item.to} to={item.to} compact>
              {item.label}
            </DocsNavLink>
          ))}
        </nav>

        <div className="min-w-0">
          {/* A breadcrumb only where there is something to go back to. On the
              index itself it would point at the page you are already on. */}
          {current && (
            <div className="flex items-center gap-1.5 mb-6 text-body-sm text-subtle">
              <Link to="/docs" className="hover:text-slate-200 transition-colors">
                Docs
              </Link>
              <IconChevronRight className="w-3.5 h-3.5 opacity-50" aria-hidden="true" />
              <span className="text-slate-300">{current.label}</span>
            </div>
          )}

          <Outlet />
        </div>
      </div>
    </div>
  );
}

/* ── nav primitive ──────────────────────────────────────────────────── */

/*
  `NavLink` rather than `Link` + a manual `pathname` comparison: it already
  handles `end` (exact match, which /docs needs so it does not stay active on
  every child route) and sets `aria-current="page"` itself.

  The desktop rail is a full-width row, the mobile strip is a pill — different
  shapes for different axes, but one active state and one component.
*/
function DocsNavLink({
  to,
  end,
  compact,
  children,
}: {
  to: string;
  end?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        compact
          ? isActive
            ? "nav-tab-active flex-shrink-0"
            : "nav-tab flex-shrink-0"
          : [
              "block rounded-md px-3 py-2 text-body-sm transition-colors",
              isActive
                ? "bg-ink-900 text-slate-50 font-medium"
                : "text-slate-400 hover:text-slate-100 hover:bg-ink-900",
            ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}
