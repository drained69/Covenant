// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
// IAPassComplianceValidator is not used here directly — the gate is passed by address — but the
// import is left as a docstring hint. Uncomment if the script starts constructing gates locally.
// import {IAPassComplianceValidator} from "../src/compliance/interfaces/IAPassComplianceValidator.sol";
import {BtcUsdOracle} from "../src/oracles/BtcUsdOracle.sol";
import {LLTV_3, LIQUIDATION_CURSOR_LOW, maxLif} from "../src/libraries/ConstantsLib.sol";

/// @notice Initializes an institutional credit market on Covenant bound to a Cleanverse compliance gate.
///
/// Required Environment Variables:
///   COVENANT_CORE_ADDRESS      — Address of the deployed Covenant core contract
///   TEST_USDC_ADDRESS          — Address of the loan token (e.g. TestUSDC)
///   TEST_WBTC_ADDRESS          — Address of the collateral token (e.g. TestWBTC)
///   COVENANT_ORACLE_ADDRESS    — Address of the price oracle for collateral/loan pair
///   COVENANT_GATE_ADDRESS      — Address of the CleanversePoolGate or CovenantGate
///   MATURITY_TIMESTAMP         — Absolute unix maturity. Preferred: the market id is content-addressed,
///                                so a `block.timestamp`-relative maturity yields a DIFFERENT id on every
///                                run and silently addresses a market nobody has liquidity in.
///   MATURITY_DAYS              — Fallback if MATURITY_TIMESTAMP is unset (default: 90)
///
/// Usage:
///   forge script script/CreateMarket.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract CreateMarketScript is Script {
    function run() external returns (bytes32 marketId) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        require(pk != 0, "PRIVATE_KEY required");

        address covenantAddr = vm.envOr("COVENANT_CORE_ADDRESS", address(0));
        address loanToken = vm.envOr("TEST_USDC_ADDRESS", address(0));
        address collateralToken = vm.envOr("TEST_WBTC_ADDRESS", address(0));
        address oracleAddr = vm.envOr("COVENANT_ORACLE_ADDRESS", address(0));
        address gateAddr = vm.envOr("COVENANT_GATE_ADDRESS", address(0));
        uint256 maturityTimestamp = vm.envOr("MATURITY_TIMESTAMP", uint256(0));
        uint256 maturityDays = vm.envOr("MATURITY_DAYS", uint256(90));

        require(covenantAddr != address(0), "COVENANT_CORE_ADDRESS required");
        require(loanToken != address(0), "TEST_USDC_ADDRESS required");
        require(collateralToken != address(0), "TEST_WBTC_ADDRESS required");
        require(oracleAddr != address(0), "COVENANT_ORACLE_ADDRESS required");
        require(gateAddr != address(0), "COVENANT_GATE_ADDRESS required");

        Covenant covenant = Covenant(covenantAddr);
        uint256 maturity = maturityTimestamp != 0 ? maturityTimestamp : block.timestamp + (maturityDays * 1 days);
        uint256 lltv = LLTV_3; // 86% LLTV (0.86e18)
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
