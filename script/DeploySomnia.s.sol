// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {EcrecoverNotary} from "../src/notaries/EcrecoverNotary.sol";
import {EthosTierGate} from "../src/reputation/EthosTierGate.sol";
import {BtcUsdOracle} from "../src/oracles/BtcUsdOracle.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {LLTV_0, LLTV_1, LLTV_2, LIQUIDATION_CURSOR_LOW, maxLif} from "../src/libraries/ConstantsLib.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address receiver, uint256 amount) public returns (bool) {
        require(amount <= balanceOf[msg.sender], "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[receiver] += amount;
        emit Transfer(msg.sender, receiver, amount);
        return true;
    }

    function transferFrom(address sender, address receiver, uint256 amount) public returns (bool) {
        require(amount <= balanceOf[sender], "Insufficient balance");
        if (allowance[sender][msg.sender] != type(uint256).max) {
            require(amount <= allowance[sender][msg.sender], "Insufficient allowance");
            allowance[sender][msg.sender] -= amount;
        }
        balanceOf[sender] -= amount;
        balanceOf[receiver] += amount;
        emit Transfer(sender, receiver, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

/// @notice Deploys the entire Covenant credit layer to Somnia testnet and wires it
///         to DreamDEX: three Ethos-tier markets whose loan token is the DreamDEX
///         venue collateral, so borrowed capital trades on DreamDEX directly.
///
/// What lands on-chain:
///   - TestBTC (mock collateral, 8 dec, permissionless mint for the faucet UI)
///   - BtcUsdOracle (owner-push, staleness disabled) seeded with BTC_USD_RAW_PRICE
///   - Covenant core (REQUIRE_COMPLIANCE=true — every market is gate-bound)
///   - EcrecoverNotary (offer validation)
///   - EthosTierGate × 3 (thresholds 0 / 1600 / 2000, bound to SCORE_SIGNER_ADDRESS)
///   - Markets × 3 (LLTV 38.5% / 62.5% / 77% — a 2× capital-efficiency ladder)
///
/// The market ids are content-addressed: MATURITY is a FIXED timestamp so every
/// run of this script addresses the same three markets.
///
/// Env:
///   PRIVATE_KEY           — deployer (also the oracle owner; fund with STT first)
///   SCORE_SIGNER_ADDRESS  — reputation service signing key's address (NOT the key)
///   DREAMDEX_COLLATERAL   — DreamDEX venue collateral (TestUSDC) as loan token
///   BTC_USD_RAW_PRICE     — seed price, 8-dec feed units (default 108000e8)
///   MATURITY              — fixed unix maturity (default 2027-03-01)
///
/// Run:
///   forge script script/DeploySomnia.s.sol \
///     --rpc-url https://api.infra.testnet.somnia.network --broadcast
contract DeploySomnia is Script {
    // DreamDEX testnet-development venue collateral (TestUSDC, 6 dec).
    address constant DEFAULT_COLLATERAL = 0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address scoreSigner = vm.envAddress("SCORE_SIGNER_ADDRESS");
        address loanToken = vm.envOr("DREAMDEX_COLLATERAL", DEFAULT_COLLATERAL);
        uint256 btcRaw = vm.envOr("BTC_USD_RAW_PRICE", uint256(108000e8));
        uint256 maturity = vm.envOr("MATURITY", uint256(1803859200)); // 2027-03-01

        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);

        /* ── collateral token + oracle ─────────────────────────────── */
        MockERC20 testBtc = new MockERC20("Test Wrapped BTC", "tBTC", 8);
        testBtc.mint(deployer, 500 * 10 ** 8);
        console.log("TestBTC           :", address(testBtc));

        BtcUsdOracle oracle = new BtcUsdOracle(deployer, 8, 6, 8, 0);
        oracle.setPrice(btcRaw);
        console.log("BtcUsdOracle      :", address(oracle), "(seeded, staleness off)");

        /* ── credit engine + notary ────────────────────────────────── */
        Covenant covenant = new Covenant(true, deployer);
        console.log("Covenant core     :", address(covenant));

        EcrecoverNotary notary = new EcrecoverNotary(address(covenant));
        console.log("EcrecoverNotary   :", address(notary));

        /* ── three Ethos tier gates + their markets ────────────────── */
        deployTierMarket(covenant, loanToken, address(testBtc), address(oracle), maturity, 0, "Open", scoreSigner);
        deployTierMarket(covenant, loanToken, address(testBtc), address(oracle), maturity, 1600, "Established", scoreSigner);
        deployTierMarket(covenant, loanToken, address(testBtc), address(oracle), maturity, 2000, "Reputable", scoreSigner);

        console.log("Score signer      :", scoreSigner);
        console.log("Loan token        :", loanToken, "(DreamDEX venue collateral)");
        console.log("Maturity          :", maturity);

        vm.stopBroadcast();
    }

    /// @dev Deploys one tier gate, whitelists it, and initializes its market at
    ///      the tier's LLTV. The gate address is hashed into the market id, so
    ///      the threshold and the collateral terms are one object.
    function deployTierMarket(
        Covenant covenant,
        address loanToken,
        address collateralToken,
        address oracle,
        uint256 maturity,
        uint128 threshold,
        string memory label,
        address scoreSigner
    ) internal returns (bytes32 marketId) {
        EthosTierGate gate = new EthosTierGate(threshold, scoreSigner);
        covenant.setApprovedGate(address(gate), true);

        uint256 lltv = threshold == 0 ? LLTV_0 : threshold == 1600 ? LLTV_1 : LLTV_2;

        CollateralParams[] memory collat = new CollateralParams[](1);
        collat[0] = CollateralParams({
            token: collateralToken,
            lltv: lltv,
            maxLif: maxLif(lltv, LIQUIDATION_CURSOR_LOW),
            oracle: oracle
        });

        Market memory market = Market({
            loanToken: loanToken,
            collateralParams: collat,
            maturity: maturity,
            rcfThreshold: 0,
            entryGate: address(gate),
            seizureGate: address(gate)
        });

        marketId = covenant.initMarket(market);

        console.log("----------------------------------------");
        console.log("Tier              :", label);
        console.log("EthosTierGate     :", address(gate));
        console.log("  min score       :", threshold);
        console.log("  LLTV            :", lltv);
        console.log("  maxLif          :", collat[0].maxLif);
        console.log("  market id       :", vm.toString(marketId));
    }
}
