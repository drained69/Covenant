// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;
contract TstoreProbe {
    function probe() external returns (uint256 v) {
        assembly { tstore(1, 42) v := tload(1) }
    }
}
