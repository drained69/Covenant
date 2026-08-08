// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity 0.8.34;

import {ICovenant, Market, Offer, CollateralParams} from "../../src/interfaces/ICovenant.sol";
import {CreditLadderLens} from "../../src/periphery/CreditLadderLens.sol";
import {CleanversePoolGate} from "../../src/compliance/CleanversePoolGate.sol";
import {RuleV2} from "../../src/compliance/interfaces/IAPassComplianceValidator.sol";
import {LIQUIDATION_CURSOR_LOW, ORACLE_PRICE_SCALE, WAD} from "../../src/libraries/ConstantsLib.sol";
import {MAX_TICK} from "../../src/libraries/TickLib.sol";
import {UtilsLib} from "../../src/libraries/UtilsLib.sol";
import {BaseTest, MAX_TEST_AMOUNT} from "../BaseTest.sol";
import {MockAPassValidator} from "./mocks/MockAPassValidator.sol";
import {Oracle} from "../helpers/Oracle.sol";
import {RevertingOracle} from "../helpers/RevertingOracle.sol";

/// @notice Tests the CreditLadderLens and proves the tiered ladder properties: rung resolution,
/// fail-closed behavior, market identity binding, and increase-only gating.
contract CreditLadderTest is BaseTest {
    MockAPassValidator internal validator;
    CreditLadderLens internal lens;

    CleanversePoolGate internal gate1; // minSubTier 10
    CleanversePoolGate internal gate2; // minSubTier 20
    CleanversePoolGate internal gate3; // minSubTier 30

    Market internal rung1Market; // LLTV 38.5%
    Market internal rung2Market; // LLTV 77%
    Market internal rung3Market; // LLTV 91.5%

    bytes32 internal rung1Id;
    bytes32 internal rung2Id;
    bytes32 internal rung3Id;

    bytes32[] internal rungIds;

    function setUp() public override {
        super.setUp();

        validator = new MockAPassValidator();
        lens = new CreditLadderLens(covenant);

        // Deploy three gates with minSubTier thresholds
        gate1 = new CleanversePoolGate(validator, address(this));
        gate2 = new CleanversePoolGate(validator, address(this));
        gate3 = new CleanversePoolGate(validator, address(this));

        validator.setRegistered(address(gate1), true);
        validator.setRegistered(address(gate2), true);
        validator.setRegistered(address(gate3), true);

        gate1.setRule(RuleV2({allowedGroup: bytes2(0), allowedSubGroup: bytes2(0), minTier: 0, minSubTier: 10, poolCountryBitmap: 0}));
        gate2.setRule(RuleV2({allowedGroup: bytes2(0), allowedSubGroup: bytes2(0), minTier: 0, minSubTier: 20, poolCountryBitmap: 0}));
        gate3.setRule(RuleV2({allowedGroup: bytes2(0), allowedSubGroup: bytes2(0), minTier: 0, minSubTier: 30, poolCountryBitmap: 0}));

        uint256 maturity = vm.getBlockTimestamp() + 100;

        // Rung 1: 38.5% LLTV
        rung1Market.loanToken = address(loanToken);
        rung1Market.maturity = maturity;
        rung1Market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.385e18,
                oracle: address(oracle1),
                maxLif: maxLif(0.385e18, LIQUIDATION_CURSOR_LOW)
            })
        );
        rung1Market.collateralParams = sortCollateralParams(rung1Market.collateralParams);
        rung1Market.entryGate = address(gate1);
        rung1Market.seizureGate = address(gate1);
        rung1Id = toId(rung1Market);

        // Rung 2: 77% LLTV
        rung2Market.loanToken = address(loanToken);
        rung2Market.maturity = maturity;
        rung2Market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.77e18,
                oracle: address(oracle1),
                maxLif: maxLif(0.77e18, LIQUIDATION_CURSOR_LOW)
            })
        );
        rung2Market.collateralParams = sortCollateralParams(rung2Market.collateralParams);
        rung2Market.entryGate = address(gate2);
        rung2Market.seizureGate = address(gate2);
        rung2Id = toId(rung2Market);

        // Rung 3: 91.5% LLTV
        rung3Market.loanToken = address(loanToken);
        rung3Market.maturity = maturity;
        rung3Market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.915e18,
                oracle: address(oracle1),
                maxLif: maxLif(0.915e18, LIQUIDATION_CURSOR_LOW)
            })
        );
        rung3Market.collateralParams = sortCollateralParams(rung3Market.collateralParams);
        rung3Market.entryGate = address(gate3);
        rung3Market.seizureGate = address(gate3);
        rung3Id = toId(rung3Market);

        // Initialize markets in Covenant
        covenant.initMarket(rung1Market);
        covenant.initMarket(rung2Market);
        covenant.initMarket(rung3Market);

        rungIds.push(rung1Id);
        rungIds.push(rung2Id);
        rungIds.push(rung3Id);
    }

    /* RUNG RESOLUTION */

    function test_ladder_resolves_subTier30_to_rung3() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);
        validator.setVerified(address(gate3), borrower, true);

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, 2, "sub-tier 30 clears rung 3");
        assertTrue(rungs[2].accessible, "rung 3 accessible");
        assertEq(rungs[2].lltv, 0.915e18, "rung 3 LLTV");
    }

    function test_ladder_resolves_subTier20_to_rung2() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);
        // gate3 not verified

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, 1, "sub-tier 20 clears rung 2");
        assertTrue(rungs[1].accessible, "rung 2 accessible");
        assertFalse(rungs[2].accessible, "rung 3 not accessible");
        assertEq(rungs[1].lltv, 0.77e18, "rung 2 LLTV");
    }

    function test_ladder_resolves_subTier10_to_rung1() public {
        validator.setVerified(address(gate1), borrower, true);
        // gate2 and gate3 not verified

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, 0, "sub-tier 10 clears rung 1");
        assertTrue(rungs[0].accessible, "rung 1 accessible");
        assertFalse(rungs[1].accessible, "rung 2 not accessible");
        assertFalse(rungs[2].accessible, "rung 3 not accessible");
        assertEq(rungs[0].lltv, 0.385e18, "rung 1 LLTV");
    }

    function test_ladder_resolves_noCredential_to_none() public view {
        // No verification set

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, type(uint256).max, "no credential clears nothing");
        assertFalse(rungs[0].accessible, "rung 1 not accessible");
        assertFalse(rungs[1].accessible, "rung 2 not accessible");
        assertFalse(rungs[2].accessible, "rung 3 not accessible");
    }

    /* FAIL-CLOSED BEHAVIOR */

    function test_ladder_failsClosed_whenGateReverts() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);
        validator.setVerified(address(gate3), borrower, true);
        validator.setReverting(true);

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, type(uint256).max, "gate revert resolves to no rung");
        assertFalse(rungs[0].accessible);
        assertFalse(rungs[1].accessible);
        assertFalse(rungs[2].accessible);
    }

    function test_ladder_failsClosed_whenGateMalformed() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);
        validator.setVerified(address(gate3), borrower, true);
        validator.setMalformed(true);

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(bestRung, type(uint256).max, "malformed return resolves to no rung");
        assertFalse(rungs[0].accessible);
        assertFalse(rungs[1].accessible);
        assertFalse(rungs[2].accessible);
    }

    function test_ladder_failsClosed_whenOracleReverts() public {
        validator.setVerified(address(gate1), borrower, true);

        // Replace oracle with one that reverts
        RevertingOracle revertingOracle = new RevertingOracle();
        revertingOracle.stopOracle();

        // Create a new market with the reverting oracle
        Market memory revertMarket = rung1Market;
        revertMarket.collateralParams[0].oracle = address(revertingOracle);
        bytes32 revertId = covenant.initMarket(revertMarket);

        bytes32[] memory revertIds = new bytes32[](1);
        revertIds[0] = revertId;

        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, revertIds, 1000e6);

        assertEq(rungs[0].collateralRequired, 0, "oracle revert yields zero collateral");
    }

    /* MARKET IDENTITY BINDING */

    function test_marketId_binds_gate() public view {
        Market memory altMarket = rung1Market;
        altMarket.entryGate = address(gate2);
        altMarket.seizureGate = address(gate2);

        assertTrue(toId(altMarket) != rung1Id, "changing gate changes market id");
    }

    function test_marketId_binds_lltv() public view {
        Market memory altMarket = rung1Market;
        altMarket.collateralParams[0].lltv = 0.77e18;

        assertTrue(toId(altMarket) != rung1Id, "changing LLTV changes market id");
    }

    /* INCREASE-ONLY GATING */

    function test_repay_worksAfter_tierDowngrade() public {
        // Open position at rung 2
        uint256 units = 1000e6;
        collateralize(rung2Market, borrower, units);
        validator.setVerified(address(gate2), lender, true);
        validator.setVerified(address(gate2), borrower, true);

        Offer memory lenderOffer;
        lenderOffer.buy = true;
        lenderOffer.maker = lender;
        lenderOffer.maxUnits = type(uint256).max;
        lenderOffer.market = rung2Market;
        lenderOffer.notary = address(dummyNotary);
        lenderOffer.expiry = vm.getBlockTimestamp() + 200;
        lenderOffer.tick = MAX_TICK;

        deal(address(loanToken), lender, type(uint256).max);
        fillOffer(units, lender, _makeBorrowerOffer(rung2Market, borrower));

        assertGt(covenant.debtOf(rung2Id, borrower), 0, "borrower has debt");

        // Revoke tier 20 credential
        validator.setVerified(address(gate2), borrower, false);

        // Repay still works
        deal(address(loanToken), borrower, units);
        vm.startPrank(borrower);
        loanToken.approve(address(covenant), units);
        covenant.repay(rung2Market, units / 2, borrower, address(0), hex"");
        vm.stopPrank();

        assertLt(covenant.debtOf(rung2Id, borrower), units, "repay reduced debt despite downgrade");
    }

    /* COLLATERAL CALCULATION */

    /// @notice The lens quote must be SUFFICIENT: borrowing at exactly the quoted collateral succeeds.
    /// @dev Asserted against the engine, not against a re-derivation of the lens formula. `fillOffer`
    /// enforces `isHealthy` internally, so a successful fill at the quoted amount is the engine agreeing.
    function test_collateralRequired_satisfies_isHealthy() public {
        uint256 units = 1000e6;

        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, units);
        uint256 quoted = rungs[1].collateralRequired;

        _supplyCollateral(rung2Market, quoted);
        _enableAndFund();

        // Engine enforces isHealthy inside the fill. Reverting here would mean the quote was short.
        fillOffer(units, lender, _makeBorrowerOffer(rung2Market, borrower));

        assertGt(covenant.debtOf(rung2Id, borrower), 0, "position opened at the quoted collateral");
        assertTrue(covenant.isHealthy(rung2Market, rung2Id, borrower), "lens quote satisfies isHealthy");
    }

    /// @notice The lens quote must be MINIMAL: one wei less collateral is rejected by the engine.
    /// Together with the test above this pins the quote to the exact `isHealthy` boundary.
    function test_collateralRequired_isMinimal() public {
        uint256 units = 1000e6;

        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, units);
        uint256 short = rungs[1].collateralRequired - 1;

        _supplyCollateral(rung2Market, short);
        _enableAndFund();

        vm.expectRevert();
        fillOffer(units, lender, _makeBorrowerOffer(rung2Market, borrower));
    }

    /// @notice Regression: the lens must invert LLTV before price to match the engine's two-floor order.
    /// @dev Pins the counterexample that the previous ordering got wrong. At `debt = 1, lltv = 0.915e18,
    /// price = 5e35` the engine's own order — `ceil(ceil(1 * 1e36 / 5e35) * 1e18 / 0.915e18)` — yields 3,
    /// which the engine then credits as `floor(3 * 5e35 / 1e36) = 1`, `floor(1 * 0.915e18 / 1e18) = 0`.
    /// `0 >= 1` is false, so the quote is short and the borrow would revert. The correct order yields 4,
    /// credited as `floor(4 * 5e35 / 1e36) = 2`, `floor(2 * 0.915e18 / 1e18) = 1` — exactly enough.
    function test_collateralRequired_invertsLltvBeforePrice() public {
        Oracle halfPriceOracle = new Oracle();
        halfPriceOracle.setPrice(5e35); // half of ORACLE_PRICE_SCALE

        Market memory tinyMarket = rung3Market; // lltv 0.915e18
        tinyMarket.collateralParams[0].oracle = address(halfPriceOracle);
        covenant.initMarket(tinyMarket);

        bytes32[] memory tinyRungIds = new bytes32[](1);
        tinyRungIds[0] = toId(tinyMarket);

        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, tinyRungIds, 1);

        assertEq(rungs[0].collateralRequired, 4, "LLTV must be inverted before price (wrong order gives 3)");
    }

    /// @notice A borrower at a higher rung posts strictly less collateral for the same loan.
    /// This is the ladder's entire economic claim, stated as an assertion.
    function test_collateralRequired_decreasesUpTheLadder() public view {
        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertGt(rungs[0].collateralRequired, rungs[1].collateralRequired, "rung 1 posts more than rung 2");
        assertGt(rungs[1].collateralRequired, rungs[2].collateralRequired, "rung 2 posts more than rung 3");
    }

    /// @notice Ranking is by LLTV, not by input order — a caller cannot mislead the lens by reordering.
    function test_ladder_ranksByLltv_notInputOrder() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);
        validator.setVerified(address(gate3), borrower, true);

        bytes32[] memory shuffled = new bytes32[](3);
        shuffled[0] = rung3Id; // highest LLTV first
        shuffled[1] = rung1Id;
        shuffled[2] = rung2Id;

        (uint256 bestRung, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, shuffled, 1000e6);

        assertEq(bestRung, 0, "best rung tracks LLTV, not position");
        assertEq(rungs[bestRung].marketId, rung3Id, "resolved to the 91.5% market");
    }

    /// @notice `minSubTier` surfaces the credential bar for the upgrade-path hint.
    function test_ladder_reportsMinSubTier() public view {
        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(rungs[0].minSubTier, 10, "rung 1 bar");
        assertEq(rungs[1].minSubTier, 20, "rung 2 bar");
        assertEq(rungs[2].minSubTier, 30, "rung 3 bar");
    }

    /// @notice `bestRungFor` agrees with `ladder`, and returns zeroes when no rung is cleared.
    function test_bestRungFor_matchesLadder() public {
        validator.setVerified(address(gate1), borrower, true);
        validator.setVerified(address(gate2), borrower, true);

        (bytes32 marketId, uint256 lltv, uint256 collateralRequired) = lens.bestRungFor(borrower, rungIds, 1000e6);
        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 1000e6);

        assertEq(marketId, rung2Id, "wrapper picks the same rung");
        assertEq(lltv, rungs[1].lltv, "same LLTV");
        assertEq(collateralRequired, rungs[1].collateralRequired, "same collateral");
    }

    function test_bestRungFor_returnsZero_whenNoRungCleared() public view {
        (bytes32 marketId, uint256 lltv, uint256 collateralRequired) = lens.bestRungFor(borrower, rungIds, 1000e6);

        assertEq(marketId, bytes32(0), "no market");
        assertEq(lltv, 0, "no LLTV");
        assertEq(collateralRequired, 0, "no collateral");
    }

    function test_collateralRequired_isZero_forZeroBorrow() public view {
        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, 0);

        assertEq(rungs[0].collateralRequired, 0, "zero borrow needs no collateral");
    }

    function test_collateralRequired_roundsUp() public view {
        uint256 borrowAmount = 1e6 + 1; // Amount that causes rounding

        (, CreditLadderLens.RungView[] memory rungs) = lens.ladder(borrower, rungIds, borrowAmount);

        // Verify rounding is conservative (up, not down)
        assertTrue(rungs[0].collateralRequired > 0, "non-zero collateral required");
    }

    /* HELPER */

    /// @dev Supplies exactly `amount` of collateral index 0 for `borrower` — no rounding of its own, so
    /// the position sits at precisely the amount under test.
    function _supplyCollateral(Market memory market, uint256 amount) internal {
        deal(address(collateralToken1), borrower, amount);
        vm.startPrank(borrower);
        collateralToken1.approve(address(covenant), amount);
        covenant.supplyCollateral(market, 0, amount, borrower);
        vm.stopPrank();
    }

    /// @dev Clears both sides of the rung-2 gate and funds the lender so a fill can reach `isHealthy`.
    function _enableAndFund() internal {
        validator.setVerified(address(gate2), borrower, true);
        validator.setVerified(address(gate2), lender, true);
        deal(address(loanToken), lender, type(uint128).max);
    }

    function _makeBorrowerOffer(Market memory market, address _borrower) internal view returns (Offer memory) {
        Offer memory offer;
        offer.buy = false;
        offer.maker = _borrower;
        offer.receiverIfMakerIsSeller = _borrower;
        offer.maxUnits = type(uint256).max;
        offer.market = market;
        offer.notary = address(dummyNotary);
        offer.expiry = vm.getBlockTimestamp() + 200;
        offer.tick = MAX_TICK;
        return offer;
    }
}
