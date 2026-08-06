// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity ^0.8.0;

import {ICovenant, Market, Offer, CollateralParams} from "../../src/interfaces/ICovenant.sol";
import {IFlashLoanCallback} from "../../src/interfaces/ICallbacks.sol";
import {CALLBACK_SUCCESS} from "../../src/libraries/ConstantsLib.sol";
import {LIQUIDATION_CURSOR_LOW, ORACLE_PRICE_SCALE} from "../../src/libraries/ConstantsLib.sol";
import {MAX_TICK} from "../../src/libraries/TickLib.sol";
import {CleanversePoolGate} from "../../src/compliance/CleanversePoolGate.sol";
import {BaseTest, MAX_TEST_AMOUNT} from "../BaseTest.sol";
import {MockAPassValidator} from "./mocks/MockAPassValidator.sol";

/// @notice Locks in the two claims the README makes about flash loans:
///
///   1. If the loan token is a plain ERC20, `flashLoan` is a public utility over pooled balances that a
///      non-compliant caller can access even while the market it draws from is fully gated. This test
///      makes that fact visible so operators cannot be surprised by it later.
///
///   2. If the loan token is compliance-aware — its own `transfer` refuses movement to unverified
///      addresses — then `flashLoan` reverts inside the token itself before the callback ever runs. The
///      market's gate becomes belt-and-suspenders; the token is the belt.
contract FlashLoanSurfaceTest is BaseTest {
    MockAPassValidator internal validator;
    CleanversePoolGate internal gate;
    Market internal gatedMarket;
    Offer internal borrowerOffer;

    function setUp() public override {
        super.setUp();

        validator = new MockAPassValidator();
        gate = new CleanversePoolGate(validator, address(this));
        validator.setRegistered(address(gate), true);

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

        borrowerOffer.buy = false;
        borrowerOffer.maker = borrower;
        borrowerOffer.receiverIfMakerIsSeller = borrower;
        borrowerOffer.maxUnits = type(uint256).max;
        borrowerOffer.market = gatedMarket;
        borrowerOffer.notary = address(dummyNotary);
        borrowerOffer.expiry = vm.getBlockTimestamp() + 200;
        borrowerOffer.tick = MAX_TICK;

        deal(address(loanToken), lender, type(uint256).max);
    }

    /* CLAIM 1: plain-ERC20 loan tokens are drainable to non-compliant callers via flashLoan */

    function test_flashLoan_reachesNonCompliantCallerWhenLoanTokenIsPermissive(uint256 loanBalance) public {
        // Seed the Covenant contract with loan tokens as if a compliant lender had supplied them. Using
        // `deal` directly rather than routing through `fillOffer` keeps this focused on the flash-loan
        // surface, not the fillOffer-flow math.
        loanBalance = bound(loanBalance, 1, type(uint128).max);
        deal(address(loanToken), address(covenant), loanBalance);

        // A callback wallet that is not verified in the pool.
        FlashCallback callback = new FlashCallback(address(covenant), address(loanToken));
        assertFalse(gate.canIncreaseCredit(address(callback)), "callback is not compliant");

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(loanToken);
        assets[0] = 1;

        // A non-compliant caller invoking flashLoan on a compliant market's pooled loan tokens. This
        // succeeds by design in the underlying protocol and is what the README documents as a surface
        // the market layer does not close — only a compliance-aware loan token (test below) does.
        address griefer = makeAddr("sanctioned");
        assertFalse(gate.canIncreaseCredit(griefer), "griefer is not compliant");
        vm.prank(griefer);
        covenant.flashLoan(tokens, assets, address(callback), hex"");

        assertTrue(callback.wasCalled(), "callback ran with pooled loan tokens");
    }

    /* CLAIM 2: a compliance-aware loan token blocks the same flow at the token layer */

    function test_flashLoan_isBlockedByComplianceAwareLoanToken() public {
        // Substitute a loan token that self-enforces compliance on transfer: it reverts any transfer
        // whose recipient the token itself does not consider allowed. This mirrors the Cleanverse
        // A-Token model, where the token's own `transfer` hook refuses movement to unverified wallets.
        CompliantERC20 aToken = new CompliantERC20("A-USDC");
        aToken.setAllowed(address(covenant), true); // Covenant holds tokens
        aToken.mint(address(covenant), 1_000_000e18);

        FlashCallback callback = new FlashCallback(address(covenant), address(aToken));
        // The callback wallet is NOT in the token's allow-list. That is the whole point.

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(aToken);
        assets[0] = 1;

        // The token refuses to be transferred to a non-verified callback wallet, and the failure
        // surfaces from inside `flashLoan`'s first `safeTransfer`. The callback is never invoked.
        vm.expectRevert(); // token's own compliance revert
        covenant.flashLoan(tokens, assets, address(callback), hex"");

        assertFalse(callback.wasCalled(), "callback must never have run");
    }
}

/* HELPERS */

/// @dev Minimal flash-loan callback that logs whether it ran and repays exactly what it borrowed.
contract FlashCallback is IFlashLoanCallback {
    address internal immutable covenant;
    address internal immutable token;
    bool public wasCalled;

    constructor(address _covenant, address _token) {
        covenant = _covenant;
        token = _token;
    }

    function onFlashLoan(address, address[] calldata tokens, uint256[] calldata assets, bytes calldata)
        external
        returns (bytes32)
    {
        wasCalled = true;
        // Allow Covenant to pull the assets back.
        for (uint256 i = 0; i < tokens.length; i++) {
            (bool ok,) = tokens[i].call(abi.encodeWithSignature("approve(address,uint256)", covenant, assets[i]));
            require(ok, "approve failed");
        }
        return CALLBACK_SUCCESS;
    }
}

/// @dev A compliance-aware ERC20 that reverts transfers to addresses not in its allow-list. Models the
/// Cleanverse A-Token enforcement point at the token layer.
contract CompliantERC20 {
    string public name;
    string public symbol = "cERC20";
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public isAllowed;

    error TokenComplianceViolation(address recipient);

    constructor(string memory _name) {
        name = _name;
    }

    function setAllowed(address who, bool value) external {
        isAllowed[who] = value;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(isAllowed[to], TokenComplianceViolation(to));
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(isAllowed[to], TokenComplianceViolation(to));
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
