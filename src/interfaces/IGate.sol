// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

/// @title IEnterGate
/// @notice Compliance gate consulted before an account may take on new credit (lend) or new debt (borrow).
/// @dev Bound per market as `Market.entryGate` and therefore part of the market's identity: changing the gate
/// produces a different market id. Covenant calls these views with a bounded gas stipend and treats a revert,
/// an out-of-gas, or a malformed return value as "not allowed" — gates fail closed. Implementations MUST be
/// `view`, MUST NOT revert on unknown accounts (return `false` instead), and should stay well inside the gas
/// budget, since exceeding it blocks the account rather than granting it access.
interface IEnterGate {
    /// @notice Returns whether `account` may increase its credit (lender side) in markets bound to this gate.
    /// @param account The account whose credit would increase.
    /// @return True if the account is allowed to acquire credit, false otherwise.
    function canIncreaseCredit(address account) external view returns (bool);

    /// @notice Returns whether `account` may increase its debt (borrower side) in markets bound to this gate.
    /// @param account The account whose debt would increase.
    /// @return True if the account is allowed to take on debt, false otherwise.
    function canIncreaseDebt(address account) external view returns (bool);
}

/// @title ILiquidatorGate
/// @notice Compliance gate consulted before an account may seize collateral from an unhealthy borrower.
/// @dev Bound per market as `Market.seizureGate` and therefore part of the market's identity. Called with a
/// bounded gas stipend and evaluated fail-closed, exactly like `IEnterGate`. Note that gating liquidation also
/// restricts who can keep the market solvent, so implementations should keep the eligible set wide enough that
/// unhealthy positions are still liquidated promptly.
interface ILiquidatorGate {
    /// @notice Returns whether `account` may act as a liquidator in markets bound to this gate.
    /// @param account The account attempting to seize collateral.
    /// @return True if the account is allowed to liquidate, false otherwise.
    function canLiquidate(address account) external view returns (bool);
}
