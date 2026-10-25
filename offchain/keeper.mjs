#!/usr/bin/env node
/**
 * Watches Mezo (or whichever chain the manifest names) for unhealthy borrowers
 * and for a dead oracle or credit service.
 *
 * Dry-run by default: prints ALERT lines and does not send transactions.
 * Set KEEPER_SEND=1 and KEEPER_KEY to submit seize. Optional ALERT_WEBHOOK
 * receives a JSON { text } POST for each alert.
 *
 *   MANIFEST=../deployments/mezo-testnet.json node offchain/keeper.mjs
 */

import { readFileSync } from "node:fs";
import { ethers } from "ethers";

const MANIFEST_PATH = process.env.MANIFEST ?? "../deployments/mezo-testnet.json";
const manifest = JSON.parse(readFileSync(new URL(MANIFEST_PATH, import.meta.url), "utf8"));

function rpcUrl() {
  if (process.env.COVENANT_RPC_URL) return process.env.COVENANT_RPC_URL;
  if (Number(manifest.chainId) === 31611) return "https://rpc.test.mezo.org";
  if (Number(manifest.chainId) === 50312) return "https://api.infra.testnet.somnia.network";
  throw new Error("Set COVENANT_RPC_URL.");
}

const provider = new ethers.JsonRpcProvider(rpcUrl());

const covenantAbi = [
  "event Take(address caller, bytes32 indexed id_, uint256 units, address indexed taker, address indexed maker, bool offerIsBuy, bytes32 group, uint256 buyerAssets, uint256 sellerAssets, uint256 consumed, uint256 buyerPendingFeeIncrease, uint256 sellerPendingFeeDecrease, uint256 buyerCreditIncrease, uint256 sellerCreditDecrease, address receiver, address payer)",
  "function debtOf(bytes32 id, address user) view returns (uint128)",
  "function isHealthy((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address entryGate,address seizureGate) market, bytes32 id, address borrower) view returns (bool)",
  "function seize((address loanToken,(address token,uint256 lltv,uint256 maxLif,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address entryGate,address seizureGate) market, uint256 collateralIndex, uint256 seizedAssets, uint256 repaidUnits, address borrower, bool postMaturityMode, address receiver, address callback, bytes data) returns (uint256, uint256)",
];

const core = new ethers.Contract(manifest.covenant, covenantAbi, provider);
let alertCount = 0;

async function alert(kind, detail) {
  alertCount += 1;
  const text = `[covenant-keeper] ${kind}: ${detail}`;
  console.error(text);
  if (!process.env.ALERT_WEBHOOK) return;
  try {
    await fetch(process.env.ALERT_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error(`[covenant-keeper] webhook failed: ${error.message}`);
  }
}

function marketTuple(name) {
  const m = manifest.markets[name];
  return {
    loanToken: manifest.loanToken,
    collateralParams: [
      {
        token: manifest.collateralToken,
        lltv: BigInt(m.lltv),
        maxLif: BigInt(m.maxLif),
        oracle: manifest.oracle,
      },
    ],
    maturity: BigInt(manifest.maturity),
    rcfThreshold: 0n,
    entryGate: m.gate,
    seizureGate: m.gate,
  };
}

async function checkOracle() {
  const oracle = new ethers.Contract(manifest.oracle, ["function price() view returns (uint256)"], provider);
  try {
    const price = await oracle.price();
    console.log(`oracle price ${price}`);
  } catch (error) {
    await alert("ORACLE", error.shortMessage || error.message);
  }
}

async function checkService() {
  const base = process.env.CREDIT_SERVICE_URL;
  if (!base) return;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/health`);
    if (!response.ok) await alert("SERVICE", `health ${response.status}`);
    else console.log("credit service ok");
  } catch (error) {
    await alert("SERVICE", error.message);
  }
}

async function borrowersFromTakes() {
  const latest = await provider.getBlockNumber();
  // Mezo rejects eth_getLogs ranges wider than 10_000 blocks.
  const span = Number(process.env.KEEPER_BLOCK_SPAN ?? 9_000);
  const fromBlock = process.env.KEEPER_FROM_BLOCK
    ? Number(process.env.KEEPER_FROM_BLOCK)
    : Math.max(0, latest - span);
  const topic = core.interface.getEvent("Take").topicHash;
  const accounts = new Set();
  let found = 0;
  for (let start = fromBlock; start <= latest; start += 9_000) {
    const end = Math.min(latest, start + 8_999);
    const logs = await provider.getLogs({ address: manifest.covenant, topics: [topic], fromBlock: start, toBlock: end });
    found += logs.length;
    for (const log of logs) {
      const parsed = core.interface.parseLog(log);
      accounts.add(parsed.args.taker);
      accounts.add(parsed.args.maker);
    }
  }
  console.log(`scanned ${found} fills from block ${fromBlock}`);
  return accounts;
}

async function checkPositions(accounts) {
  const send = process.env.KEEPER_SEND === "1" && process.env.KEEPER_KEY;
  const signer = send ? new ethers.Wallet(process.env.KEEPER_KEY, provider) : null;
  for (const name of Object.keys(manifest.markets)) {
    const id = manifest.markets[name].marketId;
    const market = marketTuple(name);
    for (const account of accounts) {
      const debt = await core.debtOf(id, account);
      if (debt === 0n) continue;
      let healthy = false;
      try {
        healthy = await core.isHealthy(market, id, account);
      } catch (error) {
        await alert("HEALTH_READ", `${name} ${account} ${error.shortMessage || error.message}`);
        continue;
      }
      if (healthy) {
        console.log(`${name} ${account} debt ${debt} healthy`);
        continue;
      }
      await alert("UNHEALTHY", `${name} ${account} debt ${debt}`);
      if (!signer) continue;
      const tx = await core.connect(signer).seize(
        market,
        0,
        0,
        debt,
        account,
        false,
        signer.address,
        ethers.ZeroAddress,
        "0x",
        { gasPrice: 1000 },
      );
      console.log(`seize ${tx.hash}`);
      await tx.wait();
    }
  }
}

await checkOracle();
await checkService();
try {
  const accounts = await borrowersFromTakes();
  await checkPositions(accounts);
} catch (error) {
  await alert("SCAN", error.shortMessage || error.message);
}
console.log(alertCount === 0 ? "keeper ok" : `keeper alerts ${alertCount}`);
process.exit(alertCount === 0 ? 0 : 2);
