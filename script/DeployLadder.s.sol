// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {Covenant} from "../src/Covenant.sol";
import {CleanversePoolGate} from "../src/compliance/CleanversePoolGate.sol";
import {IAPassComplianceValidator} from "../src/compliance/interfaces/IAPassComplianceValidator.sol";
import {Market, CollateralParams} from "../src/interfaces/ICovenant.sol";
import {LLTV_0, LLTV_2, LLTV_4, LIQUIDATION_CURSOR_LOW, maxLif} from "../src/libraries/ConstantsLib.sol";

/// @notice Deploys a tiered credit ladder: three compliance gates bound to CVI sub-tier thresholds,
/// three markets with graduated LLTVs, deterministic registration steps.
///
/// **The ladder is a deployment topology, not a protocol modification.** Zero changes to Covenant.sol.
/// Gate addresses are part of market identity (IdLib hashing), so a 91.5% LLTV market is
/// cryptographically bound to its sub-tier-30 gate.
///
/// Required Environment Variables:
///   PRIVATE_KEY                    — deployer key, hex-prefixed
///   COVENANT_CORE_ADDRESS          — existing Covenant core to whitelist gates and init markets
///   CLEANVERSE_VALIDATOR_ADDRESS   — the IAPassComplianceValidator on this chain
///   TEST_USDC_ADDRESS              — loan token address
///   TEST_WBTC_ADDRESS              — collateral token address
///   COVENANT_ORACLE_ADDRESS        — price oracle for collateral/loan pair
///   MATURITY_TIMESTAMP             — absolute unix maturity (REQUIRED — market id is content-addressed;
///                                    block.timestamp-relative yields a different id every run)
///
/// Optional:
///   GATE_OWNER                     — defaults to deployer; transfer post-registration if needed
///
/// Rung Structure (keyed on RuleV2.minSubTier, NOT minTier per docs proof):
///   Rung 3 (Institutional): minSubTier=30, LLTV_4 (91.5%) — posts $109k for $100k
///   Rung 2 (Verified Professional): minSubTier=20, LLTV_2 (77%) — posts $130k
///   Rung 1 (Verified Retail): minSubTier=10, LLTV_0 (38.5%) — posts $260k
///
/// Usage:
///   forge script script/DeployLadder.s.sol --rpc-url $RPC_URL --broadcast --legacy
///
/// **Rules are NOT set on-chain.** The CCP V2 validator deployed on Monad testnet
/// (proxy `0xaC7e5179…` → impl `0x68Ce853D…`) exposes only the compliance *read* surface
/// (`isRegistered`, `complianceVerify`, `getRulesV2`). The `setRuleV2FromContract` /
/// `addRuleV2FromContract` selectors that `CleanversePoolGate.setRule` / `addRule` forward to are
/// absent from the deployed implementation, so those wrappers revert with empty data. Verified by
/// selector scan of the implementation bytecode, and by simulating `setRule` against the
/// already-registered production gate from its owner — it reverts there too, which rules out
/// "unregistered pool" as the cause.
///
/// Each rung's `minSubTier` is therefore applied off-chain, as part of the registration body that
/// `POST /api/cooperate/validator/register` accepts (Cleanverse submits the rule-setting tx itself
/// and returns its hash). This script's job ends at deploy + whitelist + initMarket; the rung bar is
/// set in the registration step printed under NEXT STEPS below.
///
/// Post-Deployment:
///   Each gate needs single-contract-mode registration, carrying its rung's sub-tier bar:
///     python3 offchain/cleanverse_client.py register --chain $CLEANVERSE_CHAIN \
///       --address <gate> --min-sub-tier <bar>
contract DeployLadder is Script {
    struct Rung {
        uint8 minSubTier;
        uint256 lltv;
        string label;
    }

    function run() external returns (address[3] memory gateAddresses, bytes32[3] memory marketIds) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address covenantAddr = vm.envAddress("COVENANT_CORE_ADDRESS");
        address validatorAddr = vm.envAddress("CLEANVERSE_VALIDATOR_ADDRESS");
        address loanToken = vm.envAddress("TEST_USDC_ADDRESS");
        address collateralToken = vm.envAddress("TEST_WBTC_ADDRESS");
        address oracleAddr = vm.envAddress("COVENANT_ORACLE_ADDRESS");
        uint256 maturity = vm.envUint("MATURITY_TIMESTAMP");
        address gateOwner = vm.envOr("GATE_OWNER", vm.addr(pk));

        Covenant covenant = Covenant(covenantAddr);
        IAPassComplianceValidator validator = IAPassComplianceValidator(validatorAddr);

        // Define rungs: minSubTier → LLTV
        Rung[3] memory rungs = [
            Rung({minSubTier: 30, lltv: LLTV_4, label: "Institutional (91.5%)"}),
            Rung({minSubTier: 20, lltv: LLTV_2, label: "Verified Professional (77%)"}),
            Rung({minSubTier: 10, lltv: LLTV_0, label: "Verified Retail (38.5%)"})
        ];

        vm.startBroadcast(pk);

        console.log("=========================================");
        console.log("Deploying Credit Ladder");
        console.log("Covenant Core   :", covenantAddr);
        console.log("Validator       :", validatorAddr);
        console.log("Loan Token      :", loanToken);
        console.log("Collateral Token:", collateralToken);
        console.log("Oracle          :", oracleAddr);
        console.log("Maturity        :", maturity);
        console.log("Gate Owner      :", gateOwner);
        console.log("=========================================");

        for (uint256 i = 0; i < 3; i++) {
            Rung memory rung = rungs[i];

            // Deploy gate
            CleanversePoolGate gate = new CleanversePoolGate(validator, gateOwner);
            gateAddresses[i] = address(gate);

            // NOTE: no `gate.setRule(...)` here. The deployed CCP V2 implementation does not carry
            // the `setRuleV2FromContract` selector, so the wrapper reverts (see the contract-level
            // docstring). `rung.minSubTier` is applied by the registration call printed at the end.

            // Whitelist gate if compliance mode enabled
            if (covenant.REQUIRE_COMPLIANCE() && !covenant.isApprovedGate(address(gate))) {
                covenant.setApprovedGate(address(gate), true);
            }

            // Build market with this rung's LLTV
            uint256 maxLifVal = maxLif(rung.lltv, LIQUIDATION_CURSOR_LOW);
            CollateralParams[] memory collat = new CollateralParams[](1);
            collat[0] =
                CollateralParams({token: collateralToken, lltv: rung.lltv, maxLif: maxLifVal, oracle: oracleAddr});

            Market memory market = Market({
                loanToken: loanToken,
                collateralParams: collat,
                maturity: maturity,
                rcfThreshold: 0,
                entryGate: address(gate),
                seizureGate: address(gate)
            });

            bytes32 marketId = covenant.initMarket(market);
            marketIds[i] = marketId;

            console.log("");
            console.log(string.concat("Rung ", vm.toString(i + 1), ": ", rung.label));
            console.log("  Gate          :", address(gate));
            console.log("  minSubTier    :", rung.minSubTier);
            console.log("  LLTV          :", rung.lltv);
            console.log("  Market ID     :", vm.toString(marketId));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=========================================");
        console.log("NEXT STEPS: Register each gate with Cleanverse");
        console.log("");
        for (uint256 i = 0; i < 3; i++) {
            console.log(
                string.concat(
                    "python3 offchain/cleanverse_client.py register --chain $CLEANVERSE_CHAIN --address ",
                    vm.toString(gateAddresses[i]),
                    " --min-sub-tier ",
                    vm.toString(rungs[i].minSubTier)
                )
            );
        }
        console.log("");
        console.log("Each registration uses EIP-191 personal_sign over chain + address_lowercase.");
        console.log("Registration carries the rung rule; Cleanverse submits the rule-setting tx.");
        console.log("Until a gate is registered its rule list is empty and it denies every wallet.");
        console.log("To change a bar later: cleanverse_client.py set-rule (no owner signature needed).");
        console.log("=========================================");
    }
}
