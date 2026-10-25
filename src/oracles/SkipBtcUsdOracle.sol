// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {IOracle} from "../interfaces/IOracle.sol";
import {ORACLE_PRICE_SCALE} from "../libraries/ConstantsLib.sol";

/// @notice BTC/USD adapter for a Skip-style aggregator that must not be asked for `decimals()`.
/// @dev Mezo's Skip precompile answers `latestRoundData` with an 18-decimal price, but its
///      `decimals()` selector reenters. This adapter takes the feed scale as a constructor
///      argument and only calls `latestRoundData` from `price()`. Fail-closed on a zero,
///      negative, or stale answer. Replacing it means a new market: the oracle address is
///      part of the market id.
interface ISkipRoundData {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract SkipBtcUsdOracle is IOracle {
    ISkipRoundData public immutable FEED;
    uint256 public immutable STALENESS;
    uint256 public immutable SCALE;

    error ZeroAnswer();
    error NegativeAnswer(int256 answer);
    error StaleFeed(uint256 updatedAt, uint256 nowT, uint256 staleness);

    /// @param feedDecimals Hardcoded. Do not read this from the feed.
    constructor(
        ISkipRoundData feed,
        uint8 collateralDecimals,
        uint8 loanDecimals,
        uint8 feedDecimals,
        uint256 stalenessSeconds
    ) {
        FEED = feed;
        STALENESS = stalenessSeconds;
        uint256 numerator = ORACLE_PRICE_SCALE * (10 ** loanDecimals);
        uint256 denominator = 10 ** (uint256(collateralDecimals) + uint256(feedDecimals));
        SCALE = numerator / denominator;
    }

    /// @inheritdoc IOracle
    function price() external view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = FEED.latestRoundData();
        if (answer == 0) revert ZeroAnswer();
        if (answer < 0) revert NegativeAnswer(answer);
        if (STALENESS > 0 && block.timestamp - updatedAt > STALENESS) {
            revert StaleFeed(updatedAt, block.timestamp, STALENESS);
        }
        return uint256(answer) * SCALE;
    }
}
