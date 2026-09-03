import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAddress, isAddress, type Address, type Hex } from "viem";

/* Local development uses the repository-root .env, while Railway injects
   variables directly into the service. Load the nearest local file without
   overriding variables already supplied by the process environment. */
function loadLocalEnv(): void {
  let directory = process.cwd();
  for (let depth = 0; depth < 4; depth++) {
    const file = join(directory, ".env");
    if (existsSync(file)) {
      loadDotenv({ path: file });
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
  loadDotenv();
}

loadLocalEnv();

export const SOMNIA_CHAIN_ID = 50312;
export const TEST_USDC = getAddress("0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E");
export const COVENANT = getAddress("0xA11c466cbebB86f865e2Ccea5F0f273b078E30C7");
export const ORACLE = getAddress("0xADbE706FF8c80850457D0A91f19cd79A5C9098E0");

export type TierKey = "open" | "established" | "reputable";

export const TIERS: Record<
  TierKey,
  { name: string; minimum: number; lltv: bigint; maxLif: bigint; gate: Address; marketId: Hex }
> = {
  open: {
    name: "Open",
    minimum: 0,
    lltv: 385000000000000000n,
    maxLif: 1181683899556868537n,
    gate: getAddress("0xEE6fF9E8FD639E15d9a077c2aceF0e8Ba16A4844"),
    marketId: "0xbc1f231da78029b2a891e8c7d80c765224f45697d2bf2a2ee7e7ecb00f3df1ae",
  },
  established: {
    name: "Established",
    minimum: 1600,
    lltv: 625000000000000000n,
    maxLif: 1103448275862068965n,
    gate: getAddress("0xC0E6a382e9F761c793F6714fC427e93e26520161"),
    marketId: "0x987fb3b208df8942d4adb5dfc2639ce997e8d1f1ed29ba41370db429c405149f",
  },
  reputable: {
    name: "Reputable",
    minimum: 2000,
    lltv: 770000000000000000n,
    maxLif: 1061007957559681697n,
    gate: getAddress("0x0f596034793EDDDd3a6c32C00c4BbF780E31868D"),
    marketId: "0xef116848e2da8cb6553350b02f8670c00a04629f765295797d38baf7cc787046",
  },
};

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function num(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

function optionalHex(value?: string): Hex | undefined {
  const trimmed = value?.trim();
  return trimmed ? (trimmed as Hex) : undefined;
}

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  adminIds: new Set(
    (process.env.TELEGRAM_ADMIN_IDS ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isFinite),
  ),
  webUrl: (process.env.COVENANT_WEB_URL ?? "https://covenantv1.up.railway.app").replace(/\/$/, ""),
  apiUrl: (process.env.COVENANT_API_URL ?? "https://covenant-api-production-1ce1.up.railway.app").replace(/\/$/, ""),
  rpcUrl: process.env.RPC_URL ?? "https://api.infra.testnet.somnia.network",
  wsRpcUrl: process.env.WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws",
  indexerUrl: process.env.INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql",
  venueId: optionalHex(
    process.env.VENUE_ID ??
      "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c",
  ),
  tradingEnabled: bool("BOT_TRADING_ENABLED"),
  custodyEnabled: bool("BOT_CUSTODY_ENABLED"),
  botPrivateKey: optionalHex(process.env.BOT_PRIVATE_KEY),
  maxOrderUsd: num("BOT_MAX_ORDER_USD", 25),
  stateFile: process.env.BOT_STATE_FILE ?? "./data/state.json",
  webAppUrl: (process.env.TELEGRAM_WEB_APP_URL ?? "https://covenantv1.up.railway.app/telegram/connect").replace(/\/$/, ""),
  port: num("PORT", 8080),
};

export function parseAddress(value: string): Address {
  if (!isAddress(value)) throw new Error("Expected a valid 0x wallet address.");
  return getAddress(value);
}

export function tierFor(score: number): TierKey {
  if (score >= TIERS.reputable.minimum) return "reputable";
  if (score >= TIERS.established.minimum) return "established";
  return "open";
}
