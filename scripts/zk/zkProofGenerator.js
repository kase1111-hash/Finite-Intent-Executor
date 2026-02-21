/**
 * ZK Proof Generator Utility
 *
 * This module provides utilities for generating ZK proofs for certificate verification.
 * It interfaces with snarkjs for Groth16 and PLONK proof generation.
 *
 * Usage:
 *   const generator = new ZKProofGenerator(circuitWasmPath, zkeyPath);
 *   const { proof, publicSignals } = await generator.generateProof(inputs);
 *   const solidityProof = generator.formatProofForSolidity(proof, publicSignals);
 */

import { buildPoseidon } from "circomlibjs";
import snarkjs from "snarkjs";
import { ethers } from "ethers";

/**
 * Certificate types matching the circuit
 */
const CertificateType = {
    DEATH: 1,
    MEDICAL: 2,
    PROBATE: 3,
    COURT: 4
};

/**
 * ZK Proof Generator Class
 */
class ZKProofGenerator {
    constructor(wasmPath, zkeyPath, proofSystem = "groth16") {
        this.wasmPath = wasmPath;
        this.zkeyPath = zkeyPath;
        this.proofSystem = proofSystem;
        this.poseidon = null;
    }

    /**
     * Initialize Poseidon hash function
     */
    async init() {
        this.poseidon = await buildPoseidon();
        return this;
    }

    /**
     * Compute Poseidon hash of inputs
     * @param {Array} inputs - Array of bigints or numbers
     * @returns {bigint} - Hash result as bigint
     */
    poseidonHash(inputs) {
        if (!this.poseidon) {
            throw new Error("Poseidon not initialized. Call init() first.");
        }
        const hash = this.poseidon(inputs.map(x => BigInt(x)));
        return this.poseidon.F.toObject(hash);
    }

    /**
     * Generate commitment from address and salt
     * @param {string} address - Ethereum address
     * @param {bigint} salt - Random salt
     * @returns {bigint} - Commitment
     */
    computeCreatorCommitment(address, salt) {
        const addressBigInt = BigInt(address);
        return this.poseidonHash([addressBigInt, salt]);
    }

    /**
     * Compute subject ID from creator address
     * @param {string} address - Ethereum address
     * @returns {bigint} - Subject ID
     */
    computeSubjectId(address) {
        return this.poseidonHash([BigInt(address)]);
    }

    /**
     * Compute certificate hash
     * @param {Object} cert - Certificate object
     * @returns {bigint} - Certificate hash
     */
    computeCertificateHash(cert) {
        return this.poseidonHash([
            cert.subjectId,
            cert.certificateType,
            cert.issueDate,
            cert.expirationDate,
            cert.claimData
        ]);
    }

    /**
     * Compute issuer commitment from public key
     * @param {bigint} pubKeyX - Issuer public key X
     * @param {bigint} pubKeyY - Issuer public key Y
     * @returns {bigint} - Issuer commitment
     */
    computeIssuerCommitment(pubKeyX, pubKeyY) {
        return this.poseidonHash([pubKeyX, pubKeyY]);
    }

    /**
     * Prepare inputs for death certificate verification
     * @param {Object} params - Certificate and signature parameters
     * @returns {Object} - Formatted inputs for the circuit
     */
    prepareDeathCertificateInputs({
        creatorAddress,
        creatorSalt,
        issueDate,
        expirationDate,
        claimData,
        issuerPubKeyX,
        issuerPubKeyY,
        sigR8X,
        sigR8Y,
        sigS,
        currentTimestamp
    }) {
        const subjectId = this.computeSubjectId(creatorAddress);
        const creatorCommitment = this.computeCreatorCommitment(creatorAddress, creatorSalt);

        const certificate = {
            subjectId,
            certificateType: CertificateType.DEATH,
            issueDate: BigInt(issueDate),
            expirationDate: BigInt(expirationDate),
            claimData: BigInt(claimData)
        };

        const certificateHash = this.computeCertificateHash(certificate);

        return {
            // Public inputs
            creatorCommitment: creatorCommitment.toString(),
            certificateHash: certificateHash.toString(),
            currentTimestamp: currentTimestamp.toString(),

            // Private inputs: certificate
            subjectId: subjectId.toString(),
            certificateType: CertificateType.DEATH.toString(),
            issueDate: issueDate.toString(),
            expirationDate: expirationDate.toString(),
            claimData: claimData.toString(),

            // Private inputs: issuer signature
            issuerPubKeyX: issuerPubKeyX.toString(),
            issuerPubKeyY: issuerPubKeyY.toString(),
            sigR8X: sigR8X.toString(),
            sigR8Y: sigR8Y.toString(),
            sigS: sigS.toString(),

            // Private inputs: creator
            creatorAddress: BigInt(creatorAddress).toString(),
            creatorSalt: creatorSalt.toString()
        };
    }

    /**
     * Prepare inputs for medical incapacitation verification
     */
    prepareMedicalCertificateInputs(params) {
        const inputs = this.prepareDeathCertificateInputs(params);
        inputs.certificateType = CertificateType.MEDICAL.toString();

        // Recalculate certificate hash with medical type
        const subjectId = BigInt(inputs.subjectId);
        const certificate = {
            subjectId,
            certificateType: CertificateType.MEDICAL,
            issueDate: BigInt(params.issueDate),
            expirationDate: BigInt(params.expirationDate),
            claimData: BigInt(params.claimData)
        };
        inputs.certificateHash = this.computeCertificateHash(certificate).toString();

        return inputs;
    }

    /**
     * Generate ZK proof
     * @param {Object} inputs - Circuit inputs
     * @returns {Object} - { proof, publicSignals }
     */
    async generateProof(inputs) {
        if (this.proofSystem === "groth16") {
            return await snarkjs.groth16.fullProve(
                inputs,
                this.wasmPath,
                this.zkeyPath
            );
        } else if (this.proofSystem === "plonk") {
            return await snarkjs.plonk.fullProve(
                inputs,
                this.wasmPath,
                this.zkeyPath
            );
        } else {
            throw new Error(`Unknown proof system: ${this.proofSystem}`);
        }
    }

    /**
     * Verify proof locally
     * @param {Object} proof - The proof
     * @param {Array} publicSignals - Public signals
     * @param {Object} vkey - Verification key
     * @returns {boolean} - Whether proof is valid
     */
    async verifyProof(proof, publicSignals, vkey) {
        if (this.proofSystem === "groth16") {
            return await snarkjs.groth16.verify(vkey, publicSignals, proof);
        } else if (this.proofSystem === "plonk") {
            return await snarkjs.plonk.verify(vkey, publicSignals, proof);
        }
        return false;
    }

    /**
     * Format Groth16 proof for Solidity contract
     * @param {Object} proof - snarkjs proof
     * @param {Array} publicSignals - Public signals
     * @returns {Object} - Formatted proof for contract
     */
    formatGroth16ProofForSolidity(proof, publicSignals) {
        // Convert proof to contract-compatible format
        const proofForContract = {
            a: {
                x: BigInt(proof.pi_a[0]),
                y: BigInt(proof.pi_a[1])
            },
            b: {
                x: [BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1])],
                y: [BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])]
            },
            c: {
                x: BigInt(proof.pi_c[0]),
                y: BigInt(proof.pi_c[1])
            }
        };

        const publicInputs = publicSignals.map(s => BigInt(s));

        return { proof: proofForContract, publicInputs };
    }

    /**
     * Encode Groth16 proof as bytes for verifyProofBytes
     * @param {Object} proof - snarkjs proof
     * @returns {string} - Hex-encoded proof bytes
     */
    encodeGroth16ProofAsBytes(proof) {
        const abiCoder = new ethers.AbiCoder();

        // Encode in order: a.x, a.y, b.x[0], b.x[1], b.y[0], b.y[1], c.x, c.y
        const proofBytes = abiCoder.encode(
            ["uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
            [
                proof.pi_a[0],
                proof.pi_a[1],
                proof.pi_b[0][0],
                proof.pi_b[0][1],
                proof.pi_b[1][0],
                proof.pi_b[1][1],
                proof.pi_c[0],
                proof.pi_c[1]
            ]
        );

        return proofBytes;
    }

    /**
     * Generate a random salt for commitments
     * @returns {bigint} - Random salt
     */
    static generateSalt() {
        const bytes = ethers.randomBytes(31); // Keep under field size
        return BigInt("0x" + Buffer.from(bytes).toString("hex"));
    }

    /**
     * Export verification key for on-chain registration
     * @param {Object} vkey - Verification key from snarkjs
     * @returns {Object} - Formatted for registerVerificationKey
     */
    static formatVerificationKeyForContract(vkey) {
        return {
            alpha: {
                x: BigInt(vkey.vk_alpha_1[0]),
                y: BigInt(vkey.vk_alpha_1[1])
            },
            beta: {
                x: [BigInt(vkey.vk_beta_2[0][0]), BigInt(vkey.vk_beta_2[0][1])],
                y: [BigInt(vkey.vk_beta_2[1][0]), BigInt(vkey.vk_beta_2[1][1])]
            },
            gamma: {
                x: [BigInt(vkey.vk_gamma_2[0][0]), BigInt(vkey.vk_gamma_2[0][1])],
                y: [BigInt(vkey.vk_gamma_2[1][0]), BigInt(vkey.vk_gamma_2[1][1])]
            },
            delta: {
                x: [BigInt(vkey.vk_delta_2[0][0]), BigInt(vkey.vk_delta_2[0][1])],
                y: [BigInt(vkey.vk_delta_2[1][0]), BigInt(vkey.vk_delta_2[1][1])]
            },
            ic: vkey.IC.map(point => ({
                x: BigInt(point[0]),
                y: BigInt(point[1])
            }))
        };
    }
}

/**
 * Certificate Builder Helper
 */
class CertificateBuilder {
    constructor(generator) {
        this.generator = generator;
        this.certificate = {};
    }

    setCreator(address, salt = null) {
        this.certificate.creatorAddress = address;
        this.certificate.creatorSalt = salt || ZKProofGenerator.generateSalt();
        return this;
    }

    setType(type) {
        this.certificate.certificateType = type;
        return this;
    }

    setDates(issueDate, expirationDate = 0) {
        this.certificate.issueDate = BigInt(issueDate);
        this.certificate.expirationDate = BigInt(expirationDate);
        return this;
    }

    setClaimData(data) {
        if (typeof data === "string") {
            this.certificate.claimData = BigInt(ethers.keccak256(ethers.toUtf8Bytes(data)));
        } else {
            this.certificate.claimData = BigInt(data);
        }
        return this;
    }

    setIssuerSignature(pubKeyX, pubKeyY, sigR8X, sigR8Y, sigS) {
        this.certificate.issuerPubKeyX = BigInt(pubKeyX);
        this.certificate.issuerPubKeyY = BigInt(pubKeyY);
        this.certificate.sigR8X = BigInt(sigR8X);
        this.certificate.sigR8Y = BigInt(sigR8Y);
        this.certificate.sigS = BigInt(sigS);
        return this;
    }

    setCurrentTimestamp(timestamp = null) {
        this.certificate.currentTimestamp = timestamp || BigInt(Math.floor(Date.now() / 1000));
        return this;
    }

    build() {
        return this.certificate;
    }
}

// Export classes
export { ZKProofGenerator, CertificateBuilder, CertificateType };

// Example usage (when run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log("ZK Proof Generator Utility");
    console.log("==========================");
    console.log("");
    console.log("Usage example:");
    console.log("");
    console.log("  const { ZKProofGenerator } = require('./zkProofGenerator');");
    console.log("  const generator = await new ZKProofGenerator(wasmPath, zkeyPath).init();");
    console.log("");
    console.log("  const inputs = generator.prepareDeathCertificateInputs({");
    console.log("    creatorAddress: '0x...',");
    console.log("    creatorSalt: ZKProofGenerator.generateSalt(),");
    console.log("    issueDate: Date.now(),");
    console.log("    expirationDate: 0,");
    console.log("    claimData: ethers.keccak256(ethers.toUtf8Bytes('death-data')),");
    console.log("    issuerPubKeyX: '...',");
    console.log("    issuerPubKeyY: '...',");
    console.log("    sigR8X: '...',");
    console.log("    sigR8Y: '...',");
    console.log("    sigS: '...',");
    console.log("    currentTimestamp: Math.floor(Date.now() / 1000)");
    console.log("  });");
    console.log("");
    console.log("  const { proof, publicSignals } = await generator.generateProof(inputs);");
    console.log("  const proofBytes = generator.encodeGroth16ProofAsBytes(proof);");
}
