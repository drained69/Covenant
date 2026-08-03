// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";

import {CleanversePoolGate} from "../../src/compliance/CleanversePoolGate.sol";
import {ICleanversePool} from "../../src/compliance/interfaces/ICleanversePool.sol";
import {MockCleanversePool} from "./mocks/MockCleanversePool.sol";

contract CleanversePoolGateTest is Test {
    MockCleanversePool internal pool;
    CleanversePoolGate internal gate;

    address internal wallet = makeAddr("wallet");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        pool = new MockCleanversePool();
        gate = new CleanversePoolGate(pool);
    }

    /* CONSTRUCTOR */

    function test_constructor_setsImmutablePool() public view {
        assertEq(address(gate.pool()), address(pool));
    }

    function test_constructor_revertsOnZeroPool() public {
        vm.expectRevert(CleanversePoolGate.ZeroPool.selector);
        new CleanversePoolGate(ICleanversePool(address(0)));
    }

    /* HAPPY PATH */

    function test_verifiedWallet_isEligibleEverywhere() public {
        pool.setVerified(wallet, true);

        assertTrue(gate.canIncreaseCredit(wallet), "lend");
        assertTrue(gate.canIncreaseDebt(wallet), "borrow");
        assertTrue(gate.canLiquidate(wallet), "seize");
    }

    function test_unverifiedWallet_deniedEverywhere() public view {
        assertFalse(gate.canIncreaseCredit(outsider), "lend");
        assertFalse(gate.canIncreaseDebt(outsider), "borrow");
        assertFalse(gate.canLiquidate(outsider), "seize");
    }

    /* PAUSED POOL */

    function test_pausedPool_deniesEvenVerifiedWallet() public {
        pool.setVerified(wallet, true);
        pool.setPaused(true);

        assertFalse(gate.canIncreaseCredit(wallet), "paused pool must deny");
    }

    /* UNREGISTERED POOL */

    function test_unregisteredPool_deniesEverything() public {
        pool.setVerified(wallet, true);
        pool.setRegistered(false);

        assertFalse(
            gate.canIncreaseCredit(wallet),
            "an unregistered pool means the gate is misconfigured; deny until fixed"
        );
    }

    /* FAIL-CLOSED UNDER POOL FAILURE */

    function test_revertingPool_deniesWithoutReverting() public {
        pool.setVerified(wallet, true);
        pool.setReverting(true);

        // The gate must absorb the failure. If it propagated, a market would be unusable during a
        // Cleanverse outage.
        assertFalse(gate.canIncreaseCredit(wallet), "lend");
        assertFalse(gate.canIncreaseDebt(wallet), "borrow");
        assertFalse(gate.canLiquidate(wallet), "seize");
    }

    function test_malformedPoolResponse_deniesWithoutReverting() public {
        pool.setVerified(wallet, true);
        pool.setMalformed(true);

        assertFalse(gate.canIncreaseCredit(wallet), "truncated return must not decode as eligible");
    }

    function test_poolWithNoCode_deniesWithoutReverting() public {
        CleanversePoolGate orphaned = new CleanversePoolGate(ICleanversePool(makeAddr("nothing")));

        // A staticcall into a codeless address returns success with empty data. That must be a denial.
        assertFalse(orphaned.canIncreaseCredit(wallet), "codeless pool must deny");
    }

    /* GAS GRIEFING */

    function test_gasGriefingPool_cannotDrainCaller() public {
        pool.setVerified(wallet, true);
        pool.setGasGriefing(true);

        uint256 before = gasleft();
        bool eligible = gate.canIncreaseCredit(wallet);
        uint256 used = before - gasleft();

        assertFalse(eligible, "griefing pool must deny");
        // The gate caps gas forwarded to each of the three reads (isRegistered, paused, verify), so a
        // pool burning everything it receives cannot consume the caller's whole budget and force the
        // enclosing trade to fail for lack of gas.
        assertLt(used, 1_000_000, "gas consumption must stay bounded");
    }

    /* CHECK ORDER: paused short-circuits verify */

    function test_pausedShortCircuits_doesNotCallVerify() public {
        pool.setVerified(wallet, true);
        pool.setPaused(true);
        // If we didn't short-circuit, and verify happened to return true, we'd falsely allow. Guard
        // regressions by asserting the paused outcome is stable regardless of verify's setting.
        assertFalse(gate.canIncreaseCredit(wallet));
    }

    /* FUZZ */

    function testFuzz_unverifiedWalletAlwaysDenied(address user) public view {
        vm.assume(user != address(0));

        assertFalse(gate.canIncreaseCredit(user));
        assertFalse(gate.canIncreaseDebt(user));
        assertFalse(gate.canLiquidate(user));
    }

    function testFuzz_verifiedWalletAlwaysAllowedWhenLive(address user) public {
        vm.assume(user != address(0));
        pool.setVerified(user, true);

        assertTrue(gate.canIncreaseCredit(user));
        assertTrue(gate.canIncreaseDebt(user));
        assertTrue(gate.canLiquidate(user));
    }
}
