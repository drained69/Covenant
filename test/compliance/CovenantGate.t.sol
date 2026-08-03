// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";

import {CovenantGate} from "../../src/compliance/CovenantGate.sol";
import {ComplianceAction, Identity, ICovenantRegistry} from "../../src/compliance/interfaces/ICovenantRegistry.sol";
import {MockCovenantRegistry} from "./mocks/MockCovenantRegistry.sol";

contract CovenantGateTest is Test {
    bytes32 internal constant POLICY_ID = keccak256("COVENANT_POLICY_SG_TOKENIZED_DEPOSIT");
    uint16 internal constant SINGAPORE = 702;

    MockCovenantRegistry internal registry;
    CovenantGate internal gate;

    address internal institution = makeAddr("institution");
    address internal unverified = makeAddr("unverified");

    function setUp() public {
        // Start at a realistic timestamp so credential expiry arithmetic is meaningful.
        vm.warp(1_800_000_000);

        registry = new MockCovenantRegistry();
        gate = new CovenantGate(registry, POLICY_ID);
    }

    /* CONSTRUCTOR */

    function test_constructor_setsImmutables() public view {
        assertEq(address(gate.REGISTRY()), address(registry), "registry");
        assertEq(gate.POLICY_ID(), POLICY_ID, "policy id");
    }

    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(CovenantGate.ZeroRegistry.selector);
        new CovenantGate(ICovenantRegistry(address(0)), POLICY_ID);
    }

    function test_constructor_revertsOnZeroPolicyId() public {
        vm.expectRevert(CovenantGate.ZeroPolicyId.selector);
        new CovenantGate(registry, bytes32(0));
    }

    /* VERIFIED PARTICIPANT: ALLOWED */

    function test_verifiedInstitution_mayLendBorrowAndLiquidate() public {
        registry.verify(POLICY_ID, institution, SINGAPORE);

        assertTrue(gate.canIncreaseCredit(institution), "lend");
        assertTrue(gate.canIncreaseDebt(institution), "borrow");
        assertTrue(gate.canLiquidate(institution), "seize");
    }

    /* NO CREDENTIAL: DENIED */

    function test_unverifiedAccount_deniedEverywhere() public view {
        assertFalse(gate.canIncreaseCredit(unverified), "lend");
        assertFalse(gate.canIncreaseDebt(unverified), "borrow");
        assertFalse(gate.canLiquidate(unverified), "seize");
    }

    /* REVOCATION */

    function test_revokedCredential_blocksAllActions() public {
        registry.verify(POLICY_ID, institution, SINGAPORE);
        assertTrue(gate.canIncreaseCredit(institution), "allowed before revocation");

        registry.revoke(institution);

        assertFalse(gate.canIncreaseCredit(institution), "lend after revocation");
        assertFalse(gate.canIncreaseDebt(institution), "borrow after revocation");
        assertFalse(gate.canLiquidate(institution), "seize after revocation");
    }

    /* EXPIRY */

    function test_expiredCredential_isDenied() public {
        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp - 365 days),
                expiresAt: uint64(block.timestamp - 1),
                revoked: false
            })
        );
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        assertFalse(gate.canIncreaseCredit(institution), "expired credential must be denied");
    }

    function test_credentialExpiringThisSecond_isDenied() public {
        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp - 1 days),
                expiresAt: uint64(block.timestamp),
                revoked: false
            })
        );
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        // Expiry is exclusive: a credential expiring at the current timestamp is no longer live.
        assertFalse(gate.canIncreaseCredit(institution), "boundary expiry must be denied");
    }

    function test_notYetValidCredential_isDenied() public {
        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp + 1 days),
                expiresAt: 0,
                revoked: false
            })
        );
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        assertFalse(gate.canIncreaseCredit(institution), "future-dated credential must be denied");
    }

    function test_neverExpiringCredential_isAllowed() public {
        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp - 1 days),
                expiresAt: 0,
                revoked: false
            })
        );
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        assertTrue(gate.canIncreaseCredit(institution), "zero expiry means no expiry");
    }

    /* POLICY ENGINE IS AUTHORITATIVE PER ACTION */

    function test_policyDeniesPerAction_credentialAloneIsInsufficient() public {
        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp),
                expiresAt: 0,
                revoked: false
            })
        );

        // Permitted to lend, but not to borrow or seize.
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        assertTrue(gate.canIncreaseCredit(institution), "lend permitted");
        assertFalse(gate.canIncreaseDebt(institution), "borrow not permitted by policy");
        assertFalse(gate.canLiquidate(institution), "seize not permitted by policy");
    }

    function test_policyScopedToItsOwnId() public {
        // Verified under a different policy than the one this gate enforces.
        registry.verify(keccak256("SOME_OTHER_POLICY"), institution, SINGAPORE);

        assertFalse(
            gate.canIncreaseCredit(institution), "clearance under another policy must not satisfy this gate"
        );
    }

    /* FAIL-CLOSED UNDER REGISTRY FAILURE */

    function test_revertingRegistry_deniesWithoutReverting() public {
        registry.verify(POLICY_ID, institution, SINGAPORE);
        registry.setReverting(true);

        // The gate must absorb the failure. If it propagated, a market would be unusable during an outage.
        assertFalse(gate.canIncreaseCredit(institution), "lend");
        assertFalse(gate.canIncreaseDebt(institution), "borrow");
        assertFalse(gate.canLiquidate(institution), "seize");
    }

    function test_malformedRegistryResponse_deniesWithoutReverting() public {
        registry.verify(POLICY_ID, institution, SINGAPORE);
        registry.setMalformed(true);

        assertFalse(gate.canIncreaseCredit(institution), "truncated return data must not decode as compliant");
    }

    function test_registryWithNoCode_deniesWithoutReverting() public {
        CovenantGate orphaned = new CovenantGate(ICovenantRegistry(makeAddr("nothing")), POLICY_ID);

        assertFalse(orphaned.canIncreaseCredit(institution), "call into codeless address must deny");
    }

    /* GAS GRIEFING */

    function test_gasGriefingRegistry_cannotDrainCaller() public {
        registry.verify(POLICY_ID, institution, SINGAPORE);
        registry.setGasGriefing(true);

        uint256 before = gasleft();
        bool allowed = gate.canIncreaseCredit(institution);
        uint256 used = before - gasleft();

        assertFalse(allowed, "griefing registry must deny");
        // The gate caps gas forwarded to the registry, so a registry burning everything it receives cannot
        // consume the caller's whole budget and force the enclosing trade to fail for lack of gas.
        assertLt(used, 400_000, "gas consumption must stay bounded");
    }

    /* FUZZ */

    function testFuzz_unverifiedAccountAlwaysDenied(address account) public view {
        vm.assume(account != address(0));

        assertFalse(gate.canIncreaseCredit(account), "lend");
        assertFalse(gate.canIncreaseDebt(account), "borrow");
        assertFalse(gate.canLiquidate(account), "seize");
    }

    function testFuzz_credentialLivenessTracksTimestamp(uint64 expiresAt, uint32 elapsed) public {
        expiresAt = uint64(bound(expiresAt, block.timestamp + 1, block.timestamp + 3650 days));

        registry.setIdentity(
            institution,
            Identity({
                credentialId: keccak256("credential"),
                jurisdiction: SINGAPORE,
                issuedAt: uint64(block.timestamp),
                expiresAt: expiresAt,
                revoked: false
            })
        );
        registry.setPolicy(POLICY_ID, institution, ComplianceAction.Lend, true);

        vm.warp(block.timestamp + elapsed);

        assertEq(
            gate.canIncreaseCredit(institution),
            block.timestamp < expiresAt,
            "liveness must equal whether the credential has expired"
        );
    }
}
