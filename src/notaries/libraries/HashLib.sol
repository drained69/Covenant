// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity ^0.8.0;

import {Offer, Market, CollateralParams} from "../../interfaces/ICovenant.sol";

/// @dev keccak256("CollateralParams(address token,uint256 lltv,uint256 maxLif,address oracle)").
bytes32 constant COLLATERAL_PARAMS_TYPEHASH = 0xaf44a88eb50ebdbbebd980e5a23045c44f61ece5f80ab708a1bbe8718102e6af;
/// @dev keccak256(bytes.concat(MARKET_TYPE, COLLATERAL_PARAMS_TYPE)).
bytes32 constant MARKET_TYPEHASH = 0x4d629a25703924f44fdc6d27bc80b822f48f46c8093e48ee1d9f917b651ce5ab;
/// @dev keccak256(bytes.concat(OFFER_TYPE, COLLATERAL_PARAMS_TYPE, MARKET_TYPE)).
bytes32 constant OFFER_TYPEHASH = 0x511c15b0860ce049695d22079788e07bf20c7091820f0d8677a4a18886c0a9ef;

library HashLib {
    error LeafIndexOutOfRange();
    error TreeTooHigh();

    /// @dev Returns the EIP-712 typehash of OfferTree(Offer[2]...[2] offerTree) with height levels.
    /// @dev Same as keccak256(bytes.concat("OfferTree(Offer[2]...[2] offerTree)", COLLATERAL_PARAMS_TYPE,
    /// MARKET_TYPE, OFFER_TYPE)).
    /// @dev Reverts if height is greater than 20.
    function offerTreeTypeHash(uint256 height) internal pure returns (bytes32) {
        if (height <= 10) {
            if (height == 0) return 0x004ebce6c3f51313d367819aafcfc4361f4043e3251623924b694140a7a4ffa4;
            if (height == 1) return 0xdf2fba32386a22d9dae44cb85317cf3ef07d58afdb53b8517d53d8224791d3b8;
            if (height == 2) return 0xca1bdbe6e8aac865f964a2eaa6283882e180a0e1286092682f0847921045e0d9;
            if (height == 3) return 0x065ef9bab75d16d5cf17b0e33b97fd4f4231caf4263f6e616f6eabc432076c26;
            if (height == 4) return 0xd5ecb1a09257af2fe0525cbdf00ebb64e42beb69c3e85100188cae7b520db17d;
            if (height == 5) return 0x3168b5a3e2e326dcab9212aa4048edc9a64bace89391120076d3bf2d68676076;
            if (height == 6) return 0x012e37a7c7e16eb78925cb1d761dae4c74d060d40fddc43bb3af2b1a2add1257;
            if (height == 7) return 0xcf1e61a7be789a471af791c5094bd16d1be6bd71d7a31cf21c081760fc472f10;
            if (height == 8) return 0xf098e8e36a532d3854ade014f53051f2c287b0b6bc62e6166c74471f8d6f9765;
            if (height == 9) return 0x1a44d9522936fdc83c7dda7b375e429c7729273119e2029255ab443b6461c4fe;
            return 0x3db91bf7ce4fef4657a1bdc9dde84e1a8633bb5a85b8ae5c96ba1e504e085fe8;
        } else {
            if (height == 11) return 0xd81d6453dbb6e4c71ae6a11b1d8bfd4aafa785cb41b1d22a40e23f219ab16268;
            if (height == 12) return 0x5f963484dbf3d2ba694a61381dfca65cbd36b53d9754a9a7952c4775674fb7cf;
            if (height == 13) return 0x9d36cb2fbf2fc8e7b0499fb5ff23dfc59497dd3115123cd27da8f742de72aa7b;
            if (height == 14) return 0xbe85cb0c91e0cfec525eeab171412998905a27f6c3ecdf669a0817619967e43c;
            if (height == 15) return 0x22d2f5eacfb2996313a201676af0c78024d650448e59cc26dfe09b4b03adc179;
            if (height == 16) return 0xd88fed1c5d32a165f3e6b5a0319777f01924080c24d24ccfa07a2b9a3d96bead;
            if (height == 17) return 0xa88d9b1c7ab63b0b8f1f6054c7c49b58ea82cc176d18e576743f1419a42cfb61;
            if (height == 18) return 0xf866cd1ac32a9c22d02304e858fc37a32756fa1f4f48228df0c58322fff9b699;
            if (height == 19) return 0xda19dcadc2287f6c3dab3ebb0f98e7e873ae72b116f95f69510f1d6c6252bf47;
            if (height == 20) return 0xe3b14a7232ad8c1ed26698801089fd2aa5c59697f3121f556ee4d4f6784e32a1;
            revert TreeTooHigh();
        }
    }

    /// @dev Verifies a Merkle proof using the leaf index to determine the left/right position of each sibling.
    /// @dev Works for offer-tree heights up to 256, the bit-width of leafIndex. In practice the height is capped at 20
    /// by offerTreeTypeHash.
    function isLeaf(bytes32 root, bytes32 leafHash, uint256 leafIndex, bytes32[] memory proof)
        internal
        pure
        returns (bool)
    {
        require(leafIndex >> proof.length == 0, LeafIndexOutOfRange());
        bytes32 currentHash = leafHash;
        for (uint256 i = 0; i < proof.length; i++) {
            currentHash = (leafIndex >> i) & 1 == 0 ? hashNode(currentHash, proof[i]) : hashNode(proof[i], currentHash);
        }
        return currentHash == root;
    }

    /// @dev Returns the keccak256 hash of the concatenation of left and right.
    function hashNode(bytes32 left, bytes32 right) internal pure returns (bytes32 value) {
        assembly ("memory-safe") {
            mstore(0x00, left)
            mstore(0x20, right)
            value := keccak256(0x00, 0x40)
        }
    }

    /// @dev Computes the EIP-712 hash struct of a CollateralParams.
    function hashCollateralParams(CollateralParams memory collateralParams) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                COLLATERAL_PARAMS_TYPEHASH,
                collateralParams.token,
                collateralParams.lltv,
                collateralParams.maxLif,
                collateralParams.oracle
            )
        );
    }

    /// @dev Computes the EIP-712 hash struct of a Market.
    function hashMarket(Market memory market) internal pure returns (bytes32) {
        bytes32[] memory collateralParamsHashes = new bytes32[](market.collateralParams.length);
        for (uint256 i = 0; i < market.collateralParams.length; i++) {
            collateralParamsHashes[i] = hashCollateralParams(market.collateralParams[i]);
        }

        bytes32 collateralParamsHash;
        // same as keccak256(abi.encodePacked(collateralParamsHashes));
        assembly ("memory-safe") {
            collateralParamsHash := keccak256(
                add(collateralParamsHashes, 0x20),
                mul(mload(collateralParamsHashes), 0x20)
            )
        }

        return keccak256(
            abi.encode(
                MARKET_TYPEHASH,
                market.loanToken,
                collateralParamsHash,
                market.maturity,
                market.rcfThreshold,
                market.entryGate,
                market.seizureGate
            )
        );
    }

    /// @dev Computes the EIP-712 hash struct of an Offer.
    function hashOffer(Offer memory offer) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                OFFER_TYPEHASH,
                hashMarket(offer.market),
                offer.buy,
                offer.maker,
                offer.start,
                offer.expiry,
                offer.tick,
                offer.group,
                offer.callback,
                keccak256(offer.callbackData),
                offer.receiverIfMakerIsSeller,
                offer.notary,
                offer.reduceOnly,
                offer.maxUnits,
                offer.maxAssets
            )
        );
    }
}
