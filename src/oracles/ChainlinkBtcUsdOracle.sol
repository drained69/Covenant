// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {IOracle} from "../interfaces/IOracle.sol";
import {ORACLE_PRICE_SCALE} from "../libraries/ConstantsLib.sol";

/// @dev Minimal Chainlink AggregatorV3 interface — the only bit we consume.
interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
}

/// @title ChainlinkBtcUsdOracle
/// @notice Chainlink-backed BTC/USD oracle, scaled for Covenant's liquidation math.
/// @dev Covenant liquidation uses `collateral * price / ORACLE_PRICE_SCALE = value_in_loan_token` where
/// both sides are in raw (decimal-carrying) units. So `price` must be:
///
///     price = feedAnswer * ORACLE_PRICE_SCALE * 10^loanDecimals
///                       / (10^feedDecimals * 10^collateralDecimals)
///
/// The scale correction is computed once at construction and multiplied at read time.
///
/// Fail-closed properties:
/// - Negative or zero feed answers revert (Chainlink returns int256; a negative price is nonsense).
/// - Stale updates revert if older than STALENESS.
/// - No pausable, no owner: this contract is a pure read adapter over Chainlink. If the feed itself is
///   compromised, that's Chainlink's problem — replacing this adapter requires deploying a new one and
///   creating a new market that binds to it (gate addresses are part of the market's identity).
contract ChainlinkBtcUsdOracle is IOracle {
    /// @notice The upstream Chainlink aggregator.
    IAggregatorV3 public immutable FEED;

    /// @notice Max age of an update before `price()` reverts.
    uint256 public immutable STALENESS;

    /// @notice Precomputed multiplier: uint(answer) × SCALE = price().
    uint256 public immutable SCALE;

    error NegativeAnswer(int256 answer);
    error ZeroAnswer();
    error StaleFeed(uint256 updatedAt, uint256 nowT, uint256 staleness);
    error DecimalsMismatch(uint8 feedGot, uint8 feedExpected);

    /// @param feed The Chainlink AggregatorV3 for BTC/USD.
    /// @param collateralDecimals Decimals of the collateral token (WBTC = 8).
    /// @param loanDecimals Decimals of the loan token (USDC = 6, DAI = 18).
    /// @param expectedFeedDecimals The feed's decimals — checked at construction so a swapped-in
    ///        feed with different precision fails loud instead of silently mispricing.
    /// @param stalenessSeconds Reject reads older than this. 0 disables the check (never do that in prod).
    constructor(
        IAggregatorV3 feed,
        uint8 collateralDecimals,
        uint8 loanDecimals,
        uint8 expectedFeedDecimals,
        uint256 stalenessSeconds
    ) {
        uint8 got = feed.decimals();
        require(got == expectedFeedDecimals, DecimalsMismatch(got, expectedFeedDecimals));

        FEED = feed;
        STALENESS = stalenessSeconds;

        uint256 numerator = ORACLE_PRICE_SCALE * (10 ** loanDecimals);
        uint256 denominator = 10 ** (uint256(collateralDecimals) + uint256(expectedFeedDecimals));
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
