// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {UtilsLib} from "./libraries/UtilsLib.sol";
import {IdLib} from "./libraries/IdLib.sol";
import {TickLib} from "./libraries/TickLib.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";
import {EventsLib} from "./libraries/EventsLib.sol";
import "./libraries/ConstantsLib.sol"; // forge-lint: disable-line(unaliased-plain-import)
import "./interfaces/ICallbacks.sol"; // forge-lint: disable-line(unaliased-plain-import)
import {IOracle} from "./interfaces/IOracle.sol";
import {INotary} from "./interfaces/INotary.sol";
import {IEnterGate, ILiquidatorGate} from "./interfaces/IGate.sol";
import {ICovenant, Market, Offer, CollateralParams, MarketState, Position} from "./interfaces/ICovenant.sol";

/// @title Covenant
/// @author Covenant Team
/// @notice A singleton, immutable, fixed-maturity lending protocol. Every market is a zero-coupon credit
/// market: lenders buy credit units that redeem 1:1 for loan tokens at maturity, and borrowers sell those
/// units at a discount, paying the difference as interest. There is no interest-rate model — the price is
/// set by whoever fills the offer, at a tick.
/// @dev Terms are agreed off-chain as an `Offer` and settled on-chain by `fillOffer`. Covenant does not
/// interpret offer authorization itself: each offer names an `INotary` that the maker has authorized, and
/// that notary decides what a valid signature, Merkle proof, or wallet approval looks like. A market's
/// identity is the hash of its full `Market` struct, so its loan token, maturity, tick spacing, oracles,
/// LLTVs, and gates can never be mutated — changing any of them yields a different market.
///
/// Positions carry both sides in one struct: `credit` (a lender's claim), `debt` (a borrower's liability),
/// and per-collateral balances tracked through a bitmap so iteration stays bounded. Solvency is checked
/// against `IOracle` prices at `ORACLE_PRICE_SCALE`, and an unhealthy borrower can be liquidated by `seize`
/// for a bonus set by the market's liquidation incentive factor. Shortfalls that collateral cannot cover
/// are socialized to that market's lenders through `lossFactor`, which is applied lazily on next touch.
///
/// Two fees exist and are independent: a settlement fee taken from the seller's proceeds at fill time,
/// scaled by remaining time to maturity across seven breakpoints, and a continuous fee that accrues per
/// second on outstanding credit. Both are claimed separately and neither is charged on flash loans.
///
/// External hooks — the callbacks in `ICallbacks`, the notary, and the gates — are the only places control
/// leaves this contract. Callbacks must return `CALLBACK_SUCCESS` or the whole call reverts, so a contract
/// cannot become a callback by accident; gates are called with a bounded gas stipend and fail closed.
contract Covenant is ICovenant {
    using UtilsLib for uint256;
    using UtilsLib for uint128;

    /// IMMUTABLES ///

    /// @notice Chain id captured at deployment; used for stable market id computation.
    uint256 public immutable INITIAL_CHAIN_ID;

    /// @notice Whether every new market MUST bind a whitelisted, non-zero compliance gate.
    /// @dev Immutable at construction. `false` reproduces the underlying permissionless behavior (kept
    /// for parity with existing tests and for jurisdictions that don't require compliance). `true` enforces
    /// that Covenant is compliance-native: no non-gated market can ever exist on this deployment.
    bool public immutable REQUIRE_COMPLIANCE;

    /// STORAGE ///

    mapping(bytes32 id => mapping(address user => Position)) public position;
    mapping(bytes32 id => MarketState) public marketState;
    mapping(address user => mapping(bytes32 group => uint256)) public consumed;
    mapping(address authorizer => mapping(address authorized => bool)) public isAuthorized;
    mapping(address loanToken => uint16[7]) public defaultSettlementFeeCbp;
    mapping(address loanToken => uint32) public defaultContinuousFee;
    mapping(address token => uint256) public claimableSettlementFee;
    address public roleSetter;
    address public feeSetter;
    address public feeClaimer;
    address public tickSpacingSetter;

    /// @notice The account permitted to add/remove approved gate implementations. Meaningful only when
    /// `REQUIRE_COMPLIANCE` is true.
    address public gateAdmin;

    /// @notice Whether a given gate contract is approved for use in new markets.
    /// @dev Enforced in `initMarket` when `REQUIRE_COMPLIANCE` is true. Deliberately admin-controlled:
    /// arbitrary compliance contracts must not be swappable in by anyone, or a bogus gate could quietly
    /// let non-compliant participants trade.
    mapping(address gate => bool approved) public isApprovedGate;

    /// CONSTRUCTOR ///

    /// @notice Initializes the protocol and sets the deployer as role setter.
    /// @dev Captures `INITIAL_CHAIN_ID` for stable market id computation across hard forks.
    /// @param requireCompliance Toggle for the gate-whitelist enforcement in `initMarket`.
    /// @param _gateAdmin Address that manages the approved-gate list. Only read when
    /// `requireCompliance == true`; may be zero otherwise.
    constructor(bool requireCompliance, address _gateAdmin) {
        roleSetter = msg.sender;
        INITIAL_CHAIN_ID = block.chainid;
        REQUIRE_COMPLIANCE = requireCompliance;
        if (requireCompliance) {
            require(_gateAdmin != address(0), OnlyGateAdmin());
            gateAdmin = _gateAdmin;
            emit EventsLib.GateAdminSet(address(0), _gateAdmin);
        }
        emit EventsLib.Constructor(msg.sender, INITIAL_CHAIN_ID);
    }

    /// COMPLIANCE GATE ADMIN ///

    /// @notice Transfers the gate-admin role.
    /// @param newGateAdmin The account that will manage the approved-gate list. Must be non-zero.
    function transferGateAdmin(address newGateAdmin) external {
        require(msg.sender == gateAdmin, OnlyGateAdmin());
        require(newGateAdmin != address(0), OnlyGateAdmin());
        emit EventsLib.GateAdminSet(gateAdmin, newGateAdmin);
        gateAdmin = newGateAdmin;
    }

    /// @notice Approves (or revokes) a gate implementation for use in `initMarket`.
    /// @dev Revoking `approved = false` on a live gate does NOT retroactively invalidate existing markets
    /// bound to it — those keep transacting under the gate they were created with. The revocation only
    /// prevents NEW markets from binding it.
    /// @param gate The gate contract whose approval status is being set.
    /// @param approved True to allow new markets to bind `gate`, false to prevent it.
    function setApprovedGate(address gate, bool approved) external {
        require(msg.sender == gateAdmin, OnlyGateAdmin());
        isApprovedGate[gate] = approved;
        emit EventsLib.GateApprovalSet(gate, approved);
    }

    /// MULTICALL ///

    /// @notice Executes a batch of calls to this contract via delegatecall.
    /// @dev Reverts if any sub-call reverts. Each sub-call must satisfy that function's authorization rules.
    /// @param calls ABI-encoded function calls targeting this contract.
    function multicall(bytes[] calldata calls) external {
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory returnData) = address(this).delegatecall(calls[i]);
            if (!success) {
                assembly ("memory-safe") {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            }
        }
    }

    /// ADMIN FUNCTIONS ///

    /// @notice Transfers the role-setter privilege.
    /// @param newRoleSetter Account that may assign fee claimer, fee setter, and tick spacing setter.
    function setRoleSetter(address newRoleSetter) external {
        require(msg.sender == roleSetter, OnlyRoleSetter());
        roleSetter = newRoleSetter;
        emit EventsLib.SetRoleSetter(newRoleSetter);
    }

    /// @notice Assigns the account that may configure settlement and continuous fees.
    /// @param newFeeSetter New fee setter address.
    function setFeeSetter(address newFeeSetter) external {
        require(msg.sender == roleSetter, OnlyRoleSetter());
        feeSetter = newFeeSetter;
        emit EventsLib.SetFeeSetter(newFeeSetter);
    }

    /// @notice Assigns the account that may claim protocol fees.
    /// @dev The previous claimer forfeits any unclaimed fees.
    /// @param newFeeClaimer New fee claimer address.
    function setFeeClaimer(address newFeeClaimer) external {
        require(msg.sender == roleSetter, OnlyRoleSetter());
        feeClaimer = newFeeClaimer;
        emit EventsLib.SetFeeClaimer(newFeeClaimer);
    }

    /// @notice Assigns the account that may decrease per-market tick spacing.
    /// @param newTickSpacingSetter New tick spacing setter address.
    function setTickSpacingSetter(address newTickSpacingSetter) external {
        require(msg.sender == roleSetter, OnlyRoleSetter());
        tickSpacingSetter = newTickSpacingSetter;
        emit EventsLib.SetTickSpacingSetter(newTickSpacingSetter);
    }

    /// @notice Decreases the tick spacing of an existing market.
    /// @dev New spacing must divide the current spacing; only unlocks finer ticks, never removes accessible ones.
    /// @param id Market identifier.
    /// @param newTickSpacing New tick spacing; must be a positive divisor of the current spacing.
    function setMarketTickSpacing(bytes32 id, uint256 newTickSpacing) external {
        require(msg.sender == tickSpacingSetter, OnlyTickSpacingSetter());
        require(marketState[id].tickSpacing > 0, MarketNotCreated());
        require(newTickSpacing > 0 && marketState[id].tickSpacing % newTickSpacing == 0, InvalidTickSpacing());
        // forge-lint: disable-next-line(unsafe-typecast) as newTickSpacing <= DEFAULT_TICK_SPACING < type(uint8).max
        marketState[id].tickSpacing = uint8(newTickSpacing);
        emit EventsLib.SetMarketTickSpacing(id, newTickSpacing);
    }

    /// @notice Overrides a settlement-fee breakpoint for a specific market.
    /// @dev Breakpoint indices: 0=0d, 1=1d, 2=7d, 3=30d, 4=90d, 5=180d, 6=360d. Fee is in WAD and must be a multiple of `CBP`.
    /// @param id Market identifier.
    /// @param index Breakpoint index in `[0, 6]`.
    /// @param newSettlementFee Per-unit settlement fee spread at the breakpoint, in WAD.
    function setMarketSettlementFee(bytes32 id, uint256 index, uint256 newSettlementFee) external {
        MarketState storage _marketState = marketState[id];
        require(msg.sender == feeSetter, OnlyFeeSetter());
        require(index <= 6, InvalidFeeIndex());
        require(newSettlementFee <= maxSettlementFee(index), SettlementFeeTooHigh());
        require(newSettlementFee % CBP == 0, FeeNotMultipleOfFeeCbp());
        require(_marketState.tickSpacing > 0, MarketNotCreated());
        // forge-lint: disable-next-item(unsafe-typecast) as newSettlementFee <= maxSettlementFee <= uint16.max * CBP
        uint16 newSettlementFeeCbp = uint16(newSettlementFee / CBP);
        if (index == 0) _marketState.settlementFeeCbp0 = newSettlementFeeCbp;
        else if (index == 1) _marketState.settlementFeeCbp1 = newSettlementFeeCbp;
        else if (index == 2) _marketState.settlementFeeCbp2 = newSettlementFeeCbp;
        else if (index == 3) _marketState.settlementFeeCbp3 = newSettlementFeeCbp;
        else if (index == 4) _marketState.settlementFeeCbp4 = newSettlementFeeCbp;
        else if (index == 5) _marketState.settlementFeeCbp5 = newSettlementFeeCbp;
        else if (index == 6) _marketState.settlementFeeCbp6 = newSettlementFeeCbp;
        emit EventsLib.SetMarketSettlementFee(id, index, newSettlementFee);
    }

    /// @notice Sets the default settlement-fee breakpoint applied when new markets are created for a loan token.
    /// @param loanToken Loan token whose default fee curve is updated.
    /// @param index Breakpoint index in `[0, 6]`.
    /// @param newSettlementFee Per-unit settlement fee spread at the breakpoint, in WAD.
    function setDefaultSettlementFee(address loanToken, uint256 index, uint256 newSettlementFee) external {
        require(msg.sender == feeSetter, OnlyFeeSetter());
        require(index <= 6, InvalidFeeIndex());
        require(newSettlementFee <= maxSettlementFee(index), SettlementFeeTooHigh());
        require(newSettlementFee % CBP == 0, FeeNotMultipleOfFeeCbp());
        // forge-lint: disable-next-item(unsafe-typecast) as newSettlementFee <= maxSettlementFee <= uint16.max * CBP
        defaultSettlementFeeCbp[loanToken][index] = uint16(newSettlementFee / CBP);
        emit EventsLib.SetDefaultSettlementFee(loanToken, index, newSettlementFee);
    }

    /// @notice Overrides the continuous fee rate for a specific market.
    /// @dev Does not retroactively update pending fees of existing lenders.
    /// @param id Market identifier.
    /// @param newContinuousFee Continuous fee rate in WAD per second until maturity.
    function setMarketContinuousFee(bytes32 id, uint256 newContinuousFee) external {
        MarketState storage _marketState = marketState[id];
        require(msg.sender == feeSetter, OnlyFeeSetter());
        require(newContinuousFee <= MAX_CONTINUOUS_FEE, ContinuousFeeTooHigh());
        require(_marketState.tickSpacing > 0, MarketNotCreated());
        // forge-lint: disable-next-line(unsafe-typecast) as newContinuousFee <= MAX_CONTINUOUS_FEE < type(uint32).max
        _marketState.continuousFee = uint32(newContinuousFee);
        emit EventsLib.SetMarketContinuousFee(id, newContinuousFee);
    }

    /// @notice Sets the default continuous fee applied when new markets are created for a loan token.
    /// @param loanToken Loan token whose default continuous fee is updated.
    /// @param newContinuousFee Continuous fee rate in WAD per second until maturity.
    function setDefaultContinuousFee(address loanToken, uint256 newContinuousFee) external {
        require(msg.sender == feeSetter, OnlyFeeSetter());
        require(newContinuousFee <= MAX_CONTINUOUS_FEE, ContinuousFeeTooHigh());
        // forge-lint: disable-next-line(unsafe-typecast) as newContinuousFee <= MAX_CONTINUOUS_FEE < type(uint32).max
        defaultContinuousFee[loanToken] = uint32(newContinuousFee);
        emit EventsLib.SetDefaultContinuousFee(loanToken, newContinuousFee);
    }

    /// @notice Transfers accumulated settlement fees to a receiver.
    /// @param token Loan token whose settlement fees are claimed.
    /// @param amount Fee amount to claim.
    /// @param receiver Recipient of the loan tokens.
    function claimSettlementFee(address token, uint256 amount, address receiver) external {
        require(msg.sender == feeClaimer, OnlyFeeClaimer());
        claimableSettlementFee[token] -= amount;
        emit EventsLib.ClaimSettlementFee(msg.sender, token, amount, receiver);
        SafeTransferLib.safeTransfer(token, receiver, amount);
    }

    /// @notice Transfers accumulated continuous fees to a receiver by reducing market units and withdrawable.
    /// @param market Market whose accrued continuous fees are claimed.
    /// @param amount Fee amount to claim in loan tokens.
    /// @param receiver Recipient of the loan tokens.
    function claimContinuousFee(Market memory market, uint256 amount, address receiver) external {
        bytes32 id = toId(market);
        MarketState storage _marketState = marketState[id];
        require(msg.sender == feeClaimer, OnlyFeeClaimer());
        require(_marketState.tickSpacing > 0, MarketNotCreated());

        _marketState.continuousFeeCredit -= UtilsLib.toUint128(amount);
        _marketState.totalUnits -= UtilsLib.toUint128(amount);
        _marketState.withdrawable -= UtilsLib.toUint128(amount);

        emit EventsLib.ClaimContinuousFee(msg.sender, id, amount, receiver);

        SafeTransferLib.safeTransfer(market.loanToken, receiver, amount);
    }

    /// @notice Grants or revokes authorization for `authorized` to act on behalf of `onBehalf`.
    /// @dev See AUTHORIZATIONS section above. Callable by `onBehalf` or an account already authorized by `onBehalf`.
    /// @param authorized Delegate whose access is updated.
    /// @param newIsAuthorized Whether `authorized` may act on behalf of `onBehalf`.
    /// @param onBehalf Account delegating access.
    function setIsAuthorized(address authorized, bool newIsAuthorized, address onBehalf) external {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        isAuthorized[onBehalf][authorized] = newIsAuthorized;
        emit EventsLib.SetIsAuthorized(msg.sender, authorized, newIsAuthorized, onBehalf);
    }

    /// ENTRY-POINTS ///

    /// @notice Fills an off-chain offer, updating credit/debt positions and settling loan tokens.
    /// @dev If `offer.buy`, the maker is the buyer and `taker` is the seller; otherwise the roles are swapped.
    /// @dev The taker might not get the price they expected if the settlement fee was just changed. A smart-contract
    /// can be used to perform atomic price checks.
    /// @dev Taking buy offers with price < settlement fee will revert.
    /// @dev In particular, if the settlement fee gets increased, it might implicitly cancel offers with very low price.     
    /// @dev All sellerAssets are reachable with the units input, and all buyerAssets are reachable only if buyerPrice
    /// <= WAD.
    /// @dev The seller cannot be liquidated during the callbacks of a fillOffer.
    /// @param offer Off-chain offer to fill. Must be notarized, within its time bounds, and respect tick spacing,
    /// consumption limits, and optional `reduceOnly` / entry-gate constraints.
    /// @param notaryData Opaque data forwarded to `offer.notary` to prove the offer is authorized.
    /// @param units Credit/debt units to trade. Also drives asset amounts via the offer tick and settlement fee.
    /// @param taker Counterparty to the maker. Must be `msg.sender` or authorized by `taker` via `isAuthorized`.
    /// @param receiverIfTakerIsSeller Loan-token recipient when `taker` is the seller (`offer.buy == true`). Ignored
    /// when the maker is the seller (`offer.receiverIfMakerIsSeller` is used instead).
    /// @param takerCallback Optional callback on the taker side. Used as the buy callback when `!offer.buy`, and as the
    /// sell callback when `offer.buy`. If set, it may also act as the loan-token payer on the buy side.
    /// @param takerCallbackData Calldata passed to `takerCallback`.
    /// @return buyerAssets Loan tokens paid by the buyer, including the settlement-fee portion retained by the protocol.
    /// @return sellerAssets Loan tokens paid out to the seller (or their designated receiver).
    function fillOffer(
        Offer memory offer,
        bytes memory notaryData,
        uint256 units,
        address taker,
        address receiverIfTakerIsSeller,
        address takerCallback, 
        bytes memory takerCallbackData //
    ) external returns (uint256, uint256) { 
        require(taker == msg.sender || isAuthorized[taker][msg.sender], TakerUnauthorized());
        bytes32 id = initMarket(offer.market);
        MarketState storage _marketState = marketState[id];
        require(_marketState.lossFactor < type(uint128).max, MarketLossFactorMaxedOut());
        require(UtilsLib.atMostOneNonZero(offer.maxAssets, offer.maxUnits), MultipleNonZero());
        require(offer.tick % _marketState.tickSpacing == 0, TickNotAccessible());
        require(block.timestamp >= offer.start, OfferNotStarted());
        require(block.timestamp <= offer.expiry, OfferExpired());
        require(offer.maker != taker, SelfTake());
        require(isAuthorized[offer.maker][offer.notary], NotaryUnauthorized());
        require(INotary(offer.notary).isNotarized(offer, notaryData) == CALLBACK_SUCCESS, NotaryFail());

        //base quote price
        uint256 offerPrice = TickLib.tickToPrice(offer.tick);
        uint256 timeToMaturity = UtilsLib.zeroFloorSub(offer.market.maturity, block.timestamp);
        uint256 _settlementFee = settlementFee(id, timeToMaturity);

        // checks the value of the UNITS going to both the taker and the maker
        uint256 sellerPrice = offer.buy ? offerPrice - _settlementFee : offerPrice;
        uint256 buyerPrice = sellerPrice + _settlementFee;
        uint256 buyerAssets = offer.buy ? units.mulDivDown(buyerPrice, WAD) : units.mulDivUp(buyerPrice, WAD);
        uint256 sellerAssets = offer.buy ? units.mulDivDown(sellerPrice, WAD) : units.mulDivUp(sellerPrice, WAD);

        uint256 newConsumed;
        // checks if the taker is trying to fillOffer more than the maxAssets or maxUnits
        if (offer.maxAssets > 0) {
            newConsumed = consumed[offer.maker][offer.group] += offer.buy ? buyerAssets : sellerAssets;
            require(newConsumed <= offer.maxAssets, ConsumedAssets());
        } else {
            newConsumed = consumed[offer.maker][offer.group] += units;
            require(newConsumed <= offer.maxUnits, ConsumedUnits());
        }

        (address buyer, address seller) = offer.buy ? (offer.maker, taker) : (taker, offer.maker);
        Position storage buyerPos = position[id][buyer];
        Position storage sellerPos = position[id][seller];
        
        // updates position if credit > 0
        if (hasCredit(id, buyer) || units > buyerPos.debt) _updatePosition(offer.market, id, buyer); //lender
        if (hasCredit(id, seller)) _updatePosition(offer.market, id, seller); //borrower

        // Net new lender credit: fill closes buyer debt first, then any remainder becomes credit.
        uint256 buyerCreditIncrease = UtilsLib.zeroFloorSub(units, buyerPos.debt); // 
        // Credit the seller burns first when selling units (exit lend / roll before new debt).
        uint256 sellerCreditDecrease = UtilsLib.min(units, sellerPos.credit);
        // Residual units after burning seller credit become new borrower debt.
        uint256 sellerDebtIncrease = units - sellerCreditDecrease;
        // Reserve continuous fee on newly opened credit through maturity (locked in pendingFee).
        uint128 buyerPendingFeeIncrease =
            UtilsLib.toUint128(buyerCreditIncrease.mulDivDown(_marketState.continuousFee * timeToMaturity, WAD));
        // Release the seller's pending fee proportionally to credit burned this fill.
        uint128 sellerPendingFeeDecrease = sellerPos.credit > 0
            ? UtilsLib.toUint128(sellerPos.pendingFee.mulDivUp(sellerCreditDecrease, sellerPos.credit))
            : 0;

        require(block.timestamp <= offer.market.maturity || sellerDebtIncrease == 0, CannotIncreaseDebtPostMaturity());
        require(
            !offer.reduceOnly || (offer.buy ? buyerCreditIncrease == 0 : sellerDebtIncrease == 0),
            MakerCreditOrDebtIncreased()
        ); 

        require(
            offer.market.entryGate == address(0) || buyerCreditIncrease == 0
                || IEnterGate(offer.market.entryGate).canIncreaseCredit(buyer),
            LenderIneligible()
        );
        require(
            offer.market.entryGate == address(0) || sellerDebtIncrease == 0
                || IEnterGate(offer.market.entryGate).canIncreaseDebt(seller),
            BorrowerIneligible()
        );

        buyerPos.debt -= UtilsLib.toUint128(units - buyerCreditIncrease);
        buyerPos.pendingFee += buyerPendingFeeIncrease;
        buyerPos.credit += UtilsLib.toUint128(buyerCreditIncrease);

        sellerPos.pendingFee -= sellerPendingFeeDecrease;
        sellerPos.credit -= UtilsLib.toUint128(sellerCreditDecrease);
        sellerPos.debt += UtilsLib.toUint128(sellerDebtIncrease);

        _marketState.totalUnits =
            UtilsLib.toUint128(_marketState.totalUnits + buyerCreditIncrease - sellerCreditDecrease);
        claimableSettlementFee[offer.market.loanToken] += buyerAssets - sellerAssets;

        address buyerCallback = offer.buy ? offer.callback : takerCallback;
        address sellerCallback = offer.buy ? takerCallback : offer.callback;
        address payer = buyerCallback != address(0) ? buyerCallback : (offer.buy ? buyer : msg.sender);
        address receiver = offer.buy ? receiverIfTakerIsSeller : offer.receiverIfMakerIsSeller;

        emit EventsLib.Take(
            msg.sender,
            id,
            units,
            taker,
            offer.maker,
            offer.buy,
            offer.group,
            buyerAssets,
            sellerAssets,
            newConsumed,
            buyerPendingFeeIncrease,
            sellerPendingFeeDecrease,
            buyerCreditIncrease,
            sellerCreditDecrease,
            receiver,
            payer
        );

        bool wasLocked = UtilsLib.tExchange(LIQUIDATION_LOCK_SLOT, id, seller, true);
        if (buyerCallback != address(0)) {
            bytes memory buyerCallbackData = offer.buy ? offer.callbackData : takerCallbackData;
            require(
                IBuyCallback(buyerCallback)
                    .onBuy(id, offer.market, buyerAssets, units, buyerPendingFeeIncrease, buyer, buyerCallbackData)
                == CALLBACK_SUCCESS,
                WrongBuyCallbackReturnValue()
            );
        }

        SafeTransferLib.safeTransferFrom(offer.market.loanToken, payer, address(this), buyerAssets - sellerAssets);
        SafeTransferLib.safeTransferFrom(offer.market.loanToken, payer, receiver, sellerAssets);

        if (sellerCallback != address(0)) {
            bytes memory sellerCallbackData = offer.buy ? takerCallbackData : offer.callbackData;
            require(
                ISellCallback(sellerCallback)
                    .onSell(
                        id,
                        offer.market,
                        sellerAssets,
                        units,
                        sellerPendingFeeDecrease,
                        seller,
                        receiver,
                        sellerCallbackData
                    ) == CALLBACK_SUCCESS,
                WrongSellCallbackReturnValue()
            );
        }
        if (!wasLocked) UtilsLib.tExchange(LIQUIDATION_LOCK_SLOT, id, seller, false);
        require(liquidationLocked(id, seller) || isHealthy(offer.market, id, seller), SellerIsLiquidatable());

        return (buyerAssets, sellerAssets);
    }

    /// @notice Burns credit units and withdraws the corresponding loan tokens.
    /// @dev Slashes bad debt and accrues continuous fees before burning. Requires authorization for `onBehalf`.
    /// @param market The market to withdraw from.
    /// @param units Credit units to burn and withdraw (1:1 with loan tokens absent bad debt).
    /// @param onBehalf Owner of the credit position.
    /// @param receiver Recipient of the loan tokens.
    function withdraw(Market memory market, uint256 units, address onBehalf, address receiver) external {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        bytes32 id = initMarket(market);
        MarketState storage _marketState = marketState[id];
        _updatePosition(market, id, onBehalf);

        Position storage _position = position[id][onBehalf];
        uint128 pendingFeeDecrease;
        if (_position.credit > 0) {
            pendingFeeDecrease = UtilsLib.toUint128(_position.pendingFee.mulDivUp(units, _position.credit));
            _position.pendingFee -= pendingFeeDecrease;
        }
        _position.credit -= UtilsLib.toUint128(units);
        _marketState.withdrawable -= UtilsLib.toUint128(units);
        _marketState.totalUnits -= UtilsLib.toUint128(units);

        emit EventsLib.Withdraw(msg.sender, id, units, onBehalf, receiver, pendingFeeDecrease);

        SafeTransferLib.safeTransfer(market.loanToken, receiver, units);
    }

    /// @notice Repays debt units by transferring loan tokens to the protocol.
    /// @dev Increases market withdrawable, making loan tokens available to lenders. Optional callback may act as payer.
    /// @param market The market to repay in.
    /// @param units Debt units to repay.
    /// @param onBehalf Borrower whose debt is reduced.
    /// @param callback Optional `IRepayCallback` that returns `CALLBACK_SUCCESS` and acts as the loan-token payer.
    /// @param data Calldata forwarded to `callback`.
    function repay(Market memory market, uint256 units, address onBehalf, address callback, bytes calldata data)
        external
    {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        bytes32 id = initMarket(market);

        position[id][onBehalf].debt -= UtilsLib.toUint128(units);
        marketState[id].withdrawable += UtilsLib.toUint128(units);

        address payer = callback != address(0) ? callback : msg.sender;
        emit EventsLib.Repay(msg.sender, id, units, onBehalf, payer);

        if (callback != address(0)) {
            require(
                IRepayCallback(callback).onRepay(id, market, units, onBehalf, data) == CALLBACK_SUCCESS,
                WrongRepayCallbackReturnValue()
            );
        }
        SafeTransferLib.safeTransferFrom(market.loanToken, payer, address(this), units);
    }

    /// @notice Deposits collateral for a borrower and activates the collateral index if newly funded.
    /// @dev Does not call oracles. Authorization on `onBehalf` prevents activated-collateral poisoning.
    /// @param market The market supplying collateral into.
    /// @param collateralIndex Index into `market.collateralParams`.
    /// @param assets Collateral token amount to deposit.
    /// @param onBehalf Borrower receiving the collateral credit.
    function supplyCollateral(Market memory market, uint256 collateralIndex, uint256 assets, address onBehalf)
        external
    {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        bytes32 id = initMarket(market);
        address collateralToken = market.collateralParams[collateralIndex].token;

        Position storage _position = position[id][onBehalf];
        uint256 oldCollateral = _position.collateral[collateralIndex];
        _position.collateral[collateralIndex] = UtilsLib.toUint128(oldCollateral + assets);

        if (oldCollateral == 0 && assets > 0) {
            uint128 newCollateralBitmap = _position.collateralBitmap.setBit(collateralIndex);
            _position.collateralBitmap = newCollateralBitmap;
            require(
                UtilsLib.countBits(newCollateralBitmap) <= MAX_COLLATERALS_PER_BORROWER, TooManyActivatedCollaterals()
            );
        }

        emit EventsLib.SupplyCollateral(msg.sender, id, collateralToken, assets, onBehalf);

        SafeTransferLib.safeTransferFrom(collateralToken, msg.sender, address(this), assets);
    }

    /// @notice Withdraws collateral for a borrower if the position remains healthy.
    /// @dev Does not call oracles when the borrower has zero debt. Deactivates the index when fully withdrawn.
    /// @param market The market to withdraw from.
    /// @param collateralIndex Index into `market.collateralParams`.
    /// @param assets Collateral token amount to withdraw.
    /// @param onBehalf Borrower whose collateral is reduced.
    /// @param receiver Recipient of the collateral tokens.
    function withdrawCollateral(
        Market memory market,
        uint256 collateralIndex,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        bytes32 id = initMarket(market);
        address collateralToken = market.collateralParams[collateralIndex].token;

        Position storage _position = position[id][onBehalf];
        uint256 newCollateral = _position.collateral[collateralIndex] - assets;
        _position.collateral[collateralIndex] = UtilsLib.toUint128(newCollateral);

        if (newCollateral == 0 && assets > 0) {
            _position.collateralBitmap = _position.collateralBitmap.clearBit(collateralIndex);
        }

        require(isHealthy(market, id, onBehalf), UnhealthyBorrower());

        emit EventsLib.WithdrawCollateral(msg.sender, id, collateralToken, assets, onBehalf, receiver);

        SafeTransferLib.safeTransfer(collateralToken, receiver, assets);
    }

    /// @notice Seizes collateral and/or repays debt from an unhealthy or post-maturity borrower.
    /// @dev See LIQUIDATIONS section. Exactly one of `seizedAssets` or `repaidUnits` may be nonzero, except both
    /// zero to realize bad debt with no token transfer. Optional callback may act as the loan-token payer.
    /// @param market The market being liquidated.
    /// @param collateralIndex Collateral index to seize from.
    /// @param seizedAssets Collateral amount to seize; used to derive `repaidUnits` when `repaidUnits == 0`.
    /// @param repaidUnits Debt units to repay; used to derive `seizedAssets` when `seizedAssets == 0`.
    /// @param borrower Account being liquidated.
    /// @param postMaturityMode If true, uses post-maturity LIF ramp; otherwise requires unhealthy position.
    /// @param receiver Recipient of seized collateral.
    /// @param callback Optional `ILiquidateCallback` that returns `CALLBACK_SUCCESS` and acts as payer.
    /// @param data Calldata forwarded to `callback`.
    /// @return seizedAssets Collateral transferred to `receiver`.
    /// @return repaidUnits Debt units repaid and loan tokens pulled from `payer`.
    function seize(
        Market calldata market,
        uint256 collateralIndex,
        uint256 seizedAssets,
        uint256 repaidUnits,
        address borrower,
        bool postMaturityMode,
        address receiver,
        address callback,
        bytes calldata data
    ) external returns (uint256, uint256) {
        bytes32 id = initMarket(market);
        MarketState storage _marketState = marketState[id];
        Position storage _position = position[id][borrower];
        require(UtilsLib.atMostOneNonZero(repaidUnits, seizedAssets), InconsistentInput());
        require(_position.debt > 0, NotBorrower()); // to avoid no-op liquidations of non borrower positions.
        require(
            market.seizureGate == address(0) || ILiquidatorGate(market.seizureGate).canLiquidate(msg.sender),
            SeizerIneligible()
        );

        uint256 maxDebt;
        uint256 liquidatedCollatPrice;
        uint256 originalDebt = _position.debt;
        uint256 badDebt = originalDebt;
        uint128 _collateralBitmap = _position.collateralBitmap;
        while (_collateralBitmap != 0) {
            uint256 i = UtilsLib.msb(_collateralBitmap);
            CollateralParams memory _collateralParam = market.collateralParams[i];
            uint256 price = IOracle(_collateralParam.oracle).price();
            if (i == collateralIndex) liquidatedCollatPrice = price;
            uint256 _collateral = _position.collateral[i];
            maxDebt += _collateral.mulDivDown(price, ORACLE_PRICE_SCALE).mulDivDown(_collateralParam.lltv, WAD);
            badDebt = badDebt.zeroFloorSub(
                _collateral.mulDivUp(price, ORACLE_PRICE_SCALE).mulDivUp(WAD, _collateralParam.maxLif)
            );
            _collateralBitmap = _collateralBitmap.clearBit(i);
        }

        require(
            !liquidationLocked(id, borrower)
                && (postMaturityMode ? block.timestamp > market.maturity : originalDebt > maxDebt),
            NotLiquidatable()
        );

        if (badDebt > 0) {
            // forge-lint: disable-next-item(unsafe-typecast) as badDebt <= _position.debt
            _position.debt -= uint128(badDebt);
            uint256 _totalUnits = _marketState.totalUnits;
            uint256 _lossFactor = _marketState.lossFactor;
            _marketState.lossFactor = UtilsLib.toUint128(
                type(uint128).max - (type(uint128).max - _lossFactor).mulDivDown(_totalUnits - badDebt, _totalUnits)
            );
            _marketState.totalUnits -= UtilsLib.toUint128(badDebt);
            _marketState.continuousFeeCredit = _lossFactor < type(uint128).max
                ? UtilsLib.toUint128(
                    _marketState.continuousFeeCredit
                        .mulDivDown(type(uint128).max - _marketState.lossFactor, type(uint128).max - _lossFactor)
                )
                : 0;
        } 

        if (repaidUnits > 0 || seizedAssets > 0) {
            uint256 _maxLif = market.collateralParams[collateralIndex].maxLif;
            uint256 lif = postMaturityMode
                ? UtilsLib.min(_maxLif, WAD + (_maxLif - WAD) * (block.timestamp - market.maturity) / TIME_TO_MAX_LIF)
                : _maxLif;

            if (seizedAssets > 0) {
                repaidUnits = seizedAssets.mulDivUp(liquidatedCollatPrice, ORACLE_PRICE_SCALE).mulDivUp(WAD, lif);
            } else {
                seizedAssets = repaidUnits.mulDivDown(lif, WAD).mulDivDown(ORACLE_PRICE_SCALE, liquidatedCollatPrice);
            }

            if (!postMaturityMode) {
                uint256 lltv = market.collateralParams[collateralIndex].lltv;
                // Note that debt >= maxDebt in this branch.
                // The imprecision in this computation is at most a few hundreds collateral or loan token assets.
                uint256 maxRepaid = lltv < WAD
                    ? (_position.debt - maxDebt).mulDivUp(WAD * WAD, WAD * WAD - lif * lltv)
                    : type(uint256).max;
                require(
                    repaidUnits <= maxRepaid
                        || _position.collateral[collateralIndex].mulDivDown(liquidatedCollatPrice, ORACLE_PRICE_SCALE)
                            .mulDivDown(WAD, lif).zeroFloorSub(maxRepaid) < market.rcfThreshold,
                    RecoveryCloseFactorConditionsViolated()
                );
            }

            uint128 newCollateral = _position.collateral[collateralIndex] - UtilsLib.toUint128(seizedAssets);
            _position.collateral[collateralIndex] = newCollateral;
            if (newCollateral == 0 && seizedAssets > 0) {
                _position.collateralBitmap = _position.collateralBitmap.clearBit(collateralIndex);
            }
            _marketState.withdrawable += UtilsLib.toUint128(repaidUnits);
            _position.debt -= UtilsLib.toUint128(repaidUnits);
        }

        address payer = callback != address(0) ? callback : msg.sender;

        emit EventsLib.Liquidate(
            msg.sender,
            id,
            market.collateralParams[collateralIndex].token,
            seizedAssets,
            repaidUnits,
            borrower,
            postMaturityMode,
            receiver,
            payer,
            badDebt,
            _marketState.lossFactor,
            _marketState.continuousFeeCredit
        );

        SafeTransferLib.safeTransfer(market.collateralParams[collateralIndex].token, receiver, seizedAssets);

        if (callback != address(0)) {
            require(
                ILiquidateCallback(callback)
                    .onLiquidate(
                        msg.sender,
                        id,
                        market,
                        collateralIndex,
                        seizedAssets,
                        repaidUnits,
                        borrower,
                        receiver,
                        data,
                        badDebt
                    ) == CALLBACK_SUCCESS,
                WrongLiquidateCallbackReturnValue()
            );
        }

        SafeTransferLib.safeTransferFrom(market.loanToken, payer, address(this), repaidUnits);

        return (seizedAssets, repaidUnits);
    }

    /// @notice Sets the cumulative consumption counter for an offer group on behalf of a maker.
    /// @dev Used to pre-set fill caps or cancel outstanding offers. Passing `type(uint256).max` cancels all offers in
    /// the group without reverting.
    /// @param group Offer group identifier shared across related offers.
    /// @param amount New cumulative consumed amount; must be at least the current value.
    /// @param onBehalf Maker whose offers are capped or cancelled.
    function setConsumed(bytes32 group, uint256 amount, address onBehalf) external {
        require(onBehalf == msg.sender || isAuthorized[onBehalf][msg.sender], Unauthorized());
        require(amount >= consumed[onBehalf][group], AlreadyConsumed());
        consumed[onBehalf][group] = amount;
        emit EventsLib.SetConsumed(msg.sender, group, amount, onBehalf);
    }

    /// @notice Lends multiple ERC-20 tokens atomically and pulls them back after a callback.
    /// @dev Callback must return `CALLBACK_SUCCESS` and repay exact amounts via `transferFrom`.
    /// @param tokens ERC-20 tokens to lend.
    /// @param assets Amount of each token to lend, parallel to `tokens`.
    /// @param callback Recipient of the loan and `IFlashLoanCallback` implementation.
    /// @param data Calldata forwarded to `callback`.

    function flashLoan(address[] calldata tokens, uint256[] calldata assets, address callback, bytes calldata data)
        external
    {
        require(tokens.length == assets.length, InconsistentInput());
        emit EventsLib.FlashLoan(msg.sender, tokens, assets, callback);
        for (uint256 i = 0; i < tokens.length; i++) {
            SafeTransferLib.safeTransfer(tokens[i], callback, assets[i]);
        }
        require(
            IFlashLoanCallback(callback).onFlashLoan(msg.sender, tokens, assets, data) == CALLBACK_SUCCESS,
            WrongFlashLoanCallbackReturnValue()
        );
        for (uint256 i = 0; i < tokens.length; i++) {
            SafeTransferLib.safeTransferFrom(tokens[i], callback, address(this), assets[i]);
        }
    }

    /// @notice Returns the market id, creating market state on first call.
    /// @dev Validates collateral ordering, LLTV, and maxLif on creation. Initializes fees from loan-token defaults.
    /// @param market Market parameters; must match the stored configuration on subsequent calls.
    /// @return id Stable market identifier derived from `market` and `INITIAL_CHAIN_ID`.
    function initMarket(Market memory market) public returns (bytes32) {
        bytes32 id = toId(market);
        if (marketState[id].tickSpacing == 0) {
            require(market.maturity <= block.timestamp + 100 * 365 days, MaturityTooFar());
            require(market.collateralParams.length > 0, NoCollateralParams());
            require(market.collateralParams.length <= MAX_COLLATERALS, TooManyCollateralParams());

            // Compliance mode: every new market MUST bind a whitelisted, non-zero gate on both roles.
            // Because gate addresses are part of the market's identity (they hash into the id), enforcing
            // this at creation makes it impossible for a compliant deployment to hold any market that
            // isn't gated — the alternative (unenforceable at creation but checked at trade time) would
            // let anyone create ghost markets that transact once with `address(0)` gates before anyone
            // notices. Belt-and-suspenders: `fillOffer`/`liquidate` still short-circuit if the gate is zero,
            // but we never let a zero-gate market exist in the first place.
            if (REQUIRE_COMPLIANCE) {
                require(
                    market.entryGate != address(0) && market.seizureGate != address(0),
                    MissingComplianceGate()
                );
                require(isApprovedGate[market.entryGate], GateNotApproved(market.entryGate));
                require(isApprovedGate[market.seizureGate], GateNotApproved(market.seizureGate));
            }
            address previousCollateralToken;
            for (uint256 i = 0; i < market.collateralParams.length; i++) {
                address collateralToken = market.collateralParams[i].token;
                require(collateralToken > previousCollateralToken, CollateralParamsNotSorted());
                uint256 lltv = market.collateralParams[i].lltv;
                require(isLltvAllowed(lltv), LltvNotAllowed());
                require(
                    market.collateralParams[i].maxLif == maxLif(lltv, LIQUIDATION_CURSOR_LOW)
                        || market.collateralParams[i].maxLif == maxLif(lltv, LIQUIDATION_CURSOR_HIGH),
                    InvalidMaxLif()
                );
                previousCollateralToken = collateralToken;
            }

            MarketState storage _marketState = marketState[id];
            _marketState.tickSpacing = DEFAULT_TICK_SPACING;
            uint16[7] memory _defaultSettlementFeeCbp = defaultSettlementFeeCbp[market.loanToken];
            _marketState.settlementFeeCbp0 = _defaultSettlementFeeCbp[0];
            _marketState.settlementFeeCbp1 = _defaultSettlementFeeCbp[1];
            _marketState.settlementFeeCbp2 = _defaultSettlementFeeCbp[2];
            _marketState.settlementFeeCbp3 = _defaultSettlementFeeCbp[3];
            _marketState.settlementFeeCbp4 = _defaultSettlementFeeCbp[4];
            _marketState.settlementFeeCbp5 = _defaultSettlementFeeCbp[5];
            _marketState.settlementFeeCbp6 = _defaultSettlementFeeCbp[6];
            _marketState.continuousFee = defaultContinuousFee[market.loanToken];
            IdLib.storeInCode(market, INITIAL_CHAIN_ID);

            emit EventsLib.MarketCreated(market, id);
        }
        return id;
    }

    /// SLASHING AND CONTINUOUS FEE ACCRUAL ///

    /// @notice Returns up-to-date credit and pending fee after slashing and continuous-fee accrual, without writing state.
    /// @dev Use instead of `creditOf` / `pendingFee` when values must reflect bad-debt slash and fee accrual.
    /// @param market The market of the position.
    /// @param id Market id corresponding to `market`.
    /// @param user Account whose position is computed.
    /// @return newCredit Credit after slash and fee accrual.
    /// @return newPendingFee Remaining pending continuous fee after accrual.
    /// @return accruedFee Continuous fee accrued to the market since last interaction.
    function updatePositionView(Market memory market, bytes32 id, address user)
        public
        view
        returns (uint128, uint128, uint128)
    {
        Position storage _position = position[id][user];
        uint128 credit = _position.credit; // 100 ether 
        uint128 _lastLossFactor = _position.lastLossFactor; // 0
        uint256 postSlashCredit = _lastLossFactor < type(uint128).max
            ? credit.mulDivDown(type(uint128).max - marketState[id].lossFactor, type(uint128).max - _lastLossFactor)
            : 0; 
        uint128 _pendingFee = _position.pendingFee;
        uint256 postSlashPendingFee =
            credit > 0 ? _pendingFee - _pendingFee.mulDivUp(credit - postSlashCredit, credit) : 0;
        uint256 accrualEnd = UtilsLib.min(block.timestamp, market.maturity);
        uint128 _lastAccrual = _position.lastAccrual;
        // forge-lint: disable-next-item(unsafe-typecast) as fee <= pending <= credit which are uint128 position fields
        uint128 fee = _lastAccrual < market.maturity
            ? uint128(postSlashPendingFee.mulDivDown(accrualEnd - _lastAccrual, market.maturity - _lastAccrual))
            : 0;
        // forge-lint: disable-next-item(unsafe-typecast) as credit and pending are <= uint128 position fields
        return (uint128(postSlashCredit) - fee, uint128(postSlashPendingFee) - fee, fee);
    }
 
    /// @notice Slashes credit for bad debt and accrues continuous fees, then writes the updated position.
    /// @dev Permissionless; may be called by anyone but only affects `user`'s position.
    /// @param market The market of the position.
    /// @param user Account to update.
    /// @return newCredit Updated credit after slash and fee accrual.
    /// @return newPendingFee Updated pending continuous fee.
    /// @return accruedFee Continuous fee accrued to the market.
    function updatePosition(Market memory market, address user) external returns (uint128, uint128, uint128) {
        bytes32 id = toId(market);
        require(marketState[id].tickSpacing > 0, MarketNotCreated());
        return _updatePosition(market, id, user);
    }

    /// @dev Slashes the position and accrues the continuous fee. Expects the market to be touched and `id` to match
    /// `market`.
    /// @return newCredit Updated credit after slash and fee accrual.
    /// @return newPendingFee Updated pending continuous fee.
    /// @return accruedFee Continuous fee accrued to the market.
    function _updatePosition(Market memory market, bytes32 id, address user)
        internal
        returns (uint128, uint128, uint128)
    {
        Position storage _position = position[id][user];
        (uint128 newCredit, uint128 newPendingFee, uint128 accruedFee) = updatePositionView(market, id, user);

        uint128 creditDecrease = _position.credit - newCredit;
        uint128 pendingFeeDecrease = _position.pendingFee - newPendingFee;

        _position.credit = newCredit;
        _position.lastLossFactor = marketState[id].lossFactor;
        _position.pendingFee = newPendingFee;
        _position.lastAccrual = uint128(block.timestamp);
        marketState[id].continuousFeeCredit += UtilsLib.toUint128(accruedFee);

        emit EventsLib.UpdatePosition(id, user, creditDecrease, pendingFeeDecrease, accruedFee);

        return (newCredit, newPendingFee, accruedFee);
    }

    /// @dev Returns whether `user` holds nonzero credit in `id`.
    function hasCredit(bytes32 id, address user) internal view returns (bool) {
        return position[id][user].credit > 0;
    }

    /// OTHER VIEW FUNCTIONS ///

    /// @notice Returns the loss factor snapshot used at the user's last position update.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Last recorded loss factor for slashing computation.
    function lastLossFactor(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].lastLossFactor;
    }

    /// @notice Returns the bitmap of activated collateral indices for a user.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Bitmap where bit `i` is set if collateral index `i` is active.
    function collateralBitmap(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].collateralBitmap;
    }

    /// @notice Returns the collateral balance at a given index for a user.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @param index Collateral index into `market.collateralParams`.
    /// @return Collateral token amount deposited.
    function collateral(bytes32 id, address user, uint256 index) external view returns (uint128) {
        return position[id][user].collateral[index];
    }

    /// @notice Computes the market id from market parameters without touching state.
    /// @param market Market parameters.
    /// @return id Stable market identifier derived from `market`, `INITIAL_CHAIN_ID`, and this contract.
    function toId(Market memory market) public view returns (bytes32) {
        return IdLib.toId(market, INITIAL_CHAIN_ID, address(this));
    }

    /// @notice Reconstructs market parameters from a touched market id.
    /// @dev Reads the market struct stored in the CREATE2 deployment bytecode at the id-derived address.
    /// @param id Market identifier of a created market.
    /// @return market Stored market configuration.
    function toMarket(bytes32 id) external view returns (Market memory) {
        require(marketState[id].tickSpacing > 0, MarketNotCreated());
        address create2Address = address(uint160(uint256(id)));
        return abi.decode(create2Address.code, (Market));
    }

    /// @notice Returns stored credit units for a user.
    /// @dev May be stale; use `updatePositionView` for slash- and fee-adjusted credit.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Credit units held (before slash and fee accrual).
    function creditOf(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].credit;
    }

    /// @notice Returns debt units owed by a user.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Debt units outstanding.
    function debtOf(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].debt;
    }

    /// @notice Returns total credit/debt units outstanding in a market.
    /// @param id Market identifier.
    /// @return Total units across all positions.
    function totalUnits(bytes32 id) external view returns (uint128) {
        return marketState[id].totalUnits;
    }

    /// @notice Returns the market-wide loss factor used to socialize bad debt among lenders.
    /// @param id Market identifier.
    /// @return Cumulative loss factor; `type(uint128).max` means the market is fully impaired.
    function lossFactor(bytes32 id) external view returns (uint128) {
        return marketState[id].lossFactor;
    }

    /// @notice Returns the tick spacing enforced for offers in a market.
    /// @dev Zero means the market has not been created.
    /// @param id Market identifier.
    /// @return Tick spacing; offers must use ticks that are multiples of this value.
    function tickSpacing(bytes32 id) external view returns (uint8) {
        return marketState[id].tickSpacing;
    }

    /// @notice Returns loan tokens available for lender withdrawal in a market.
    /// @param id Market identifier.
    /// @return Loan tokens backed by repaid debt and not yet withdrawn as credit.
    function withdrawable(bytes32 id) external view returns (uint128) {
        return marketState[id].withdrawable;
    }

    /// @notice Returns the seven settlement-fee breakpoints for a market, in centi-basis-points.
    /// @dev Values are 0 until the market is created, then set from the loan-token defaults.
    /// @param id Market identifier.
    /// @return cbps Breakpoint fees at 0d, 1d, 7d, 30d, 90d, 180d, and 360d time-to-maturity.
    function settlementFeeCbps(bytes32 id) external view returns (uint16[7] memory) {
        return [
            marketState[id].settlementFeeCbp0,
            marketState[id].settlementFeeCbp1,
            marketState[id].settlementFeeCbp2,
            marketState[id].settlementFeeCbp3,
            marketState[id].settlementFeeCbp4,
            marketState[id].settlementFeeCbp5,
            marketState[id].settlementFeeCbp6
        ];
    }

    /// @notice Returns the continuous fee rate for a market.
    /// @dev Zero until the market is created, then set from the loan-token default.
    /// @param id Market identifier.
    /// @return Fee rate in WAD per second until maturity.
    function continuousFee(bytes32 id) external view returns (uint32) {
        return marketState[id].continuousFee;
    }

    /// @notice Returns continuous fees accrued to the market and not yet claimed.
    /// @param id Market identifier.
    /// @return Accrued continuous fee credit in loan tokens.
    function continuousFeeCredit(bytes32 id) external view returns (uint128) {
        return marketState[id].continuousFeeCredit;
    }

    /// @notice Returns the stored pending continuous fee for a lender.
    /// @dev May be stale; use `updatePositionView` for the fee-adjusted value.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Pending continuous fee not yet accrued to the market.
    function pendingFee(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].pendingFee;
    }

    /// @notice Returns the timestamp of the user's last continuous-fee accrual checkpoint.
    /// @param id Market identifier.
    /// @param user Account to query.
    /// @return Timestamp of last accrual update.
    function lastAccrual(bytes32 id, address user) external view returns (uint128) {
        return position[id][user].lastAccrual;
    }

    /// @notice Returns whether liquidations are temporarily locked for a user during a `fillOffer` callback.
    /// @param id Market identifier.
    /// @param user Account to query (typically the seller in an in-flight `fillOffer`).
    /// @return True if liquidation is locked.
    function liquidationLocked(bytes32 id, address user) public view returns (bool) {
        return UtilsLib.tGet(LIQUIDATION_LOCK_SLOT, id, user);
    }

    /// @notice Returns whether a borrower's debt is within the LLTV-backed borrowing capacity.
    /// @dev Does not call oracles when debt is zero. `id` must correspond to `market`.
    /// @param market Market parameters.
    /// @param id Market identifier corresponding to `market`.
    /// @param borrower Account to check.
    /// @return True if `debt <= maxDebt` over all activated collaterals.
    function isHealthy(Market memory market, bytes32 id, address borrower) public view returns (bool) {
        Position storage _position = position[id][borrower];
        uint256 debt = _position.debt;
        uint256 maxDebt;
        if (debt > 0) {
            uint128 _collateralBitmap = _position.collateralBitmap;
            while (_collateralBitmap != 0) {
                uint256 i = UtilsLib.msb(_collateralBitmap);
                CollateralParams memory collateralParam = market.collateralParams[i];
                uint256 price = IOracle(collateralParam.oracle).price(); 
                maxDebt += _position.collateral[i].mulDivDown(price, ORACLE_PRICE_SCALE)
                    .mulDivDown(collateralParam.lltv, WAD);
                _collateralBitmap = _collateralBitmap.clearBit(i);
            }
        }
        return maxDebt >= debt;
    }

    /// @notice Returns the per-unit settlement fee spread for a given time to maturity.
    /// @dev Piecewise linear interpolation between breakpoints; see SETTLEMENT FEES section.
    /// @param id Market identifier.
    /// @param timeToMaturity Seconds until market maturity used to select the fee tier.
    /// @return Per-unit settlement fee spread in WAD, added to the seller price for the buyer.
    function settlementFee(bytes32 id, uint256 timeToMaturity) public view returns (uint256) {
        MarketState storage _marketState = marketState[id];
        require(_marketState.tickSpacing > 0, MarketNotCreated());

        if (timeToMaturity >= 360 days) return _marketState.settlementFeeCbp6 * CBP;

        // forgefmt: disable-start
        (uint256 start, uint256 end, uint256 feeLower, uint256 feeUpper) =
            timeToMaturity < 1 days   ? (  0 days,   1 days, _marketState.settlementFeeCbp0 * CBP, _marketState.settlementFeeCbp1 * CBP) :
            timeToMaturity < 7 days   ? (  1 days,   7 days, _marketState.settlementFeeCbp1 * CBP, _marketState.settlementFeeCbp2 * CBP) :
            timeToMaturity < 30 days  ? (  7 days,  30 days, _marketState.settlementFeeCbp2 * CBP, _marketState.settlementFeeCbp3 * CBP) :
            timeToMaturity < 90 days  ? ( 30 days,  90 days, _marketState.settlementFeeCbp3 * CBP, _marketState.settlementFeeCbp4 * CBP) :
            timeToMaturity < 180 days ? ( 90 days, 180 days, _marketState.settlementFeeCbp4 * CBP, _marketState.settlementFeeCbp5 * CBP) :
                                        (180 days, 360 days, _marketState.settlementFeeCbp5 * CBP, _marketState.settlementFeeCbp6 * CBP);
        // forgefmt: disable-end

        return (feeLower * (end - timeToMaturity) + feeUpper * (timeToMaturity - start)) / (end - start);
    }
}
