// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
import {IAPassComplianceValidator} from "../src/compliance/interfaces/IAPassComplianceValidator.sol";

/// @notice Deploys the Covenant lending core in COMPLIANCE-ENFORCED mode, plus (optionally) a
/// CCP-V2-backed gate whitelisted for use in new markets.
///
/// Env:
///   PRIVATE_KEY                — deployer key, hex-prefixed
///   CLEANVERSE_VALIDATOR_ADDRESS — the IAPassComplianceValidator on this chain (optional)
///                                  (falls back to CLEANVERSE_POOL_ADDRESS for backward compatibility)
///   REQUIRE_COMPLIANCE         — "true" to enforce whitelisted-gate at market creation (default: true)
///
/// Post-deploy: after this script prints the gate address, register it as a "pool" with Cleanverse:
///   python3 offchain/cleanverse_client.py register --chain $CLEANVERSE_CHAIN --address <gate>
/// That signs an EIP-191 personal_sign message over the plain lowercase concatenation
/// `chain + gate_address` (no keccak, no separator) — the gate's `owner()` must be the signer.
/// Then set the gate's RuleV2 via `gate.setRule(...)`, which forwards to
/// `validator.setRuleV2FromContract(...)` so `msg.sender` is the registered pool.
///
/// Run:
///   forge script script/DeployCovenant.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract DeployCovenant is Script {
    function run() external {
        uint256 pk       = vm.envUint("PRIVATE_KEY");
        address validatorAddr = vm.envOr("CLEANVERSE_VALIDATOR_ADDRESS", vm.envOr("CLEANVERSE_POOL_ADDRESS", address(0)));
        bool require_    = vm.envOr("REQUIRE_COMPLIANCE", true);

        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        // Deploy the core. The deployer is set as the initial gate admin — the account allowed to
        // approve gate implementations. Transfer to a Safe multisig before mainnet.
        Covenant covenant = new Covenant(require_, deployer);
        console.log("Covenant core     :", address(covenant));
        console.log("  compliance mode :", require_);
        console.log("  gate admin      :", deployer);

        if (validatorAddr != address(0)) {
            CleanversePoolGate gate = new CleanversePoolGate(IAPassComplianceValidator(validatorAddr), deployer);
            console.log("CleanversePoolGate:", address(gate));
            console.log("  bound to validator:", validatorAddr);
            console.log("  NEXT: python3 offchain/cleanverse_client.py register \\");
            console.log("          --chain $CLEANVERSE_CHAIN --address", address(gate));

            // Immediately whitelist the freshly-deployed gate so that a market can be created against it.
            if (require_) {
                covenant.setApprovedGate(address(gate), true);
                console.log("  whitelisted       : yes");
            }
        } else {
            console.log("CLEANVERSE_VALIDATOR_ADDRESS not set - skipping gate deployment.");
            console.log("Reminder: with REQUIRE_COMPLIANCE=true, no market can be created until a gate");
            console.log("is deployed and whitelisted via covenant.setApprovedGate(...).");
        }

        vm.stopBroadcast();
    }
}
