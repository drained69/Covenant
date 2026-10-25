// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {ERC20Permit} from "../erc20s/ERC20Permit.sol";
import {
    IEcrecoverNotary,
    Signature,
    EIP712_DOMAIN_TYPEHASH
} from "../../src/notaries/interfaces/IEcrecoverNotary.sol";
import {HashLib} from "../../src/notaries/libraries/HashLib.sol";
import {UtilsLib} from "../../src/libraries/UtilsLib.sol";
import {TickLib, MAX_TICK} from "../../src/libraries/TickLib.sol";
import {IdLib} from "../../src/libraries/IdLib.sol";
import {
    WAD,
    ORACLE_PRICE_SCALE,
    LIQUIDATION_CURSOR_LOW,
    LLTV_0,
    LLTV_1,
    LLTV_2,
    maxLif
} from "../../src/libraries/ConstantsLib.sol";
import {Market, Offer, CollateralParams, ICovenant} from "../../src/interfaces/ICovenant.sol";
import {Covenant} from "../../src/Covenant.sol";
import {EcrecoverNotary} from "../../src/notaries/EcrecoverNotary.sol";
import {EthosTierGate} from "../../src/reputation/EthosTierGate.sol";
import {BtcUsdOracle} from "../../src/oracles/BtcUsdOracle.sol";

/// @dev End-to-end flow test mirroring `script/DeployMezo.s.sol`: a
///      compliance-mode core, three Ethos tier gates, three markets at
///      LLTV 38.5/62.5/77, and the full borrower path — score authorization,
///      collateral, borrow via a signed lender offer, health, repay, withdraw.
///
///      This is the contract-level rehearsal of the Mezo demo. Tokens are 18-dec
///      mocks, matching Mezo's MUSD and BTC (both 18 decimals), so the oracle
///      is constructed with (18, 18, 8). The deployment prices BTC through the
///      Skip BTC/USD feed; a settable BtcUsdOracle stands in for it here.
contract EthosCreditFlowTest is Test {
    using UtilsLib for uint256;

    Covenant internal covenant;
    EcrecoverNotary internal notary;

    EthosTierGate internal openGate; // threshold 0    -> LLTV_0 (38.5%)
    EthosTierGate internal establishedGate; // threshold 1600 -> LLTV_1 (62.5%)
    EthosTierGate internal reputableGate; // threshold 2000 -> LLTV_2 (77.0%)

    ERC20Permit internal loanToken; // MUSD stand-in
    ERC20Permit internal testBtc; // collateral
    BtcUsdOracle internal oracle; // BTC/USD, staleness disabled

    address internal deployer = address(this);
    address internal borrower;
    uint256 internal borrowerKey;
    address internal lender;
    uint256 internal lenderKey;
    uint256 internal scoreSignerKey = 0x5c0ce;
    address internal scoreSigner;

    // Mirrors the deployment's fixed maturity (2027-03-01).
    uint256 internal maturity = 1803859200;
    // BTC at $108,000, 8-dec feed units.
    uint256 internal btcRawPrice = 108000e8;

    uint256 internal collateralPrice; // oracle.price() output

    function setUp() public {
        (borrower, borrowerKey) = makeAddrAndKey("borrower");
        (lender, lenderKey) = makeAddrAndKey("lender");
        scoreSigner = vm.addr(scoreSignerKey);

        // Stand where the deployment will stand: maturity ~7 months out.
        vm.warp(1785000000); // 2026-07-31

        /* ── deployment, as DeployMezo.s.sol performs it ──────────── */
        loanToken = new ERC20Permit("Mock MUSD", "MUSD");
        testBtc = new ERC20Permit("Mock BTC", "BTC");

        oracle = new BtcUsdOracle(deployer, 18, 18, 8, 0);
        oracle.setPrice(btcRawPrice);
        collateralPrice = oracle.price();

        covenant = new Covenant(true, deployer);
        notary = new EcrecoverNotary(address(covenant));

        openGate = new EthosTierGate(0, scoreSigner);
        establishedGate = new EthosTierGate(1600, scoreSigner);
        reputableGate = new EthosTierGate(2000, scoreSigner);

        covenant.setApprovedGate(address(openGate), true);
        covenant.setApprovedGate(address(establishedGate), true);
        covenant.setApprovedGate(address(reputableGate), true);

        initTierMarket(openGate, LLTV_0);
        initTierMarket(establishedGate, LLTV_1);
        initTierMarket(reputableGate, LLTV_2);
    }

    /* ── flow ──────────────────────────────────────────────────────── */

    /// @dev The headline path: a 1,842-score borrower borrows 10,000 MUSD against
    ///      BTC in the Established market, then repays and exits.
    function testEstablishedBorrowerBorrowsRepaysAndExits() public {
        Market memory market = marketAt(establishedGate, LLTV_1);
        bytes32 id = toId(market);
        uint256 borrowUnits = 10_000e18;

        fundLender(market);

        // 1. Authorize the borrower's score at the Established gate.
        authorizeScore(establishedGate, borrower, 1842);

        // 2. Borrower posts collateral: enough for 10k debt at 62.5% LLTV.
        uint256 collateral = borrowUnits.mulDivUp(WAD, LLTV_1).mulDivUp(ORACLE_PRICE_SCALE, collateralPrice);
        deal(address(testBtc), borrower, collateral);
        vm.startPrank(borrower);
        testBtc.approve(address(covenant), collateral);
        covenant.supplyCollateral(market, 0, collateral, borrower);
        vm.stopPrank();

        // 3. Borrow: fill the lender's par offer for 10k units.
        uint256 loanBefore = loanToken.balanceOf(borrower);
        vm.prank(borrower);
        (uint256 takenUnits,) =
            covenant.fillOffer(lenderOffer(market), lenderNotaryData(market), borrowUnits, borrower, borrower, address(0), "");

        assertEq(takenUnits, borrowUnits, "units taken");
        assertEq(covenant.debtOf(id, borrower), borrowUnits, "debt");
        assertEq(loanToken.balanceOf(borrower) - loanBefore, borrowUnits, "loan tokens received");
        assertTrue(covenant.isHealthy(market, id, borrower), "healthy after borrow");

        // 4. Repay in full and exit with collateral.
        deal(address(loanToken), borrower, borrowUnits);
        vm.startPrank(borrower);
        loanToken.approve(address(covenant), borrowUnits);
        covenant.repay(market, borrowUnits, borrower, address(0), "");
        covenant.withdrawCollateral(market, 0, collateral, borrower, borrower);
        vm.stopPrank();

        assertEq(covenant.debtOf(id, borrower), 0, "debt after repay");
        assertEq(testBtc.balanceOf(borrower), collateral, "collateral returned");
    }

    /// @dev The reputation ladder is real on-chain: the same collateral supports
    ///      more debt in higher-tier markets — 2× from Open to Reputable.
    function testTierLadderDoublesCapitalEfficiency() public {
        uint256 collateral = 1e18; // 1 BTC == $108,000
        uint256 collateralValue = collateral.mulDivDown(collateralPrice, ORACLE_PRICE_SCALE);

        uint256 openMax = collateralValue.mulDivDown(LLTV_0, WAD);
        uint256 estMax = collateralValue.mulDivDown(LLTV_1, WAD);
        uint256 repMax = collateralValue.mulDivDown(LLTV_2, WAD);

        assertEqDecimal(openMax / 1e18, 41_580, 0, "1 BTC supports ~41.6k at Open");
        assertEqDecimal(repMax / 1e18, 83_160, 0, "1 BTC supports ~83.2k at Reputable");
        assertApproxEqRel(repMax, openMax * 2, 1e16, "reputable is 2x open");
        assertTrue(estMax > openMax && repMax > estMax, "monotone ladder");
    }

    /// @dev No authorization, no borrowing — the gate fails closed inside the
    ///      fill itself, which is the whole compliance-mode thesis.
    function testBorrowWithoutScoreAuthorizationReverts() public {
        Market memory market = marketAt(establishedGate, LLTV_1);
        fundLender(market);

        deal(address(testBtc), borrower, 1e18);
        vm.startPrank(borrower);
        testBtc.approve(address(covenant), 1e18);
        covenant.supplyCollateral(market, 0, 1e18, borrower);
        vm.stopPrank();

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(ICovenant.BorrowerIneligible.selector));
        covenant.fillOffer(lenderOffer(market), lenderNotaryData(market), 100e18, borrower, borrower, address(0), "");
    }

    /// @dev A 1,200 score authorizes fine at the Open gate but not Established —
    ///      tiers bind terms, not access to the protocol.
    function testLowScoreBorrowsAtOpenTierOnly() public {
        authorizeScore(openGate, borrower, 1200);
        authorizeScore(establishedGate, borrower, 1200);

        assertTrue(openGate.canIncreaseDebt(borrower), "open admits any score");
        assertFalse(establishedGate.canIncreaseDebt(borrower), "established requires 1600");
    }

    /// @dev Lending and liquidation are never reputation-gated — only new debt is.
    function testLendingAndLiquidationAreUngated() public view {
        assertTrue(reputableGate.canIncreaseCredit(lender), "credit ungated");
        assertTrue(reputableGate.canLiquidate(lender), "liquidation ungated");
    }

    /// @dev Score authorizations expire; expiry blocks new debt but never the
    ///      exits — repay and withdraw still work after the deadline passes.
    function testExpiryBlocksNewDebtButNotExits() public {
        Market memory market = marketAt(establishedGate, LLTV_1);
        bytes32 id = toId(market);
        uint256 borrowUnits = 1_000e18;

        fundLender(market);
        authorizeScore(establishedGate, borrower, 1842, uint64(block.timestamp + 1 hours));

        uint256 collateral = borrowUnits.mulDivUp(WAD, LLTV_1).mulDivUp(ORACLE_PRICE_SCALE, collateralPrice);
        deal(address(testBtc), borrower, collateral);
        vm.startPrank(borrower);
        testBtc.approve(address(covenant), collateral);
        covenant.supplyCollateral(market, 0, collateral, borrower);
        vm.stopPrank();

        vm.prank(borrower);
        covenant.fillOffer(lenderOffer(market), lenderNotaryData(market), borrowUnits, borrower, borrower, address(0), "");

        // Authorization expires.
        vm.warp(block.timestamp + 2 hours);
        assertFalse(establishedGate.canIncreaseDebt(borrower), "expired score");

        // Post more collateral — supplying is ungated — and try to borrow again.
        uint256 moreCollateral = borrowUnits.mulDivUp(WAD, LLTV_1).mulDivUp(ORACLE_PRICE_SCALE, collateralPrice);
        deal(address(testBtc), borrower, moreCollateral);
        vm.startPrank(borrower);
        testBtc.approve(address(covenant), moreCollateral);
        covenant.supplyCollateral(market, 0, moreCollateral, borrower);
        vm.expectRevert(abi.encodeWithSelector(ICovenant.BorrowerIneligible.selector));
        covenant.fillOffer(lenderOffer(market), lenderNotaryData(market), borrowUnits, borrower, borrower, address(0), "");
        vm.stopPrank();

        // Exits are not blocked.
        deal(address(loanToken), borrower, borrowUnits);
        vm.startPrank(borrower);
        loanToken.approve(address(covenant), borrowUnits);
        covenant.repay(market, borrowUnits, borrower, address(0), "");
        covenant.withdrawCollateral(market, 0, collateral + moreCollateral, borrower, borrower);
        vm.stopPrank();

        assertEq(covenant.debtOf(id, borrower), 0, "debt cleared");
    }

    /* ── helpers ───────────────────────────────────────────────────── */

    function fundLender(Market memory market) internal {
        vm.startPrank(lender);
        deal(address(loanToken), lender, 1_000_000e18);
        loanToken.approve(address(covenant), type(uint256).max);
        covenant.setIsAuthorized(address(notary), true, lender);
        vm.stopPrank();
        // Touch the market so the compiler keeps the parameter meaningful.
        market.collateralParams[0].lltv;
    }

    function initTierMarket(EthosTierGate gate, uint256 lltv) internal returns (bytes32) {
        Market memory market = marketAt(gate, lltv);
        return covenant.initMarket(market);
    }

    function marketAt(EthosTierGate gate, uint256 lltv) internal view returns (Market memory) {
        CollateralParams[] memory collat = new CollateralParams[](1);
        collat[0] = CollateralParams({
            token: address(testBtc),
            lltv: lltv,
            maxLif: maxLif(lltv, LIQUIDATION_CURSOR_LOW),
            oracle: address(oracle)
        });
        return Market({
            loanToken: address(loanToken),
            collateralParams: collat,
            maturity: maturity,
            rcfThreshold: 0,
            entryGate: address(gate),
            seizureGate: address(gate)
        });
    }

    function toId(Market memory market) internal view returns (bytes32) {
        return IdLib.toId(market, block.chainid, address(covenant));
    }

    function authorizeScore(EthosTierGate gate, address wallet, uint128 score) internal {
        authorizeScore(gate, wallet, score, uint64(block.timestamp + 30 minutes));
    }

    function authorizeScore(EthosTierGate gate, address wallet, uint128 score, uint64 deadline) internal {
        EthosTierGate.ScoreAuthorization memory a = EthosTierGate.ScoreAuthorization({
            wallet: wallet,
            score: score,
            deadline: deadline,
            nonce: uint256(keccak256(abi.encode(wallet, score, deadline, address(gate)))),
            chainId: block.chainid
        });
        bytes32 domainSeparator = keccak256(
            abi.encode(
                gate.EIP712_DOMAIN_TYPEHASH(),
                keccak256("Covenant Ethos Score"),
                keccak256("1"),
                block.chainid,
                address(gate)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(gate.SCORE_AUTHORIZATION_TYPEHASH(), a.wallet, a.score, a.deadline, a.nonce, a.chainId)
        );
        bytes32 digest = keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(scoreSignerKey, digest);
        gate.authorize(a, EthosTierGate.Sig({v: v, r: r, s: s}));
    }

    function lenderOffer(Market memory market) internal view returns (Offer memory) {
        return Offer({
            market: market,
            buy: true,
            maker: lender,
            start: 0,
            expiry: block.timestamp + 1 hours,
            tick: MAX_TICK,
            group: keccak256("ethos-credit-flow"),
            callback: address(0),
            callbackData: "",
            receiverIfMakerIsSeller: address(0),
            notary: address(notary),
            reduceOnly: false,
            maxUnits: type(uint256).max,
            maxAssets: 0
        });
    }

    function lenderNotaryData(Market memory market) internal view returns (bytes memory) {
        Offer memory offer = lenderOffer(market);
        bytes32 root = HashLib.hashOffer(offer);
        Signature memory sig = signatureOf(root, lenderKey, offer.notary, 0);
        bytes32[] memory proof = new bytes32[](0);
        return abi.encode(sig, root, 0, proof);
    }

    function signatureOf(bytes32 root, uint256 key, address verifyingContract, uint256 height)
        internal
        view
        returns (Signature memory)
    {
        bytes32 structHash = keccak256(abi.encode(HashLib.offerTreeTypeHash(height), root));
        // The notary's domain is the minimal form: EIP712Domain(uint256 chainId,address verifyingContract).
        bytes32 domain = keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, block.chainid, verifyingContract));
        bytes32 messageHash = keccak256(bytes.concat("\x19\x01", domain, structHash));
        Signature memory sig;
        (sig.v, sig.r, sig.s) = vm.sign(key, messageHash);
        return sig;
    }
}
