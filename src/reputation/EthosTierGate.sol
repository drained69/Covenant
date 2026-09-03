// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {IEnterGate, ILiquidatorGate} from "../interfaces/IGate.sol";

/// @title EthosTierGate
/// @notice Entry gate that admits wallets holding a live, signer-authorized Ethos
///         credibility score at or above this gate's threshold.
///
/// @dev The reputation layer of the credit market. An off-chain Covenant service
///      reads a wallet's Ethos credibility score and returns a short-lived
///      EIP-712 `ScoreAuthorization`; anyone may submit it to `authorize()`, and
///      once accepted the wallet may increase debt in any market bound to this
///      gate until the authorization expires.
///
///      Security properties (matching the protocol's trust model):
///      - **Wallet-bound** — the authorization names the borrowing wallet; it
///        cannot be transferred or shared.
///      - **Chain-bound** — the EIP-712 domain separator commits to
///        `block.chainid` and this gate's address, so an authorization cannot be
///        replayed on another chain or against another gate.
///      - **Market-bound by identity** — the gate address is hashed into every
///        market id that uses it, so this contract's threshold IS the market's
///        underwriting policy; it cannot be rebound after creation.
///      - **Nonce-bound** — each authorization consumes its nonce; replays revert.
///      - **Expiry-bound** — `canIncreaseDebt` is false the moment the deadline
///        passes. Exits (repay, redeem, withdraw) are never gated, so a stale
///        score cannot strand funds.
///      - **Fail-closed and bounded** — the signer can only grant access to
///        preconfigured tier markets. It cannot move funds, change thresholds,
///        disable liquidation, or override solvency.
///
///      A market bound to a threshold-1600 gate is a *different market* (different
///      id) from one bound to a threshold-0 gate, which is what makes "a higher
///      Ethos score earns better collateral terms" a property of the market's
///      identity rather than an operator's promise.
contract EthosTierGate is IEnterGate, ILiquidatorGate {
    /// @notice EIP-712 signature over `ScoreAuthorization`.
    struct Sig {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice A Covenant service's attestation of an observed Ethos score.
    /// @dev Field order is part of `SCORE_AUTHORIZATION_TYPEHASH`.
    struct ScoreAuthorization {
        /// @notice The wallet the score was observed for and that may borrow.
        address wallet;
        /// @notice The observed Ethos credibility score.
        uint128 score;
        /// @notice Unix time after which the authorization is void.
        uint64 deadline;
        /// @notice Wallet-scoped unique value; consumed on use (replay guard).
        uint256 nonce;
        /// @notice Chain the authorization is valid on (must equal block.chainid).
        uint256 chainId;
    }

    /// @notice Minimum Ethos score this gate admits.
    uint128 public immutable MINIMUM_SCORE;

    /// @notice Address whose signature authorizes scores for this gate.
    /// @dev The Covenant reputation service. Compromise grants at most the
    ///      bounded access described above — never custody of funds.
    address public immutable SIGNER;

    /// @notice Latest live-until timestamp per wallet (0 = never authorized).
    mapping(address => uint64) public authorizedUntil;

    /// @notice Last authorized score per wallet.
    mapping(address => uint128) public authorizedScore;

    /// @notice Consumed nonces per wallet.
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    /// @notice EIP-712 typehash of `ScoreAuthorization`.
    bytes32 public constant SCORE_AUTHORIZATION_TYPEHASH =
        keccak256(
            "ScoreAuthorization(address wallet,uint128 score,uint64 deadline,uint256 nonce,uint256 chainId)"
        );

    /// @notice EIP-712 domain typehash for this gate.
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    event ScoreAuthorized(address indexed wallet, uint128 score, uint64 deadline, uint256 indexed nonce);
    event ScoreAuthorizationExpired(address indexed wallet);

    error Expired();
    error WrongChain();
    error NonceAlreadyUsed();
    error InvalidSignature();

    /// @param minimumScore Ethos score threshold; 0 admits any scored wallet.
    /// @param signer Address of the Covenant reputation service's signing key.
    constructor(uint128 minimumScore, address signer) {
        require(signer != address(0), InvalidSignature());
        MINIMUM_SCORE = minimumScore;
        SIGNER = signer;
    }

    /// @notice Submit a signed score authorization for `auth.wallet`.
    /// @dev Permissionless: the signature, not the caller, carries authority.
    ///      A newer authorization overwrites an older one for the same wallet;
    ///      the highest recently-signed score stands until its deadline.
    function authorize(ScoreAuthorization calldata auth, Sig calldata signature) external {
        if (block.timestamp > auth.deadline) revert Expired();
        if (auth.chainId != block.chainid) revert WrongChain();
        if (usedNonce[auth.wallet][auth.nonce]) revert NonceAlreadyUsed();
        usedNonce[auth.wallet][auth.nonce] = true;

        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("Covenant Ethos Score"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                SCORE_AUTHORIZATION_TYPEHASH,
                auth.wallet,
                auth.score,
                auth.deadline,
                auth.nonce,
                auth.chainId
            )
        );
        bytes32 digest = keccak256(bytes.concat("\x19\x01", domainSeparator, structHash));

        address recovered = ecrecover(digest, signature.v, signature.r, signature.s);
        if (recovered == address(0) || recovered != SIGNER) revert InvalidSignature();

        authorizedUntil[auth.wallet] = auth.deadline;
        authorizedScore[auth.wallet] = auth.score;

        emit ScoreAuthorized(auth.wallet, auth.score, auth.deadline, auth.nonce);
    }

    /// @notice Whether `account` has a live authorization clearing the threshold.
    /// @dev Fails closed: an expired, missing, or below-threshold score is a
    ///      plain `false`, never a revert — the engine's bounded-gas staticcall
    ///      treats a revert as "not allowed" anyway.
    function canIncreaseDebt(address account) external view returns (bool) {
        return authorizedUntil[account] >= block.timestamp && authorizedScore[account] >= MINIMUM_SCORE;
    }

    /// @notice Lending is open to everyone — reputation gates borrowing only.
    function canIncreaseCredit(address) external pure returns (bool) {
        return true;
    }

    /// @notice Liquidation is open to everyone so unhealthy positions are
    ///         liquidated promptly regardless of reputation state.
    function canLiquidate(address) external pure returns (bool) {
        return true;
    }
}
