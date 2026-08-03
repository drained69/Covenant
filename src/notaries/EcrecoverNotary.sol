// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IEcrecoverNotary, Signature, EIP712_DOMAIN_TYPEHASH} from "./interfaces/IEcrecoverNotary.sol";
import {ICovenant, Offer} from "../interfaces/ICovenant.sol";
import {CALLBACK_SUCCESS} from "../libraries/ConstantsLib.sol";
import {HashLib} from "./libraries/HashLib.sol";

/// @dev If block.chainid changes (hard fork), the EIP-712 domain separator changes and previously signed offers are
/// no longer valid.
/// @dev This notary checks that the offer has been signed by an authorized address in a Merkle tree of offers.
/// To that end, it expects the notary data to contain the signature, the root of the tree, the leaf index of the
/// offer, and the proof of the offer in the tree.
/// @dev The root should correspond to the root of the offer tree, which is a Merkle tree of offers.
/// @dev The leaf index determines each sibling's left/right position.
/// @dev Hashing offers as in EIP-712, which allows clear signing of the tree, credits to Seaport for this mechanism.
contract EcrecoverNotary is IEcrecoverNotary {
    address public immutable COVENANT;

    mapping(address maker => mapping(bytes32 root => bool)) public isRootCanceled;

    constructor(address _covenant) {
        COVENANT = _covenant;
    }

    function cancelRoot(address maker, bytes32 root) external {
        require(maker == msg.sender || ICovenant(COVENANT).isAuthorized(maker, msg.sender), Unauthorized());
        isRootCanceled[maker][root] = true;
        emit CancelRoot(msg.sender, maker, root);
    }

    function isNotarized(Offer memory offer, bytes memory notaryData) external view returns (bytes32) {
        require(msg.sender == COVENANT, NotCovenant());
        (Signature memory sig, bytes32 root, uint256 leafIndex, bytes32[] memory proof) =
            abi.decode(notaryData, (Signature, bytes32, uint256, bytes32[]));
        require(HashLib.isLeaf(root, HashLib.hashOffer(offer), leafIndex, proof), InvalidProof());
        require(!isRootCanceled[offer.maker][root], RootCanceled());
        bytes32 structHash = keccak256(abi.encode(HashLib.offerTreeTypeHash(proof.length), root));
        bytes32 domainSeparator = keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, block.chainid, address(this)));
        bytes32 digest = keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));
        address _signer = ecrecover(digest, sig.v, sig.r, sig.s);
        require(_signer != address(0), InvalidSignature());
        require(_signer == offer.maker || ICovenant(COVENANT).isAuthorized(offer.maker, _signer), Unauthorized());
        return CALLBACK_SUCCESS;
    }
}
