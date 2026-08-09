# Covenant

**Compliance-native infrastructure for institutional on-chain credit.**

Covenant makes fixed-rate, fixed-maturity credit markets usable by regulated institutions. It combines a fixed-maturity credit engine with a gate layer that enforces identity verification, jurisdictional policy, and sanctions screening *inside* the market's own access-control path — not as an off-chain side process.

Live on **Monad Testnet** (chain id `10143`) against Cleanverse's CVI Compliance Validator. Addresses are in [Deployment](#deployment); the running interface is under [`frontend/`](#getting-started).

---

## Contents

| Section | What it answers |
|---------|-----------------|
| [The problem](#the-problem) · [The approach](#the-approach) | Why an on-chain gate exists at all |
| [Architecture](#architecture) | The four layers and how they talk to each other |
| [Compliance layer](#compliance-layer) | The two integration paths and what they share |
| [Function coverage](#function-coverage) | Exactly which calls are gated, and which are deliberately not |
| [Core formulas](#core-formulas) | Market identity, oracle scaling, health, liquidation, fees |
| [The credit ladder](#the-credit-ladder) | How a credential is priced into leverage |
| [Roadmap](#roadmap) | What is unbuilt: which Cleanverse call each item consumes and where its verdict lands on-chain |
| [Deployment](#deployment) | Live addresses, integration status, repository layout |
| [Getting started](#getting-started) | Build, test, run the frontend, run the off-chain services |
| [Design choices](#design-choices) | Fifteen decisions, each with its trade-off stated |

---

## The problem

On-chain lending today is either variable-rate or permissionless. Neither is usable by a bank, a tokenized-deposit provider, or an RWA issuer. Those institutions need three things before they can extend credit on-chain:

1. **Verified counterparties** — they cannot legally lend to unscreened wallets.
2. **Jurisdiction-aware transfer rules** — every position change must clear sanctions and Travel Rule policy.
3. **Extractable audit trails** — regulators must be able to reconstruct who lent to whom, under what terms.

The standard industry answer is to bolt KYC on as an off-chain gate: a database checked before a transaction, disconnected from settlement, invisible to auditors, and stale the moment a credential is revoked. That leaves a permanent gap between *who passed KYC* and *who actually holds the position*. Covenant closes that gap by moving the check on-chain and into the settlement path itself.

## The approach

The credit engine exposes three access-control hooks that fire before any position change:

| Hook | Fires when | Question asked |
|------|-----------|----------------|
| `canIncreaseCredit(account)` | An account's credit (lending) position grows | May this account lend? |
| `canIncreaseDebt(account)` | An account's debt (borrowing) position grows | May this account borrow? |
| `canLiquidate(account)` | An account attempts a liquidation | May this account seize? |

Covenant implements these hooks against **Cleanverse**, whose Cooperate API (v5.6) supplies two primitives that map onto them directly:

- **A-Pass** — a credential registered on-chain against a wallet, carrying an expiry, a tier and sub-tier, a group, and ISO-3166 country tags derived from the holder's identity documents. It can be frozen and unfrozen, and it is the unit of institutional identity.
- **Compliance pools** — per-chain contracts holding rules that decide whether a wallet is eligible. Rules combine a country allow/deny list (`is_black_list`, `countries`), tier and group constraints, and a pause switch. `POST /validator/verify` answers, for a given pool and wallet, `valid: true | false`.

That verify call is the same question a gate hook asks, which is what makes the mapping clean: **a Covenant market's policy is a Cleanverse compliance pool.**

### How the two halves connect

Cleanverse and Covenant meet at exactly one point: the gate contract. Everything else is an implementation detail on one side or the other.

```
   Institution's KYC provider           Cleanverse Cooperate API              Cleanverse compliance pool
   (documents, sanctions, jurisdiction)  (rules, A-Pass, verify)              (on-chain contract)
                    │                              │                                   │
                    └──── issues A-Pass ──────────▶│                                   │
                                                   └── registers wallet against ─────▶│
                                                                                       │
                                                                                       │  isRegistered()
                                                                                       │  paused()
                                                                                       │  verify(wallet)
                                                                                       ▲
   ┌───────────────────────────────────────────────────────────────────────────────────┘
   │
   │ every position-increasing tx
   │
   ▼
   Covenant market  ──▶  entryGate.canIncreaseCredit/Debt  ──▶  CleanversePoolGate  ──▶  validator.complianceVerify(gate, user)
                     ▲
                     └── seizureGate.canLiquidate ──▶ same path for liquidators
```

The gate is the **only** place the two systems touch. That single point is what makes the integration auditable: a regulator or internal risk team can trace any position back to the exact pool it depends on, the exact rules that pool held at the time, and the exact A-Pass that satisfied them.

### Why an on-chain gate at all

What Cleanverse cannot do is answer a Solidity `view`. A gate hook executes inside a trade with no ability to make an HTTPS request, so Covenant needs a source of truth reachable from inside the EVM. Two shapes work:

1. **Cleanverse's own on-chain compliance pool** — Cleanverse deploys a contract per chain that mirrors the same rules the Cooperate API enforces off-chain. The gate calls it directly with a bounded-gas `staticcall`. This is Path A below and is the default institutional integration.
2. **A Covenant-operated attestation registry** — authorised attesters call the Cooperate API off-chain, then commit the verdict on-chain as an attestation the gate reads. This is Path B, used when Cleanverse does not yet have an on-chain pool on the target chain, or when Covenant needs to layer additional policy (per-action limits, per-market caps) on top of pure Cleanverse eligibility.

Both paths satisfy the same market interface, so a market's compliance guarantee does not depend on which one it uses — only on the fact that the gate is bound at market creation and cannot be swapped.

The result is that compliance becomes a mechanical property of the market. An account with no valid attestation cannot open a position. A revoked credential blocks further exposure at the contract level, in the same transaction, without an off-chain process needing to notice. Because gates are part of a market's identity, they cannot be swapped out after the fact — a market is either compliant from creation or it is a different market.

## Architecture

Covenant is four cooperating layers. Each layer talks to the one below through a narrow, view-only interface. That narrowness is the reason the system is safe to compose: a change in one layer cannot silently reach another.

```
   ┌───────────────────────────────────────────────────────────────────────┐
   │ 1. Frontend           React + wagmi SPA                               │
   │                       Take-offer paste box, action tabs, positions   │
   └──────────────────────────────┬────────────────────────────────────────┘
                                  │ off-chain: read markets, submit txs
   ┌──────────────────────────────┴────────────────────────────────────────┐
   │ 2. Off-chain services   sign_offer.js (EIP-712 offer producer)        │
   │                         cleanverse_client.py (Cooperate API client,   │
   │                         AES-CBC, api-id header, fail-closed mirror)   │
   └──────────────────────────────┬────────────────────────────────────────┘
                                  │ signed offers, attestation writes
   ┌──────────────────────────────┴────────────────────────────────────────┐
   │ 3. Credit engine      src/Covenant.sol                                │
   │                       fillOffer / repay / withdraw / seize            │
   │                       + notary ratification (src/notaries/)           │
   │                       + oracle price feed (src/oracles/)              │
   │                       + market identity via keccak of every field    │
   └───────────────┬──────────────────────────────────┬─────────────────────┘
                   │ gate hooks (view, in-tx)         │ ERC-20 movements
   ┌───────────────┴───────────────┐    ┌─────────────┴─────────────────────┐
   │ 4a. Compliance gates          │    │ 4b. Compliance-aware token layer  │
   │  src/compliance/              │    │  src/compliance/WrappedAToken.sol │
   │    CleanversePoolGate  ← live │    │  1:1 wrap of any origin ERC-20    │
   │    CovenantGate + Registry    │    │  transfers checked against pool   │
   │    PermissiveGate (tests only)│    │  closes the flashLoan surface     │
   └───────────────┬───────────────┘    └────────────────┬──────────────────┘
                   │ staticcall (150k gas cap)           │ staticcall (same shape)
                   └─────────────────┬───────────────────┘
                                     ▼
                     ┌───────────────────────────────┐
                     │ Cleanverse compliance pool    │
                     │ isRegistered / paused /       │
                     │ verify(wallet)                │
                     └───────────────────────────────┘
```

**Layer responsibilities:**

- **Frontend (`frontend/`)** — a React SPA. Reads market state directly from `Covenant.toMarket(id)`; submits fills via `fillOffer` with a pasted offer JSON. No backend of our own — the marketplace is whatever channel the maker uses to publish signed offers.
- **Off-chain services (`offchain/`)** — the offer producer and the Cleanverse API client. The client's `attestable` property is the exact mirror of the on-chain gate's fail-closed rule so the two halves can never disagree.
- **Credit engine (`src/Covenant.sol`, `src/notaries/`, `src/oracles/`, `src/libraries/`)** — the fixed-maturity credit primitive. Market identity is the keccak of every field including gate addresses, so a market's compliance policy cannot be silently rebound after creation.
- **Compliance surface (`src/compliance/`)** — split cleanly in two:
  - **Gates** decide "may this account open a position?" — called from the engine on every increase in exposure.
  - **`WrappedAToken`** decides "may this account receive these tokens?" — called from the token itself on every transfer. Using it as the loan token closes the `flashLoan` surface at the token layer.

Both compliance sub-layers use the **same** `isRegistered → paused → verify` staticcall sequence with the **same** 150 000 gas cap and the **same** fail-closed rule, so an operator only has to reason about one policy shape.

## Compliance layer

The project ships two gate implementations. They enforce the same market interface but connect to Cleanverse differently.

### Path A — Direct pool gate (`CleanversePoolGate`)

The recommended integration. The gate reads Cleanverse's on-chain compliance pool directly, inside the trade.

```
                        ┌──────────────────────────────┐
   position change ───▶ │   Fixed-maturity credit      │
   (lend/borrow/        │   engine                     │
    seize)          └──────────────┬───────────────┘
                                       │ gate hook (view, on-chain)
                                       ▼
                        ┌──────────────────────────────┐
                        │   CleanversePoolGate         │
                        │   staticcall, bounded gas    │
                        │   fail-closed                │
                        └──────────────┬───────────────┘
                                       │ isRegistered / paused / verify
                                       ▼
                        ┌──────────────────────────────┐
                        │   Cleanverse compliance pool │
                        │   (Cleanverse-deployed)      │
                        │   rules · A-Pass eligibility │
                        └──────────────────────────────┘
```

The pool contract is what the Cleanverse API endpoint `POST /validator/verify` front-ends off-chain — the same on-chain view a compliance officer would call from the API is the one the gate calls inside the trade. There is no attester and no bridge; Cleanverse's own pool is the source of truth.

### Path B — Attestation registry (`CovenantGate` + `CovenantRegistry`)

An optional additional-policy layer, useful when Covenant needs to enforce per-action or Covenant-specific rules on top of Cleanverse eligibility, or when the target chain does not have a directly-callable Cleanverse pool contract.

```
   position change ───▶ credit engine ──▶ CovenantGate ──▶ CovenantRegistry
                                                                 ▲
                                             attester ───────────┘
                                                 │
                                                 └── HTTPS ── Cleanverse Cooperate API
```

Attesters are per-registry roles; they may only write attestations and set per-policy permits. They cannot move funds, alter markets, or grant themselves privileges. No personal data goes on-chain — only a hash commitment to the off-chain verification record, plus jurisdiction, validity window, and revocation state. Every write emits an event naming the attester and the source commitment, which is what makes the audit trail reconstructible.

### Properties both paths preserve

- **Gate calls are `view`.** They return a boolean the engine turns into a revert. Failure is interpreted, never propagated.
- **Bounded gas per read.** A misbehaving remote cannot consume the whole trade's gas budget and convert a compliance denial into a market-wide DoS.
- **Fail-closed.** Reverting reads, unreachable pools, and malformed data all deny. Unavailable verification is never treated as clearance.
- **Only *increases* are gated.** Repay and withdraw remain open, so an outage or credential revocation cannot strand capital already committed to a position.
- **Gate binds to market identity.** The gate address is part of the `Market` struct that hashes into the market id. A "compliant" market and an "open" market for the same asset are different markets with different ids — positions cannot leak between them, and a live market's compliance policy cannot be silently redirected by swapping the gate.

## Function coverage

Every state-changing function in the lending core, and whether the gate applies. Reviewed against `src/Covenant.sol`.

### Position-mutating (user-facing)

| Function | Creates exposure? | Gated? | Why |
|---|---|---|---|
| `fillOffer` | Yes — buyer credit ↑ and/or seller debt ↑ | **Yes**, only on the increasing side | `canIncreaseCredit(buyer)` fires iff `buyerCreditIncrease > 0`; `canIncreaseDebt(seller)` iff `sellerDebtIncrease > 0`. Reductions ungated. |
| `seize` | Reduces borrower's debt/collateral | **Yes**, on `msg.sender` | `canLiquidate(msg.sender)` — the liquidator is the actor being screened, not the borrower. |
| `withdraw` | No — burns credit for loan tokens (settlement) | No | Exit path. Gating would strand a lender who lost their credential after committing capital. |
| `repay` | No — reduces debt | No | Exit path. Also permits a third party to repay on behalf of a compliant borrower whose credential has since been frozen. |
| `supplyCollateral` | No — tops up collateral | No | Cannot become debt without going through the gated `fillOffer`. Supplying collateral to another's position is a donation, not exposure. |
| `withdrawCollateral` | No — reduces collateral, healthiness enforced | No | Exit path. `isHealthy` prevents unsafe withdrawals; compliance is orthogonal. |

### Non-position (infrastructure)

| Function | Gated? | Rationale |
|---|---|---|
| `initMarket` | No | Permissionless market creation is safe because the gate addresses are part of the market id — a market with `entryGate = 0` is a **different** market than a Cleanverse-gated one. Positions cannot merge across market ids. |
| `setConsumed` | No | Offer-cap bookkeeping; no position mutation. |
| `setIsAuthorized` | No | Delegation only. The position holder is what `fillOffer` gates, not the caller — delegating to a non-compliant party cannot open a non-compliant position. |
| `multicall` | No | Uses `delegatecall`, so inner calls run under the outer `msg.sender`. Each inner call is individually gated where the underlying function is. |
| `updatePosition` | No | Fee accrual and bad-debt slashing; deterministic bookkeeping. |
| Admin setters, `claimSettlementFee`, `claimContinuousFee` | No | Protocol governance, not user-facing. |

### `flashLoan`: the one surface not gated at the market layer

`flashLoan` lets anyone borrow arbitrary tokens from the Covenant contract's balance for a single transaction. That balance includes loan tokens supplied by lenders of compliant markets and collateral supplied by compliant borrowers. A non-compliant wallet can `flashLoan()` those tokens into a callback and use them within the same transaction — repay unrelated debt, sell on a DEX, manipulate an oracle — before returning them.

This is not a bug I introduced or one that Covenant's compliance layer can close, because flash loans span markets. The `Market` struct has no `flashLoanGate` field, and the `flashLoan` selector is on the core contract itself. Two ways it stays defensible in the Cleanverse model:

1. **Loan-token-layer enforcement (built and tested here).** Cleanverse's A-Token standard enforces compliance rules (country allow/deny, tier, group) at the token contract itself. This repo ships [`WrappedAToken`](src/compliance/WrappedAToken.sol), a 1:1 wrapper for any origin ERC-20 that consults the same `ICleanversePool` the market gate uses — with the same fail-closed, gas-bounded read shape — inside every inbound transfer. When a Covenant market's loan token is a `WrappedAToken`, `covenant.flashLoan([waUSDC], ..., callback)` reverts inside `safeTransfer(waUSDC, callback, amt)` with `RecipientNotCompliant(callback)` **before** the callback is invoked, whenever the callback wallet is not verified in the pool. This is proven mechanically in [`test/compliance/WrappedATokenFlashLoanTest.sol`](test/compliance/WrappedATokenFlashLoanTest.sol) against the same `MockCleanversePool` the gate uses. The market gate becomes belt-and-suspenders; the token is the belt.

2. **Deployment topology.** An institution deploying Covenant for regulated markets can fork the core contract and either disable `flashLoan` entirely or add a global compliance gate to it. This is a governance choice, not something a compliance layer sitting *outside* the core can enforce.

The gate coverage above is what the market layer protects; flash-loan behaviour is inherited from the underlying protocol, and this repo closes it at the token layer via `WrappedAToken`.

### `WrappedAToken` — closing the flash-loan surface at the token layer

The recommended deployment for a regulated Covenant market pairs the market gate (`CleanversePoolGate` or `CovenantGate`) with a `WrappedAToken` as the loan token. The wrapper is the on-chain analogue of Cleanverse's `POST /atoken/launch_wrapped_atoken`: it locks an origin token (e.g. native USDC) and mints wrapped units at 1:1, gating every inbound transfer against the bound compliance pool at the token layer.

```
   deposit(USDC) ─▶ WrappedAToken ─mint waUSDC─▶ verified recipient
                        │                        (validator.complianceVerify(waUSDC, to) must hold)
                        │
   Covenant.flashLoan([waUSDC], amt, callback):
     safeTransfer(waUSDC → callback)  ─▶ WrappedAToken._transfer
                                             │
                                             ├── isExempt(callback)?               no ─┐
                                             ├── validator.isRegistered(waUSDC)?   yes │
                                             │                                          ├─▶ validator.complianceVerify(waUSDC, callback)
                                             └── any read fails?                   → revert RecipientNotCompliant
```

Design invariants (mirrored point-for-point with `CleanversePoolGate`, so token and gate cannot disagree):

- **Immutable pool binding** — changing the compliance source requires a new token, and therefore a new market. Prevents a live loan asset being silently repointed at a laxer policy.
- **Only inbound transfers are gated** — `withdraw` (burn-to-origin) is intentionally open, so a holder whose credential is later frozen can always reclaim their locked origin balance. This is the token-layer version of the engine's "gate increases, not exits" rule.
- **Gas-bounded, fail-closed reads** — same `POOL_GAS_LIMIT = 150_000` staticcall shape as the gate. A misbehaving pool cannot DoS a transfer, and any failure resolves to `not eligible`.
- **Minimal exempt set** — the token owner may register infrastructure addresses that need to route the wrapper as pass-through liquidity (the Covenant core itself, a bundler, a router). This is the on-chain analogue of Cleanverse's institutional deposit-address whitelist (`POST /atoken/whitelist/add`) and is deliberately narrow.

To deploy the compliant loan token:

```solidity
// 1. Deploy the wrapper against native USDC and your pool.
WrappedAToken waUSDC = new WrappedAToken(
    IERC20(NATIVE_USDC),
    IAPassComplianceValidator(VALIDATOR),
    OWNER_MULTISIG,
    "Wrapped Access USDC",
    "waUSDC",
    6
);

// 2. Exempt protocol infrastructure that must hold the wrapper as routing state.
waUSDC.setExempt(address(covenant), true);

// 3. Create a Covenant market whose `loanToken` is the wrapper. The market gate can be
//    CleanversePoolGate or CovenantGate — the wrapper composes with either.
market.loanToken = address(waUSDC);
```

Every increase in exposure is now checked twice by design: once by the market gate on the position holder, once by the token on the transfer recipient. Every non-position transfer — including `flashLoan` — is still checked by the token.

### Receiver flows (loan tokens and collateral)

`fillOffer`, `withdraw`, `withdrawCollateral`, and `seize` all accept a `receiver` parameter. The receiver is *not* gated. This is deliberate: compliance is enforced on **who holds the position**, not on where the position holder chooses to send redeemed tokens. A compliant borrower directing loan-token proceeds to a third-party wallet is analogous to a bank customer disbursing a loan into a third-party account — the borrower's own compliance obligations (e.g., Travel Rule reporting on their onward transfer) apply, and the market is not the enforcement point for that.

## Core formulas

Every constant and formula below is exercised by tests in this repo — see the referenced files.

### 1. Market identity

Two markets differing in a single parameter (including gate addresses) are provably distinct market ids. See `IdLib.toId`.

```
id = keccak256(
        abi.encodePacked(
            0xff,
            covenantAddress,
            chainId,
            keccak256(abi.encodePacked(SSTORE2_PREFIX, abi.encode(market)))
        )
     )
```

### 2. Oracle scaling

Covenant's liquidation identity: `collateral_raw × price / ORACLE_PRICE_SCALE = value_in_loan_token_raw` with `ORACLE_PRICE_SCALE = 1e36`. An oracle wrapping a feed at `feedDecimals` for a `(collateralDecimals, loanDecimals)` pair emits:

```
price = feed_answer × 10^loanDecimals × ORACLE_PRICE_SCALE
                    / (10^feedDecimals × 10^collateralDecimals)

SCALE = ORACLE_PRICE_SCALE × 10^loanDecimals
                           / 10^(collateralDecimals + feedDecimals)   // precomputed
```

See `ChainlinkBtcUsdOracle.SCALE` and `testFuzz_priceIdentity`.

### 3. Maximum debt from collateral (`isHealthy`)

With `WAD = 1e18`, rounded down at each step:

```
maxDebt = Σ  collateral_i × price_i / ORACLE_PRICE_SCALE × lltv_i / WAD
```

Position is healthy iff `debt ≤ maxDebt`. See `Covenant.isHealthy`.

### 4. Bad-debt bound (liquidation floor)

Amount of debt unrecoverable even after seizing all collateral at maximum discount:

```
badDebt = max(0, debt − Σ collateral_i × price_i / ORACLE_PRICE_SCALE × WAD / maxLif_i)
```

See `Covenant.seize`.

### 5. Continuous fee reservation

When new credit opens at time `t` in a market maturing at `T`:

```
buyerPendingFeeIncrease   = buyerCreditIncrease × continuousFee × (T − t) / WAD

sellerPendingFeeDecrease  = sellerPendingFee × sellerCreditDecrease / sellerCredit
```

The rate is locked in at issuance. See `Covenant.fillOffer`.

### 6. Compliance gate (Cleanverse pool path)

For a market with `entryGate != address(0)`, a position increase requires:

```
validator.isRegistered(address(gate)) == true
  ∧ validator.complianceVerify(address(gate), participant) == true
                                    // pause is folded into complianceVerify per CCP V2
```

Every read is a gas-bounded `staticcall`; any failure resolves to "not eligible" (fail-closed). Only *increases* are gated — repay and withdraw stay open. See `CleanversePoolGate._eligible`.

### 7. Compliance mode (deployment-level enforcement)

When `Covenant` is deployed with `REQUIRE_COMPLIANCE = true`:

```
initMarket(market) succeeds only if:
    market.entryGate   ≠ 0
  ∧ market.seizureGate ≠ 0
  ∧ isApprovedGate[market.entryGate]
  ∧ isApprovedGate[market.seizureGate]
```

Structurally impossible to hold a non-gated market on this deployment. See `Covenant.initMarket` and `test/compliance/ComplianceModeTest.t.sol`.

## The credit ladder

A single gate answers *yes or no*. A ladder of gates answers *on what terms*.

An A-Pass carries a sub-tier, not just a validity bit. Because a gate's address is hashed into the market id (formula 1), a market that offers 91.5% LLTV is cryptographically bound to the gate that requires sub-tier 30 — the leverage and the credential requirement are **one object**. Nobody can offer institutional terms to a wallet that clears a retail bar, because doing so would be a different market with a different id.

| Rung | Who clears it | Min sub-tier | LLTV | Collateral for a $100k borrow |
|------|---------------|-------------|------|-------------------------------|
| Institutional | Bank-verified entity holding a full-tier CVI credential | 30 | 91.5% | ≈ $109k |
| Verified professional | Verified individual at an elevated CVI sub-tier | 20 | 77.0% | ≈ $130k |
| Verified retail | Any wallet holding a valid A-Pass | 10 | 38.5% | ≈ $260k |

That spread is the point. The institutional rung needs **2.4× less** collateral than the retail one for the same loan, and the credential is the only thing that closes the gap — which makes verification worth something beyond mere access.

`CreditLadderLens` (`src/periphery/CreditLadderLens.sol`) resolves a wallet against every rung in a single `eth_call`, re-deriving each rung's gate, LLTV, and oracle from its market id via `ICovenant.toMarket`. The frontend's `/ladder` route renders that response directly.

Deploy with `script/DeployLadder.s.sol` followed by `script/DeployLadderLens.s.sol`.

## Roadmap

Everything below is unbuilt. Today the gate answers one question — **is this wallet's holder eligible?** Each item below extends that answer, and is stated as: the Cleanverse call it consumes, the on-chain write that carries the verdict, and what observably changes for a market.

Covenant consumes one corner of Cleanverse: `/api/cooperate`, which issues A-Pass credentials and evaluates compliance pools. The wider gateway also exposes document and liveness verification, sanctions and jurisdiction datasets, wallet risk scoring, and KYB/LEI lookup. `CovenantRegistry`'s docstring already names those as the reason it exists.

| # | Cleanverse call | Carried on-chain by | Market-visible effect |
|---|---|---|---|
| 1 | `document/recognize`, `document/liveness-check` | nothing — runs before `generate_apass` | the country tag driving every pool rule stops being self-declared |
| 2 | `datasource/{ofacSDN,unConsolidated,fatfRiskJurisdiction,baselAMLRanking}` | `validator/set_rule` — Cleanverse's own on-chain write | Path A markets re-price jurisdiction with no Covenant deployment |
| 3 | `address/register_address`, `address/retrieve_address_risk` | `CovenantRegistry.revoke(account, reason)` | tainted provenance denies further exposure increases |
| 4 | `business/companies`, `/detail`, `/lei`, `/people` | `CovenantRegistry.attest(...)` committing to an LEI | the institutional rung gets an entity credential, not a personal one |
| 5 | credential-state push (existence unconfirmed) | `CovenantRegistry.revoke` | shortens Path B revocation latency; Path A already immediate |
| 6 | none | new engine function | an open position can change hands, gated at transfer |

**One prerequisite gates items 1–4.** Everything the client speaks to today is relative to `/api/cooperate`. All four items live on the *bare* gateway (`/api/address`, `/api/datasource`, `/api/business`, `/api/document`) — a different base path, and the cached OpenAPI spec (`offchain/spec/cleanverse-openapi-v3.json`, 148 paths) contains no `/api/cooperate` route at all, so the two surfaces are documented separately and may authenticate separately. Before any of this is scheduled, confirm with Cleanverse that the same `api-id` authorises the wider gateway; the spec declares `security: None` and an empty `securitySchemes`, so it cannot be read off the document. Three further consequences for `offchain/cleanverse_client.py`: it needs dual-base support, these endpoints take **query-string** parameters rather than the encrypted JSON bodies `/api/cooperate` uses, and every response is typed as a bare `object`, so shapes must be pinned against UAT rather than generated. Treat the spec as advisory — one parameter name in it is visibly corrupted by a paste.

### 1. Document and liveness verification at issuance

- **Integration.** `POST /api/document/recognize` (`docType`, `frontImagePath`, `backImagePath`) parses an identity document; `POST /api/document/liveness-check` (`video_path`, `image_path`) binds it to a live person. Both run inside `_handle_generate_apass` *before* `generate_apass`, and their output supplies `fullName`, `idType`, and `issuingCountryISO2` instead of the request body.
- **Gap it closes.** Those three fields are free text today. `frontend/src/pages/Compliance.tsx` collects them from text inputs and validates only that the name is two characters and the country matches `/^[A-Z]{2}$/`; `offchain/server.py` forwards them verbatim into `identityDataList`. The country tag that every pool country rule is evaluated against is whatever the user typed.
- **On-chain footprint.** None. No contract changes, no gate changes, no new market ids — the trust boundary moves inside the issuance handler.
- **Why first.** Item 2's jurisdiction rules are worth little while the jurisdiction is self-asserted, and this is the smallest diff on the list. Unresolved mechanic: both routes take a *path*, and the spec has no upload route, so where images are stored is the one question to settle with Cleanverse before starting.

### 2. Sanctions and jurisdiction datasets as generated pool rules

- **Integration.** A scheduled job reads `GET /api/datasource/ofacSDN` and `/unConsolidated` (no parameters) plus `/fatfRiskJurisdiction` and `/baselAMLRanking` (both take a `cache` flag, which is what makes them cheap to poll), diffs them against the pool's current rule list from `validator/rules`, and writes the difference back through `POST /validator/set_rule`. The `countries` and `is_black_list` fields of the rule built by `CleanverseClient.build_rule` are the only ones this touches.
- **Gap it closes.** Pool country lists are hand-maintained. FATF revises its grey and black lists at each plenary — roughly three times a year — and a hand-maintained list is wrong for as long as it takes someone to notice.
- **On-chain footprint.** Nothing Covenant deploys. `set_rule` is one of the mutating Cooperate endpoints that writes on-chain — the client's own error table carries `12026 ONCHAIN_WRITE_FAILED` — so a regenerated rule is visible to every Path A market at the next block, since `CleanversePoolGate` reads `complianceVerify` live inside the transaction. Path B markets are unaffected; their jurisdiction lives in `Identity.jurisdiction` and moves via `attest`.
- **Second use for the same feed.** A higher-risk jurisdiction does not have to mean denial. Each ladder rung is a separate market bound to a separate gate and therefore a separate pool with its own `countries` list, so Basel's ranking can drop a jurisdiction out of the institutional rung's list while leaving it in the retail rung's — three `set_rule` writes expressing "less leverage", rather than one global block list expressing "no". Pricing risk instead of refusing it is what the 2.4× rung spread exists to do.

### 3. Wallet risk scoring — provenance as a gate input

- **Integration.** An attester registers each cleared wallet with `POST /api/address/register_address` (`address` as a query parameter) and polls `POST /api/address/retrieve_address_risk`. A score crossing the institution's threshold invokes `CovenantRegistry.revoke(account, reason)`, already `onlyAttester`, already terminal, already emitting the reason — the write fits an existing hook.
- **Gap it closes.** `complianceVerify` answers *who holds this wallet*, not *where its funds came from*. A wallet with a live A-Pass funded from a mixer passes the pool check today, and tainted provenance is a reportable event for an institution regardless of how well-identified the counterparty is.
- **On-chain footprint.** One new `revoke` call per flagged account — no engine changes, no new market ids, no re-deployment. The one design note is that `revoke` is terminal per credential id, so a score that recovers re-enters through `attest` with a fresh credential.
- **Why it is a registry item, not a Cleanverse-side one.** Verdicts here are institutional policy — which score is too high is the bank's call, not the vendor's — so the write lands in `CovenantRegistry` via an attester, not in a pool rule via `set_rule`.

### 4. Entity identity — KYB, LEI, and the institutional rung

- **Integration.** A second issuance flow for legal persons: `POST /api/business/companies` (with `isoCode`, `companyRegistrationNumber`, `companyName`) resolves a registered entity, `/companies/detail` (`companyId`) returns it, `/companies/lei` (`bic`/`lei`/`isin`) attaches its Legal Entity Identifier, and `/companies/people` (`uen`, `personName`, `role`) screens beneficial owners. The resulting `CovenantRegistry.attest` commits to the LEI rather than to a natural-person document.
- **Gap it closes.** The largest gap between what the README claims and what the code does. A-Pass as issued today is a natural-person credential — `generate_apass` builds `identityDataList` from `idType`, `fullName`, and `issuingCountryISO2`, and there is no entity path. But the institutional rung is *"bank-verified entity holding a full-tier CVI credential"* and the target user is a bank or an RWA issuer — entities, which cannot hold a passport.
- **On-chain footprint.** `attest` only — one call per entity, `Identity.credentialId` as the LEI commitment, `jurisdiction` as the entity's home country. No new gate logic; the rung already keys on `min_sub_tier`, and this item is about *which credential* the entity holds, not how it is scored.
- **The item's one open question.** Whether the entity attestation reuses `credentialId` (smaller change, honest as a commitment to an off-chain record of unspecified shape) or `Identity` grows an entity discriminator. Leaning toward the former.

### 5. Push-driven credential state — closing Path B's revocation window

- **The latency is Path B's only.** A Cleanverse-side freeze via `POST /update_status` is an on-chain write, and `CleanversePoolGate` calls `complianceVerify` inside the transaction, so a frozen A-Pass denies on Path A markets at the next block with no Covenant action at all. On Path B, a registry attestation stays live until an attester polls `query_apass` and calls `revoke` — the exposure window is exactly the poll interval, and it applies only to registry-gated markets and to risk scores (item 3), which the pool cannot hold.
- **Integration, if a channel exists.** Unconfirmed, and the lowest-confidence item here. The spec's `/notification/*` routes are inbound receivers for Cleanverse's own upstream providers (`sumsub_webhook`, `transak_webhook`, `alchemypay_*`), not a partner-facing subscription. Worth one question to Cleanverse.
- **Fallback that needs no answer.** Tighten the `query_apass` and `retrieve_address_risk` poll interval, and prefer a `CleanversePoolGate` market wherever the institution's policy is expressible as a pool rule — the immediacy is a property of Path A, not something to be engineered into Path B.

### 6. Secondary transfer of positions

- **Integration.** None — this is the one item that needs no new Cleanverse surface. Transfer re-runs the market's existing `entryGate` against the recipient: `canIncreaseCredit` for a lender position, `canIncreaseDebt` for a borrower position, through whichever gate the market id already hashes.
- **Gap it closes.** Design choice 1 accepts "no secondary market" as the cost of fixed-maturity credit. That is right for a first version and wrong in the long run: institutions expect to exit a term position, and a market whose only exits are maturity and liquidation prices that illiquidity into the rate.
- **Why it is the strongest demonstration of the thesis.** The moment a position moves, an off-chain KYC check that cleared the original holder is describing the wrong person — there is no point in the flow where a database gate could re-run. A gate hook read inside the transfer is not a cleaner implementation of the same idea; it is the only implementation.
- **Why it is last.** It is the only item that changes the credit engine rather than the compliance layer, and it touches market identity: because the gate address is hashed into the market id, the governing policy must follow the position's market, not the holder's history. Repayment and withdrawal stay ungated after transfer, per design choice 4 — a recipient who later loses their credential must still be able to settle.

### Deliberately out of scope

Cleanverse also exposes fiat on/off ramps, bank-account verification, card and QR payment rails, and custody and trading via Amber. These are adjacent to the product but not to the thesis. Two carve-outs:

- **`bankAccount/identity_match`** — matches a bank-account holder against KYC identity (`accessToken`, `emailAddress`, `legalName`, `phoneNumber`). It is a fiat-side Travel Rule input, so it is the one ramp-adjacent endpoint that could earn its way in alongside item 4.
- **Amber's `swap/price` and `swap/orders`** — could route liquidation proceeds. Useful for the collateral side, but it puts a centralised venue inside the liquidation path, and that is an architectural concession rather than an integration detail. Stated here so the trade-off is visible instead of absorbed quietly.

Building a matching engine, an identity schema, or a licensed entity remains out of scope for the reasons given in [Design choices](#design-choices) and [Positioning](#positioning).

## Deployment

### Live addresses — Monad Testnet

Chain id `10143` · RPC `https://testnet-rpc.monad.xyz` · explorer [testnet.monadexplorer.com](https://testnet.monadexplorer.com)

The frontend reads every one of these from `frontend/src/config/chain.ts`, which is the single source of truth for the deployment. If this table and that file ever disagree, **the file is right** — swap the chain there and the whole app follows.

| Contract | Address | Role |
|----------|---------|------|
| `Covenant` | `0xcdc06aae7617c3b6f44cc1f2a9a7163252d8a797` | The engine. Holds every market, position, and offer fill. |
| `CleanversePoolGate` | `0xd49faa5d2d18b0ad04ef01093d2c2ef24ea8ad2c` | Covenant's gate. Holds the rule list, answers the engine's one boolean question. |
| CVI Compliance Validator | `0xaC7e5179C2C7f03f209136886c172eb34F161792` | Cleanverse's validator (CCP V2). CREATE2-deployed to the same address on every chain they support. |
| `BtcUsdOracle` | `0x2E09f0566A87Bb27615873aBCF18855d37b000F9` | Owner-push price feed. `STALENESS = 0`, so a pushed price does not expire. |
| `EcrecoverNotary` | `0xc35B4e48940D68Dd449d19D3657e754632CC873C` | Validates the EIP-712 signature on an off-chain offer at fill time. |
| `CreditLadderLens` | `0x4c18A570290FD0c7f4615ac24e5a42a72Ec2413D` | Resolves a wallet against all three ladder rungs in one call. |

Test tokens (mintable, no value): **tUSDC** `0x7dbe32f1e1d3db45123f60ec5a79312863a7e279` (6 dec, loan token) · **tWBTC** `0x088b748e05b85af8ad2ee3c538a517f3eb1ce2ad` (8 dec, collateral).

Ladder gates: institutional `0xC8035E7672e31a552f16FFeaB60d5f115Bd90451` · professional `0x51545c4f0A789BF7BA499CFD1Ac786D9E11d874d` · retail `0xB50A199cd20dfdaDFA5383eDB04b1B06474714d5`.

**Current registration state.** All three ladder gates are deployed and whitelisted on the engine, but have not yet completed Cleanverse registration. Until they do, each gate's rule list is empty and it denies *every* account — including one holding a valid A-Pass. A wallet reading as ineligible on the ladder right now is a statement about the deployment, not a verdict on the credential. The primary `tWBTC / tUSDC` market (id `0xb6f6…8e7c`) is registered and fills normally.

`PermissiveGate` (`src/compliance/PermissiveGate.sol`) returns `true` for every hook. It exists so the engine's non-compliance behaviour can be tested in isolation and so a market can be exercised end-to-end without a live pool. It is **not** part of the Monad deployment, and because gate addresses are part of the market id, a permissive market and a compliant market are different markets with no shared state.

### Cleanverse integration status

Verified against the UAT gateway, `https://uatapi.cleanverse.com/api/cooperate`. The three endpoints marked ★ correspond one-to-one with the three `staticcall` reads `CleanversePoolGate._eligible` performs on-chain — the off-chain client and the on-chain gate ask the pool the same questions in the same order:

| Capability | Endpoint | On-chain equivalent | Status |
|-----------|----------|---------------------|--------|
| Authentication (`api-id` header) | — | — | Working — `code: "0000"` |
| ★ Pool registration check | `POST /validator/is_register` | `validator.isRegistered(pool)` | Working |
| ★ Pool pause state | `POST /validator/is_paused` | (folded into `complianceVerify`) | Working — no separate on-chain call |
| ★ User eligibility | `POST /validator/verify` | `validator.complianceVerify(pool, user)` | Reachable; returns `12027` until the wallet holds an A-Pass |
| Pool rules incl. country allow/deny | `POST /validator/rules` | (informational; enforced inside `verify`) | Working |
| A-Pass lookup | `POST /query_apass` | — | Implemented, not yet exercised |
| A-Pass issue / freeze | `POST /generate_apass`, `/update_status` | — | Implemented (AES), not yet exercised |
| Wrapped A-Token issuance | `POST /atoken/launch_wrapped_atoken` | `WrappedAToken` deploy | On-chain wrapper shipped; API-side issuance not yet wired |
| Institutional deposit whitelist | `POST /atoken/whitelist/add` | `WrappedAToken.setExempt(account, true)` | On-chain equivalent shipped |

Integration details the client handles, each of which is easy to get wrong:

- **Base path is `/api/cooperate`.** The bare host serves an unrelated older API; requests there succeed with the wrong semantics rather than failing loudly.
- **Only `api-id` is transmitted.** The api-key is an AES key used locally and must never be sent. Putting it in a header would hand an attacker the ability to forge encrypted request bodies.
- **Mutating endpoints require AES/CBC/PKCS5 with a fixed 16-zero-byte IV**, keyed by the base64-decoded api-key, sent as `{"data": "<base64 ciphertext>"}`.
- **Success is `code == "0000"`, a string.** HTTP 200 is returned for business failures too, so the HTTP status alone tells you nothing.
- **`valid: false` is a compliance verdict, not an error** — it must not be retried as one.
- **Cloudflare fronts the gateway** and bans the default `Python-urllib` user-agent with error 1010.
- **Infrastructure errors arrive as JSON.** A Cloudflare 403 parses into an envelope-shaped object; treating it as a business response would silently report a blocked request as an ineligible wallet. The client rejects any response lacking a `code` field and preserves the cause.

Unavailable verification is never treated as clearance. The client's `attestable` property mirrors the gate's fail-closed rule so the off-chain and on-chain halves cannot disagree.

### Repository layout

| Path | Contents |
|------|----------|
| `src/Covenant.sol` | The fixed-maturity credit engine — markets, positions, fills, settlement |
| `src/compliance/` | `CleanversePoolGate`, `CovenantGate`, `CovenantRegistry`, `WrappedAToken`, `PermissiveGate` |
| `src/interfaces/` | Engine, gate, notary, oracle, and callback interfaces |
| `src/libraries/` | `IdLib` (market identity), `TickLib`, `ConstantsLib`, `EventsLib`, `SafeTransferLib`, `UtilsLib` |
| `src/notaries/` | `EcrecoverNotary` — EIP-712 offer ratification |
| `src/oracles/` | `BtcUsdOracle` (owner-push), `ChainlinkBtcUsdOracle` |
| `src/periphery/` | `CovenantBundles`, `CreditLadderLens`, `EcrecoverAuthorizer`, and amount helpers |
| `test/` | Foundry suites — `compliance/`, `oracles/`, `erc20s/`, `helpers/`, `frontend/` |
| `script/` | Deployment scripts, one per contract, plus `CreateMarket` and `DeployLadder` |
| `offchain/` | Cleanverse API client, EIP-712 offer signer, offer book builder, cached OpenAPI spec |
| `frontend/` | React + wagmi SPA and the in-app documentation |
| `docs/` | [`CoreMath.md`](./docs/CoreMath.md) — the full derivation behind the formulas above |

## Getting started

### Contracts

Build and test with [Foundry](https://book.getfoundry.sh/getting-started/installation):

```bash
forge build
forge test
```

Run only the compliance layer's tests:

```bash
forge test --match-path "test/compliance/*" -vvv
```

Deploy (scripts are one-per-contract, in dependency order):

```bash
forge script script/DeployCovenant.s.sol --rpc-url $RPC_URL --broadcast
forge script script/DeployCleanverseGate.s.sol --rpc-url $RPC_URL --broadcast
forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server
npm run build      # tsc -b && vite build
npm run preview    # serve the production build locally
```

Point it at a different deployment by editing `frontend/src/config/chain.ts` — nothing else in the app hardcodes an address.

### Off-chain services

The Cleanverse API is authenticated per-application. Configure credentials via environment variables — never commit them:

```bash
cp .env.example .env
```

Populate `.env` with your Cleanverse application ID and API key. `.env` is gitignored; only `.env.example` is tracked.

```bash
cd offchain
npm install                          # ethers, for the signing tools
node sign_offer.js                   # produce a signed EIP-712 offer
node build_offer_book.js             # assemble an offer book from signed offers
node preflight_offers.js             # dry-run offers against the engine before publishing

pip install -r requirements.txt      # Cleanverse client dependencies
python server.py                     # local attester / verification endpoint
python -m pytest test_endpoints.py   # exercise the Cooperate API integration
```

The signing flow is documented in [`offchain/SIGNING.md`](./offchain/SIGNING.md).

## Design choices

Every load-bearing decision in Covenant, with the trade-off it makes. Each item is a design choice, not an implementation detail — none of these can be flipped without changing what the product *is*.

### 1. Fixed-maturity credit, not variable-rate

- **Choice.** Every market has a hard maturity timestamp. Rates are locked at issuance; there is no utilization curve, no `apy` recomputation.
- **Why.** Institutions cannot underwrite variable-rate exposure on their balance sheet without daily mark-to-market machinery. A fixed-term note is a first-class asset class they already know how to book.
- **Trade-off.** No secondary market for open positions in this repo — positions settle at maturity or via `seize`. That's the point: variable-rate lending is already a solved problem for retail, and it isn't what regulated capital wants.

### 2. Offers signed off-chain, filled on-chain

- **Choice.** A lender or borrower signs an EIP-712 `Offer` struct with a notary-verified signature; the counterparty calls `fillOffer` on-chain, passing the offer plus its signature.
- **Why.** Publishing 1,000 offers costs zero gas. A lender pays only when a trade actually happens. Marketplaces stay pluggable: any channel that can serve a signed JSON blob works.
- **Trade-off.** Offer discovery is an off-chain concern. Covenant does not ship a matching engine — that's a marketplace's job.

### 3. Gate hooks are `view` predicates, not `revert`-ing external calls

- **Choice.** `IEnterGate.canIncreaseCredit(account) returns (bool)`. Any failure inside the gate resolves to `false`; the engine surfaces the market's own domain error (`LenderIneligible` / `BorrowerIneligible`), never an opaque revert from compliance infrastructure.
- **Why.** A compliance provider must not be able to brick a market by reverting. The gate is a *question*, not a *guard*.
- **Trade-off.** The gate cannot enforce structured errors of its own; every negative answer looks the same. Acceptable — the market layer is the right place for the domain error.

### 4. Only *increases* in exposure are gated

- **Choice.** `canIncreaseCredit`, `canIncreaseDebt`, `canLiquidate` fire on new lending, new borrowing, and liquidation. `repay`, `withdraw`, `withdrawCollateral` are ungated.
- **Why.** Compliance revocation must never strand committed capital. A borrower whose passport is frozen must still be able to repay; a lender with a lapsed credential must still be able to redeem at maturity.
- **Trade-off.** A wallet that becomes non-compliant can still hold an open position — this is correct behaviour, not a hole.

### 5. Gate hooks are per-account, not per-pair

- **Choice.** `canIncreaseCredit(buyer)` and `canIncreaseDebt(seller)` are two independent calls; neither can observe the counterparty.
- **Why.** Per-account policy is what identity, jurisdiction, sanctions, and asset-eligibility rules actually enforce. FATF R.16 Travel Rule counterparty matching is pair-shaped, but that check happens off-chain at pre-clearance time in the real institutional workflow.
- **Trade-off.** Pairwise on-chain checks are not enforceable at the gate layer. If we ever need them, they belong in the notary path (which already sees both sides via the offer struct).

### 6. Gate address is part of the market's identity

- **Choice.** `id = keccak(gate, seizureGate, loanToken, collateralParams, maturity, rcfThreshold, covenant, chainId)`. Change any gate address and you get a new market id.
- **Why.** A market's compliance policy cannot be silently retrofitted or swapped mid-life. A "compliant" market and an "open" market on the same loan token are provably different markets, and positions cannot leak between them.
- **Trade-off.** Migrating to a new gate implementation creates a new market — no in-place upgrade. This is a feature: audit trails cannot be rewritten.

### 7. Every external read is a bounded-gas staticcall

- **Choice.** Both the gate and the wrapped-A-token forward `VALIDATOR_GAS_LIMIT = 150_000` per read and treat every failure (revert, malformed data, gas exhaustion, no code) as `false`.
- **Why.** Without a gas cap, a griefing validator could consume all remaining gas and force the enclosing trade to revert for lack of gas — converting a per-account compliance denial into a market-wide denial-of-service.
- **Trade-off.** A rich validator that needs > 150k gas per read would need us to raise the cap. This is deliberate: a compliance answer should be cheap; if it isn't, the interface is wrong.

### 8. Fail-closed, always

- **Choice.** Any read failure resolves to *not eligible*. Unavailable verification is never treated as clearance.
- **Why.** The alternative (fail-open) means a compromised or unreachable validator quietly grants everyone access. The blast radius of a false negative (a legitimate user's trade reverts) is bounded and self-healing; a false positive (a sanctioned actor slips through) is a compliance breach.
- **Trade-off.** During a Cleanverse outage, new positions cannot open on gated markets. Existing positions remain settleable. This is the correct availability posture for a compliance product.

### 9. Compliance runs at two layers, not one

- **Choice.** The gate answers "may this account open a position?" (per-market); `WrappedAToken` answers "may this account receive these tokens?" (per-transfer, at the token contract). Both use the *same* validator, the *same* staticcall shape, the *same* gas cap, the *same* fail-closed rule.
- **Why.** The gate cannot close the `flashLoan` surface — flash loans live on the Covenant core and span markets. Moving the check to the token layer closes it: a non-compliant flash-loan callback reverts inside `safeTransfer` before it runs. The gate becomes belt-and-suspenders; the token is the belt.
- **Trade-off.** Two contracts to keep aligned. The alignment is mechanical: both call `IAPassComplianceValidator.complianceVerify(address(this), account)`.

### 10. `WrappedAToken` is a first-party contract, not an off-the-shelf Cleanverse A-Token

- **Choice.** We ship our own compliance-aware ERC-20 wrapper instead of consuming Cleanverse's `POST /atoken/launch_wrapped_atoken` output.
- **Why.** The wrapper needs to be provably fail-closed and gas-bounded — properties this repo tests exhaustively — and needs to expose a documented exempt set for protocol infrastructure (the Covenant core, bundlers). We know exactly what our wrapper does; we don't have to trust an off-the-shelf issuance to have the same properties.
- **Trade-off.** We're now the maintainer of a compliance-aware token contract. Its footprint is 260 lines and its behaviour is under formal invariants — acceptable.

### 11. Withdraw path on `WrappedAToken` is intentionally ungated

- **Choice.** `withdraw(assets, receiver)` releases the origin token without a compliance check. Same rule as the engine's ungated exits.
- **Why.** A holder whose credential is later frozen must be able to reclaim their locked origin balance. Otherwise credential revocation confiscates assets, which no regulator would sign off on.
- **Trade-off.** In principle a frozen wallet can burn `waUSDC` for `USDC`. That's fine: the freeze applies to *new* activity, not to unwinding existing holdings.

### 12. CCP V2 (`IAPassComplianceValidator`), not custom compliance

- **Choice.** The gate reads Cleanverse's on-chain validator with the exact selectors from the CCP V2 integration guide (`isRegistered(pool)`, `complianceVerify(pool, user)`, `RuleV2` struct).
- **Why.** Building a bespoke identity schema means becoming an identity provider — out of scope. Reading a standardized validator means Cleanverse can evolve rules server-side (new countries, new tiers) without any redeploy on our side.
- **Trade-off.** We're bound to Cleanverse's rule shape. This is exactly right — the whole product thesis is that compliance should be the identity provider's job, not the lending protocol's.

### 13. `CovenantRegistry` as an escape hatch (Path B)

- **Choice.** In addition to reading Cleanverse directly (Path A), the repo ships an attestation registry (Path B) where authorised attesters project Cleanverse verdicts on-chain. `CovenantGate` reads this registry via the same fail-closed shape.
- **Why.** Not every target chain has a Cleanverse validator deployed yet. Path B unblocks deployments on those chains while preserving the fail-closed / staticcall / immutable-per-market properties. It also lets Covenant layer *additional* per-action policy on top of Cleanverse's verdict.
- **Trade-off.** Path B introduces attesters as a trusted role. Their scope is narrow — write attestations only, cannot move funds, cannot alter markets — but it is trust nonetheless. Prefer Path A wherever possible.

### 14. Single-contract mode registration, not factory mode

- **Choice.** Each `CleanversePoolGate` is registered with the validator individually via `POST /api/cooperate/validator/register` (CCP V2 §5), not through a factory holding `REGISTER_ROLE`.
- **Why.** A gate binds to one compliance profile. If you want two profiles, deploy two gates and two markets. Factory mode is the right shape for a DEX with hundreds of pools; single-contract mode is the right shape for a lending protocol whose markets are deliberately few.
- **Trade-off.** One-time API call per gate deployment, and a gate denies every account until that call lands. The three credit-ladder gates are in exactly that state today — see [Deployment](#deployment).

### 15. Deterministic market storage via `SSTORE2`

- **Choice.** Market parameters are stored as bytecode at a deterministic CREATE2 address, and the market id hashes that bytecode. Reads never touch storage slots — they decode from the market code.
- **Why.** Storing the full `Market` struct in storage would cost O(n_collaterals) SLOADs per position update. Encoding it as bytecode makes market reads a single CODECOPY and keeps position operations cheap.
- **Trade-off.** Market parameters are immutable. This is the intended semantics — an "editable" market is a different market.

## Positioning

Covenant is infrastructure, not a licensed financial institution. It does not custody assets, issue tokens, or act as counterparty to any loan. Institutions using Covenant markets remain the regulated actors; Covenant supplies the rails and the enforcement layer that make those markets viable for them.

## Documentation

- [Core pool math and invariants](./docs/CoreMath.md) — the full derivation behind the formulas above, including what the contracts deliberately do *not* enforce
- [Off-chain signing flow](./offchain/SIGNING.md) — producing and validating an EIP-712 offer
- [Business plan](./business_plan.pdf)
- The running interface at [`frontend/`](#frontend) carries its own documentation section (`/docs`) covering the same ground with live addresses read from the deployment
- [Cleanverse API documentation](https://docs.cleanverse.com/) · [CCP V2 integration guide (PDF)](https://cleanverse.com/)
