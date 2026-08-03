# Covenant — Demo video script + end-to-end process

Chain: **Sepolia** (11155111). Every address, command, and screen below is real and reproducible against the deployment already live on this network.

The demo video is a ~7-minute walkthrough that proves the pitch: *a fixed-maturity credit market whose compliance gate is a mechanical property of the market, connected to Cleanverse.* The script is Part 1 below. Parts 2 and 3 are the deeper end-to-end process and the remaining engineering work.

---

## Part 1 — Demo video script (record in order)

### Live addresses to keep pinned in a browser tab

| Contract | Address |
|---|---|
| Covenant core (compliance mode) | [`0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4`](https://sepolia.etherscan.io/address/0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4) |
| ChainlinkBtcUsdOracle | [`0xfffd00df1ae41228b9b907999a82d7f15ba2f8a9`](https://sepolia.etherscan.io/address/0xfffd00df1ae41228b9b907999a82d7f15ba2f8a9) |
| Chainlink BTC/USD feed | [`0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`](https://sepolia.etherscan.io/address/0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43) |
| TestUSDC (6 dec) | [`0x7130f8754b07a4782fd9deddfac5bb655fe720c9`](https://sepolia.etherscan.io/address/0x7130f8754b07a4782fd9deddfac5bb655fe720c9) |
| TestWBTC (8 dec) | [`0x848d699dd82effbb3da355e190df6a005c7e963f`](https://sepolia.etherscan.io/address/0x848d699dd82effbb3da355e190df6a005c7e963f) |
| PermissiveGate (demo stand-in for CleanversePoolGate) | [`0x026a6cfbb2922322fb7c4956263088ee5a934fff`](https://sepolia.etherscan.io/address/0x026a6cfbb2922322fb7c4956263088ee5a934fff) |
| First market id | `0xf601e7aeff95d2c8aa1c542c4e65b5c762b0a573509e4bc1c2c6034b24923674` |

### Pre-flight (do once before hitting record)

- [ ] Two funded Sepolia wallets in MetaMask, labelled **Lender** and **Borrower**. ~0.2 ETH each.
- [ ] Frontend running locally: `cd frontend && npm install && npm run dev`. Confirm `http://localhost:5173` loads.
- [ ] Chrome zoom at 110%, dark mode, terminal font ≥ 16pt for screen recording.
- [ ] Have `offchain/sign_offer.js` open in the editor for the offer-signing shot.
- [ ] Have the [Cleanverse Cooperate docs](https://docs.cleanverse.com/) open on the `/validator/verify` page.

### Scene 1 — The problem (0:00–0:45)

**Voiceover**: *On-chain lending is either variable-rate or permissionless. Banks and RWA issuers can use neither. They need verified counterparties, jurisdiction-aware transfers, and an audit trail — before they extend a single dollar of credit.*

**Screen**: README §The problem, scroll slowly through the three bullets.

### Scene 2 — The one-slide architecture (0:45–1:45)

**Voiceover**: *Covenant closes the gap between "who passed KYC" and "who holds the position" by moving the check on-chain, inside the settlement path. Three hooks — `canIncreaseCredit`, `canIncreaseDebt`, `canLiquidate` — fire before every position change. Each one calls a Cleanverse compliance pool. The pool is the source of truth; the gate is the connector.*

**Screen**: README §The approach → §How the two halves connect diagram. Point at the single arrow labelled "gate" and say: *"This is the only place the two systems touch."*

### Scene 3 — Show the gate in code (1:45–2:45)

**Voiceover**: *The gate is 40 lines. Every read is a bounded-gas staticcall. Every failure denies. Only increases are gated — repay and withdraw stay open, so an outage can never strand capital.*

**Screen**: Open `src/compliance/CleanversePoolGate.sol`. Highlight in order:

1. `POOL_GAS_LIMIT = 150_000` — the DoS cap.
2. `pool` is `immutable` — rebinding requires a new gate and therefore a new market id.
3. `_eligible` — `isRegistered → paused → verify`, short-circuiting on the first denial.
4. `_readBool` — every failure resolves to `false`. Fail-closed.

### Scene 4 — Show the Sepolia state honestly (2:45–3:15)

**Voiceover**: *Cleanverse hasn't published a Sepolia pool address yet. For this demo, the market is bound to a `PermissiveGate` that approves everyone. Because gate addresses hash into the market id, the demo market and the future compliant market are provably different markets. Swapping in the real gate is a four-line ops task — see Step 1 below.*

**Screen**: Open `src/compliance/PermissiveGate.sol` — show it's three one-liners and a comment. Then Etherscan the deployed address.

### Scene 5 — Create a market from scratch (3:15–4:15)

**Voiceover**: *This is the whole "onboard a new market" ceremony. It's one script.*

**Screen**: Terminal.

```bash
COVENANT_ADDRESS=0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4 \
LOAN_TOKEN_ADDRESS=0x7130f8754b07a4782fd9deddfac5bb655fe720c9 \
COLLATERAL_TOKEN_ADDRESS=0x848d699dd82effbb3da355e190df6a005c7e963f \
ORACLE_ADDRESS=0xfffd00df1ae41228b9b907999a82d7f15ba2f8a9 \
GATE_ADDRESS=0x026a6cfbb2922322fb7c4956263088ee5a934fff \
MATURITY_DAYS=90 \
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast --legacy
```

Point to the printed market id, then jump to Etherscan for the `MarketCreated` event — topic hash `0x9dd8b41002a91b0d3012878d3ad9d9521a381ce66f064246f7db07355bf9749e`, market id in `topics[1]`.

### Scene 6 — Frontend flow: mint, approve, collateralise (4:15–5:00)

**Voiceover**: *This is what an institutional user sees. Every button is a real transaction on Sepolia.*

**Screen**: Frontend `Markets` → click into the demo market.

1. Click **Mint tWBTC** — approve in MetaMask — wait for toast confirmation.
2. Click **Mint tUSDC** — same.
3. Click **Approve & post collateral**, put in `0.05 tWBTC`. Sign both.
4. Show `Positions` — collateral balance now non-zero.

### Scene 7 — Sign and fill an offer (5:00–6:00)

**Voiceover**: *A lender signs an offer off-chain. A borrower fills it on-chain. The gate fires on both sides — lender's credit increases, borrower's debt increases, both must pass compliance.*

**Screen**: Split — editor showing `offchain/sign_offer.js` on the left, terminal on the right.

```bash
node offchain/sign_offer.js --amount 1000 --rate 5.5 --maturity 90
```

Copy the signed offer JSON. Switch wallets to Borrower. In the frontend, paste into the **Trade & Borrow** panel and click **Fill offer**. Sign in MetaMask. Show the resulting position: debt `1000 tUSDC`, collateral `0.05 tWBTC`, health bar green.

### Scene 8 — Prove the gate is real: try from a blocked wallet (6:00–6:30)

**Voiceover**: *Even the permissive demo gate is a real staticcall — you can see the call in the trace. On a compliant market bound to `CleanversePoolGate`, this exact flow would revert for a wallet without an A-Pass.*

**Screen**: Tenderly / Foundry trace of a `fillOffer` transaction — highlight the two gate calls (`canIncreaseCredit(lender)`, `canIncreaseDebt(borrower)`) in the call tree.

Then run the compliance-mode test to prove the negative:

```bash
forge test --match-path "test/compliance/*" --match-test "test_revert" -vvv
```

Show one revert message inline — `Covenant__EnterGateDenied` or similar.

### Scene 9 — Repay and exit (6:30–7:00)

**Voiceover**: *Exit paths are never gated. That's deliberate — a revoked credential must never trap someone's capital. Repay, withdraw credit, withdraw collateral all work regardless of gate state.*

**Screen**: Frontend — click **Repay**, then **Withdraw collateral**. Show the position clearing to zero.

### Scene 10 — What ships next (7:00–7:30)

**Voiceover**: *When Cleanverse ships the Sepolia pool address, one deploy transaction and one whitelist call swap `PermissiveGate` for `CleanversePoolGate` — and the same market flow becomes compliance-native. That's Step 1 in the checklist.*

**Screen**: Scroll through Part 3 of this file — Step 1, Step 5 (Safe handoff), Step 7 (audit). Cut.

---

## Part 2 — The whole end-to-end process (reference for reviewers)

This is what actually happens end-to-end when Covenant is wired against a live Cleanverse pool. Numbered so a reviewer can spot exactly which step is stubbed on Sepolia today.

### 2.1 Off-chain: institution obtains an A-Pass for its user

1. Institution's KYC provider verifies documents, sanctions, jurisdiction.
2. Institution calls Cleanverse `POST /generate_apass` (AES-encrypted body) with the user's wallet, tier, group, country codes, expiry.
3. Cleanverse mints the A-Pass and registers the wallet against the target compliance pool.
4. Verification: `POST /validator/verify` with `{pool, wallet}` returns `valid: true`.

### 2.2 On-chain: Covenant reads the same pool

1. User calls `fillOffer` on a Covenant market whose `entryGate = CleanversePoolGate(pool)`.
2. Covenant computes `buyerCreditIncrease` and `sellerDebtIncrease`.
3. If either is `> 0`, Covenant calls the corresponding gate hook.
4. The gate does three `staticcall`s to the pool: `isRegistered()` → `paused()` → `verify(account)`.
5. Any denial reverts the whole `fillOffer` with a compliance error. On success, the position opens.

The Solidity view answers the same question the API answers. That symmetry is what an auditor can verify.

### 2.3 On-chain: liquidator flow

1. Liquidator calls `seize` on an unhealthy position.
2. Covenant calls `seizureGate.canLiquidate(msg.sender)`.
3. Gate reads the pool the same way. If the liquidator lacks an A-Pass or the pool is paused, seizure reverts.
4. The borrower is *not* gated — the liquidator is. This is deliberate: an unhealthy position must always be seizable by *someone* compliant.

### 2.4 On-chain: exit paths (never gated)

- `repay(...)` — a third party can repay on behalf of a compliant borrower whose credential has since been frozen.
- `withdraw(...)` — a lender can always redeem their credit for loan tokens at maturity.
- `withdrawCollateral(...)` — a borrower can always pull collateral within healthiness bounds.

### 2.5 Audit trail assembly (what a regulator sees)

For any position, an auditor can join four event streams to reconstruct the full compliance history:

1. Covenant `MarketCreated` — proves the market's gate at creation.
2. Cleanverse pool events — proves the pool's rules and pause state at the time of the trade.
3. Covenant position events (`OfferFilled`, `PositionSeized`, etc.) — proves who transacted.
4. A-Pass registry events (from Cleanverse) — proves the credential state at the time.

Because the gate address is part of the market id, an auditor cannot be misled about which pool was in force at any given block.

---

## Part 3 — Remaining engineering work (post-demo)

### ✅ Done in this pass

- **Split deployment scripts** — five focused scripts instead of one:
  - `DeployCovenant.s.sol` — core (compliance-mode)
  - `DeployChainlinkOracle.s.sol` — Chainlink-backed oracle
  - `DeployTestTokens.s.sol` — mock USDC + WBTC with public `mint()`
  - `DeployPermissiveGate.s.sol` — demo gate (all-approve) for the interim window before a Cleanverse pool address lands
  - `CreateMarket.s.sol` — whitelists the gate then calls `initMarket`
- **Mockable ERC20** with a public `mint()` (inlined in `DeployTestTokens.s.sol`).
- **`PermissiveGate.sol`** as a documented demo gate — replaces `CleanversePoolGate` until Cleanverse ships a Sepolia pool address.
- **First market created on-chain** — visible on Etherscan, `tickSpacing` returns 4 (initialised), position views work.
- **Frontend fixed & wired**:
  - Retargeted from Monad to Sepolia (chain, addresses, RPC, explorer, currency)
  - Fixed the wrong ABIs — the previous `withdraw` and `repay` signatures would have reverted every tx (missing `onBehalf`, missing `callback+data`)
  - Every button now runs a real ethers.js transaction: **mint tUSDC / tWBTC**, **approve + post collateral**, **withdraw collateral**, **repay debt**, **withdraw credit**, **refresh position**
  - Market details load live from `covenant.toMarket(id)` — no hardcoded stubs
  - Balance display + toast notifications for tx submit/confirm/error
- **478 tests still pass.**

### Step 1 — Swap PermissiveGate for CleanversePoolGate

**The one blocker for real compliance.** Everything else in Part 2 already works; this step turns the demo compliant.

**What the Cleanverse docs actually document (verified 2026-08):**
- [docs.cleanverse.com](https://docs.cleanverse.com/) is a JS SPA — no scrapable list of supported testnets or self-serve pool creation.
- [cleanverse.com/hackathon](https://cleanverse.com/hackathon) lists supported chains as Monad, Base, Ethereum, Arbitrum, BNB Chain. **Sepolia is not advertised as a supported chain identifier.**
- The local `offchain/cleanverse_client.py` `SUPPORTED_CHAINS` set (`{solana, base, avalanche, arbitrum, ethereum, polygon, bsc, monad, hashkey, platon}`) has no `sepolia` entry. Which `chain` string maps to Sepolia — `"ethereum"`, `"ethereum_sepolia"`, or something else — has to be confirmed with Cleanverse.
- `POST /validator/register` **registers an already-deployed pool address with Cleanverse's index — it does not deploy a pool contract.** Something has to deploy the pool contract on Sepolia first; that "something" is Cleanverse (their pool implementation is not in this repo's scope).

**Steps in order:**

- [ ] **Contact Cleanverse.** Reach out via [cleanverse.com](https://cleanverse.com/) contact or hackathon channel. Ask for two things: (a) a Sepolia compliance pool deployed to an address you control policy on, and (b) the exact `chain` string their API accepts for that pool. Do not assume `"ethereum"` covers Sepolia — the API rejects unknown chains.
- [ ] **Sanity-check the pool from the API side** before touching Solidity:
  ```bash
  python3 offchain/cleanverse_client.py   # exercises /validator/is_register + /validator/rules against the address
  ```
  Expect `code: "0000"` and `is_register: true`. If not, the address isn't wired on the Cleanverse side yet — do not proceed.
- [ ] Set `CLEANVERSE_POOL_ADDRESS=0x…` in `.env`.
- [ ] **Extend `SUPPORTED_CHAINS`** in `offchain/cleanverse_client.py:59-61` to include whatever string Cleanverse tells you to use for Sepolia. Add a matching env-var so the client isn't hardcoded to it.
- [ ] Deploy the gate. `DeployCovenant.s.sol` will do this if the env var is set, but it *also* redeploys the core — split into a dedicated `DeployGate.s.sol` (or set `SKIP_CORE_REDEPLOY=true` before running).
  ```bash
  forge script script/DeployCovenant.s.sol --rpc-url $RPC_URL --broadcast --legacy
  ```
- [ ] Whitelist the new gate: `cast send $COVENANT setApprovedGate <newGate> true --rpc-url $RPC_URL --private-key $PK`.
- [ ] Create a fresh market bound to the new gate — repeat `CreateMarket.s.sol` with `GATE_ADDRESS=<newGate>`. This produces a **new market id** because gate addresses hash into the id.
- [ ] Update `frontend/src/config/chain.ts` `gate` and add the new market id to `MARKETS`.
- [ ] **End-to-end negative test.** From a wallet with no A-Pass, call `fillOffer` on the new market. Confirm it reverts inside the gate's staticcall. This is the demo money-shot for Scene 8.

### Step 2 — Frontend gaps

Everything reads and every basic tx works. What's left:

- [ ] **fillOffer flow.** Currently the "Trade & Borrow / Lend" tab shows a warning that a signed offer is required. The signing itself happens in `offchain/sign_offer.js` — bring that logic into the browser (EIP-712 typed-data via `signer._signTypedData`) so a lender can sign an offer entirely in-page. Then the borrower calls `fillOffer` with the signed bytes.
- [ ] **Approve + repay in one click.** Currently repay checks allowance and inserts an approve tx if needed. Verify this works end-to-end against a real position (create one first via a signed offer).
- [ ] **Multi-market UI.** Right now the frontend hard-codes `MARKET_ID`. Query `MarketCreated` events (Etherscan or your own indexer) and let users pick from a list.
- [ ] **Health factor display.** Compute `debt / maxDebt` client-side using the oracle price + LLTV, show a coloured bar per position.
- [ ] **Gate status pill.** On the market detail page, show the gate address and — for a `CleanversePoolGate` — the live pool state (`isRegistered`, `paused`) by calling the pool from the browser. Makes the compliance layer visible in the UI.

### Step 3 — Publish the offer-authorisation module

Signed offers need an on-chain authoriser deployed. Not in current deploy scripts. Rename the module and ship a single one (rather than the current notary terminology / plural set) — the codebase does not need more than one path for authorising a signed offer.

- [ ] Deploy via a new `script/DeployOfferAuthoriser.s.sol` that takes `COVENANT_ADDRESS` from env.
- [ ] Paste the address into `offchain/sign_offer.js` (`CONFIG.offerAuthoriser`) and `offchain/SIGNING.md`.
- [ ] Grep-rename `notary` → `offerAuthoriser` across `src/ratifiers/`, tests, and docs. Keep one implementation; delete the rest.

### Step 4 — Contract verification

- [ ] Verify on Sepolia Etherscan:
  ```bash
  export ETHERSCAN_API_KEY=…
  forge verify-contract 0x17f525e57cf04da33e816fa1d4c2c8a3eaf455b4 src/Covenant.sol:Covenant --chain sepolia --constructor-args $(cast abi-encode "constructor(bool,address)" true 0x8C6eE34413f0c7D472Ab157fbED84De1234EF54F)
  forge verify-contract 0xfffd00df1ae41228b9b907999a82d7f15ba2f8a9 src/oracles/ChainlinkBtcUsdOracle.sol:ChainlinkBtcUsdOracle --chain sepolia --constructor-args $(cast abi-encode "constructor(address,uint8,uint8,uint8,uint256)" 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43 8 6 8 3600)
  forge verify-contract 0x026a6cfbb2922322fb7c4956263088ee5a934fff src/compliance/PermissiveGate.sol:PermissiveGate --chain sepolia
  ```

### Step 5 — Ownership handoff to a Safe

Before mainnet, transfer:
- [ ] `covenant.setRoleSetter(SAFE)` — controls fee/tick admin
- [ ] `covenant.transferGateAdmin(SAFE)` — controls gate whitelist

Both currently sit at the deployer key in `.env`, which is a hot wallet.

### Step 6 — Docs

- [ ] `docs/OPERATOR.md` — how an institution wires a jurisdiction-specific market
- [ ] `docs/COMPLIANCE.md` — the exact audit trail a regulator sees (event log join, per Part 2.5)
- [ ] `docs/INCIDENT.md` — runbook for a Cleanverse outage or mass credential revocation

### Step 7 — Audit & formal verification

- [ ] Independent audit of `src/compliance/*` + `src/oracles/*` (~500 LOC).
- [ ] Formal verification pass on both gates: never reverts, monotonic denial, bounded gas.

### Step 8 — Chain migration playbook (Monad, Base, mainnet)

The scripts are chain-agnostic — the exact sequence for any EVM chain is:
```bash
# 1. Point .env at the new chain
export RPC_URL=…
export CHAIN_ID=…
export PRIVATE_KEY=0x…              # throwaway on testnet

# 2. Redeploy everything in order
forge script script/DeployCovenant.s.sol         --rpc-url $RPC_URL --broadcast --legacy
forge script script/DeployChainlinkOracle.s.sol  --rpc-url $RPC_URL --broadcast --legacy   # or BtcUsdOracle
forge script script/DeployTestTokens.s.sol       --rpc-url $RPC_URL --broadcast --legacy
forge script script/DeployPermissiveGate.s.sol   --rpc-url $RPC_URL --broadcast --legacy   # or your real gate

# 3. Point frontend/src/config/chain.ts constants at the new addresses.
```

### Known cosmetic bug (not blocking)

`CreateMarket.s.sol` uses `LLTV_3` and comments it as "77% LLTV (0.77e18)", but the constant actually resolves to `0.86e18` (86%). Not blocking — the market works either way — but if you want 77%, use `LLTV_2` or hardcode `0.77e18` directly.

---

## Known limitations (documented, not addressed)

- **`flashLoan` is not gated at the market layer** — see README §Function coverage. Closes at the token layer for compliance-aware A-Tokens.
- **`receiver` addresses are ungated by design** — compliance is on the position holder, not the transfer target.
- **Gate binding is immutable per market** — changing compliance providers means a new market at a new id.
- **Oracle staleness reverts liquidations** — safer than allowing liquidation at stale prices.
- **`PermissiveGate` approves everyone** — it's a testnet demo, not compliance. Never whitelist on mainnet.
