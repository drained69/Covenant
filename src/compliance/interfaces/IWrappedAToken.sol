// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity >=0.8.0;

import {IERC20} from "../../interfaces/IERC20.sol";
import {IAPassComplianceValidator} from "./IAPassComplianceValidator.sol";

/// @notice Compliance-aware ERC-20 that wraps a native token 1:1 and refuses transfers to wallets
/// that fail the bound CVI Compliance Validator's eligibility check.
/// @dev Mirrors the semantics of Cleanverse's own `POST /atoken/launch_wrapped_atoken`: a wrapped
/// A-Token locks its origin token and mints wrapped units at 1:1, with every transfer gated at the
/// token layer against A-Pass rules.
///
/// A `WrappedAToken` used as the loan token of a Covenant market closes the flash-loan surface
/// disclosed in the README: `covenant.flashLoan(waUSDC, ..., callback)` reverts inside
/// `safeTransfer` before the callback runs whenever the callback's wallet is not verified under
/// the token's validator. The market's gate becomes belt-and-suspenders; the token is the belt.
interface IWrappedAToken is IERC20 {
    /// @notice The origin token this wrapper mints against, e.g. native USDC.
    function origin() external view returns (IERC20);

    /// @notice The CVI Compliance Validator consulted on every transfer.
    function validator() external view returns (IAPassComplianceValidator);

    /// @notice Addresses exempt from the compliance check on inbound transfer.
    /// @dev Populated by the token owner for protocol contracts that need to hold or route the
    /// wrapped token as infrastructure — the Covenant core itself, a router, a bundler. This is
    /// the on-chain analogue of Cleanverse's institutional deposit-address whitelist
    /// (`POST /atoken/whitelist/add`). Withdrawals are ungated at the exit path, so `address(0)`
    /// requires no exemption.
    function isExempt(address account) external view returns (bool);

    /// @notice Deposits `assets` of the origin token and mints `assets` of the wrapped token to
    /// `receiver`.
    /// @dev Requires the caller to have approved the wrapper for `assets` of the origin token. The
    /// mint itself is a compliance-checked inbound transfer, so `receiver` must satisfy the
    /// validator (or be exempt). Fee-on-transfer and rebasing origin tokens are out of scope: the
    /// wrapper assumes the amount it pulls equals the amount that lands. Pair only with
    /// well-behaved ERC-20s.
    function deposit(uint256 assets, address receiver) external returns (uint256);

    /// @notice Burns `assets` of the wrapped token from `msg.sender` and releases `assets` of the
    /// origin token to `receiver`.
    /// @dev Withdrawal is an exit path and is intentionally not gated on `receiver` — mirroring the
    /// Covenant engine's rule that only *increases* in exposure are gated. A holder whose
    /// credential is revoked after depositing can still redeem their locked origin balance.
    function withdraw(uint256 assets, address receiver) external returns (uint256);
}
