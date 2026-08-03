// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {BtcUsdOracle} from "../../src/oracles/BtcUsdOracle.sol";
import {ORACLE_PRICE_SCALE} from "../../src/libraries/ConstantsLib.sol";

/// @notice Locks in the decimal-scale math the oracle owes Covenant.
///
/// The Covenant liquidation identity: `collateral * price / ORACLE_PRICE_SCALE == value_in_loan_token`
/// where all quantities are in the tokens' native raw units. If this holds, healthiness and liquidation
/// math work; if it doesn't, positions liquidate at the wrong LLTV and the market is unusable.
contract BtcUsdOracleTest is Test {
    BtcUsdOracle internal oracle;
    address internal owner = makeAddr("owner");
    address internal outsider = makeAddr("outsider");

    // A canonical pair for tests: WBTC (8 decimals) as collateral, USDC (6 decimals) as loan token,
    // Chainlink-style feed (8 decimals).
    uint8 internal constant WBTC_DECIMALS = 8;
    uint8 internal constant USDC_DECIMALS = 6;
    uint8 internal constant FEED_DECIMALS = 8;

    function setUp() public {
        vm.warp(1_800_000_000);
        oracle = new BtcUsdOracle(owner, WBTC_DECIMALS, USDC_DECIMALS, FEED_DECIMALS, 1 hours);
    }

    /* CONSTRUCTOR */

    function test_constructor_setsFields() public view {
        assertEq(oracle.owner(), owner);
        assertEq(oracle.STALENESS(), 1 hours);
        // SCALE = 1e36 * 10^6 / 10^(8+8) = 1e42 / 1e16 = 1e26
        assertEq(oracle.SCALE(), 1e26);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(BtcUsdOracle.ZeroAddress.selector);
        new BtcUsdOracle(address(0), WBTC_DECIMALS, USDC_DECIMALS, FEED_DECIMALS, 0);
    }

    /* PRICE SEMANTICS — the identity that matters to Covenant */

    function test_priceIdentity_1BTCat100kUsd() public {
        // Push $100,000/BTC in Chainlink format (8 decimals).
        vm.prank(owner);
        oracle.setPrice(100_000 * 10 ** FEED_DECIMALS);

        // 1 BTC in raw WBTC units = 1e8.
        uint256 collateral = 1 * 10 ** WBTC_DECIMALS;
        // Expected USDC value in raw units: 100_000 * 1e6.
        uint256 expectedUsdc = 100_000 * 10 ** USDC_DECIMALS;

        uint256 value = (collateral * oracle.price()) / ORACLE_PRICE_SCALE;
        assertEq(value, expectedUsdc, "1 BTC at $100k must equal $100,000 in raw USDC units");
    }

    function test_priceIdentity_fractionalBtcRoundTrip() public {
        vm.prank(owner);
        oracle.setPrice(50_000 * 10 ** FEED_DECIMALS); // $50k/BTC

        // 0.25 BTC = 25_000_000 raw WBTC
        uint256 collateral = 25_000_000;
        uint256 expectedUsdc = 12_500 * 10 ** USDC_DECIMALS; // 0.25 * 50_000
        uint256 value = (collateral * oracle.price()) / ORACLE_PRICE_SCALE;
        assertEq(value, expectedUsdc, "0.25 BTC at $50k must equal $12,500 raw USDC");
    }

    function test_priceScales_forDaiLoanToken() public {
        // Same collateral (WBTC), different loan token (DAI = 18 decimals).
        BtcUsdOracle daiOracle = new BtcUsdOracle(owner, WBTC_DECIMALS, 18, FEED_DECIMALS, 0);
        vm.prank(owner);
        daiOracle.setPrice(100_000 * 10 ** FEED_DECIMALS);

        uint256 collateral = 1 * 10 ** WBTC_DECIMALS; // 1 BTC
        uint256 expectedDai = 100_000 * 1e18;
        uint256 value = (collateral * daiOracle.price()) / ORACLE_PRICE_SCALE;
        assertEq(value, expectedDai, "1 BTC at $100k must equal 100_000e18 raw DAI");
    }

    /* ACCESS CONTROL */

    function test_setPrice_onlyOwner() public {
        vm.prank(outsider);
        vm.expectRevert(BtcUsdOracle.NotOwner.selector);
        oracle.setPrice(100_000e8);
    }

    function test_transferOwnership() public {
        vm.prank(owner);
        oracle.transferOwnership(outsider);
        assertEq(oracle.owner(), outsider);

        // Old owner can no longer push.
        vm.prank(owner);
        vm.expectRevert(BtcUsdOracle.NotOwner.selector);
        oracle.setPrice(1);
    }

    /* STALENESS + UNSET */

    function test_price_revertsIfUnset() public {
        vm.expectRevert(BtcUsdOracle.PriceUnset.selector);
        oracle.price();
    }

    function test_price_revertsIfStale() public {
        vm.prank(owner);
        oracle.setPrice(100_000e8);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(BtcUsdOracle.StalePrice.selector);
        oracle.price();
    }

    function test_price_freshWithinStaleness() public {
        vm.prank(owner);
        oracle.setPrice(100_000e8);
        vm.warp(block.timestamp + 1 hours);
        // At exactly STALENESS the price is still considered fresh (elapsed == STALENESS).
        oracle.price();
    }

    function test_zeroStaleness_disablesCheck() public {
        BtcUsdOracle alwaysFresh = new BtcUsdOracle(owner, WBTC_DECIMALS, USDC_DECIMALS, FEED_DECIMALS, 0);
        vm.prank(owner);
        alwaysFresh.setPrice(100_000e8);

        vm.warp(block.timestamp + 365 days);
        alwaysFresh.price(); // must not revert
    }

    /* FUZZ */

    function testFuzz_priceIdentityHolds(uint256 usdPrice, uint256 btcAmount) public {
        usdPrice = bound(usdPrice, 1, 10_000_000); // $1–$10M/BTC
        btcAmount = bound(btcAmount, 1, 10_000 * 10 ** WBTC_DECIMALS); // up to 10k BTC

        vm.prank(owner);
        oracle.setPrice(usdPrice * 10 ** FEED_DECIMALS);

        uint256 valueRaw = (btcAmount * oracle.price()) / ORACLE_PRICE_SCALE;
        // Expected: (btcAmount / 1e8) * usdPrice * 1e6 = btcAmount * usdPrice * 1e6 / 1e8
        uint256 expected = (btcAmount * usdPrice * 10 ** USDC_DECIMALS) / 10 ** WBTC_DECIMALS;
        assertEq(valueRaw, expected, "identity must hold for any (price, amount)");
    }
}
