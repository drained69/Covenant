// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {IERC20} from "../interfaces/IERC20.sol";
import {IAPassComplianceValidator} from "./interfaces/IAPassComplianceValidator.sol";
import {IWrappedAToken} from "./interfaces/IWrappedAToken.sol";

/// @title WrappedAToken
/// @notice Compliance-aware 1:1 wrapper for an origin ERC-20, gated by the CVI Compliance Validator (CCP V2).
/// @dev The single interesting property of this contract is that every inbound transfer (mint on deposit,
/// `transfer`, `transferFrom`) short-circuits to a revert when the recipient is neither exempt nor
/// verified by the bound validator. The gas-bounded, fail-closed `_eligible` helper has the same shape
/// as `CleanversePoolGate._eligible` so that the token and the market gate agree byte-for-byte on who
/// is eligible: a wallet the gate would refuse to open a position for is also a wallet the loan token
/// itself would refuse to be transferred to.
///
/// The wrapper itself is a "pool" from the validator's point of view. After deployment, it must be
/// registered against the validator via `POST /api/cooperate/validator/register` (or, in factory mode,
/// `IAPassComplianceValidator.registerApass(poolAddress, address(this))`) so that
/// `validator.complianceVerify(address(this), user)` can answer.
///
/// Design invariants:
///
/// - **Validator is immutable.** Rebinding requires a new token (and therefore a new market), which
///   prevents silently repointing a live loan token at a laxer policy.
/// - **Only inbound transfers are gated.** `withdraw` (burn-to-origin) is intentionally ungated so a
///   holder whose credential is later revoked can reclaim their locked origin balance — this mirrors
///   the Covenant engine's "gate increases, not exits" rule.
/// - **Exempt set is minimal.** The token owner may register infrastructure addresses (the Covenant
///   core, a router, a bundler) that need to receive the wrapped token as pass-through liquidity. This
///   is the on-chain analogue of Cleanverse's institutional-deposit whitelist and is deliberately narrow.
/// - **Fail-closed reads.** Any validator failure — revert, malformed response, gas exhaustion,
///   unregistered pool, paused-pool-denying — resolves to `not eligible`. Unavailable verification is
///   never treated as clearance.
///
/// A `WrappedAToken` deployed as the loan token of a Covenant market makes the flash-loan surface a
/// non-issue: `covenant.flashLoan([waUSDC], ..., callback)` calls `safeTransfer(waUSDC, callback, amt)`,
/// which routes through `_transfer` here, which reverts before the callback ever executes when the
/// callback wallet is not verified.
contract WrappedAToken is IWrappedAToken {
    /// @dev Cap on gas per validator read. Bounds a misbehaving validator from consuming the whole
    /// transfer's gas budget. Same cap as `CleanversePoolGate`.
    uint256 internal constant VALIDATOR_GAS_LIMIT = 150_000;

    /// @inheritdoc IWrappedAToken
    IERC20 public immutable origin;

    /// @inheritdoc IWrappedAToken
    IAPassComplianceValidator public immutable validator;

    /// @notice Address permitted to update the exempt set and transfer ownership.
    address public owner;

    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @inheritdoc IWrappedAToken
    mapping(address => bool) public isExempt;

    error ZeroOrigin();
    error ZeroValidator();
    error ZeroOwner();
    error ZeroAddress();
    error ZeroAmount();
    error NotOwner();
    /// @notice Thrown by every inbound transfer path when `recipient` fails the pool's eligibility check.
    error RecipientNotCompliant(address recipient);
    error InsufficientBalance();
    error InsufficientAllowance();
    error OriginTransferFailed();
    /// @notice Thrown when `decimals` disagrees with the origin token's own `decimals()`.
    error DecimalsMismatch(uint8 expected, uint8 actual);
    /// @notice Thrown on reentrant `deposit`/`withdraw`.
    error Reentrancy();

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event ExemptSet(address indexed account, bool exempt);
    event Deposit(address indexed sender, address indexed receiver, uint256 assets);
    event Withdraw(address indexed sender, address indexed receiver, uint256 assets);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    /// @dev Reentrancy latch for the wrap/unwrap paths. 1 = unlocked, 2 = locked.
    uint256 private _lock = 1;

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    /// @dev `deposit` and `withdraw` both make external calls into the origin token. An origin token
    /// with transfer callbacks (ERC-777 and friends) could otherwise reenter mid-accounting. The
    /// pure-ERC20 transfer paths are deliberately NOT guarded — they make no external calls other
    /// than the bounded compliance staticcall, and guarding them would break legitimate composition.
    modifier nonReentrant() {
        require(_lock == 1, Reentrancy());
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param _origin The origin ERC-20 this wrapper locks 1:1 (e.g. native USDC).
    /// @param _validator The CVI Compliance Validator consulted on every inbound transfer.
    /// @param _owner Address permitted to manage the exempt set. Typically an institution's governance
    /// multisig or the same owner as the paired `CovenantRegistry`.
    /// @param _name Display name (e.g. "Wrapped Access USDC").
    /// @param _symbol Symbol (e.g. "waUSDC").
    /// @param _decimals Must match the origin token's decimals so `deposit`/`withdraw` remain 1:1 by unit.
    constructor(IERC20 _origin, IAPassComplianceValidator _validator, address _owner, string memory _name, string memory _symbol, uint8 _decimals) {
        require(address(_origin) != address(0), ZeroOrigin());
        require(address(_validator) != address(0), ZeroValidator());
        require(_owner != address(0), ZeroOwner());

        // The 1:1 wrap is by raw unit, so a `decimals` that disagrees with the origin token silently
        // misprices every downstream display and oracle scaling calculation. Validate where the origin
        // exposes `decimals()`; tokens that omit it (it is optional in ERC-20) are accepted as-is.
        (bool hasDecimals, bytes memory raw) = address(_origin).staticcall(abi.encodeWithSignature("decimals()"));
        if (hasDecimals && raw.length >= 32) {
            uint8 originDecimals = abi.decode(raw, (uint8));
            require(originDecimals == _decimals, DecimalsMismatch(_decimals, originDecimals));
        }

        origin = _origin;
        validator = _validator;
        owner = _owner;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;

        emit OwnerTransferred(address(0), _owner);
    }

    /* OWNER */

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), ZeroAddress());
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Adds or removes an exempt address.
    /// @dev Exemption bypasses only the *compliance* check on receipt. It does not grant minting or spend
    /// permission and has no effect on withdrawals (which are ungated already).
    function setExempt(address account, bool exempt) external onlyOwner {
        require(account != address(0), ZeroAddress());
        isExempt[account] = exempt;
        emit ExemptSet(account, exempt);
    }

    /* WRAP / UNWRAP */

    /// @inheritdoc IWrappedAToken
    /// @dev Assumes a well-behaved origin token — fee-on-transfer and rebasing tokens are out of scope,
    /// and the wrapper's `totalSupply == origin.balanceOf(this)` invariant depends on that assumption.
    /// The constructor's `decimals()` check catches the most common mis-pairing.
    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256) {
        require(assets != 0, ZeroAmount());
        require(receiver != address(0), ZeroAddress());
        require(_eligible(receiver), RecipientNotCompliant(receiver));

        _pullOrigin(msg.sender, assets);

        totalSupply += assets;
        unchecked {
            // safe: totalSupply just grew by `assets`, so the sum below cannot overflow.
            balanceOf[receiver] += assets;
        }

        emit Deposit(msg.sender, receiver, assets);
        emit Transfer(address(0), receiver, assets);
        return assets;
    }

    /// @inheritdoc IWrappedAToken
    function withdraw(uint256 assets, address receiver) external nonReentrant returns (uint256) {
        require(assets != 0, ZeroAmount());
        require(receiver != address(0), ZeroAddress());

        uint256 bal = balanceOf[msg.sender];
        require(bal >= assets, InsufficientBalance());
        unchecked {
            balanceOf[msg.sender] = bal - assets;
            totalSupply -= assets;
        }

        // Origin release is intentionally NOT compliance-gated — this is the exit path.
        _pushOrigin(receiver, assets);

        emit Transfer(msg.sender, address(0), assets);
        emit Withdraw(msg.sender, receiver, assets);
        return assets;
    }

    /* ERC-20 */

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, InsufficientAllowance());
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    /* INTERNAL */

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), ZeroAddress());
        require(_eligible(to), RecipientNotCompliant(to));

        uint256 bal = balanceOf[from];
        require(bal >= amount, InsufficientBalance());
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    /// @dev `isRegistered(this) → complianceVerify(this, account)`, short-circuiting on the first
    /// denial. Exempt addresses bypass the validator read entirely. Any failure denies. Same shape
    /// as `CleanversePoolGate._eligible`, so the token and the market gate cannot disagree. Per CCP
    /// V2, pause is folded into `complianceVerify` returning false — no separate `paused()` call.
    function _eligible(address account) internal view returns (bool) {
        if (isExempt[account]) return true;
        if (!_readBool(abi.encodeCall(IAPassComplianceValidator.isRegistered, (address(this))))) return false;
        return _readBool(abi.encodeCall(IAPassComplianceValidator.complianceVerify, (address(this), account)));
    }

    function _readBool(bytes memory data) internal view returns (bool) {
        (bool ok, bytes memory result) = address(validator).staticcall{gas: VALIDATOR_GAS_LIMIT}(data);
        if (!ok || result.length < 32) return false;
        return abi.decode(result, (bool));
    }

    /// @dev USDT-style non-standard ERC-20s return no bytes on success; treat empty return as success and
    /// any non-empty non-`true` return as failure.
    function _pullOrigin(address from, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            address(origin).call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), OriginTransferFailed());
    }

    function _pushOrigin(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(origin).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), OriginTransferFailed());
    }
}
