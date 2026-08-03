// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
import {ICleanversePool} from "../src/compliance/interfaces/ICleanversePool.sol";

/// @notice Deploys the Covenant lending core in COMPLIANCE-ENFORCED mode, plus (optionally) a
/// Cleanverse-backed gate whitelisted for use in new markets.
///
/// Env:
///   PRIVATE_KEY              — deployer key, hex-prefixed
///   CLEANVERSE_POOL_ADDRESS  — existing Cleanverse compliance pool on this chain (optional)
///   REQUIRE_COMPLIANCE       — "true" to enforce whitelisted-gate at market creation (default: true)
///
/// Run:
///   forge script script/DeployCovenant.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract DeployCovenant is Script {
    function run() external {
        uint256 pk       = vm.envUint("PRIVATE_KEY");
        address poolAddr = vm.envOr("CLEANVERSE_POOL_ADDRESS", address(0));
        bool require_    = vm.envOr("REQUIRE_COMPLIANCE", true);

        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        // Deploy the core. The deployer is set as the initial gate admin — the account allowed to
        // approve gate implementations. Transfer to a Safe multisig before mainnet.
        Covenant covenant = new Covenant(require_, deployer);
        console.log("Covenant core     :", address(covenant));
        console.log("  compliance mode :", require_);
        console.log("  gate admin      :", deployer);

        if (poolAddr != address(0)) {
            CleanversePoolGate gate = new CleanversePoolGate(ICleanversePool(poolAddr));
            console.log("CleanversePoolGate:", address(gate));
            console.log("  bound to pool   :", poolAddr);

            // Immediately whitelist the freshly-deployed gate so that a market can be created against it.
            if (require_) {
                covenant.setApprovedGate(address(gate), true);
                console.log("  whitelisted     : yes");
            }
        } else {
            console.log("CLEANVERSE_POOL_ADDRESS not set - skipping gate deployment.");
            console.log("Reminder: with REQUIRE_COMPLIANCE=true, no market can be created until a gate");
            console.log("is deployed and whitelisted via covenant.setApprovedGate(...).");
        }

        vm.stopBroadcast();
    }
}
