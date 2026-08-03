// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity ^0.8.0;

import {ICovenant, Market, Offer, CollateralParams} from "../../src/interfaces/ICovenant.sol";
import {LIQUIDATION_CURSOR_LOW, ORACLE_PRICE_SCALE} from "../../src/libraries/ConstantsLib.sol";
import {MAX_TICK} from "../../src/libraries/TickLib.sol";
import {CleanversePoolGate} from "../../src/compliance/CleanversePoolGate.sol";
import {ICleanversePool} from "../../src/compliance/interfaces/ICleanversePool.sol";
import {BaseTest, MAX_TEST_AMOUNT} from "../BaseTest.sol";
import {MockCleanversePool} from "./mocks/MockCleanversePool.sol";

/// @notice Proves the Cleanverse pool gate actually blocks and permits `fillOffer` inside the real lending
/// protocol. Focuses on Cleanverse-specific states — paused pool, reverting pool, unregistered pool —
/// that the existing generic `GateTest` does not cover.
contract CleanversePoolIntegrationTest is BaseTest {
    MockCleanversePool internal pool;
    CleanversePoolGate internal gate;

    Market internal gatedMarket;
    bytes32 internal gatedId;
    Offer internal lenderOffer;
    Offer internal borrowerOffer;

    function setUp() public override {
        super.setUp();

        pool = new MockCleanversePool();
        gate = new CleanversePoolGate(pool);

        // A market whose gate is the Cleanverse-backed one. Because gates are part of the market's
        // identity, this is a distinct market from any non-gated variant on the same loan token — the
        // "compliant" and "open" universes cannot merge.
        gatedMarket.loanToken = address(loanToken);
        gatedMarket.maturity = vm.getBlockTimestamp() + 100;
        gatedMarket.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.77e18,
                oracle: address(oracle1),
                maxLif: maxLif(0.77e18, LIQUIDATION_CURSOR_LOW)
            })
        );
        gatedMarket.collateralParams = sortCollateralParams(gatedMarket.collateralParams);
        gatedMarket.entryGate = address(gate);
        gatedMarket.seizureGate = address(gate);
        gatedId = toId(gatedMarket);

        // A lender offer: maker=lender, buy=true (maker buys credit).
        lenderOffer.buy = true;
        lenderOffer.maker = lender;
        lenderOffer.maxUnits = type(uint256).max;
        lenderOffer.market = gatedMarket;
        lenderOffer.notary = address(dummyNotary);
        lenderOffer.expiry = vm.getBlockTimestamp() + 200;
        lenderOffer.tick = MAX_TICK;

        // A borrower offer: maker=borrower, buy=false (maker sells credit / takes on debt).
        borrowerOffer.buy = false;
        borrowerOffer.maker = borrower;
        borrowerOffer.receiverIfMakerIsSeller = borrower;
        borrowerOffer.maxUnits = type(uint256).max;
        borrowerOffer.market = gatedMarket;
        borrowerOffer.notary = address(dummyNotary);
        borrowerOffer.expiry = vm.getBlockTimestamp() + 200;
        borrowerOffer.tick = MAX_TICK;

        // Fund the lender so their `buy` fills can source loan tokens.
        deal(address(loanToken), lender, type(uint256).max);
    }

    /* GATE BINDS TO MARKET IDENTITY */

    function test_gateIsBoundToMarketIdentity() public view {
        Market memory openMarket = gatedMarket;
        openMarket.entryGate = address(0);
        openMarket.seizureGate = address(0);

        assertTrue(gatedId != toId(openMarket), "changing the gate must change the market id");
    }

    /* CLEANVERSE-SPECIFIC OPERATIONAL STATE */

    function test_take_revertsWhenPoolPaused(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(lender, true);
        pool.setVerified(borrower, true);
        pool.setPaused(true);

        // The pool being paused must deny even a wallet whose eligibility would otherwise pass, and it
        // must surface as the market's own error rather than an opaque revert from Cleanverse.
        vm.expectRevert(ICovenant.LenderIneligible.selector);
        fillOffer(units, lender, borrowerOffer);
    }

    function test_take_revertsWhenPoolReverting(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(lender, true);
        pool.setVerified(borrower, true);
        pool.setReverting(true);

        // A Cleanverse outage denies new positions but does not corrupt the market. The lending
        // protocol's error is what surfaces, not the pool's revert.
        vm.expectRevert(ICovenant.LenderIneligible.selector);
        fillOffer(units, lender, borrowerOffer);
    }

    function test_take_revertsWhenPoolUnregistered(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(lender, true);
        pool.setVerified(borrower, true);
        pool.setRegistered(false);

        // A gate pointing at a pool that was never registered on Cleanverse is a misconfiguration; deny
        // until the operator fixes it, rather than silently trading.
        vm.expectRevert(ICovenant.LenderIneligible.selector);
        fillOffer(units, lender, borrowerOffer);
    }

    /* CREDENTIAL LIFECYCLE — the exit path stays open */

    function test_repay_stillWorksAfterVerificationRevoked(uint256 units) public {
        // Open a position while both parties are verified.
        units = bound(units, 1e6, MAX_TEST_AMOUNT / 2);
        collateralize(gatedMarket, borrower, units);
        pool.setVerified(lender, true);
        pool.setVerified(borrower, true);
        fillOffer(units, lender, borrowerOffer);

        assertGt(covenant.debtOf(gatedId, borrower), 0, "borrower has debt");

        // Then revoke the borrower's verification — in Cleanverse terms, the A-Pass is frozen or has
        // expired. New borrowing must be blocked, but repayment must still work: only *increases* are
        // gated, so a wallet losing eligibility can still exit its position.
        pool.setVerified(borrower, false);

        deal(address(loanToken), borrower, units);
        vm.startPrank(borrower);
        loanToken.approve(address(covenant), units);
        covenant.repay(gatedMarket, units / 2, borrower, address(0), hex"");
        vm.stopPrank();

        assertLt(covenant.debtOf(gatedId, borrower), units, "repay reduced debt despite revocation");
    }

    /* PARTIAL VERIFICATION */

    function test_take_revertsWhenOnlyLenderVerified(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(lender, true); // borrower is not

        vm.expectRevert(ICovenant.BorrowerIneligible.selector);
        fillOffer(units, lender, borrowerOffer);
    }

    function test_take_revertsWhenOnlyBorrowerVerified(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(borrower, true); // lender is not

        vm.expectRevert(ICovenant.LenderIneligible.selector);
        fillOffer(units, borrower, lenderOffer);
    }

    /* HAPPY PATH */

    function test_take_succeedsWhenBothVerified(uint256 units) public {
        units = bound(units, 1, MAX_TEST_AMOUNT * 3 / 4);
        collateralize(gatedMarket, borrower, units);

        pool.setVerified(lender, true);
        pool.setVerified(borrower, true);
        fillOffer(units, lender, borrowerOffer);

        assertGt(covenant.creditOf(gatedId, lender), 0, "lender received credit");
        assertGt(covenant.debtOf(gatedId, borrower), 0, "borrower took on debt");
    }
}
