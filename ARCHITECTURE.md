# Finite Intent Executor - Architecture Documentation

## System Architecture

The Finite Intent Executor (FIE) is a modular blockchain system consisting of six core smart contracts that work together to enable posthumous intent execution with strict temporal bounds and safeguards.

## Contract Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   FIE System Architecture                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│  IntentCaptureModule │         │   TriggerMechanism   │
│  ────────────────────│         │  ──────────────────  │
│  - Intent Graph      │◄────────│  - Deadman Switch    │
│  - Goals             │ triggers│  - Trusted Quorum    │
│  - Corpus Hash       │         │  - Oracle Verified   │
└──────────────────────┘         └──────────────────────┘
         │                                  │
         │                                  ▼
         │                       ┌──────────────────────┐
         │                       │   ExecutionAgent     │
         └──────────────────────►│  ──────────────────  │
                                 │  - License Assets    │
         ┌──────────────────────►│  - Distribute $$$    │
         │                       │  - Fund Projects     │
         │                       │  - Enforce Scope     │
         │                       └──────────────────────┘
         │                                  │
┌────────┴──────────┐                      │
│   LexiconHolder   │                      ▼
│  ────────────────│         ┌──────────────────────┐
│  - Corpus Index   │         │   SunsetProtocol     │
│  - Semantic Search│         │  ──────────────────  │
│  - Ambiguity      │         │  - 20 Year Limit     │
│    Resolution     │         │  - Archive Assets    │
└───────────────────┘         │  - Public Domain     │
                              │  - Clustering        │
         ▲                    └──────────────────────┘
         │
         │
┌────────┴──────────┐
│      IPToken      │
│  ────────────────│
│  - ERC721 NFTs    │
│  - Licensing      │
│  - Royalties      │
└───────────────────┘
```

## Component Details

### 1. IntentCaptureModule

**Purpose**: Immutably captures the creator's intent with cryptographic commitments.

**Key Data Structures**:
```solidity
struct IntentGraph {
    bytes32 intentHash;          // Hash of complete intent
    bytes32 corpusHash;          // Hash of contextual corpus
    string corpusURI;            // Decentralized storage URI
    string assetsURI;            // Asset metadata URI
    uint256 captureTimestamp;
    uint256 corpusStartYear;     // 5-10 year window
    uint256 corpusEndYear;
    address[] assetAddresses;
    bool isRevoked;
    bool isTriggered;
}

struct Goal {
    string description;
    bytes32 constraintsHash;
    uint256 priority;            // 1-100
}
```

**Key Functions**:
- `captureIntent()`: Creates immutable intent record
- `addGoal()`: Adds prioritized goals
- `signVersion()`: Signs specific intent versions
- `revokeIntent()`: Allows revocation while alive
- `triggerIntent()`: Marks intent as triggered (called by TriggerMechanism)

**Security Features**:
- Cryptographic hashing for tamper-proof storage
- Multi-version signing for clarity
- Revocability while creator is alive
- 5-10 year corpus window enforcement

### 2. TriggerMechanism

**Purpose**: Provides multiple trigger types for posthumous activation.

**Trigger Types**:

1. **Deadman Switch**
   - Activates after period of inactivity
   - Minimum 30 days
   - Creator can check in to reset timer

2. **Trusted Quorum**
   - Requires N signatures from M trusted parties
   - Minimum 2 signatures required
   - Prevents single point of failure

3. **Oracle Verified**
   - Uses external oracles for verification
   - Supports zero-knowledge proofs
   - Can verify medical/legal events

**Key Data Structure**:
```solidity
struct TriggerConfig {
    TriggerType triggerType;
    uint256 deadmanInterval;
    uint256 lastCheckIn;
    address[] trustedSigners;
    uint256 requiredSignatures;
    address[] oracles;
    bool isConfigured;
    bool isTriggered;
}
```

**Security Features**:
- Atomic, irreversible trigger
- Multiple verification methods
- No single point of failure (quorum)
- Configurable before trigger only

### 3. ExecutionAgent

**Purpose**: Executes intent with strict scope boundaries and ambiguity resolution.

**Capabilities**:
- License intellectual property
- Collect and distribute revenue
- Fund aligned projects
- Enforce constraints via smart contracts

**Ambiguity Resolution**:
- All decisions require ≥95% confidence from corpus citations
- Defaults to **inaction** if confidence < 95%
- No speculative or creative interpretation permitted
- All decisions logged on-chain with citations

**No Political Agency Clause**:
Prohibited activities:
- Electoral activity
- Political advocacy
- Lobbying
- Policy influence (except passive licensing)

**Key Data Structures**:
```solidity
struct ExecutionRecord {
    address creator;
    string action;
    string corpusCitation;
    uint256 confidence;
    uint256 timestamp;
    bytes32 decisionHash;
}

struct License {
    address licensee;
    address assetAddress;
    uint256 royaltyPercentage;
    uint256 startTime;
    uint256 endTime;
    bool isActive;
}

struct Project {
    string description;
    address recipient;
    uint256 fundingAmount;
    uint256 fundedAt;
    string corpusCitation;
}
```

**Security Features**:
- Scope-bounded APIs
- 95% confidence threshold
- Political activity filtering
- On-chain decision logging
- Reentrancy protection
- 20-year automatic sunset

### 4. LexiconHolder

**Purpose**: Non-actuating semantic indexer for intent interpretation.

**Critical Constraint**: NO ACTUATING AUTHORITY
- Cannot initiate actions
- Cannot modify intent
- Cannot veto decisions
- Cannot influence execution

**Functions**:
1. Provide interpretive citations from frozen corpus
2. Post-sunset clustering of archived legacies

**Key Data Structures**:
```solidity
struct CorpusEntry {
    bytes32 corpusHash;
    string storageURI;
    uint256 startYear;
    uint256 endYear;
    bool isFrozen;
}

struct SemanticIndex {
    string keyword;
    string[] citations;
    uint256[] relevanceScores;  // 0-100
}

struct EmbeddingCluster {
    bytes32 clusterId;
    address[] legacies;
    string description;
    uint256 createdAt;
}
```

**Key Functions**:
- `freezeCorpus()`: Locks corpus immutably
- `createSemanticIndex()`: Indexes keywords with citations
- `resolveAmbiguity()`: Returns best citation with confidence
- `createCluster()`: Creates semantic cluster
- `assignLegacyToCluster()`: Groups similar legacies

**Security Features**:
- Immutable corpus (cryptographic hash)
- No execution authority
- Read-only interpretation
- Decentralized operation

### 5. SunsetProtocol

**Purpose**: Mandatory termination after exactly 20 years.

**Fixed Duration**: 20 years (non-configurable, hard-coded)

**Sunset Process**:
1. **Halt Execution**: All operations cease
2. **Archive Assets**: Migrate to permanent decentralized storage
3. **Transition IP**: Move to public-domain-equivalent licensing
4. **Cluster Legacy**: Semantic grouping for discoverability
5. **Complete**: Finalize sunset

**Post-Sunset Asset State**:
- CC0 (Creative Commons Zero)
- Public Domain Equivalent
- Neutral Stewardship (no exclusive re-enclosure)

**Key Data Structure**:
```solidity
struct SunsetState {
    address creator;
    uint256 triggerTimestamp;
    uint256 sunsetTimestamp;
    bool isSunset;
    bool assetsArchived;
    bool ipTransitioned;
    bool clustered;
    LicenseType postSunsetLicense;
    string archiveURI;
}

struct AssetArchive {
    address assetAddress;
    string storageURI;
    bytes32 assetHash;
    uint256 archivedAt;
}
```

**Security Features**:
- Hard-coded 20-year limit
- Automated execution
- Emergency sunset function (anyone can trigger)
- Immutable archives
- Public domain transition
- Fully automated via lexicon holders

### 6. IPToken

**Purpose**: ERC721 tokens for intellectual property assets.

**Features**:
- Standard NFT interface (ERC721)
- Metadata storage (URI)
- Licensing framework
- Royalty distribution
- Public domain transition

**IP Types Supported**:
- Articles
- Code
- Music
- Art
- Collections
- Any intellectual property

**Key Data Structures**:
```solidity
struct IPAsset {
    string title;
    string description;
    string ipType;
    address creator;
    uint256 createdAt;
    bytes32 contentHash;
    bool isPublicDomain;
    string licenseType;
}

struct RoyaltyInfo {
    address recipient;
    uint256 percentage;  // Basis points
}

struct License {
    address licensee;
    uint256 tokenId;
    uint256 royaltyPercentage;
    uint256 startTime;
    uint256 endTime;
    bool isActive;
    uint256 revenueGenerated;
}
```

**Key Functions**:
- `mintIP()`: Create new IP token
- `grantLicense()`: Issue license
- `payRoyalty()`: Pay for IP usage
- `transitionToPublicDomain()`: Post-sunset transition
- `setRoyaltyInfo()`: Update royalty settings

## Data Flow

### Intent Capture Flow

```
Creator
  │
  ├──► Prepare Intent Document
  │     ├─ Goals
  │     ├─ Constraints
  │     └─ Asset List
  │
  ├──► Prepare Contextual Corpus (5-10 years)
  │     ├─ Personal writings
  │     ├─ Values statements
  │     └─ Project documentation
  │
  ├──► Upload to IPFS/Arweave
  │     ├─ Get content hashes
  │     └─ Get URIs
  │
  └──► Call IntentCaptureModule.captureIntent()
        ├─ Store intent hash
        ├─ Store corpus hash
        ├─ Link assets
        └─ Emit IntentCaptured event
```

### Trigger Flow

```
Trigger Condition Met
  │
  ├──► [Deadman] No check-in for N days
  │       └─► Anyone can call executeDeadmanSwitch()
  │
  ├──► [Quorum] M of N signatures received
  │       └─► Auto-triggers when threshold reached
  │
  └──► [Oracle] Oracle submits proof
          └─► Oracle calls submitOracleProof()

  │
  ▼
TriggerMechanism.triggerIntent()
  │
  └──► IntentCaptureModule.triggerIntent()
        └─► Sets isTriggered = true
```

### Execution Flow

```
Execution Request
  │
  ├──► ExecutionAgent.executeAction()
  │     ├─ Check execution is active
  │     ├─ Check not sunset
  │     ├─ Check not political
  │     │
  │     └──► LexiconHolder.resolveAmbiguity()
  │           ├─ Query semantic index
  │           ├─ Get best citation
  │           └─ Return confidence score
  │
  ├──► If confidence >= 95%:
  │     ├─ Execute action
  │     ├─ Log with citation
  │     └─ Emit ActionExecuted
  │
  └──► If confidence < 95%:
        ├─ Default to inaction
        └─ Emit InactionDefault
```

### Sunset Flow

```
20 Years After Trigger
  │
  ├──► Anyone calls SunsetProtocol.initiateSunset()
  │     ├─ Verify 20 years elapsed
  │     └─► ExecutionAgent.activateSunset()
  │           └─ Halt all execution
  │
  ├──► SunsetProtocol.archiveAssets()
  │     ├─ Upload to decentralized storage
  │     ├─ Store cryptographic hashes
  │     └─ Save archive URIs
  │
  ├──► SunsetProtocol.transitionIP()
  │     ├─ Set license to CC0
  │     └──► IPToken.transitionToPublicDomain()
  │           └─ Deactivate all licenses
  │
  ├──► SunsetProtocol.clusterLegacy()
  │     └──► LexiconHolder.assignLegacyToCluster()
  │           └─ Group with similar legacies
  │
  └──► SunsetProtocol.completeSunset()
        └─ Emit SunsetCompleted
```

## Security Model

### Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Oracle failure | Conservative halt (default to inaction) |
| LLM misalignment | Hard scope-bounded APIs, 95% confidence threshold |
| Chain failure | Multi-chain deployment with escrow fallback |
| Corpus poisoning | Immutable cryptographic snapshot hashes |
| Key compromise (while alive) | Immediate revocation and reissue capability |
| Political capture | No Political Agency Clause enforcement |
| Indefinite execution | Hard-coded 20-year sunset |
| Ambiguity exploitation | ≥95% confidence requirement, citation logging |

### Access Control

**IntentCaptureModule**:
- Creator: Can capture, add goals, sign versions, revoke
- TriggerMechanism: Can trigger intent
- Public: Read-only access

**TriggerMechanism**:
- Creator: Configure trigger, check in
- Trusted Signers: Submit signatures
- Oracles: Submit proofs
- Anyone: Execute deadman switch (if conditions met)

**ExecutionAgent**:
- EXECUTOR_ROLE: Execute actions, issue licenses, fund projects
- Creator treasury: Receives revenue
- Public: Read execution logs

**LexiconHolder**:
- INDEXER_ROLE: Freeze corpus, create indices, manage clusters
- Public: Resolve ambiguity (read-only)

**SunsetProtocol**:
- SUNSET_OPERATOR_ROLE: Initiate sunset, archive, transition
- Anyone: Emergency sunset (if 20 years passed)
- Public: Read sunset state

**IPToken**:
- MINTER_ROLE: Mint new IP tokens
- EXECUTOR_ROLE: Grant licenses, transition to public domain
- Owners: Transfer tokens
- Public: Pay royalties, read metadata

## Gas Optimization

**Storage Optimization**:
- Use of `bytes32` for hashes instead of strings
- Packed structs where possible
- Arrays for batch operations

**Computation Optimization**:
- View functions for reads (no gas cost)
- Events for historical data (cheaper than storage)
- Batch operations for multiple items

**Example Batch Operation**:
```solidity
function batchCreateIndices(
    address _creator,
    string[] memory _keywords,
    string[][] memory _citationsArray,
    uint256[][] memory _scoresArray
) external onlyRole(INDEXER_ROLE) {
    // Process all indices in one transaction
}
```

## Upgrade Strategy

**Immutability by Design**: Core contracts are immutable to prevent drift or capture.

**If Upgrades Needed**:
1. Deploy new contract versions
2. Migrate user data (intent, corpus) to new contracts
3. Users must opt-in to migration
4. Old contracts remain functional
5. No forced upgrades

**Fork Neutrality**: Post-sunset forks by third parties are outside FIE scope.

## Testing Strategy

**Unit Tests**: Each contract function
**Integration Tests**: Full lifecycle workflows
**Security Tests**: Attack vectors and edge cases
**Gas Tests**: Optimization verification

See `test/FIESystem.test.js` for examples.

## Deployment Checklist

- [ ] Deploy LexiconHolder
- [ ] Deploy IntentCaptureModule
- [ ] Deploy TriggerMechanism with IntentCaptureModule address
- [ ] Transfer IntentCaptureModule ownership to TriggerMechanism
- [ ] Deploy ExecutionAgent with LexiconHolder address
- [ ] Deploy SunsetProtocol with ExecutionAgent and LexiconHolder
- [ ] Deploy IPToken
- [ ] Grant necessary roles
- [ ] Verify all contracts on block explorer
- [ ] Test trigger mechanisms
- [ ] Document deployed addresses
- [ ] Set up monitoring for events

## Monitoring and Observability

**Key Events to Monitor**:

```solidity
// Intent lifecycle
IntentCaptured(creator, intentHash, corpusHash, timestamp)
IntentTriggered(creator, timestamp)
SunsetInitiated(creator, timestamp)

// Execution
ActionExecuted(creator, action, confidence, timestamp)
InactionDefault(creator, reason, confidence)

// Assets
LicenseIssued(creator, licensee, asset, royalty)
RevenueCollected(tokenId, amount)
TransitionedToPublicDomain(tokenId, timestamp)

// Triggers
DeadmanCheckIn(creator, timestamp)
TrustedSignatureReceived(creator, signer)
```

**Dashboard Metrics**:
- Active intents
- Triggered intents
- Pending sunsets
- Execution success rate
- Inaction default rate
- Total IP tokens minted
- Total royalties collected

## Future Enhancements

**Potential Additions** (while maintaining core principles):
1. Multi-signature execution for high-value actions
2. Time-weighted priority for goals
3. Enhanced oracle integration (Chainlink, UMA)
4. Cross-chain bridges for multi-chain execution
5. IPFS pinning service integration
6. Enhanced semantic search (vector embeddings)
7. Automated compliance checking
8. Revenue streaming (Superfluid integration)

**Non-Negotiable Constraints**:
- 20-year sunset remains fixed
- No political agency remains enforced
- 95% confidence threshold maintained
- Inaction default mode preserved
- Corpus immutability protected
