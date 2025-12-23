# Finite Intent Executor - Oracle Integration

## Overview

The Oracle Integration module provides secure, verifiable external data feeds for triggering the Finite Intent Executor. It enables the system to respond to real-world events (death certificates, medical conditions, legal rulings) through a multi-oracle consensus mechanism with reputation tracking.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TriggerMechanism                           │
│  ┌──────────────┬──────────────┬──────────────┐                │
│  │ DeadmanSwitch│TrustedQuorum │OracleVerified│                │
│  └──────────────┴──────────────┴──────┬───────┘                │
│                                       │                         │
│                          ┌────────────▼────────────┐           │
│                          │    OracleRegistry       │           │
│                          │  - Multi-oracle consensus│          │
│                          │  - Reputation tracking   │          │
│                          │  - Aggregation           │          │
│                          └────────────┬────────────┘           │
│                                       │                         │
│              ┌────────────────────────┼────────────────────────┐
│              │                        │                        │
│     ┌────────▼────────┐    ┌─────────▼─────────┐    ┌────────▼────────┐
│     │ ChainlinkAdapter │    │   UMAAdapter      │    │   ZKVerifier    │
│     │  (Implemented)   │    │   (Future)        │    │   (Future)      │
│     └─────────────────┘    └───────────────────┘    └─────────────────┘
└─────────────────────────────────────────────────────────────────┘
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
| `configureEnhancedOracleVerified()` | Configure with Registry mode |
| `requestOracleVerification()` | Request verification through registry |
| `completeOracleVerification()` | Complete trigger when verification valid |
| `getOracleConfig()` | Get oracle configuration |
| `getVerificationStatus()` | Get verification status |

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
npm install @chainlink/contracts
```

### Deployment Order

1. Deploy `ChainlinkAdapter` (or other adapters)
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

## Future Work

### Phase 2: UMA Integration

- UMA Optimistic Oracle for dispute resolution
- Economic security through bonding
- Longer dispute windows for contested events

### Phase 3: ZK Proof Verification

- Zero-knowledge circuits for certificate verification
- On-chain verifier contracts
- Off-chain prover services
- Trusted issuer registry

### Phase 4: Additional Oracle Sources

- API3 dAPI integration
- Band Protocol cross-chain data
- Pyth Network price feeds (if relevant)

---

## References

- [Chainlink Any API Documentation](https://docs.chain.link/any-api/introduction)
- [UMA Optimistic Oracle](https://docs.uma.xyz/)
- [FIE Specification](SPECIFICATION.md)
- [Security Documentation](SECURITY.md)

---

*Last Updated: 2025-12-23*
