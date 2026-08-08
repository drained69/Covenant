// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity ^0.8.0;

import {Market} from "../interfaces/ICovenant.sol";

/// @title EventsLib
/// @notice Every event Covenant emits, declared in one place.
/// @dev Events live in a library rather than on the contract so that indexers, periphery, and tests can
/// import the ABI fragment without depending on `Covenant` itself. The market id parameter is named `id_`
/// with a trailing underscore to avoid colliding with the `id` field that indexers generate for entities.
library EventsLib {
    // forgefmt: disable-start

    /// @notice Emitted once at deployment.
    /// @param roleSetter The deployer, who becomes the initial role setter.
    /// @param initialChainId The chain id captured for stable market id computation.
    event Constructor(address indexed roleSetter, uint256 initialChainId);

    /// @notice Emitted when the role setter is handed over.
    /// @param roleSetter The new role setter.
    event SetRoleSetter(address indexed roleSetter);

    /// @notice Emitted when the fee setter is changed.
    /// @param feeSetter The new fee setter.
    event SetFeeSetter(address indexed feeSetter);

    /// @notice Emitted when the tick-spacing setter is changed.
    /// @param tickSpacingSetter The new tick-spacing setter.
    event SetTickSpacingSetter(address indexed tickSpacingSetter);

    /// @notice Emitted when a market's tick spacing is updated.
    /// @param id_ The market id.
    /// @param newTickSpacing The new spacing between valid ticks.
    event SetMarketTickSpacing(bytes32 indexed id_, uint256 newTickSpacing);

    /// @notice Emitted when one settlement-fee breakpoint of a market is updated.
    /// @param id_ The market id.
    /// @param index Index of the time-to-maturity breakpoint being set.
    /// @param newSettlementFee The new fee at that breakpoint, in centi-basis-points.
    event SetMarketSettlementFee(bytes32 indexed id_, uint256 indexed index, uint256 newSettlementFee);

    /// @notice Emitted when one settlement-fee breakpoint of a loan token's default schedule is updated.
    /// @param loanToken The loan token whose default schedule changed.
    /// @param index Index of the time-to-maturity breakpoint being set.
    /// @param newSettlementFee The new fee at that breakpoint, in centi-basis-points.
    event SetDefaultSettlementFee(address indexed loanToken, uint256 indexed index, uint256 newSettlementFee);

    /// @notice Emitted when the fee claimer is changed.
    /// @param feeClaimer The new fee claimer.
    event SetFeeClaimer(address indexed feeClaimer);

    /// @notice Emitted when a market's continuous fee rate is updated.
    /// @param id_ The market id.
    /// @param newContinuousFee The new per-second rate, scaled by WAD.
    event SetMarketContinuousFee(bytes32 indexed id_, uint256 newContinuousFee);

    /// @notice Emitted when a loan token's default continuous fee rate is updated.
    /// @param loanToken The loan token whose default changed.
    /// @param newContinuousFee The new per-second rate, scaled by WAD.
    event SetDefaultContinuousFee(address indexed loanToken, uint256 newContinuousFee);
    /// @notice Emitted when a position's continuous fee is accrued and its credit adjusted for that accrual.
    /// @param id_ The market id.
    /// @param user The account whose position was touched.
    /// @param creditDecrease Credit units removed from the position to pay the accrued fee.
    /// @param pendingFeeDecrease Continuous-fee liability released from the position.
    /// @param accruedFee Fee amount credited to the market's claimable continuous fee.
    event UpdatePosition(bytes32 indexed id_, address indexed user, uint256 creditDecrease, uint256 pendingFeeDecrease, uint256 accruedFee);

    /// @notice Emitted once per market, when it is first created.
    /// @param market The full market parameters. Their hash is the market id.
    /// @param id_ The market id derived from `market`.
    event MarketCreated(Market market, bytes32 indexed id_);

    /// @notice Emitted when an offer is filled. Named `Take` for indexer compatibility with earlier versions.
    /// @param caller The `msg.sender` that filled the offer.
    /// @param id_ The market id the fill happened in.
    /// @param units Credit/debt units traded.
    /// @param taker The account filling the offer.
    /// @param maker The account whose offer was filled.
    /// @param offerIsBuy True when the maker is the buyer (lender), false when the maker is the seller.
    /// @param group The offer's consumption group, used to track partial fills.
    /// @param buyerAssets Loan tokens paid by the buyer.
    /// @param sellerAssets Loan tokens received by the seller, net of the settlement fee.
    /// @param consumed The group's cumulative consumed amount after this fill.
    /// @param buyerPendingFeeIncrease Continuous-fee liability added to the buyer's position.
    /// @param sellerPendingFeeDecrease Continuous-fee liability released from the seller's position.
    /// @param buyerCreditIncrease Credit units added to the buyer's position.
    /// @param sellerCreditDecrease Credit units burned from the seller's position before debt is created.
    /// @param receiver The account that received the seller's proceeds.
    /// @param payer The account the buyer's loan tokens were pulled from.
    event Take(address caller, bytes32 indexed id_, uint256 units, address indexed taker, address indexed maker, bool offerIsBuy, bytes32 group, uint256 buyerAssets, uint256 sellerAssets, uint256 consumed, uint256 buyerPendingFeeIncrease, uint256 sellerPendingFeeDecrease, uint256 buyerCreditIncrease, uint256 sellerCreditDecrease, address receiver, address payer);

    /// @notice Emitted when credit is redeemed for loan tokens after maturity.
    /// @param caller The `msg.sender` that withdrew.
    /// @param id_ The market id.
    /// @param units Credit units redeemed.
    /// @param onBehalf The account whose credit was reduced.
    /// @param receiver The account that received the loan tokens.
    /// @param pendingFeeDecrease Continuous-fee liability released by this redemption.
    event Withdraw(address caller, bytes32 indexed id_, uint256 units, address indexed onBehalf, address indexed receiver, uint256 pendingFeeDecrease);

    /// @notice Emitted when debt is repaid.
    /// @param caller The `msg.sender` that repaid.
    /// @param id_ The market id.
    /// @param units Debt units repaid.
    /// @param onBehalf The borrower whose debt was reduced.
    /// @param payer The account the loan tokens were pulled from.
    event Repay(address indexed caller, bytes32 indexed id_, uint256 units, address indexed onBehalf, address payer);

    /// @notice Emitted when collateral is supplied.
    /// @param caller The `msg.sender` that supplied.
    /// @param id_ The market id.
    /// @param collateral The collateral token supplied.
    /// @param assets Amount of collateral supplied.
    /// @param onBehalf The account credited with the collateral.
    event SupplyCollateral(address caller, bytes32 indexed id_, address indexed collateral, uint256 assets, address indexed onBehalf);

    /// @notice Emitted when collateral is withdrawn.
    /// @param caller The `msg.sender` that withdrew.
    /// @param id_ The market id.
    /// @param collateral The collateral token withdrawn.
    /// @param assets Amount of collateral withdrawn.
    /// @param onBehalf The account whose collateral was reduced.
    /// @param receiver The account that received the collateral.
    event WithdrawCollateral(address caller, bytes32 indexed id_, address indexed collateral, uint256 assets, address indexed onBehalf, address receiver);
    /// @notice Emitted when collateral is seized from an unhealthy or matured borrower.
    /// @param caller The `msg.sender` that liquidated.
    /// @param id_ The market id.
    /// @param collateral The collateral token seized.
    /// @param seizedAssets Amount of collateral transferred to `receiver`.
    /// @param repaidUnits Debt units repaid by the liquidator.
    /// @param borrower The account that was liquidated.
    /// @param postMaturityMode True when the seizure used the post-maturity incentive ramp.
    /// @param receiver The account that received the seized collateral.
    /// @param payer The account the repayment was pulled from.
    /// @param badDebt Debt units written off and socialized to lenders, zero in a healthy seizure.
    /// @param latestLossFactor The market's loss factor after socializing any bad debt.
    /// @param latestContinuousFeeCredit The market's claimable continuous fee after this seizure.
    event Liquidate(address caller, bytes32 indexed id_, address indexed collateral, uint256 seizedAssets, uint256 repaidUnits, address indexed borrower, bool postMaturityMode, address receiver, address payer, uint256 badDebt, uint256 latestLossFactor, uint256 latestContinuousFeeCredit);

    /// @notice Emitted when an account manually sets the consumed amount of an offer group, cancelling it.
    /// @param caller The `msg.sender` that set the amount.
    /// @param group The offer group being consumed.
    /// @param amount The new cumulative consumed amount.
    /// @param onBehalf The account whose group was updated.
    event SetConsumed(address indexed caller, bytes32 indexed group, uint256 amount, address indexed onBehalf);

    /// @notice Emitted when a flash loan is taken and repaid.
    /// @param caller The `msg.sender` that initiated the flash loan.
    /// @param tokens The tokens lent.
    /// @param assets Amount lent of each token, parallel to `tokens`.
    /// @param callback The contract that received the tokens and repaid them.
    event FlashLoan(address indexed caller, address[] tokens, uint256[] assets, address indexed callback);

    /// @notice Emitted when an account authorizes or deauthorizes another to act on its behalf.
    /// @param caller The `msg.sender` that changed the authorization.
    /// @param authorized The account being authorized or deauthorized.
    /// @param newIsAuthorized The new authorization status.
    /// @param onBehalf The account granting the authorization.
    event SetIsAuthorized(address indexed caller, address indexed authorized, bool newIsAuthorized, address indexed onBehalf);

    /// @notice Emitted when accrued continuous fees are claimed for a market.
    /// @param caller The `msg.sender` that claimed.
    /// @param id_ The market id.
    /// @param amount Credit units claimed.
    /// @param receiver The account that received the claim.
    event ClaimContinuousFee(address indexed caller, bytes32 indexed id_, uint256 amount, address indexed receiver);

    /// @notice Emitted when accrued settlement fees are claimed for a token.
    /// @param caller The `msg.sender` that claimed.
    /// @param token The loan token whose fees were claimed.
    /// @param amount Loan tokens claimed.
    /// @param receiver The account that received the claim.
    event ClaimSettlementFee(address indexed caller, address indexed token, uint256 amount, address indexed receiver);

    /// @notice Emitted when the gate-admin role is assigned or transferred.
    /// @dev Only ever emitted on deployments where `REQUIRE_COMPLIANCE` is true.
    /// @param previousAdmin The outgoing gate admin; zero on the initial assignment at construction.
    /// @param newAdmin The incoming gate admin.
    event GateAdminSet(address indexed previousAdmin, address indexed newAdmin);

    /// @notice Emitted when a gate implementation is approved or revoked for use in new markets.
    /// @dev Revocation does not affect markets already bound to `gate`.
    /// @param gate The gate contract whose approval status changed.
    /// @param approved True if new markets may now bind `gate`, false otherwise.
    event GateApprovalSet(address indexed gate, bool approved);
    // forgefmt: disable-end
}
