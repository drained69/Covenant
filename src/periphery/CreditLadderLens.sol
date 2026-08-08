// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {ICovenant, Market} from "../interfaces/ICovenant.sol";
import {IEnterGate} from "../interfaces/IGate.sol";
import {IOracle} from "../interfaces/IOracle.sol";
import {RuleV2} from "../compliance/interfaces/IAPassComplianceValidator.sol";
import {ORACLE_PRICE_SCALE, WAD} from "../libraries/ConstantsLib.sol";
import {UtilsLib} from "../libraries/UtilsLib.sol";

/// @title CreditLadderLens
/// @notice Pure-view router for the tiered credit ladder: given a wallet and a set of rung market ids,
/// returns the highest rung the wallet clears, its market id, LLTV, and the collateral it must post.
///
/// @dev **Zero state, zero privileges, zero engine coupling.** The lens holds no rung configuration.
/// `ICovenant.toMarket(id)` reconstructs the full `Market` struct — including `entryGate`, each
/// `CollateralParams.lltv`, and `.oracle` — out of the CREATE2 code-storage at the id-derived address,
/// so every rung's policy and terms are derived from its market id alone. There is no duplicated
/// config to desynchronize from the chain, and no admin who could point a rung at the wrong gate.
///
/// That is the mechanical form of the ladder's core claim: the LLTV a borrower gets is a consequence
/// of the credential their wallet carries, because the gate that checks the credential and the LLTV
/// that prices the loan are the same object — the market id.
///
/// **Fail-closed throughout.** Every external read (gate eligibility, oracle price, rule list) is a
/// bounded-gas staticcall whose failure resolves to the safe value: not eligible, no price, no rule.
/// A reverting gate never reads as "allowed", and a stale oracle never reads as "cheap collateral".
///
/// Intended consumers: the frontend rung panel, and any integrator routing a borrower to the best
/// terms their credential admits. Both read the same function.
contract CreditLadderLens {
    /// @dev Gas stipend for gate eligibility reads. Matches `CleanversePoolGate.VALIDATOR_GAS_LIMIT`,
    /// which is itself the bound Covenant applies when calling the gate.
    uint256 internal constant GATE_GAS_LIMIT = 150_000;

    /// @dev Gas stipend for oracle price reads. Matches the gate bound; oracle reads are comparable.
    uint256 internal constant ORACLE_GAS_LIMIT = 150_000;

    /// @dev Gas stipend for rule-list reads. Higher than the others: `getRules()` hops through the gate
    /// into the validator and returns a dynamic array. This read is advisory (it powers the "what
    /// credential closes the gap" hint), so a gate that exceeds the bound degrades to `minSubTier = 0`
    /// rather than reverting the whole ladder view.
    uint256 internal constant RULES_GAS_LIMIT = 500_000;

    /// @notice The Covenant core whose markets define the ladder.
    ICovenant public immutable COVENANT;

    /// @notice Per-rung view: the terms, the policy bar, and whether this wallet clears it.
    struct RungView {
        /// @notice Market id of the rung. Contains the gate address in its preimage.
        bytes32 marketId;
        /// @notice The rung's compliance gate (`Market.entryGate`), read from the market id.
        address gate;
        /// @notice Liquidation LTV for the rung's collateral, in WAD.
        uint256 lltv;
        /// @notice Collateral required to borrow `borrowAmount` at this rung, in collateral-token units.
        /// Rounded up. Zero when `borrowAmount` is zero or the oracle read failed.
        uint256 collateralRequired;
        /// @notice Highest `RuleV2.minSubTier` across the gate's rule list — the credential bar to clear.
        /// Zero when the gate exposes no rules, is not a `CleanversePoolGate`, or the read failed.
        /// @dev Rules are OR-composed, so a wallet clears the gate by satisfying any one of them; this is
        /// the strictest bar and is advisory display data, not the eligibility decision. `accessible` is.
        uint8 minSubTier;
        /// @notice Whether `wallet` may increase debt at this rung right now.
        bool accessible;
    }

    /// @param covenant_ The Covenant core to resolve market ids against.
    constructor(ICovenant covenant_) {
        COVENANT = covenant_;
    }

    /// @notice Resolves a wallet to its best rung and returns the full ladder for display.
    /// @dev Rungs are ranked by LLTV, not by array position: the "highest" rung is the accessible one
    /// offering the most capital efficiency, regardless of the order ids were passed in. A caller cannot
    /// mislead the lens by reordering its input.
    ///
    /// Reverts only if a supplied id is not a created market (`toMarket` enforces this) or if a rung has
    /// no collateral params. Every other failure mode degrades to the fail-closed value.
    ///
    /// @param wallet Account to evaluate. `address(0)` is permitted and resolves to no rung.
    /// @param rungMarketIds Market ids of the ladder's rungs, in any order.
    /// @param borrowAmount Loan-token amount to size collateral against. Zero skips the oracle reads.
    /// @return bestRung Index into `rungs` of the best accessible rung, or `type(uint256).max` if none.
    /// @return rungs Per-rung detail, in the order the ids were supplied.
    function ladder(address wallet, bytes32[] calldata rungMarketIds, uint256 borrowAmount)
        public
        view
        returns (uint256 bestRung, RungView[] memory rungs)
    {
        rungs = new RungView[](rungMarketIds.length);
        bestRung = type(uint256).max;

        uint256 bestLltv;

        for (uint256 i = 0; i < rungMarketIds.length; i++) {
            bytes32 id = rungMarketIds[i];

            // Decodes the market out of code storage at the id-derived address. This is the whole
            // reason the lens needs no config: gate, LLTV, and oracle all arrive from the id.
            Market memory market = COVENANT.toMarket(id);

            // The ladder's rungs are single-collateral by construction (see script/DeployLadder.s.sol).
            // Index 0 is the rung's collateral; a multi-collateral market is out of scope for the lens.
            uint256 lltv = market.collateralParams[0].lltv;
            address oracle = market.collateralParams[0].oracle;
            address gate = market.entryGate;

            bool accessible = _canIncreaseDebt(gate, wallet);

            rungs[i] = RungView({
                marketId: id,
                gate: gate,
                lltv: lltv,
                collateralRequired: _collateralRequired(borrowAmount, lltv, oracle),
                minSubTier: _minSubTier(gate),
                accessible: accessible
            });

            // Rank by terms, not by input order. Strict `>` keeps the first of two equal-LLTV rungs.
            if (accessible && lltv > bestLltv) {
                bestLltv = lltv;
                bestRung = i;
            }
        }
    }

    /// @notice Convenience wrapper returning only the winning rung's terms.
    /// @dev For integrators that route a borrow and do not render the ladder. Same ranking as `ladder`.
    /// @param wallet Account to evaluate.
    /// @param rungMarketIds Market ids of the ladder's rungs, in any order.
    /// @param borrowAmount Loan-token amount to size collateral against.
    /// @return marketId Best accessible rung's market id, or `bytes32(0)` if the wallet clears none.
    /// @return lltv That rung's LLTV, or zero.
    /// @return collateralRequired Collateral to post at that rung for `borrowAmount`, or zero.
    function bestRungFor(address wallet, bytes32[] calldata rungMarketIds, uint256 borrowAmount)
        external
        view
        returns (bytes32 marketId, uint256 lltv, uint256 collateralRequired)
    {
        (uint256 bestRung, RungView[] memory rungs) = ladder(wallet, rungMarketIds, borrowAmount);
        if (bestRung == type(uint256).max) return (bytes32(0), 0, 0);

        RungView memory best = rungs[bestRung];
        return (best.marketId, best.lltv, best.collateralRequired);
    }

    /// @notice Collateral needed to borrow `borrowAmount` against a collateral valued by `oracle` at `lltv`.
    /// @dev Inverts Covenant's health condition. `Covenant.isHealthy` credits a collateral as
    ///
    ///     maxDebt += floor(floor(collateral * price / ORACLE_PRICE_SCALE) * lltv / WAD)
    ///
    /// and accepts the position when `maxDebt >= debt`. That is **two sequential floors, price applied
    /// before lltv** — and the inverse must undo them in the opposite order, lltv before price:
    ///
    ///     k = ceil(debt * WAD / lltv)                 // smallest oracle-scaled value clearing lltv
    ///     collateral = ceil(k * ORACLE_PRICE_SCALE / price)
    ///
    /// Inverting in the engine's own order instead — `ceil(ceil(debt * SCALE / price) * WAD / lltv)` —
    /// does not compensate for the engine's *intermediate* truncation and can under-quote. Concretely, at
    /// `debt = 1, lltv = 0.915e18, price = 5e35` that expression yields 3, but the engine floors
    /// `3 * 5e35 / 1e36` to 1 and then `1 * 0.915e18 / 1e18` to 0, so `0 >= 1` fails. The correct order
    /// returns 4, which the engine credits as 1. A quote that is short by a wei is not a rounding nit:
    /// the borrow reverts with `UnhealthyBorrower`.
    ///
    /// This matches `BaseTest.collateralize`, which sizes every position in the existing suite the same
    /// way. Both divisions round up, so the result rounds against the borrower and is always sufficient.
    /// Split into two `mulDivUp` calls to keep each intermediate product below 2**256.
    /// @param borrowAmount Loan-token amount to borrow. Zero returns zero without touching the oracle.
    /// @param lltv Liquidation LTV in WAD. Zero returns zero (no borrowing capacity to invert).
    /// @param oracle Price feed for the collateral. A failing feed returns zero.
    /// @return Collateral-token amount, rounded up. The minimum that satisfies `isHealthy`.
    function _collateralRequired(uint256 borrowAmount, uint256 lltv, address oracle) internal view returns (uint256) {
        if (borrowAmount == 0 || lltv == 0) return 0;

        uint256 price = _price(oracle);
        if (price == 0) return 0;

        return UtilsLib.mulDivUp(UtilsLib.mulDivUp(borrowAmount, WAD, lltv), ORACLE_PRICE_SCALE, price);
    }

    /// @notice Whether `wallet` may increase debt behind `gate`, resolving every failure to `false`.
    /// @dev Mirrors `CleanversePoolGate._readBool`: bounded-gas staticcall, revert / out-of-gas / short
    /// return all read as denial. This is the same call Covenant itself makes on the borrow path, so the
    /// lens and the engine agree by construction.
    function _canIncreaseDebt(address gate, address wallet) internal view returns (bool) {
        if (gate == address(0)) return false;

        (bool ok, bytes memory result) =
            gate.staticcall{gas: GATE_GAS_LIMIT}(abi.encodeCall(IEnterGate.canIncreaseDebt, (wallet)));
        if (!ok || result.length < 32) return false;

        return abi.decode(result, (bool));
    }

    /// @notice Reads `oracle.price()`, resolving failure to zero.
    /// @dev Oracles are expected to revert rather than return a stale or zero value, so zero is both the
    /// failure signal and a value the caller must already handle. Callers treat it as "no quote".
    function _price(address oracle) internal view returns (uint256) {
        if (oracle == address(0)) return 0;

        (bool ok, bytes memory result) = oracle.staticcall{gas: ORACLE_GAS_LIMIT}(abi.encodeCall(IOracle.price, ()));
        if (!ok || result.length < 32) return 0;

        return abi.decode(result, (uint256));
    }

    /// @notice Strictest `minSubTier` across a gate's rule list, or zero if unreadable.
    /// @dev Advisory only — it powers the "you need sub-tier N" hint in the rung panel. The eligibility
    /// decision is always `_canIncreaseDebt`, which asks the validator directly. Decoding is wrapped so
    /// that a gate without `getRules()`, an unregistered gate, or a malformed return degrades to zero
    /// rather than reverting the ladder view.
    ///
    /// Rules are OR-composed, so a wallet clears the gate by matching any single rule. Reporting the
    /// maximum states the bar that clears every rule, which is the conservative thing to show a user
    /// deciding whether to upgrade a credential.
    function _minSubTier(address gate) internal view returns (uint8) {
        if (gate == address(0)) return 0;

        // `CleanversePoolGate.getRules()` forwards to `validator.getRulesV2(address(this))`.
        (bool ok, bytes memory result) = gate.staticcall{gas: RULES_GAS_LIMIT}(abi.encodeWithSignature("getRules()"));
        if (!ok || result.length < 64) return 0;

        // A malformed array head would make `abi.decode` revert, which a view call cannot catch inline.
        // `try` on an external self-call gives the decode a revert boundary.
        try this.decodeRules(result) returns (RuleV2[] memory rules) {
            uint8 highest;
            for (uint256 i = 0; i < rules.length; i++) {
                if (rules[i].minSubTier > highest) highest = rules[i].minSubTier;
            }
            return highest;
        } catch {
            return 0;
        }
    }

    /// @notice ABI-decodes a `RuleV2[]` return payload. External so `_minSubTier` can `try` it.
    /// @dev Not intended to be called directly. Pure, no state, no authority — safe to expose.
    function decodeRules(bytes calldata data) external pure returns (RuleV2[] memory) {
        return abi.decode(data, (RuleV2[]));
    }
}
