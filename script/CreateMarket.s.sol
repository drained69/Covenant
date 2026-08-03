// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
import {ICleanversePool} from "../src/compliance/interfaces/ICleanversePool.sol";
import {BtcUsdOracle} from "../src/oracles/BtcUsdOracle.sol";
import {LLTV_3, LIQUIDATION_CURSOR_LOW, maxLif} from "../src/libraries/ConstantsLib.sol";

/// @notice Initializes an institutional credit market on Covenant bound to a Cleanverse compliance gate.
///
/// Required Environment Variables:
///   COVENANT_ADDRESS         — Address of the deployed Covenant core contract
///   LOAN_TOKEN_ADDRESS       — Address of the loan token (e.g. TestUSDC)
///   COLLATERAL_TOKEN_ADDRESS — Address of the collateral token (e.g. TestWBTC)
///   ORACLE_ADDRESS           — Address of the price oracle for collateral/loan pair
///   GATE_ADDRESS             — Address of the CleanversePoolGate or CovenantGate
///   MATURITY_DAYS            — Number of days until market maturity (default: 90)
///
/// Usage:
///   forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract CreateMarketScript is Script {
    function run() external returns (bytes32 marketId) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address covenantAddr = vm.envOr("COVENANT_ADDRESS", address(0xe750e811ccE4de68DEe2aC483EE7cAc8ED76875b));
        address loanToken = vm.envOr("LOAN_TOKEN_ADDRESS", address(0));
        address collateralToken = vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        address oracleAddr = vm.envOr("ORACLE_ADDRESS", address(0x0C19a3f5441B519803C34f4fc703c7ce3b2b62de));
        address gateAddr = vm.envOr("GATE_ADDRESS", address(0));
        uint256 maturityDays = vm.envOr("MATURITY_DAYS", uint256(90));

        require(loanToken != address(0), "LOAN_TOKEN_ADDRESS required");
        require(collateralToken != address(0), "COLLATERAL_TOKEN_ADDRESS required");

        Covenant covenant = Covenant(covenantAddr);
        uint256 maturity = block.timestamp + (maturityDays * 1 days);
        uint256 lltv = LLTV_3; // 77% LLTV (0.77e18)
        uint256 maxLifVal = maxLif(lltv, LIQUIDATION_CURSOR_LOW);

        CollateralParams[] memory collat = new CollateralParams[](1);
        collat[0] = CollateralParams({
            token: collateralToken,
            lltv: lltv,
            maxLif: maxLifVal,
            oracle: oracleAddr
        });

        Market memory market = Market({
            loanToken: loanToken,
            collateralParams: collat,
            maturity: maturity,
            rcfThreshold: 0,
            entryGate: gateAddr,
            seizureGate: gateAddr
        });

        vm.startBroadcast(pk);

        // Approve gate if compliance mode is enabled and gate is set
        if (gateAddr != address(0) && covenant.REQUIRE_COMPLIANCE()) {
            if (!covenant.isApprovedGate(gateAddr)) {
                console.log("Whitelisting gate address:", gateAddr);
                covenant.setApprovedGate(gateAddr, true);
            }
        }

        // Initialize market
        marketId = covenant.initMarket(market);

        console.log("=========================================");
        console.log("Successfully Initialized Covenant Market!");
        console.log("Market ID       :", vm.toString(marketId));
        console.log("Loan Token      :", loanToken);
        console.log("Collateral Token:", collateralToken);
        console.log("LLTV            :", lltv);
        console.log("Maturity        :", maturity);
        console.log("Compliance Gate :", gateAddr);
        console.log("=========================================");

        vm.stopBroadcast();
    }
}
