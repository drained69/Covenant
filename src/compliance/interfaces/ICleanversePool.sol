// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity >=0.8.0;

/// @notice On-chain interface of a Cleanverse compliance pool.
/// @dev A compliance pool is a Cleanverse-deployed contract, per supported chain, that holds the rules for
/// a specific institutional programme (country allow/deny, tier/group constraints, pause switch) and
/// answers eligibility for wallets that hold an A-Pass. Cleanverse's Cooperate API endpoint
/// `POST /validator/verify` front-ends an on-chain view on this contract: the API docs state that "the
/// on-chain check may fail" and return code `12027` when it does. Reading the pool directly from the gate
/// removes the API from the settlement path entirely — the gate consults the same on-chain function the
/// API would have called.
///
/// **Provisional ABI.** Cleanverse's contracts are not yet published under a stable interface tag. The
/// three functions below mirror the API surface (`/validator/verify`, `/validator/is_paused`) and are the
/// minimum a pool must expose for on-chain enforcement. When Cleanverse publishes the canonical ABI, this
/// interface is the single file to update; `CleanversePoolGate` must not need to change.
interface ICleanversePool {
    /// @notice Returns whether `user` is currently eligible under the pool's rules.
    /// @dev A pool that is paused, unregistered, or read-broken may revert or return `false`. The gate
    /// treats both outcomes as "not eligible" via a bounded staticcall.
    function verify(address user) external view returns (bool);

    /// @notice Returns whether the pool is paused.
    /// @dev While paused, verification is not reliable. Checked first so a paused pool short-circuits to a
    /// denial without hitting `verify`.
    function paused() external view returns (bool);

    /// @notice Returns whether the pool is registered with Cleanverse.
    /// @dev A gate bound to an unregistered pool is misconfigured; the gate denies everything until the
    /// pool is properly registered on the Cleanverse gateway.
    function isRegistered() external view returns (bool);
}
