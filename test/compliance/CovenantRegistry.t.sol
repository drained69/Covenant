// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";

import {CovenantGate} from "../../src/compliance/CovenantGate.sol";
import {CovenantRegistry} from "../../src/compliance/CovenantRegistry.sol";
import {ComplianceAction, Identity} from "../../src/compliance/interfaces/ICovenantRegistry.sol";

contract CovenantRegistryTest is Test {
    bytes32 internal constant POLICY_ID = keccak256("COVENANT_POLICY_SG_TOKENIZED_DEPOSIT");
    bytes32 internal constant CREDENTIAL = keccak256("cleanverse:verification:001");
    bytes32 internal constant REASON_SANCTIONS = bytes32("OFAC_SDN_MATCH");
    uint16 internal constant SINGAPORE = 702;

    CovenantRegistry internal registry;
    CovenantGate internal gate;

    address internal owner = makeAddr("owner");
    address internal attester = makeAddr("attester");
    address internal institution = makeAddr("institution");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        vm.warp(1_800_000_000);

        registry = new CovenantRegistry(owner);

        vm.prank(owner);
        registry.setAttester(attester, true);

        gate = new CovenantGate(registry, POLICY_ID);
    }

    /* ACCESS CONTROL */

    function test_onlyOwnerCanSetAttester() public {
        vm.prank(outsider);
        vm.expectRevert(CovenantRegistry.NotOwner.selector);
        registry.setAttester(outsider, true);
    }

    function test_onlyAttesterCanAttest() public {
        vm.prank(outsider);
        vm.expectRevert(CovenantRegistry.NotAttester.selector);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
    }

    function test_onlyAttesterCanSetPolicyPermit() public {
        vm.prank(outsider);
        vm.expectRevert(CovenantRegistry.NotAttester.selector);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Lend, true);
    }

    function test_revokedAttesterLosesWriteAccess() public {
        vm.prank(owner);
        registry.setAttester(attester, false);

        vm.prank(attester);
        vm.expectRevert(CovenantRegistry.NotAttester.selector);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
    }

    /* ATTESTATION */

    function test_attestStoresAndEmits() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit CovenantRegistry.AttestationRecorded(
            institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0, attester
        );

        vm.prank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);

        Identity memory identity = registry.identityOf(institution);
        assertEq(identity.credentialId, CREDENTIAL, "credential id");
        assertEq(identity.jurisdiction, SINGAPORE, "jurisdiction");
        assertFalse(identity.revoked, "not revoked");
    }

    function test_attestRejectsZeroCredentialId() public {
        vm.prank(attester);
        vm.expectRevert(CovenantRegistry.ZeroCredentialId.selector);
        registry.attest(institution, bytes32(0), SINGAPORE, uint64(block.timestamp), 0);
    }

    function test_attestRejectsInvertedValidityWindow() public {
        vm.prank(attester);
        vm.expectRevert(CovenantRegistry.InvalidValidityWindow.selector);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), uint64(block.timestamp - 1));
    }

    /* REVOCATION IS TERMINAL PER CREDENTIAL */

    function test_revokeIsNotReversibleUnderSameCredentialId() public {
        vm.startPrank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
        registry.revoke(institution, REASON_SANCTIONS);

        // Re-attesting under the same credential id would erase the revocation and, with it, the audit trail.
        vm.expectRevert(CovenantRegistry.CredentialIdInUse.selector);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
        vm.stopPrank();

        assertTrue(registry.identityOf(institution).revoked, "must remain revoked");
    }

    function test_reAttestingWithFreshCredentialIdRestoresAccess() public {
        vm.startPrank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Lend, true);
        registry.revoke(institution, REASON_SANCTIONS);

        assertFalse(gate.canIncreaseCredit(institution), "denied while revoked");

        // A new verification produces a new credential id, which is the auditable way back in.
        registry.attest(institution, keccak256("cleanverse:verification:002"), SINGAPORE, uint64(block.timestamp), 0);
        vm.stopPrank();

        assertTrue(gate.canIncreaseCredit(institution), "restored under a fresh credential");
    }

    function test_cannotRevokeTwice() public {
        vm.startPrank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), 0);
        registry.revoke(institution, REASON_SANCTIONS);

        vm.expectRevert(CovenantRegistry.AlreadyRevoked.selector);
        registry.revoke(institution, REASON_SANCTIONS);
        vm.stopPrank();
    }

    function test_cannotRevokeUnattestedAccount() public {
        vm.prank(attester);
        vm.expectRevert(CovenantRegistry.ZeroCredentialId.selector);
        registry.revoke(outsider, REASON_SANCTIONS);
    }

    /* POLICY PERMITS */

    function test_permitsAreIndependentPerAction() public {
        vm.startPrank(attester);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Lend, true);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Borrow, true);
        vm.stopPrank();

        assertTrue(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Lend), "lend");
        assertTrue(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Borrow), "borrow");
        assertFalse(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Liquidate), "seize");
    }

    function test_clearingOnePermitLeavesOthersIntact() public {
        ComplianceAction[] memory actions = new ComplianceAction[](3);
        actions[0] = ComplianceAction.Lend;
        actions[1] = ComplianceAction.Borrow;
        actions[2] = ComplianceAction.Liquidate;
        bool[] memory allowed = new bool[](3);
        allowed[0] = true;
        allowed[1] = true;
        allowed[2] = true;

        vm.startPrank(attester);
        registry.setPolicyPermits(POLICY_ID, institution, actions, allowed);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Borrow, false);
        vm.stopPrank();

        assertTrue(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Lend), "lend retained");
        assertFalse(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Borrow), "borrow cleared");
        assertTrue(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Liquidate), "seize retained");
    }

    function test_permitsAreScopedPerPolicy() public {
        vm.prank(attester);
        registry.setPolicyPermit(keccak256("OTHER_POLICY"), institution, ComplianceAction.Lend, true);

        assertFalse(registry.checkPolicy(POLICY_ID, institution, ComplianceAction.Lend), "must not leak across policies");
    }

    /* END-TO-END THROUGH THE GATE */

    function test_fullAttesterFlowGrantsMarketAccess() public {
        assertFalse(gate.canIncreaseCredit(institution), "denied before attestation");

        ComplianceAction[] memory actions = new ComplianceAction[](2);
        actions[0] = ComplianceAction.Lend;
        actions[1] = ComplianceAction.Borrow;
        bool[] memory allowed = new bool[](2);
        allowed[0] = true;
        allowed[1] = true;

        vm.startPrank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, uint64(block.timestamp), uint64(block.timestamp + 365 days));
        registry.setPolicyPermits(POLICY_ID, institution, actions, allowed);
        vm.stopPrank();

        assertTrue(gate.canIncreaseCredit(institution), "may lend");
        assertTrue(gate.canIncreaseDebt(institution), "may borrow");
        assertFalse(gate.canLiquidate(institution), "liquidation not granted");

        // Attestation lapses without anyone acting.
        vm.warp(block.timestamp + 366 days);
        assertFalse(gate.canIncreaseCredit(institution), "expiry denies without a transaction");
    }

    function testFuzz_attestationLivenessMatchesGate(uint64 validity, uint32 elapsed) public {
        validity = uint64(bound(validity, 1 days, 3650 days));

        uint64 issuedAt = uint64(block.timestamp);
        uint64 expiresAt = issuedAt + validity;

        vm.startPrank(attester);
        registry.attest(institution, CREDENTIAL, SINGAPORE, issuedAt, expiresAt);
        registry.setPolicyPermit(POLICY_ID, institution, ComplianceAction.Lend, true);
        vm.stopPrank();

        vm.warp(uint256(issuedAt) + elapsed);

        assertEq(gate.canIncreaseCredit(institution), block.timestamp < expiresAt, "gate must track expiry");
    }
}
