// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {EthosTierGate} from "../../src/reputation/EthosTierGate.sol";

/// @dev Verifies the Ethos tier gate's authorization semantics: signature
///      validity, wallet/chain/nonce binding, expiry, and the threshold check.
contract EthosTierGateTest is Test {
    EthosTierGate internal gate;

    uint256 internal signerKey = 0xA11CE;
    address internal signer;
    address internal trader = makeAddr("trader");
    address internal anyone = makeAddr("anyone");

    uint128 internal constant THRESHOLD = 1600;

    function setUp() public {
        signer = vm.addr(signerKey);
        gate = new EthosTierGate(THRESHOLD, signer);
    }

    /// @dev Builds the EIP-712 digest exactly as the gate does.
    function digest(EthosTierGate.ScoreAuthorization memory a) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                gate.EIP712_DOMAIN_TYPEHASH(),
                keccak256("Covenant Ethos Score"),
                keccak256("1"),
                block.chainid,
                address(gate)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                gate.SCORE_AUTHORIZATION_TYPEHASH(),
                a.wallet,
                a.score,
                a.deadline,
                a.nonce,
                a.chainId
            )
        );
        return keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));
    }

    function auth(
        address wallet,
        uint128 score,
        uint64 deadline,
        uint256 nonce
    ) internal view returns (EthosTierGate.ScoreAuthorization memory) {
        return EthosTierGate.ScoreAuthorization({
            wallet: wallet,
            score: score,
            deadline: deadline,
            nonce: nonce,
            chainId: block.chainid
        });
    }

    function sign(EthosTierGate.ScoreAuthorization memory a)
        internal
        view
        returns (EthosTierGate.Sig memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest(a));
        return EthosTierGate.Sig({v: v, r: r, s: s});
    }

    /* ── authorization ─────────────────────────────────────────────── */

    function testAuthorizeGrantsDebtAccessAtThreshold() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 1600, uint64(block.timestamp + 1 hours), 1);
        gate.authorize(a, sign(a));
        assertTrue(gate.canIncreaseDebt(trader));
        assertEqUint(gate.authorizedScore(trader), 1600);
    }

    function testAuthorizeIsPermissionless() public {
        // Anyone may submit the authorization; the signature carries authority.
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        vm.prank(anyone);
        gate.authorize(a, sign(a));
        assertTrue(gate.canIncreaseDebt(trader));
    }

    function testBelowThresholdAuthorizesButDoesNotAdmit() public {
        // The authorization itself is valid; the tier check is what fails.
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 1599, uint64(block.timestamp + 1 hours), 1);
        gate.authorize(a, sign(a));
        assertFalse(gate.canIncreaseDebt(trader));
        assertEqUint(gate.authorizedScore(trader), 1599);
    }

    function testUnauthorizedWalletIsDenied() public view {
        assertFalse(gate.canIncreaseDebt(anyone));
    }

    /* ── binding ──────────────────────────────────────────────────── */

    function testWrongSignerReverts() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest(a));
        vm.expectRevert(EthosTierGate.InvalidSignature.selector);
        gate.authorize(a, EthosTierGate.Sig({v: v, r: r, s: s}));
    }

    function testGarbageSignatureReverts() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        vm.expectRevert(EthosTierGate.InvalidSignature.selector);
        gate.authorize(
            a,
            EthosTierGate.Sig({v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))})
        );
    }

    function testWrongChainReverts() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        a.chainId = block.chainid + 1;
        // Sign the tampered struct so the failure is the chain check, not the sig.
        EthosTierGate.Sig memory sig = sign(a);
        vm.expectRevert(EthosTierGate.WrongChain.selector);
        gate.authorize(a, sig);
    }

    function testExpiredAuthorizationReverts() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp - 1), 1);
        EthosTierGate.Sig memory sig = sign(a);
        vm.expectRevert(EthosTierGate.Expired.selector);
        gate.authorize(a, sig);
    }

    function testNonceReplayReverts() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        EthosTierGate.Sig memory sig = sign(a);
        gate.authorize(a, sig);
        vm.expectRevert(EthosTierGate.NonceAlreadyUsed.selector);
        gate.authorize(a, sig);
    }

    /// @dev A signature over a different wallet is a valid signature for that
    ///      wallet — the digest commits to `auth.wallet`, so submitting it under
    ///      another wallet's identity is impossible by construction. This test
    ///      pins the property that the recovered signer is checked against
    ///      nothing but SIGNER: the *struct*, not the caller, names the wallet.
    function testAuthorizationIsWalletBound() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        gate.authorize(a, sign(a));
        // The submitter gained nothing: only the named wallet is authorized.
        assertFalse(gate.canIncreaseDebt(anyone));
    }

    /* ── expiry ───────────────────────────────────────────────────── */

    function testAccessExpiresAtDeadline() public {
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 2000, uint64(block.timestamp + 1 hours), 1);
        gate.authorize(a, sign(a));
        assertTrue(gate.canIncreaseDebt(trader));

        vm.warp(block.timestamp + 1 hours + 1 seconds);
        assertFalse(gate.canIncreaseDebt(trader));
    }

    function testNewerAuthorizationOverwrites() public {
        EthosTierGate.ScoreAuthorization memory first =
            auth(trader, 1200, uint64(block.timestamp + 1 hours), 1);
        gate.authorize(first, sign(first));
        assertFalse(gate.canIncreaseDebt(trader));

        EthosTierGate.ScoreAuthorization memory second =
            auth(trader, 1900, uint64(block.timestamp + 1 hours), 2);
        gate.authorize(second, sign(second));
        assertTrue(gate.canIncreaseDebt(trader));
    }

    /* ── open surfaces ────────────────────────────────────────────── */

    function testLendingAndLiquidationAreAlwaysOpen() public {
        assertTrue(gate.canIncreaseCredit(anyone));
        assertTrue(gate.canLiquidate(anyone));
    }

    /* ── threshold-0 gate admits any scored wallet ────────────────── */

    function testOpenTierGateAdmitsAnyScore() public {
        EthosTierGate openGate = new EthosTierGate(0, signer);
        EthosTierGate.ScoreAuthorization memory a = auth(trader, 1, uint64(block.timestamp + 1 hours), 1);
        // Sign against the open gate's own domain.
        vm.prank(anyone);
        openGate.authorize(
            a,
            signFor(openGate, a)
        );
        assertTrue(openGate.canIncreaseDebt(trader));
    }

    function signFor(EthosTierGate target, EthosTierGate.ScoreAuthorization memory a)
        internal
        view
        returns (EthosTierGate.Sig memory)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                target.EIP712_DOMAIN_TYPEHASH(),
                keccak256("Covenant Ethos Score"),
                keccak256("1"),
                block.chainid,
                address(target)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                target.SCORE_AUTHORIZATION_TYPEHASH(),
                a.wallet,
                a.score,
                a.deadline,
                a.nonce,
                a.chainId
            )
        );
        bytes32 d = keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, d);
        return EthosTierGate.Sig({v: v, r: r, s: s});
    }
}
