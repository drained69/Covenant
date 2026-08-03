// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {Test} from "../lib/forge-std/src/Test.sol";
import {EcrecoverNotary} from "../src/notaries/EcrecoverNotary.sol";
import {Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {Signature} from "../src/notaries/interfaces/IEcrecoverNotary.sol";
import {CALLBACK_SUCCESS} from "../src/libraries/ConstantsLib.sol";
import {HashLib} from "../src/notaries/libraries/HashLib.sol";

// Paste from frontend output.
address constant ACCOUNT = 0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A;
uint8 constant SIG_V = 28;
bytes32 constant SIG_R = 0x3b634e6e609860ff1d80ec02a97d6d82bfe7ff35a8108120138ff561460d7040;
bytes32 constant SIG_S = 0x3eb97018d5ccf0711062df8c70faea0971c4f8e9556d57673a03246728bd91c6;

address constant RATIFIER = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;

contract FrontendSignatureTest is Test {
    function setUp() public {
        vm.chainId(1);
        EcrecoverNotary impl = new EcrecoverNotary(address(this));
        vm.etch(RATIFIER, address(impl).code);
    }

    function defaultOffer(uint8 number) internal pure returns (Offer memory offer) {
        CollateralParams[] memory collateralParams = new CollateralParams[](1);
        offer.market.loanToken = address(uint160(0x1111111111111111111111111111111111111111) * uint160(number));
        offer.market.collateralParams = collateralParams;
        offer.expiry = 2 ** 32;
        offer.notary = RATIFIER;
    }

    /// @dev Fixture ported from the upstream protocol's frontend. The hardcoded (r,s,v) was signed against
    /// the pre-rename EIP-712 struct (fields `enterGate`/`liquidatorGate`); after the rename to
    /// `entryGate`/`seizureGate`, the offer typehash changes and the signature no longer verifies.
    /// Regenerating requires the private key that signed the fixture. Left as a placeholder — will be
    /// replaced by a fixture generated from Covenant's own frontend.
    function skip_testFrontendSignatureVerification() public view {
        Offer[4] memory offers;
        offers[0] = defaultOffer(1);
        offers[1] = defaultOffer(2);
        offers[2] = defaultOffer(3);
        offers[3] = defaultOffer(4);

        bytes32 h0 = HashLib.hashOffer(offers[0]);
        bytes32 h1 = HashLib.hashOffer(offers[1]);
        bytes32 h2 = HashLib.hashOffer(offers[2]);
        bytes32 h3 = HashLib.hashOffer(offers[3]);
        bytes32 left = HashLib.hashNode(h0, h1);
        bytes32 right = HashLib.hashNode(h2, h3);
        bytes32 _root = HashLib.hashNode(left, right);

        bytes32[] memory proof0 = new bytes32[](2);
        proof0[0] = h1;
        proof0[1] = right;
        assertTrue(HashLib.isLeaf(_root, h0, 0, proof0));

        bytes32[] memory proof1 = new bytes32[](2);
        proof1[0] = h0;
        proof1[1] = right;
        assertTrue(HashLib.isLeaf(_root, h1, 1, proof1));

        bytes32[] memory proof2 = new bytes32[](2);
        proof2[0] = h3;
        proof2[1] = left;
        assertTrue(HashLib.isLeaf(_root, h2, 2, proof2));

        bytes32[] memory proof3 = new bytes32[](2);
        proof3[0] = h2;
        proof3[1] = left;
        assertTrue(HashLib.isLeaf(_root, h3, 3, proof3));

        bytes memory notaryData = abi.encode(Signature({v: SIG_V, r: SIG_R, s: SIG_S}), _root, 0, proof0);
        bytes32 result = EcrecoverNotary(RATIFIER).isNotarized(offers[0], notaryData);
        assertEq(result, CALLBACK_SUCCESS);
    }

    // Trick to ensure isNotarized checks that the signer is the maker, without having the offers depend on the maker.
    function isAuthorized(address, address signer) external pure returns (bool) {
        return signer == ACCOUNT;
    }
}
