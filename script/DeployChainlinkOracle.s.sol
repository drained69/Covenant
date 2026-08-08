// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {ChainlinkBtcUsdOracle, IAggregatorV3} from "../src/oracles/ChainlinkBtcUsdOracle.sol";

/// @notice Deploys the Chainlink-backed BTC/USD oracle bound to a specific feed address.
///
/// Env:
///   PRIVATE_KEY                — deployer key
///   CHAINLINK_BTC_USD_FEED     — Chainlink AggregatorV3 address for BTC/USD
///   ORACLE_COLLATERAL_DECIMALS — collateral token decimals (default: 8, for WBTC)
///   ORACLE_LOAN_DECIMALS       — loan token decimals       (default: 6, for USDC)
///   ORACLE_STALENESS_SECONDS   — max age                   (default: 3600, one hour)
///
/// Chainlink BTC/USD feeds (verified):
///   Sepolia:  0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
///   Mainnet:  0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c
///
/// Run:
///   forge script script/DeployChainlinkOracle.s.sol --rpc-url $RPC_URL --broadcast --legacy
contract DeployChainlinkOracle is Script {
    function run() external {
        uint256 pk       = vm.envUint("PRIVATE_KEY");
        address feedAddr = vm.envAddress("CHAINLINK_BTC_USD_FEED");
        uint8 colDec     = uint8(vm.envOr("ORACLE_COLLATERAL_DECIMALS", uint256(8)));
        uint8 loanDec    = uint8(vm.envOr("ORACLE_LOAN_DECIMALS",       uint256(6)));
        uint256 stale    = vm.envOr("ORACLE_STALENESS_SECONDS", uint256(3600));

        vm.startBroadcast(pk);

        // Chainlink BTC/USD feeds are 8-decimal by convention; enforced at construction.
        ChainlinkBtcUsdOracle oracle = new ChainlinkBtcUsdOracle(
            IAggregatorV3(feedAddr), colDec, loanDec, 8, stale
        );

        vm.stopBroadcast();

        console.log("ChainlinkBtcUsdOracle:", address(oracle));
        console.log("  feed              :", feedAddr);
        console.log("  collateral decimals:", colDec);
        console.log("  loan decimals     :", loanDec);
        console.log("  staleness (s)     :", stale);
        console.log("  price() output    :", oracle.price());
    }
}
