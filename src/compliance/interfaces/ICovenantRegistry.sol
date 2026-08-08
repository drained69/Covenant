// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity >=0.8.0;

/// @notice Action a participant is attempting, evaluated against a compliance policy.
enum ComplianceAction {
    Lend,
    Borrow,
    Liquidate
}

/// @notice On-chain attestation that a wallet was verified by an off-chain compliance provider.
/// @dev Cleanverse is a REST service with no on-chain component: it performs KYB, LEI lookup, sanctions
/// screening (OFAC SDN, UN consolidated), FATF jurisdiction risk, document and liveness checks, and wallet
/// risk scoring, all off-chain. Covenant therefore supplies the missing on-chain layer — this attestation —
/// which authorised attesters write after reading Cleanverse. A wallet with no attestation has an all-zero
/// struct.
struct Identity {
    /// @notice Hash of the off-chain Cleanverse verification record this attestation derives from.
    /// @dev A commitment, not the record itself: it lets an auditor tie an on-chain position back to a
    /// specific Cleanverse verification without publishing personal data on-chain. Zero when unset.
    bytes32 credentialId;
    /// @notice ISO 3166-1 numeric country code of the verified entity.
    uint16 jurisdiction;
    /// @notice Unix timestamp at which the attestation became valid.
    uint64 issuedAt;
    /// @notice Unix timestamp after which the attestation is stale. Zero means no expiry.
    uint64 expiresAt;
    /// @notice True once revoked. Revocation is terminal for this credential id.
    bool revoked;
}

/// @notice Read interface consumed by CovenantGate.
/// @dev Deliberately narrow and view-only. The gate depends on nothing else, so the attestation source can
/// be replaced — a different provider, a multi-attester quorum, a ZK attestation scheme — without touching
/// the gate or the markets bound to it.
interface ICovenantRegistry {
    /// @notice Returns the attestation bound to `account`.
    /// @dev Returns a zero-valued struct when `account` has no attestation.
    function identityOf(address account) external view returns (Identity memory);

    /// @notice Returns whether `account` is permitted to perform `action` under `policyId`.
    /// @dev Encodes the outcome of jurisdiction rules, sanctions screening, and asset eligibility as
    /// determined off-chain and attested here.
    function checkPolicy(bytes32 policyId, address account, ComplianceAction action)
        external
        view
        returns (bool allowed);
}
