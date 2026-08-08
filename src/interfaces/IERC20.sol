// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

/// @title IERC20
/// @notice Minimal ERC-20 surface used by Covenant and its periphery.
/// @dev Deliberately trimmed to the members the protocol actually calls; this is not a complete ERC-20
/// definition (no `totalSupply`, `decimals`, or events). The mutating members are declared as returning
/// `bool`, but the protocol never relies on that return value directly — `SafeTransferLib` performs low-level
/// calls and tolerates non-standard tokens that return nothing, so that tokens like USDT are supported.
interface IERC20 {
    /// @notice Sets `spender`'s allowance over the caller's tokens to `amount`.
    /// @param spender The account allowed to spend the caller's tokens.
    /// @param amount The new allowance.
    /// @return True on success, for tokens that return a value.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Moves `amount` tokens from the caller to `receiver`.
    /// @param receiver The recipient of the tokens.
    /// @param amount The amount to transfer.
    /// @return True on success, for tokens that return a value.
    function transfer(address receiver, uint256 amount) external returns (bool);

    /// @notice Moves `amount` tokens from `sender` to `receiver`, spending the caller's allowance.
    /// @param sender The account the tokens are taken from.
    /// @param receiver The recipient of the tokens.
    /// @param amount The amount to transfer.
    /// @return True on success, for tokens that return a value.
    function transferFrom(address sender, address receiver, uint256 amount) external returns (bool);

    /// @notice Returns the token balance of `account`.
    /// @param account The account to query.
    /// @return The token balance.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Returns the remaining amount `spender` may pull from `owner`.
    /// @param owner The account whose tokens may be spent.
    /// @param spender The account allowed to spend them.
    /// @return The remaining allowance.
    function allowance(address owner, address spender) external view returns (uint256);
}
