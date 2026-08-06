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
 */
import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  align = "left",
  loading = false,
  mono = false,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "up" | "down" | "brand";
  align?: "left" | "right";
  loading?: boolean;
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
      ) : (
        <div className={`${toneClass} ${mono ? "font-mono text-base" : ""} mt-0.5`}>
          {value ?? "—"}
        </div>
      )}
      {hint && !loading && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
