// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {ICleanversePool} from "../../../src/compliance/interfaces/ICleanversePool.sol";

/// @notice Test double for a Cleanverse compliance pool with the failure modes CleanversePoolGate must
/// survive: paused, unregistered, reverting, malformed, and gas-griefing.
contract MockCleanversePool is ICleanversePool {
    mapping(address => bool) internal _verified;
    bool internal _paused;
    bool internal _registered = true;

    /// @notice When true, every read reverts.
    bool public reverting;
    /// @notice When true, every read returns data too short to decode.
    bool public malformed;
    /// @notice When true, every read burns gas in an unbounded loop.
    bool public gasGriefing;

    function setVerified(address user, bool value) external {
        _verified[user] = value;
    }

    function setPaused(bool value) external {
        _paused = value;
    }

    function setRegistered(bool value) external {
        _registered = value;
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

    function verify(address user) external view returns (bool) {
        _applyFailureMode();
        return _verified[user];
    }

    function paused() external view returns (bool) {
        _applyFailureMode();
        return _paused;
    }

    function isRegistered() external view returns (bool) {
        _applyFailureMode();
        return _registered;
    }

    function _applyFailureMode() internal view {
        if (reverting) revert("pool down");

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
