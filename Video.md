# Covenant — Demo video script + end-to-end process

Chain: **Monad testnet** (10143). Every address, command, and screen below is real and reproducible against the deployment already live on this network.

The demo video is a ~7-minute walkthrough that proves the pitch: *a fixed-maturity credit market whose compliance gate is a mechanical property of the market, connected to Cleanverse CCP V2.* The script below shows the working compliance-gated market with live A-Pass verification.

---

## Part 1 — Demo video script (record in order)

### Live addresses to keep pinned in a browser tab

| Contract | Address |
|---|---|
| Covenant core (compliance mode) | [`0xcdc06aae7617c3b6f44cc1f2a9a7163252d8a797`](https://testnet.monadexplorer.com/address/0xcdc06aae7617c3b6f44cc1f2a9a7163252d8a797) |
| BtcUsdOracle (owner-push, STALENESS=0) | [`0x2E09f0566A87Bb27615873aBCF18855d37b000F9`](https://testnet.monadexplorer.com/address/0x2E09f0566A87Bb27615873aBCF18855d37b000F9) |
| Test USDC (6 dec) | [`0x7dbe32f1e1d3db45123f60ec5a79312863a7e279`](https://testnet.monadexplorer.com/address/0x7dbe32f1e1d3db45123f60ec5a79312863a7e279) |
| Test WBTC (8 dec) | [`0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad`](https://testnet.monadexplorer.com/address/0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad) |
| CleanversePoolGate (Ownable) | [`0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c`](https://testnet.monadexplorer.com/address/0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c) |
| IAPassComplianceValidator (CCP V2) | [`0xaC7e5179C2C7f03f209136886c172eb34F161792`](https://testnet.monadexplorer.com/address/0xaC7e5179C2C7f03f209136886c172eb34F161792) |
| EcrecoverNotary (EIP-712 offers) | [`0xc35B4e48940D68Dd449d19D3657e754632CC873C`](https://testnet.monadexplorer.com/address/0xc35B4e48940D68Dd449d19D3657e754632CC873C) |
| First market id | `0xb6f650917d8ca609c9b53e75f5adf5c1110a063d3360be24c941d81248a48e7c` |

### Pre-flight (do once before hitting record)

- [ ] Two funded Monad testnet wallets in MetaMask, labelled **Lender** and **Borrower**. ~1 MON each for gas.
- [ ] Backend running: `cd offchain && npm install ethers@6 && python3 server.py` (port 3001). Leave running.
- [ ] Frontend running: `cd frontend && npm install && npm run dev` (port 5173). Confirm `http://localhost:5173` loads.
- [ ] Chrome zoom at 110%, dark mode, terminal font ≥ 16pt for screen recording.
- [ ] Have `offchain/sign_offer.js` open in the editor for the offer-signing shot.
- [ ] Have the [Cleanverse Cooperate docs](https://docs.cleanverse.com/) open on the `/validator/verify` page.

### Scene 1 — The problem (0:00–0:45)

**Voiceover**: *On-chain lending is either variable-rate or permissionless. Banks and RWA issuers can use neither. They need verified counterparties, jurisdiction-aware transfers, and an audit trail — before they extend a single dollar of credit.*

**Screen**: README §The problem, scroll slowly through the three bullets.

### Scene 2 — The one-slide architecture (0:45–1:45)

**Voiceover**: *Covenant closes the gap between "who passed KYC" and "who holds the position" by moving the check on-chain, inside the settlement path. Three hooks — `canIncreaseCredit`, `canIncreaseDebt`, `canLiquidate` — fire before every position change. Each one calls Cleanverse's CVI Compliance Validator. The validator is the source of truth; the gate is the connector.*

**Screen**: README §The approach → §How the two halves connect diagram. Point at the single arrow labelled "gate" and say: *"This is the only place the two systems touch."*

Mention the two integration paths on the same slide: **Path A** is `CleanversePoolGate`, which calls the validator directly — that's what's live today. **Path B** is `CovenantGate` + `CovenantRegistry`, an attestation registry for issuers who want to cache verdicts on-chain rather than staticcall out on every fill.

### Scene 3 — Show the gate in code (1:45–2:45)

**Voiceover**: *The gate is small enough to read on screen. Every read is a bounded-gas staticcall. Every failure denies. Only increases are gated — repay and withdraw stay open, so an outage can never strand capital.*

**Screen**: Open `src/compliance/CleanversePoolGate.sol`. Highlight in order:

1. `VALIDATOR_GAS_LIMIT = 150_000` — the DoS cap on every read.
2. `validator` is `immutable` — rebinding requires a new gate and therefore a new market id.
3. `_eligible` — two reads, `isRegistered(gate)` then `complianceVerify(gate, account)`, short-circuiting on the first denial. CCP V2 folds the pause check into `complianceVerify`, so there is no separate `paused()` call.
4. `_readBool` — a revert, a short return, or a no-code address all resolve to `false`. Fail-closed.
5. `owner` + `setRule`/`addRule`/`removeRule` — the gate forwards `RuleV2` management to the validator, and `transferOwnership` hands the gate to a Safe without touching any market.

### Scene 4 — The compliance path is live (2:45–3:15)

**Voiceover**: *This gate is bound to a real validator. Cleanverse CREATE2-deploys the CVI Compliance Validator to the same address on every chain it supports, so the Monad deployment reaches the same contract as mainnet would. The gate is registered with Cleanverse in single-contract mode, which means `complianceVerify` returns a real A-Pass verdict for any wallet we pass it.*

**Screen**: Open the frontend `/compliance` page, **My status** tab. Walk down the rows on screen — Wallet, Validator, Pool-gate, `isRegistered(pool)`, `complianceVerify(pool, wallet)`, and the resulting **Gate verdict**: `ELIGIBLE` or `DENIED`.

Say the important part out loud: *those two rows are not a UI approximation — `useCompliance` runs the exact same two staticcalls the gate runs, with `allowFailure` so a reverting read shows as `false` instead of an error. What you see on this page is what the settlement path will decide.*

### Scene 5 — Create a market from scratch (3:15–4:15)

**Voiceover**: *This is the whole "onboard a new market" ceremony. It's one script, and it whitelists the gate on the way through.*

**Screen**: Terminal.

```bash
COVENANT_CORE_ADDRESS=0xcdc06aae7617c3b6f44cc1f2a9a7163252d8a797 \
TEST_USDC_ADDRESS=0x7dbe32f1e1d3db45123f60ec5a79312863a7e279 \
TEST_WBTC_ADDRESS=0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad \
COVENANT_ORACLE_ADDRESS=0x2E09f0566A87Bb27615873aBCF18855d37b000F9 \
COVENANT_GATE_ADDRESS=0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c \
MATURITY_TIMESTAMP=1820000000 \
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast --legacy
```

Point to the printed **Market ID**, **LLTV** (86%), and **Compliance Gate**, then jump to the explorer for the `MarketCreated` event with the market id in `topics[1]`.

Call out why `MATURITY_TIMESTAMP` is pinned rather than using the `MATURITY_DAYS` fallback: market ids are content-addressed, so a `block.timestamp`-relative maturity produces a different id on every run and the frontend's pinned id stops resolving.

If the gate needs deploying first, that's its own one-liner — `script/DeployCleanverseGate.s.sol` deploys it, calls `setApprovedGate(gate, true)`, and prints the Cleanverse registration step.

### Scene 6 — Frontend flow: mint, approve, collateralise (4:15–5:00)

**Voiceover**: *This is what an institutional user sees. Every button is a real transaction on Monad testnet.*

**Screen**: Frontend `/faucet` → then `Markets` → click into the demo market.

1. On `/faucet`, click **Mint tWBTC** — confirm in MetaMask — wait for the toast.
2. Click **Mint tUSDC** — same. Read the line under the panel out loud: *minting is permissionless and needs no A-Pass; opening a position does.*
3. Into the market, **Post collateral** tab, `0.05 tWBTC`. Sign the approve, then the deposit.
4. Show `Positions` — collateral balance now non-zero.

The same faucet panel is also a tab inside the market action panel, so a user who runs short mid-flow never has to navigate away.

### Scene 7 — Sign and fill an offer (5:00–6:00)

**Voiceover**: *A lender signs an offer off-chain. A borrower fills it on-chain. The gate fires on both sides — the lender's credit increases, the borrower's debt increases, both must pass compliance.*

**Screen**: Split — editor showing `offchain/sign_offer.js` on the left, terminal on the right.

```bash
cd offchain && PRIVATE_KEY=$PRIVATE_KEY node sign_offer.js --buy --units 1000000000 --expiry 3600
```

Point at the `MARKET` struct in the file while it runs and say why it matters: *every field here has to equal the on-chain market byte for byte, because the id is the hash of the struct. One wrong field addresses a different, uninitialized market and the fill reverts.*

Then show the same thing arriving through the app rather than by copy-paste: the offer book on the market page is served by `GET /api/offers`, which shells out to this exact script through `offchain/server.py`, so the offers on screen carry real EIP-712 signatures and settle on-chain. Switch to the Borrower wallet, open the **Take offer** tab, fill it, sign in MetaMask. Show the resulting position: debt in tUSDC, collateral `0.05 tWBTC`, health bar green.

### Scene 8 — Prove the gate is real (6:00–6:30)

**Voiceover**: *The gate is not decoration. Both sides of a fill are checked, and a wallet without a valid A-Pass cannot open a position at all.*

**Screen**: Foundry trace of a `fillOffer` transaction — highlight the two gate calls (`canIncreaseCredit(lender)`, `canIncreaseDebt(borrower)`) in the call tree. Then run the compliance suite to prove the negative:

```bash
forge test --match-path "test/compliance/*" -vvv
```

Call out the tests that carry the argument, by name:

- `test_take_revertsWhenOnlyLenderVerified` / `test_take_revertsWhenOnlyBorrowerVerified` / `test_take_succeedsWhenBothVerified` — both counterparties, not one.
- `test_take_revertsWhenPoolUnregistered` / `test_take_revertsWhenPoolReverting` / `test_pausedPool_deniesEvenVerifiedWallet` — fail-closed on every validator failure mode.
- `test_repay_stillWorksAfterVerificationRevoked` — the exit path stays open after revocation.
- `test_initMarket_revertsIfEntryGateNotWhitelisted` / `test_initMarket_revertsIfEntryGateZero` — compliance mode refuses to create an ungated market.
- `test_revokingGate_doesNotInvalidateExistingMarkets` — de-listing a gate cannot retroactively break live positions.

Show one revert inline — `LenderIneligible()` or `BorrowerIneligible()`.

If there's time, one extra beat worth 15 seconds: `WrappedAToken` is a 1:1 compliance-gated ERC-20 wrapper that closes the `flashLoan` surface at the token layer with `RecipientNotCompliant` — `test/compliance/WrappedATokenFlashLoanTest.sol` is the proof.

### Scene 9 — Repay and exit (6:30–7:00)

**Voiceover**: *Exit paths are never gated. That's deliberate — a revoked credential must never trap someone's capital. Repay, redeem credit, and pull collateral all work regardless of gate state.*

**Screen**: Frontend — **Repay debt**, then **Pull collateral**. Show the position clearing to zero.

### Scene 10 — What ships next (7:00–7:30)

**Voiceover**: *The compliance path is live end to end: a real validator, a registered gate, and A-Pass issuance from inside the app. What's next is production hardening — a real maker running the offer book instead of a demo signer, deeper Cleanverse integration, and moving gate ownership to a Safe.*

**Screen**: The `/compliance` page **Get verified** tab — walk through the wizard once (wallet, legal name, document type, document number, issuing country, review) so the audience sees the credential can be issued from inside the app via `POST /api/generate-apass`. Then the **Check any wallet** tab to show any address can be checked against any validator and gate. Cut.

---

## Notes for the presenter

- `owner` on the gate is mutable via `transferOwnership`, but registration with Cleanverse is a personal-sign by that owner over `chain + gate address`. Move ownership to a Safe *after* recording, not before — a Safe cannot produce that personal-sign as easily.
- The oracle is owner-push, not Chainlink: Monad has no Chainlink feeds. Push a price with `setPrice` before recording. `STALENESS=0` means a pushed price never expires — the earlier oracle at `0x41244829…` used a one-hour window, which made every `fillOffer` revert with `StalePrice()` an hour after the last push. That fix changed the oracle address, which changed the market id.
- If addresses ever disagree between files, `frontend/src/config/chain.ts` is the source of truth. `deployments/monad.log` is the historical record of the first deploy and predates the oracle swap.
- `docs/CoreMath.md` is the place to point anyone who asks how rates and liquidation actually compute.