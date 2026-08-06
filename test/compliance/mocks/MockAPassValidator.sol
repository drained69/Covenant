// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {IAPassComplianceValidator, RuleV2} from "../../../src/compliance/interfaces/IAPassComplianceValidator.sol";

/// @notice Test double for the CVI Compliance Validator (CCP V2) with the failure modes callers must
/// survive: paused (via `complianceVerify → false`), unregistered, reverting, malformed, and
/// gas-griefing. `pool` and `user` addresses are indexed just like the real validator would.
contract MockAPassValidator is IAPassComplianceValidator {
    /// @dev (pool, user) → verified. A "paused" pool is modelled by clearing the pool's rules or
    /// by toggling `_pausedPool[pool]`, which forces `complianceVerify` to return false regardless
    /// of user state — mirroring how CCP V2 folds pause into the verification answer.
    mapping(address => mapping(address => bool)) internal _verified;
    mapping(address => bool) internal _pausedPool;
    mapping(address => bool) internal _registeredPool;
    mapping(address => RuleV2[]) internal _rules;

    /// @notice When true, every read reverts.
    bool public reverting;
    /// @notice When true, every read returns data too short to decode.
    bool public malformed;
    /// @notice When true, every read burns gas in an unbounded loop.
    bool public gasGriefing;

    /* ── Test-only setters ─────────────────────────────────────────────── */

    /// @notice Marks `pool` as registered. Test helper — the real validator does this via
    /// `POST /api/cooperate/validator/register` off-chain and `registerV2` on-chain.
    function setRegistered(address pool, bool value) external { _registeredPool[pool] = value; }
    function setPaused(address pool, bool value) external { _pausedPool[pool] = value; }
    function setVerified(address pool, address user, bool value) external { _verified[pool][user] = value; }

    function setReverting(bool value) external { reverting = value; }
    function setMalformed(bool value) external { malformed = value; }
    function setGasGriefing(bool value) external { gasGriefing = value; }

    /* ── IAPassComplianceValidator — permissionless reads ─────────────── */

    function complianceVerify(address poolAddress, address userAddress) external view returns (bool) {
        _applyFailureMode();
        if (_pausedPool[poolAddress]) return false;          // paused pool → deny (CCP V2 semantics)
        return _verified[poolAddress][userAddress];
    }

    function isRegistered(address poolAddress) external view returns (bool) {
        _applyFailureMode();
        return _registeredPool[poolAddress];
    }

    /* ── Rule management (owner-of-registered-pool surface) ───────────── */

    function setRuleV2FromContract(RuleV2 calldata rule) external {
        delete _rules[msg.sender];
        _rules[msg.sender].push(rule);
    }

    function addRuleV2FromContract(RuleV2 calldata rule) external {
        _rules[msg.sender].push(rule);
    }

    function removeRuleV2FromContract(uint256 index) external {
        RuleV2[] storage rs = _rules[msg.sender];
        require(index < rs.length, "index oob");
        rs[index] = rs[rs.length - 1];
        rs.pop();
    }

    function getRulesV2(address poolAddress) external view returns (RuleV2[] memory) {
        return _rules[poolAddress];
    }

    /* ── Failure injection ────────────────────────────────────────────── */

    function _applyFailureMode() internal view {
        if (reverting) revert("validator down");

        if (gasGriefing) {
            uint256 sink;
            while (true) {
                sink = uint256(keccak256(abi.encode(sink)));
            }
        }

        if (malformed) {
            assembly ("memory-safe") {
                mstore(0x00, 0x00)
                return(0x00, 0x01)
            }
        }
    }
}
