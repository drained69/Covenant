// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {BaseTest} from "./BaseTest.sol";
import {ERC20} from "./erc20s/ERC20.sol";
import {SafeTransferLib} from "../src/libraries/SafeTransferLib.sol";
import {IFlashLoanCallback} from "../src/interfaces/ICallbacks.sol";
import {CALLBACK_SUCCESS} from "../src/libraries/ConstantsLib.sol";
import {Market, Offer, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {Covenant} from "../src/Covenant.sol";
import {MAX_TICK} from "../src/libraries/TickLib.sol";

/// @dev Exercises reentrant Covenant calls from inside `onFlashLoan`.
contract FlashLoanReentrancyHarness is IFlashLoanCallback {
    Covenant public immutable covenant;
    address public immutable loanToken;
    Market public market;
    bytes32 public marketId;

    uint8 public action;
    uint256 public nestedAmount;
    uint256 public withdrawUnits;
    uint256 public takeUnits;
    address public withdrawOnBehalf;
    address public takeTaker;
    Offer public takeOffer;

    uint256 public reentryCount;
    bool public outerRepay;

    uint256 private constant NESTED_FLASH = 1;
    uint256 private constant WITHDRAW = 2;
    uint256 private constant TAKE = 3;
    uint256 private constant SKIP_OUTER_REPAY = 4;

    constructor(Covenant _covenant, address _loanToken) {
        covenant = _covenant;
        loanToken = _loanToken;
    }

    function configureMarket(Market memory _market, bytes32 _id) external {
        market = _market;
        marketId = _id;
    }

    function fund(address token, uint256 amount) external {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
    }

    function runFlashLoan(uint256 amount, uint8 _action, bytes memory extra) external {
        action = _action;
        if (_action == NESTED_FLASH) {
            nestedAmount = abi.decode(extra, (uint256));
        } else if (_action == WITHDRAW) {
            (withdrawUnits, withdrawOnBehalf) = abi.decode(extra, (uint256, address));
        } else if (_action == TAKE) {
            (takeUnits, takeTaker, takeOffer) = abi.decode(extra, (uint256, address, Offer));
        } else if (_action == SKIP_OUTER_REPAY) {
            nestedAmount = abi.decode(extra, (uint256));
        }

        address[] memory tokens = new address[](1);
        tokens[0] = loanToken;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        if (_action != SKIP_OUTER_REPAY) {
            ERC20(loanToken).approve(address(covenant), amount);
        }

        covenant.flashLoan(tokens, amounts, address(this), hex"");
    }

    function onFlashLoan(address, address[] memory tokens, uint256[] memory amounts, bytes memory)
        external
        returns (bytes32)
    {
        reentryCount++;
        require(msg.sender == address(covenant), "only covenant");

        if (action == NESTED_FLASH && reentryCount == 1) {
            uint256 inner = nestedAmount;
            ERC20(loanToken).approve(address(covenant), inner);
            address[] memory t = new address[](1);
            t[0] = loanToken;
            uint256[] memory a = new uint256[](1);
            a[0] = inner;
            covenant.flashLoan(t, a, address(this), hex"");
        } else if (action == WITHDRAW) {
            covenant.withdraw(market, withdrawUnits, withdrawOnBehalf, address(this));
        } else if (action == TAKE) {
            // msg.sender is this harness; `takeTaker` must equal address(this).
            covenant.fillOffer(takeOffer, hex"", takeUnits, takeTaker, takeTaker, address(0), hex"");
        } else if (action == SKIP_OUTER_REPAY) {
            outerRepay = false;
            return CALLBACK_SUCCESS;
        }

        // Repay outer flash loan from callback balance.
        for (uint256 i = 0; i < tokens.length; i++) {
            SafeTransferLib.safeTransfer(tokens[i], address(this), amounts[i]);
            ERC20(tokens[i]).approve(address(covenant), amounts[i]);
        }
        return CALLBACK_SUCCESS;
    }
}

contract FlashLoanReentrancyTest is BaseTest {
    Market internal market;
    bytes32 internal id;
    FlashLoanReentrancyHarness internal harness;

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
        id = covenant.initMarket(market);
        covenant.setMarketTickSpacing(id, 1);

        harness = new FlashLoanReentrancyHarness(covenant, address(loanToken));
        harness.configureMarket(market, id);
    }

    function _seedMarketLiquidity(uint256 units) internal {
        collateralize(market, borrower, units);
        setupMarket(market, units);
    }

    /// @dev Repay so loan tokens and `withdrawable` sit on Covenant (flash-loan inventory).
    function _seedRepaidLiquidity(uint256 units) internal {
        _seedMarketLiquidity(units);
        deal(address(loanToken), borrower, units);
        vm.startPrank(borrower);
        ERC20(address(loanToken)).approve(address(covenant), units);
        covenant.repay(market, units, borrower, address(0), hex"");
        vm.stopPrank();
        assertGt(_loanBalance(), 0, "loan pool on covenant");
        assertGt(covenant.withdrawable(id), 0, "withdrawable");
    }

    function _loanBalance() internal view returns (uint256) {
        return loanToken.balanceOf(address(covenant));
    }

    /// @dev Reentrancy is reachable: nested flashLoan on the same token in one tx.
    function test_reentrancy_nestedFlashLoan_succeeds_with_sufficient_liquidity() public {
        uint256 units = 1_000e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        assertGt(pool, 0, "pool");

        uint256 outer = pool / 2;
        uint256 inner = pool / 2;
        assertEq(outer + inner, pool, "split pool");

        deal(address(loanToken), address(this), outer + inner);
        ERC20(address(loanToken)).approve(address(harness), outer + inner);
        harness.fund(address(loanToken), outer + inner);
        harness.runFlashLoan(outer, 1, abi.encode(inner));

        assertEq(harness.reentryCount(), 2, "outer+inner callbacks");
        assertEq(_loanBalance(), pool, "pool restored");
    }

    /// @dev Nested flash beyond on-hand balance reverts the whole transaction.
    function test_reentrancy_nestedFlashLoan_reverts_when_overdrawn() public {
        uint256 units = 500e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint256 outer = pool;
        uint256 inner = 1; // second transfer fails: balance already 0

        deal(address(loanToken), address(this), outer);
        ERC20(address(loanToken)).approve(address(harness), outer);
        harness.fund(address(loanToken), outer);

        vm.expectRevert();
        harness.runFlashLoan(outer, 1, abi.encode(inner));

        assertEq(_loanBalance(), pool, "pool unchanged on revert");
    }

    /// @dev Withdrawing loan tokens while the pool is flash-drained reverts atomically.
    function test_reentrancy_withdrawDuringFullFlashLoan_reverts() public {
        uint256 units = 1_000e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint128 withdrawable = covenant.withdrawable(id);
        assertGt(withdrawable, 0, "lender withdrawable");

        vm.prank(lender);
        covenant.setIsAuthorized(address(harness), true, lender);

        deal(address(loanToken), address(this), pool);
        ERC20(address(loanToken)).approve(address(harness), pool);
        harness.fund(address(loanToken), pool);

        vm.expectRevert();
        harness.runFlashLoan(pool, 2, abi.encode(uint256(withdrawable), lender));

        assertEq(_loanBalance(), pool, "pool unchanged");
        assertEq(covenant.withdrawable(id), withdrawable, "withdrawable unchanged");
    }

    /// @dev Authorized reentrant withdraw during a partial flash can succeed atomically (composition, not theft).
    function test_reentrancy_partialFlash_plus_authorizedWithdraw_succeeds() public {
        uint256 units = 1_000e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint256 flashAmount = pool * 60 / 100;
        uint256 withdrawUnits = pool * 30 / 100;

        vm.prank(lender);
        covenant.setIsAuthorized(address(harness), true, lender);

        uint256 poolBefore = pool;
        uint128 withdrawableBefore = covenant.withdrawable(id);

        deal(address(loanToken), address(this), flashAmount);
        ERC20(address(loanToken)).approve(address(harness), flashAmount);
        harness.fund(address(loanToken), flashAmount);

        harness.runFlashLoan(flashAmount, 2, abi.encode(withdrawUnits, lender));

        assertEq(_loanBalance(), poolBefore - withdrawUnits, "pool net of withdraw");
        assertEq(covenant.withdrawable(id), withdrawableBefore - uint128(withdrawUnits), "withdrawable reduced");
        assertGe(loanToken.balanceOf(address(harness)), withdrawUnits, "harness received withdraw");
    }

    /// @dev Callback returns success without repaying — entire tx reverts on pull.
    function test_reentrancy_callbackSuccess_withoutRepay_reverts() public {
        uint256 units = 1_000e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint256 outer = pool / 2;

        vm.expectRevert();
        harness.runFlashLoan(outer, 4, hex"");

        assertEq(_loanBalance(), pool, "no protocol loss on revert");
    }

    /// @dev Reentrant `fillOffer` inside flash callback is possible; solvency holds if flash is repaid.
    function test_reentrancy_takeDuringFlashLoan_composes_when_prefunded() public {
        uint256 units = 500e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint256 flashAmount = pool / 2;
        uint256 takeUnits = 50e18;

        Offer memory borrowerOffer = _setupMarketOffer(market, takeUnits);
        borrowerOffer.maxUnits = takeUnits;
        borrowerOffer.group = keccak256("reentrant-fillOffer-group");
        borrowerOffer.expiry = vm.getBlockTimestamp() + 200;

        vm.prank(borrower);
        covenant.setIsAuthorized(address(dummyNotary), true, borrower);
        vm.prank(borrower);
        covenant.setIsAuthorized(address(harness), true, borrower);

        deal(address(loanToken), address(harness), flashAmount + 200e18);
        ERC20(address(loanToken)).approve(address(harness), type(uint256).max);

        uint256 poolBefore = pool;

        harness.runFlashLoan(flashAmount, 3, abi.encode(takeUnits, address(harness), borrowerOffer));

        assertEq(_loanBalance(), poolBefore, "pool after composed tx");
        assertGt(covenant.creditOf(id, address(harness)), 0, "harness took lender side");
    }

    /// @dev Without authorization, reentrant withdraw during flash loan reverts (Unauthorized).
    function test_reentrancy_unauthorizedWithdrawDuringFlashLoan_reverts() public {
        uint256 units = 800e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint256 flashAmount = pool / 2;

        deal(address(loanToken), address(this), flashAmount);
        ERC20(address(loanToken)).approve(address(harness), flashAmount);
        harness.fund(address(loanToken), flashAmount);

        vm.expectRevert(abi.encodeWithSignature("Unauthorized()"));
        harness.runFlashLoan(flashAmount, 2, abi.encode(uint256(1), lender));
    }

    /// @dev Unauthorized full-pool flash + withdraw attempt leaves all balances and accounting unchanged.
    function test_reentrancy_unauthorizedFullPoolWithdraw_stateUnchanged() public {
        uint256 units = 800e18;
        _seedRepaidLiquidity(units);

        uint256 pool = _loanBalance();
        uint128 withdrawableBefore = covenant.withdrawable(id);
        uint256 covenantBefore = pool;

        vm.expectRevert(abi.encodeWithSignature("Unauthorized()"));
        harness.runFlashLoan(pool, 2, abi.encode(withdrawableBefore, lender));

        assertEq(_loanBalance(), covenantBefore, "covenant balance unchanged");
        assertEq(covenant.withdrawable(id), withdrawableBefore, "withdrawable unchanged");
    }
}
