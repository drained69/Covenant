// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IEnterGate, ILiquidatorGate} from "../interfaces/IGate.sol";

/// @title PermissiveGate
/// @notice A demo gate that approves every account for every action.
/// @dev **Testnet demo only.** Exists so a market can be created and exercised end-to-end while the
/// canonical `CleanversePoolGate` is waiting on a live Cleanverse compliance pool address. Because
/// gate addresses are part of the market's identity, a market bound to this gate is a *different*
/// market from one bound to `CleanversePoolGate` — swapping the gate later means creating a new
/// market. Do not whitelist this on a production Covenant instance.
contract PermissiveGate is IEnterGate, ILiquidatorGate {
    function canIncreaseCredit(address) external pure returns (bool) { return true; }
    function canIncreaseDebt(address)   external pure returns (bool) { return true; }
    function canLiquidate(address)      external pure returns (bool) { return true; }
}
