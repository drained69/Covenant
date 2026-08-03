// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity >=0.5.0;

import {Offer} from "./ICovenant.sol";

interface INotary {
    function isNotarized(Offer memory offer, bytes memory notaryData) external view returns (bytes32);
}
