import { formatUnits } from "viem";

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const fmtUnits = (raw: bigint | undefined, decimals: number, digits = 4): string => {
  if (raw === undefined) return "—";
  const s = formatUnits(raw, decimals);
  const [i, d = ""] = s.split(".");
  return d ? `${addCommas(i)}.${d.slice(0, digits).padEnd(digits, "0").replace(/0+$/, "") || "0"}` : addCommas(i);
};

export const fmtUsd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/**
 * Compact money for stat surfaces and market rows: 24800 → "$24.8K",
 * 1250000 → "$1.3M". Trading terminals quote volume and capacity this way;
 * full precision belongs in ledgers, not in scan-level figures.
 */
export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

/**
 * Probability as price: 0.62 → "62¢". The prediction-market convention —
 * a YES share costs 62¢ and pays $1 — expresses both probability and payout
 * in one number, which is why every serious event-contract interface quotes
 * cents instead of percentages.
 */
export function fmtCents(p: number | undefined): string {
  return p === undefined ? "—" : `${Math.round(p * 100)}¢`;
}

const addCommas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const daysUntil = (unixSec: bigint): number =>
  Math.max(0, Math.floor((Number(unixSec) - Date.now() / 1000) / 86400));

export const isoDate = (unixSec: bigint): string =>
  new Date(Number(unixSec) * 1000).toISOString().slice(0, 10);

/** Relative age for freshness captions ("12s ago"). Lived locally in MarketVitals. */
export const humanAge = (sec: number): string => {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

/**
 * Time remaining until a future unix timestamp ("58m left", "Expired").
 *
 * The order book previously printed `toLocaleTimeString()` — an absolute wall
 * clock ("3:47:12 PM"), which the reader has to subtract from their own sense of
 * the current time to answer the only question they actually have: is this offer
 * still good? Seconds precision on an hour-long window made that worse.
 */
export const humanUntil = (unixSec: number): string => {
  const s = Math.floor(unixSec - Date.now() / 1000);
  if (s <= 0) return "Expired";
  if (s < 60) return `${s}s left`;
  if (s < 3600) return `${Math.floor(s / 60)}m left`;
  if (s < 86400) return `${Math.floor(s / 3600)}h left`;
  return `${Math.floor(s / 86400)}d left`;
};

/** Host of an explorer URL, for link labels. Was parsed inline inside JSX. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Compact countdown for live surfaces ("0:41", "12:05", "3h 12m").
 *
 * `humanUntil` answers "roughly how long?" on rows and captions; the trade
 * panel needs the opposite — an exact clock the trader can watch tick. Near
 * expiry it shows seconds because that is when settlement timing matters.
 */
export const countdown = (unixSec: number, nowMs: number = Date.now()): string => {
  const s = Math.max(0, Math.floor(unixSec - nowMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
