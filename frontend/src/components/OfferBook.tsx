import { useNavigate, useSearchParams } from "react-router-dom";
import { DEMO_OFFERS } from "../config/demoOffers";
import { fmtUnits } from "../lib/format";

/**
 * Order book for the current market. Clicking an offer sets `?offer=<id>&tab=take` on the URL,
 * which the ActionPanel reads to prefill the Take offer flow. There's no on-chain source of
 * truth for offers (they're signed off-chain and served over any medium), so we ship a small
 * seed list for the demo — replace with a marketplace fetch when there's a real backend.
 */
export function OfferBook() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selected = params.get("offer");

  function pick(id: string) {
    const next = new URLSearchParams(params);
    next.set("offer", id);
    next.set("tab", "take");
    navigate(`?${next.toString()}`, { replace: false });
    // scroll the actions panel into view for the user
    setTimeout(() => document.getElementById("actions-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Order book</div>
          <div className="text-xs text-subtle mt-0.5">Signed off-chain, filled on-chain. Click a row to take it.</div>
        </div>
        <span className="badge-info">{DEMO_OFFERS.length} live</span>
      </div>
      <div className="divide-y divide-line">
        {DEMO_OFFERS.map((o) => {
          const isSelected = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => pick(o.id)}
              className={`w-full text-left px-5 py-4 flex items-center gap-4 transition
                ${isSelected ? "bg-brand-500/8" : "hover:bg-white/5"}`}
            >
              <span className={o.side === "lend" ? "badge-info" : "badge-warn"}>
                {o.side === "lend" ? "LEND" : "BORROW"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{o.label}</div>
                <div className="text-[11px] font-mono text-subtle truncate">
                  maker {o.maker.slice(0, 6)}…{o.maker.slice(-4)} · expires {new Date(o.expiry * 1000).toLocaleTimeString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono tabular-nums text-slate-100">
                  {fmtUnits(BigInt(o.maxUnits), 6)} <span className="text-[10px] text-subtle">units</span>
                </div>
                <div className="text-[10px] tracking-widest uppercase text-brand-300 font-semibold">
                  {isSelected ? "Selected ✓" : "Take →"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
