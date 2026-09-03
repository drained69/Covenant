import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getAddress, recoverMessageAddress, type Address } from "viem";
import { config } from "./config.js";
import type { StateStore } from "./state.js";
import {
  isValidLinkCode,
  LINK_CODE_TTL_MS,
  newLinkCode,
  ownershipMessage,
  telegramUserId,
} from "./telegram-auth.js";

const MAX_BODY_BYTES = 32_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": config.webUrl,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (response: ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  response.end(payload);
};

/** Reads and parses a JSON body, failing with a clean error on oversize. */
function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as Record<string, unknown>);
      } catch {
        reject(new Error("Request body is not valid JSON."));
      }
    });
    request.on("error", () => reject(new Error("Could not read the request body.")));
  });
}

/** The one-time page URL opened (or QR-scanned) wherever the user's wallet
    lives: a wallet app's built-in browser, a desktop browser with an
    extension, or WalletConnect on another device. */
function linkPageUrl(code: string): string {
  return `${config.webUrl}/telegram/link?code=${code}`;
}

function requireInitData(input: Record<string, unknown>): number {
  const initData = typeof input.initData === "string" ? input.initData : "";
  if (!initData) {
    throw new Error("Missing Telegram session (initData). Open Connect wallet again in Telegram.");
  }
  return telegramUserId(initData, config.telegramToken);
}

export type ConnectApiOptions = {
  /** Health payload fields beyond `{ ok: true }` for the /health route. */
  health: () => Record<string, unknown>;
  /** Notified after a wallet is bound (used for the Telegram confirmation). */
  onVerified: (userId: number, address: Address) => void;
  /** t.me link to this bot, served to the Mini App's out-of-Telegram page. */
  botUrl?: string;
};

/**
 * HTTP surface of the wallet-link flow, on the same server that serves the
 * Railway healthcheck. Routes:
 *
 *   POST /api/connect/session  {initData}            → current binding
 *   POST /api/connect/begin    {initData}            → one-time code + URL
 *   POST /api/connect/status   {code}                → pending | verified | …
 *   GET  /api/connect/message  ?code&address         → exact string to sign
 *   POST /api/connect/complete {code,address,sig}    → verify + bind
 */
export function createConnectApi(store: StateStore, options: ConnectApiOptions) {
  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }
    if (request.url === "/health") {
      json(response, 200, { ok: true, ...options.health() });
      return;
    }

    /* Lets a browser that landed on the Mini App URL outside Telegram link
       the user straight into the bot, where Connect wallet lives. */
    if (request.method === "GET" && request.url === "/api/connect/info") {
      json(response, 200, { ok: true, botUrl: options.botUrl ?? null });
      return;
    }

    try {
      /* Current binding for the Telegram account opening the Mini App. The
         Mini App calls this on load to decide between the verified view and
         starting a new link. */
      if (request.method === "POST" && request.url === "/api/connect/session") {
        const userId = requireInitData(await readJsonBody(request));
        const address = store.wallet(userId);
        json(response, 200, { ok: true, verified: Boolean(address), address });
        return;
      }

      /* Start (or restart) a one-time link: the Mini App shows the code, the
         URL, and a QR, then polls /api/connect/status until it is verified. */
      if (request.method === "POST" && request.url === "/api/connect/begin") {
        const userId = requireInitData(await readJsonBody(request));
        const code = newLinkCode();
        const expiresAt = Date.now() + LINK_CODE_TTL_MS;
        store.beginLink(userId, code, expiresAt);
        json(response, 200, { ok: true, code, url: linkPageUrl(code), expiresAt });
        return;
      }

      /* Poll endpoint for the Mini App. "unknown" covers expired-and-pruned
         and restarted-worker codes alike: the Mini App simply starts a new
         link. */
      if (request.method === "POST" && request.url === "/api/connect/status") {
        const input = await readJsonBody(request);
        const code = typeof input.code === "string" ? input.code : "";
        if (!isValidLinkCode(code)) {
          json(response, 400, { ok: false, message: "Malformed link code." });
          return;
        }
        const session = store.linkSession(code);
        if (!session) {
          json(response, 200, { ok: true, state: "unknown" });
          return;
        }
        if (session.completedAddress) {
          json(response, 200, { ok: true, state: "verified", address: session.completedAddress });
          return;
        }
        json(response, 200, {
          ok: true,
          state: session.expiresAt < Date.now() ? "expired" : "pending",
        });
        return;
      }

      /* The exact human-readable string the wallet will sign, for the code
         and address named in the query. The signing page shows this
         verbatim. */
      if (request.method === "GET" && request.url?.startsWith("/api/connect/message")) {
        const url = new URL(request.url, "http://localhost");
        const code = url.searchParams.get("code") ?? "";
        const addressParam = url.searchParams.get("address");
        try {
          if (!isValidLinkCode(code)) throw new Error("Malformed link code.");
          if (!addressParam) throw new Error("Missing wallet address.");
          const session = store.linkSession(code);
          if (!session || session.expiresAt < Date.now() || session.completedAddress) {
            throw new Error("This link code is no longer active. Start Connect wallet again in Telegram.");
          }
          const address = getAddress(addressParam);
          json(response, 200, {
            ok: true,
            message: ownershipMessage(address, code),
            expiresAt: session.expiresAt,
          });
        } catch (error) {
          json(response, 400, { ok: false, message: (error as Error).message });
        }
        return;
      }

      /* Verify the signature and bind the wallet to the Telegram user that
         created the code. The code is single-use and expires in 10 minutes. */
      if (request.method === "POST" && request.url === "/api/connect/complete") {
        const input = (await readJsonBody(request)) as {
          code?: string;
          address?: string;
          signature?: string;
        };
        try {
          const code = input.code ?? "";
          if (!isValidLinkCode(code)) throw new Error("Malformed link code.");
          if (!input.address) throw new Error("Missing wallet address.");
          if (!input.signature?.startsWith("0x")) {
            throw new Error("Missing or malformed wallet signature.");
          }
          const session = store.linkSession(code);
          if (!session || session.expiresAt < Date.now()) {
            throw new Error("This link code expired. Start Connect wallet again in Telegram.");
          }
          if (session.completedAddress) {
            throw new Error("This link code was already used. Start Connect wallet again in Telegram.");
          }
          const address = getAddress(input.address);
          const recovered = await recoverMessageAddress({
            message: ownershipMessage(address, code),
            signature: input.signature as `0x${string}`,
          });
          if (recovered.toLowerCase() !== address.toLowerCase()) {
            throw new Error("Signature does not prove ownership of this wallet.");
          }
          const userId = store.completeLink(code, address);
          if (userId === undefined) {
            throw new Error("This link code was already used. Start Connect wallet again in Telegram.");
          }
          await store.setWallet(userId, address);
          options.onVerified(userId, address);
          json(response, 200, { ok: true, address, message: "Wallet verified" });
        } catch (error) {
          json(response, 400, { ok: false, message: (error as Error).message });
        }
        return;
      }
    } catch (error) {
      json(response, 400, { ok: false, message: (error as Error).message });
      return;
    }

    response.writeHead(404).end();
  });
}
