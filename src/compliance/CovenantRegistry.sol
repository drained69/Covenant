// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 drained99
pragma solidity 0.8.34;

import {ComplianceAction, Identity, ICovenantRegistry} from "./interfaces/ICovenantRegistry.sol";

/// @title CovenantRegistry
/// @notice On-chain attestation registry: the bridge between off-chain compliance providers and the gate.
/// @dev Cleanverse performs verification off-chain over REST — KYB and LEI lookup, OFAC SDN and UN sanctions
/// screening, FATF jurisdiction risk, document and liveness checks, and wallet risk scoring. None of it is
/// on-chain, and a `view` gate cannot make an HTTP request. This contract is the missing link: authorised
/// attesters project Cleanverse verdicts on-chain, and CovenantGate reads them inside the settlement path.
///
/// Design properties:
///
/// - **No personal data on-chain.** Only a hash commitment to the off-chain record, plus the minimum needed
///   to enforce policy: jurisdiction, validity window, revocation.
/// - **Events are the audit product.** Every write emits a record naming the attester and the source
///   commitment, so a regulator can reconstruct who was cleared, by whom, and on what basis, and join it
///   against the market's own position events.
/// - **Revocation is terminal per credential.** A revoked credential can never be un-revoked; restoring
///   access requires a fresh attestation with a new credential id, which preserves the audit history.
/// - **Least authority.** Attesters may only write attestations. They cannot move funds, alter markets, or
///   grant themselves privileges.
contract CovenantRegistry is ICovenantRegistry {
    /* STORAGE */

    /// @notice Address permitted to manage attesters and transfer ownership.
    address public owner;

    /// @notice Attesters permitted to write attestations, keyed by address.
    mapping(address => bool) public isAttester;

    /// @notice Attestation per account.
    mapping(address => Identity) internal _identity;

    /// @notice Bitmask of permitted `ComplianceAction`s per policy per account.
    /// @dev Bit `i` set means `ComplianceAction(i)` is permitted. A bitmask keeps a full permission set in a
    /// single slot, so clearing an account for several actions costs one write rather than one per action.
    mapping(bytes32 => mapping(address => uint256)) internal _permits;

    /* EVENTS */

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AttesterSet(address indexed attester, bool enabled);

    /// @notice Emitted when an attestation is written.
    /// @param account The attested wallet.
    /// @param credentialId Commitment to the off-chain verification record.
    /// @param jurisdiction ISO 3166-1 numeric country code.
    /// @param expiresAt Expiry timestamp, or zero for none.
    /// @param attester The attester that wrote the record.
    event AttestationRecorded(
        address indexed account,
        bytes32 indexed credentialId,
        uint16 jurisdiction,
        uint64 issuedAt,
        uint64 expiresAt,
        address indexed attester
    );

    /// @notice Emitted when an attestation is revoked.
    /// @param reason Machine-readable revocation cause, e.g. a sanctions or expiry code.
    event AttestationRevoked(
        address indexed account, bytes32 indexed credentialId, address indexed attester, bytes32 reason
    );

    /// @notice Emitted when a policy permission changes.
    event PolicyPermitSet(
        bytes32 indexed policyId,
        address indexed account,
        ComplianceAction action,
        bool allowed,
        address indexed attester
    );

    /* ERRORS */

    error NotOwner();
    error NotAttester();
    error ZeroAddress();
    error ZeroCredentialId();
    error AlreadyRevoked();
    error CredentialIdInUse();
    error InvalidValidityWindow();
    /// @notice Thrown when `setPolicyPermits` receives parallel arrays of differing length.
    error LengthMismatch();

    /* MODIFIERS */

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    modifier onlyAttester() {
        require(isAttester[msg.sender], NotAttester());
        _;
    }

    /// @param initialOwner Address that may manage attesters. Typically an institution's governance multisig.
    constructor(address initialOwner) {
        require(initialOwner != address(0), ZeroAddress());

        owner = initialOwner;
        emit OwnerTransferred(address(0), initialOwner);
    }

    /* OWNER */

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), ZeroAddress());

        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Enables or disables an attester.
    function setAttester(address attester, bool enabled) external onlyOwner {
        require(attester != address(0), ZeroAddress());

        isAttester[attester] = enabled;
        emit AttesterSet(attester, enabled);
    }

    /* ATTESTER */

    /// @notice Records an attestation for `account`.
    /// @dev Overwrites any previous attestation. Reusing the credential id of an already-revoked attestation
    /// is rejected: revocation must be permanent for a given id, otherwise the audit trail could be
    /// rewritten by re-attesting under the same reference.
    function attest(
        address account,
        bytes32 credentialId,
        uint16 jurisdiction,
        uint64 issuedAt,
        uint64 expiresAt
    ) external onlyAttester {
        require(account != address(0), ZeroAddress());
        require(credentialId != bytes32(0), ZeroCredentialId());
        require(expiresAt == 0 || expiresAt > issuedAt, InvalidValidityWindow());

        Identity storage existing = _identity[account];
        require(!(existing.revoked && existing.credentialId == credentialId), CredentialIdInUse());

        _identity[account] =
            Identity({
                credentialId: credentialId,
                jurisdiction: jurisdiction,
                issuedAt: issuedAt,
                expiresAt: expiresAt,
                revoked: false
            });

        emit AttestationRecorded(account, credentialId, jurisdiction, issuedAt, expiresAt, msg.sender);
    }

    /// @notice Revokes `account`'s attestation.
    /// @dev Does not clear policy permits. The gate requires a live attestation *and* a policy permit, so
    /// revocation alone is sufficient to deny; leaving permits intact preserves the record of what had been
    /// granted.
    function revoke(address account, bytes32 reason) external onlyAttester {
        Identity storage identity = _identity[account];
        require(identity.credentialId != bytes32(0), ZeroCredentialId());
        require(!identity.revoked, AlreadyRevoked());

        identity.revoked = true;

        emit AttestationRevoked(account, identity.credentialId, msg.sender, reason);
    }

    /// @notice Sets whether `account` may perform `action` under `policyId`.
    function setPolicyPermit(bytes32 policyId, address account, ComplianceAction action, bool allowed)
        external
        onlyAttester
    {
        _setPolicyPermit(policyId, account, action, allowed);
    }

    /// @notice Sets several permissions for `account` under `policyId` in one call.
    /// @dev The common attester path clears an institution for lending and borrowing together; batching
    /// keeps that a single transaction and a single storage write.
    function setPolicyPermits(
        bytes32 policyId,
        address account,
        ComplianceAction[] calldata actions,
        bool[] calldata allowed
    ) external onlyAttester {
        require(actions.length == allowed.length, LengthMismatch());

        for (uint256 i; i < actions.length; ++i) {
            _setPolicyPermit(policyId, account, actions[i], allowed[i]);
        }
    }

    /* VIEWS */

    /// @inheritdoc ICovenantRegistry
    function identityOf(address account) external view returns (Identity memory) {
        return _identity[account];
    }

    /// @inheritdoc ICovenantRegistry
    function checkPolicy(bytes32 policyId, address account, ComplianceAction action)
        external
        view
        returns (bool)
    {
        return _permits[policyId][account] & _mask(action) != 0;
    }

    /// @notice Returns the raw permission bitmask for `account` under `policyId`.
    function policyPermits(bytes32 policyId, address account) external view returns (uint256) {
        return _permits[policyId][account];
    }

    /* INTERNAL */

    function _setPolicyPermit(bytes32 policyId, address account, ComplianceAction action, bool allowed)
        internal
    {
        require(account != address(0), ZeroAddress());

        uint256 mask = _mask(action);
        if (allowed) {
            _permits[policyId][account] |= mask;
        } else {
            _permits[policyId][account] &= ~mask;
        }

        emit PolicyPermitSet(policyId, account, action, allowed, msg.sender);
    }

    function _mask(ComplianceAction action) internal pure returns (uint256) {
        return 1 << uint256(uint8(action));
    }
}
