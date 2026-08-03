// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {BaseTest} from "./BaseTest.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {LLTV_0, LIQUIDATION_CURSOR_LOW, ORACLE_PRICE_SCALE, WAD} from "../src/libraries/ConstantsLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";

/// @dev PoC: post-maturity badDebt uses maxLif but seizure uses ramped lif (~WAD).
contract PostMaturityBadDebtDesyncTest is BaseTest {
    using UtilsLib for uint256;

    Market internal market;
    bytes32 internal id;

    function setUp() public override {
        super.setUp();
        market.loanToken = address(loanToken);
        market.maturity = vm.getBlockTimestamp() + 100 days;
        market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: LLTV_0,
                maxLif: maxLif(LLTV_0, LIQUIDATION_CURSOR_LOW),
                oracle: address(oracle1)
            })
        );
        id = covenant.initMarket(market);
        covenant.setMarketTickSpacing(id, 1);
        covenant.setMarketContinuousFee(id, 0);
    }

    function test_postMaturityBadDebtDesync_borrowerKeepsCollateral_lendersSlashed() public {
        uint256 units = 100e18;
        collateralize(market, borrower, units);
        setupMarket(market, units);

        // Price crash makes maxLif-implied bad debt positive while collateral units remain.
        oracle1.setPrice(ORACLE_PRICE_SCALE / 3);

        uint256 lenderCreditBefore = covenant.creditOf(id, lender);
        uint256 collateralBefore = covenant.collateral(id, borrower, 0);
        uint256 lossFactorBefore = covenant.lossFactor(id);

        vm.warp(market.maturity + 1);

        uint256 debtBefore = covenant.debtOf(id, borrower);
        uint256 maxLf = market.collateralParams[0].maxLif;
        uint256 price = oracle1.price();
        uint256 expectedBadDebt = debtBefore
            - collateralBefore.mulDivUp(price, ORACLE_PRICE_SCALE).mulDivUp(WAD, maxLf);

        // Step 1: realize optimistic bad debt at maxLif haircut (zero seizure).
        covenant.seize(market, 0, 0, 0, borrower, true, borrower, address(0), "");

        uint256 debtAfterBadDebt = covenant.debtOf(id, borrower);
        uint256 collateralAfterBadDebt = covenant.collateral(id, borrower, 0);
        assertEq(debtAfterBadDebt, debtBefore - expectedBadDebt, "debt reduced by bad debt");

        // Step 2: post-maturity repay remaining debt at lif ~= WAD.
        deal(address(loanToken), borrower, debtAfterBadDebt);
        vm.startPrank(borrower);
        loanToken.approve(address(covenant), debtAfterBadDebt);
        covenant.seize(market, 0, 0, debtAfterBadDebt, borrower, true, borrower, address(0), "");
        vm.stopPrank();

        assertGt(expectedBadDebt, 0, "precondition: maxLif implies bad debt");
        assertGt(covenant.lossFactor(id), lossFactorBefore, "lenders slashed via bad debt");
        covenant.updatePosition(market, lender);
        assertLt(covenant.creditOf(id, lender), lenderCreditBefore, "lender credit reduced after sync");
        assertEq(covenant.debtOf(id, borrower), 0, "borrower debt cleared");
        assertGt(covenant.collateral(id, borrower, 0), 0, "borrower kept residual collateral after par repayment");
        emit log_named_uint("socialized bad debt", expectedBadDebt);
        emit log_named_uint("borrower residual collateral", covenant.collateral(id, borrower, 0));
        emit log_named_uint("lender credit after slash", covenant.creditOf(id, lender));
    }
}
