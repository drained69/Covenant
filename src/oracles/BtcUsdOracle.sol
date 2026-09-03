// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {IOracle} from "../interfaces/IOracle.sol";
import {ORACLE_PRICE_SCALE} from "../libraries/ConstantsLib.sol";

/// @title BtcUsdOracle
/// @notice Owner-updated BTC/USD oracle, scaled for Covenant's liquidation math.
/// @dev Covenant liquidation uses `collateral * price / ORACLE_PRICE_SCALE = value_in_loan_token` where
/// both `collateral` and `value_in_loan_token` are in raw (decimal-carrying) units. So `price` must be:
///
///     price = rawUsdPrice * ORACLE_PRICE_SCALE * 10^loanDecimals
///                        / (10^feedDecimals * 10^collateralDecimals)
///
/// The scale correction is computed once at construction and multiplied at read time, so `price()` is a
/// single SLOAD + one multiplication.
///
/// **This oracle is manual-push.** An owner posts prices via `setPrice`. That is honest for a testnet
/// where no canonical BTC/USD feed exists on-chain yet; for production it should be replaced (or wrapped)
/// by a real feed — Chainlink AggregatorV3, Pyth PriceFeed, RedStone. The interface (`price()`) does not
/// change, so a Covenant market bound to this oracle can migrate later by deploying a new adapter and
/// spinning up a new market at the same collateral/loan-token pair.
contract BtcUsdOracle is IOracle {
    /// @notice Address permitted to push new prices.
    address public owner;

    /// @notice Latest raw price in feed units (Chainlink convention: 8 decimals ⇒ $100,000 = 1e13).
    uint256 public rawPrice;

    /// @notice Unix timestamp of the last price update.
    uint256 public updatedAt;

    /// @notice Maximum age before `price()` reverts, guarding against stale reads.
    uint256 public immutable STALENESS;

    /// @notice Precomputed scale multiplier: rawPrice × SCALE = price() output.
    uint256 public immutable SCALE;

    event PriceSet(uint256 rawPrice, uint256 updatedAt, address indexed by);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error StalePrice();
    error PriceUnset();

    /// @param initialOwner Address permitted to push prices. A multisig in production.
    /// @param collateralDecimals Decimals of the collateral token this oracle prices (BTC and WBTC commonly use 8).
    /// @param loanDecimals Decimals of the loan token this oracle prices against (USDC = 6, DAI = 18).
    /// @param feedDecimals Decimals of the raw price you will push (Chainlink convention = 8).
    /// @param stalenessSeconds Max age before `price()` reverts. 0 disables the check.
    constructor(
        address initialOwner,
        uint8 collateralDecimals,
        uint8 loanDecimals,
        uint8 feedDecimals,
        uint256 stalenessSeconds
    ) {
        require(initialOwner != address(0), ZeroAddress());

        owner = initialOwner;
        STALENESS = stalenessSeconds;

        // scaleNumerator / scaleDenominator can be pre-computed because none of these vary at runtime.
        // Precision loss only occurs if scaleNumerator < scaleDenominator, which requires
        // ORACLE_PRICE_SCALE (1e36) * 10^loanDecimals < 10^(collateralDecimals + feedDecimals) — never true
        // for any real token pair.
        uint256 numerator = ORACLE_PRICE_SCALE * (10 ** loanDecimals);
        uint256 denominator = 10 ** (uint256(collateralDecimals) + uint256(feedDecimals));
        SCALE = numerator / denominator;

        emit OwnerTransferred(address(0), initialOwner);
    }

    /// @inheritdoc IOracle
    /// @dev Reverts if no price has been set, or if the price is older than STALENESS.
    /// Reverting here is safe: `price()` is called by Covenant's liquidation math, and denying a
    /// liquidation against a stale price is the correct posture — worst case, liquidators wait for a
    /// fresh push.
    function price() external view returns (uint256) {
        uint256 _updatedAt = updatedAt;
        require(_updatedAt != 0, PriceUnset());
        if (STALENESS > 0) {
            require(block.timestamp - _updatedAt <= STALENESS, StalePrice());
        }
        return rawPrice * SCALE;
    }

    /// @notice Pushes a new raw price. Owner-only.
    /// @param newRawPrice Price in feed units (Chainlink convention: BTC at $100k with 8 dec = 100_000e8).
    function setPrice(uint256 newRawPrice) external {
        require(msg.sender == owner, NotOwner());

        rawPrice = newRawPrice;
        updatedAt = block.timestamp;

        emit PriceSet(newRawPrice, block.timestamp, msg.sender);
    }

    /// @notice Transfers ownership.
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, NotOwner());
        require(newOwner != address(0), ZeroAddress());

        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }
}
