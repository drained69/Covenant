// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.5.0;

struct Market {
    address loanToken;
    CollateralParams[] collateralParams;
    uint256 maturity;
    uint256 rcfThreshold;
    address entryGate;
    address seizureGate;
}

struct CollateralParams {
    address token;
    uint256 lltv;
    uint256 maxLif;
    address oracle;
}

/// @notice Off-chain trade quote filled via `fillOffer`. The maker publishes offers off-chain; the taker passes one
/// offer on-chain with `notaryData` proving it is authorized.
/// @dev If `buy` is true, the maker is the buyer (lender) and the taker is the seller (borrower). If false, roles
/// are reversed. Loan-token amounts follow the offer `tick` and the market settlement fee at execution time.
struct Offer {
    /// @notice Market this offer trades in (loan token, collaterals, maturity, gates). Must match the market id used on-chain.
    Market market;
    /// @notice Side of the quote: `true` = maker buys credit (lends); `false` = maker sells credit (borrows).
    bool buy;
    /// @notice Account that signed or notarized the offer; must authorize `notary`.
    address maker;
    /// @notice Earliest timestamp at which the offer can be taken.
    uint256 start;
    /// @notice Latest timestamp at which the offer can be taken.
    uint256 expiry;
    /// @notice Price band for the trade; must be a multiple of the market tick spacing. Converted to WAD price via `TickLib`.
    uint256 tick;
    /// @notice Consumption bucket shared by related offers from the same maker; caps aggregate fills via `consumed[maker][group]`.
    bytes32 group;
    /// @notice Optional contract called on the maker side during `fillOffer` (`onBuy` if `buy`, `onSell` if `!buy`). Zero = no maker callback.
    address callback;
    /// @notice Calldata passed to `callback`.
    bytes callbackData;
    /// @notice Loan-token recipient when the maker is the seller (`!buy`). When `buy`, use `receiverIfTakerIsSeller` on `fillOffer` instead.
    address receiverIfMakerIsSeller;
    /// @notice Contract that validates the offer in `fillOffer` (e.g. signature or on-chain notarization). Must be authorized by `maker`.
    address notary;
    /// @notice If true, the fill must not increase maker credit (buy offers) or maker debt (sell offers).
    bool reduceOnly;
    /// @notice Maximum credit/debt units fillable across this offer's `group` (used when `maxAssets` is zero).
    uint256 maxUnits;
    /// @notice Maximum loan tokens fillable across this `group`: buyer pays if `buy`, seller receives if `!buy` (used when `maxUnits` is zero).
    uint256 maxAssets;
}

/// @dev Settlement fee cbp values and the continuous fee are 0 until the market is created, then set to the default
/// values.
struct MarketState {
    uint128 totalUnits;
    uint128 lossFactor;
    uint128 withdrawable;
    uint128 continuousFeeCredit;
    uint16 settlementFeeCbp0;
    uint16 settlementFeeCbp1;
    uint16 settlementFeeCbp2;
    uint16 settlementFeeCbp3;
    uint16 settlementFeeCbp4;
    uint16 settlementFeeCbp5;
    uint16 settlementFeeCbp6;
    uint32 continuousFee;
    uint8 tickSpacing;
}

/// @notice Per-user state in a market (`position[id][user]`).
/// @dev Lender fields (`credit`, `pendingFee`, `lastLossFactor`, `lastAccrual`) are synced lazily via
/// `updatePosition` / `_updatePosition` except where `fillOffer` patches them on the hot path. Borrower fields (`debt`,
/// `collateral`, `collateralBitmap`) update on `fillOffer`, `repay`, `supplyCollateral`, `withdrawCollateral`, and
/// `seize`. Use `updatePositionView` for slash- and fee-adjusted lender balances.
struct Position {
    /// @notice Lender credit units (zero-coupon claim on the loan token, 1:1 with `withdraw` absent bad debt).
    /// @dev Reduced when bad debt is socialized (`lossFactor` increases) and when continuous fees accrue at update.
    uint128 credit;
    /// @notice Continuous-fee liability still to be paid from `credit` before withdrawal (loan-token equivalent at accrual).
    /// @dev Increased on new credit from `fillOffer`; decreased proportionally when credit is reduced or withdrawn.
    uint128 pendingFee;
    /// @notice Market `lossFactor` snapshot from the user's last `updatePosition` (or initial credit event).
    /// @dev Used with `marketState[id].lossFactor` to apply bad-debt slashes since the last sync.
    uint128 lastLossFactor;
    /// @notice Timestamp of the last continuous-fee accrual checkpoint for this position.
    /// @dev Fee accrual runs from `lastAccrual` to `min(block.timestamp, market.maturity)` in `updatePositionView`.
    uint128 lastAccrual;
    /// @notice Borrower debt units (loan-token principal owed; repaid 1:1 via `repay` or `seize`).
    uint128 debt;
    /// @notice Bitmap of activated collateral indices (bit `i` set iff `collateral[i]` was ever funded and not fully withdrawn).
    /// @dev Set on first `supplyCollateral` to a zero balance; cleared when that index's balance goes to zero.
    uint128 collateralBitmap;
    /// @notice Collateral token balance per market collateral index (only indices in `collateralBitmap` are meaningful).
    uint128[128] collateral;
}

interface ICovenant {
    /// ERRORS ///
    error AlreadyConsumed();
    error LenderIneligible();
    error CannotIncreaseDebtPostMaturity();
    error CollateralParamsNotSorted();
    error ConsumedAssets();
    error ConsumedUnits();
    error ContinuousFeeTooHigh();
    error FeeNotMultipleOfFeeCbp();
    error GateNotApproved(address gate);
    error InconsistentInput();
    error WrongBuyCallbackReturnValue();
    error WrongSellCallbackReturnValue();
    error WrongRepayCallbackReturnValue();
    error WrongLiquidateCallbackReturnValue();
    error WrongFlashLoanCallbackReturnValue();
    error InvalidFeeIndex();
    error InvalidMaxLif();
    error InvalidTickSpacing();
    error SeizerIneligible();
    error LltvNotAllowed();
    error MakerCreditOrDebtIncreased();
    error MaturityTooFar();
    error MultipleNonZero();
    error NoCollateralParams();
    error NotBorrower();
    error NotLiquidatable();
    error MarketLossFactorMaxedOut();
    error MarketNotCreated();
    error MissingComplianceGate();
    error OfferExpired();
    error OfferNotStarted();
    error OnlyFeeClaimer();
    error OnlyFeeSetter();
    error OnlyGateAdmin();
    error OnlyRoleSetter();
    error OnlyTickSpacingSetter();
    error NotaryFail();
    error NotaryUnauthorized();
    error RecoveryCloseFactorConditionsViolated();
    error SelfTake();
    error BorrowerIneligible();
    error SellerIsLiquidatable();
    error TakerUnauthorized();
    error TickNotAccessible();
    error TooManyActivatedCollaterals();
    error TooManyCollateralParams();
    error SettlementFeeTooHigh();
    error Unauthorized();
    error UnhealthyBorrower();

    // forgefmt: disable-start
    /// IMMUTABLES ///
    function INITIAL_CHAIN_ID() external view returns (uint256);
    function REQUIRE_COMPLIANCE() external view returns (bool);

    /// STORAGE GETTERS ///
    function position(bytes32 id, address user) external view returns (uint128 credit, uint128 pendingFee, uint128 lastLossFactor, uint128 lastAccrual, uint128 debt, uint128 collateralBitmap);
    function marketState(bytes32 id) external view returns (uint128 totalUnits, uint128 lossFactor, uint128 withdrawable, uint128 continuousFeeCredit, uint16 settlementFeeCbp0, uint16 settlementFeeCbp1, uint16 settlementFeeCbp2, uint16 settlementFeeCbp3, uint16 settlementFeeCbp4, uint16 settlementFeeCbp5, uint16 settlementFeeCbp6, uint32 continuousFee, uint8 tickSpacing);
    function consumed(address user, bytes32 group) external view returns (uint256);
    function isAuthorized(address authorizer, address authorized) external view returns (bool);
    function defaultSettlementFeeCbp(address loanToken, uint256 index) external view returns (uint16);
    function defaultContinuousFee(address loanToken) external view returns (uint32);
    function claimableSettlementFee(address token) external view returns (uint256);
    function roleSetter() external view returns (address);
    function feeSetter() external view returns (address);
    function feeClaimer() external view returns (address);
    function tickSpacingSetter() external view returns (address);
    function gateAdmin() external view returns (address);
    function isApprovedGate(address gate) external view returns (bool);

    /// MULTICALL ///
    function multicall(bytes[] memory calls) external;

    /// ADMIN FUNCTIONS ///
    function transferGateAdmin(address newGateAdmin) external;
    function setApprovedGate(address gate, bool approved) external;
    function setRoleSetter(address newRoleSetter) external;
    function setFeeSetter(address newFeeSetter) external;
    function setFeeClaimer(address newFeeClaimer) external;
    function setTickSpacingSetter(address newTickSpacingSetter) external;
    function setMarketTickSpacing(bytes32 id, uint256 newTickSpacing) external;
    function setMarketSettlementFee(bytes32 id, uint256 index, uint256 newSettlementFee) external;
    function setDefaultSettlementFee(address loanToken, uint256 index, uint256 newSettlementFee) external;
    function setMarketContinuousFee(bytes32 id, uint256 newContinuousFee) external;
    function setDefaultContinuousFee(address loanToken, uint256 newContinuousFee) external;
    function claimSettlementFee(address token, uint256 amount, address receiver) external;
    function claimContinuousFee(Market memory market, uint256 amount, address receiver) external;

    /// ENTRY-POINTS ///
    function fillOffer(Offer memory offer, bytes memory notaryData, uint256 units, address taker, address receiverIfTakerIsSeller, address takerCallback, bytes memory takerCallbackData) external returns (uint256, uint256);
    function withdraw(Market memory market, uint256 units, address onBehalf, address receiver) external;
    function repay(Market memory market, uint256 units, address onBehalf, address callback, bytes memory data) external;
    function supplyCollateral(Market memory market, uint256 collateralIndex, uint256 assets, address onBehalf) external;
    function withdrawCollateral(Market memory market, uint256 collateralIndex, uint256 assets, address onBehalf, address receiver) external;
    function seize(Market memory market, uint256 collateralIndex, uint256 seizedAssets, uint256 repaidUnits, address borrower, bool postMaturityMode, address receiver, address callback, bytes memory data) external returns (uint256, uint256);
    function setConsumed(bytes32 group, uint256 amount, address onBehalf) external;
    function setIsAuthorized(address authorized, bool newIsAuthorized, address onBehalf) external;
    function flashLoan(address[] memory tokens, uint256[] memory assets, address callback, bytes memory data) external;
    function initMarket(Market memory market) external returns (bytes32);

    /// SLASHING AND CONTINUOUS FEE ACCRUAL ///
    function updatePositionView(Market memory market, bytes32 id, address user) external view returns (uint128, uint128, uint128);
    function updatePosition(Market memory market, address user) external returns (uint128, uint128, uint128);

    /// OTHER VIEW FUNCTIONS ///
    function lastLossFactor(bytes32 id, address user) external view returns (uint128);
    function collateralBitmap(bytes32 id, address user) external view returns (uint128);
    function collateral(bytes32 id, address user, uint256 index) external view returns (uint128);
    function toId(Market memory market) external view returns (bytes32);
    function toMarket(bytes32 id) external view returns (Market memory);
    function creditOf(bytes32 id, address user) external view returns (uint128);
    function debtOf(bytes32 id, address user) external view returns (uint128);
    function totalUnits(bytes32 id) external view returns (uint128);
    function lossFactor(bytes32 id) external view returns (uint128);
    function tickSpacing(bytes32 id) external view returns (uint8);
    function withdrawable(bytes32 id) external view returns (uint128);
    function settlementFeeCbps(bytes32 id) external view returns (uint16[7] memory);
    function continuousFee(bytes32 id) external view returns (uint32);
    function continuousFeeCredit(bytes32 id) external view returns (uint128);
    function pendingFee(bytes32 id, address user) external view returns (uint128);
    function lastAccrual(bytes32 id, address user) external view returns (uint128);
    function liquidationLocked(bytes32 id, address user) external view returns (bool);
    function isHealthy(Market memory market, bytes32 id, address borrower) external view returns (bool);
    function settlementFee(bytes32 id, uint256 timeToMaturity) external view returns (uint256);
    // forgefmt: disable-end
}
