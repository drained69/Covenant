# Covenant — how it works, in plain language

This document explains the whole system in the order a real trade flows through it. No prior knowledge of the codebase is assumed. Every section names the concrete files so you can jump in.

## 1. What Covenant is

Covenant is a **fixed-rate, fixed-maturity credit market for regulated institutions**. Two things make it different from ordinary DeFi lending:

1. **Fixed terms, not floating.** Every position has a start rate and a maturity date. A lender knows exactly what they'll be paid back and when; a borrower knows exactly what they owe and when. No surprises from utilization curves.
2. **Compliance is enforced by the smart contract itself.** Every position-opening transaction runs an on-chain check against Cleanverse's compliance rules before it settles. A wallet that fails the check cannot open a position, period — there is no way to bypass it, because the check runs inside the same transaction that would create the exposure.

The rest of this document walks through the codebase in the order a trade actually travels.

## 2. The full picture in one diagram

```
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                                Off-chain                                     │
   │                                                                              │
   │   Lender ─signs Offer─▶ Marketplace ─serves JSON─▶ Borrower's frontend      │
   │   (EIP-712)                                              │                   │
   └────────────────────────────────────────────────────────  │  ─────────────────┘
                                                              │
                                                              │ covenant.fillOffer(offer, sig, units, ...)
                                                              ▼
   ┌────────────────────────────────────────────────────────────────────────────┐
   │                                 On-chain                                   │
   │                                                                            │
   │   Covenant core                                                            │
   │   ├── EcrecoverNotary.ratify(sig)   ── proves the lender signed this      │
   │   ├── entryGate.canIncreaseCredit() ── may lender lend?                    │
   │   ├── entryGate.canIncreaseDebt()   ── may borrower borrow?               │
   │   ├── update Position + MarketState                                        │
   │   └── move loan tokens + escrow collateral                                 │
   │                                                                            │
   │            │                                     │                         │
   │            ▼                                     ▼                         │
   │   CleanversePoolGate                       WrappedAToken loan token       │
   │   (staticcall, 150k gas, fail-closed)      (every transfer checks pool)   │
   │            │                                     │                         │
   │            └────────┐               ┌────────────┘                         │
   │                     ▼               ▼                                      │
   │           ┌─────────────────────────────────┐                              │
   │           │   Cleanverse compliance pool    │                              │
   │           │   isRegistered() / paused() /   │                              │
   │           │   verify(wallet)                │                              │
   │           └─────────────────────────────────┘                              │
   └────────────────────────────────────────────────────────────────────────────┘
```

Everything below is that picture, one layer at a time.

## 3. The engine — `src/Covenant.sol`

This is the core credit contract. Everything else in the repo either supports it, gates it, or reads from it.

Only three things happen inside a Covenant market:

- **Position events** — `fillOffer`, `repay`, `withdraw`, `supplyCollateral`, `withdrawCollateral`, `seize`. These are the state-changing user actions.
- **Bookkeeping** — `updatePosition`, `updatePositionView`. These roll credit accrual and slash factors forward without changing exposure.
- **Utility** — `flashLoan`, `multicall`. These don't touch positions directly.

The two ideas to understand about the engine:

- **A "market" is a fingerprint, not an account.** A market's identity is the keccak-256 hash of everything that defines it: the loan token, the list of collateral parameters, the maturity, the entry gate, the seizure gate. Change *any* field and you get a different market id. Positions cannot migrate between market ids. This is why swapping out a compliance gate is impossible after the fact — a different gate means a different market, so the old positions stay where they were and no state leaks.
- **Only *increases* in exposure are gated.** The gate hooks (`canIncreaseCredit`, `canIncreaseDebt`, `canLiquidate`) fire on new lending, new borrowing, and liquidations. `repay` and `withdraw` are not gated. Why: an outage or a revoked credential must never strand capital that has already been committed. A borrower whose passport gets frozen can still repay their loan.

## 4. Offers — how a trade is quoted

Covenant does not have an on-chain order book. Instead:

1. A lender (or borrower) signs an **Offer** off-chain using EIP-712. The offer says "I'm willing to lend at price X, up to N units, until date Y."
2. They publish the signature wherever they like — a website, a Telegram bot, a spreadsheet.
3. When a counterparty wants to take that offer, they call `covenant.fillOffer(offer, notaryData, units, ...)` on-chain.

The signing side lives in [`offchain/sign_offer.js`](offchain/sign_offer.js). It emits a JSON blob containing the exact Offer struct plus the signature. The frontend's **Take offer** tab is a simple pastebox for that JSON.

The on-chain side goes through a **Notary**. A notary is a tiny contract that answers one question: "did the offer's maker actually sign this?" The default implementation lives in [`src/notaries/EcrecoverNotary.sol`](src/notaries/EcrecoverNotary.sol) and does a plain EIP-712 signature check. Notaries are pluggable — a multisig notary or a ZK notary would swap in the same way — because the engine only ever calls `notary.ratify(...)`.

Why off-chain offers: publishing 1,000 offers costs zero gas. The lender pays only when a trade is actually filled.

## 5. Compliance — how the gates work

Two gate roles exist, defined in [`src/interfaces/IGate.sol`](src/interfaces/IGate.sol):

- `IEnterGate` decides whether an account may lend (`canIncreaseCredit`) or borrow (`canIncreaseDebt`).
- `ILiquidatorGate` decides whether an account may seize collateral (`canLiquidate`).

The engine calls these hooks inside `fillOffer` and `seize`. Every gate implementation shares four properties that are load-bearing for the compliance story:

- **Never reverts.** Failure is returned as `false`, never propagated up. The market's own domain error (`LenderIneligible`, `BorrowerIneligible`) is what the caller sees. This keeps a broken compliance provider from bricking a whole market.
- **Fail-closed.** Any read failure — revert, malformed data, gas exhaustion, unregistered pool, paused pool — resolves to *not eligible*. Unavailable verification is never treated as clearance.
- **Gas-bounded.** Every external read caps at 150 000 gas, so a griefing pool can't consume the whole trade's gas budget.
- **Immutable at market creation.** The gate address is part of the market's fingerprint. You cannot rebind a market to a different gate — you can only create a new market.

The repo ships two gate implementations for two deployment shapes:

### 5a. `CleanversePoolGate` — direct pool read

This is the recommended path. Cleanverse deploys a **compliance pool** contract per chain that holds the rules for a specific institutional programme. The gate makes three `staticcall`s to the pool, in this exact order:

1. `isRegistered()` — is the pool set up correctly? If false → deny.
2. `paused()` — is the pool currently frozen? If true → deny.
3. `verify(user)` — does the user's on-chain A-Pass satisfy the rules? Returns true/false.

Those three calls mirror one-for-one the three off-chain HTTP endpoints Cleanverse's API exposes for the same purpose. The on-chain gate is essentially the API's function inlined into a staticcall.

### 5b. `CovenantGate` + `CovenantRegistry` — attestation path

An escape hatch for chains where Cleanverse hasn't deployed a compliance pool yet, or when Covenant wants to layer per-action policy on top of Cleanverse's verdict.

- An off-chain **attester** watches Cleanverse's REST API. When Cleanverse issues an A-Pass to a wallet, the attester writes an **attestation** on-chain via `CovenantRegistry.attest(...)`. The attestation stores only a hash commitment to the verification record — no personal data on chain.
- `CovenantGate` reads two things from the registry: (1) does this wallet have a live, unrevoked, unexpired attestation? (2) does the policy permit this specific action (Lend / Borrow / Liquidate)?

A revoked attestation is terminal per credential id — you cannot un-revoke, so the audit trail cannot be rewritten.

## 6. Wrapped A-Token — closing the flash-loan surface

The one thing a per-market gate cannot close is `flashLoan`. Flash loans are a core function on the Covenant contract itself, not a per-market function, so they can move tokens without hitting any market's gate. A non-compliant wallet can call `covenant.flashLoan(...)` and receive a compliant market's loan tokens into a callback.

The fix is to move the check to the **token layer** instead of the market layer. [`src/compliance/WrappedAToken.sol`](src/compliance/WrappedAToken.sol) is a 1:1 wrapper for any ERC-20:

- Deposit native USDC → receive `waUSDC` at 1:1.
- Every inbound `transfer` runs the same `isRegistered / paused / verify` chain the gate uses.
- If the recipient fails, the transfer reverts with `RecipientNotCompliant(recipient)`.

Now the flow becomes: `covenant.flashLoan([waUSDC], amount, callback)` → `safeTransfer(waUSDC → callback)` → `WrappedAToken._transfer` → pool check on callback → **revert** before the callback ever runs. The market gate becomes belt-and-suspenders; the token is the belt.

Two properties keep this safe:

- **Only inbound transfers are gated.** `withdraw()` (burn-back-to-origin) is intentionally open, so a holder whose credential is later frozen can still unwrap their locked native balance.
- **A minimal exempt set.** The token's owner can whitelist infrastructure addresses (the Covenant core, a router, a bundler) that need to route the wrapper as pass-through liquidity. This mirrors Cleanverse's own institutional-deposit whitelist. It's deliberately narrow.

Proof lives in [`test/compliance/WrappedATokenFlashLoanTest.sol`](test/compliance/WrappedATokenFlashLoanTest.sol) — four tests covering the non-compliant deny path, the compliant success path, the pool-outage fail-closed path, and the frozen-credential-can-still-withdraw path.

## 7. Off-chain helpers

- [`offchain/cleanverse_client.py`](offchain/cleanverse_client.py) — Python client for Cleanverse's REST API. Handles AES-CBC encryption for mutating endpoints, api-id header authentication, and the code-`0000`-means-success convention. Its `attestable` property mirrors the on-chain gate's fail-closed rule so the two halves cannot disagree.
- [`offchain/sign_offer.js`](offchain/sign_offer.js) — Node script that produces a signed Offer JSON for the frontend to consume.
- [`offchain/SIGNING.md`](offchain/SIGNING.md) — protocol documentation for the off-chain offer flow.
- [`offchain/spec/`](offchain/spec/) — cached OpenAPI spec so tests can run without network access.

## 8. The frontend — `frontend/`

A React + Vite + wagmi single-page app. Every page is a thin wrapper over the on-chain contract; there is no backend of our own.

- **`Markets`** — lists deployed markets with live vitals fetched via `covenant.toMarket(id)`.
- **`MarketDetail`** — one market, showing your position, addresses, and an action panel.
- **`Positions`** — your positions across all markets.
- **`Compliance`** — the compliance panel; shows the bound gate and pool state.
- **`HowItWorks`** — the plain-language walkthrough this document mirrors, in-app.

The action panel is where every user-facing state change happens. Its tabs are one-to-one with engine functions:

| Tab | Engine call | What happens |
|---|---|---|
| Take offer | `fillOffer` | Paste a signed offer JSON + notary signature; enter units; submit |
| Post collateral | `supplyCollateral` | Move collateral into escrow |
| Pull collateral | `withdrawCollateral` | Reverse the above, if the position remains healthy |
| Repay debt | `repay` | Pay back debt units |
| Redeem credit | `withdraw` | Burn credit units, receive loan tokens |
| Testnet faucet | `mint` on the demo tokens | Get test tokens for the demo |

## 9. The tests — `test/`

- **Compliance suite** — [`test/compliance/*.t.sol`](test/compliance/) — proves the compliance layer. Covers the gate + registry, the Cleanverse pool integration, the flash-loan surface (both the disclosed gap and its closure via the wrapper), and the mandatory-gate deployment mode.
- **Engine suites** — everything else under `test/` — proves the credit engine's invariants: authorization, fee accrual, tick math, offer semantics, oracle scaling, liquidation floors, reentrancy safety.
- **Formal specs** — `certora/` — machine-checked invariants for the engine.

Running `forge test` at the repo root runs all of them. Running `forge test --match-path "test/compliance/*"` runs only the compliance surface.

## 10. Deploying it

The compliance-mode deployment is a single script: [`script/DeployCovenant.s.sol`](script/DeployCovenant.s.sol). It sets `REQUIRE_COMPLIANCE = true`, which forces every future market to bind gates (`initMarket` reverts otherwise). Individual gates are approved by the deployment's admin via `setApprovedGate`.

For the wrapped-A-token flow, deploying the loan token itself is three lines:

```solidity
WrappedAToken waUSDC = new WrappedAToken(
    IERC20(nativeUSDC), ICleanversePool(pool),
    ownerMultisig, "Wrapped Access USDC", "waUSDC", 6
);
waUSDC.setExempt(address(covenant), true);
// then create a market with market.loanToken = address(waUSDC)
```

That's the whole system.
