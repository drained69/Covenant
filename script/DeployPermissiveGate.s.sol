// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {PermissiveGate} from "../src/compliance/PermissiveGate.sol";

/// @notice Deploys a testnet demo gate that approves everyone. Use ONLY while waiting on a real
/// Cleanverse compliance pool address; a market bound to this gate is not compliance-gated in any
/// meaningful sense — just permissioned by the market's existence.
///
/// Env: PRIVATE_KEY
contract DeployPermissiveGate is Script {
    function run() external returns (address) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        PermissiveGate gate = new PermissiveGate();
        vm.stopBroadcast();

        console.log("PermissiveGate:", address(gate));
        console.log("  NOTE: demo gate. Replace with CleanversePoolGate before production.");
        return address(gate);
    }
}
