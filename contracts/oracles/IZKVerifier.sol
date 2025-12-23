// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IZKVerifier
 * @dev Interface for zero-knowledge proof verifiers
 * @notice Defines the standard interface for ZK proof verification in FIE
 *
 * Zero-knowledge proofs allow verification of claims without revealing
 * sensitive data. For death certificate verification:
 * - The certificate data stays off-chain (private)
 * - A proof is generated that the certificate is valid
 * - The on-chain verifier checks the proof
 * - The result is used without exposing personal information
 *
 * This interface supports multiple ZK systems:
 * - Groth16 (efficient, trusted setup required)
 * - PLONK (universal setup, slightly larger proofs)
 * - STARK (no trusted setup, larger proofs)
 */
interface IZKVerifier {

    /**
     * @dev Enum for supported ZK proof systems
     */
    enum ProofSystem {
        Groth16,    // Most efficient, requires trusted setup per circuit
        PLONK,      // Universal setup, good balance
        STARK       // No trusted setup, quantum resistant
    }

    /**
     * @dev Struct for verification key (circuit-specific)
     */
    struct VerificationKey {
        bytes32 keyId;
        ProofSystem proofSystem;
        bytes keyData;          // Encoded verification key
        bool isActive;
        uint256 createdAt;
    }

    /**
     * @dev Struct for a ZK proof submission
     */
    struct ZKProof {
        bytes32 proofId;
        bytes32 keyId;              // Which verification key to use
        bytes proof;                // The ZK proof data
        bytes32[] publicInputs;     // Public inputs to the circuit
        uint256 submittedAt;
        bool isVerified;
        bool verificationResult;
    }

    /**
     * @dev Emitted when a new verification key is registered
     */
    event VerificationKeyRegistered(
        bytes32 indexed keyId,
        ProofSystem proofSystem,
        address indexed registrar
    );

    /**
     * @dev Emitted when a proof is submitted for verification
     */
    event ProofSubmitted(
        bytes32 indexed proofId,
        bytes32 indexed keyId,
        address indexed submitter
    );

    /**
     * @dev Emitted when a proof is verified
     */
    event ProofVerified(
        bytes32 indexed proofId,
        bool result,
        uint256 gasUsed
    );

    /**
     * @dev Register a new verification key for a circuit
     * @param _keyId Unique identifier for the key
     * @param _proofSystem Which proof system this key is for
     * @param _keyData Encoded verification key data
     * @return success Whether registration succeeded
     */
    function registerVerificationKey(
        bytes32 _keyId,
        ProofSystem _proofSystem,
        bytes calldata _keyData
    ) external returns (bool success);

    /**
     * @dev Verify a ZK proof
     * @param _keyId Which verification key to use
     * @param _proof The ZK proof data
     * @param _publicInputs Public inputs to the circuit
     * @return isValid Whether the proof is valid
     */
    function verifyProof(
        bytes32 _keyId,
        bytes calldata _proof,
        bytes32[] calldata _publicInputs
    ) external returns (bool isValid);

    /**
     * @dev Check if a verification key exists and is active
     * @param _keyId The key identifier
     * @return exists Whether the key exists and is active
     */
    function isKeyActive(bytes32 _keyId) external view returns (bool exists);

    /**
     * @dev Get verification key details
     * @param _keyId The key identifier
     * @return key The verification key struct
     */
    function getVerificationKey(bytes32 _keyId)
        external view returns (VerificationKey memory key);

    /**
     * @dev Get proof details
     * @param _proofId The proof identifier
     * @return proof The ZK proof struct
     */
    function getProof(bytes32 _proofId)
        external view returns (ZKProof memory proof);

    /**
     * @dev Estimate gas cost for proof verification
     * @param _keyId The verification key to use
     * @return gasEstimate Estimated gas for verification
     */
    function estimateVerificationGas(bytes32 _keyId)
        external view returns (uint256 gasEstimate);
}
