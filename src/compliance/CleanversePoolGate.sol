// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IEnterGate, ILiquidatorGate} from "../interfaces/IGate.sol";
import {IAPassComplianceValidator, RuleV2} from "./interfaces/IAPassComplianceValidator.sol";

/// @title CleanversePoolGate
/// @notice Market gate that reads the CVI Compliance Validator (CCP V2) directly.
/// @dev Deployed once per compliance profile, then registered against the validator in
/// **single-contract mode**: after deployment, call `POST /api/cooperate/validator/register` with
/// a personal-sign signature by the contract `owner` over the message
/// `chain + address(this).toLowerCase()` — see CCP V2 §5.4 and the Cleanverse reference snippet.
/// The gate MUST be `Ownable` for the API's server-side signer-vs-owner check to succeed, which is
/// why this contract exposes `owner()` and `transferOwnership`.
///
/// Every gate hook resolves to:
///   `validator.isRegistered(address(this)) ∧ validator.complianceVerify(address(this), account)`
///
/// Both reads are bounded-gas staticcalls that treat every failure — revert, malformed data, gas
/// exhaustion, unregistered pool, paused-and-therefore-denying pool — as `not eligible`. Fail-closed
/// is the correct posture: unavailable verification is never treated as clearance.
///
/// CCP V2 folds pause semantics inside `complianceVerify` returning `false`, so there is no
/// separate `paused()` call in this gate (unlike the earlier V1 shape).
///
/// **Rule management** — the owner may call `setRule / addRule / removeRule` to forward RuleV2
/// updates to the validator's `setRuleV2FromContract` family. Because the validator identifies the
/// pool by `msg.sender`, and this contract is the pool, `msg.sender = address(this)` from the
/// validator's point of view — exactly what CCP V2 §5.2 "business contract itself" expects.
///
/// **What ownership does and does not touch.** `owner` controls rule updates only. It cannot move
/// funds (the gate holds none), cannot alter which markets this gate is bound to (gate address is
/// part of market identity, immutable), and cannot break `_eligible` (the compliance staticcall
/// still fails closed on any failure). Rebinding the validator requires a new gate and therefore
/// a new market id.
contract CleanversePoolGate is IEnterGate, ILiquidatorGate {
    /// @dev Cap on gas per validator read. Bounds a misbehaving validator from consuming the whole
    /// trade's gas budget and converting a compliance denial into a market-wide DoS.
    uint256 internal constant VALIDATOR_GAS_LIMIT = 150_000;

    /// @notice The CVI Compliance Validator this gate is registered against. Immutable — rebinding
    /// requires a new gate contract, and therefore a new market id.
    IAPassComplianceValidator public immutable validator;

    /// @notice The gate owner. Signs the CCP V2 registration message and manages RuleV2 updates.
    /// @dev Deliberately mutable (via `transferOwnership`) so an institution can move gate control
    /// to a Safe multisig after the initial registration ceremony without redeploying the gate.
    /// Ownership transfer has no effect on market identity or compliance semantics.
    address public owner;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event RuleSet(RuleV2 rule);
    event RuleAdded(RuleV2 rule);
    event RuleRemoved(uint256 index);

    error ZeroValidator();
    error ZeroOwner();
    error NotOwner();

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    /// @param validator_ The CCP V2 validator on this chain.
    /// @param owner_ Initial owner — must be the wallet that will sign
    /// `POST /api/cooperate/validator/register`.
    constructor(IAPassComplianceValidator validator_, address owner_) {
        require(address(validator_) != address(0), ZeroValidator());
        require(owner_ != address(0), ZeroOwner());
        validator = validator_;
        owner = owner_;
        emit OwnerTransferred(address(0), owner_);
    }

    /* OWNERSHIP */

    /// @notice Transfers ownership to `newOwner`. Only the current owner may call.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), ZeroOwner());
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* RULE MANAGEMENT (owner-only, forwards to validator) */

    /// @notice Replaces every RuleV2 for this gate with a single new rule (validator's
    /// `setRuleV2FromContract`).
    function setRule(RuleV2 calldata rule) external onlyOwner {
        validator.setRuleV2FromContract(rule);
        emit RuleSet(rule);
    }

    /// @notice Appends a RuleV2 (OR semantics on the validator's rule list).
    function addRule(RuleV2 calldata rule) external onlyOwner {
        validator.addRuleV2FromContract(rule);
        emit RuleAdded(rule);
    }

    /// @notice Removes the rule at `index` from the validator's rule list for this gate.
    function removeRule(uint256 index) external onlyOwner {
        validator.removeRuleV2FromContract(index);
        emit RuleRemoved(index);
    }

    /// @notice Reads back the RuleV2 list configured for this gate.
    function getRules() external view returns (RuleV2[] memory) {
        return validator.getRulesV2(address(this));
    }

    /* GATE HOOKS */

    /// @inheritdoc IEnterGate
    function canIncreaseCredit(address account) external view returns (bool) { return _eligible(account); }

    /// @inheritdoc IEnterGate
    function canIncreaseDebt(address account) external view returns (bool) { return _eligible(account); }

    /// @inheritdoc ILiquidatorGate
    function canLiquidate(address account) external view returns (bool) { return _eligible(account); }

    /* INTERNAL */

    /// @dev `isRegistered → complianceVerify`, short-circuiting on the first denial. Any failure
    /// denies. Pause is folded into `complianceVerify` per CCP V2, so no separate `paused()` call.
    function _eligible(address account) internal view returns (bool) {
        if (!_readBool(abi.encodeCall(IAPassComplianceValidator.isRegistered, (address(this))))) return false;
        return _readBool(abi.encodeCall(IAPassComplianceValidator.complianceVerify, (address(this), account)));
    }

    /// @dev Bounded staticcall, boolean-decoded. Any failure (revert, short return, no code) → `false`.
    function _readBool(bytes memory data) internal view returns (bool) {
        (bool ok, bytes memory result) = address(validator).staticcall{gas: VALIDATOR_GAS_LIMIT}(data);
        if (!ok || result.length < 32) return false;
        return abi.decode(result, (bool));
    }
}
