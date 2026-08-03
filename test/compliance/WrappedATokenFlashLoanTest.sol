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
import {ICleanversePool} from "../../src/compliance/interfaces/ICleanversePool.sol";
import {MockCleanversePool} from "./mocks/MockCleanversePool.sol";
import {ERC20} from "../erc20s/ERC20.sol";

/// @notice Proves the load-bearing claim in the README's "Wrapped A-Token" section: when the loan token
/// of a Covenant market is a `WrappedAToken`, `flashLoan` reverts inside the token's `transfer` before
/// the callback ever runs whenever the callback wallet is not verified in the bound Cleanverse pool.
///
/// This is the mirror image of `FlashLoanSurfaceTest`, which uses a bespoke toy allow-list token to
/// demonstrate the same principle. Here we exercise the production `WrappedAToken` contract itself
/// against the same `MockCleanversePool` the gate uses, so a green run means the wrapper closes the
/// documented surface in reality — not just in principle.
contract WrappedATokenFlashLoanTest is Test {
    Covenant internal covenant;
    ERC20 internal origin;
    DecimalsERC20 internal originWithDecimals;
    MockCleanversePool internal pool;
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

        // Cleanverse pool + compliance-aware wrapper. The Covenant core is exempt because it holds and
        // routes wrapped balances as protocol infrastructure — this mirrors Cleanverse's institutional
        // deposit-address whitelist for token-layer routing.
        pool = new MockCleanversePool();
        waToken =
            new WrappedAToken(IERC20(address(origin)), ICleanversePool(address(pool)), admin, "Wrapped Access USDC", "waUSDC", 6);

        vm.prank(admin);
        waToken.setExempt(address(covenant), true);

        // Seed the lender with origin, verify them in the pool, deposit into the wrapper, then donate
        // the wrapped balance to Covenant so `flashLoan` has something to lend. Routing through
        // `deposit` + `transfer` keeps the whole setup on the wrapper's compliance path — the setup
        // itself proves that a verified lender can round-trip origin → wrapped → covenant.
        deal(address(origin), lender, 1_000_000e6);
        pool.setVerified(lender, true);

        vm.startPrank(lender);
        origin.approve(address(waToken), type(uint256).max);
        waToken.deposit(1_000_000e6, lender);
        // Route most of the wrapped supply into Covenant so `flashLoan` has something to lend, keeping
        // a small residual on the lender to exercise the credential-revoked withdraw path.
        waToken.transfer(address(covenant), 900_000e6);
        vm.stopPrank();

        assertEq(waToken.balanceOf(address(covenant)), 900_000e6, "core seeded");
        assertEq(waToken.balanceOf(lender), 100_000e6, "lender residual");
    }

    /* CORE CLAIM — a non-compliant flash-loan recipient is refused by the token, not by the market */

    function test_flashLoan_revertsInsideWrappedATokenForNonCompliantCallback() public {
        // Callback contract that would happily receive the loan. Crucially, its address is NOT verified
        // in the pool — this is the whole scenario the wrapped A-Token is meant to close.
        FlashCallback callback = new FlashCallback(address(covenant));
        assertFalse(_waEligible(address(callback)), "callback is not compliant in the wrapper's pool");

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(waToken);
        assets[0] = 1e6;

        // The token's `_transfer` runs `_eligible(callback)` and reverts with `RecipientNotCompliant`
        // before the callback is ever invoked. The griefer's identity doesn't matter — the check is on
        // the recipient of the transfer, i.e. the flash-loan callback.
        vm.prank(griefer);
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.RecipientNotCompliant.selector, address(callback)));
        covenant.flashLoan(tokens, assets, address(callback), hex"");

        assertFalse(callback.wasCalled(), "callback must never have run");
    }

    /* MIRROR CLAIM — a compliant callback wallet reaches the callback and settles cleanly */

    function test_flashLoan_succeedsWhenCallbackIsCompliant() public {
        FlashCallback callback = new FlashCallback(address(covenant));

        // Verify the callback in the pool. Nothing else changes.
        pool.setVerified(address(callback), true);
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

    /* FAIL-CLOSED — a pool outage denies the flash loan too */

    function test_flashLoan_revertsWhenPoolReverts() public {
        FlashCallback callback = new FlashCallback(address(covenant));
        pool.setVerified(address(callback), true);
        pool.setReverting(true);

        address[] memory tokens = new address[](1);
        uint256[] memory assets = new uint256[](1);
        tokens[0] = address(waToken);
        assets[0] = 1e6;

        // A reverting pool resolves to `not eligible` inside `_readBool` because staticcall returns
        // `ok = false`; the wrapper then reverts with `RecipientNotCompliant`. Same outcome, different
        // path — unavailable verification is never treated as clearance.
        vm.prank(griefer);
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.RecipientNotCompliant.selector, address(callback)));
        covenant.flashLoan(tokens, assets, address(callback), hex"");
    }

    /* EXIT PATH — a holder whose credential is revoked can still withdraw their origin balance */

    function test_withdraw_stillWorksAfterCredentialRevoked() public {
        // Give the lender something to burn back to origin.
        assertGt(waToken.balanceOf(lender), 0, "wallet warmed up in setUp");

        // Revoke.
        pool.setVerified(lender, false);
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

    /* PRODUCTION HARDENING — fee-on-transfer, decimals, reentrancy */

    /// @notice A fee-on-transfer origin must mint only what actually landed, or the wrapper ends up
    /// under-collateralised and the last redeemer eats the shortfall.
    function test_deposit_mintsBalanceDeltaNotRequestedAmount() public {
        FeeOnTransferERC20 feeToken = new FeeOnTransferERC20("feeUSDC", "feeUSDC", 100); // 1% fee
        WrappedAToken waFee = new WrappedAToken(
            IERC20(address(feeToken)), ICleanversePool(address(pool)), admin, "Wrapped Fee", "waFEE", 18
        );

        deal(address(feeToken), lender, 1_000e18);
        pool.setVerified(lender, true);

        vm.startPrank(lender);
        feeToken.approve(address(waFee), type(uint256).max);
        uint256 minted = waFee.deposit(1_000e18, lender);
        vm.stopPrank();

        // 1% fee => 990 actually arrives. Minting the requested 1000 would create 10 units of
        // wrapped supply with no origin behind it.
        assertEq(minted, 990e18, "minted equals the balance delta, not the requested amount");
        assertEq(waFee.balanceOf(lender), 990e18, "receiver credited the delta");
        assertEq(waFee.totalSupply(), 990e18, "supply matches what is actually held");
        assertGe(
            feeToken.balanceOf(address(waFee)),
            waFee.totalSupply(),
            "INVARIANT: totalSupply is never more than the origin balance backing it"
        );
    }

    /// @notice Every holder must still be able to redeem after a fee-on-transfer deposit — the
    /// property that breaks if `deposit` mints the requested amount instead of the delta.
    function test_feeOnTransfer_allHoldersCanStillRedeem() public {
        FeeOnTransferERC20 feeToken = new FeeOnTransferERC20("feeUSDC", "feeUSDC", 100);
        WrappedAToken waFee = new WrappedAToken(
            IERC20(address(feeToken)), ICleanversePool(address(pool)), admin, "Wrapped Fee", "waFEE", 18
        );

        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        pool.setVerified(alice, true);
        pool.setVerified(bob, true);
        deal(address(feeToken), alice, 1_000e18);
        deal(address(feeToken), bob, 1_000e18);

        vm.startPrank(alice);
        feeToken.approve(address(waFee), type(uint256).max);
        uint256 aliceMinted = waFee.deposit(1_000e18, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        feeToken.approve(address(waFee), type(uint256).max);
        uint256 bobMinted = waFee.deposit(1_000e18, bob);
        vm.stopPrank();

        // Bob redeems first, then Alice. Neither should be blocked by a shortfall.
        vm.prank(bob);
        waFee.withdraw(bobMinted, bob);

        vm.prank(alice);
        waFee.withdraw(aliceMinted, alice);

        assertEq(waFee.totalSupply(), 0, "all wrapped supply redeemed");
    }

    /// @notice A `decimals` that disagrees with the origin silently misprices everything downstream.
    function test_constructor_rejectsDecimalsMismatch() public {
        // `origin` is the 18-decimal test ERC20; claiming 6 must revert.
        vm.expectRevert(abi.encodeWithSelector(WrappedAToken.DecimalsMismatch.selector, uint8(6), uint8(18)));
        new WrappedAToken(IERC20(address(originWithDecimals)), ICleanversePool(address(pool)), admin, "X", "X", 6);
    }

    /// @notice Tokens that omit the optional `decimals()` are still wrappable.
    function test_constructor_allowsOriginWithoutDecimals() public {
        // The repo's bare ERC20 mock has no `decimals()`, so the soft check is skipped.
        WrappedAToken w = new WrappedAToken(
            IERC20(address(origin)), ICleanversePool(address(pool)), admin, "No Decimals", "waND", 6
        );
        assertEq(w.decimals(), 6, "declared decimals accepted when origin omits decimals()");
    }

    /* HELPERS */

    function _waEligible(address who) internal view returns (bool) {
        // Cheap replica of `WrappedAToken._eligible` for the assertions above.
        if (waToken.isExempt(who)) return true;
        if (!pool.isRegistered()) return false;
        if (pool.paused()) return false;
        return pool.verify(who);
    }
}

/* — TEST DOUBLES — */

/// @dev Origin token that skims a fee on every transfer, so the recipient receives less than the
/// sender sent. Models USDT-with-fee-enabled and the deflationary token class generally.
contract FeeOnTransferERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    uint256 public immutable feeBps;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint256 _feeBps) {
        name = n;
        symbol = s;
        feeBps = _feeBps;
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
        return _move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        return _move(from, to, amount);
    }

    function _move(address from, address to, uint256 amount) internal returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        uint256 fee = amount * feeBps / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee; // burn the fee
        return true;
    }
}

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
