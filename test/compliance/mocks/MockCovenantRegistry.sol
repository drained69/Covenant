// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {ComplianceAction, Identity, ICovenantRegistry} from "../../../src/compliance/interfaces/ICovenantRegistry.sol";

/// @notice Test double for the Cleanverse registry, with switches for the adversarial modes CovenantGate must
/// survive: reverting reads, malformed returns, and unbounded gas consumption.
contract MockCovenantRegistry is ICovenantRegistry {
    mapping(address => Identity) internal _identities;
    mapping(bytes32 => mapping(address => mapping(ComplianceAction => bool))) internal _policyAllows;

    /// @notice When true, every read reverts.
    bool public reverting;
    /// @notice When true, every read returns data too short to decode.
    bool public malformed;
    /// @notice When true, every read burns gas in an unbounded loop.
    bool public gasGriefing;

    function setIdentity(address account, Identity memory identity) external {
        _identities[account] = identity;
    }

    function setPolicy(bytes32 policyId, address account, ComplianceAction action, bool allowed) external {
        _policyAllows[policyId][account][action] = allowed;
    }

    /// @notice Marks `account` fully compliant for all three actions under `policyId`.
    function verify(bytes32 policyId, address account, uint16 jurisdiction) external {
        _identities[account] = Identity({
            credentialId: keccak256(abi.encodePacked("cleanverse-credential", account)),
            jurisdiction: jurisdiction,
            issuedAt: uint64(block.timestamp),
            expiresAt: 0,
            revoked: false
        });
        _policyAllows[policyId][account][ComplianceAction.Lend] = true;
        _policyAllows[policyId][account][ComplianceAction.Borrow] = true;
        _policyAllows[policyId][account][ComplianceAction.Liquidate] = true;
    }

    function revoke(address account) external {
        _identities[account].revoked = true;
    }

    function setReverting(bool value) external {
        reverting = value;
    }

    function setMalformed(bool value) external {
        malformed = value;
    }

    function setGasGriefing(bool value) external {
        gasGriefing = value;
    }

    function identityOf(address account) external view returns (Identity memory) {
        _applyFailureMode();
        return _identities[account];
    }

    function checkPolicy(bytes32 policyId, address account, ComplianceAction action)
        external
        view
        returns (bool)
    {
        _applyFailureMode();
        return _policyAllows[policyId][account][action];
    }

    function _applyFailureMode() internal view {
        if (reverting) revert("registry down");

        if (gasGriefing) {
            // Consume everything forwarded to us.
            uint256 sink;
            while (true) {
                sink = uint256(keccak256(abi.encode(sink)));
            }
        }

        if (malformed) {
            // Return a single byte: too short for either return type to decode.
            assembly ("memory-safe") {
                mstore(0x00, 0x00)
                return(0x00, 0x01)
            }
        }
    }
}
