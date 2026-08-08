// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {EcrecoverNotary} from "../src/notaries/EcrecoverNotary.sol";

/// @notice Deploys the EcrecoverNotary contract required for signed offer verification.
///
/// Required Environment Variables:
///   COVENANT_CORE_ADDRESS  — Address of the deployed Covenant core contract
///
/// Usage:
///   forge script script/DeployEcrecoverNotary.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract DeployEcrecoverNotaryScript is Script {
    function run() external returns (address notaryAddr) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        require(pk != 0, "PRIVATE_KEY required");

        address covenantAddr = vm.envOr("COVENANT_CORE_ADDRESS", address(0));
        require(covenantAddr != address(0), "COVENANT_CORE_ADDRESS required");

        vm.startBroadcast(pk);

        EcrecoverNotary notary = new EcrecoverNotary(covenantAddr);
        notaryAddr = address(notary);

        console.log("=========================================");
        console.log("Successfully Deployed EcrecoverNotary!");
        console.log("Notary Address  :", notaryAddr);
        console.log("Covenant Address:", covenantAddr);
        console.log("=========================================");

        vm.stopBroadcast();
    }
}
