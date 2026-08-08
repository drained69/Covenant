// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.8.0;

/// @notice On-chain rule struct as defined by CCP V2 (Cleanverse Compliance Protocol).
/// @dev Fields within a single RuleV2 are AND-composed. Multiple RuleV2s per pool are OR-composed —
/// a user is compliant if they match any one rule. `poolCountryBitmap` is checked via bitwise AND
/// against the user's country bitmap; bit positions are ISO 3166-1 *numeric* codes.
///
/// Field-for-field identical to the `RuleV2` in the CVA Integration Guide's `IComplianceRule`.
///
/// **Encoding caveat**: the REST layer (`/validator/register`, `/validator/set_rule`) still exposes
/// the legacy `is_black_list` + `countries` alpha-2 string array rather than `poolCountryBitmap`.
/// The guide states the platform handles the compatibility mapping, but alpha-2 ("US") carries no
/// numeric code ("840"), so a country-restricted rule set over REST cannot be assumed to produce
/// the bitmap this struct expects. Covenant's live rule is fully permissive (all fields zero), so
/// the gap is currently unexercised — verify the mapping with Cleanverse before shipping a
/// country-restricted rule.
struct RuleV2 {
    /// @notice Allowed CVI group. Empty (`bytes2(0)`) = no restriction.
    bytes2 allowedGroup;
    /// @notice Allowed CVI sub-group. Empty = no restriction.
    bytes2 allowedSubGroup;
    /// @notice Minimum CVI tier. Zero = no restriction.
    uint8 minTier;
    /// @notice Minimum CVI sub-tier. Zero = no restriction.
    uint8 minSubTier;
    /// @notice Country bitmap. Zero = no restriction. Non-zero denies unless the user's country bit is set.
    uint256 poolCountryBitmap;
}

/// @notice On-chain interface of the CVI Compliance Validator (CCP V2).
/// @dev The validator is a single global contract per chain that indexes many pools by address. A
/// "pool" here is any contract that has been registered against the validator — a market gate, a
/// wrapped A-Token, a factory child, or a single-contract business.
///
/// Two registration modes are supported:
///  - **Factory mode**: a factory holding `REGISTER_ROLE` calls `registerV2` / `registerApass` on
///    every new child pool. Authorised via `POST /api/cooperate/validator/apply`.
///  - **Single-contract mode**: the business contract is deployed first, then registered via
///    `POST /api/cooperate/validator/register` with an EIP-191 personal_sign signature over the
///    plain lowercase concatenation `chain + contract_address` (no keccak, no separator).
///
/// Covenant's on-chain integration uses single-contract mode: each `CleanversePoolGate` and each
/// `WrappedAToken` is a distinct "pool address" and is registered with the validator individually
/// after deployment. The gate/token then calls `complianceVerify(address(this), user)` inline.
///
/// **Fail-closed by convention**: callers should staticcall these methods with bounded gas and
/// interpret every failure as `false`. The gate and wrapper both do this — see their `_readBool`.
interface IAPassComplianceValidator {
    /* Permissionless verification — the two methods on-chain integrations call */

    /// @notice Returns whether `userAddress` satisfies any RuleV2 configured for `poolAddress`.
    /// @dev Multiple rules per pool are OR-composed. A wallet with no matching CVI returns `false`.
    ///
    /// A **paused** pool does not return `false` — the read itself fails (the REST mirror of this
    /// call surfaces error `12027`, "validator on-chain read failed"). Callers that staticcall this
    /// with bounded gas therefore see a revert, which `_readBool` folds into `false`. That is the
    /// correct fail-closed outcome, but it means "paused" and "ineligible" are indistinguishable
    /// on-chain. Pause state is only separately observable off-chain via
    /// `POST /api/cooperate/validator/is_paused`.
    function complianceVerify(address poolAddress, address userAddress) external view returns (bool);

    /// @notice Returns whether `poolAddress` has been registered with the validator.
    /// @dev A gate bound to an unregistered pool is misconfigured; callers deny until the operator
    /// completes the API registration step.
    function isRegistered(address poolAddress) external view returns (bool);

    /* Rule management — called by the business contract itself (onlyOwner in Covenant's case)
     *
     * These mirror the token-side `setRuleV2FromToken` / `addRuleV2FromToken` /
     * `removeRuleV2FromToken` in the CVA guide's `IATokenPolicy`, with `*FromContract` naming for
     * the pool-side validator. The guide documents only the token-side names, and the REST docs
     * document only the off-chain equivalents (`/validator/set_rule`, `/add_rule`, `/remove_rule`,
     * where Cleanverse submits the write and returns a `tx_hash`, failing with error `12026`).
     *
     * The `*FromContract` selectors below are therefore grounded in on-chain behaviour rather than
     * in either document: they are confirmed working against the live Monad validator, where
     * `getRulesV2(gate)` returns the rule this gate set. Re-verify the selectors if Cleanverse
     * redeploys the validator implementation behind its proxy.
     */

    /// @notice Replaces every RuleV2 for `msg.sender` with a single new rule.
    function setRuleV2FromContract(RuleV2 calldata rule) external;

    /// @notice Appends a RuleV2 to `msg.sender`'s rule list (OR semantics).
    function addRuleV2FromContract(RuleV2 calldata rule) external;

    /// @notice Removes the rule at `index` from `msg.sender`'s rule list.
    function removeRuleV2FromContract(uint256 index) external;

    /// @notice Returns the full RuleV2 list configured for `poolAddress`.
    function getRulesV2(address poolAddress) external view returns (RuleV2[] memory);
}
