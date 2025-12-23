// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Groth16Verifier
 * @notice On-chain Groth16 proof verifier using EVM precompiled contracts
 * @dev Uses BN254 curve (alt_bn128) for pairing operations
 *
 * This verifier supports multiple verification keys, allowing different
 * circuits to be verified with the same contract. Keys are registered
 * by the owner and can be activated/deactivated.
 *
 * The verification equation checks:
 *   e(A, B) = e(alpha, beta) * e(sum(pub_i * IC_i), gamma) * e(C, delta)
 *
 * Where:
 *   - A, B, C are the proof elements
 *   - alpha, beta, gamma, delta are from the verification key
 *   - IC is the input commitment vector
 *   - pub_i are the public inputs
 */
contract Groth16Verifier is Ownable {
    // =============================================================================
    // ERRORS
    // =============================================================================

    error InvalidProofLength();
    error InvalidPublicInputsLength();
    error InvalidVerificationKey();
    error KeyNotFound();
    error KeyNotActive();
    error KeyAlreadyExists();
    error PairingFailed();
    error ScalarMulFailed();
    error PointAddFailed();
    error PublicInputTooLarge();

    // =============================================================================
    // EVENTS
    // =============================================================================

    event VerificationKeyRegistered(bytes32 indexed keyId, string name, uint256 publicInputCount);
    event VerificationKeyActivated(bytes32 indexed keyId);
    event VerificationKeyDeactivated(bytes32 indexed keyId);
    event ProofVerified(bytes32 indexed keyId, bool success);

    // =============================================================================
    // TYPES
    // =============================================================================

    /// @notice G1 point on BN254 curve
    struct G1Point {
        uint256 x;
        uint256 y;
    }

    /// @notice G2 point on BN254 curve (represented as two Fp2 elements)
    struct G2Point {
        uint256[2] x;  // x = x0 + x1 * u
        uint256[2] y;  // y = y0 + y1 * u
    }

    /// @notice Groth16 verification key
    struct VerificationKey {
        G1Point alpha;     // alpha in G1
        G2Point beta;      // beta in G2
        G2Point gamma;     // gamma in G2
        G2Point delta;     // delta in G2
        G1Point[] ic;      // IC points (length = public inputs + 1)
        string name;       // Human-readable name
        bool isActive;     // Whether this key can be used
        uint256 registeredAt;
    }

    /// @notice Groth16 proof
    struct Proof {
        G1Point a;         // A in G1
        G2Point b;         // B in G2
        G1Point c;         // C in G1
    }

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @notice BN254 curve order
    uint256 public constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    /// @notice Registered verification keys
    mapping(bytes32 => VerificationKey) public verificationKeys;

    /// @notice List of all registered key IDs
    bytes32[] public keyIds;

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() Ownable(msg.sender) {}

    // =============================================================================
    // KEY MANAGEMENT
    // =============================================================================

    /**
     * @notice Register a new verification key
     * @param _keyId Unique identifier for this key
     * @param _name Human-readable name
     * @param _alpha Alpha point (G1)
     * @param _beta Beta point (G2)
     * @param _gamma Gamma point (G2)
     * @param _delta Delta point (G2)
     * @param _ic IC points array
     */
    function registerVerificationKey(
        bytes32 _keyId,
        string calldata _name,
        G1Point calldata _alpha,
        G2Point calldata _beta,
        G2Point calldata _gamma,
        G2Point calldata _delta,
        G1Point[] calldata _ic
    ) external onlyOwner {
        if (verificationKeys[_keyId].registeredAt != 0) {
            revert KeyAlreadyExists();
        }
        if (_ic.length < 2) {
            revert InvalidVerificationKey();
        }

        VerificationKey storage vk = verificationKeys[_keyId];
        vk.alpha = _alpha;
        vk.beta = _beta;
        vk.gamma = _gamma;
        vk.delta = _delta;
        vk.name = _name;
        vk.isActive = true;
        vk.registeredAt = block.timestamp;

        // Copy IC points
        for (uint256 i = 0; i < _ic.length; i++) {
            vk.ic.push(_ic[i]);
        }

        keyIds.push(_keyId);

        emit VerificationKeyRegistered(_keyId, _name, _ic.length - 1);
    }

    /**
     * @notice Activate a verification key
     */
    function activateKey(bytes32 _keyId) external onlyOwner {
        if (verificationKeys[_keyId].registeredAt == 0) {
            revert KeyNotFound();
        }
        verificationKeys[_keyId].isActive = true;
        emit VerificationKeyActivated(_keyId);
    }

    /**
     * @notice Deactivate a verification key
     */
    function deactivateKey(bytes32 _keyId) external onlyOwner {
        if (verificationKeys[_keyId].registeredAt == 0) {
            revert KeyNotFound();
        }
        verificationKeys[_keyId].isActive = false;
        emit VerificationKeyDeactivated(_keyId);
    }

    // =============================================================================
    // VERIFICATION
    // =============================================================================

    /**
     * @notice Verify a Groth16 proof
     * @param _keyId Verification key to use
     * @param _proof The proof (A, B, C points)
     * @param _publicInputs Array of public inputs
     * @return success Whether the proof is valid
     */
    function verifyProof(
        bytes32 _keyId,
        Proof calldata _proof,
        uint256[] calldata _publicInputs
    ) external view returns (bool success) {
        VerificationKey storage vk = verificationKeys[_keyId];

        if (vk.registeredAt == 0) {
            revert KeyNotFound();
        }
        if (!vk.isActive) {
            revert KeyNotActive();
        }
        if (_publicInputs.length + 1 != vk.ic.length) {
            revert InvalidPublicInputsLength();
        }

        // Check public inputs are in field
        for (uint256 i = 0; i < _publicInputs.length; i++) {
            if (_publicInputs[i] >= PRIME_Q) {
                revert PublicInputTooLarge();
            }
        }

        return _verify(_proof, _publicInputs, vk);
    }

    /**
     * @notice Verify proof with raw bytes (for external callers)
     * @param _keyId Verification key to use
     * @param _proofData Encoded proof data
     * @param _publicInputs Array of public inputs
     */
    function verifyProofBytes(
        bytes32 _keyId,
        bytes calldata _proofData,
        uint256[] calldata _publicInputs
    ) external view returns (bool) {
        if (_proofData.length != 256) {
            revert InvalidProofLength();
        }

        Proof memory proof;
        proof.a.x = uint256(bytes32(_proofData[0:32]));
        proof.a.y = uint256(bytes32(_proofData[32:64]));
        proof.b.x[0] = uint256(bytes32(_proofData[64:96]));
        proof.b.x[1] = uint256(bytes32(_proofData[96:128]));
        proof.b.y[0] = uint256(bytes32(_proofData[128:160]));
        proof.b.y[1] = uint256(bytes32(_proofData[160:192]));
        proof.c.x = uint256(bytes32(_proofData[192:224]));
        proof.c.y = uint256(bytes32(_proofData[224:256]));

        VerificationKey storage vk = verificationKeys[_keyId];

        if (vk.registeredAt == 0) {
            revert KeyNotFound();
        }
        if (!vk.isActive) {
            revert KeyNotActive();
        }
        if (_publicInputs.length + 1 != vk.ic.length) {
            revert InvalidPublicInputsLength();
        }

        return _verify(proof, _publicInputs, vk);
    }

    // =============================================================================
    // INTERNAL VERIFICATION LOGIC
    // =============================================================================

    /**
     * @notice Internal verification logic
     * @dev Computes: e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)
     *      Where vk_x = IC[0] + sum(pub_i * IC[i+1])
     */
    function _verify(
        Proof memory _proof,
        uint256[] calldata _publicInputs,
        VerificationKey storage _vk
    ) internal view returns (bool) {
        // Compute vk_x = IC[0] + sum(pub_i * IC[i+1])
        G1Point memory vk_x = _vk.ic[0];

        for (uint256 i = 0; i < _publicInputs.length; i++) {
            G1Point memory term = _scalarMul(_vk.ic[i + 1], _publicInputs[i]);
            vk_x = _pointAdd(vk_x, term);
        }

        // Negate A for the pairing check
        G1Point memory negA = _negate(_proof.a);

        // Prepare pairing inputs: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) = 1
        // This is equivalent to: e(A, B) = e(alpha, beta) * e(vk_x, gamma) * e(C, delta)

        return _pairing4(
            negA, _proof.b,
            _vk.alpha, _vk.beta,
            vk_x, _vk.gamma,
            _proof.c, _vk.delta
        );
    }

    // =============================================================================
    // ELLIPTIC CURVE OPERATIONS
    // =============================================================================

    /**
     * @notice Negate a G1 point
     */
    function _negate(G1Point memory p) internal pure returns (G1Point memory) {
        if (p.x == 0 && p.y == 0) {
            return G1Point(0, 0);
        }
        return G1Point(p.x, PRIME_Q - (p.y % PRIME_Q));
    }

    /**
     * @notice Add two G1 points using precompile at 0x06
     */
    function _pointAdd(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        uint256[4] memory input;
        input[0] = p1.x;
        input[1] = p1.y;
        input[2] = p2.x;
        input[3] = p2.y;

        bool success;
        assembly {
            success := staticcall(gas(), 6, input, 128, r, 64)
        }

        if (!success) {
            revert PointAddFailed();
        }
    }

    /**
     * @notice Scalar multiply a G1 point using precompile at 0x07
     */
    function _scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input;
        input[0] = p.x;
        input[1] = p.y;
        input[2] = s;

        bool success;
        assembly {
            success := staticcall(gas(), 7, input, 96, r, 64)
        }

        if (!success) {
            revert ScalarMulFailed();
        }
    }

    /**
     * @notice Perform pairing check with 4 pairs using precompile at 0x08
     * @dev Returns true if product of pairings equals 1
     */
    function _pairing4(
        G1Point memory a1, G2Point memory a2,
        G1Point memory b1, G2Point memory b2,
        G1Point memory c1, G2Point memory c2,
        G1Point memory d1, G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input;

        // First pair
        input[0] = a1.x;
        input[1] = a1.y;
        input[2] = a2.x[1];  // Note: x1 comes before x0 for G2
        input[3] = a2.x[0];
        input[4] = a2.y[1];
        input[5] = a2.y[0];

        // Second pair
        input[6] = b1.x;
        input[7] = b1.y;
        input[8] = b2.x[1];
        input[9] = b2.x[0];
        input[10] = b2.y[1];
        input[11] = b2.y[0];

        // Third pair
        input[12] = c1.x;
        input[13] = c1.y;
        input[14] = c2.x[1];
        input[15] = c2.x[0];
        input[16] = c2.y[1];
        input[17] = c2.y[0];

        // Fourth pair
        input[18] = d1.x;
        input[19] = d1.y;
        input[20] = d2.x[1];
        input[21] = d2.x[0];
        input[22] = d2.y[1];
        input[23] = d2.y[0];

        uint256[1] memory result;
        bool success;

        assembly {
            success := staticcall(gas(), 8, input, 768, result, 32)
        }

        if (!success) {
            revert PairingFailed();
        }

        return result[0] == 1;
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @notice Get verification key details
     */
    function getVerificationKey(bytes32 _keyId)
        external
        view
        returns (
            string memory name,
            bool isActive,
            uint256 publicInputCount,
            uint256 registeredAt
        )
    {
        VerificationKey storage vk = verificationKeys[_keyId];
        return (
            vk.name,
            vk.isActive,
            vk.ic.length > 0 ? vk.ic.length - 1 : 0,
            vk.registeredAt
        );
    }

    /**
     * @notice Check if a key is registered and active
     */
    function isKeyActive(bytes32 _keyId) external view returns (bool) {
        VerificationKey storage vk = verificationKeys[_keyId];
        return vk.registeredAt != 0 && vk.isActive;
    }

    /**
     * @notice Get all registered key IDs
     */
    function getAllKeyIds() external view returns (bytes32[] memory) {
        return keyIds;
    }

    /**
     * @notice Estimate gas for proof verification
     * @dev Approximate gas based on public input count
     */
    function estimateVerificationGas(bytes32 _keyId) external view returns (uint256) {
        VerificationKey storage vk = verificationKeys[_keyId];
        if (vk.registeredAt == 0) {
            return 0;
        }

        // Base gas for pairing check (4 pairs) + overhead
        uint256 baseGas = 200000;

        // Additional gas per public input (scalar mul + point add)
        uint256 perInputGas = 6000;

        uint256 inputCount = vk.ic.length > 0 ? vk.ic.length - 1 : 0;

        return baseGas + (inputCount * perInputGas);
    }
}
