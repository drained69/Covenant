import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";

/**
 * Validate Telegram Mini App initData according to Telegram's documented
 * HMAC scheme. Never trust a user ID supplied by the browser alone: the
 * signed initData binds the embedded app session to the Telegram account.
 */
export function telegramUserId(initData: string, botToken: string): number {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram session is missing its verification hash.");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  // Telegram's Web App algorithm is HMAC(data=botToken, key="WebAppData"),
  // then HMAC(data=dataCheckString, key=secret). Node's createHmac takes the
  // key first, so the documented pair becomes the order below.
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const received = Buffer.from(hash, "hex");
  const calculated = Buffer.from(expected, "hex");
  if (received.length !== calculated.length || !timingSafeEqual(received, calculated)) {
    throw new Error("Telegram session verification failed.");
  }

  const user = JSON.parse(params.get("user") ?? "{}") as { id?: number };
  if (!Number.isSafeInteger(user.id)) throw new Error("Telegram session has no valid user.");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || Date.now() / 1000 - authDate > 3600) {
    throw new Error("Telegram session expired. Open Connect wallet again.");
  }
  return user.id as number;
}

/**
 * Link codes use an unambiguous alphabet (no 0/O/1/I) so a code survives
 * being read aloud or retyped when the link itself cannot be opened. Ten
 * characters give ~50 bits of entropy against guessing within the short
 * single-use window.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newLinkCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export const LINK_CODE_TTL_MS = 10 * 60_000;

/** Codes are opaque tokens, but still validated before any state lookup. */
export function isValidLinkCode(code: string): boolean {
  return /^[2-9A-HJ-NP-Z]{6,16}$/.test(code);
}

export function ownershipMessage(address: Address, code: string): string {
  return [
    "Covenant Telegram wallet verification",
    "",
    "Link this wallet to my Telegram account for Covenant read access.",
    `Wallet: ${address}`,
    `Link code: ${code}`,
    "This signature does not authorize a transaction or transfer funds.",
  ].join("\n");
}
