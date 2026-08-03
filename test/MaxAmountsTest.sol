// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {ORACLE_PRICE_SCALE} from "../src/libraries/ConstantsLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";
import {MAX_TICK} from "../src/libraries/TickLib.sol";
import {BaseTest} from "./BaseTest.sol";

uint256 constant MAX_AMOUNT = type(uint128).max;

contract MaxAmountsTest is BaseTest {
    using UtilsLib for uint256;

    Market internal market;
    bytes32 internal id;

    function setUp() public override {
        super.setUp();

        market.loanToken = address(loanToken);
        market.maturity = vm.getBlockTimestamp() + 100;
        market.collateralParams
            .push(
                CollateralParams({
                    token: address(collateralToken1),
                    lltv: 0.77e18,
                    maxLif: maxLif(0.77e18, 0.25e18),
                    oracle: address(oracle1)
                })
            );
        market.rcfThreshold = 0;

        id = toId(market);

        vm.prank(borrower);

        covenant.setIsAuthorized(address(this), true, borrower);
    }

    function testMaxAmountIsUint128Max() public pure {
        assertEq(MAX_AMOUNT, type(uint128).max);
    }

    function testTakeMaxAmount() public {
        uint256 amount = MAX_AMOUNT;

        deal(address(loanToken), lender, amount);

        vm.prank(borrower);

        covenant.setIsAuthorized(address(this), true, borrower);

        // Set a very high oracle price so a small collateral amount is sufficient.
        // With price = ORACLE_PRICE_SCALE * 1e36, 1 collateral token = 1e36 loan tokens.
        // maxDebt = collateral * 1e36 * 0.75, so ~454 tokens covers MAX_AMOUNT.
        oracle1.setPrice(ORACLE_PRICE_SCALE * 1e36);
        uint256 collateralAmount = 1000;
        deal(address(collateralToken1), address(this), collateralAmount);

        covenant.supplyCollateral(market, 0, collateralAmount, borrower);

        Offer memory borrowerOffer;
        borrowerOffer.market = market;
        borrowerOffer.buy = false;
        borrowerOffer.maker = borrower;
        borrowerOffer.receiverIfMakerIsSeller = borrower;
        borrowerOffer.maxUnits = type(uint256).max;
        borrowerOffer.expiry = vm.getBlockTimestamp() + 200;
        borrowerOffer.notary = address(dummyNotary);
        borrowerOffer.tick = MAX_TICK;

        fillOffer(amount, lender, borrowerOffer);

        assertEq(covenant.totalUnits(id), amount, "total units at max");
        assertEq(covenant.debtOf(id, borrower), amount, "debt at max");
    }

    function testTakeAboveMaxAmountReverts() public {
        uint256 amount = uint256(MAX_AMOUNT) + 1;

        deal(address(loanToken), lender, amount);

        oracle1.setPrice(ORACLE_PRICE_SCALE * 1e36);
        uint256 collateralAmount = 1000;
        deal(address(collateralToken1), address(this), collateralAmount);

        covenant.supplyCollateral(market, 0, collateralAmount, borrower);

        Offer memory borrowerOffer;
        borrowerOffer.market = market;
        borrowerOffer.buy = false;
        borrowerOffer.maker = borrower;
        borrowerOffer.receiverIfMakerIsSeller = borrower;
        borrowerOffer.maxUnits = type(uint256).max;
        borrowerOffer.expiry = vm.getBlockTimestamp() + 200;
        borrowerOffer.notary = address(dummyNotary);
        borrowerOffer.tick = MAX_TICK;

        vm.expectRevert(UtilsLib.CastOverflow.selector);
        fillOffer(amount, lender, borrowerOffer);
    }

    function testSupplyCollateralMaxAmount() public {
        uint256 amount = MAX_AMOUNT;

        deal(address(collateralToken1), address(this), amount);

        vm.prank(borrower);

        covenant.setIsAuthorized(address(this), true, borrower);

        covenant.supplyCollateral(market, 0, amount, borrower);

        assertEq(covenant.collateral(id, borrower, 0), amount, "collateral at max");
    }

    function testSupplyCollateralAboveMaxAmountReverts() public {
        uint256 amount = uint256(MAX_AMOUNT) + 1;

        deal(address(collateralToken1), address(this), amount);

        vm.prank(borrower);

        covenant.setIsAuthorized(address(this), true, borrower);

        vm.expectRevert(UtilsLib.CastOverflow.selector);
        covenant.supplyCollateral(market, 0, amount, borrower);
    }
}
