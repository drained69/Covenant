// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {BtcUsdOracle} from "../src/oracles/BtcUsdOracle.sol";

/// @notice Deploys a BTC/USD oracle sized for a WBTC (8-decimal) collateral market against a
/// USDC-like (6-decimal) loan token, using Chainlink-convention (8-decimal) feed input, and pushes
/// a bootstrap price.
///
/// Env:
///   PRIVATE_KEY                — deployer key, hex with 0x prefix
///   ORACLE_COLLATERAL_DECIMALS — collateral token decimals (default: 8, for WBTC)
///   ORACLE_LOAN_DECIMALS       — loan token decimals       (default: 6, for USDC)
///   ORACLE_FEED_DECIMALS       — feed input decimals       (default: 8, Chainlink convention)
///   ORACLE_STALENESS_SECONDS   — max age of a price       (default: 3600, one hour)
///   ORACLE_INITIAL_PRICE_USD   — initial BTC/USD to seed  (default: 100000, $100k/BTC)
///
/// Run:
///   forge script script/DeployBtcUsdOracle.s.sol --rpc-url monad --broadcast --legacy
contract DeployBtcUsdOracle is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint8 collateralDecimals = uint8(vm.envOr("ORACLE_COLLATERAL_DECIMALS", uint256(8)));
        uint8 loanDecimals       = uint8(vm.envOr("ORACLE_LOAN_DECIMALS",       uint256(6)));
        uint8 feedDecimals       = uint8(vm.envOr("ORACLE_FEED_DECIMALS",       uint256(8)));
        uint256 staleness        = vm.envOr("ORACLE_STALENESS_SECONDS", uint256(3600));
        uint256 initialUsd       = vm.envOr("ORACLE_INITIAL_PRICE_USD", uint256(100_000));

        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        BtcUsdOracle oracle = new BtcUsdOracle(deployer, collateralDecimals, loanDecimals, feedDecimals, staleness);
        oracle.setPrice(initialUsd * (10 ** feedDecimals));

        vm.stopBroadcast();

        console.log("BtcUsdOracle:", address(oracle));
        console.log("  owner (deployer)  :", deployer);
        console.log("  collateral decimals:", collateralDecimals);
        console.log("  loan decimals     :", loanDecimals);
        console.log("  feed decimals     :", feedDecimals);
        console.log("  staleness (s)     :", staleness);
        console.log("  initial USD price :", initialUsd);
        console.log("  price() output    :", oracle.price());
    }
}
