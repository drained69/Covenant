// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {CreditLadderLens} from "../src/periphery/CreditLadderLens.sol";
import {ICovenant} from "../src/interfaces/ICovenant.sol";

/// @notice Deploys the `CreditLadderLens` — the stateless read router the frontend rung panel and
/// any routing integrator call to resolve a wallet to its best ladder rung.
///
/// **Safe to redeploy at will.** The lens holds no state, no config, and no privileges: it derives
/// every rung's gate, LLTV, and oracle from the market id via `ICovenant.toMarket`. Nothing points
/// at it on-chain, so replacing it is a frontend config change, not a migration. That also means it
/// is NOT part of market identity — deploying a new lens cannot alter any market or position.
///
/// Env:
///   PRIVATE_KEY              — deployer key, hex-prefixed
///   COVENANT_CORE_ADDRESS    — the Covenant core whose markets form the ladder (REQUIRED; the lens
///                              resolves market ids against this core and nothing else)
///
/// Optional — enables the post-deploy smoke read:
///   RUNG_MARKET_IDS          — comma-separated rung market ids, as printed by DeployLadder.s.sol
///   LADDER_PROBE_WALLET      — wallet to evaluate in the smoke read (default: the deployer)
///   LADDER_PROBE_AMOUNT      — loan-token amount to size collateral against (default: 1000e6)
///
/// Run:
///   forge script script/DeployLadderLens.s.sol --rpc-url $RPC_URL --broadcast --legacy
///
/// Then verify (Monad testnet uses Sourcify, not Etherscan):
///   forge verify-contract <addr> src/periphery/CreditLadderLens.sol:CreditLadderLens \
///     --chain 10143 --verifier sourcify \
///     --verifier-url https://sourcify-api-monad.blockvision.org/
contract DeployLadderLens is Script {
    function run() external returns (address lensAddress) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address covenantAddr = vm.envAddress("COVENANT_CORE_ADDRESS");
        require(covenantAddr != address(0), "COVENANT_CORE_ADDRESS unset");

        vm.startBroadcast(pk);
        CreditLadderLens lens = new CreditLadderLens(ICovenant(covenantAddr));
        lensAddress = address(lens);
        vm.stopBroadcast();

        console.log("=========================================");
        console.log("CreditLadderLens :", lensAddress);
        console.log("  covenant core  :", covenantAddr);
        console.log("=========================================");

        _smokeRead(lens, vm.addr(pk));

        console.log("");
        console.log("NEXT STEPS");
        console.log("1. Verify on Sourcify (see the run command in this script's docstring).");
        console.log("2. Put the address in the frontend config as COVENANT_LADDER_LENS_ADDRESS.");
        console.log("3. The frontend calls ladder(wallet, rungMarketIds, borrowAmount) - the rung ids");
        console.log("   come from DeployLadder.s.sol output and are the ONLY ladder config anywhere.");
    }

    /// @dev Reads the ladder back through the freshly deployed lens. A rung whose LLTV comes back as
    /// zero means the id does not resolve against this core — catches a lens pointed at the wrong
    /// Covenant, or rung ids copied from a different deployment, before the UI ever sees it.
    function _smokeRead(CreditLadderLens lens, address deployer) internal view {
        bytes32[] memory rungIds = vm.envOr("RUNG_MARKET_IDS", ",", new bytes32[](0));
        if (rungIds.length == 0) {
            console.log("");
            console.log("(RUNG_MARKET_IDS unset - skipping smoke read)");
            return;
        }

        address wallet = vm.envOr("LADDER_PROBE_WALLET", deployer);
        uint256 amount = vm.envOr("LADDER_PROBE_AMOUNT", uint256(1000e6));

        console.log("");
        console.log("SMOKE READ - ladder(wallet, rungIds, amount)");
        console.log("  wallet :", wallet);
        console.log("  amount :", amount);

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(wallet, rungIds, amount);

        for (uint256 i = 0; i < rungs.length; i++) {
            console.log("");
            console.log(string.concat("  Rung ", vm.toString(i + 1), " ", vm.toString(rungs[i].marketId)));
            console.log("    gate               :", rungs[i].gate);
            console.log("    lltv               :", rungs[i].lltv);
            console.log("    minSubTier         :", rungs[i].minSubTier);
            console.log("    collateralRequired :", rungs[i].collateralRequired);
            console.log("    accessible         :", rungs[i].accessible);
            require(rungs[i].lltv != 0, "rung resolved to zero LLTV - wrong core or wrong rung id");
        }

        console.log("");
        if (bestRung == type(uint256).max) {
            console.log("  best rung: NONE - this wallet clears no rung (expected pre-registration)");
        } else {
            console.log("  best rung index :", bestRung);
            console.log("  best rung lltv  :", rungs[bestRung].lltv);
        }
    }
}
