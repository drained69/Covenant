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