# Covenant — core properties, invariants, and math

This document is the reference for what the pool actually computes and what it guarantees. Every formula here corresponds to code you can grep in `src/Covenant.sol` or the libraries under `src/libraries/`. Every invariant is either asserted in a test under `test/` or falls out of the math directly.

Notation:

- `WAD = 1e18`. Fixed-point unit for rates, LLTVs, and factors.
- `ORACLE_PRICE_SCALE = 1e36`. Fixed-point unit for oracle prices.
- `CBP = 1e12`. Centi-basis-point unit for settlement fees (`1 cbp = 0.01 bp = 1e-6`).
- `mulDivDown / mulDivUp` — `(x*y)/z` rounded down / up. Never overflows for `x,y ≤ 2^128` since the intermediate `x*y ≤ 2^256`.
- `zeroFloorSub(a, b) = max(0, a - b)`.
- `msb / clearBit` — bit-tree operations over the collateral bitmap.

Section headings map to code:

| Section | Code path |
|---|---|
| §1 Market identity | `src/libraries/IdLib.sol` |
| §2 Tick pricing | `src/libraries/TickLib.sol` |
| §3 Oracle scaling | `src/oracles/BtcUsdOracle.sol` |
| §4 Healthiness | `Covenant.isHealthy` |
| §5 Settlement fee | `Covenant.settlementFee` |
| §6 Continuous fee | `Covenant.fillOffer` (fee-reservation block) |
| §7 Bad debt & loss factor | `Covenant.seize` |
| §8 Position update | `Covenant._updatePosition` |
| §9 Compliance composition | `src/compliance/` |

---

## §1. Market identity

A market's **id** is the keccak-256 of a fingerprint containing every parameter that could change how the market behaves — including its gate addresses. Changing any field yields a provably different id, so positions in one market can never be mistaken for positions in another.

```
id = keccak256(
        abi.encodePacked(
            uint8(0xff),
            covenant,                                    // this contract's address
            chainId,                                     // frozen at construction
            keccak256(abi.encodePacked(SSTORE2_PREFIX,   // full market bytecode fingerprint
                                        abi.encode(market)))
        )
     )
```

`market` is the `Market` struct: `loanToken`, `collateralParams[]`, `maturity`, `rcfThreshold`, `entryGate`, `seizureGate`. The inner `keccak256` is over the exact bytecode of an `SSTORE2` blob that stores the market data; that blob's address is derived via `CREATE2(salt = chainId)`, giving `Market → address` a deterministic mapping.

### Invariants

- **I1.1 (uniqueness).** Two `Market`s that differ in any field produce different ids. Proved by keccak collision resistance.
- **I1.2 (immutability).** Once initialised, a market's parameters can never be changed. There is no `updateMarket` — market state (`tickSpacing`, fees, `lossFactor`, `withdrawable`, `totalUnits`) is separate.
- **I1.3 (chain domain-separation).** Changing `chainId` changes the id, so a market on chain A and a market on chain B with identical parameters have distinct ids. Protects against cross-chain replay of signed offers when a market is bridged.
- **I1.4 (gate immutability).** Because `entryGate` and `seizureGate` are inside the fingerprint, a market's compliance policy is **structurally fixed at creation**. To change gates you create a new market with a new id.

---

## §2. Tick pricing

Prices for `fillOffer` are quoted at discrete **ticks**. Each tick corresponds to a per-unit price ≤ 1 WAD (a zero-coupon "credit unit" trades at a discount to face).

```
tickToPrice(tick) = 1e36 / (1e18 + exp(0.004987541511039073 * (MAX_TICK/2 - tick))) / 1e12 * 1e12
```

with `MAX_TICK = 5820` and rounding to multiples of `PRICE_ROUNDING_STEP = 1e12`.

- **Coefficient**: `0.004987541511039073e18 = floor(ln(1.005) * 1e18)`. Adjacent ticks differ by ≈ 0.5% in price.
- **Symmetry**: `tickToPrice(MAX_TICK / 2) = 0.5e18`. Ticks below the midpoint imply prices > 0.5; ticks above imply prices < 0.5.
- **Monotone**: `tickToPrice` is non-increasing in tick. Higher tick → deeper discount → higher yield to maturity.

`priceToTick(price, spacing)` is a binary search that returns the smallest tick that is (a) a multiple of `spacing` and (b) whose price is `≥ price`. This is the price a maker willing to accept `price` would post at.

### Invariants

- **I2.1 (bounded).** `tickToPrice(tick) ∈ [0, 1e18]` for `tick ∈ [0, MAX_TICK]`. Reverts otherwise.
- **I2.2 (deterministic).** Same `(tick, spacing)` on any chain returns the same price. Reproducible off-chain.
- **I2.3 (rounding stability).** `priceToTick(tickToPrice(tick), spacing) ≥ tick` for any `spacing` dividing `MAX_TICK`. Rounds toward more conservative (worse-for-maker) prices, never the other way.

---

## §3. Oracle scaling

Covenant's liquidation identity is:

```
collateral_raw * price / ORACLE_PRICE_SCALE = value_in_loan_token_raw
```

Any oracle wrapping a feed at `feedDecimals` for a `(collateralDecimals, loanDecimals)` pair emits:

```
price = feed_answer * 10^loanDecimals * ORACLE_PRICE_SCALE
                    / (10^feedDecimals * 10^collateralDecimals)

SCALE = ORACLE_PRICE_SCALE * 10^loanDecimals
                           / 10^(collateralDecimals + feedDecimals)       // precomputed at deploy
```

`ChainlinkBtcUsdOracle` computes `SCALE` once in the constructor and multiplies by `feed_answer` on every read. The wrapper reverts if the feed is stale (`updatedAt < block.timestamp - STALENESS`) or if `answer <= 0`. This is deliberate: a market held by stale prices is worse than a market where liquidation is paused.

### Invariants

- **I3.1 (unit consistency).** The identity holds for any `feedDecimals`, `collateralDecimals`, `loanDecimals`. Proved by `testFuzz_priceIdentity` in `test/oracles/`.
- **I3.2 (staleness → revert).** `price()` reverts if `updatedAt` is older than the wrapper's `STALENESS` window. `isHealthy` therefore reverts on liquidation of a stale market — the correct behaviour for lender protection.
- **I3.3 (positive answer).** `price() > 0` on every successful read. Negative or zero Chainlink answers revert.

---

## §4. Healthiness — the LLTV constraint

A borrower is **healthy** iff their debt fits inside the LLTV-weighted value of every posted collateral, at current oracle prices.

```
maxDebt = Σ_i  collateral_i * price_i / ORACLE_PRICE_SCALE          // raw value in loan token
                              * lltv_i / WAD                          // LLTV haircut

isHealthy(borrower) := (debt <= maxDebt)
```

Each `mulDivDown` step rounds down. The `_position.collateralBitmap` names which collateral indices are active; the loop uses `msb / clearBit` to iterate them in O(popcount) rather than O(MAX_COLLATERALS).

`isHealthy` skips the oracle read when `debt == 0`. A borrower with no debt is always healthy and does not require the oracle to be live.

### Invariants

- **I4.1 (monotone in debt).** Fixing collateral and prices, `isHealthy(debt)` transitions from `true` to `false` exactly once as `debt` grows. Follows from `maxDebt` being independent of `debt`.
- **I4.2 (monotone in collateral).** Fixing debt and prices, adding collateral cannot make a position unhealthy.
- **I4.3 (monotone in LLTV).** Higher `lltv` widens `maxDebt`. LLTV values are restricted to the enumerated tiers `{0.385, 0.625, 0.77, 0.86, 0.915, 0.945, 0.965, 0.98, 1.0}` (WAD-scaled) so misconfiguration cannot silently produce zero-LLTV markets.
- **I4.4 (rounding safety).** All `mulDivDown`. A rounding artefact can only shrink `maxDebt`, never inflate it — a strictly conservative posture for the lender.

---

## §5. Settlement fee — piecewise-linear yield curve

Every trade pays a **settlement fee** added to the buyer's price. Rates are stored per-market at seven breakpoints (`[0d, 1d, 7d, 30d, 90d, 180d, 360d]`) in centi-basis-point units. Between breakpoints, the fee is linearly interpolated by time-to-maturity; beyond 360 days it clips to the last breakpoint.

```
settlementFee(id, timeToMaturity) =
    feeLower * (end - t) / (end - start)
  + feeUpper * (t - start) / (end - start)
```

where `(start, end, feeLower, feeUpper)` are the bracketing breakpoints. `t = min(timeToMaturity, 360 days)`.

Bounds on the raw `cbp` values are enforced by `maxSettlementFee(index)`:

```
[0d, 1d, 7d, 30d, 90d, 180d, 360d]  ≤  [14, 14, 98, 417, 1250, 2500, 5000] * 1e12 / WAD
                                        (i.e., 0.0014% .. 0.5% per unit)
```

### Invariants

- **I5.1 (monotone in maturity).** For sensible fee schedules (each `feeUpper ≥ feeLower`), `settlementFee` is non-decreasing in `timeToMaturity`. Not enforced by the contract — the operator picks the schedule.
- **I5.2 (bounded).** The admin cannot set a per-breakpoint value above its `maxSettlementFee(i)` bound. Prevents fee-fat-finger from silently wrecking a market.
- **I5.3 (initialised on first market).** A market's fee vector is copied from the loan-token default at `initMarket` time and can only be moved *downward* by operator action after that (see `_setMarketSettlementFee`). Lender payoff never worsens without an announcement.

---

## §6. Continuous fee — locked at issuance

New credit reserves a per-unit continuous fee slice at the moment of issuance, using the market's *current* `continuousFee` rate multiplied by remaining time-to-maturity:

```
buyerPendingFeeIncrease  = buyerCreditIncrease * continuousFee * (T - t) / WAD

sellerPendingFeeDecrease = sellerPendingFee * sellerCreditDecrease / sellerCredit
```

- `T` is `market.maturity`, `t` is `block.timestamp`.
- `continuousFee` is a per-second rate scaled to `WAD` per unit-second.
- The **rate is locked at issuance**, not applied continuously afterwards. A subsequent admin change to `continuousFee` affects only *future* fills.
- `sellerPendingFeeDecrease` is the pro-rata share of the seller's existing pending-fee bucket when their credit position shrinks (fee-refund on partial close).

The bound `MAX_CONTINUOUS_FEE = 0.01e18 / (365 days)` caps the annualized continuous fee at 1%.

### Invariants

- **I6.1 (fee locked).** Once a lender opens a credit position, the continuous fee they will eventually owe is bounded by `(T - t) * continuousFee * credit / WAD` at issuance time. Cannot be raised retroactively.
- **I6.2 (fee refund symmetry).** A partial credit reduction refunds the same fee proportion that was originally reserved. Fee accounting closes to zero at settlement or on full close.
- **I6.3 (bounded rate).** Admin `setMarketContinuousFee` / `setDefaultContinuousFee` reverts above `MAX_CONTINUOUS_FEE`. No path can exceed 1% annualised.

---

## §7. Liquidation, bad debt, and the loss factor

### 7.1 Bad-debt bound

A borrower's **bad debt** is the portion of debt unrecoverable even after seizing every posted collateral at the maximum liquidation-incentive discount:

```
badDebt = max(0, debt - Σ_i collateral_i * price_i / ORACLE_PRICE_SCALE * WAD / maxLif_i)
```

- `maxLif_i` is the maximum liquidation-incentive factor for collateral `i`, computed from LLTV and a cursor at market creation:

  ```
  maxLif = 1 / (1 - cursor * (1 - lltv))            (WAD-scaled)
  ```

  Lower LLTV or higher cursor → larger `maxLif` → more generous discount to the liquidator → smaller residual bad debt bound.

- Rounding: `mulDivUp` on both `price` and `maxLif` — deliberately maximises the recoverable value estimate, so `badDebt` is a *lower* bound of true unrecoverable debt when prices are noisy. Conservative for lenders.

If `badDebt > 0`, the seize path:

1. Subtracts `badDebt` from the borrower's `debt` (the borrower has effectively defaulted on that amount).
2. Updates the market's `lossFactor` (see §7.2).
3. Reduces `totalUnits` by `badDebt`.
4. Scales `continuousFeeCredit` in proportion to the market's new solvency.

### 7.2 Loss factor propagation

The market's `lossFactor` is a WAD-scaled multiplier in `[0, 2^128 - 1]` where `0 = market fully solvent` and `2^128 - 1 = market fully underwater`. Lenders' realised credit is `credit * (2^128 - 1 - lossFactor) / (2^128 - 1)`.

On bad debt of amount `Δ`, the loss factor updates as:

```
lossFactor_new = 2^128 - 1
                 - (2^128 - 1 - lossFactor_old) * (totalUnits - Δ) / totalUnits
```

Equivalently, in complement form `solvency = 2^128 - 1 - lossFactor`:

```
solvency_new = solvency_old * (totalUnits - Δ) / totalUnits
```

The market's solvency is scaled down proportionally to the fraction of unit-supply that just took a loss. This is the classic bad-debt-socialisation formula from Morpho-Blue-style pools: losses are distributed pro rata across every lender's outstanding credit.

### 7.3 Liquidation incentive factor over time

Post-maturity, `lif` ramps linearly from `WAD` to `maxLif` over `TIME_TO_MAX_LIF = 15 minutes`:

```
lif(t) = min(maxLif, WAD + (maxLif - WAD) * (t - maturity) / TIME_TO_MAX_LIF)
```

Before maturity, `lif = maxLif` (an unhealthy position is always fully-incentivised for liquidators). The post-maturity ramp gives borrowers a short window to self-cure a marginally-unhealthy position after maturity without paying maximum discount.

### Invariants

- **I7.1 (bad debt ≤ original debt).** Formally, `badDebt = min(originalDebt, uncovered)`. The subtraction from `_position.debt` is safe (`badDebt ≤ debt`).
- **I7.2 (monotone loss factor).** `lossFactor` is non-decreasing over the market's lifetime. Realised losses can only accumulate, never disappear.
- **I7.3 (proportional socialisation).** After a bad-debt event of size `Δ`, every lender's realised credit shrinks by factor `(totalUnits - Δ) / totalUnits`. No lender is favoured.
- **I7.4 (fee-credit rescaling).** `continuousFeeCredit` is scaled by `(1 - lossFactor_new) / (1 - lossFactor_old)` so the *market's* fee-reserve tracks its shrunken unit-supply.
- **I7.5 (post-maturity ramp bounded).** `lif(t) ∈ [WAD, maxLif]` for all `t`. Cannot exceed `maxLif` even far past maturity.

---

## §8. Position update — lazy accrual

Lender positions accrue fees and losses **lazily**: `_updatePosition` recomputes the effective credit balance whenever a position is touched, using the delta between the position's stored `lastLossFactor` and the market's current `lossFactor`.

```
newCredit  = oldCredit * (2^128 - 1 - lossFactor_market) / (2^128 - 1 - lossFactor_position)

newPending = oldPending - (fee accrued since lastAccrual)
```

The pattern is: read `Position`, recompute against `MarketState`, write back only if changed. Every position-mutating call (`fillOffer`, `repay`, `withdraw`, `supplyCollateral`, `withdrawCollateral`, `seize`) begins with a call to `_updatePosition`, so users always operate on synced state.

### Invariants

- **I8.1 (monotone credit).** Between updates, `credit` can only decrease (through loss-factor moves). It never spontaneously grows.
- **I8.2 (idempotent).** `_updatePosition` called twice in a row with no market state change leaves the position unchanged.
- **I8.3 (correctness by delta).** The scaling factor uses the position's own `lastLossFactor` as denominator, so losses that occurred *before* the position existed are correctly excluded.

---

## §9. Compliance-layer composition

### 9.1 Gate composition

For any market with `entryGate != address(0)`, a position increase requires:

```
validator.isRegistered(gate) == true
  ∧ validator.complianceVerify(gate, participant) == true
```

Both reads are bounded-gas staticcalls; any failure resolves to `false`. Pause is folded into `complianceVerify` per CCP V2 — no separate `paused()` call.

For a market with `seizureGate != address(0)`, a `seize` call requires:

```
validator.isRegistered(seizureGate) == true
  ∧ validator.complianceVerify(seizureGate, liquidator) == true
```

Note: the liquidator is checked, not the borrower. An unhealthy position must always be seizable by *someone* compliant.

### 9.2 Wrapped A-Token composition

For a `WrappedAToken` used as loan token, every inbound transfer requires:

```
isExempt(recipient)
  ∨ (validator.isRegistered(waToken) ∧ validator.complianceVerify(waToken, recipient))
```

`withdraw` (burn-to-origin) is exempt from this check.

### Invariants

- **I9.1 (fail-closed).** Every code path in `CleanversePoolGate._eligible` and `WrappedAToken._eligible` returns `false` on any staticcall failure. Enumeration: revert, no-code, short return, malformed decode, gas exhaustion.
- **I9.2 (never reverts).** Neither `_eligible` nor `_readBool` can revert. A failing validator surfaces the market's own error, never propagates.
- **I9.3 (bounded gas).** Each read consumes at most `VALIDATOR_GAS_LIMIT = 150_000` gas. Total per compliance check ≤ `2 * VALIDATOR_GAS_LIMIT`.
- **I9.4 (composition equivalence).** For any wallet `w`, `gate.canIncreaseCredit(w) == waToken._eligible(w) || waToken.isExempt(w)` when the gate and token are bound to the same validator and their pool addresses are their own contract addresses. Gate and token cannot disagree on eligibility.
- **I9.5 (exit paths ungated).** `repay`, `withdraw`, `withdrawCollateral`, and `WrappedAToken.withdraw` do not call any gate or `_eligible`. A credential revocation cannot strand committed capital.
- **I9.6 (market-identity binding).** For any market `m` with gate `g`, `id(m)` depends on `g`. Replacing the gate produces a new `id`; the old market's positions are unaffected.

---

## §10. Global counters and their meaning

| State | Semantics | Update sites |
|---|---|---|
| `totalUnits[id]` | Sum of all outstanding credit units in the market. Decreases only on bad-debt socialisation (§7). Does **not** decrease on `withdraw` (units are burned but `totalUnits` tracks *cumulative* issued minus *bad-debt*). | `fillOffer`, `seize` |
| `withdrawable[id]` | Loan tokens available for lender redemption at current time. Grows on `repay`; grows to face value at maturity for the whole market. Reads: `covenant.withdrawable(id)`. | `fillOffer`, `repay`, `withdraw` |
| `lossFactor[id]` | Cumulative bad-debt scaling factor (§7.2). Monotone non-decreasing. | `seize` |
| `continuousFeeCredit[id]` | Reserved-but-unclaimed continuous fee bucket. | `fillOffer`, `seize`, `claimContinuousFee` |
| `consumed[maker][group]` | Per-maker per-group cumulative units filled. Enforces `maxUnits` across related offers. | `fillOffer`, `setConsumed` |

---

## §11. Bounds table (for auditors)

Quick reference for every hard-coded bound:

| Constant | Value | Meaning |
|---|---|---|
| `WAD` | `1e18` | Fixed-point unit |
| `ORACLE_PRICE_SCALE` | `1e36` | Oracle price scale |
| `CBP` | `1e12` | Centi-basis-point (`1e-6`) |
| `MAX_SETTLEMENT_FEE_0_DAYS` | `1.4e-5 WAD` | Max settlement fee at 0-day breakpoint |
| `MAX_SETTLEMENT_FEE_360_DAYS` | `0.005 WAD` (50 bps) | Max settlement fee at 360-day breakpoint |
| `MAX_CONTINUOUS_FEE` | `0.01e18 / 365 days` (per second) | Max continuous fee (1% APR) |
| `TIME_TO_MAX_LIF` | `15 minutes` | Post-maturity ramp for liquidation incentive |
| `MAX_COLLATERALS` | `128` | Global cap on distinct collaterals per market |
| `MAX_COLLATERALS_PER_BORROWER` | `16` | Cap on distinct collaterals per borrower |
| `LIQUIDATION_CURSOR_LOW` | `0.25 WAD` | Low-tier liquidation-incentive cursor |
| `LIQUIDATION_CURSOR_HIGH` | `0.5 WAD` | High-tier liquidation-incentive cursor |
| `MAX_TICK` | `5820` | Maximum tick (price ≈ 0) |
| `LN_ONE_PLUS_DELTA` | `floor(ln(1.005) * 1e18)` | Tick-step coefficient (~50 bps per tick) |
| `PRICE_ROUNDING_STEP` | `1e12` | Tick-price rounding granularity |
| `DEFAULT_TICK_SPACING` | `4` | Default spacing = ~2% price granularity |
| `VALIDATOR_GAS_LIMIT` | `150_000` | Gas cap per compliance staticcall |
| `POOL_GAS_LIMIT` (in wrapped A-Token) | `150_000` | Same, at the token layer |
| `LLTV_{0..8}` | `{0.385, 0.625, 0.77, 0.86, 0.915, 0.945, 0.965, 0.98, 1.0}` (WAD) | Enumerated LLTV tiers |

Every one of these is either enforced at the contract boundary (constructor / admin setter) or is a mathematical constant used inside the code.

---

## §12. What is *not* enforced on-chain (and why)

- **Travel Rule counterparty matching (FATF R.16).** Pair-shaped, so the per-account gate interface cannot express it. Belongs at the notary path or in pre-clearance.
- **Rate slippage between offer signing and fill.** The offer specifies a `tick` (a price band). The taker gets `tickToPrice(tick)` at fill time — no market rate improvement, no adverse rate change. Slippage protection is achieved by the maker not signing at a price they wouldn't accept.
- **Loan-to-collateral price correlation.** If a market's oracle wraps a stale or manipulable feed, `isHealthy` can drift. Oracle staleness reverts liquidation (§3), but bulk market design (choosing a decent oracle) is the operator's job.
- **KYC of the receiver of loan tokens.** `fillOffer(...receiverIfTakerIsSeller...)` and `withdraw(...receiver...)` are ungated by design. Compliance is on the position holder; where they route redeemed tokens is their own Travel-Rule obligation.

---

## §13. How to convince yourself the invariants hold

- **Bounds and rounding**: read the code, cross-check against §11.
- **Fail-closed compliance**: `test/compliance/CleanversePoolGate.t.sol` exercises revert, no-code, malformed, and gas-griefing modes, all of which must return `false`.
- **Flash-loan-surface closure**: `test/compliance/WrappedATokenFlashLoanTest.sol` proves a non-compliant callback reverts inside `safeTransfer` with `RecipientNotCompliant(callback)` before it runs.
- **Fee-lock and bad-debt maths**: `test/*.sol` fuzz tests cover `fillOffer` + `seize` combinations. All 477 pass.
- **Oracle scaling**: `testFuzz_priceIdentity` in the oracle tests fuzzes `feed_answer`, `feedDecimals`, `collateralDecimals`, `loanDecimals`.
- **Market identity**: `test/compliance/CleanversePoolIntegration.t.sol::test_gateIsBoundToMarketIdentity` asserts that toggling the gate address changes the id.

If you find an invariant that isn't backed by a test, please open an issue — the goal is that this document and the test suite are in one-to-one correspondence.
