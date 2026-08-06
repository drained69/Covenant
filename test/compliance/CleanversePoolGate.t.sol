// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";

import {CleanversePoolGate} from "../../src/compliance/CleanversePoolGate.sol";
import {IAPassComplianceValidator, RuleV2} from "../../src/compliance/interfaces/IAPassComplianceValidator.sol";
import {MockAPassValidator} from "./mocks/MockAPassValidator.sol";

/// @notice Behavioural spec for CleanversePoolGate against the CVI Compliance Validator (CCP V2).
/// Every gate hook resolves to `isRegistered(this) ∧ complianceVerify(this, account)` and every
/// failure mode along the way must degrade to denial without ever propagating.
contract CleanversePoolGateTest is Test {
    MockAPassValidator internal validator;
    CleanversePoolGate internal gate;

    address internal wallet = makeAddr("wallet");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        validator = new MockAPassValidator();
        gate = new CleanversePoolGate(validator, address(this));
        // Register the gate as a pool with the validator. In production this happens off-chain via
        // POST /api/cooperate/validator/register with an EIP-191 personal-sign by the owner over
        // `chain + address(this).toLowerCase()`.
        validator.setRegistered(address(gate), true);
    }

    /* CONSTRUCTOR */

    function test_constructor_setsImmutableValidator() public view {
        assertEq(address(gate.validator()), address(validator));
    }

    function test_constructor_setsOwner() public view {
        assertEq(gate.owner(), address(this));
    }

    function test_constructor_revertsOnZeroValidator() public {
        vm.expectRevert(CleanversePoolGate.ZeroValidator.selector);
        new CleanversePoolGate(IAPassComplianceValidator(address(0)), address(this));
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(CleanversePoolGate.ZeroOwner.selector);
        new CleanversePoolGate(validator, address(0));
    }

    /* OWNERSHIP + RULE MANAGEMENT */

    function test_transferOwnership_movesOwner() public {
        address newOwner = makeAddr("newOwner");
        gate.transferOwnership(newOwner);
        assertEq(gate.owner(), newOwner);
    }

    function test_transferOwnership_onlyOwner() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(CleanversePoolGate.NotOwner.selector);
        gate.transferOwnership(makeAddr("newOwner"));
    }

    function test_setRule_forwardsToValidator() public {
        RuleV2 memory r = RuleV2(bytes2(0), bytes2(0), 30, 0, 0);
        gate.setRule(r);
        RuleV2[] memory rules = gate.getRules();
        assertEq(rules.length, 1, "one rule installed");
        assertEq(rules[0].minTier, 30, "tier propagated");
    }

    function test_addRule_appends() public {
        gate.setRule(RuleV2(bytes2(0), bytes2(0), 10, 0, 0));
        gate.addRule(RuleV2(bytes2(0), bytes2(0), 20, 0, 0));
        assertEq(gate.getRules().length, 2);
    }

    function test_ruleManagement_onlyOwner() public {
        RuleV2 memory r = RuleV2(bytes2(0), bytes2(0), 30, 0, 0);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(CleanversePoolGate.NotOwner.selector);
        gate.setRule(r);
    }

    /* HAPPY PATH */

    function test_verifiedWallet_isEligibleEverywhere() public {
        validator.setVerified(address(gate), wallet, true);

        assertTrue(gate.canIncreaseCredit(wallet), "lend");
        assertTrue(gate.canIncreaseDebt(wallet), "borrow");
        assertTrue(gate.canLiquidate(wallet), "seize");
    }

    function test_unverifiedWallet_deniedEverywhere() public view {
        assertFalse(gate.canIncreaseCredit(outsider), "lend");
        assertFalse(gate.canIncreaseDebt(outsider), "borrow");
        assertFalse(gate.canLiquidate(outsider), "seize");
    }

    /* PAUSED POOL — CCP V2 folds pause into complianceVerify returning false */

    function test_pausedPool_deniesEvenVerifiedWallet() public {
        validator.setVerified(address(gate), wallet, true);
        validator.setPaused(address(gate), true);

        assertFalse(gate.canIncreaseCredit(wallet), "paused pool must deny via complianceVerify=false");
    }

    /* UNREGISTERED POOL */

    function test_unregisteredPool_deniesEverything() public {
        validator.setVerified(address(gate), wallet, true);
        validator.setRegistered(address(gate), false);

        assertFalse(
            gate.canIncreaseCredit(wallet),
            "an unregistered pool means the gate is misconfigured; deny until fixed"
        );
    }

    /* FAIL-CLOSED UNDER VALIDATOR FAILURE */

    function test_revertingValidator_deniesWithoutReverting() public {
        validator.setVerified(address(gate), wallet, true);
        validator.setReverting(true);

        assertFalse(gate.canIncreaseCredit(wallet), "lend");
        assertFalse(gate.canIncreaseDebt(wallet), "borrow");
        assertFalse(gate.canLiquidate(wallet), "seize");
    }

    function test_malformedValidatorResponse_deniesWithoutReverting() public {
        validator.setVerified(address(gate), wallet, true);
        validator.setMalformed(true);

        assertFalse(gate.canIncreaseCredit(wallet), "truncated return must not decode as eligible");
    }

    function test_validatorWithNoCode_deniesWithoutReverting() public {
        CleanversePoolGate orphaned = new CleanversePoolGate(IAPassComplianceValidator(makeAddr("nothing")), address(this));

        // A staticcall into a codeless address returns success with empty data. That must be a denial.
        assertFalse(orphaned.canIncreaseCredit(wallet), "codeless validator must deny");
    }

    /* GAS GRIEFING */

    function test_gasGriefingValidator_cannotDrainCaller() public {
        validator.setVerified(address(gate), wallet, true);
        validator.setGasGriefing(true);

        uint256 before = gasleft();
        bool eligible = gate.canIncreaseCredit(wallet);
        uint256 used = before - gasleft();

        assertFalse(eligible, "griefing validator must deny");
        // The gate caps gas forwarded to each of the two reads (isRegistered, complianceVerify), so
        // a validator burning everything it receives cannot consume the caller's whole budget and
        // force the enclosing trade to fail for lack of gas.
        assertLt(used, 1_000_000, "gas consumption must stay bounded");
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
        validator.setVerified(address(gate), user, true);

        assertTrue(gate.canIncreaseCredit(user));
        assertTrue(gate.canIncreaseDebt(user));
        assertTrue(gate.canLiquidate(user));
    }
}
