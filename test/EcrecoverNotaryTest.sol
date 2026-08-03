// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {Offer} from "../src/interfaces/ICovenant.sol";
import {CALLBACK_SUCCESS} from "../src/libraries/ConstantsLib.sol";
import {HashLib} from "../src/notaries/libraries/HashLib.sol";
import {
    IEcrecoverNotary,
    Signature,
    EIP712_DOMAIN_TYPEHASH
} from "../src/notaries/interfaces/IEcrecoverNotary.sol";
import {BaseTest} from "./BaseTest.sol";

contract EcrecoverNotaryTest is BaseTest {
    function buildNotaryData(bytes32 _root, address _signer) internal view returns (bytes memory) {
        Signature memory sig = signature(_root, privateKey[_signer], address(ecrecoverNotary), 0);
        return abi.encode(sig, _root, 0, new bytes32[](0));
    }

    function makeOffer(address maker) internal view returns (Offer memory offer) {
        offer.maker = maker;
        offer.notary = address(ecrecoverNotary);
        offer.expiry = vm.getBlockTimestamp() + 200;
    }

    function testDomainSeparator() public view {
        bytes32 _domainSeparator =
            keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, block.chainid, address(ecrecoverNotary)));
        bytes32 expectedDomainSeparator = vm.eip712HashStruct(
            "EIP712Domain(uint256 chainId,address verifyingContract)",
            abi.encode(block.chainid, address(ecrecoverNotary))
        );
        assertEq(_domainSeparator, expectedDomainSeparator);
    }

    function testIsNotarizedValidSignature(uint256 privateKey) public {
        privateKey = boundPrivateKey(privateKey);
        address maker = vm.addr(privateKey);

        Offer memory offer;
        offer.maker = maker;
        bytes32 root = HashLib.hashOffer(offer);

        Signature memory _sig = signature(root, privateKey, address(ecrecoverNotary), 0);

        vm.prank(maker);
        covenant.setIsAuthorized(address(ecrecoverNotary), true, maker);

        vm.prank(address(covenant));
        bytes32 result = ecrecoverNotary.isNotarized(offer, abi.encode(_sig, root, 0, new bytes32[](0)));
        assertEq(result, CALLBACK_SUCCESS);
    }

    function testIsNotarizedMakerSigns() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData = buildNotaryData(_root, lender);

        vm.prank(address(covenant));
        bytes32 result = ecrecoverNotary.isNotarized(offer, notaryData);
        assertEq(result, CALLBACK_SUCCESS);
    }

    function testIsNotarizedAuthorizedSigns() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);

        vm.prank(lender);

        covenant.setIsAuthorized(borrower, true, lender);
        bytes memory notaryData = buildNotaryData(_root, borrower);

        vm.prank(address(covenant));
        bytes32 result = ecrecoverNotary.isNotarized(offer, notaryData);
        assertEq(result, CALLBACK_SUCCESS);
    }

    function testIsNotarizedNotCovenant() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData = buildNotaryData(_root, lender);

        vm.expectRevert(IEcrecoverNotary.NotCovenant.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testIsNotarizedUnauthorizedSigner() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData = buildNotaryData(_root, borrower);

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.Unauthorized.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testIsNotarizedInvalidSignature() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData =
            abi.encode(Signature({v: 27, r: bytes32(uint256(1)), s: bytes32(uint256(2))}), _root, 0, new bytes32[](0));

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.Unauthorized.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testIsNotarizedWrongRoot() public {
        Offer memory offer = makeOffer(lender);
        bytes32 wrongRoot = keccak256("wrong");
        bytes memory notaryData = buildNotaryData(wrongRoot, lender);

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.InvalidProof.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testIsNotarizedWorksForUnorderedTree() public {
        Offer memory leftOffer = makeOffer(lender);
        Offer memory rightOffer = makeOffer(lender);
        rightOffer.expiry += 1;

        bytes32 leftHash = HashLib.hashOffer(leftOffer);
        bytes32 rightHash = HashLib.hashOffer(rightOffer);
        if (leftHash < rightHash) {
            (leftOffer, rightOffer) = (rightOffer, leftOffer);
            (leftHash, rightHash) = (rightHash, leftHash);
        }

        bytes32 root = HashLib.hashNode(leftHash, rightHash);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leftHash;
        Signature memory sig = signature(root, privateKey[lender], address(ecrecoverNotary), 1);
        bytes memory notaryData = abi.encode(sig, root, 1, proof);

        vm.prank(address(covenant));
        bytes32 result = ecrecoverNotary.isNotarized(rightOffer, notaryData);
        assertEq(result, CALLBACK_SUCCESS);
    }

    function testCancelRootMaker() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData = buildNotaryData(_root, lender);

        vm.expectEmit(true, true, false, true, address(ecrecoverNotary));
        emit IEcrecoverNotary.CancelRoot(lender, lender, _root);
        vm.prank(lender);
        ecrecoverNotary.cancelRoot(lender, _root);

        assertTrue(ecrecoverNotary.isRootCanceled(lender, _root));

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.RootCanceled.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testCancelRootAuthorizedOnBehalf() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);
        bytes memory notaryData = buildNotaryData(_root, lender);

        vm.prank(lender);
        covenant.setIsAuthorized(borrower, true, lender);

        vm.prank(borrower);
        ecrecoverNotary.cancelRoot(lender, _root);

        assertTrue(ecrecoverNotary.isRootCanceled(lender, _root));

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.RootCanceled.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }

    function testCancelRootUnauthorizedOnBehalf() public {
        bytes32 _root = keccak256("root");

        vm.prank(borrower);
        vm.expectRevert(IEcrecoverNotary.Unauthorized.selector);
        ecrecoverNotary.cancelRoot(lender, _root);
    }

    function testIsNotarizedRevokeAuthorizationInvalidates() public {
        Offer memory offer = makeOffer(lender);
        bytes32 _root = HashLib.hashOffer(offer);

        vm.prank(lender);

        covenant.setIsAuthorized(borrower, true, lender);
        bytes memory notaryData = buildNotaryData(_root, borrower);

        // Works while authorized.
        vm.prank(address(covenant));
        ecrecoverNotary.isNotarized(offer, notaryData);

        // Revoke.
        vm.prank(lender);
        covenant.setIsAuthorized(borrower, false, lender);

        vm.prank(address(covenant));
        vm.expectRevert(IEcrecoverNotary.Unauthorized.selector);
        ecrecoverNotary.isNotarized(offer, notaryData);
    }
}
