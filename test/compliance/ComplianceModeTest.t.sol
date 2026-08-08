// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {Covenant} from "../../src/Covenant.sol";
import {ICovenant, Market, CollateralParams} from "../../src/interfaces/ICovenant.sol";
import {IEnterGate, ILiquidatorGate} from "../../src/interfaces/IGate.sol";
import {LIQUIDATION_CURSOR_LOW, ORACLE_PRICE_SCALE, WAD} from "../../src/libraries/ConstantsLib.sol";
import {UtilsLib} from "../../src/libraries/UtilsLib.sol";
import {ERC20NoRevert} from "../erc20s/ERC20NoRevert.sol";
import {Oracle} from "../helpers/Oracle.sol";

/// @dev Approve-everyone gate for exercising the whitelist logic. The whitelist check is what we're
/// testing here, not the gate's internal decision — so this stub simplifies the setup.
contract PermissiveGate is IEnterGate, ILiquidatorGate {
    function canIncreaseCredit(address) external pure returns (bool) { return true; }
    function canIncreaseDebt(address)   external pure returns (bool) { return true; }
    function canLiquidate(address)      external pure returns (bool) { return true; }
}

/// @notice Locks in the compliance-mode semantics: on a deployment with `REQUIRE_COMPLIANCE = true`,
/// no market can exist without a non-zero, admin-whitelisted gate on both roles.
contract ComplianceModeTest is Test {
    Covenant internal covenant;
    PermissiveGate internal approvedGate;
    PermissiveGate internal unapprovedGate;

    ERC20NoRevert internal loanToken;
    ERC20NoRevert internal collateralToken;
    Oracle internal oracle;

    address internal admin = makeAddr("admin");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        vm.warp(1_800_000_000);

        // Compliance mode ON.
        vm.prank(admin);
        covenant = new Covenant(true, admin);

        approvedGate   = new PermissiveGate();
        unapprovedGate = new PermissiveGate();

        vm.prank(admin);
        covenant.setApprovedGate(address(approvedGate), true);

        loanToken       = new ERC20NoRevert("loan");
        collateralToken = new ERC20NoRevert("collat");
        oracle          = new Oracle();
    }

    /* CONSTRUCTOR + ADMIN */

    function test_constructor_recordsMode() public view {
        assertTrue(covenant.REQUIRE_COMPLIANCE());
        assertEq(covenant.gateAdmin(), admin);
    }

    function test_constructor_rejectsZeroAdminInComplianceMode() public {
        vm.expectRevert(ICovenant.OnlyGateAdmin.selector);
        new Covenant(true, address(0));
    }

    function test_constructor_zeroAdminOkWhenPermissive() public {
        Covenant permissive = new Covenant(false, address(0));
        assertFalse(permissive.REQUIRE_COMPLIANCE());
        assertEq(permissive.gateAdmin(), address(0));
    }

    function test_setApprovedGate_onlyAdmin() public {
        vm.prank(outsider);
        vm.expectRevert(ICovenant.OnlyGateAdmin.selector);
        covenant.setApprovedGate(address(approvedGate), true);
    }

    function test_transferGateAdmin_movesRole() public {
        vm.prank(admin);
        covenant.transferGateAdmin(outsider);
        assertEq(covenant.gateAdmin(), outsider);

        vm.prank(admin);
        vm.expectRevert(ICovenant.OnlyGateAdmin.selector);
        covenant.setApprovedGate(address(unapprovedGate), true);
    }

    /* MARKET CREATION GATING */

    function test_initMarket_revertsIfEntryGateZero() public {
        Market memory m = _market(address(0), address(approvedGate));
        vm.expectRevert(ICovenant.MissingComplianceGate.selector);
        covenant.initMarket(m);
    }

    function test_initMarket_revertsIfSeizureGateZero() public {
        Market memory m = _market(address(approvedGate), address(0));
        vm.expectRevert(ICovenant.MissingComplianceGate.selector);
        covenant.initMarket(m);
    }

    function test_initMarket_revertsIfEntryGateNotWhitelisted() public {
        Market memory m = _market(address(unapprovedGate), address(approvedGate));
        vm.expectRevert(
            abi.encodeWithSelector(ICovenant.GateNotApproved.selector, address(unapprovedGate))
        );
        covenant.initMarket(m);
    }

    function test_initMarket_revertsIfSeizureGateNotWhitelisted() public {
        Market memory m = _market(address(approvedGate), address(unapprovedGate));
        vm.expectRevert(
            abi.encodeWithSelector(ICovenant.GateNotApproved.selector, address(unapprovedGate))
        );
        covenant.initMarket(m);
    }

    function test_initMarket_succeedsWithBothGatesApproved() public {
        Market memory m = _market(address(approvedGate), address(approvedGate));
        bytes32 id = covenant.initMarket(m);
        assertGt(covenant.tickSpacing(id), 0, "market must be created");
    }

    /* REVOCATION DOES NOT UNMAKE EXISTING MARKETS */

    function test_revokingGate_doesNotInvalidateExistingMarkets() public {
        Market memory m = _market(address(approvedGate), address(approvedGate));
        bytes32 id = covenant.initMarket(m);
        uint256 tsBefore = covenant.tickSpacing(id);

        vm.prank(admin);
        covenant.setApprovedGate(address(approvedGate), false);

        // Existing market still exists; only NEW markets bound to the revoked gate would fail.
        assertEq(covenant.tickSpacing(id), tsBefore);

        Market memory m2 = _market(address(approvedGate), address(approvedGate));
        m2.maturity = m.maturity + 1; // different market id
        vm.expectRevert(
            abi.encodeWithSelector(ICovenant.GateNotApproved.selector, address(approvedGate))
        );
        covenant.initMarket(m2);
    }

    /* HELPER */

    function _market(address entry, address seizure) internal view returns (Market memory m) {
        m.loanToken = address(loanToken);
        m.maturity = block.timestamp + 30 days;
        m.entryGate = entry;
        m.seizureGate = seizure;
        m.collateralParams = new CollateralParams[](1);
        m.collateralParams[0] = CollateralParams({
            token:  address(collateralToken),
            lltv:   0.77e18,
            maxLif: _maxLif(0.77e18, LIQUIDATION_CURSOR_LOW),
            oracle: address(oracle)
        });
    }

    function _maxLif(uint256 lltv, uint256 cursor) internal pure returns (uint256) {
        // Mirrors BaseTest.maxLif — the underlying formula from UtilsLib.
        uint256 loss = (WAD - lltv) * cursor / WAD;
        return WAD * WAD / (WAD - loss);
    }
}
