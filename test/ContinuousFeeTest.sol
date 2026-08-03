// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {WAD, MAX_CONTINUOUS_FEE} from "../src/libraries/ConstantsLib.sol";
import {EventsLib} from "../src/libraries/EventsLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";
import {TickLib, MAX_TICK} from "../src/libraries/TickLib.sol";
import {ICovenant, Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {BaseTest, MAX_TEST_AMOUNT} from "./BaseTest.sol";

uint256 constant MAX_CREDIT = MAX_TEST_AMOUNT / 4;

contract ContinuousFeeTest is BaseTest {
    using UtilsLib for uint256;

    Market internal market;
    bytes32 internal id;
    address internal feeClaimer = makeAddr("feeClaimer");

    function setUp() public override {
        super.setUp();
        vm.warp(vm.getBlockTimestamp() + 1000 days);

        market.loanToken = address(loanToken);
        market.maturity = vm.getBlockTimestamp() + 100 days;
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
        covenant.setFeeClaimer(feeClaimer);

        vm.prank(borrower);
        covenant.setIsAuthorized(address(this), true, borrower);
        vm.prank(otherBorrower);
        covenant.setIsAuthorized(address(this), true, otherBorrower);
    }

    /// @dev Sets up a lend + borrow position. After: lender.pendingFee = credit * feeRate * ttm / WAD,
    /// borrower.pendingFee = 0.
    function setupLender(uint256 credit, uint256 feeRate, uint256 ttm) internal {
        market.maturity = vm.getBlockTimestamp() + ttm;
        id = toId(market);
        covenant.setDefaultContinuousFee(address(loanToken), feeRate);
        collateralize(market, borrower, credit * 2);
        setupMarket(market, credit);
    }

    function _makeBuyOffer(uint256 units, bytes32 group) internal view returns (Offer memory o) {
        o.market = market;
        o.buy = true;
        o.maker = otherLender;
        o.maxUnits = units;
        o.notary = address(dummyNotary);
        o.expiry = vm.getBlockTimestamp();
        o.tick = MAX_TICK;
        o.group = group;
    }

    function testAccrualPreMaturity(uint256 credit, uint256 feeRate, uint256 ttm, uint256 elapsed) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 0, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        setupLender(credit, feeRate, ttm);
        uint256 remaining = covenant.pendingFee(id, lender);
        assertEq(covenant.lastAccrual(id, lender), vm.getBlockTimestamp(), "lender lastAccrual after fillOffer");

        vm.warp(vm.getBlockTimestamp() + elapsed);
        uint256 expectedFee = remaining.mulDivDown(elapsed, ttm);

        // Via withdraw(0)
        uint256 snap = vm.snapshotState();
        vm.expectEmit();
        emit EventsLib.UpdatePosition(id, lender, expectedFee, expectedFee, expectedFee);
        vm.expectEmit();
        emit EventsLib.Withdraw(lender, id, 0, lender, lender, 0);
        vm.prank(lender);
        covenant.withdraw(market, 0, lender, lender);
        assertEq(covenant.creditOf(id, lender), credit - expectedFee, "credit after withdraw");
        assertEq(covenant.pendingFee(id, lender), remaining - expectedFee, "remaining after withdraw");
        vm.revertToState(snap);

        // Via direct call
        vm.expectEmit();
        emit EventsLib.UpdatePosition(id, lender, expectedFee, expectedFee, expectedFee);
        covenant.updatePosition(market, lender);
        assertEq(covenant.creditOf(id, lender), credit - expectedFee, "credit after direct call");
        assertEq(covenant.pendingFee(id, lender), remaining - expectedFee, "remaining after direct call");
        assertEq(covenant.lastAccrual(id, lender), vm.getBlockTimestamp(), "lender lastAccrual after update");

        // Fee accumulated in continuousFeeCredit
        if (expectedFee > 0) {
            assertEq(covenant.continuousFeeCredit(id), expectedFee, "continuousFeeCredit");
        }
    }

    function testAccrualPostMaturity(uint256 credit, uint256 feeRate, uint256 ttm, uint256 extraTime) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 1, 360 days);
        extraTime = bound(extraTime, 0, 360 days);

        setupLender(credit, feeRate, ttm);
        uint256 remaining = covenant.pendingFee(id, lender);
        vm.assume(remaining > 0);

        vm.warp(market.maturity + extraTime);

        // Via withdraw(0)
        uint256 snap = vm.snapshotState();
        vm.expectEmit();
        emit EventsLib.UpdatePosition(id, lender, remaining, remaining, remaining);
        vm.expectEmit();
        emit EventsLib.Withdraw(lender, id, 0, lender, lender, 0);
        vm.prank(lender);
        covenant.withdraw(market, 0, lender, lender);
        assertEq(covenant.creditOf(id, lender), credit - remaining, "all remaining consumed (withdraw)");
        assertEq(covenant.pendingFee(id, lender), 0, "remaining is zero (withdraw)");
        vm.revertToState(snap);

        // Via direct call
        vm.expectEmit();
        emit EventsLib.UpdatePosition(id, lender, remaining, remaining, remaining);
        covenant.updatePosition(market, lender);
        assertEq(covenant.creditOf(id, lender), credit - remaining, "all remaining consumed (direct)");
        assertEq(covenant.pendingFee(id, lender), 0, "remaining is zero (direct)");
    }

    function testMultipleAccrualsSumCorrectly(
        uint256 credit,
        uint256 feeRate,
        uint256 ttm,
        uint256 elapsed1,
        uint256 elapsed2
    ) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 4, 360 days);
        elapsed1 = bound(elapsed1, 1, ttm / 2);
        elapsed2 = bound(elapsed2, 1, ttm / 2);

        setupLender(credit, feeRate, ttm);
        uint256 remaining = covenant.pendingFee(id, lender);
        vm.assume(remaining > 0);

        // Two separate accruals
        uint256 snap = vm.snapshotState();
        vm.warp(vm.getBlockTimestamp() + elapsed1);
        covenant.updatePosition(market, lender);
        vm.warp(vm.getBlockTimestamp() + elapsed2);
        covenant.updatePosition(market, lender);
        uint256 creditTwoAccruals = covenant.creditOf(id, lender);
        vm.revertToState(snap);

        // Single accrual for same total elapsed
        vm.warp(vm.getBlockTimestamp() + elapsed1 + elapsed2);
        covenant.updatePosition(market, lender);
        uint256 creditOneAccrual = covenant.creditOf(id, lender);

        assertApproxEqAbs(creditTwoAccruals, creditOneAccrual, 2, "two accruals ~ one accrual");
    }

    function testSingleLend(uint256 credit, uint256 feeRate, uint256 ttm) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 0, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 1, 360 days);

        setupLender(credit, feeRate, ttm);

        uint256 expectedRemaining = (uint256(feeRate) * credit).mulDivDown(ttm, WAD);
        assertEq(covenant.pendingFee(id, lender), expectedRemaining, "lender remaining after entry");
        assertEq(covenant.pendingFee(id, borrower), 0, "borrower has no pending fee");
        assertEq(covenant.debtOf(id, borrower), credit, "debt unchanged at entry");
    }

    function _makeBorrowOffer(uint256 credit2) internal view returns (Offer memory borrowOffer) {
        borrowOffer.market = market;
        borrowOffer.buy = false;
        borrowOffer.maker = otherBorrower;
        borrowOffer.receiverIfMakerIsSeller = otherBorrower;
        borrowOffer.maxUnits = credit2;
        borrowOffer.notary = address(dummyNotary);
        borrowOffer.start = vm.getBlockTimestamp();
        borrowOffer.expiry = vm.getBlockTimestamp();
        borrowOffer.tick = MAX_TICK;
    }

    function testTwoLendersDifferentRates(
        uint256 credit1,
        uint256 credit2,
        uint256 rate1,
        uint256 rate2,
        uint256 ttm,
        uint256 elapsed
    ) public {
        credit1 = bound(credit1, 1e18, MAX_CREDIT / 2);
        credit2 = bound(credit2, 1, MAX_CREDIT / 2);
        rate1 = bound(rate1, 0, MAX_CONTINUOUS_FEE);
        rate2 = bound(rate2, 0, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        // First lend at rate1
        market.maturity = vm.getBlockTimestamp() + ttm;
        id = toId(market);
        covenant.setDefaultContinuousFee(address(loanToken), rate1);
        collateralize(market, borrower, (credit1 + credit2) * 2);
        setupMarket(market, credit1);
        uint256 remaining1 = covenant.pendingFee(id, lender);

        // Change rate, lender adds more credit at rate2
        covenant.setMarketContinuousFee(id, rate2);
        collateralize(market, otherBorrower, credit2 * 2);
        deal(address(loanToken), lender, credit2);
        fillOffer(credit2, lender, _makeBorrowOffer(credit2));

        uint256 blendedRemaining = covenant.pendingFee(id, lender);
        uint256 expectedAdded = (uint256(rate2) * credit2).mulDivDown(ttm, WAD);
        assertApproxEqAbs(blendedRemaining, remaining1 + expectedAdded, 1, "remaining blended");

        // Accrue
        vm.warp(vm.getBlockTimestamp() + elapsed);
        covenant.updatePosition(market, lender);

        uint256 expectedFee = blendedRemaining.mulDivDown(elapsed, ttm);
        assertApproxEqAbs(covenant.creditOf(id, lender), credit1 + credit2 - expectedFee, 1, "credit after accrual");
        assertApproxEqAbs(covenant.pendingFee(id, lender), blendedRemaining - expectedFee, 1, "remaining after accrual");
    }

    function testExitViaLenderTake(uint256 credit, uint256 exitAmount, uint256 feeRate, uint256 ttm, uint256 elapsed)
        public
    {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 0, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 0, ttm - 1);

        setupLender(credit, feeRate, ttm);

        vm.warp(vm.getBlockTimestamp() + elapsed);

        // Compute state after accrual
        uint256 remaining = covenant.pendingFee(id, lender);
        uint256 feeUnits = remaining.mulDivDown(elapsed, ttm);
        uint256 creditAfterAccrual = credit - feeUnits;
        uint256 remainingAfterAccrual = remaining - feeUnits;

        exitAmount = bound(exitAmount, 0, creditAfterAccrual);

        // Lender exits via fillOffer (lender is seller, otherLender is buyer)
        deal(address(loanToken), otherLender, exitAmount);

        uint256 price = TickLib.tickToPrice(MAX_TICK);
        uint256 takeAssets = exitAmount.mulDivDown(price, WAD);
        uint256 buyerPendingFeeIncrease = exitAmount.mulDivDown(feeRate * (ttm - elapsed), WAD);
        uint256 sellerPendingFeeDecrease =
            creditAfterAccrual > 0 ? remainingAfterAccrual.mulDivUp(exitAmount, creditAfterAccrual) : 0;

        if (exitAmount > 0) {
            vm.expectEmit();
            emit EventsLib.UpdatePosition(id, otherLender, 0, 0, 0);
        }
        vm.expectEmit();
        emit EventsLib.UpdatePosition(
            id, lender, credit - creditAfterAccrual, remaining - remainingAfterAccrual, feeUnits
        );
        vm.expectEmit();
        emit EventsLib.Take(
            lender,
            id,
            exitAmount,
            lender,
            otherLender,
            true,
            keccak256("lender-exit"),
            takeAssets,
            takeAssets,
            exitAmount,
            buyerPendingFeeIncrease,
            sellerPendingFeeDecrease,
            exitAmount,
            exitAmount,
            lender,
            otherLender
        );
        fillOffer(exitAmount, lender, _makeBuyOffer(exitAmount, keccak256("lender-exit"))); // lender is taker = seller

        uint256 expectedRemaining = creditAfterAccrual > 0 ? remainingAfterAccrual - sellerPendingFeeDecrease : 0;
        assertEq(covenant.creditOf(id, lender), creditAfterAccrual - exitAmount, "credit after exit");
        assertApproxEqAbs(covenant.pendingFee(id, lender), expectedRemaining, 1, "remaining after exit");

        if (exitAmount == creditAfterAccrual) {
            assertEq(covenant.pendingFee(id, lender), 0, "full exit zeroes remaining");
        }

        assertEq(covenant.pendingFee(id, otherLender), buyerPendingFeeIncrease, "buyer pendingFee after exit");
        assertEq(covenant.creditOf(id, otherLender), exitAmount, "buyer credit after exit");
    }

    function testWithdrawReducesPendingFee(
        uint256 credit,
        uint256 withdrawAmount,
        uint256 feeRate,
        uint256 ttm,
        uint256 elapsed
    ) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 0, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 0, ttm - 1);

        setupLender(credit, feeRate, ttm);

        vm.warp(vm.getBlockTimestamp() + elapsed);

        uint256 remaining = covenant.pendingFee(id, lender);
        uint256 feeUnits = remaining.mulDivDown(elapsed, ttm);
        uint256 creditAfterAccrual = credit - feeUnits;
        uint256 remainingAfterAccrual = remaining - feeUnits;

        withdrawAmount = bound(withdrawAmount, 0, creditAfterAccrual);

        deal(address(loanToken), borrower, credit);
        vm.prank(borrower);
        covenant.repay(market, credit, borrower, address(0), hex"");

        uint256 pendingFeeDecrease =
            creditAfterAccrual > 0 ? remainingAfterAccrual.mulDivUp(withdrawAmount, creditAfterAccrual) : 0;

        vm.expectEmit();
        emit EventsLib.UpdatePosition(
            id, lender, credit - creditAfterAccrual, remaining - remainingAfterAccrual, feeUnits
        );
        vm.expectEmit();
        emit EventsLib.Withdraw(lender, id, withdrawAmount, lender, lender, pendingFeeDecrease);
        vm.prank(lender);
        covenant.withdraw(market, withdrawAmount, lender, lender);

        uint256 expectedRemaining = creditAfterAccrual > 0 ? remainingAfterAccrual - pendingFeeDecrease : 0;

        assertEq(covenant.creditOf(id, lender), creditAfterAccrual - withdrawAmount, "credit after withdraw");
        assertApproxEqAbs(covenant.pendingFee(id, lender), expectedRemaining, 1, "remaining after withdraw");

        if (withdrawAmount == creditAfterAccrual) {
            assertEq(covenant.pendingFee(id, lender), 0, "full withdraw zeroes remaining");
            covenant.updatePosition(market, lender);
            assertEq(covenant.pendingFee(id, lender), 0, "full withdraw stays at zero");
        }
    }

    function testAccrualAfterSlashReducesPendingFee(
        uint256 credit,
        uint256 feeRate,
        uint256 ttm,
        uint256 elapsed1,
        uint256 elapsed2
    ) public {
        credit = bound(credit, 100, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 10, 360 days);
        elapsed1 = bound(elapsed1, 1, ttm - 2);
        elapsed2 = bound(elapsed2, 1, ttm - elapsed1 - 1);

        setupLender(credit, feeRate, ttm);

        // Phase 1: accrue fees on original credit before the slash.
        vm.warp(vm.getBlockTimestamp() + elapsed1);
        covenant.updatePosition(market, lender);

        uint256 creditBeforeSlash = covenant.creditOf(id, lender);

        // Slash.
        createBadDebt(market);
        covenant.updatePosition(market, lender);

        uint256 creditAfterSlash = covenant.creditOf(id, lender);
        vm.assume(creditAfterSlash < creditBeforeSlash);

        uint256 pendingAfterSlash = covenant.pendingFee(id, lender);

        // Phase 2: accrue fees on slashed credit.
        vm.warp(vm.getBlockTimestamp() + elapsed2);
        uint256 accruedFee = pendingAfterSlash.mulDivDown(elapsed2, ttm - elapsed1);

        covenant.updatePosition(market, lender);

        assertEq(covenant.creditOf(id, lender), creditAfterSlash - accruedFee, "credit after slash and accrual");
        assertApproxEqAbs(
            covenant.pendingFee(id, lender), pendingAfterSlash - accruedFee, 1, "remaining after slash and accrual"
        );
    }

    function testClaimContinuousFee(uint256 credit, uint256 feeRate, uint256 ttm, uint256 elapsed, uint256 claimAmount)
        public
    {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        setupLender(credit, feeRate, ttm);

        vm.warp(vm.getBlockTimestamp() + elapsed);
        covenant.updatePosition(market, lender);

        uint256 feeAmount = covenant.continuousFeeCredit(id);
        vm.assume(feeAmount > 0);
        claimAmount = bound(claimAmount, 1, feeAmount);

        // Repay so withdrawable covers the claim.
        deal(address(loanToken), borrower, credit);
        vm.prank(borrower);
        covenant.repay(market, credit, borrower, address(0), hex"");

        address receiver = makeAddr("receiver");
        uint256 totalUnitsBefore = covenant.totalUnits(id);
        uint256 withdrawableBefore = covenant.withdrawable(id);

        vm.expectEmit();
        emit EventsLib.ClaimContinuousFee(feeClaimer, id, claimAmount, receiver);
        vm.prank(feeClaimer);
        covenant.claimContinuousFee(market, claimAmount, receiver);

        assertEq(loanToken.balanceOf(receiver), claimAmount, "receiver balance");
        assertEq(covenant.continuousFeeCredit(id), feeAmount - claimAmount, "continuousFeeCredit after claim");
        assertEq(covenant.totalUnits(id), totalUnitsBefore - claimAmount, "totalUnits after claim");
        assertEq(covenant.withdrawable(id), withdrawableBefore - claimAmount, "withdrawable after claim");
    }

    function testClaimContinuousFeeOnlyFeeClaimer(address caller) public {
        vm.assume(caller != feeClaimer);
        vm.prank(caller);
        vm.expectRevert(ICovenant.OnlyFeeClaimer.selector);
        covenant.claimContinuousFee(market, 0, caller);
    }

    function testClaimContinuousFeeExcessReverts(uint256 credit, uint256 feeRate, uint256 ttm, uint256 elapsed) public {
        credit = bound(credit, 1, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 2, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        setupLender(credit, feeRate, ttm);

        vm.warp(vm.getBlockTimestamp() + elapsed);
        covenant.updatePosition(market, lender);

        uint256 feeAmount = covenant.continuousFeeCredit(id);
        vm.assume(feeAmount > 0);

        vm.prank(feeClaimer);
        vm.expectRevert();
        covenant.claimContinuousFee(market, feeAmount + 1, feeClaimer);
    }

    function testUpdatePositionViewCorrect(
        uint256 credit,
        uint256 feeRate,
        uint256 ttm,
        uint256 elapsed,
        bool withBadDebt
    ) public {
        credit = bound(credit, 100, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 10, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        setupLender(credit, feeRate, ttm);

        if (withBadDebt) createBadDebt(market);

        vm.warp(vm.getBlockTimestamp() + elapsed);

        (uint128 newCredit, uint128 newPendingFee,) = covenant.updatePositionView(market, id, lender);

        covenant.updatePosition(market, lender);

        assertEq(covenant.creditOf(id, lender), newCredit, "view matches credit");
        assertEq(covenant.pendingFee(id, lender), newPendingFee, "view matches pendingFee");
    }

    function testUpdatePositionReturnsUpdatedValues(
        uint256 credit,
        uint256 feeRate,
        uint256 ttm,
        uint256 elapsed,
        bool withBadDebt
    ) public {
        credit = bound(credit, 100, MAX_CREDIT);
        feeRate = bound(feeRate, 1, MAX_CONTINUOUS_FEE);
        ttm = bound(ttm, 10, 360 days);
        elapsed = bound(elapsed, 1, ttm - 1);

        setupLender(credit, feeRate, ttm);

        if (withBadDebt) createBadDebt(market);

        vm.warp(vm.getBlockTimestamp() + elapsed);

        (uint128 expectedCredit, uint128 expectedPendingFee, uint128 expectedAccruedFee) =
            covenant.updatePositionView(market, id, lender);
        uint256 expectedContinuousFeeCredit = covenant.continuousFeeCredit(id) + expectedAccruedFee;

        (uint128 returnedCredit, uint128 returnedPendingFee, uint128 returnedAccruedFee) =
            covenant.updatePosition(market, lender);

        assertEq(returnedCredit, expectedCredit, "returned credit");
        assertEq(returnedPendingFee, expectedPendingFee, "returned pendingFee");
        assertEq(returnedAccruedFee, expectedAccruedFee, "returned accruedFee");
        assertEq(covenant.creditOf(id, lender), returnedCredit, "stored credit");
        assertEq(covenant.pendingFee(id, lender), returnedPendingFee, "stored pendingFee");
        assertEq(covenant.continuousFeeCredit(id), expectedContinuousFeeCredit, "continuousFeeCredit");
    }

    function testUpdatePositionRevertsIfMarketNotCreated() public {
        vm.expectRevert(ICovenant.MarketNotCreated.selector);
        covenant.updatePosition(market, borrower);
    }

    function testClaimContinuousFeeRevertsIfMarketNotCreated() public {
        vm.prank(feeClaimer);
        vm.expectRevert(ICovenant.MarketNotCreated.selector);
        covenant.claimContinuousFee(market, 0, feeClaimer);
    }

    function testLastAccrualZeroForFreshPosition() public {
        setupLender(1e18, 0, 100 days);
        assertEq(covenant.lastAccrual(id, makeAddr("nobody")), 0, "lastAccrual zero for fresh position");
    }
}
