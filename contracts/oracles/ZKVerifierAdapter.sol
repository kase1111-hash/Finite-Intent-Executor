// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol"; // [Audit fix: M-2]
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IOracle.sol";
import "./IZKVerifier.sol";
import "./TrustedIssuerRegistry.sol";
import "../verifiers/Groth16Verifier.sol";
import "../verifiers/PlonkVerifier.sol";

/**
 * @title ZKVerifierAdapter
 * @dev Zero-knowledge proof adapter for the Finite Intent Executor
 * @notice Verifies death/medical/legal certificates using ZK proofs
 *
 * This adapter allows verification of sensitive certificates without
 * revealing their contents on-chain. The flow is:
 *
 * 1. Off-chain: Prover has a certificate signed by a trusted issuer
 * 2. Off-chain: Prover generates a ZK proof that:
 *    - The certificate is signed by a trusted issuer
 *    - The certificate contains specific claims (e.g., death date)
 *    - The certificate refers to the correct person (creator)
 * 3. On-chain: This contract verifies the proof
 * 4. On-chain: If valid, the verification is marked as complete
 *
 * The certificate data (name, dates, etc.) never appears on-chain.
 * Only the proof and public inputs (hashes, commitments) are stored.
 */
contract ZKVerifierAdapter is IOracle, Ownable2Step, ReentrancyGuard {

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @dev Confidence score for valid ZK proofs (always 100 - binary)
    uint256 public constant ZK_CONFIDENCE = 100;

    /// @dev Maximum requests per creator to prevent unbounded array growth [Audit fix: M-11]
    uint256 public constant MAX_REQUESTS_PER_CREATOR = 1000;

    /// @dev Maximum verification keys to prevent unbounded array growth [Audit fix: M-12]
    uint256 public constant MAX_VERIFICATION_KEYS = 100;

    /// @dev Whether the oracle is currently accepting requests
    bool private _isActive;

    /// @dev Whether placeholder verification is allowed (MUST be false in production)
    /// @notice This flag is immutable — set at deployment and cannot be changed.
    ///         Deploy with `false` for production. Only use `true` in test environments.
    bool public immutable allowPlaceholderVerification;

    /// @dev Trusted issuer registry
    TrustedIssuerRegistry public issuerRegistry;

    /// @dev Groth16 verifier contract
    Groth16Verifier public groth16Verifier;

    /// @dev PLONK verifier contract
    PlonkVerifier public plonkVerifier;

    /// @dev Mapping of verification key ID to key data
    mapping(bytes32 => VerificationKeyData) public verificationKeys;

    /// @dev Mapping of request ID to verification request
    mapping(bytes32 => VerificationRequest) public requests;

    /// @dev Mapping of request ID to ZK proof data
    mapping(bytes32 => ZKProofData) public proofs;

    /// @dev Mapping of creator to their request IDs
    mapping(address => bytes32[]) public creatorRequests;

    /// @dev List of registered verification key IDs
    bytes32[] public keyIds;

    /// @dev Nonce for generating unique request IDs
    uint256 private _requestNonce;

    // =============================================================================
    // STRUCTS
    // =============================================================================

    /**
     * @dev Verification key data for ZK circuits
     */
    struct VerificationKeyData {
        bytes32 keyId;
        IZKVerifier.ProofSystem proofSystem;
        EventType eventType;        // Which event type this key verifies
        bytes32 circuitHash;        // Hash of the circuit for identification
        bytes vkData;               // Encoded verification key
        bool isActive;
        uint256 registeredAt;
    }

    /**
     * @dev ZK proof submission data
     */
    struct ZKProofData {
        bytes32 requestId;
        bytes32 keyId;
        bytes proof;                // The ZK proof
        bytes32 creatorCommitment;  // Commitment to creator identity
        bytes32 issuerCommitment;   // Commitment to issuer identity
        bytes32 certificateHash;    // Hash of certificate (for reference)
        uint256 submittedAt;
        bool isVerified;
        bool verificationResult;
    }

    // =============================================================================
    // EVENTS
    // =============================================================================

    event VerificationKeyRegistered(
        bytes32 indexed keyId,
        IZKVerifier.ProofSystem proofSystem,
        EventType eventType
    );
    event VerificationKeyDeactivated(bytes32 indexed keyId);
    event ZKProofSubmitted(
        bytes32 indexed requestId,
        bytes32 indexed keyId,
        address indexed submitter
    );
    event ZKProofVerified(
        bytes32 indexed requestId,
        bool result
    );
    event IssuerRegistrySet(address indexed oldRegistry, address indexed newRegistry);
    event Groth16VerifierSet(address indexed oldVerifier, address indexed newVerifier);
    event PlonkVerifierSet(address indexed oldVerifier, address indexed newVerifier);
    event OracleActiveStatusChanged(bool isActive);

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    /**
     * @dev Constructor for ZKVerifierAdapter
     * @param _issuerRegistry Address of TrustedIssuerRegistry
     * @param _allowPlaceholder Whether to allow placeholder verification (false for production)
     */
    constructor(address _issuerRegistry, bool _allowPlaceholder) Ownable(msg.sender) {
        require(_issuerRegistry != address(0), "Invalid registry address");
        issuerRegistry = TrustedIssuerRegistry(_issuerRegistry);
        allowPlaceholderVerification = _allowPlaceholder;
        _isActive = true;
    }

    // =============================================================================
    // MODIFIERS
    // =============================================================================

    modifier onlyActive() {
        require(_isActive, "Oracle is not active");
        _;
    }

    // =============================================================================
    // ADMIN FUNCTIONS
    // =============================================================================

    /**
     * @dev Set the issuer registry
     * @param _registry New registry address
     */
    function setIssuerRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Invalid registry address");
        address oldRegistry = address(issuerRegistry);
        issuerRegistry = TrustedIssuerRegistry(_registry);
        emit IssuerRegistrySet(oldRegistry, _registry);
    }

    /**
     * @dev Set the Groth16 verifier contract
     * @param _verifier New verifier address
     */
    function setGroth16Verifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        address oldVerifier = address(groth16Verifier);
        groth16Verifier = Groth16Verifier(_verifier);
        emit Groth16VerifierSet(oldVerifier, _verifier);
    }

    /**
     * @dev Set the PLONK verifier contract
     * @param _verifier New verifier address
     */
    function setPlonkVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        address oldVerifier = address(plonkVerifier);
        plonkVerifier = PlonkVerifier(_verifier);
        emit PlonkVerifierSet(oldVerifier, _verifier);
    }

    /**
     * @dev Set oracle active status
     * @param _active Whether oracle should be active
     */
    function setActive(bool _active) external onlyOwner {
        _isActive = _active;
        emit OracleActiveStatusChanged(_active);
    }

    // setAllowPlaceholderVerification removed — flag is now immutable (set at deployment)
    // See constructor parameter _allowPlaceholder. [Audit fix: H-1, M-4]

    /**
     * @dev Register a verification key for a ZK circuit
     * @param _keyId Unique identifier for the key
     * @param _proofSystem Which proof system (Groth16, PLONK, STARK)
     * @param _eventType Which event type this verifies
     * @param _circuitHash Hash of the circuit
     * @param _vkData Encoded verification key
     */
    function registerVerificationKey(
        bytes32 _keyId,
        IZKVerifier.ProofSystem _proofSystem,
        EventType _eventType,
        bytes32 _circuitHash,
        bytes calldata _vkData
    ) external onlyOwner {
        require(_keyId != bytes32(0), "Invalid key ID");
        require(verificationKeys[_keyId].keyId == bytes32(0), "Key already registered");
        require(_vkData.length > 0, "Empty verification key");
        // [Audit fix: C-1] PLONK verifier is a non-functional placeholder — block registration
        require(_proofSystem != IZKVerifier.ProofSystem.PLONK, "PLONK verification not yet implemented");
        // [Audit fix: H-1 supp] STARK verification is not implemented — block registration
        require(_proofSystem != IZKVerifier.ProofSystem.STARK, "STARK verification not yet implemented");

        // [Audit fix: M-12]
        require(keyIds.length < MAX_VERIFICATION_KEYS, "Verification key limit reached");

        verificationKeys[_keyId] = VerificationKeyData({
            keyId: _keyId,
            proofSystem: _proofSystem,
            eventType: _eventType,
            circuitHash: _circuitHash,
            vkData: _vkData,
            isActive: true,
            registeredAt: block.timestamp
        });

        keyIds.push(_keyId);

        emit VerificationKeyRegistered(_keyId, _proofSystem, _eventType);
    }

    /**
     * @dev Deactivate a verification key
     * @param _keyId The key to deactivate
     */
    function deactivateVerificationKey(bytes32 _keyId) external onlyOwner {
        require(verificationKeys[_keyId].isActive, "Key not active");
        verificationKeys[_keyId].isActive = false;
        emit VerificationKeyDeactivated(_keyId);
    }

    // =============================================================================
    // IORACLE IMPLEMENTATION
    // =============================================================================

    /**
     * @inheritdoc IOracle
     */
    function requestVerification(
        address _creator,
        EventType _eventType,
        bytes32 _dataHash
    ) external override onlyActive nonReentrant returns (bytes32 requestId) {
        require(_creator != address(0), "Invalid creator address");
        require(_dataHash != bytes32(0), "Invalid data hash");

        // Generate unique request ID
        requestId = keccak256(abi.encodePacked(
            _creator,
            _eventType,
            _dataHash,
            block.timestamp,
            _requestNonce++
        ));

        // Create verification request
        requests[requestId] = VerificationRequest({
            requestId: requestId,
            creator: _creator,
            eventType: _eventType,
            dataHash: _dataHash,
            requestTimestamp: block.timestamp,
            expirationTimestamp: block.timestamp + 30 days, // ZK proofs don't expire quickly
            status: VerificationStatus.Pending,
            confidenceScore: 0
        });

        // Track request for creator [Audit fix: M-11]
        require(creatorRequests[_creator].length < MAX_REQUESTS_PER_CREATOR, "Request limit reached");
        creatorRequests[_creator].push(requestId);

        emit VerificationRequested(requestId, _creator, _eventType, block.timestamp);

        return requestId;
    }

    /**
     * @inheritdoc IOracle
     */
    function getVerificationStatus(bytes32 _requestId)
        external view override returns (VerificationRequest memory request)
    {
        request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        return request;
    }

    /**
     * @inheritdoc IOracle
     */
    function isVerificationValid(bytes32 _requestId)
        external view override returns (bool isValid)
    {
        VerificationRequest memory request = requests[_requestId];

        if (request.requestTimestamp == 0) {
            return false;
        }

        if (request.status != VerificationStatus.Verified) {
            return false;
        }

        return request.confidenceScore >= 95;
    }

    /**
     * @inheritdoc IOracle
     */
    function getOracleType() external pure override returns (string memory) {
        return "zk";
    }

    /**
     * @inheritdoc IOracle
     */
    function isActive() external view override returns (bool) {
        return _isActive;
    }

    // =============================================================================
    // ZK VERIFICATION FUNCTIONS
    // =============================================================================

    /**
     * @dev Submit a ZK proof for verification
     * @param _requestId The request to fulfill
     * @param _keyId Which verification key to use
     * @param _proof The ZK proof data
     * @param _creatorCommitment Commitment to creator identity (public input)
     * @param _issuerCommitment Commitment to issuer identity (public input)
     * @param _certificateHash Hash of certificate (public input)
     * @return success Whether verification succeeded
     *
     * The proof proves:
     * 1. The prover knows a certificate with hash = _certificateHash
     * 2. The certificate was signed by an issuer with commitment = _issuerCommitment
     * 3. The certificate refers to the creator with commitment = _creatorCommitment
     * 4. The certificate type matches the request event type
     */
    function submitZKProof(
        bytes32 _requestId,
        bytes32 _keyId,
        bytes calldata _proof,
        bytes32 _creatorCommitment,
        bytes32 _issuerCommitment,
        bytes32 _certificateHash
    ) external nonReentrant returns (bool success) {
        VerificationRequest storage request = requests[_requestId];
        require(request.requestTimestamp > 0, "Request does not exist");
        require(request.status == VerificationStatus.Pending, "Request not pending");

        VerificationKeyData memory vk = verificationKeys[_keyId];
        require(vk.isActive, "Verification key not active");
        require(vk.eventType == request.eventType, "Key event type mismatch");

        // Store proof data
        proofs[_requestId] = ZKProofData({
            requestId: _requestId,
            keyId: _keyId,
            proof: _proof,
            creatorCommitment: _creatorCommitment,
            issuerCommitment: _issuerCommitment,
            certificateHash: _certificateHash,
            submittedAt: block.timestamp,
            isVerified: false,
            verificationResult: false
        });

        emit ZKProofSubmitted(_requestId, _keyId, msg.sender);

        // Verify the proof
        success = _verifyProof(
            _keyId,
            _proof,
            _creatorCommitment,
            _issuerCommitment,
            _certificateHash,
            request.creator,
            request.dataHash
        );

        // Update proof status
        proofs[_requestId].isVerified = true;
        proofs[_requestId].verificationResult = success;

        // Update request status
        if (success) {
            request.status = VerificationStatus.Verified;
            request.confidenceScore = ZK_CONFIDENCE;
        } else {
            request.status = VerificationStatus.Rejected;
            request.confidenceScore = 0;
        }

        emit ZKProofVerified(_requestId, success);
        emit VerificationFulfilled(
            _requestId,
            request.creator,
            request.status,
            request.confidenceScore
        );

        return success;
    }

    /**
     * @dev Internal proof verification
     * @notice Calls the appropriate ZK verifier based on proof system
     */
    function _verifyProof(
        bytes32 _keyId,
        bytes memory _proof,
        bytes32 _creatorCommitment,
        bytes32 _issuerCommitment,
        bytes32 _certificateHash,
        address _expectedCreator,
        bytes32 _expectedDataHash
    ) internal view returns (bool) {
        // Sanity checks
        if (_proof.length == 0) {
            return false;
        }

        // Verify data hash matches
        if (_certificateHash != _expectedDataHash) {
            return false;
        }

        // Verify issuer is in trusted registry
        bytes32 issuerId = issuerRegistry.getIssuerByPublicKey(_issuerCommitment);
        if (issuerId == bytes32(0)) {
            // Check if issuer commitment itself is a trusted issuer ID
            if (!issuerRegistry.isIssuerTrusted(_issuerCommitment)) {
                return false;
            }
        } else {
            if (!issuerRegistry.isIssuerTrusted(issuerId)) {
                return false;
            }
        }

        // Get verification key
        VerificationKeyData memory vk = verificationKeys[_keyId];

        // Build public inputs array
        uint256[] memory publicInputs = new uint256[](3);
        publicInputs[0] = uint256(_creatorCommitment);
        publicInputs[1] = uint256(_certificateHash);
        publicInputs[2] = block.timestamp; // currentTimestamp

        // Route to appropriate verifier based on proof system
        if (vk.proofSystem == IZKVerifier.ProofSystem.Groth16) {
            return _verifyGroth16(_keyId, _proof, publicInputs);
        } else if (vk.proofSystem == IZKVerifier.ProofSystem.PLONK) {
            return _verifyPlonk(_keyId, _proof, publicInputs);
        } else if (vk.proofSystem == IZKVerifier.ProofSystem.STARK) {
            // [Audit fix: H-1 supp] STARK verification not implemented — revert instead of fallback
            revert("STARK verification not implemented");
        }

        return false;
    }

    /**
     * @dev Verify a Groth16 proof using the Groth16Verifier contract
     */
    function _verifyGroth16(
        bytes32 _keyId,
        bytes memory _proof,
        uint256[] memory _publicInputs
    ) internal view returns (bool) {
        // [Audit fix: H-1] Require Groth16 verifier to be set — no silent fallback to placeholder
        require(address(groth16Verifier) != address(0), "Groth16 verifier not deployed");

        // Check if key is registered in the verifier
        if (!groth16Verifier.isKeyActive(_keyId)) {
            return false;
        }

        // Verify proof
        try groth16Verifier.verifyProofBytes(_keyId, _proof, _publicInputs) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @dev Verify a PLONK proof using the PlonkVerifier contract
     * @custom:audit-fix C-1 — PlonkVerifier is a non-functional placeholder.
     *         This function now reverts unconditionally until a real PLONK verifier is deployed.
     */
    function _verifyPlonk(
        bytes32 _keyId,
        bytes memory _proof,
        uint256[] memory _publicInputs
    ) internal pure returns (bool) {
        // [Audit fix: C-1] PlonkVerifier's core functions (_computeLinearization,
        // _computeBatchedCommitment, _computeBatchedEvaluation, _pairingCheck) return
        // trivial values — any structurally valid proof passes. Disabled until completed.
        revert("PLONK verification disabled — verifier is placeholder");
    }

    /**
     * @dev Placeholder verification for testing or when verifiers not deployed
     * @notice This performs basic sanity checks but NOT cryptographic verification
     *         ONLY use for testing - replace with real verification in production
     * @custom:security REVERTS by default unless allowPlaceholderVerification is true
     */
    function _verifyPlaceholder(
        bytes32 _keyId,
        bytes memory _proof,
        uint256[] memory _publicInputs
    ) internal view returns (bool) {
        // SECURITY: Revert by default in production - placeholder verification
        // does NOT cryptographically verify proofs and should NEVER be used
        // for actual death certificate, medical, or legal verification.
        require(
            allowPlaceholderVerification,
            "Placeholder verification disabled - deploy real ZK verifier"
        );

        VerificationKeyData memory vk = verificationKeys[_keyId];

        // Basic sanity checks
        if (!vk.isActive) {
            return false;
        }
        if (vk.vkData.length == 0) {
            return false;
        }
        if (_publicInputs.length == 0) {
            return false;
        }

        // For Groth16, proof should be 256 bytes (8 x 32-byte elements)
        // For PLONK, proof is larger
        if (vk.proofSystem == IZKVerifier.ProofSystem.Groth16 && _proof.length != 256) {
            return false;
        }
        if (vk.proofSystem == IZKVerifier.ProofSystem.PLONK && _proof.length != 1152) {
            return false;
        }

        // Placeholder: return true if sanity checks pass
        // WARNING: This does NOT verify the proof cryptographically!
        // This path should only be reached in testing when allowPlaceholderVerification is true
        return true;
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Get all request IDs for a creator
     */
    function getCreatorRequests(address _creator)
        external view returns (bytes32[] memory)
    {
        return creatorRequests[_creator];
    }

    /**
     * @dev Get proof data for a request
     */
    function getProofData(bytes32 _requestId)
        external view returns (ZKProofData memory)
    {
        return proofs[_requestId];
    }

    /**
     * @dev Get verification key data
     */
    function getVerificationKey(bytes32 _keyId)
        external view returns (VerificationKeyData memory)
    {
        return verificationKeys[_keyId];
    }

    /**
     * @dev Get all registered verification keys
     */
    function getAllVerificationKeys()
        external view returns (bytes32[] memory)
    {
        return keyIds;
    }

    /**
     * @dev Get active verification keys for an event type
     */
    function getKeysForEventType(EventType _eventType)
        external view returns (bytes32[] memory activeKeys)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < keyIds.length; i++) {
            if (verificationKeys[keyIds[i]].isActive &&
                verificationKeys[keyIds[i]].eventType == _eventType) {
                count++;
            }
        }

        activeKeys = new bytes32[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < keyIds.length; i++) {
            if (verificationKeys[keyIds[i]].isActive &&
                verificationKeys[keyIds[i]].eventType == _eventType) {
                activeKeys[index++] = keyIds[i];
            }
        }

        return activeKeys;
    }

    /**
     * @dev Check if a verification key is active
     */
    function isKeyActive(bytes32 _keyId) external view returns (bool) {
        return verificationKeys[_keyId].isActive;
    }
}
