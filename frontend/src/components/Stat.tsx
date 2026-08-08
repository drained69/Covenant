/**
 * The metric primitive. Previously duplicated locally in MarketCard and
 * MarketVitals with slightly different markup, which is how the two drifted
 * apart visually.
 *
 * Design decisions encoded here:
 *
 * 1. **`align` prop.** Numbers in a row of metrics should share a text
 *    alignment so their digits form a column. Tabular figures (now working
 *    app-wide after the `font-feature-settings` fix) only pay off if the
 *    alignment is consistent.
 *
 * 2. **`tone` is opt-in and rare.** Colouring every value — as PositionCard
 *    did, with green Credit / red Debt / amber Collateral — destroys hierarchy:
 *    when everything is emphasised, nothing is. Default is the neutral
 *    `.stat-value`; tone is for genuine directional semantics only.
 *
 * 3. **Loading is a skeleton, never an em-dash.** `—` is a legitimate value
 *    ("no data"), so using it for "not loaded yet" makes an in-flight read
 *    indistinguishable from an empty one.
 *
 * 4. **`error` is a third state, not a variant of the other two.** The same
 *    argument as (3), one step further: a read that failed is not zero and not
 *    loading. Without this state a component has no way to say "we could not
 *    reach the node", so a dropped RPC call renders as a confident `0` — the
 *    worst outcome, because the user believes it. Errors render as `unavailable`
 *    with the reason on hover, so the figure is never fabricated.
 */
import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  align = "left",
  loading = false,
  error = false,
  errorHint,
  mono = false,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "up" | "down" | "brand";
  align?: "left" | "right";
  loading?: boolean;
  /** The read failed. Takes precedence over `value` — never show a stale or zero figure. */
  error?: boolean;
  /** Shown on hover when `error` is set, e.g. the revert reason or RPC message. */
  errorHint?: string;
  /** Use for addresses and hashes, not for figures — figures use tabular sans. */
  mono?: boolean;
}) {
  const toneClass = {
    neutral: "stat-value",
    up: "stat-value-up",
    down: "stat-value-down",
    brand: "stat-value-pop",
  }[tone];

  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="stat-label">{label}</div>
      {loading ? (
        <div className={`skeleton mt-1.5 h-6 w-20 ${align === "right" ? "ml-auto" : ""}`} />
      ) : error ? (
        <div
          className="stat-value mt-0.5 text-warn/70 text-base"
          title={errorHint ?? "This value could not be read from the chain."}
        >
          unavailable
        </div>
      ) : (
        <div className={`${toneClass} ${mono ? "font-mono text-base" : ""} mt-0.5`}>
          {value ?? "—"}
        </div>
      )}
      {error && !loading && (
        <div className="stat-hint text-warn/60">read failed</div>
      )}
      {hint && !loading && !error && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
