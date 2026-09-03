#!/usr/bin/env node
/**
 * Covenant Somnia service — the off-chain half of the credit layer.
 *
 * Two responsibilities, both about SIGNED AUTHORITY the on-chain layer verifies:
 *
 *   GET /api/ethos-score?address=0x…
 *       Reads the wallet's live Ethos credibility score (v2 API) and returns a
 *       short-lived EIP-712 `ScoreAuthorization` for every tier gate, signed by
 *       SCORE_SIGNER_KEY. The frontend submits one to the market's gate before
 *       borrowing. Bounded trust: the signer can only attest scores — it holds
 *       no funds and cannot alter thresholds, LLTVs, or solvency.
 *
 *   GET /api/offer?market=established&units=10000
 *       Signs a fresh lender offer (buy credit units at par) for the named tier
 *       market with LENDER_KEY, returning the Offer JSON + notaryData the
 *       frontend passes to Covenant.fillOffer. A trader "borrowing" is a trader
 *       filling this offer.
 *
 * The deployment manifest (deployments/somnia-testnet.json) carries every
 * address and market parameter; nothing is hardcoded here. Run:
 *
 *   node offchain/somnia-service.mjs            # port 3001 (Vite proxies /api)
 *
 * Env:
 *   SCORE_SIGNER_KEY   — key whose address the EthosTierGates were deployed with
 *   LENDER_KEY         — key that lends into tier markets (needs venue tUSDC)
 *   MANIFEST           — path to the deployment manifest (default below)
 *   PORT               — default 3001
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { ethers } from "ethers";

/* ─────────────────────────────────────────────────────────────────────────────
 * Manifest
 * ────────────────────────────────────────────────────────────────────────── */

const MANIFEST_PATH = process.env.MANIFEST ?? "../deployments/somnia-testnet.json";

function loadManifest() {
  let raw;
  try {
    raw = readFileSync(new URL(MANIFEST_PATH, import.meta.url), "utf8");
  } catch {
    console.error(`Manifest not found at ${MANIFEST_PATH}.`);
    console.error("Deploy with script/DeploySomnia.s.sol and write deployments/somnia-testnet.json first.");
    process.exit(1);
  }
  const m = JSON.parse(raw);
  for (const field of ["chainId", "covenant", "notary", "loanToken", "collateralToken", "oracle", "maturity", "markets"]) {
    if (m[field] === undefined) {
      console.error(`Manifest is missing "${field}".`);
      process.exit(1);
    }
  }
  return m;
}

const MANIFEST = loadManifest();

/* ─────────────────────────────────────────────────────────────────────────────
 * Keys
 * ────────────────────────────────────────────────────────────────────────── */

const scoreSignerKey = process.env.SCORE_SIGNER_KEY;
const lenderKey = process.env.LENDER_KEY;

if (!scoreSignerKey || !lenderKey) {
  console.error("Set SCORE_SIGNER_KEY and LENDER_KEY in the environment.");
  process.exit(1);
}

const scoreSigner = new ethers.Wallet(scoreSignerKey);
const lender = new ethers.Wallet(lenderKey);

/* ─────────────────────────────────────────────────────────────────────────────
 * Score authorization signing (EthosTierGate)
 * ────────────────────────────────────────────────────────────────────────── */

const SCORE_AUTH_TYPES = {
  ScoreAuthorization: [
    { name: "wallet", type: "address" },
    { name: "score", type: "uint128" },
    { name: "deadline", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "chainId", type: "uint256" },
  ],
};

const AUTH_TTL_SECONDS = 30 * 60;

/** Signs one authorization against one gate's EIP-712 domain. */
async function signScoreAuthorization(gateAddress, wallet, score) {
  const nonce = BigInt(Date.now());
  const deadline = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS;
  const authorization = {
    wallet,
    score,
    deadline,
    nonce: nonce.toString(),
    chainId: MANIFEST.chainId,
  };
  const domain = {
    name: "Covenant Ethos Score",
    version: "1",
    chainId: MANIFEST.chainId,
    verifyingContract: gateAddress,
  };
  const signature = await scoreSigner.signTypedData(domain, SCORE_AUTH_TYPES, authorization);
  const sig = ethers.Signature.from(signature);
  return {
    authorization,
    signature: { v: sig.v, r: sig.r, s: sig.s },
    gate: gateAddress,
    deadline,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Ethos score read
 * ────────────────────────────────────────────────────────────────────────── */

const ETHOS_API = "https://api.ethos.network/api/v2";
const ETHOS_CLIENT = "covenant-prediction-markets@0.1.0";

async function readEthosScore(address) {
  const response = await fetch(
    `${ETHOS_API}/score/address?address=${encodeURIComponent(address)}`,
    { headers: { "X-Ethos-Client": ETHOS_CLIENT } },
  );
  if (!response.ok) throw new Error(`Ethos API ${response.status}`);
  const data = await response.json();
  return { score: data.score ?? 0, level: data.level ?? "unknown" };
}

/** Tier for a score, using the manifest's thresholds (highest wins). */
function tierFor(score) {
  const entries = Object.entries(MANIFEST.markets).sort((a, b) => b[1].threshold - a[1].threshold);
  for (const [name, market] of entries) {
    if (score >= market.threshold) return name;
  }
  return entries[entries.length - 1]?.[0] ?? "open";
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Offer signing (EcrecoverNotary) — HashLib port, per-market
 * ────────────────────────────────────────────────────────────────────────── */

const OFFER_TYPES = {
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "maxLif", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "entryGate", type: "address" },
    { name: "seizureGate", type: "address" },
  ],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "notary", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint256" },
    { name: "maxAssets", type: "uint256" },
  ],
  // Field name must be `offerTree` — see HashLib.offerTreeTypeHash(0).
  OfferTree: [{ name: "offerTree", type: "Offer" }],
};

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

const COLLATERAL_PARAMS_TYPEHASH = "0xaf44a88eb50ebdbbebd980e5a23045c44f61ece5f80ab708a1bbe8718102e6af";
const MARKET_TYPEHASH = "0x4d629a25703924f44fdc6d27bc80b822f48f46c8093e48ee1d9f917b651ce5ab";
const OFFER_TYPEHASH = "0x511c15b0860ce049695d22079788e07bf20c7091820f0d8677a4a18886c0a9ef";

/** The manifest's per-market params as the on-chain Market struct. */
function marketStruct(marketName) {
  const m = MANIFEST.markets[marketName];
  if (!m) return null;
  return {
    loanToken: MANIFEST.loanToken,
    collateralParams: [
      {
        token: MANIFEST.collateralToken,
        lltv: String(m.lltv),
        maxLif: String(m.maxLif),
        oracle: MANIFEST.oracle,
      },
    ],
    maturity: String(MANIFEST.maturity),
    rcfThreshold: "0",
    entryGate: m.gate,
    seizureGate: m.gate,
  };
}

function hashCollateralParams(cp) {
  return ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "uint256", "uint256", "address"],
      [COLLATERAL_PARAMS_TYPEHASH, cp.token, cp.lltv, cp.maxLif, cp.oracle],
    ),
  );
}

function hashMarket(market) {
  const collateralParamsHash = ethers.keccak256(
    ethers.concat(market.collateralParams.map(hashCollateralParams)),
  );
  return ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "bytes32", "uint256", "uint256", "address", "address"],
      [
        MARKET_TYPEHASH,
        market.loanToken,
        collateralParamsHash,
        market.maturity,
        market.rcfThreshold,
        market.entryGate,
        market.seizureGate,
      ],
    ),
  );
}

function hashOffer(offer) {
  return ethers.keccak256(
    abiCoder.encode(
      [
        "bytes32", "bytes32", "bool", "address", "uint256", "uint256", "uint256",
        "bytes32", "address", "bytes32", "address", "address", "bool", "uint256", "uint256",
      ],
      [
        OFFER_TYPEHASH,
        hashMarket(offer.market),
        offer.buy,
        offer.maker,
        offer.start,
        offer.expiry,
        offer.tick,
        offer.group,
        offer.callback,
        ethers.keccak256(offer.callbackData),
        offer.receiverIfMakerIsSeller,
        offer.notary,
        offer.reduceOnly,
        offer.maxUnits,
        offer.maxAssets,
      ],
    ),
  );
}

const MAX_TICK = 5820n; // par — 1:1 credit units per loan token

/**
 * Signs a lender BUY offer (maker lends) on the named tier market.
 * @param {string} marketName tier key in the manifest
 * @param {bigint} units credit units offered (raw, loan-token decimals)
 */
async function signLenderOffer(marketName, units) {
  const market = marketStruct(marketName);
  if (!market) throw new Error(`unknown market "${marketName}"`);

  const now = Math.floor(Date.now() / 1000);
  const offer = {
    market,
    buy: true,
    maker: lender.address,
    start: 0,
    // One hour: the offer is filled the moment the trader clicks Borrow in
    // the UI, but a long TTL keeps manual testing and demo flows from racing
    // the expiry like a short-lived quote would.
    expiry: now + 3600,
    tick: MAX_TICK,
    group: ethers.hexlify(ethers.randomBytes(32)),
    callback: ethers.ZeroAddress,
    callbackData: "0x",
    receiverIfMakerIsSeller: ethers.ZeroAddress,
    notary: MANIFEST.notary,
    reduceOnly: false,
    maxUnits: units.toString(),
    maxAssets: 0,
  };

  const domain = { chainId: MANIFEST.chainId, verifyingContract: MANIFEST.notary };
  const signature = await lender.signTypedData(domain, OFFER_TYPES, { offerTree: offer });
  const sig = ethers.Signature.from(signature);

  const root = hashOffer(offer);
  const notaryData = abiCoder.encode(
    ["tuple(uint8 v, bytes32 r, bytes32 s)", "bytes32", "uint256", "bytes32[]"],
    [{ v: sig.v, r: sig.r, s: sig.s }, root, 0, []],
  );

  return {
    maker: lender.address,
    marketId: MANIFEST.markets[marketName].marketId,
    offer,
    notaryData,
    expiry: offer.expiry,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * HTTP
 * ────────────────────────────────────────────────────────────────────────── */

const PORT = Number(process.env.PORT ?? 3001);

function sendJson(res, status, body) {
  // BigInts (tick, maxUnits, …) serialize as decimal strings.
  const payload = JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        chainId: MANIFEST.chainId,
        scoreSigner: scoreSigner.address,
        lender: lender.address,
        markets: Object.fromEntries(
          Object.entries(MANIFEST.markets).map(([k, m]) => [k, { gate: m.gate, threshold: m.threshold }]),
        ),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/ethos-score") {
      const address = url.searchParams.get("address");
      if (!address || !ethers.isAddress(address)) {
        return sendJson(res, 400, { ok: false, message: "Invalid address." });
      }

      let score, level;
      try {
        ({ score, level } = await readEthosScore(address));
      } catch (error) {
        // Fail closed: no Ethos data → score 0 → Open tier at best. The service
        // still signs (the Open gate admits any score), mirroring the protocol's
        // "missing data grants no enhanced access" rule.
        score = 0;
        level = "unavailable";
        console.warn(`Ethos read failed for ${address}: ${error.message}`);
      }

      const tier = tierFor(score);
      const authorizations = {};
      for (const [name, market] of Object.entries(MANIFEST.markets)) {
        authorizations[name] = await signScoreAuthorization(market.gate, address, score);
      }

      return sendJson(res, 200, {
        ok: true,
        address,
        score,
        level,
        tier,
        authorizations,
        ttlSeconds: AUTH_TTL_SECONDS,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/offer") {
      const marketName = url.searchParams.get("market");
      const unitsRaw = url.searchParams.get("units");
      const units = BigInt(unitsRaw ?? "0");
      if (!marketName || !MANIFEST.markets[marketName] || units <= 0n) {
        return sendJson(res, 400, { ok: false, message: "Pass ?market=<tier>&units=<raw units>." });
      }
      const signed = await signLenderOffer(marketName, units);
      return sendJson(res, 200, { ok: true, ...signed });
    }

    return sendJson(res, 404, { ok: false, message: "Not found." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { ok: false, message: String(error).slice(0, 300) });
  }
});

server.listen(PORT, () => {
  console.log(`Covenant Somnia service on :${PORT}`);
  console.log(`  chain ${MANIFEST.chainId} · score signer ${scoreSigner.address} · lender ${lender.address}`);
  console.log(`  markets: ${Object.entries(MANIFEST.markets).map(([k, m]) => `${k}(≥${m.threshold})`).join(", ")}`);
});
