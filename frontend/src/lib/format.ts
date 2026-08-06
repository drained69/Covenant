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
