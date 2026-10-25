// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {SkipBtcUsdOracle, ISkipRoundData} from "../../src/oracles/SkipBtcUsdOracle.sol";

/// @dev Feed with latestRoundData only. No decimals() — that selector reenters on Mezo.
contract MockSkipFeed is ISkipRoundData {
    int256 public answer;
    uint256 public updatedAt;

    function setAnswer(int256 a) external {
        answer = a;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 t) external {
        updatedAt = t;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract SkipBtcUsdOracleTest is Test {
    MockSkipFeed internal feed;
    SkipBtcUsdOracle internal oracle;

    function setUp() public {
        feed = new MockSkipFeed();
        // 18/18/18 is the Mezo MUSD-against-BTC shape. SCALE must be 1e18.
        oracle = new SkipBtcUsdOracle(feed, 18, 18, 18, 6 hours);
    }

    function test_scale_is_one_e18_for_mezo_units() public view {
        assertEq(oracle.SCALE(), 1e18);
    }

    function test_price_multiplies_answer_by_scale() public {
        feed.setAnswer(80_000e18);
        assertEq(oracle.price(), 80_000e18 * 1e18);
    }

    function test_zero_answer_reverts() public {
        feed.setAnswer(0);
        vm.expectRevert(SkipBtcUsdOracle.ZeroAnswer.selector);
        oracle.price();
    }

    function test_negative_answer_reverts() public {
        feed.setAnswer(-1);
        vm.expectRevert(abi.encodeWithSelector(SkipBtcUsdOracle.NegativeAnswer.selector, int256(-1)));
        oracle.price();
    }

    function test_stale_answer_reverts() public {
        vm.warp(7 hours);
        feed.setAnswer(80_000e18);
        feed.setUpdatedAt(block.timestamp - 6 hours - 1);
        vm.expectRevert();
        oracle.price();
    }
}
