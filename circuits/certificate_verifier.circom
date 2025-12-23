pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * @title CertificateVerifier
 * @notice ZK circuit for verifying certificates from trusted issuers
 * @dev Proves that:
 *   1. The certificate is signed by a trusted issuer
 *   2. The certificate contains specific claims (subject, date, type)
 *   3. The certificate has not expired
 *   4. The subject matches the creator
 *
 * Privacy guarantees:
 *   - Certificate content stays private (only hash exposed)
 *   - Issuer identity proven via commitment (not revealed)
 *   - Subject identity proven via commitment (not revealed)
 */

/**
 * @title HashCertificate
 * @notice Computes Poseidon hash of certificate fields
 */
template HashCertificate() {
    // Certificate fields (private inputs)
    signal input subjectId;           // Subject identifier (e.g., hash of name + DOB)
    signal input certificateType;     // Type: 1=Death, 2=Medical, 3=Probate, 4=Court
    signal input issueDate;           // Unix timestamp of issue
    signal input expirationDate;      // Unix timestamp of expiration (0 = never)
    signal input claimData;           // Additional claim data hash

    signal output hash;

    component hasher = Poseidon(5);
    hasher.inputs[0] <== subjectId;
    hasher.inputs[1] <== certificateType;
    hasher.inputs[2] <== issueDate;
    hasher.inputs[3] <== expirationDate;
    hasher.inputs[4] <== claimData;

    hash <== hasher.out;
}

/**
 * @title VerifyIssuerSignature
 * @notice Verifies EdDSA signature from issuer on certificate hash
 */
template VerifyIssuerSignature() {
    // Issuer public key (private - proven via commitment)
    signal input issuerPubKeyX;
    signal input issuerPubKeyY;

    // Signature components (private)
    signal input sigR8X;
    signal input sigR8Y;
    signal input sigS;

    // Message to verify (certificate hash)
    signal input messageHash;

    // Commitment to issuer public key (public output)
    signal output issuerCommitment;

    // Verify EdDSA signature
    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.Ax <== issuerPubKeyX;
    verifier.Ay <== issuerPubKeyY;
    verifier.R8x <== sigR8X;
    verifier.R8y <== sigR8Y;
    verifier.S <== sigS;
    verifier.M <== messageHash;

    // Compute commitment to issuer public key
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== issuerPubKeyX;
    commitHasher.inputs[1] <== issuerPubKeyY;
    issuerCommitment <== commitHasher.out;
}

/**
 * @title CheckExpiration
 * @notice Verifies certificate has not expired
 */
template CheckExpiration() {
    signal input expirationDate;      // 0 means no expiration
    signal input currentTimestamp;    // Current time (public input)

    signal output isValid;

    // If expiration is 0, always valid
    component isZero = IsZero();
    isZero.in <== expirationDate;

    // If expiration > 0, check currentTimestamp < expirationDate
    component lessThan = LessThan(64);
    lessThan.in[0] <== currentTimestamp;
    lessThan.in[1] <== expirationDate;

    // Valid if: expiration == 0 OR currentTimestamp < expiration
    isValid <== isZero.out + (1 - isZero.out) * lessThan.out;
}

/**
 * @title DeathCertificateVerifier
 * @notice Main circuit for death certificate verification
 *
 * Public inputs:
 *   - creatorCommitment: Poseidon(creatorAddress, salt)
 *   - issuerCommitment: Poseidon(issuerPubKeyX, issuerPubKeyY)
 *   - certificateHash: Hash of certificate for on-chain reference
 *   - currentTimestamp: Current block timestamp
 *
 * Private inputs:
 *   - All certificate fields
 *   - Issuer signature
 *   - Creator address and salt
 */
template DeathCertificateVerifier() {
    // === Public Inputs ===
    signal input creatorCommitment;    // Commitment to creator identity
    signal input certificateHash;       // On-chain reference hash
    signal input currentTimestamp;      // Current time for expiration check

    // === Private Inputs: Certificate Fields ===
    signal input subjectId;
    signal input certificateType;       // Must be 1 (Death)
    signal input issueDate;
    signal input expirationDate;
    signal input claimData;             // Death date, cause, etc.

    // === Private Inputs: Issuer Signature ===
    signal input issuerPubKeyX;
    signal input issuerPubKeyY;
    signal input sigR8X;
    signal input sigR8Y;
    signal input sigS;

    // === Private Inputs: Creator Proof ===
    signal input creatorAddress;        // Ethereum address as field element
    signal input creatorSalt;           // Random salt for privacy

    // === Public Output ===
    signal output issuerCommitment;     // For on-chain issuer verification
    signal output isValid;              // Overall validity flag

    // 1. Verify certificate type is Death (1)
    component typeCheck = IsEqual();
    typeCheck.in[0] <== certificateType;
    typeCheck.in[1] <== 1;
    typeCheck.out === 1;

    // 2. Hash the certificate
    component certHash = HashCertificate();
    certHash.subjectId <== subjectId;
    certHash.certificateType <== certificateType;
    certHash.issueDate <== issueDate;
    certHash.expirationDate <== expirationDate;
    certHash.claimData <== claimData;

    // 3. Verify certificate hash matches public input
    certificateHash === certHash.hash;

    // 4. Verify issuer signature
    component sigVerify = VerifyIssuerSignature();
    sigVerify.issuerPubKeyX <== issuerPubKeyX;
    sigVerify.issuerPubKeyY <== issuerPubKeyY;
    sigVerify.sigR8X <== sigR8X;
    sigVerify.sigR8Y <== sigR8Y;
    sigVerify.sigS <== sigS;
    sigVerify.messageHash <== certHash.hash;
    issuerCommitment <== sigVerify.issuerCommitment;

    // 5. Verify creator commitment
    component creatorHasher = Poseidon(2);
    creatorHasher.inputs[0] <== creatorAddress;
    creatorHasher.inputs[1] <== creatorSalt;
    creatorCommitment === creatorHasher.out;

    // 6. Verify subject matches creator (subject is hash of creator identity)
    component subjectCheck = Poseidon(1);
    subjectCheck.inputs[0] <== creatorAddress;
    subjectId === subjectCheck.out;

    // 7. Check expiration (death certs typically don't expire, but check anyway)
    component expCheck = CheckExpiration();
    expCheck.expirationDate <== expirationDate;
    expCheck.currentTimestamp <== currentTimestamp;

    isValid <== expCheck.isValid;
}

/**
 * @title MedicalIncapacitationVerifier
 * @notice Circuit for medical incapacitation certificate verification
 */
template MedicalIncapacitationVerifier() {
    // === Public Inputs ===
    signal input creatorCommitment;
    signal input certificateHash;
    signal input currentTimestamp;

    // === Private Inputs: Certificate Fields ===
    signal input subjectId;
    signal input certificateType;       // Must be 2 (Medical)
    signal input issueDate;
    signal input expirationDate;        // Medical certs often expire
    signal input claimData;             // Incapacitation type, severity

    // === Private Inputs: Issuer Signature ===
    signal input issuerPubKeyX;
    signal input issuerPubKeyY;
    signal input sigR8X;
    signal input sigR8Y;
    signal input sigS;

    // === Private Inputs: Creator Proof ===
    signal input creatorAddress;
    signal input creatorSalt;

    // === Public Output ===
    signal output issuerCommitment;
    signal output isValid;

    // 1. Verify certificate type is Medical (2)
    component typeCheck = IsEqual();
    typeCheck.in[0] <== certificateType;
    typeCheck.in[1] <== 2;
    typeCheck.out === 1;

    // 2. Hash the certificate
    component certHash = HashCertificate();
    certHash.subjectId <== subjectId;
    certHash.certificateType <== certificateType;
    certHash.issueDate <== issueDate;
    certHash.expirationDate <== expirationDate;
    certHash.claimData <== claimData;

    // 3. Verify certificate hash matches
    certificateHash === certHash.hash;

    // 4. Verify issuer signature
    component sigVerify = VerifyIssuerSignature();
    sigVerify.issuerPubKeyX <== issuerPubKeyX;
    sigVerify.issuerPubKeyY <== issuerPubKeyY;
    sigVerify.sigR8X <== sigR8X;
    sigVerify.sigR8Y <== sigR8Y;
    sigVerify.sigS <== sigS;
    sigVerify.messageHash <== certHash.hash;
    issuerCommitment <== sigVerify.issuerCommitment;

    // 5. Verify creator commitment
    component creatorHasher = Poseidon(2);
    creatorHasher.inputs[0] <== creatorAddress;
    creatorHasher.inputs[1] <== creatorSalt;
    creatorCommitment === creatorHasher.out;

    // 6. Verify subject matches creator
    component subjectCheck = Poseidon(1);
    subjectCheck.inputs[0] <== creatorAddress;
    subjectId === subjectCheck.out;

    // 7. Check expiration - CRITICAL for medical certs
    component expCheck = CheckExpiration();
    expCheck.expirationDate <== expirationDate;
    expCheck.currentTimestamp <== currentTimestamp;

    isValid <== expCheck.isValid;
}

/**
 * @title LegalDocumentVerifier
 * @notice Circuit for legal document (probate, court ruling) verification
 */
template LegalDocumentVerifier() {
    // === Public Inputs ===
    signal input creatorCommitment;
    signal input certificateHash;
    signal input currentTimestamp;
    signal input expectedDocType;       // 3=Probate, 4=Court (public for specificity)

    // === Private Inputs: Certificate Fields ===
    signal input subjectId;
    signal input certificateType;
    signal input issueDate;
    signal input expirationDate;
    signal input claimData;

    // === Private Inputs: Issuer Signature ===
    signal input issuerPubKeyX;
    signal input issuerPubKeyY;
    signal input sigR8X;
    signal input sigR8Y;
    signal input sigS;

    // === Private Inputs: Creator Proof ===
    signal input creatorAddress;
    signal input creatorSalt;

    // === Public Output ===
    signal output issuerCommitment;
    signal output isValid;

    // 1. Verify certificate type matches expected (3 or 4)
    component typeCheck = IsEqual();
    typeCheck.in[0] <== certificateType;
    typeCheck.in[1] <== expectedDocType;
    typeCheck.out === 1;

    // Also verify it's a legal type (3 or 4)
    component isThree = IsEqual();
    isThree.in[0] <== certificateType;
    isThree.in[1] <== 3;

    component isFour = IsEqual();
    isFour.in[0] <== certificateType;
    isFour.in[1] <== 4;

    // Must be either 3 or 4
    signal isLegalType;
    isLegalType <== isThree.out + isFour.out;
    component legalCheck = GreaterThan(8);
    legalCheck.in[0] <== isLegalType;
    legalCheck.in[1] <== 0;
    legalCheck.out === 1;

    // 2. Hash the certificate
    component certHash = HashCertificate();
    certHash.subjectId <== subjectId;
    certHash.certificateType <== certificateType;
    certHash.issueDate <== issueDate;
    certHash.expirationDate <== expirationDate;
    certHash.claimData <== claimData;

    certificateHash === certHash.hash;

    // 3. Verify issuer signature
    component sigVerify = VerifyIssuerSignature();
    sigVerify.issuerPubKeyX <== issuerPubKeyX;
    sigVerify.issuerPubKeyY <== issuerPubKeyY;
    sigVerify.sigR8X <== sigR8X;
    sigVerify.sigR8Y <== sigR8Y;
    sigVerify.sigS <== sigS;
    sigVerify.messageHash <== certHash.hash;
    issuerCommitment <== sigVerify.issuerCommitment;

    // 4. Verify creator commitment
    component creatorHasher = Poseidon(2);
    creatorHasher.inputs[0] <== creatorAddress;
    creatorHasher.inputs[1] <== creatorSalt;
    creatorCommitment === creatorHasher.out;

    // 5. Verify subject matches creator
    component subjectCheck = Poseidon(1);
    subjectCheck.inputs[0] <== creatorAddress;
    subjectId === subjectCheck.out;

    // 6. Check expiration
    component expCheck = CheckExpiration();
    expCheck.expirationDate <== expirationDate;
    expCheck.currentTimestamp <== currentTimestamp;

    isValid <== expCheck.isValid;
}

// Export main circuits
component main {public [creatorCommitment, certificateHash, currentTimestamp]} = DeathCertificateVerifier();
