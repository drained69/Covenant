// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {MAX_CONTINUOUS_FEE, ORACLE_PRICE_SCALE, WAD} from "../src/libraries/ConstantsLib.sol";
import {MAX_TICK} from "../src/libraries/TickLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";
import {BaseTest} from "./BaseTest.sol";

/// @dev Protocol flow: fillOffer a borrow offer with settlement + continuous fees, repay after a short
///      period, lender redeems full remaining credit.
/// Run: `forge test --match-contract ProtocolFlowTest -vv`
contract ProtocolFlowTest is BaseTest {
    using UtilsLib for uint256;

    Market internal market;
    bytes32 internal id;

    uint256 internal constant UNITS = 150e18;
    uint256 internal constant SHORT_PERIOD = 7 days;

    function setUp() public override {
        super.setUp();

        covenant.setDefaultContinuousFee(address(loanToken), MAX_CONTINUOUS_FEE);
        for (uint256 i; i < 7; i++) {
            covenant.setDefaultSettlementFee(address(loanToken), i, maxSettlementFee(i));
        }

        market.loanToken = address(loanToken);
        market.maturity = vm.getBlockTimestamp() + 365 days;
        market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.77e18,
                maxLif: maxLif(0.77e18, 0.25e18),
                oracle: address(oracle1)
            })
        );
        market.rcfThreshold = 0;

        id = covenant.initMarket(market);
        covenant.setMarketTickSpacing(id, 1);
    }

    function test_LIFBadDebtSocializedToLenders() public {
        uint256 ttm = market.maturity - block.timestamp;

        collateralize(market, borrower, UNITS);

        uint256 buyerAssets = _buyerAssets(UNITS);
        deal(address(loanToken), lender, buyerAssets);
        fillOffer(UNITS, lender, _borrowOffer(UNITS));

        uint256 settlementFeeOnTake = buyerAssets - UNITS;
        uint256 pendingFeeAtOpen = covenant.pendingFee(id, lender);

        assertEq(covenant.debtOf(id, borrower), UNITS, "borrower debt");
        assertEq(covenant.creditOf(id, lender), UNITS, "lender credit");
        assertGt(settlementFeeOnTake, 0, "settlement fee on fillOffer");
        assertEq(covenant.claimableSettlementFee(address(loanToken)), settlementFeeOnTake, "settlement fee accrued");
        assertGt(pendingFeeAtOpen, 0, "continuous fee reserved at open");
        assertEq(covenant.continuousFee(id), MAX_CONTINUOUS_FEE, "continuous fee rate");

        vm.warp(block.timestamp + SHORT_PERIOD);

        uint256 expectedContinuousFee = pendingFeeAtOpen.mulDivDown(SHORT_PERIOD, ttm);
        covenant.updatePosition(market, lender);

        uint256 creditAfterAccrual = covenant.creditOf(id, lender);
        assertApproxEqAbs(creditAfterAccrual, UNITS - expectedContinuousFee, 1, "credit after continuous fee");
        assertGt(covenant.continuousFeeCredit(id), 0, "continuous fee credited to market");

        uint256 debt = covenant.debtOf(id, borrower);
        deal(address(loanToken), borrower, debt);
        vm.prank(borrower);
        covenant.repay(market, debt, borrower, address(0), hex"");

        assertEq(covenant.debtOf(id, borrower), 0, "borrower debt cleared");
        assertEq(covenant.withdrawable(id), debt, "repay funded withdrawable");
        assertGe(covenant.withdrawable(id), creditAfterAccrual, "withdrawable covers lender credit");

        vm.prank(lender);
        covenant.withdraw(market, creditAfterAccrual, lender, lender);

        assertEq(covenant.creditOf(id, lender), 0, "lender credit redeemed");
        assertEq(covenant.pendingFee(id, lender), 0, "lender pending fee cleared");
        assertEq(loanToken.balanceOf(lender), creditAfterAccrual, "lender received full remaining credit");
    }

    function _buyerAssets(uint256 units) internal view returns (uint256) {
        uint256 ttm = market.maturity - block.timestamp;
        uint256 settlementFee = covenant.settlementFee(id, ttm);
        return units.mulDivUp(WAD + settlementFee, WAD);
    }

    function _borrowOffer(uint256 maxUnits) internal view returns (Offer memory offer) {
        offer.market = market;
        offer.buy = false;
        offer.maker = borrower;
        offer.receiverIfMakerIsSeller = borrower;
        offer.maxUnits = maxUnits;
        offer.group = keccak256("protocol-flow");
        offer.notary = address(dummyNotary);
        offer.start = block.timestamp;
        offer.expiry = block.timestamp + 7 days;
        offer.tick = MAX_TICK;
    }
}
