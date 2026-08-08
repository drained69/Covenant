// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

/// @title IOracle
/// @notice Price feed consumed by Covenant to value collateral against the loan token.
/// @dev One oracle is bound per collateral in `CollateralParams.oracle` and is therefore part of the market's
/// identity: changing the oracle produces a different market id. Implementations are expected to fail closed
/// (revert) rather than return a stale, zero, or otherwise untrustworthy value, because a reverting `price()`
/// only blocks borrowing, liquidation, and health checks, whereas a wrong price can misprice solvency.
interface IOracle {
    /// @notice Returns the price of one whole unit of the collateral token, quoted in the loan token.
    /// @dev Scaled by `ORACLE_PRICE_SCALE` (1e36) and pre-adjusted for the decimals of both tokens, so that
    /// `collateralAssets * price / ORACLE_PRICE_SCALE` yields an amount denominated in loan-token units:
    ///
    ///     price = rawAnswer * ORACLE_PRICE_SCALE * 10**loanDecimals / (10**feedDecimals * 10**collateralDecimals)
    ///
    /// Must revert instead of returning a value the implementation does not trust.
    /// @return The collateral price in loan-token terms, scaled by `ORACLE_PRICE_SCALE`.
    function price() external view returns (uint256);
}
