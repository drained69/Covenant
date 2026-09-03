// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity ^0.8.0;

library UtilsLib {
    error CastOverflow();

    /// @dev Returns true if at most one of x and y is nonzero.
    function atMostOneNonZero(uint256 x, uint256 y) internal pure returns (bool z) {
        assembly {
            z := or(iszero(x), iszero(y))
        }
    }

    /// @dev Returns min(a, b).
    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        assembly {
            z := xor(x, mul(xor(x, y), lt(y, x)))
        }
    }

    function zeroFloorSub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        assembly {
            z := mul(gt(x, y), sub(x, y))
        }
    }

    /// @dev Returns (x * y) / d rounded down.
    function mulDivDown(uint256 x, uint256 y, uint256 d) internal pure returns (uint256) {
        return (x * y) / d;
    }

    /// @dev Returns (x * y) / d rounded up.
    function mulDivUp(uint256 x, uint256 y, uint256 d) internal pure returns (uint256) {
        return (x * y + (d - 1)) / d;
    }

    function toUint128(uint256 x) internal pure returns (uint128) {
        require(x <= type(uint128).max, CastOverflow());
        // forge-lint: disable-next-item(unsafe-typecast) as x is less than type(uint128).max
        return uint128(x);
    }

    function countBits(uint128 x) internal pure returns (uint256) {
        unchecked {
            x = x - ((x >> 1) & 0x55555555555555555555555555555555);
            x = (x & 0x33333333333333333333333333333333) + ((x >> 2) & 0x33333333333333333333333333333333);
            x = (x + (x >> 4)) & 0x0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f;
            return (x * 0x01010101010101010101010101010101) >> 120;
        }
    }

    /// @dev Assumes bitmap is not zero.
    /// @dev Cancun-compatible msb: `clz` is an Osaka-only instruction, which
    ///      target chains may not implement — find the top bit by shifting
    ///      instead. Five nested halvings on a 128-bit input, constant-time.
    function msb(uint128 bitmap) internal pure returns (uint256 res) {
        assembly {
            res := 0
            let v := bitmap
            // Halve from 128 bits down to 1, adding the width each time the top
            // half is non-zero. 7 iterations: 128, 64, 32, 16, 8, 4, 2.
            if iszero(iszero(and(shr(64, v), 0xFFFFFFFFFFFFFFFF))) {
                v := shr(64, v)
                res := add(res, 64)
            }
            if iszero(iszero(and(shr(32, v), 0xFFFFFFFF))) {
                v := shr(32, v)
                res := add(res, 32)
            }
            if iszero(iszero(and(shr(16, v), 0xFFFF))) {
                v := shr(16, v)
                res := add(res, 16)
            }
            if iszero(iszero(and(shr(8, v), 0xFF))) {
                v := shr(8, v)
                res := add(res, 8)
            }
            if iszero(iszero(and(shr(4, v), 0xF))) {
                v := shr(4, v)
                res := add(res, 4)
            }
            if iszero(iszero(and(shr(2, v), 0x3))) {
                v := shr(2, v)
                res := add(res, 2)
            }
            if iszero(iszero(shr(1, v))) {
                res := add(res, 1)
            }
        }
    }

    /// @dev Assumes bit is less than 128.
    function setBit(uint128 bitmap, uint256 bit) internal pure returns (uint128) {
        // forge-lint: disable-next-item(unsafe-typecast) as bit < 128
        return uint128(bitmap | (1 << bit));
    }

    /// @dev Assumes bit is less than 128.
    function clearBit(uint128 bitmap, uint256 bit) internal pure returns (uint128) {
        // forge-lint: disable-next-item(unsafe-typecast)
        return uint128(bitmap & ~(1 << bit));
    }

    /// @dev Sets a boolean in transient storage keyed by a (bytes32, address) pair.
    /// @dev Returns the previous value at the written slot.
    function tExchange(uint256 baseSlot, bytes32 key1, address key2, bool value) internal returns (bool previous) {
        uint256 slot = uint256(keccak256(abi.encode(key1, key2, baseSlot)));
        assembly ("memory-safe") {
            previous := tload(slot)
            tstore(slot, value)
        }
    }

    /// @dev Gets a boolean from transient storage keyed by a (bytes32, address) pair.
    function tGet(uint256 baseSlot, bytes32 key1, address key2) internal view returns (bool value) {
        uint256 slot = uint256(keccak256(abi.encode(key1, key2, baseSlot)));
        assembly ("memory-safe") {
            value := tload(slot)
        }
    }
}
