// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

import {Offer} from "./ICovenant.sol";

/// @title INotary
/// @notice Validates that an off-chain `Offer` was genuinely authorized by its maker.
/// @dev Covenant does not interpret offer authorization itself. Each offer names its own `notary`, and
/// `fillOffer` calls that notary with the offer and the taker-supplied `notaryData`. The maker must have
/// authorized the notary on Covenant (`isAuthorized(maker, notary)`), which is what binds an arbitrary notary
/// contract to that maker's offers. This indirection lets makers choose their authorization scheme — ECDSA
/// signatures, Merkle trees of offers, smart-contract wallets, or on-chain registration — without changing the
/// core protocol.
interface INotary {
    /// @notice Reverts unless `notaryData` proves that `offer` was authorized by `offer.maker`.
    /// @dev Called by Covenant during `fillOffer`. Implementations must revert on any failure rather than
    /// returning a falsy value, and must return the `CALLBACK_SUCCESS` magic value on success so that a
    /// contract which merely happens to expose a matching selector cannot be used as a notary.
    /// @param offer The offer being filled, exactly as passed to `fillOffer`.
    /// @param notaryData Opaque, notary-specific authorization data supplied by the taker (for example an
    /// encoded signature plus Merkle proof).
    /// @return The `CALLBACK_SUCCESS` magic value, i.e. `keccak256("covenant.callbackSuccess")`.
    function isNotarized(Offer memory offer, bytes memory notaryData) external view returns (bytes32);
}
