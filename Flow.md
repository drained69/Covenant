# Flow — Gates

Companion to `README.md § Compliance layer` and `docs/CoreMath.md §9`. Those describe *what* the
compliance layer computes. This file answers three operational questions that the Compliance page
raises and neither of those documents answers directly:

1. What actually distinguishes one gate from another (§2).
2. Whether a market consults every gate, or only its own (§3).
3. What happens to a wallet that reads **ELIGIBLE** under *Gate evaluation · primary market* and is
   denied on every rung under *Gate evaluation · credit ladder rungs* (§4).

## Section → code path

| §   | Question                        | Code                                                                     |
| --- | ------------------------------- | ------------------------------------------------------------------------ |
| 1   | What a gate is                  | `src/interfaces/IGate.sol`                                                |
| 2.1 | Role axis                       | `src/interfaces/ICovenant.sol:5-12` (`Market.entryGate`, `Market.seizureGate`) |
| 2.2 | Implementation axis             | `src/compliance/PermissiveGate.sol`, `CleanversePoolGate.sol`, `CovenantGate.sol` |
| 2.3 | Shared failure semantics        | `CleanversePoolGate.sol:162-166`, `CovenantGate.sol:90-118`, `CreditLadderLens.sol:187` |
| 3.1 | Gate ∈ market identity          | `src/libraries/IdLib.sol:25-31`                                           |
| 3.2 | Where gates are consulted       | `src/Covenant.sol:384-393`, `src/Covenant.sol:616-619`                     |
| 3.3 | Creation-time enforcement       | `src/Covenant.sol:796-803`                                                |
| 3.4 | The ladder's three markets      | `script/DeployLadder.s.sol`, `frontend/src/config/chain.ts:96-137`         |
| 4.2 | Rung denial on chain            | `src/periphery/CreditLadderLens.sol:87-127`                               |
| 4.5 | Badge semantics                 | `frontend/src/pages/Compliance.tsx:250-310`                               |

---

## §1 What a gate is

A gate is a stateless `view` contract that answers yes/no about a single account. It holds no funds,
takes no custody, and has no ability to move a position. Covenant asks it a question and acts on the
answer; that is the whole contract surface.

```solidity
// src/interfaces/IGate.sol
interface IEnterGate {
    function canIncreaseCredit(address account) external view returns (bool);
    function canIncreaseDebt(address account) external view returns (bool);
}

interface ILiquidatorGate {
    function canLiquidate(address account) external view returns (bool);
}
```

Each market binds **exactly two** gate addresses — one per role:

```solidity
// src/interfaces/ICovenant.sol:5-12
struct Market {
    address loanToken;
    CollateralParams[] collateralParams;
    uint256 maturity;
    uint256 rcfThreshold;
    address entryGate;    // IEnterGate
    address seizureGate;  // ILiquidatorGate
}
```

---

## §2 The difference between gates

"Gate" is overloaded in the UI. Two independent axes are in play, and confusing them is what makes
the primary-vs-rungs result look contradictory.

### §2.1 Axis one — role: what the gate is asked

| Role           | Slot                  | Interface         | Hook(s)                                  | Screens whom                       | Enforced in           |
| -------------- | --------------------- | ----------------- | ---------------------------------------- | ---------------------------------- | --------------------- |
| Entry gate     | `Market.entryGate`    | `IEnterGate`      | `canIncreaseCredit` / `canIncreaseDebt`   | the lender / the borrower           | `fillOffer`           |
| Seizure gate   | `Market.seizureGate`  | `ILiquidatorGate` | `canLiquidate`                            | `msg.sender` — the liquidator       | `seize`               |

Three consequences worth stating explicitly:

- **The entry gate is asked per side, not per trade.** A fill can pass the lender check and fail the
  borrower check. The two `require`s are separate and produce distinct errors (`LenderIneligible()`,
  `BorrowerIneligible()`).
- **The seizure gate screens the liquidator, not the borrower.** An unhealthy borrower is liquidatable
  regardless of their own compliance standing; the question is who is permitted to do the seizing.
  Gating this too tightly restricts who can keep the market solvent, which is why `IGate.sol` tells
  implementations to keep the eligible set wide.
- **The two slots may hold the same address.** They usually do. `script/DeployLadder.s.sol` binds one
  `CleanversePoolGate` instance to both slots per rung. They are still two slots; a market *could*
  bind a strict entry gate and a permissive seizure gate.

### §2.2 Axis two — implementation: how the gate decides

Three implementations exist in this repo. They differ in where truth lives and whether the answer
depends on which action is being attempted.

| Contract              | Source of truth                              | Differentiates action? | Mutable state       | Admin                            |
| --------------------- | -------------------------------------------- | ---------------------- | ------------------- | -------------------------------- |
| `PermissiveGate`      | none — `return true`                          | no                     | none (`pure`)       | none                             |
| `CleanversePoolGate`  | Cleanverse CVI validator (CCP V2), live read  | **no**                 | `owner` only        | `owner` (rule updates only)      |
| `CovenantGate`        | `CovenantRegistry` attestation + policy       | **yes**                | none                | none — both fields `immutable`   |

**`PermissiveGate`** — 18 lines, all three hooks return `true`. Testnet scaffolding so a market can be
exercised end-to-end. Its own docstring: *"Do not whitelist this on a production Covenant instance."*

**`CleanversePoolGate` (Path A)** — reads the Cleanverse validator directly. All three hooks collapse
to one predicate:

```solidity
// src/compliance/CleanversePoolGate.sol:156-159
function _eligible(address account) internal view returns (bool) {
    if (!_readBool(abi.encodeCall(IAPassComplianceValidator.isRegistered, (address(this))))) return false;
    return _readBool(abi.encodeCall(IAPassComplianceValidator.complianceVerify, (address(this), account)));
}
```

Lending, borrowing and liquidating are the same question here. Note the first clause: the gate asks
whether **the gate itself** is a registered pool before asking anything about the account. An
unregistered gate carries an empty `RuleV2` list and denies everyone — this is the mechanism behind
§4.4. Rules are OR-composed and administered off-chain over the Cleanverse API; the on-chain
`setRule`/`addRule`/`removeRule` wrappers are inert against the implementation currently behind the
Monad testnet proxy, which carries only the read selectors.

**`CovenantGate` (Path B)** — reads an on-chain attestation registry and *does* differentiate:

```solidity
// src/compliance/CovenantGate.sol:62-75
function canIncreaseCredit(address account) external view returns (bool) { return _isCompliant(account, ComplianceAction.Lend); }
function canIncreaseDebt(address account)   external view returns (bool) { return _isCompliant(account, ComplianceAction.Borrow); }
function canLiquidate(address account)      external view returns (bool) { return _isCompliant(account, ComplianceAction.Liquidate); }

function _isCompliant(address account, ComplianceAction action) internal view returns (bool) {
    return _hasLiveCredential(account) && _policyAllows(account, action);
}
```

`_hasLiveCredential` denies on a zero `credentialId`, a revoked credential, a future `issuedAt`, or a
non-zero `expiresAt` in the past. `_policyAllows` then consults `checkPolicy(POLICY_ID, account, action)`.
So under Path B a wallet can be cleared to lend and refused permission to borrow. Under Path A it
cannot — one verdict covers all three.

`REGISTRY` and `POLICY_ID` are `immutable` and there is no owner: rebinding either requires a new gate,
and a new gate means a new market id (§3.1).

### §2.3 What every gate shares

Whatever the implementation, every external compliance read in this codebase is a **bounded-gas
staticcall that fails closed**:

```solidity
// src/compliance/CleanversePoolGate.sol:162-166
function _readBool(bytes memory data) internal view returns (bool) {
    (bool ok, bytes memory result) = address(validator).staticcall{gas: VALIDATOR_GAS_LIMIT}(data);
    if (!ok || result.length < 32) return false;
    return abi.decode(result, (bool));
}
```

`VALIDATOR_GAS_LIMIT` / `REGISTRY_GAS_LIMIT` / `GATE_GAS_LIMIT` are all `150_000`. A revert, an
out-of-gas, a short return, or a missing implementation all decode to `false`. The bound is what stops
a misbehaving validator from converting "this wallet is denied" into "this market is unusable" by
burning the whole trade's gas.

`CreditLadderLens._canIncreaseDebt` uses the identical pattern with the identical stipend, so the lens
and the engine cannot disagree about a gate's answer.

---

## §3 Does each market integrate all gates?

**No.** A market consults its own two gate slots and nothing else. There is no registry of gates that a
market walks, no "all gates must pass" composition, and no way for one market's gate to affect another
market.

### §3.1 The gate address is part of the market's identity

```solidity
// src/libraries/IdLib.sol:25-31
function toId(Market memory market, uint256 chainId, address covenant) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(
        uint8(0xff), covenant, chainId,
        keccak256(abi.encodePacked(SSTORE2_PREFIX, abi.encode(market)))
    ));
}
```

The whole `Market` struct — both gate addresses included — is hashed into the id. Two markets that
differ only in `entryGate` are two *different* markets with different ids, different state, different
books. This is invariant **I1.4** in `docs/CoreMath.md §1`.

The immediate consequence: **a market's gate can never be changed.** There is no `setGate`. Rebinding
policy means deploying a new market, which means new terms, a new book, and a migration. The terms and
the policy are a single object.

### §3.2 The only two call sites in the engine

Grepping `src/Covenant.sol` for gate hooks returns exactly three lines, across two functions:

| Function                    | Line       | Gate consulted | Condition                        |
| --------------------------- | ---------- | -------------- | -------------------------------- |
| `fillOffer`                 | `386`      | `entryGate`    | only if `buyerCreditIncrease > 0` |
| `fillOffer`                 | `391`      | `entryGate`    | only if `sellerDebtIncrease > 0`  |
| `seize`                     | `617`      | `seizureGate`  | always, on `msg.sender`           |

```solidity
// src/Covenant.sol:384-393
require(
    offer.market.entryGate == address(0) || buyerCreditIncrease == 0
        || IEnterGate(offer.market.entryGate).canIncreaseCredit(buyer),
    LenderIneligible()
);
require(
    offer.market.entryGate == address(0) || sellerDebtIncrease == 0
        || IEnterGate(offer.market.entryGate).canIncreaseDebt(seller),
    BorrowerIneligible()
);
```

Everything else is ungated: `withdraw` (`:474`), `repay` (`:502`), `supplyCollateral` (`:529`),
`withdrawCollateral` (`:560`), `flashLoan` (`:761`).

That asymmetry is deliberate, and it is the single most important property for §4: **only *increases*
are gated.** A wallet that loses eligibility — credential expired, gate deregistered, validator
unreachable — can still repay, withdraw, and reclaim collateral. Compliance failure blocks new
exposure; it never strands committed capital. (`flashLoan` is the one surface with no market-layer gate
at all; it is closed at the token layer by `WrappedAToken`.)

### §3.3 What compliance mode enforces, and when

```solidity
// src/Covenant.sol:796-803
if (REQUIRE_COMPLIANCE) {
    require(
        market.entryGate != address(0) && market.seizureGate != address(0),
        MissingComplianceGate()
    );
    require(isApprovedGate[market.entryGate], GateNotApproved(market.entryGate));
    require(isApprovedGate[market.seizureGate], GateNotApproved(market.seizureGate));
}
```

On a `REQUIRE_COMPLIANCE` deployment, a market cannot come into existence without both slots filled
with `gateAdmin`-whitelisted addresses. Enforcing at creation rather than at trade time is what makes
"every market on this instance is gated" a structural fact rather than a runtime hope.

The whitelist governs **creation only**. Setting `isApprovedGate[g] = false` later prevents new markets
from binding `g`; it does not retroactively invalidate markets already bound to it, because those
markets' ids are already fixed. To stop an existing market you deregister the gate at the *validator*,
at which point `_eligible` short-circuits `false` and no new credit or debt can be created there —
while exits stay open, per §3.2.

### §3.4 What this looks like in the live deployment

Four markets, four independent gate bindings:

| Market                 | Market id     | Gate (both slots) | LLTV   | Intended bar   | Registered? |
| ---------------------- | ------------- | ----------------- | ------ | -------------- | ----------- |
| Primary (tWBTC/tUSDC)  | `0xb6f65091…` | `0xd49faa5d…`     | —      | —              | **yes**     |
| Institutional rung     | `0xf28a2f53…` | `0xC8035E76…`     | 91.5%  | sub-tier 30    | no          |
| Professional rung      | `0x8cc388da…` | `0x51545c4f…`     | 77.0%  | sub-tier 20    | no          |
| Retail rung            | `0x7abfc958…` | `0xB50A199c…`     | 38.5%  | sub-tier 10    | no          |

All four gates are `CleanversePoolGate` instances pointed at the same validator
(`0xaC7e5179…`). They are *different instances*, and the validator identifies a pool by its address —
so registration status and rule list are per-gate. Four gates, four independent verdicts.

---

## §4 Passing the primary market and failing the rungs

### §4.1 The two cards ask two different questions

| Card                                        | Question asked                                                        | Answered by                                            |
| ------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `Gate evaluation · primary market` (`:152`) | Does the **primary market's** gate clear this wallet?                  | `useCompliance` → validator, direct                    |
| `Gate evaluation · credit ladder rungs` (`:262`) | Does **each rung's own** gate clear this wallet for debt?         | `useLadder` → `CreditLadderLens.ladder()` → each gate  |

They are not two views of one verdict. They are four verdicts from four gates. **ELIGIBLE** on the
first card is a statement about `0xd49faa5d…` and nothing else.

The page says so in its own source, at `frontend/src/pages/Compliance.tsx:184-188`:

> *Each rung is its own market with its own gate, so a wallet that clears the primary gate can still be
> denied here — and right now every wallet is, because no rung gate has finished registration.*

### §4.2 What actually happens on chain

Nothing happens. That is the accurate answer, and it is worth being precise about what "nothing" covers.

**Reads.** `CreditLadderLens.ladder(wallet, rungMarketIds, borrowAmount)` walks the rung market ids,
re-derives each rung's gate/LLTV/oracle from `covenant.toMarket(id)`, and asks each gate
`canIncreaseDebt(wallet)` through the same bounded staticcall the engine uses. Rungs the wallet clears
are ranked **by LLTV, not by input order**; the best one is returned as `bestRung`. If the wallet clears
none:

```solidity
// src/periphery/CreditLadderLens.sol:93
bestRung = type(uint256).max;
```

`bestRungFor` correspondingly returns `bytes32(0)`. The `rungs` array still comes back fully populated —
each `RungView` carries its `marketId`, `gate`, `lltv`, `collateralRequired`, `minSubTier`, and
`accessible: false`. The UI can render the whole ladder greyed out with correct numbers.

**Writes.** If the wallet ignores the read and submits a fill against a rung market anyway, the engine
performs the same check and reverts:

- taking on debt at that rung → `BorrowerIneligible()` (`src/Covenant.sol:391`)
- supplying credit at that rung → `LenderIneligible()` (`src/Covenant.sol:386`)

The transaction reverts atomically. No partial fill, no state change, no fee.

### §4.3 What does *not* happen

This is the part the split-card layout can obscure:

- **The primary position is untouched.** It lives under market id `0xb6f65091…`. Rung eligibility is
  read from four other ids. Nothing about a rung denial reaches back into it.
- **No existing position anywhere is affected.** Gates are consulted at `fillOffer` and `seize` only.
  A denial at rung-open time cannot retro-block a repay, a withdraw, or a collateral reclaim.
- **The wallet is not "less compliant" than the primary card said.** The primary card's verdict is
  still correct and still actionable — the wallet can lend and borrow in the primary market right now.
- **Nothing needs reconciling.** Passing one gate and failing another is the designed behaviour of a
  system where the gate address is hashed into the market id. A single global verdict would require a
  single global gate, which would make every market share one policy.

The page's visible copy at `:272-276` states the same thing to the user:

> *Each rung is a separate market with its own gate and its own credential bar. Clearing the primary
> gate above does not clear these — the gate address is hashed into the market id, so a rung's terms and
> its policy are one object.*

### §4.4 Today on Monad testnet, every wallet fails every rung — and it is not about credentials

The three rung gates are deployed and `isApprovedGate`-whitelisted, but **none has completed Cleanverse
registration.** So `_eligible` fails on its first clause, before the wallet is ever considered:

```solidity
if (!_readBool(abi.encodeCall(IAPassComplianceValidator.isRegistered, (address(this))))) return false;
```

An unregistered pool has an empty `RuleV2` list. Empty rule list, fail-closed default, everyone denied —
including a wallet holding a perfectly valid full-tier A-Pass.

This distinction matters enough that both the lens and the UI encode it. `CreditLadderLens._minSubTier`
reads the strictest `minSubTier` across the gate's rule list; a gate with no rules returns `0`. `0` is not
a real bar — no policy sets "sub-tier zero required" — so `minSubTier === 0 && accessible === false` is a
reliable signature for *unregistered*, distinguishable from *denied*. Per `LadderGateCard`'s own
reasoning, reporting the former as "you do not qualify" would blame the visitor's credentials for the
protocol's pending step.

`minSubTier` is **advisory display data only**. `accessible` is the decision, and it comes from asking
the gate the same question the market asks it.

### §4.5 Reading the badges

| Badge                   | Condition                                     | Means                                                            |
| ----------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| `Not deployed`          | rung `marketId === null`                       | `DeployLadder.s.sol` not broadcast. Not an error state.           |
| `Eligible`              | `accessible === true`                          | Gate cleared this wallet for debt at this rung, right now.        |
| `Awaiting registration` | `minSubTier === 0 && accessible === false`     | **Protocol-side.** Gate has no rules yet; denies everyone.        |
| `Not evaluated`         | no wallet connected, or read unresolved        | Question not asked. Distinct from a `false` answer.               |
| `Denied`                | `accessible === false` with a non-zero bar     | **Credential-side.** Gate has rules; this wallet does not clear them. |

Only the last row is a statement about the wallet. On the current deployment all three rungs render
`Awaiting registration`.

### §4.6 The reverse case

The asymmetry runs both ways: a wallet can be denied by the primary gate and cleared by a rung gate, if
the rung's registered rule set is broader. There is no ordering, containment, or implication between
gates — four independent predicates, evaluated independently. The ladder's ranking is by LLTV among
rungs the wallet clears; it is not a hierarchy of credential strength that the primary market sits on
top of.

---

## §5 Summary

| Question                                                   | Answer                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| What distinguishes gates?                                  | Two axes: **role** (`entryGate`/`IEnterGate` vs `seizureGate`/`ILiquidatorGate`) and **implementation** (`PermissiveGate` / `CleanversePoolGate` / `CovenantGate`). Only `CovenantGate` differentiates Lend / Borrow / Liquidate. |
| Does a market integrate all gates?                         | **No.** Exactly two slots, its own, immutable, hashed into its market id. No market can see another's gate.                |
| Pass the primary market, fail the rungs — what happens?    | **Nothing.** Rungs are separate markets; their reads return `accessible: false` and `bestRung = type(uint256).max`, their writes revert `BorrowerIneligible()` / `LenderIneligible()`. The primary position is unaffected and fully usable. |
| Is that an inconsistency?                                  | No — it is the direct consequence of gate ∈ market identity. One verdict per gate, not one verdict per wallet.             |
| Why is everyone currently denied on every rung?            | The three rung gates are not yet registered with Cleanverse, so their rule lists are empty and they fail closed. Protocol-side, not credential-side — hence `Awaiting registration`, not `Denied`. |
| Can a denial strand funds?                                 | **No.** Only *increases* are gated. `withdraw`, `repay`, `supplyCollateral`, and `withdrawCollateral` never consult a gate. |
