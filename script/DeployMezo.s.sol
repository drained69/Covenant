// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {EcrecoverNotary} from "../src/notaries/EcrecoverNotary.sol";
import {EthosTierGate} from "../src/reputation/EthosTierGate.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {LLTV_0, LLTV_1, LLTV_2, LIQUIDATION_CURSOR_LOW, maxLif} from "../src/libraries/ConstantsLib.sol";
import {SkipBtcUsdOracle, ISkipRoundData} from "../src/oracles/SkipBtcUsdOracle.sol";

/// @notice Deploys the Covenant credit layer on Mezo testnet.
/// @dev Do not point this at Mezo mainnet. Mainnet MUSD is a different token and
///      this script is for chain 31611 only. The live testnet oracle stays as deployed;
///      this import is the source of truth for the next deployment, not a redeploy.
///
/// Loan token is canonical testnet MUSD. Collateral is Mezo BTC (the native
/// gas token's ERC-20 interface, 18 decimals). The oracle reads the Skip
/// BTC/USD feed at 0x7b7c…0015.
///
/// Env: PRIVATE_KEY, SCORE_SIGNER_ADDRESS, optional MATURITY (default 2027-03-01).
contract DeployMezo is Script {
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant BTC = 0x7b7C000000000000000000000000000000000000;
    address constant BTC_USD_FEED = 0x7b7c000000000000000000000000000000000015;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address scoreSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");
        uint256 maturity = vm.envOr("MATURITY", uint256(1803859200));

        vm.startBroadcast(pk);

        // Do not call price() here. Skip's feed is hostile to some staticcalls
        // inside Forge's simulator; the adapter only touches it in price().
        SkipBtcUsdOracle oracle = new SkipBtcUsdOracle(
            ISkipRoundData(BTC_USD_FEED),
            18,
            18,
            18,
            6 hours
        );
        console.log("SkipBtcUsdOracle     :", address(oracle));

        Covenant covenant = new Covenant(true, vm.addr(pk));
        console.log("Covenant core        :", address(covenant));

        EcrecoverNotary notary = new EcrecoverNotary(address(covenant));
        console.log("EcrecoverNotary      :", address(notary));

        deployTierMarket(covenant, address(oracle), maturity, 0, "Open", scoreSigner);
        deployTierMarket(covenant, address(oracle), maturity, 1600, "Established", scoreSigner);
        deployTierMarket(covenant, address(oracle), maturity, 2000, "Reputable", scoreSigner);

        console.log("Score signer         :", scoreSigner);
        console.log("Loan token MUSD      :", MUSD);
        console.log("Collateral BTC       :", BTC);
        console.log("Maturity             :", maturity);

        vm.stopBroadcast();
    }

    function deployTierMarket(
        Covenant covenant,
        address oracle,
        uint256 maturity,
        uint128 threshold,
        string memory label,
        address scoreSigner
    ) internal returns (bytes32 marketId) {
        EthosTierGate gate = new EthosTierGate(threshold, scoreSigner);
        covenant.setApprovedGate(address(gate), true);

        uint256 lltv = threshold == 0 ? LLTV_0 : threshold == 1600 ? LLTV_1 : LLTV_2;

        CollateralParams[] memory collat = new CollateralParams[](1);
        collat[0] = CollateralParams({
            token: BTC,
            lltv: lltv,
            maxLif: maxLif(lltv, LIQUIDATION_CURSOR_LOW),
            oracle: oracle
        });

        Market memory market = Market({
            loanToken: MUSD,
            collateralParams: collat,
            maturity: maturity,
            rcfThreshold: 0,
            entryGate: address(gate),
            seizureGate: address(gate)
        });

        marketId = covenant.initMarket(market);

        console.log("----------------------------------------");
        console.log("Tier                 :", label);
        console.log("EthosTierGate        :", address(gate));
        console.log("  min score          :", threshold);
        console.log("  LLTV               :", lltv);
        console.log("  maxLif             :", collat[0].maxLif);
        console.log("  market id          :", vm.toString(marketId));
    }
}
