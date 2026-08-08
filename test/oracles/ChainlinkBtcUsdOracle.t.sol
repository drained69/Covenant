// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {ChainlinkBtcUsdOracle, IAggregatorV3} from "../../src/oracles/ChainlinkBtcUsdOracle.sol";
import {ORACLE_PRICE_SCALE} from "../../src/libraries/ConstantsLib.sol";

/// @dev Mock Chainlink aggregator with the four failure modes we care about.
contract MockAggregator is IAggregatorV3 {
    int256 public answer;
    uint256 public updatedAt;
    uint8 internal immutable _decimals;
    string public description;

    constructor(uint8 dec) { _decimals = dec; description = "MOCK BTC / USD"; }

    function decimals() external view returns (uint8) { return _decimals; }

    function setAnswer(int256 a) external { answer = a; updatedAt = block.timestamp; }

    function setUpdatedAt(uint256 t) external { updatedAt = t; }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, answer, 0, updatedAt, 0);
    }
}

contract ChainlinkBtcUsdOracleTest is Test {
    MockAggregator internal feed;
    ChainlinkBtcUsdOracle internal oracle;

    uint8 internal constant WBTC_DECIMALS = 8;
    uint8 internal constant USDC_DECIMALS = 6;
    uint8 internal constant FEED_DECIMALS = 8;

    function setUp() public {
        vm.warp(1_800_000_000);
        feed = new MockAggregator(FEED_DECIMALS);
        oracle = new ChainlinkBtcUsdOracle(feed, WBTC_DECIMALS, USDC_DECIMALS, FEED_DECIMALS, 1 hours);
    }

    /* CONSTRUCTOR */

    function test_constructor_pinsFeedDecimals() public {
        MockAggregator wrongFeed = new MockAggregator(18);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkBtcUsdOracle.DecimalsMismatch.selector, uint8(18), uint8(8)));
        new ChainlinkBtcUsdOracle(wrongFeed, WBTC_DECIMALS, USDC_DECIMALS, 8, 1 hours);
    }

    function test_constructor_computesScale() public view {
        // SCALE = 1e36 * 10^6 / 10^(8+8) = 1e26
        assertEq(oracle.SCALE(), 1e26);
    }

    /* PRICE IDENTITY — the Covenant liquidation contract needs this to hold */

    function test_priceIdentity_1BTCat100kUsd() public {
        feed.setAnswer(int256(100_000 * 10 ** FEED_DECIMALS));
        uint256 collateral = 1 * 10 ** WBTC_DECIMALS;
        uint256 expectedUsdc = 100_000 * 10 ** USDC_DECIMALS;
        assertEq((collateral * oracle.price()) / ORACLE_PRICE_SCALE, expectedUsdc);
    }

    function test_priceReflectsFeedUpdates() public {
        feed.setAnswer(50_000e8);
        uint256 p1 = oracle.price();

        vm.warp(block.timestamp + 30 minutes);
        feed.setAnswer(70_000e8);
        uint256 p2 = oracle.price();

        assertGt(p2, p1);
        assertEq(p2, p1 * 70 / 50);
    }

    /* FAIL-CLOSED */

    function test_price_revertsOnNegativeAnswer() public {
        feed.setAnswer(-1);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkBtcUsdOracle.NegativeAnswer.selector, int256(-1)));
        oracle.price();
    }

    function test_price_revertsOnZeroAnswer() public {
        feed.setAnswer(0);
        vm.expectRevert(ChainlinkBtcUsdOracle.ZeroAnswer.selector);
        oracle.price();
    }

    function test_price_revertsOnStaleFeed() public {
        feed.setAnswer(100_000e8);
        vm.warp(block.timestamp + 1 hours + 1);
        vm.expectRevert(); // StaleFeed with dynamic args
        oracle.price();
    }

    function test_price_freshExactlyAtStaleness() public {
        feed.setAnswer(100_000e8);
        vm.warp(block.timestamp + 1 hours);
        oracle.price(); // exact-boundary reads must succeed
    }

    /* FUZZ */

    function testFuzz_priceIdentity(uint256 usdPrice, uint256 btcAmount) public {
        usdPrice = bound(usdPrice, 1, 10_000_000);
        btcAmount = bound(btcAmount, 1, 10_000 * 10 ** WBTC_DECIMALS);

        feed.setAnswer(int256(usdPrice * 10 ** FEED_DECIMALS));
        uint256 valueRaw = (btcAmount * oracle.price()) / ORACLE_PRICE_SCALE;
        uint256 expected = (btcAmount * usdPrice * 10 ** USDC_DECIMALS) / 10 ** WBTC_DECIMALS;
        assertEq(valueRaw, expected);
    }
}
