// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {BaseTest} from "./BaseTest.sol";
import {ICovenant} from "../src/interfaces/ICovenant.sol";

contract MulticallTest is BaseTest {
    function testMulticallSuccess() public {
        bytes[] memory data = new bytes[](2);
        data[0] = abi.encodeCall(covenant.setFeeSetter, (makeAddr("newFeeSetter")));
        data[1] = abi.encodeCall(covenant.setRoleSetter, (makeAddr("newRoleSetter")));

        vm.prank(covenant.roleSetter());
        covenant.multicall(data);

        assertEq(covenant.roleSetter(), makeAddr("newRoleSetter"), "wrong role setter");
        assertEq(covenant.feeSetter(), makeAddr("newFeeSetter"), "wrong fee setter");
    }

    function testMulticallFailing() public {
        bytes[] memory data = new bytes[](2);
        data[0] = abi.encodeCall(covenant.setRoleSetter, (makeAddr("newRoleSetter")));
        data[1] = abi.encodeCall(covenant.setFeeSetter, (makeAddr("newFeeSetter")));

        vm.prank(covenant.roleSetter());
        vm.expectRevert(ICovenant.OnlyRoleSetter.selector);
        covenant.multicall(data);
    }

    function testMulticallEmpty() public {
        covenant.multicall(new bytes[](0));
    }
}
