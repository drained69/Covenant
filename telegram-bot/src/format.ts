export function money(value: number, digits = 2): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

export function cents(value?: number): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}¢`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function remaining(expirySeconds?: number): string {
  if (!expirySeconds) return "—";
  const seconds = Math.max(0, expirySeconds - Math.floor(Date.now() / 1000));
  if (seconds === 0) return "settled";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function commandArgs(text?: string): string[] {
  if (!text) return [];
  return text.trim().split(/\s+/).filter(Boolean);
}
