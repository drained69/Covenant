// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
import {IAPassComplianceValidator} from "../src/compliance/interfaces/IAPassComplianceValidator.sol";

/// @notice Deploys a `CleanversePoolGate` bound to an existing CVI Compliance Validator on the
/// current chain, and whitelists the new gate on an already-deployed Covenant core.
///
/// Env:
///   PRIVATE_KEY                    — deployer key, hex-prefixed
///   COVENANT_CORE_ADDRESS          — existing Covenant core to whitelist against (optional; if
///                                    unset, just deploys the gate without whitelisting)
///   CLEANVERSE_VALIDATOR_ADDRESS   — the IAPassComplianceValidator on this chain
///                                    (falls back to CLEANVERSE_POOL_ADDRESS for backward compatibility)
///
/// Run:
///   forge script script/DeployCleanverseGate.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract DeployCleanverseGate is Script {
    function run() external returns (address gateAddress) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address covenantAddr = vm.envOr("COVENANT_CORE_ADDRESS", address(0));
        address validatorAddr = vm.envOr(
            "CLEANVERSE_VALIDATOR_ADDRESS",
            vm.envOr("CLEANVERSE_POOL_ADDRESS", address(0))
        );

        require(validatorAddr != address(0), "CLEANVERSE_VALIDATOR_ADDRESS (or CLEANVERSE_POOL_ADDRESS) unset");

        vm.startBroadcast(pk);

        // Gate owner defaults to the deployer — the wallet that will sign the CCP V2 registration
        // message. Transfer to a Safe multisig via `gate.transferOwnership(...)` post-registration.
        address gateOwner = vm.envOr("GATE_OWNER", vm.addr(pk));
        CleanversePoolGate gate = new CleanversePoolGate(IAPassComplianceValidator(validatorAddr), gateOwner);
        gateAddress = address(gate);

        console.log("CleanversePoolGate    :", gateAddress);
        console.log("  bound to validator  :", validatorAddr);

        if (covenantAddr != address(0)) {
            Covenant(covenantAddr).setApprovedGate(gateAddress, true);
            console.log("  whitelisted on core :", covenantAddr);
        } else {
            console.log("  (COVENANT_CORE_ADDRESS unset, skipping setApprovedGate)");
        }

        vm.stopBroadcast();

        console.log("NEXT: register the gate with Cleanverse via");
        console.log("      python3 offchain/cleanverse_client.py register --chain $CLEANVERSE_CHAIN --address", gateAddress);
        console.log("      (signs with EIP-191 personal_sign over chain + address_lowercase)");
    }
}
