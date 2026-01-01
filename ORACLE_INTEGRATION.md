# Finite Intent Executor - Oracle Integration

## Overview

The Oracle Integration module provides secure, verifiable external data feeds for triggering the Finite Intent Executor. It enables the system to respond to real-world events (death certificates, medical conditions, legal rulings) through a multi-oracle consensus mechanism with reputation tracking.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                            TriggerMechanism                               │
│  ┌──────────────┬──────────────┬──────────────┐                          │
│  │ DeadmanSwitch│TrustedQuorum │OracleVerified│                          │
│  └──────────────┴──────────────┴──────┬───────┘                          │
│                                       │                                   │
│          ┌─────────────────┬──────────┴──────────┬─────────────────┐     │
│          │                 │                     │                 │     │
│  ┌───────▼───────┐ ┌───────▼───────┐ ┌──────────▼──────────┐      │     │
│  │ OracleRegistry │ │  ZKVerifier   │ │ Direct Oracle Mode │      │     │
│  │  (Registry)    │ │   Adapter     │ │     (Legacy)       │      │     │
│  └───────┬───────┘ └───────┬───────┘ └────────────────────┘      │     │
│          │                 │                                       │     │
│    ┌─────┴─────────────────┼───────────────────────┐              │     │
│    │                       │                       │              │     │
│  ┌─▼────────────┐ ┌────────▼────────┐ ┌───────────▼───────────┐  │     │
│  │ Chainlink    │ │   UMAAdapter    │ │ TrustedIssuerRegistry │  │     │
│  │ Adapter      │ │                 │ │                       │  │     │
│  │(Implemented) │ │  (Implemented)  │ │     (Implemented)     │  │     │
│  └──────────────┘ └─────────────────┘ └───────────────────────┘  │     │
└───────────────────────────────────────────────────────────────────────────┘
```

## Contracts

### IOracle (Interface)

**Location:** `contracts/oracles/IOracle.sol`

Standard interface that all oracle adapters must implement.

**Key Types:**

```solidity
enum EventType {
    Death,              // Death certificate verification
    Incapacitation,     // Medical incapacitation
    LegalEvent,         // Court ruling, probate, etc.
    Custom              // Custom event type
}

enum VerificationStatus {
    Pending,            // Request submitted, awaiting response
    Verified,           // Event verified as true
    Rejected,           // Event verification failed
    Disputed,           // Verification is under dispute
    Expired             // Request expired without resolution
}
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `requestVerification()` | Submit a verification request |
| `getVerificationStatus()` | Get status of a request |
| `isVerificationValid()` | Check if verification meets 95% threshold |
| `getOracleType()` | Get oracle type identifier |
| `isActive()` | Check if oracle is operational |

---

### ChainlinkAdapter

**Location:** `contracts/oracles/ChainlinkAdapter.sol`

Chainlink Any API adapter for external data verification.

**Features:**
- Chainlink oracle integration (configurable)
- Direct fulfillment mode for testing
- Request expiration (default: 7 days)
- Dispute mechanism
- Authorized operator management

**Configuration:**

```solidity
constructor(
    address _linkToken,      // LINK token address (address(0) for testing)
    address _oracle,         // Chainlink oracle address
    bytes32 _jobId,          // Job ID for verification requests
    uint256 _fee             // Fee in LINK per request
)
```

**Usage:**

```javascript
// Deploy ChainlinkAdapter
const adapter = await ChainlinkAdapter.deploy(
    linkTokenAddress,
    oracleAddress,
    jobId,
    ethers.parseEther("0.1")
);

// Request verification
const requestId = await adapter.requestVerification(
    creatorAddress,
    0, // EventType.Death
    dataHash
);

// Fulfill (operator or Chainlink callback)
await adapter.fulfillVerification(
    requestId,
    1, // VerificationStatus.Verified
    98 // 98% confidence
);
```

---

### UMAAdapter

**Location:** `contracts/oracles/UMAAdapter.sol`

UMA Optimistic Oracle adapter providing economic dispute resolution.

**How UMA Works:**

Unlike Chainlink (request/response), UMA uses an optimistic approach:
1. An **asserter** makes a claim (e.g., "Person X died on 2025-01-01")
2. A **bond** is posted with the assertion
3. During the **liveness period**, anyone can dispute
4. If **disputed**, UMA's Data Verification Mechanism (DVM) resolves it
5. If **undisputed**, the assertion is accepted as truth
6. The **loser forfeits their bond** to the winner

**Features:**
- Economic security through bonding
- Dispute resolution via UMA DVM
- Configurable liveness period (default: 2 hours)
- Callback support for dispute resolution
- Binary confidence (100% if verified, 0% if rejected)

**Configuration:**

```solidity
constructor(
    address _optimisticOracle,  // UMA Optimistic Oracle V3 address
    address _bondCurrency,      // Bond token (USDC, UMA, etc.)
    uint256 _bondAmount,        // Bond amount (default: 1000e18)
    uint64 _liveness            // Dispute window (default: 2 hours)
)
```

**Usage:**

```javascript
// Deploy UMAAdapter
const umaAdapter = await UMAAdapter.deploy(
    optimisticOracleV3Address,
    usdcAddress,
    ethers.parseUnits("100", 6), // 100 USDC bond
    7200 // 2 hour liveness
);

// Request verification (creates pending request)
const requestId = await umaAdapter.requestVerification(
    creatorAddress,
    0, // EventType.Death
    dataHash
);

// Approve bond tokens
await usdc.approve(umaAdapter.target, bondAmount);

// Make assertion with claim
const claim = ethers.toUtf8Bytes("Person 0x123... died on 2025-01-15");
const assertionId = await umaAdapter.assertVerification(requestId, claim);

// Wait for liveness period...

// Settle (if no dispute)
await umaAdapter.settleVerification(requestId);

// Check result
const isValid = await umaAdapter.isVerificationValid(requestId);
```

**UMA-Specific Functions:**

| Function | Description |
|----------|-------------|
| `assertVerification()` | Make assertion with bond |
| `settleVerification()` | Settle after liveness period |
| `disputeVerification()` | Dispute an assertion (requires bond) |
| `assertionResolvedCallback()` | Callback from DVM resolution |
| `canSettle()` | Check if liveness period passed |
| `getBondConfig()` | Get bond configuration |

**Dispute Flow:**

```
1. Asserter makes claim
   └── assertVerification(requestId, claim)
   └── Bond transferred to adapter

2. Liveness period begins (2 hours default)
   └── Anyone can dispute during this window

3a. No dispute → Settle
    └── settleVerification(requestId)
    └── Asserter gets bond back
    └── Verification marked as Verified

3b. Dispute filed
    └── disputeVerification(requestId)
    └── Disputer posts bond
    └── Goes to UMA DVM for resolution

4. DVM Resolution (if disputed)
   └── UMA token holders vote
   └── Winner gets both bonds
   └── assertionResolvedCallback() called
```

---

### OracleRegistry

**Location:** `contracts/oracles/OracleRegistry.sol`

Multi-oracle consensus and reputation management.

**Features:**
- Register multiple oracle adapters
- Multi-oracle consensus mechanism
- Reputation tracking (0-100 score)
- Configurable consensus threshold
- Automatic reputation updates based on consensus agreement

**Configuration:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minReputationThreshold` | 50 | Minimum reputation to participate |
| `defaultConsensusThreshold` | 1 | Default oracles required for consensus |
| `MAX_ORACLES` | 20 | Maximum registered oracles |

**Usage:**

```javascript
// Deploy OracleRegistry
const registry = await OracleRegistry.deploy();

// Register oracle adapters
await registry.registerOracle(chainlinkAdapter.address);
await registry.registerOracle(umaAdapter.address);

// Set consensus threshold
await registry.setConsensusThreshold(2); // Require 2 oracles

// Request aggregated verification
const aggregationId = await registry.requestAggregatedVerification(
    creatorAddress,
    0, // EventType.Death
    dataHash,
    0  // Use default threshold
);

// Oracles submit results
await registry.connect(oracle1).submitOracleResult(aggregationId, true, 98);
await registry.connect(oracle2).submitOracleResult(aggregationId, true, 96);

// Check if valid
const isValid = await registry.isAggregationValid(aggregationId);
```

---

### IZKVerifier (Interface)

**Location:** `contracts/oracles/IZKVerifier.sol`

Interface for zero-knowledge proof verifiers supporting multiple proof systems.

**Supported Proof Systems:**

```solidity
enum ProofSystem {
    Groth16,    // Most efficient, requires trusted setup per circuit
    PLONK,      // Universal setup, good balance of size/speed
    STARK       // No trusted setup, quantum resistant, larger proofs
}
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `registerVerificationKey()` | Register a new verification key for a circuit |
| `verifyProof()` | Verify a ZK proof against a verification key |
| `isKeyActive()` | Check if a verification key is active |
| `getVerificationKey()` | Get verification key details |
| `estimateVerificationGas()` | Estimate gas cost for verification |

---

### TrustedIssuerRegistry

**Location:** `contracts/oracles/TrustedIssuerRegistry.sol`

Registry of trusted certificate authorities for ZK verification.

**Issuer Categories:**

```solidity
enum IssuerCategory {
    Government,     // Government agencies (death certificates, IDs)
    Medical,        // Medical institutions (incapacitation certs)
    Legal,          // Courts and legal entities (probate, rulings)
    Financial,      // Financial institutions
    Custom          // Other trusted entities
}
```

**Pre-registered Certificate Types:**

| Type ID | Name | Required Category | Validity |
|---------|------|-------------------|----------|
| `DEATH_CERTIFICATE` | Death Certificate | Government | Permanent |
| `MEDICAL_INCAPACITATION` | Medical Incapacitation | Medical | 1 year |
| `PROBATE_ORDER` | Probate Court Order | Legal | Permanent |
| `COURT_RULING` | Court Ruling | Legal | Permanent |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `registerIssuer()` | Register a new trusted issuer |
| `isIssuerTrusted()` | Check if an issuer is currently trusted |
| `canIssuerIssueCertType()` | Check if issuer can issue a certificate type |
| `verifyIssuerSignature()` | Verify a signature is from a trusted issuer |
| `getActiveIssuersForCertType()` | Get all active issuers for a certificate type |

**Usage:**

```javascript
// Deploy TrustedIssuerRegistry
const registry = await TrustedIssuerRegistry.deploy();

// Register a government issuer
const issuerId = ethers.keccak256(ethers.toUtf8Bytes("US-SSA"));
const publicKeyHash = ethers.keccak256(publicKey);
await registry.registerIssuer(
    issuerId,
    "US Social Security Administration",
    0, // IssuerCategory.Government
    publicKeyHash,
    "US",
    0 // No expiration
);

// Authorize issuer for death certificates
const deathCertType = ethers.keccak256(ethers.toUtf8Bytes("DEATH_CERTIFICATE"));
await registry.authorizeIssuerForCertType(issuerId, deathCertType);

// Verify issuer is trusted
const isTrusted = await registry.isIssuerTrusted(issuerId);
```

---

### ZKVerifierAdapter

**Location:** `contracts/oracles/ZKVerifierAdapter.sol`

Zero-knowledge proof adapter implementing the IOracle interface for privacy-preserving verification.

**How ZK Verification Works:**

```
1. Off-chain: Prover has a certificate signed by a trusted issuer
2. Off-chain: Prover generates a ZK proof that:
   - The certificate is signed by a trusted issuer
   - The certificate contains specific claims (e.g., death date)
   - The certificate refers to the correct person (creator)
3. On-chain: ZKVerifierAdapter verifies the proof
4. On-chain: If valid, the verification is marked complete
   (Certificate data never appears on-chain - only proof and commitments)
```

**Features:**
- Multiple proof system support (Groth16, PLONK, STARK)
- Integration with TrustedIssuerRegistry
- Binary confidence (100% if verified, 0% if rejected)
- Privacy-preserving (no certificate data on-chain)
- Verification key management

**Configuration:**

```solidity
constructor(
    address _issuerRegistry  // TrustedIssuerRegistry address
)
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `registerVerificationKey()` | Register a ZK circuit verification key |
| `requestVerification()` | Submit a verification request |
| `submitZKProof()` | Submit a ZK proof for verification |
| `isVerificationValid()` | Check if verification is valid (95%+ confidence) |
| `getKeysForEventType()` | Get active verification keys for an event type |

**Usage:**

```javascript
// Deploy ZKVerifierAdapter with issuer registry
const zkAdapter = await ZKVerifierAdapter.deploy(issuerRegistry.target);

// Register a verification key for death certificates
const keyId = ethers.keccak256(ethers.toUtf8Bytes("death-groth16-v1"));
await zkAdapter.registerVerificationKey(
    keyId,
    0, // ProofSystem.Groth16
    0, // EventType.Death
    circuitHash,
    verificationKeyData
);

// Request verification
const dataHash = ethers.keccak256(certificateData);
const requestId = await zkAdapter.requestVerification(
    creatorAddress,
    0, // EventType.Death
    dataHash
);

// Submit ZK proof (off-chain prover generates this)
const creatorCommitment = ethers.keccak256(ethers.encodePacked(creatorAddress));
const issuerCommitment = ethers.keccak256(issuerPublicKey);
const success = await zkAdapter.submitZKProof(
    requestId,
    keyId,
    zkProofBytes,
    creatorCommitment,
    issuerCommitment,
    dataHash
);

// Check if verification is valid
const isValid = await zkAdapter.isVerificationValid(requestId);
```

**ZK Proof Flow:**

```
1. Creator configures ZK proof trigger
   └── triggerMechanism.configureZKProofVerified(eventType, dataHash, keyId)

2. Family/executor requests ZK verification
   └── triggerMechanism.requestZKVerification()
   └── ZKVerifierAdapter.requestVerification()

3. Off-chain prover generates ZK proof
   └── Inputs: certificate, issuer signature, creator info
   └── Outputs: proof bytes, commitments

4. Prover submits ZK proof on-chain
   └── zkAdapter.submitZKProof(requestId, keyId, proof, commitments...)
   └── Proof verified against verification key
   └── Issuer commitment checked against TrustedIssuerRegistry

5. Complete trigger
   └── triggerMechanism.completeZKVerification(creator)
   └── Checks: proof valid AND confidence >= 95%
   └── Executes trigger if valid
```

---

### TriggerMechanism (Enhanced)

**Location:** `contracts/TriggerMechanism.sol`

Updated to support enhanced oracle verification.

**New Types:**

```solidity
enum OracleMode {
    Direct,     // Legacy: trust individual oracle addresses
    Registry,   // Use OracleRegistry for multi-oracle consensus
    ZKProof     // Require zero-knowledge proof verification
}
```

**New Functions:**

| Function | Description |
|----------|-------------|
| `setOracleRegistry()` | Set the OracleRegistry contract address |
| `setZKVerifier()` | Set the ZKVerifierAdapter contract address |
| `configureEnhancedOracleVerified()` | Configure with Registry mode |
| `configureZKProofVerified()` | Configure with ZKProof mode |
| `requestOracleVerification()` | Request verification through registry |
| `requestZKVerification()` | Request ZK proof verification |
| `completeOracleVerification()` | Complete trigger when registry verification valid |
| `completeZKVerification()` | Complete trigger when ZK verification valid |
| `getOracleConfig()` | Get oracle configuration |
| `getVerificationStatus()` | Get registry verification status |
| `getZKVerificationStatus()` | Get ZK verification status |

**Usage:**

```javascript
// Set OracleRegistry
await triggerMechanism.setOracleRegistry(registry.address);

// Configure enhanced oracle trigger
const dataHash = ethers.keccak256(ethers.toUtf8Bytes("death-cert-data"));
await triggerMechanism.configureEnhancedOracleVerified(
    0, // EventType.Death
    dataHash,
    2  // Require 2 oracles
);

// Request verification
const aggregationId = await triggerMechanism.requestOracleVerification(0);

// ... oracles fulfill verification ...

// Complete trigger when verification is valid
await triggerMechanism.completeOracleVerification(creatorAddress);
```

---

## Verification Flow

### Registry Mode (Recommended)

```
1. Creator configures enhanced oracle trigger
   └── configureEnhancedOracleVerified(eventType, dataHash, requiredOracles)

2. Family/executor requests verification
   └── requestOracleVerification(requiredOracles)
   └── OracleRegistry.requestAggregatedVerification()
   └── Each oracle adapter receives verification request

3. Oracles verify off-chain
   └── Check death certificate / medical records / legal documents
   └── Calculate confidence score

4. Oracles submit results
   └── OracleRegistry.submitOracleResult(aggregationId, isVerified, confidence)
   └── When threshold reached, aggregation finalizes
   └── Reputation scores updated

5. Complete trigger
   └── completeOracleVerification(creator)
   └── Checks: aggregation valid AND confidence >= 95%
   └── Executes trigger if valid
```

### Direct Mode (Legacy)

```
1. Creator configures oracle trigger
   └── configureOracleVerified(oracleAddresses)

2. Oracle submits proof
   └── submitOracleProof(creator, proof)
   └── Checks: sender is authorized oracle
   └── Executes trigger immediately
```

---

## Confidence Threshold

The system enforces a **95% minimum confidence threshold** for all oracle verifications:

```solidity
uint256 public constant MIN_CONFIDENCE_THRESHOLD = 95;
```

This matches the ExecutionAgent's confidence threshold and ensures:
- High reliability for irreversible trigger actions
- Protection against false positives
- Alignment with the "default to inaction" principle

---

## Reputation System

The OracleRegistry tracks oracle reliability:

| Metric | Description |
|--------|-------------|
| `reputationScore` | 0-100, starting at 75 |
| `successfulVerifications` | Agreements with consensus |
| `failedVerifications` | Disagreements with consensus |
| `disputedVerifications` | Disputed results |

**Reputation Updates:**
- Agreement with consensus: +1 point (max 100)
- Disagreement with consensus: -5 points (min 0)
- Below `minReputationThreshold` (50): excluded from verification

---

## Security Considerations

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Oracle collusion | Multi-oracle consensus requirement |
| Single oracle failure | Registry fallback to other oracles |
| Low-confidence results | 95% threshold enforcement |
| Oracle manipulation | Reputation tracking and exclusion |
| Stale data | Request expiration (7 days default) |

### Best Practices

1. **Use Registry Mode** for production deployments
2. **Set consensus threshold** to at least 2 oracles
3. **Monitor oracle reputations** and remove compromised oracles
4. **Verify data hash matches** off-chain documentation
5. **Test with Direct Mode** before production

---

## Deployment

### Prerequisites

```bash
npm install @chainlink/contracts @uma/core
```

### Deployment Order

1. Deploy oracle adapters (`ChainlinkAdapter`, `UMAAdapter`)
2. Deploy `OracleRegistry`
3. Register adapters with `OracleRegistry`
4. Set `OracleRegistry` on `TriggerMechanism`
5. Configure consensus threshold

### Example Deployment Script

```javascript
async function deployOracleInfrastructure() {
    // 1. Deploy Chainlink Adapter
    const ChainlinkAdapter = await ethers.getContractFactory("ChainlinkAdapter");
    const chainlinkAdapter = await ChainlinkAdapter.deploy(
        ethers.ZeroAddress, // Testing mode
        ethers.ZeroAddress,
        ethers.ZeroHash,
        0
    );

    // 2. Deploy Oracle Registry
    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    const oracleRegistry = await OracleRegistry.deploy();

    // 3. Register adapter
    await oracleRegistry.registerOracle(chainlinkAdapter.target);

    // 4. Set registry on TriggerMechanism
    await triggerMechanism.setOracleRegistry(oracleRegistry.target);

    // 5. Set consensus threshold
    await oracleRegistry.setConsensusThreshold(1);

    return { chainlinkAdapter, oracleRegistry };
}
```

---

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| Phase 1 | ChainlinkAdapter | ✅ Implemented |
| Phase 1 | OracleRegistry | ✅ Implemented |
| Phase 2 | UMAAdapter | ✅ Implemented |
| Phase 3 | IZKVerifier | ✅ Implemented |
| Phase 3 | TrustedIssuerRegistry | ✅ Implemented |
| Phase 3 | ZKVerifierAdapter | ✅ Implemented |
| Phase 3 | TriggerMechanism ZK Support | ✅ Implemented |
| Phase 4 | Circom Circuits | ✅ Implemented |
| Phase 4 | Groth16Verifier | ✅ Implemented |
| Phase 4 | PlonkVerifier | ✅ Implemented |
| Phase 4 | ZKProofGenerator SDK | ✅ Implemented |

---

## ZK Circuits (Phase 4)

### Circom Circuits

**Location:** `circuits/`

Three production circuits for certificate verification:

| Circuit | File | Description |
|---------|------|-------------|
| DeathCertificateVerifier | `certificate_verifier.circom` | Verifies death certificates from government issuers |
| MedicalIncapacitationVerifier | `medical_verifier.circom` | Verifies medical incapacitation certs with expiration |
| LegalDocumentVerifier | `legal_verifier.circom` | Verifies probate orders and court rulings |

**Circuit Features:**
- Poseidon hash for efficient ZK operations
- EdDSA signature verification for issuer authentication
- Expiration checking for time-sensitive certificates
- Creator commitment verification for identity binding
- Certificate type enforcement

**Public Inputs:**
- `creatorCommitment` - Commitment to creator identity
- `certificateHash` - Hash of certificate for on-chain reference
- `currentTimestamp` - Current time for expiration check

**Public Outputs:**
- `issuerCommitment` - Commitment to issuer public key (for registry verification)
- `isValid` - Whether certificate is valid and not expired

### On-Chain Verifiers

**Groth16Verifier** (`contracts/verifiers/Groth16Verifier.sol`)
- BN254 curve operations using EVM precompiles
- Multiple verification key support
- Key activation/deactivation
- ~200k gas base cost + 6k per public input

**PlonkVerifier** (`contracts/verifiers/PlonkVerifier.sol`)
- KZG polynomial commitment verification
- Universal setup support
- Fiat-Shamir challenge computation
- ~350k gas base cost + 3k per public input

### ZK Proof Generator SDK

**Location:** `scripts/zk/zkProofGenerator.js`

JavaScript library for off-chain proof generation:

```javascript
const { ZKProofGenerator, CertificateBuilder, CertificateType } = require('./zkProofGenerator');

// Initialize generator
const generator = await new ZKProofGenerator(wasmPath, zkeyPath, 'groth16').init();

// Build certificate inputs
const inputs = generator.prepareDeathCertificateInputs({
    creatorAddress: '0x...',
    creatorSalt: ZKProofGenerator.generateSalt(),
    issueDate: Date.now(),
    expirationDate: 0,
    claimData: ethers.keccak256(...),
    issuerPubKeyX: '...',
    issuerPubKeyY: '...',
    sigR8X: '...',
    sigR8Y: '...',
    sigS: '...',
    currentTimestamp: Math.floor(Date.now() / 1000)
});

// Generate proof
const { proof, publicSignals } = await generator.generateProof(inputs);

// Encode for on-chain submission
const proofBytes = generator.encodeGroth16ProofAsBytes(proof);
```

### Building Circuits

```bash
# Install dependencies
npm install circomlib snarkjs

# Build all circuits
./scripts/zk/build_circuits.sh

# Build single circuit
./scripts/zk/build_circuits.sh death_certificate
```

---

## Future Work

### Phase 5: Additional Oracle Sources

- API3 dAPI integration
- Band Protocol cross-chain data
- Pyth Network price feeds (if relevant)
- Custom oracle adapters for specific jurisdictions

---

## Comparison: Oracle Adapters

| Aspect | ChainlinkAdapter | UMAAdapter | ZKVerifierAdapter |
|--------|------------------|------------|-------------------|
| **Model** | Request/Response | Optimistic Assertion | ZK Proof Verification |
| **Speed** | Fast (minutes) | Slower (hours for liveness) | Fast (on proof submission) |
| **Cost** | LINK fees | Bond (refundable if honest) | Gas for verification |
| **Security** | Node reputation | Economic security | Cryptographic proof |
| **Disputes** | No built-in | DVM resolution | None (mathematically verified) |
| **Confidence** | Variable (0-100%) | Binary (100% or 0%) | Binary (100% or 0%) |
| **Privacy** | Data on-chain | Claim on-chain | Data stays off-chain |
| **Best For** | Quick verifications | Contested claims | Privacy-sensitive verification |

**Recommendation:** Choose based on use case:
- **Chainlink**: Fast verification for non-sensitive data
- **UMA**: High-value or potentially contested triggers
- **ZKVerifier**: Privacy-preserving verification (death certs, medical records)
- **Registry + multiple adapters**: Maximum security and redundancy

---

## References

- [Chainlink Any API Documentation](https://docs.chain.link/any-api/introduction)
- [UMA Optimistic Oracle](https://docs.uma.xyz/)
- [FIE Specification](SPECIFICATION.md)
- [Security Documentation](SECURITY.md)

---

*Last Updated: 2026-01-01*
