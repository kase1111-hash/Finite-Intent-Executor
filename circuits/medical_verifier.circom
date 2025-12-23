pragma circom 2.1.6;

include "./certificate_verifier.circom";

// Medical incapacitation verifier entry point
component main {public [creatorCommitment, certificateHash, currentTimestamp]} = MedicalIncapacitationVerifier();
