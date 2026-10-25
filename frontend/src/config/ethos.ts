/** Ethos v2 public API — the reputation source behind every credit tier. */
export const ETHOS_API_URL = "https://api.ethos.network/api/v2";
export const ETHOS_CLIENT = "covenant-mezo-credit@0.1.0";

/** Display copy of the on-chain tier ladder (thresholds and LLTVs live in config/credit.ts). */
export const ETHOS_TIERS = [
  { name: "Open", minimum: 0, ltv: 38.5, color: "neutral" },
  { name: "Established", minimum: 1600, ltv: 62.5, color: "brand" },
  { name: "Reputable", minimum: 2000, ltv: 77, color: "ok" },
] as const;

export function ethosTier(score: number) {
  return [...ETHOS_TIERS].reverse().find((tier) => score >= tier.minimum) ?? ETHOS_TIERS[0];
}

/**
 * Ethos profile page for a wallet address.
 *
 * The address sits directly on the profile path — no `/addr/` or `/address/`
 * segment. Verified against live profiles: `app.ethos.network/profile/0x…`
 * resolves (case-insensitive) for both registered wallets and bare addresses
 * (unregistered ones render a default 1200 · Neutral page), while the
 * old `ethos.network/profile/addr/…` form 404s — ethos.network is now the
 * marketing site; the app lives on the `app.` subdomain.
 */
export function ethosProfileUrl(address: string): string {
  return `https://app.ethos.network/profile/${address}`;
}

/**
 * Where a user links wallet addresses to their Ethos profile.
 *
 * Ethos identity is X-based (sign-in + reviews on X), but Covenant never
 * talks to X: the on-chain tier gates authorize WALLET-bound scores, so the
 * only valid binding is wallet↔Ethos-profile, made on Ethos's side. This URL
 * is the target of every "bring your X reputation" affordance in the app.
 */
export const ETHOS_SETTINGS_URL = "https://app.ethos.network/profile/settings";
