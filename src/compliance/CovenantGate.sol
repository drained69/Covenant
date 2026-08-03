// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IEnterGate, ILiquidatorGate} from "../interfaces/IGate.sol";
import {ComplianceAction, Identity, ICovenantRegistry} from "./interfaces/ICovenantRegistry.sol";

/// @title CovenantGate
/// @notice Compliance gate binding a fixed-maturity credit market to the Covenant attestation registry.
/// @dev Implements both market gate roles:
/// - `IEnterGate` decides whether an account may increase credit (lend) or debt (borrow).
/// - `ILiquidatorGate` decides whether an account may seize.
///
/// Two properties are load-bearing and deliberate:
///
/// 1. **Never reverts.** The market calls these hooks inline while settling a trade. A reverting gate would
///    bubble up and make the market unusable, so every external read is performed via a bounded `staticcall`
///    whose failure is interpreted rather than propagated. Callers observe the market's own domain error
///    instead of an opaque revert from compliance infrastructure.
///
/// 2. **Fails closed.** If the registry is unreachable, returns malformed data, or the policy permit is absent,
///    the answer is `false`. Denying an unverifiable participant is the correct compliance posture. Note that
///    only *increases* are gated: existing positions remain settleable at maturity, so a registry outage
///    cannot strand capital that has already been committed.
///
/// The gate holds no funds, has no admin, and has no mutable state. Policy evolves inside the attestation
/// registry this contract reads, not by changing this contract.
contract CovenantGate is IEnterGate, ILiquidatorGate {
    /// @notice Gas forwarded to each registry read.
    /// @dev Bounds the influence of a misbehaving or griefing registry: without a cap, a registry that
    /// consumes all available gas would leave the 1/64 remainder insufficient to complete the trade,
    /// converting a compliance denial into a market-wide denial of service. Generous enough for a storage
    /// read plus policy evaluation.
    uint256 internal constant REGISTRY_GAS_LIMIT = 150_000;

    /// @notice The Covenant attestation registry this gate reads. Populated by attesters from Cleanverse verdicts.
    ICovenantRegistry public immutable REGISTRY;

    /// @notice Identifier of the compliance policy this market is governed by.
    /// @dev Selects the jurisdiction rules, sanctions lists, and asset eligibility applied to participants.
    bytes32 public immutable POLICY_ID;

    /// @notice Thrown when constructed with a zero registry address, which would make the gate deny everything.
    error ZeroRegistry();

    /// @notice Thrown when constructed with a zero policy id, which no real policy uses.
    error ZeroPolicyId();

    /// @param registry The Covenant attestation registry to read attestations and policy permits from.
    /// @param policyId The compliance policy governing participants in the market that binds this gate.
    constructor(ICovenantRegistry registry, bytes32 policyId) {
        require(address(registry) != address(0), ZeroRegistry());
        require(policyId != bytes32(0), ZeroPolicyId());

        REGISTRY = registry;
        POLICY_ID = policyId;
    }

    /* IEnterGate */

    /// @inheritdoc IEnterGate
    function canIncreaseCredit(address account) external view returns (bool) {
        return _isCompliant(account, ComplianceAction.Lend);
    }

    /// @inheritdoc IEnterGate
    function canIncreaseDebt(address account) external view returns (bool) {
        return _isCompliant(account, ComplianceAction.Borrow);
    }

    /* ILiquidatorGate */

    /// @inheritdoc ILiquidatorGate
    function canLiquidate(address account) external view returns (bool) {
        return _isCompliant(account, ComplianceAction.Liquidate);
    }

    /* INTERNAL */

    /// @notice Returns whether `account` currently satisfies both credential and policy requirements for
    /// `action`.
    /// @dev Both checks must pass. The credential check enforces cheap local invariants (present, unrevoked,
    /// unexpired); the policy permit is authoritative for jurisdiction, sanctions, and asset eligibility.
    /// Evaluating the credential first short-circuits the more expensive policy read for unverified accounts.
    function _isCompliant(address account, ComplianceAction action) internal view returns (bool) {
        return _hasLiveCredential(account) && _policyAllows(account, action);
    }

    /// @notice Returns whether `account` holds an attestation that is present, unrevoked, and unexpired.
    function _hasLiveCredential(address account) internal view returns (bool) {
        (bool ok, bytes memory data) = address(REGISTRY).staticcall{gas: REGISTRY_GAS_LIMIT}(
            abi.encodeCall(ICovenantRegistry.identityOf, (account))
        );

        // An `Identity` encodes as five 32-byte words. A short or failed response is not evidence of
        // compliance, so treat it as denial.
        if (!ok || data.length < 160) return false;

        Identity memory identity = abi.decode(data, (Identity));

        if (identity.credentialId == bytes32(0)) return false;
        if (identity.revoked) return false;
        if (identity.issuedAt > block.timestamp) return false;
        // A zero `expiresAt` denotes a credential with no expiry.
        if (identity.expiresAt != 0 && identity.expiresAt <= block.timestamp) return false;

        return true;
    }

    /// @notice Returns whether the registry permits `action` for `account` under `POLICY_ID`.
    function _policyAllows(address account, ComplianceAction action) internal view returns (bool) {
        (bool ok, bytes memory data) = address(REGISTRY).staticcall{gas: REGISTRY_GAS_LIMIT}(
            abi.encodeCall(ICovenantRegistry.checkPolicy, (POLICY_ID, account, action))
        );

        if (!ok || data.length < 32) return false;

        return abi.decode(data, (bool));
    }
}
