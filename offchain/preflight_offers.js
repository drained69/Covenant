#!/usr/bin/env node
/**
 * Pre-flight every offer in frontend/src/config/offerBook.json.
 *
 * Why this exists: an offer that is internally consistent can still be rejected
 * on-chain, and the only honest way to claim the book is "real" is to ask the
 * deployed notary directly. `INotary.isNotarized` is `view` and must return the
 * CALLBACK_SUCCESS magic value (reverting, rather than returning falsy, on any
 * failure), so each offer can be checked for free before a single wei is spent.
 *
 * The one subtlety: EcrecoverNotary.isNotarized opens with
 *   require(msg.sender == COVENANT, NotCovenant())
 * so the call must be made *as* the Covenant core. An eth_call with the default
 * sender reverts with NotCovenant() (0x0a3a5dad) no matter how good the
 * signature is — a false alarm that says nothing about the offer.
 *
 * Run: node offchain/preflight_offers.js
 * Requires: RPC_URL in the env.
 */

const { ethers } = require("ethers");
const path = require("path");
const { hashOffer } = require("./sign_offer");

const NOTARY_ABI = [
  "function isNotarized((( address,(address,uint256,uint256,address)[],uint256,uint256,address,address),bool,address,uint256,uint256,uint256,bytes32,address,bytes,address,address,bool,uint256,uint256) offer, bytes notaryData) view returns (bytes32)",
  "function COVENANT() view returns (address)",
  "function isRootCanceled(address maker, bytes32 root) view returns (bool)",
];

/** keccak256("covenant.callbackSuccess") — CALLBACK_SUCCESS in ConstantsLib. */
const CALLBACK_SUCCESS = ethers.keccak256(ethers.toUtf8Bytes("covenant.callbackSuccess"));

const TICK_SPACING = 4n;

/** Turn the JSON offer back into the positional tuple the ABI encoder wants. */
function toTuple(o) {
  return [
    [
      o.market.loanToken,
      o.market.collateralParams.map((c) => [c.token, c.lltv, c.maxLif, c.oracle]),
      o.market.maturity,
      o.market.rcfThreshold,
      o.market.entryGate,
      o.market.seizureGate,
    ],
    o.buy,
    o.maker,
    o.start,
    o.expiry,
    o.tick,
    o.group,
    o.callback,
    o.callbackData,
    o.receiverIfMakerIsSeller,
    o.notary,
    o.reduceOnly,
    o.maxUnits,
    o.maxAssets,
  ];
}

/**
 * Checks that hold without touching the chain. Cheap, and they localize a
 * failure to the signer rather than to the deployment.
 */
function offlineChecks(entry, seenGroups) {
  const problems = [];
  const o = entry.offer;

  const [sig, root, leafIndex, proof] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["tuple(uint8 v, bytes32 r, bytes32 s)", "bytes32", "uint256", "bytes32[]"],
    entry.notaryData,
  );

  // The notary hashes the offer itself and compares against the embedded root,
  // so a mismatch here is an InvalidProof() on-chain.
  if (root !== hashOffer(o)) problems.push("root != hashOffer(offer)");
  if (proof.length !== 0) problems.push(`expected a single-leaf tree, got proof.length=${proof.length}`);
  if (leafIndex !== 0n) problems.push(`expected leafIndex=0, got ${leafIndex}`);

  // The signature is over OfferTree(Offer offerTree), not over the Offer.
  const { TYPES } = require("./sign_offer");
  const recovered = ethers.verifyTypedData(
    { chainId: 10143, verifyingContract: o.notary },
    { CollateralParams: TYPES.CollateralParams, Market: TYPES.Market, Offer: TYPES.Offer, OfferTree: TYPES.OfferTree },
    { offerTree: o },
    ethers.Signature.from({ v: Number(sig.v), r: sig.r, s: sig.s }),
  );
  if (recovered.toLowerCase() !== o.maker.toLowerCase()) {
    problems.push(`signature recovers ${recovered}, not maker ${o.maker}`);
  }

  // fillOffer reverts with TickNotAccessible if the tick is off the grid.
  if (BigInt(o.tick) % TICK_SPACING !== 0n) problems.push(`tick ${o.tick} is not a multiple of ${TICK_SPACING}`);

  // consumed[maker][group] is shared, so a repeated group silently couples budgets.
  if (seenGroups.has(o.group)) problems.push(`group ${o.group} is reused`);
  seenGroups.add(o.group);

  if (BigInt(o.expiry) <= BigInt(Math.floor(Date.now() / 1000))) problems.push("already expired");

  return { problems, root };
}

async function main() {
  const rpc = process.env.RPC_URL;
  if (!rpc) throw new Error("RPC_URL env var is required");

  const bookPath = path.join(__dirname, "..", "frontend", "src", "config", "offerBook.json");
  const book = require(bookPath);

  const provider = new ethers.JsonRpcProvider(rpc);
  const notaryAddress = book[0].offer.notary;
  const notary = new ethers.Contract(notaryAddress, NOTARY_ABI, provider);

  // Ask the notary who it trusts rather than assuming the .env value is current.
  const covenant = await notary.COVENANT();
  console.log(`Notary   ${notaryAddress}`);
  console.log(`COVENANT ${covenant}  (used as msg.sender — isNotarized requires it)\n`);

  let failures = 0;
  // Shared across the loop: group reuse is a property of the book as a whole,
  // so the check only means anything if the set outlives a single offer.
  const seenGroups = new Set();

  for (const entry of book) {
    const { problems, root } = offlineChecks(entry, seenGroups);

    let onchain;
    try {
      const result = await notary.isNotarized.staticCall(toTuple(entry.offer), entry.notaryData, { from: covenant });
      onchain = result === CALLBACK_SUCCESS ? "ACCEPTED" : `WRONG MAGIC ${result}`;
    } catch (e) {
      const data = e?.data ?? e?.info?.error?.data ?? "";
      onchain = `REVERT ${data || e.shortMessage || e.message}`;
    }

    const canceled = await notary.isRootCanceled(entry.offer.maker, root);
    if (canceled) problems.push("root has been canceled");

    const ok = onchain === "ACCEPTED" && problems.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? "✓" : "✗"} ${entry.id.padEnd(16)} ${onchain}`);
    for (const p of problems) console.log(`    ! ${p}`);
  }

  // Group uniqueness is enforced per-offer above via the shared seenGroups set.

  console.log(failures === 0 ? `\nALL ${book.length} OFFERS FILLABLE` : `\n${failures} PROBLEM(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
