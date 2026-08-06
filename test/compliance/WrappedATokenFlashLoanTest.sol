// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {ICovenant} from "../../src/interfaces/ICovenant.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {IFlashLoanCallback} from "../../src/interfaces/ICallbacks.sol";
import {CALLBACK_SUCCESS} from "../../src/libraries/ConstantsLib.sol";
import {Covenant} from "../../src/Covenant.sol";
import {WrappedAToken} from "../../src/compliance/WrappedAToken.sol";
import {IAPassComplianceValidator} from "../../src/compliance/interfaces/IAPassComplianceValidator.sol";
import {MockAPassValidator} from "./mocks/MockAPassValidator.sol";
import {ERC20} from "../erc20s/ERC20.sol";

/// @notice Proves the load-bearing claim in the README's "Wrapped A-Token" section: when the loan
/// token of a Covenant market is a `WrappedAToken`, `flashLoan` reverts inside the token's
/// `transfer` before the callback ever runs whenever the callback wallet is not verified by the
/// bound CVI Compliance Validator (CCP V2).
///
/// This is the mirror image of `FlashLoanSurfaceTest`, which uses a bespoke toy allow-list token to
/// demonstrate the same principle. Here we exercise the production `WrappedAToken` contract itself
/// against the same `MockAPassValidator` the gate uses, so a green run means the wrapper closes the
/// documented surface in reality — not just in principle.
contract WrappedATokenFlashLoanTest is Test {
    Covenant internal covenant;
    ERC20 internal origin;
    DecimalsERC20 internal originWithDecimals;
    MockAPassValidator internal validator;
    WrappedAToken internal waToken;

    address internal admin = makeAddr("waTokenAdmin");
    address internal lender = makeAddr("lender");
    address internal griefer = makeAddr("sanctioned");

    function setUp() public {
        covenant = new Covenant(false, address(0));

        // Origin token — plain ERC20 standing in for native USDC. The repo's bare mock has no
        // `decimals()`, which is also what exercises the constructor's soft decimals check.
        origin = new ERC20("USDC", "USDC");
        originWithDecimals = new DecimalsERC20();

        // CCP V2 validator + compliance-aware wrapper. The wrapper registers itself as a pool with
        // the validator; the Covenant core is exempt because it holds and routes wrapped balances as
        // protocol infrastructure — the on-chain analogue of the institutional-deposit whitelist.
        validator = new MockAPassValidator();
        waToken = new WrappedAToken(
            IERC20(address(origin)),
            IAPassComplianceValidator(address(validator)),
            admin,
            "Wrapped Access USDC",
            "waUSDC",
            6
        );
        validator.setRegistered(address(waToken), true);

        vm.prank(admin);
        waToken.setExempt(address(covenant), true);

        // Seed the lender with origin, verify them against the wrapper's pool, deposit into the
        // wrapper, then donate the wrapped balance to Covenant so `flashLoan` has something to lend.
        // Routing through `deposit` + `transfer` keeps the whole setup on the wrapper's compliance
        // path — the setup itself proves that a verified lender can round-trip origin → wrapped.
        deal(address(origin), lender, 1_000_000e6);
        validator.setVerified(address(waToken), lender, true);

        vm.startPrank(lender);
        origin.approve(address(waToken), type(uint256).max);
        waToken.deposit(1_000_000e6, lender);
        // Route most of the wrapped supply into Covenant so `flashLoan` has something to lend,
        // keeping a small residual on the lender to exercise the credential-revoked withdraw path.
        waToken.transfer(address(covenant), 900_000e6);
        vm.stopPrank();

        assertEq(waToken.balanceOf(address(covenant)), 900_000e6, "core seeded");
        assertEq(waToken.balanceOf(lender), 100_000e6, "lender residual");
    }

    /* CORE CLAIM — a non-compliant flash-loan recipient is refused by the token, not by the market */

    function test_flashLoan_revertsInsideWrappedATokenForNonCompliantCallback() public {
        // Callback contract that would happily receive the loan. Crucially, its address is NOT
        // verified — this is the whole scenario the wrapped A-Token is meant to close.
        FlashCallback callback = new FlashCallback(address(covenant));
        assertFalse(_waEligible(address(callback)), "callback is not compliant");

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(waToken);
        assets[0] = 1e6;

        // The token's `_transfer` runs `_eligible(callback)` and reverts with `RecipientNotCompliant`
        // before the callback is ever invoked. The griefer's identity doesn't matter — the check is
        // on the recipient of the transfer, i.e. the flash-loan callback.
        vm.prank(griefer);
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.RecipientNotCompliant.selector, address(callback)));
        covenant.flashLoan(tokens, assets, address(callback), hex"");

        assertFalse(callback.wasCalled(), "callback must never have run");
    }

    /* MIRROR CLAIM — a compliant callback wallet reaches the callback and settles cleanly */

    function test_flashLoan_succeedsWhenCallbackIsCompliant() public {
        FlashCallback callback = new FlashCallback(address(covenant));

        // Verify the callback against the wrapper's pool. Nothing else changes.
        validator.setVerified(address(waToken), address(callback), true);
        assertTrue(_waEligible(address(callback)), "callback is now compliant");

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(waToken);
        assets[0] = 1e6;

        uint256 coreBalanceBefore = waToken.balanceOf(address(covenant));
        vm.prank(griefer);
        covenant.flashLoan(tokens, assets, address(callback), hex"");
        assertTrue(callback.wasCalled(), "callback ran after compliance passed");
        assertEq(waToken.balanceOf(address(covenant)), coreBalanceBefore, "core repaid whole");
    }

    /* FAIL-CLOSED — a validator outage denies the flash loan too */

    function test_flashLoan_revertsWhenValidatorReverts() public {
        FlashCallback callback = new FlashCallback(address(covenant));
        validator.setVerified(address(waToken), address(callback), true);
        validator.setReverting(true);

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(waToken);
        assets[0] = 1e6;

        // A reverting validator resolves to `not eligible` inside `_readBool` (staticcall returns
        // ok=false); the wrapper then reverts with `RecipientNotCompliant`. Same outcome, different
        // path — unavailable verification is never treated as clearance.
        vm.prank(griefer);
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.RecipientNotCompliant.selector, address(callback)));
        covenant.flashLoan(tokens, assets, address(callback), hex"");
    }

    /* EXIT PATH — a holder whose credential is revoked can still withdraw their origin balance */

    function test_withdraw_stillWorksAfterCredentialRevoked() public {
        assertGt(waToken.balanceOf(lender), 0, "wallet warmed up in setUp");

        // Revoke the lender's verification.
        validator.setVerified(address(waToken), lender, false);
        assertFalse(_waEligible(lender), "lender's credential is now cold");

        // Withdrawing is intentionally not compliance-gated: the exit path stays open so a lost
        // credential cannot strand a holder's locked origin balance.
        uint256 waBalBefore = waToken.balanceOf(lender);
        uint256 originBefore = origin.balanceOf(lender);

        vm.prank(lender);
        waToken.withdraw(waBalBefore, lender);

        assertEq(waToken.balanceOf(lender), 0, "wrapped burned");
        assertEq(origin.balanceOf(lender), originBefore + waBalBefore, "origin returned");
    }

    /* PRODUCTION HARDENING — decimals check, reentrancy latch */

    function test_constructor_rejectsDecimalsMismatch() public {
        // `originWithDecimals` is 18-decimal; claiming 6 must revert.
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.DecimalsMismatch.selector, uint8(6), uint8(18)));
        new WrappedAToken(
            IERC20(address(originWithDecimals)),
            IAPassComplianceValidator(address(validator)),
            admin, "X", "X", 6
        );
    }

    function test_constructor_allowsOriginWithoutDecimals() public {
        // The repo's bare ERC20 mock has no `decimals()`, so the soft check is skipped.
        WrappedAToken w = new WrappedAToken(
            IERC20(address(origin)),
            IAPassComplianceValidator(address(validator)),
            admin, "No Decimals", "waND", 6
        );
        assertEq(w.decimals(), 6, "declared decimals accepted when origin omits decimals()");
    }

    /* HELPERS */

    function _waEligible(address who) internal view returns (bool) {
        // Cheap replica of `WrappedAToken._eligible` for the assertions above — mirrors CCP V2's
        // `isRegistered(pool) ∧ complianceVerify(pool, user)` shape.
        if (waToken.isExempt(who)) return true;
        if (!validator.isRegistered(address(waToken))) return false;
        return validator.complianceVerify(address(waToken), who);
    }
}

/* — TEST DOUBLES — */

/// @dev ERC20 that DOES expose `decimals()`, used to exercise the constructor's decimals check.
contract DecimalsERC20 {
    string public name = "Eighteen";
    string public symbol = "EIGHTEEN";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Minimal flash-loan callback that logs whether it ran and repays exactly what it borrowed.
contract FlashCallback is IFlashLoanCallback {
    address internal immutable covenant;
    bool public wasCalled;

    constructor(address _covenant) {
        covenant = _covenant;
    }

    function onFlashLoan(address, address[] calldata tokens, uint256[] calldata assets, bytes calldata)
        external
        returns (bytes32)
    {
        wasCalled = true;
        for (uint256 i; i < tokens.length; i++) {
            (bool ok,) = tokens[i].call(abi.encodeWithSignature("approve(address,uint256)", covenant, assets[i]));
            require(ok, "approve failed");
        }
        return CALLBACK_SUCCESS;
    }
}
