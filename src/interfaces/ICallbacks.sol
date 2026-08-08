// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

import {Market} from "./ICovenant.sol";

// forgefmt: disable-start

/// @title IBuyCallback
/// @notice Optional hook invoked on the buyer (lender) side during `fillOffer`.
/// @dev Called after the position and market state have been updated, but *before* Covenant pulls the buyer's
/// loan tokens. This ordering makes the callback the natural place to source those tokens just-in-time, for
/// example by unwinding another position or borrowing elsewhere. Every callback in this file must return
/// `CALLBACK_SUCCESS` (`keccak256("covenant.callbackSuccess")`); returning anything else — including reverting
/// or having no code — makes `fillOffer` revert, so a contract cannot be used as a callback by accident.
interface IBuyCallback {
    /// @notice Called on the buyer's designated callback during `fillOffer`.
    /// @param id The market id the offer was filled in.
    /// @param market The full market parameters corresponding to `id`.
    /// @param buyerAssets Loan tokens the buyer pays for this fill; pulled from the payer right after this call.
    /// @param units Credit units bought.
    /// @param pendingFeeIncrease Continuous-fee liability added to the buyer's position by this fill.
    /// @param buyer The account whose credit increased.
    /// @param data Calldata supplied by whichever side registered this callback (`offer.callbackData` when the
    /// maker is the buyer, otherwise the taker's callback data).
    /// @return The `CALLBACK_SUCCESS` magic value.
    function onBuy(bytes32 id, Market memory market, uint256 buyerAssets, uint256 units, uint256 pendingFeeIncrease, address buyer, bytes memory data) external returns (bytes32);
}

/// @title ISellCallback
/// @notice Optional hook invoked on the seller (borrower) side during `fillOffer`.
/// @dev Called after the seller's loan tokens have already been transferred to `receiver`, so the proceeds are
/// available to spend inside the callback — typically to supply collateral for the debt just created. The
/// seller's health is only enforced *after* this call returns, which is what makes borrow-then-collateralize
/// possible in a single transaction. Liquidation of the seller is locked for the duration of the fill.
interface ISellCallback {
    /// @notice Called on the seller's designated callback during `fillOffer`.
    /// @param id The market id the offer was filled in.
    /// @param market The full market parameters corresponding to `id`.
    /// @param sellerAssets Loan tokens already sent to `receiver` for this fill, net of the settlement fee.
    /// @param units Debt units sold.
    /// @param pendingFeeDecrease Continuous-fee liability released from the seller's position by this fill.
    /// @param seller The account whose debt increased or credit decreased.
    /// @param receiver The account that received `sellerAssets`.
    /// @param data Calldata supplied by whichever side registered this callback (`offer.callbackData` when the
    /// maker is the seller, otherwise the taker's callback data).
    /// @return The `CALLBACK_SUCCESS` magic value.
    function onSell(bytes32 id, Market memory market, uint256 sellerAssets, uint256 units, uint256 pendingFeeDecrease, address seller, address receiver, bytes memory data) external returns (bytes32);
}

/// @title ILiquidateCallback
/// @notice Optional hook invoked during `seize`, which also designates the callback as the loan-token payer.
/// @dev Called after the seized collateral has been transferred to `receiver` but before the repaid loan tokens
/// are pulled from the callback. This lets a liquidator sell the collateral it just received and repay out of
/// the proceeds, so liquidations need no upfront capital. `badDebt` reports the shortfall socialized to lenders
/// by this seizure, which is non-zero only when the borrower's collateral could not cover the debt.
interface ILiquidateCallback {
    /// @notice Called on the liquidator's designated callback during `seize`.
    /// @param caller The `msg.sender` that initiated the seizure.
    /// @param id The market id the seizure happened in.
    /// @param market The full market parameters corresponding to `id`.
    /// @param collateralIndex Index into `market.collateralParams` of the collateral seized.
    /// @param seizedAssets Collateral already transferred to `receiver`.
    /// @param repaidUnits Debt units repaid; pulled from this callback right after the call returns.
    /// @param borrower The account that was liquidated.
    /// @param receiver The account that received `seizedAssets`.
    /// @param data Calldata forwarded from the `seize` caller.
    /// @param badDebt Debt units written off and socialized to lenders via `lossFactor`, zero in a healthy seizure.
    /// @return The `CALLBACK_SUCCESS` magic value.
    function onLiquidate(address caller, bytes32 id, Market memory market, uint256 collateralIndex, uint256 seizedAssets, uint256 repaidUnits, address borrower, address receiver, bytes memory data, uint256 badDebt) external returns (bytes32);
}

/// @title IRepayCallback
/// @notice Optional hook invoked during `repay`, which also designates the callback as the loan-token payer.
/// @dev Called after the borrower's debt has been reduced but before the loan tokens are pulled, so the callback
/// can free collateral against the now-smaller debt and use it to fund the repayment.
interface IRepayCallback {
    /// @notice Called on the repayer's designated callback during `repay`.
    /// @param id The market id the repayment happened in.
    /// @param market The full market parameters corresponding to `id`.
    /// @param units Debt units repaid; pulled from this callback right after the call returns.
    /// @param onBehalf The borrower whose debt was reduced.
    /// @param data Calldata forwarded from the `repay` caller.
    /// @return The `CALLBACK_SUCCESS` magic value.
    function onRepay(bytes32 id, Market memory market, uint256 units, address onBehalf, bytes memory data) external returns (bytes32);
}

/// @title IFlashLoanCallback
/// @notice Hook invoked during `flashLoan`; the callback both receives the loan and repays it.
/// @dev Covenant transfers every requested token to the callback, calls it once, then pulls the exact same
/// amounts back via `transferFrom`. There is no flash-loan fee, so the callback must simply leave the borrowed
/// amounts approved to Covenant before returning. Borrowed funds are unencumbered protocol liquidity, so a
/// flash loan cannot be used to withdraw more than the protocol holds.
interface IFlashLoanCallback {
    /// @notice Called after the flash-loaned tokens have been sent to this contract.
    /// @param caller The `msg.sender` that initiated the flash loan.
    /// @param tokens The ERC-20 tokens lent.
    /// @param assets Amount lent of each token, parallel to `tokens`; the same amounts are pulled back on return.
    /// @param data Calldata forwarded from the `flashLoan` caller.
    /// @return The `CALLBACK_SUCCESS` magic value.
    function onFlashLoan(address caller, address[] memory tokens, uint256[] memory assets, bytes memory data) external returns (bytes32);
}
// forgefmt: disable-end
