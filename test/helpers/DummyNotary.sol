// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {INotary} from "../../src/interfaces/INotary.sol";
import {Offer} from "../../src/interfaces/ICovenant.sol";
import {CALLBACK_SUCCESS} from "../../src/libraries/ConstantsLib.sol";

/// @dev Test-only notary that unconditionally accepts every offer.
/// Use this in Covenant integration tests that don't care about notarization details.
contract DummyNotary is INotary {
    function isNotarized(Offer memory, bytes memory) external pure returns (bytes32) {
        return CALLBACK_SUCCESS;
    }
}
