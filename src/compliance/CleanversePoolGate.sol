// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IEnterGate, ILiquidatorGate} from "../interfaces/IGate.sol";
import {ICleanversePool} from "./interfaces/ICleanversePool.sol";

/// @title CleanversePoolGate
/// @notice Market gate that reads a Cleanverse compliance pool directly.
/// @dev Fail-closed, never-reverts, gas-bounded. See README §Function coverage for placement.
contract CleanversePoolGate is IEnterGate, ILiquidatorGate {
    /// @dev Cap on gas per pool read: bounds a misbehaving pool from DoS-ing the enclosing trade.
    uint256 internal constant POOL_GAS_LIMIT = 150_000;

    /// @notice The Cleanverse compliance pool this gate reads. Immutable — rebinding requires a new gate
    /// and therefore a new market id.
    ICleanversePool public immutable pool;

    /// @notice Thrown when constructed with a zero pool address.
    error ZeroPool();

    constructor(ICleanversePool pool_) {
        require(address(pool_) != address(0), ZeroPool());
        pool = pool_;
    }

    /// @inheritdoc IEnterGate
    function canIncreaseCredit(address account) external view returns (bool) { return _eligible(account); }

    /// @inheritdoc IEnterGate
    function canIncreaseDebt(address account) external view returns (bool) { return _eligible(account); }

    /// @inheritdoc ILiquidatorGate
    function canLiquidate(address account) external view returns (bool) { return _eligible(account); }

    /// @dev `isRegistered → paused → verify`, short-circuiting on the first denial. Any failure denies.
    function _eligible(address account) internal view returns (bool) {
        if (!_readBool(abi.encodeCall(ICleanversePool.isRegistered, ()))) return false;
        if (_readBool(abi.encodeCall(ICleanversePool.paused, ()))) return false;
        return _readBool(abi.encodeCall(ICleanversePool.verify, (account)));
    }

    /// @dev Bounded staticcall, boolean-decoded. Any failure (revert, short return, no code) → `false`.
    function _readBool(bytes memory data) internal view returns (bool) {
        (bool ok, bytes memory result) = address(pool).staticcall{gas: POOL_GAS_LIMIT}(data);
        if (!ok || result.length < 32) return false;
        return abi.decode(result, (bool));
    }
}
