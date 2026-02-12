// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title TrustedIssuerRegistry
 * @dev Registry of trusted certificate issuers for ZK verification
 * @notice Manages certificate authorities whose signatures are trusted
 *
 * Certificate issuers are entities that can issue verifiable credentials:
 * - Government agencies (death certificates, identity documents)
 * - Medical institutions (incapacitation certificates)
 * - Courts (legal rulings, probate documents)
 *
 * The ZK proof verifies that a certificate was signed by a trusted issuer
 * without revealing the certificate contents on-chain.
 */
contract TrustedIssuerRegistry is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // =============================================================================
    // STRUCTS
    // =============================================================================

    /**
     * @dev Issuer category for classification
     */
    enum IssuerCategory {
        Government,         // Government agencies
        Medical,            // Medical institutions
        Legal,              // Courts and legal entities
        Financial,          // Financial institutions
        Custom              // Other trusted entities
    }

    /**
     * @dev Information about a trusted issuer
     */
    struct IssuerInfo {
        bytes32 issuerId;
        string name;                    // Human-readable name
        IssuerCategory category;
        bytes32 publicKeyHash;          // Hash of issuer's public key
        string jurisdiction;            // e.g., "US", "EU", "UK"
        bool isActive;
        uint256 registeredAt;
        uint256 expiresAt;              // 0 = no expiration
        uint256 certificatesIssued;     // Counter for tracking
    }

    /**
     * @dev Certificate type that an issuer can issue
     */
    struct CertificateType {
        bytes32 typeId;
        string typeName;                // e.g., "death_certificate", "medical_incapacitation"
        IssuerCategory requiredCategory;
        bool requiresMultipleIssuers;   // Some certs need multiple authorities
        uint256 validityPeriod;         // How long the cert is valid (0 = permanent)
    }

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @dev Mapping of issuer ID to info
    mapping(bytes32 => IssuerInfo) public issuers;

    /// @dev List of all issuer IDs
    bytes32[] public issuerList;

    /// @dev Mapping of public key hash to issuer ID (for signature verification)
    mapping(bytes32 => bytes32) public publicKeyToIssuer;

    /// @dev Mapping of certificate type ID to type info
    mapping(bytes32 => CertificateType) public certificateTypes;

    /// @dev Mapping of issuer ID to certificate types they can issue
    mapping(bytes32 => mapping(bytes32 => bool)) public issuerCanIssueCertType;

    /// @dev Mapping of jurisdiction to active issuers
    mapping(string => bytes32[]) public issuersByJurisdiction;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event IssuerRegistered(
        bytes32 indexed issuerId,
        string name,
        IssuerCategory category,
        string jurisdiction
    );
    event IssuerDeactivated(bytes32 indexed issuerId, string reason);
    event IssuerReactivated(bytes32 indexed issuerId);
    event IssuerExpired(bytes32 indexed issuerId);
    event CertificateTypeRegistered(bytes32 indexed typeId, string typeName);
    event IssuerAuthorizedForCertType(bytes32 indexed issuerId, bytes32 indexed typeId);
    event IssuerRevokedFromCertType(bytes32 indexed issuerId, bytes32 indexed typeId);

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() Ownable(msg.sender) {
        // Register default certificate types
        _registerDefaultCertificateTypes();
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Register a new trusted issuer
     * @param _issuerId Unique identifier for the issuer
     * @param _name Human-readable name
     * @param _category Issuer category
     * @param _publicKeyHash Hash of the issuer's public key (for signature verification)
     * @param _jurisdiction Jurisdiction code (e.g., "US", "EU")
     * @param _expiresAt Expiration timestamp (0 for no expiration)
     */
    function registerIssuer(
        bytes32 _issuerId,
        string calldata _name,
        IssuerCategory _category,
        bytes32 _publicKeyHash,
        string calldata _jurisdiction,
        uint256 _expiresAt
    ) external onlyOwner {
        require(_issuerId != bytes32(0), "Invalid issuer ID");
        require(issuers[_issuerId].issuerId == bytes32(0), "Issuer already registered");
        require(_publicKeyHash != bytes32(0), "Invalid public key hash");
        require(publicKeyToIssuer[_publicKeyHash] == bytes32(0), "Public key already registered");

        issuers[_issuerId] = IssuerInfo({
            issuerId: _issuerId,
            name: _name,
            category: _category,
            publicKeyHash: _publicKeyHash,
            jurisdiction: _jurisdiction,
            isActive: true,
            registeredAt: block.timestamp,
            expiresAt: _expiresAt,
            certificatesIssued: 0
        });

        issuerList.push(_issuerId);
        publicKeyToIssuer[_publicKeyHash] = _issuerId;
        issuersByJurisdiction[_jurisdiction].push(_issuerId);

        emit IssuerRegistered(_issuerId, _name, _category, _jurisdiction);
    }

    /**
     * @dev Deactivate an issuer
     * @param _issuerId The issuer to deactivate
     * @param _reason Reason for deactivation
     */
    function deactivateIssuer(bytes32 _issuerId, string calldata _reason) external onlyOwner {
        require(issuers[_issuerId].isActive, "Issuer not active");
        issuers[_issuerId].isActive = false;
        emit IssuerDeactivated(_issuerId, _reason);
    }

    /**
     * @dev Reactivate an issuer
     * @param _issuerId The issuer to reactivate
     */
    function reactivateIssuer(bytes32 _issuerId) external onlyOwner {
        require(issuers[_issuerId].issuerId != bytes32(0), "Issuer not registered");
        require(!issuers[_issuerId].isActive, "Issuer already active");
        issuers[_issuerId].isActive = true;
        emit IssuerReactivated(_issuerId);
    }

    /**
     * @dev Register a new certificate type
     * @param _typeId Unique identifier
     * @param _typeName Human-readable name
     * @param _requiredCategory Required issuer category
     * @param _requiresMultiple Whether multiple issuers are needed
     * @param _validityPeriod How long certs are valid (0 = permanent)
     */
    function registerCertificateType(
        bytes32 _typeId,
        string calldata _typeName,
        IssuerCategory _requiredCategory,
        bool _requiresMultiple,
        uint256 _validityPeriod
    ) external onlyOwner {
        require(_typeId != bytes32(0), "Invalid type ID");
        require(certificateTypes[_typeId].typeId == bytes32(0), "Type already registered");

        certificateTypes[_typeId] = CertificateType({
            typeId: _typeId,
            typeName: _typeName,
            requiredCategory: _requiredCategory,
            requiresMultipleIssuers: _requiresMultiple,
            validityPeriod: _validityPeriod
        });

        emit CertificateTypeRegistered(_typeId, _typeName);
    }

    /**
     * @dev Authorize an issuer to issue a specific certificate type
     * @param _issuerId The issuer
     * @param _typeId The certificate type
     */
    function authorizeIssuerForCertType(bytes32 _issuerId, bytes32 _typeId) external onlyOwner {
        require(issuers[_issuerId].issuerId != bytes32(0), "Issuer not registered");
        require(certificateTypes[_typeId].typeId != bytes32(0), "Cert type not registered");
        require(
            issuers[_issuerId].category == certificateTypes[_typeId].requiredCategory,
            "Issuer category mismatch"
        );

        issuerCanIssueCertType[_issuerId][_typeId] = true;
        emit IssuerAuthorizedForCertType(_issuerId, _typeId);
    }

    /**
     * @dev Revoke issuer's authority for a certificate type
     * @param _issuerId The issuer
     * @param _typeId The certificate type
     */
    function revokeIssuerFromCertType(bytes32 _issuerId, bytes32 _typeId) external onlyOwner {
        issuerCanIssueCertType[_issuerId][_typeId] = false;
        emit IssuerRevokedFromCertType(_issuerId, _typeId);
    }

    // =============================================================================
    // VERIFICATION FUNCTIONS
    // =============================================================================

    /**
     * @dev Check if an issuer is currently trusted
     * @param _issuerId The issuer to check
     * @return isTrusted Whether the issuer is trusted
     */
    function isIssuerTrusted(bytes32 _issuerId) public view returns (bool isTrusted) {
        IssuerInfo memory issuer = issuers[_issuerId];

        if (!issuer.isActive) {
            return false;
        }

        if (issuer.expiresAt > 0 && block.timestamp > issuer.expiresAt) {
            return false;
        }

        return true;
    }

    /**
     * @dev Check if an issuer can issue a specific certificate type
     * @param _issuerId The issuer
     * @param _typeId The certificate type
     * @return canIssue Whether the issuer can issue this type
     */
    function canIssuerIssueCertType(bytes32 _issuerId, bytes32 _typeId)
        public view returns (bool canIssue)
    {
        if (!isIssuerTrusted(_issuerId)) {
            return false;
        }
        return issuerCanIssueCertType[_issuerId][_typeId];
    }

    /**
     * @dev Get issuer ID from public key hash
     * @param _publicKeyHash Hash of the public key
     * @return issuerId The issuer ID (bytes32(0) if not found)
     */
    function getIssuerByPublicKey(bytes32 _publicKeyHash)
        external view returns (bytes32 issuerId)
    {
        return publicKeyToIssuer[_publicKeyHash];
    }

    /**
     * @dev Verify that a certificate signature is from a trusted issuer
     * @param _messageHash Hash of the certificate data
     * @param _signature Signature from the issuer
     * @param _typeId Certificate type being verified
     * @return isValid Whether the signature is from a trusted issuer
     * @return issuerId The issuer ID (if valid)
     */
    function verifyIssuerSignature(
        bytes32 _messageHash,
        bytes calldata _signature,
        bytes32 _typeId
    ) external view returns (bool isValid, bytes32 issuerId) {
        // Recover signer address from signature
        address signer = _messageHash.toEthSignedMessageHash().recover(_signature);

        // Hash the signer address to get public key hash (simplified)
        bytes32 publicKeyHash = keccak256(abi.encodePacked(signer));

        // Look up issuer
        issuerId = publicKeyToIssuer[publicKeyHash];
        if (issuerId == bytes32(0)) {
            return (false, bytes32(0));
        }

        // Check if issuer can issue this certificate type
        if (!canIssuerIssueCertType(issuerId, _typeId)) {
            return (false, issuerId);
        }

        return (true, issuerId);
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get all registered issuers
     */
    function getAllIssuers() external view returns (bytes32[] memory) {
        return issuerList;
    }

    /**
     * @dev Get issuers by jurisdiction
     */
    function getIssuersByJurisdiction(string calldata _jurisdiction)
        external view returns (bytes32[] memory)
    {
        return issuersByJurisdiction[_jurisdiction];
    }

    /**
     * @dev Get active issuers for a certificate type
     */
    function getActiveIssuersForCertType(bytes32 _typeId)
        external view returns (bytes32[] memory activeIssuers)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < issuerList.length; i++) {
            if (canIssuerIssueCertType(issuerList[i], _typeId)) {
                count++;
            }
        }

        activeIssuers = new bytes32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < issuerList.length; i++) {
            if (canIssuerIssueCertType(issuerList[i], _typeId)) {
                activeIssuers[index++] = issuerList[i];
            }
        }

        return activeIssuers;
    }

    /**
     * @dev Get issuer info
     */
    function getIssuerInfo(bytes32 _issuerId)
        external view returns (IssuerInfo memory)
    {
        return issuers[_issuerId];
    }

    /**
     * @dev Get certificate type info
     */
    function getCertificateType(bytes32 _typeId)
        external view returns (CertificateType memory)
    {
        return certificateTypes[_typeId];
    }

    // =============================================================================
    // INTERNAL FUNCTIONS
    // =============================================================================

    /**
     * @dev Register default certificate types on deployment
     */
    function _registerDefaultCertificateTypes() internal {
        // Death certificate
        certificateTypes[keccak256("DEATH_CERTIFICATE")] = CertificateType({
            typeId: keccak256("DEATH_CERTIFICATE"),
            typeName: "Death Certificate",
            requiredCategory: IssuerCategory.Government,
            requiresMultipleIssuers: false,
            validityPeriod: 0 // Permanent
        });

        // Medical incapacitation
        certificateTypes[keccak256("MEDICAL_INCAPACITATION")] = CertificateType({
            typeId: keccak256("MEDICAL_INCAPACITATION"),
            typeName: "Medical Incapacitation Certificate",
            requiredCategory: IssuerCategory.Medical,
            requiresMultipleIssuers: true, // Requires 2 doctors
            validityPeriod: 365 days // Valid for 1 year
        });

        // Probate order
        certificateTypes[keccak256("PROBATE_ORDER")] = CertificateType({
            typeId: keccak256("PROBATE_ORDER"),
            typeName: "Probate Court Order",
            requiredCategory: IssuerCategory.Legal,
            requiresMultipleIssuers: false,
            validityPeriod: 0 // Permanent
        });

        // Court ruling
        certificateTypes[keccak256("COURT_RULING")] = CertificateType({
            typeId: keccak256("COURT_RULING"),
            typeName: "Court Ruling",
            requiredCategory: IssuerCategory.Legal,
            requiresMultipleIssuers: false,
            validityPeriod: 0 // Permanent
        });
    }
}
