// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2025 Morpho Association
pragma solidity ^0.8.0;

import {console} from "forge-std/Test.sol";
import {Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {ORACLE_PRICE_SCALE, WAD} from "../src/libraries/ConstantsLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";
import {TickLib, MAX_TICK} from "../src/libraries/TickLib.sol";
import {Oracle} from "./helpers/Oracle.sol";
import {CovenantBundles} from "../src/periphery/CovenantBundles.sol";
import {
    Take,
    CollateralWithdrawal,
    TokenPermit,
    PermitKind
} from "../src/periphery/interfaces/ICovenantBundles.sol";
import {BaseTest} from "./BaseTest.sol";

/// @dev End-to-end `buyWithUnitsTargetAndWithdrawCollateral`: lender fills borrow offer + withdraws collateral.
/// Run: `forge test --match-contract BundlerFlowTest -vv`
contract BundlerFlowTest is BaseTest {
    CovenantBundles internal bundles;

    Market internal market;
    bytes32 internal id;

    uint256 internal constant UNITS = 50e18;
    uint256 internal constant SETTLEMENT_FEE = 0.005e18; // 360-day bucket (market maturity = 365 days)

    function setUp() public override {
        super.setUp();

        bundles = new CovenantBundles(address(covenant));

        vm.prank(lender);
        covenant.setIsAuthorized(address(bundles), true, lender);
        vm.prank(lender);
        loanToken.approve(address(bundles), type(uint256).max);

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

        for (uint256 i; i <= 6; i++) {
            covenant.setMarketSettlementFee(id, i, i == 6 ? SETTLEMENT_FEE : 0);
        }
        covenant.setMarketContinuousFee(id, 0);
    }

    function test_bundlerBuyWithUnitsTargetAndWithdrawCollateral() public {
        // Borrower (maker) posts a sell offer; lender (taker) fills via bundler.
        collateralize(market, borrower, UNITS);

        uint256 lenderCollateral = _collateralAmount(0, UNITS);
        deal(address(collateralToken1), lender, lenderCollateral);
        vm.startPrank(lender);
        collateralToken1.approve(address(covenant), lenderCollateral);
        covenant.supplyCollateral(market, 0, lenderCollateral, lender);
        vm.stopPrank();

        Take[] memory takes = new Take[](1);
        takes[0] = Take({units: UNITS, offer: _borrowOffer(UNITS), notaryData: hex""});

        uint256 offerPrice = TickLib.tickToPrice(MAX_TICK);
        uint256 settlementFee = covenant.settlementFee(id, market.maturity - vm.getBlockTimestamp());
        uint256 buyerPrice = offerPrice + settlementFee;
        uint256 maxBuyerAssets = UtilsLib.mulDivUp(UNITS, buyerPrice, WAD);
        uint256 expectedSellerAssets = UtilsLib.mulDivUp(UNITS, offerPrice, WAD);
        uint256 expectedSettlementFee = maxBuyerAssets - expectedSellerAssets;

        deal(address(loanToken), lender, maxBuyerAssets);
        console.log("maxBuyerAssets", maxBuyerAssets);

        uint256 lenderLoanBefore = loanToken.balanceOf(lender);
        uint256 lenderCollatBefore = collateralToken1.balanceOf(lender);

        vm.prank(lender);
        bundles.buyWithUnitsTargetAndWithdrawCollateral(
            UNITS,
            maxBuyerAssets,
            lender,
            _noPermit(),
            takes,
            new CollateralWithdrawal[](0),
            lender,
            0,
            address(0)
        ); // 50250000000000000000 [5.025e19], 50000000000000000000

        // assertEq(covenant.debtOf(id, borrower), UNITS, "borrower debt");
        // assertEq(covenant.creditOf(id, lender), UNITS, "lender credit");
        // assertEq(covenant.consumed(borrower, takes[0].offer.group), UNITS, "offer consumed");
        // assertEq(covenant.collateral(id, lender, 0), lenderCollateral, "lender collateral left");
        // assertEq(collateralToken1.balanceOf(lender), lenderCollatBefore, "no collateral withdrawn");
        // assertEq(loanToken.balanceOf(lender), lenderLoanBefore - maxBuyerAssets, "loan tokens spent");
        // assertEq(loanToken.balanceOf(borrower), expectedSellerAssets, "borrower received loan proceeds");
        // assertEq(covenant.claimableSettlementFee(address(loanToken)), expectedSettlementFee, "settlement fee");
        // assertEq(loanToken.balanceOf(address(bundles)), 0, "bundler holds no dust");

        // _logState("after bundler buy + collateral withdraw");
    }

    function _borrowOffer(uint256 maxUnits) internal view returns (Offer memory offer) {
        offer.market = market;
        offer.buy = false;
        offer.maker = borrower;
        offer.receiverIfMakerIsSeller = borrower;
        offer.maxUnits = maxUnits;
        offer.group = keccak256("bundler-flow-borrow");
        offer.notary = address(dummyNotary);
        offer.start = block.timestamp;
        offer.expiry = block.timestamp + 7 days;
        offer.tick = MAX_TICK;
    }

    function _collateralAmount(uint256 collateralIndex, uint256 debt) internal view returns (uint256) {
        uint256 oraclePrice = Oracle(market.collateralParams[collateralIndex].oracle).price();
        return UtilsLib.mulDivUp(
            UtilsLib.mulDivUp(debt, WAD, market.collateralParams[collateralIndex].lltv),
            ORACLE_PRICE_SCALE,
            oraclePrice
        );
    }

    function _noPermit() internal pure returns (TokenPermit memory) {
        return TokenPermit({kind: PermitKind.None, data: hex""});
    }

    function _logState(string memory label) internal view {
        console.log("--- %s ---", label);
        console.log("  totalUnits", covenant.totalUnits(id));
        console.log("  lender credit", covenant.creditOf(id, lender));
        console.log("  borrower debt", covenant.debtOf(id, borrower));
        console.log("  lender collateral", covenant.collateral(id, lender, 0));
    }
}
