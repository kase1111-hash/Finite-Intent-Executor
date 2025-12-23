pragma circom 2.1.6;

include "./certificate_verifier.circom";

// Legal document verifier entry point (probate orders, court rulings)
component main {public [creatorCommitment, certificateHash, currentTimestamp, expectedDocType]} = LegalDocumentVerifier();
