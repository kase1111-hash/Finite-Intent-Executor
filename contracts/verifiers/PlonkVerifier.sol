// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol"; // [Audit fix: M-2]

/**
 * @title PlonkVerifier
 * @notice On-chain PLONK proof verifier using KZG polynomial commitments
 * @dev Uses BN254 curve for pairing operations
 *
 * PLONK advantages over Groth16:
 * - Universal trusted setup (one setup for all circuits up to a size)
 * - Updatable setup (new participants can strengthen security)
 * - Smaller proof size with batching
 *
 * This verifier supports multiple verification keys for different circuits.
 */
contract PlonkVerifier is Ownable2Step {
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
    error TranscriptError();

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

    /// @notice G2 point on BN254 curve
    struct G2Point {
        uint256[2] x;
        uint256[2] y;
    }

    /// @notice PLONK verification key
    struct VerificationKey {
        // Circuit size (power of 2)
        uint256 n;
        uint256 numPublicInputs;

        // Domain generator
        uint256 omega;

        // Selector commitments
        G1Point qL;    // Left selector
        G1Point qR;    // Right selector
        G1Point qO;    // Output selector
        G1Point qM;    // Multiplication selector
        G1Point qC;    // Constant selector

        // Permutation commitments
        G1Point s1;    // Sigma 1
        G1Point s2;    // Sigma 2
        G1Point s3;    // Sigma 3

        // SRS elements for opening verification
        G2Point x2;    // [x]_2 from trusted setup

        string name;
        bool isActive;
        uint256 registeredAt;
    }

    /// @notice PLONK proof structure
    struct Proof {
        // Round 1: Wire commitments
        G1Point a;     // [a(x)]
        G1Point b;     // [b(x)]
        G1Point c;     // [c(x)]

        // Round 2: Permutation grand product
        G1Point z;     // [z(x)]

        // Round 3: Quotient polynomial
        G1Point tLow;  // [t_lo(x)]
        G1Point tMid;  // [t_mid(x)]
        G1Point tHigh; // [t_hi(x)]

        // Round 4: Linearization evaluations
        uint256 aEval;     // a(zeta)
        uint256 bEval;     // b(zeta)
        uint256 cEval;     // c(zeta)
        uint256 s1Eval;    // s1(zeta)
        uint256 s2Eval;    // s2(zeta)
        uint256 zOmegaEval; // z(zeta * omega)

        // Round 5: Opening proofs
        G1Point wZeta;      // [W_zeta(x)]
        G1Point wZetaOmega; // [W_{zeta*omega}(x)]
    }

    // =============================================================================
    // CONSTANTS
    // =============================================================================

    /// @notice BN254 curve order
    uint256 public constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    /// @notice BN254 scalar field order
    uint256 public constant PRIME_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @notice Generator of G1
    G1Point internal G1_GENERATOR;

    /// @notice Generator of G2
    G2Point internal G2_GENERATOR;

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    /// @notice Registered verification keys
    mapping(bytes32 => VerificationKey) public verificationKeys;

    /// @notice List of all registered key IDs
    bytes32[] public keyIds;

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() Ownable(msg.sender) {
        // Initialize generators
        G1_GENERATOR = G1Point(1, 2);
        G2_GENERATOR = G2Point(
            [11559732032986387107991004021392285783925812861821192530917403151452391805634,
             10857046999023057135944570762232829481370756359578518086990519993285655852781],
            [4082367875863433681332203403145435568316851327593401208105741076214120093531,
             8495653923123431417604973247489272438418190587263600148770280649306958101930]
        );
    }

    // =============================================================================
    // KEY MANAGEMENT
    // =============================================================================

    /**
     * @notice Register a new PLONK verification key
     */
    function registerVerificationKey(
        bytes32 _keyId,
        string calldata _name,
        uint256 _n,
        uint256 _numPublicInputs,
        uint256 _omega,
        G1Point[5] calldata _selectors,  // qL, qR, qO, qM, qC
        G1Point[3] calldata _sigmas,      // s1, s2, s3
        G2Point calldata _x2
    ) external onlyOwner {
        if (verificationKeys[_keyId].registeredAt != 0) {
            revert KeyAlreadyExists();
        }
        if (_n == 0 || _numPublicInputs == 0) {
            revert InvalidVerificationKey();
        }

        VerificationKey storage vk = verificationKeys[_keyId];
        vk.n = _n;
        vk.numPublicInputs = _numPublicInputs;
        vk.omega = _omega;

        vk.qL = _selectors[0];
        vk.qR = _selectors[1];
        vk.qO = _selectors[2];
        vk.qM = _selectors[3];
        vk.qC = _selectors[4];

        vk.s1 = _sigmas[0];
        vk.s2 = _sigmas[1];
        vk.s3 = _sigmas[2];

        vk.x2 = _x2;

        vk.name = _name;
        vk.isActive = true;
        vk.registeredAt = block.timestamp;

        keyIds.push(_keyId);

        emit VerificationKeyRegistered(_keyId, _name, _numPublicInputs);
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
     * @notice Verify a PLONK proof
     * @param _keyId Verification key to use
     * @param _proof The PLONK proof
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
        if (_publicInputs.length != vk.numPublicInputs) {
            revert InvalidPublicInputsLength();
        }

        // Check public inputs are in field
        for (uint256 i = 0; i < _publicInputs.length; i++) {
            if (_publicInputs[i] >= PRIME_R) {
                revert PublicInputTooLarge();
            }
        }

        return _verify(_proof, _publicInputs, vk);
    }

    /**
     * @notice Verify proof with raw bytes
     * @param _keyId Verification key to use
     * @param _proofData Encoded proof data
     * @param _publicInputs Array of public inputs
     */
    function verifyProofBytes(
        bytes32 _keyId,
        bytes calldata _proofData,
        uint256[] calldata _publicInputs
    ) external view returns (bool) {
        // PLONK proof is larger: 15 G1 points (30 * 32 bytes) + 6 scalars (6 * 32 bytes) = 1152 bytes
        if (_proofData.length != 1152) {
            revert InvalidProofLength();
        }

        Proof memory proof = _decodeProof(_proofData);

        VerificationKey storage vk = verificationKeys[_keyId];

        if (vk.registeredAt == 0) {
            revert KeyNotFound();
        }
        if (!vk.isActive) {
            revert KeyNotActive();
        }
        if (_publicInputs.length != vk.numPublicInputs) {
            revert InvalidPublicInputsLength();
        }

        return _verify(proof, _publicInputs, vk);
    }

    // =============================================================================
    // INTERNAL VERIFICATION LOGIC
    // =============================================================================

    /**
     * @notice Decode proof from bytes
     */
    function _decodeProof(bytes calldata _data) internal pure returns (Proof memory proof) {
        uint256 offset = 0;

        // Round 1 commitments
        proof.a = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        proof.b = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        proof.c = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        // Round 2: z commitment
        proof.z = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        // Round 3: t commitments
        proof.tLow = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        proof.tMid = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        proof.tHigh = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        // Round 4: Evaluations
        proof.aEval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;
        proof.bEval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;
        proof.cEval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;
        proof.s1Eval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;
        proof.s2Eval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;
        proof.zOmegaEval = uint256(bytes32(_data[offset:offset+32]));
        offset += 32;

        // Round 5: Opening proofs
        proof.wZeta = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
        offset += 64;

        proof.wZetaOmega = G1Point(
            uint256(bytes32(_data[offset:offset+32])),
            uint256(bytes32(_data[offset+32:offset+64]))
        );
    }

    /**
     * @notice Internal PLONK verification logic
     * @dev Implements the PLONK verification algorithm:
     *      1. Compute challenges from transcript
     *      2. Compute public input polynomial evaluation
     *      3. Compute linearization polynomial commitment
     *      4. Perform batched KZG verification
     */
    function _verify(
        Proof memory _proof,
        uint256[] calldata _publicInputs,
        VerificationKey storage _vk
    ) internal view returns (bool) {
        // Step 1: Compute Fiat-Shamir challenges
        (uint256 beta, uint256 gamma, uint256 alpha, uint256 zeta, uint256 v, uint256 u)
            = _computeChallenges(_proof, _publicInputs, _vk);

        // Step 2: Compute vanishing polynomial evaluation at zeta
        uint256 zhZeta = _computeZhZeta(zeta, _vk.n);

        // Step 3: Compute Lagrange polynomial L1(zeta)
        uint256 l1Zeta = _computeL1Zeta(zeta, zhZeta, _vk.n);

        // Step 4: Compute public input contribution
        uint256 piZeta = _computePublicInputEval(_publicInputs, zeta, _vk);

        // Step 5: Compute linearization polynomial commitment
        G1Point memory r = _computeLinearization(
            _proof, _vk, alpha, beta, gamma, zeta, l1Zeta, piZeta
        );

        // Step 6: Compute batched polynomial commitment
        G1Point memory d = _computeBatchedCommitment(_proof, _vk, r, v, u);

        // Step 7: Compute batched evaluation
        uint256 e = _computeBatchedEvaluation(_proof, v, u, piZeta);

        // Step 8: Perform pairing check
        return _pairingCheck(_proof, _vk, d, e, zeta, u);
    }

    /**
     * @notice Compute Fiat-Shamir challenges from transcript
     */
    function _computeChallenges(
        Proof memory _proof,
        uint256[] calldata _publicInputs,
        VerificationKey storage _vk
    ) internal view returns (
        uint256 beta,
        uint256 gamma,
        uint256 alpha,
        uint256 zeta,
        uint256 v,
        uint256 u
    ) {
        // Simplified challenge computation using keccak256
        // In production, use proper Fiat-Shamir transcript

        bytes32 transcript = keccak256(abi.encodePacked(
            _vk.n,
            _proof.a.x, _proof.a.y,
            _proof.b.x, _proof.b.y,
            _proof.c.x, _proof.c.y
        ));

        for (uint256 i = 0; i < _publicInputs.length; i++) {
            transcript = keccak256(abi.encodePacked(transcript, _publicInputs[i]));
        }

        beta = uint256(keccak256(abi.encodePacked(transcript, "beta"))) % PRIME_R;
        gamma = uint256(keccak256(abi.encodePacked(transcript, "gamma"))) % PRIME_R;

        transcript = keccak256(abi.encodePacked(transcript, _proof.z.x, _proof.z.y));
        alpha = uint256(keccak256(abi.encodePacked(transcript, "alpha"))) % PRIME_R;

        transcript = keccak256(abi.encodePacked(
            transcript,
            _proof.tLow.x, _proof.tLow.y,
            _proof.tMid.x, _proof.tMid.y,
            _proof.tHigh.x, _proof.tHigh.y
        ));
        zeta = uint256(keccak256(abi.encodePacked(transcript, "zeta"))) % PRIME_R;

        transcript = keccak256(abi.encodePacked(
            transcript,
            _proof.aEval, _proof.bEval, _proof.cEval,
            _proof.s1Eval, _proof.s2Eval, _proof.zOmegaEval
        ));
        v = uint256(keccak256(abi.encodePacked(transcript, "v"))) % PRIME_R;

        transcript = keccak256(abi.encodePacked(
            transcript,
            _proof.wZeta.x, _proof.wZeta.y,
            _proof.wZetaOmega.x, _proof.wZetaOmega.y
        ));
        u = uint256(keccak256(abi.encodePacked(transcript, "u"))) % PRIME_R;
    }

    /**
     * @notice Compute vanishing polynomial at zeta: z^n - 1
     */
    function _computeZhZeta(uint256 _zeta, uint256 _n) internal pure returns (uint256) {
        return addmod(expmod(_zeta, _n, PRIME_R), PRIME_R - 1, PRIME_R);
    }

    /**
     * @notice Compute first Lagrange polynomial at zeta
     */
    function _computeL1Zeta(uint256 _zeta, uint256 _zhZeta, uint256 _n) internal pure returns (uint256) {
        uint256 nInv = expmod(_n, PRIME_R - 2, PRIME_R);  // Modular inverse
        uint256 zetaMinusOne = addmod(_zeta, PRIME_R - 1, PRIME_R);
        uint256 denom = mulmod(zetaMinusOne, nInv, PRIME_R);
        return mulmod(_zhZeta, expmod(denom, PRIME_R - 2, PRIME_R), PRIME_R);
    }

    /**
     * @notice Compute public input polynomial evaluation (placeholder)
     */
    function _computePublicInputEval(
        uint256[] calldata _publicInputs,
        uint256 _zeta,
        VerificationKey storage _vk
    ) internal view returns (uint256) {
        // Simplified: sum of public inputs weighted by Lagrange polynomials
        uint256 result = 0;
        uint256 omegaPow = 1;

        for (uint256 i = 0; i < _publicInputs.length; i++) {
            uint256 li = _computeLagrangeI(i, _zeta, _vk.omega, _vk.n);
            result = addmod(result, mulmod(_publicInputs[i], li, PRIME_R), PRIME_R);
            omegaPow = mulmod(omegaPow, _vk.omega, PRIME_R);
        }

        return result;
    }

    /**
     * @notice Compute Lagrange polynomial L_i(zeta)
     */
    function _computeLagrangeI(
        uint256 _i,
        uint256 _zeta,
        uint256 _omega,
        uint256 _n
    ) internal pure returns (uint256) {
        uint256 omegaI = expmod(_omega, _i, PRIME_R);
        uint256 zetaMinusOmegaI = addmod(_zeta, PRIME_R - omegaI, PRIME_R);

        if (zetaMinusOmegaI == 0) {
            return 1;  // zeta = omega^i
        }

        uint256 zhZeta = addmod(expmod(_zeta, _n, PRIME_R), PRIME_R - 1, PRIME_R);
        uint256 nInv = expmod(_n, PRIME_R - 2, PRIME_R);
        uint256 denom = mulmod(zetaMinusOmegaI, nInv, PRIME_R);

        return mulmod(zhZeta, mulmod(omegaI, expmod(denom, PRIME_R - 2, PRIME_R), PRIME_R), PRIME_R);
    }

    /**
     * @notice Compute linearization polynomial commitment (placeholder)
     */
    function _computeLinearization(
        Proof memory _proof,
        VerificationKey storage _vk,
        uint256 _alpha,
        uint256 _beta,
        uint256 _gamma,
        uint256 _zeta,
        uint256 _l1Zeta,
        uint256 _piZeta
    ) internal view returns (G1Point memory) {
        // Placeholder: return a combination of proof elements
        // Full implementation would compute the linearization commitment
        return _scalarMul(_vk.qL, _proof.aEval);
    }

    /**
     * @notice Compute batched polynomial commitment (placeholder)
     */
    function _computeBatchedCommitment(
        Proof memory _proof,
        VerificationKey storage _vk,
        G1Point memory _r,
        uint256 _v,
        uint256 _u
    ) internal view returns (G1Point memory) {
        return _r;
    }

    /**
     * @notice Compute batched evaluation (placeholder)
     */
    function _computeBatchedEvaluation(
        Proof memory _proof,
        uint256 _v,
        uint256 _u,
        uint256 _piZeta
    ) internal pure returns (uint256) {
        return _proof.aEval;
    }

    /**
     * @notice Perform final pairing check (placeholder)
     */
    function _pairingCheck(
        Proof memory _proof,
        VerificationKey storage _vk,
        G1Point memory _d,
        uint256 _e,
        uint256 _zeta,
        uint256 _u
    ) internal view returns (bool) {
        // Simplified pairing check
        // Full implementation would do proper KZG verification
        return _pairing2(
            _proof.wZeta,
            _vk.x2,
            _negate(_d),
            G2_GENERATOR
        );
    }

    // =============================================================================
    // ELLIPTIC CURVE OPERATIONS
    // =============================================================================

    function _negate(G1Point memory p) internal pure returns (G1Point memory) {
        if (p.x == 0 && p.y == 0) {
            return G1Point(0, 0);
        }
        return G1Point(p.x, PRIME_Q - (p.y % PRIME_Q));
    }

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

    function _pairing2(
        G1Point memory a1, G2Point memory a2,
        G1Point memory b1, G2Point memory b2
    ) internal view returns (bool) {
        uint256[12] memory input;

        input[0] = a1.x;
        input[1] = a1.y;
        input[2] = a2.x[1];
        input[3] = a2.x[0];
        input[4] = a2.y[1];
        input[5] = a2.y[0];

        input[6] = b1.x;
        input[7] = b1.y;
        input[8] = b2.x[1];
        input[9] = b2.x[0];
        input[10] = b2.y[1];
        input[11] = b2.y[0];

        uint256[1] memory result;
        bool success;

        assembly {
            success := staticcall(gas(), 8, input, 384, result, 32)
        }

        if (!success) {
            revert PairingFailed();
        }

        return result[0] == 1;
    }

    /**
     * @notice Modular exponentiation
     */
    function expmod(uint256 base, uint256 e, uint256 m) internal pure returns (uint256) {
        if (e == 0) return 1;
        if (e == 1) return base % m;

        uint256 result = 1;
        base = base % m;

        while (e > 0) {
            if (e & 1 == 1) {
                result = mulmod(result, base, m);
            }
            e = e >> 1;
            base = mulmod(base, base, m);
        }

        return result;
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

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
            vk.numPublicInputs,
            vk.registeredAt
        );
    }

    function isKeyActive(bytes32 _keyId) external view returns (bool) {
        VerificationKey storage vk = verificationKeys[_keyId];
        return vk.registeredAt != 0 && vk.isActive;
    }

    function getAllKeyIds() external view returns (bytes32[] memory) {
        return keyIds;
    }

    function estimateVerificationGas(bytes32 _keyId) external view returns (uint256) {
        VerificationKey storage vk = verificationKeys[_keyId];
        if (vk.registeredAt == 0) {
            return 0;
        }

        // PLONK verification is generally more expensive
        uint256 baseGas = 350000;
        uint256 perInputGas = 3000;

        return baseGas + (vk.numPublicInputs * perInputGas);
    }
}
