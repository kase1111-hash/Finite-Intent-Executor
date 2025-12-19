# Finite Intent Executor - Usage Guide

This guide explains how to use the Finite Intent Executor (FIE) system to capture and execute posthumous intent.

## Table of Contents

1. [Installation](#installation)
2. [Deployment](#deployment)
3. [Core Workflows](#core-workflows)
4. [Contract Interactions](#contract-interactions)
5. [Examples](#examples)

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/Finite-Intent-Executor.git
cd Finite-Intent-Executor

# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test
```

## Deployment

### Local Development

```bash
# Start a local Hardhat node
npm run node

# In a new terminal, deploy contracts
npm run deploy
```

### Production Deployment

1. Configure your network in `hardhat.config.js`
2. Set up environment variables (private key, RPC URL)
3. Deploy:

```bash
npx hardhat run scripts/deploy.js --network <network-name>
```

Deployment addresses will be saved to `deployment-addresses.json`.

## Core Workflows

### 1. Capturing Your Intent

The first step is to capture your intent, which includes assets, goals, and contextual information.

```javascript
const intentHash = ethers.keccak256(ethers.toUtf8Bytes("Your complete intent document"));
const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Your contextual corpus"));

await intentModule.captureIntent(
  intentHash,
  corpusHash,
  "ipfs://your-corpus-uri",        // Decentralized storage URI for corpus
  "ipfs://your-assets-uri",        // URI for asset metadata
  2020,                            // Corpus start year (5-10 year window)
  2028,                            // Corpus end year
  [assetAddress1, assetAddress2]   // Addresses of tokenized assets
);
```

**Important**: The corpus window must be 5-10 years to ensure focused context.

### 2. Adding Goals

Add specific goals with priorities and constraints:

```javascript
const constraintsHash = ethers.keccak256(ethers.toUtf8Bytes("No commercial use without attribution"));

await intentModule.addGoal(
  "Fund open-source AI safety research",
  constraintsHash,
  95  // Priority: 1-100
);
```

### 3. Configuring Triggers

Choose how your intent will be triggered:

#### Deadman Switch

```javascript
const ninetyDays = 90 * 24 * 60 * 60; // in seconds
await triggerMechanism.configureDeadmanSwitch(ninetyDays);

// Check in periodically to prevent trigger
await triggerMechanism.checkIn();
```

#### Trusted Quorum

```javascript
const trustedSigners = [
  "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "0x5A86858a5b03DAeE0a7a6F6e52d01f17c7aAd25C"
];

await triggerMechanism.configureTrustedQuorum(
  trustedSigners,
  2  // Require 2 signatures
);
```

#### Oracle-Verified

```javascript
const oracles = ["0xOracleAddress1", "0xOracleAddress2"];
await triggerMechanism.configureOracleVerified(oracles);
```

### 4. Tokenizing Intellectual Property

Create tokens for your IP assets:

```javascript
const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Your IP content"));

const tokenId = await ipToken.mintIP(
  creatorAddress,
  "My Research Paper",
  "Groundbreaking research on...",
  "article",                    // Type: article, code, music, art
  contentHash,
  "ipfs://metadata-uri",
  "CC-BY-4.0"                   // Initial license
);
```

### 5. Setting Up the Lexicon

Create semantic indices for intent interpretation:

```javascript
// Freeze the corpus
await lexiconHolder.freezeCorpus(
  creatorAddress,
  corpusHash,
  "ipfs://corpus-storage",
  2020,
  2028
);

// Create semantic indices
await lexiconHolder.createSemanticIndex(
  creatorAddress,
  "open-source",
  [
    "Support projects with permissive licenses like MIT or Apache 2.0",
    "Prioritize projects with active communities"
  ],
  [95, 90]  // Relevance scores
);
```

### 6. Execution Phase

After trigger activation:

```javascript
// Activate execution
await executionAgent.activateExecution(creatorAddress);

// Execute actions with corpus-based resolution
await executionAgent.executeAction(
  creatorAddress,
  "fund_project",
  "Should I fund this AI safety project?",
  corpusHash
);

// Issue licenses
await executionAgent.issueLicense(
  creatorAddress,
  licenseeAddress,
  assetAddress,
  500,              // 5% royalty in basis points
  365 * 24 * 60 * 60, // 1 year duration
  corpusHash
);

// Fund aligned projects
await executionAgent.fundProject(
  creatorAddress,
  projectAddress,
  ethers.parseEther("10"),
  "Open-source AI safety tooling",
  corpusHash
);
```

### 7. Sunset After 20 Years

The sunset protocol automatically activates after exactly 20 years:

```javascript
// Check if sunset is due
const isDue = await sunsetProtocol.isSunsetDue(creatorAddress, triggerTimestamp);

// Initiate sunset
await sunsetProtocol.initiateSunset(creatorAddress, triggerTimestamp);

// Archive assets
await sunsetProtocol.archiveAssets(
  creatorAddress,
  [asset1, asset2],
  ["ipfs://archive1", "ipfs://archive2"],
  [hash1, hash2]
);

// Transition IP to public domain
await sunsetProtocol.transitionIP(creatorAddress, 0); // 0 = CC0

// Cluster legacy
await sunsetProtocol.clusterLegacy(creatorAddress, clusterId);

// Complete sunset
await sunsetProtocol.completeSunset(creatorAddress);
```

## Contract Interactions

### Intent Capture Module

**Key Functions:**
- `captureIntent()` - Capture your complete intent
- `addGoal()` - Add goals with priorities
- `signVersion()` - Sign specific intent versions
- `revokeIntent()` - Revoke while alive

### Trigger Mechanism

**Key Functions:**
- `configureDeadmanSwitch()` - Set up deadman switch
- `configureTrustedQuorum()` - Set up quorum trigger
- `configureOracleVerified()` - Set up oracle trigger
- `checkIn()` - Reset deadman timer
- `submitTrustedSignature()` - Submit signature for quorum
- `executeDeadmanSwitch()` - Trigger via deadman

### Execution Agent

**Key Functions:**
- `activateExecution()` - Start execution
- `executeAction()` - Execute with corpus resolution
- `issueLicense()` - Grant IP licenses
- `fundProject()` - Fund aligned projects
- `distributeRevenue()` - Distribute earnings
- `activateSunset()` - Trigger sunset

**Confidence Threshold:** All actions require ≥95% confidence from corpus citations.

### Lexicon Holder

**Key Functions:**
- `freezeCorpus()` - Lock in contextual corpus
- `createSemanticIndex()` - Index keywords
- `resolveAmbiguity()` - Get corpus citations
- `createCluster()` - Create legacy cluster
- `assignLegacyToCluster()` - Assign to cluster

### Sunset Protocol

**Key Functions:**
- `initiateSunset()` - Begin sunset process
- `archiveAssets()` - Archive to decentralized storage
- `transitionIP()` - Move to public domain
- `clusterLegacy()` - Semantic clustering
- `completeSunset()` - Finalize sunset

### IP Token

**Key Functions:**
- `mintIP()` - Create IP token
- `grantLicense()` - Issue license
- `payRoyalty()` - Pay for IP usage
- `transitionToPublicDomain()` - Public domain transition

## Examples

### Complete Lifecycle Example

```javascript
// 1. Capture intent
const intentHash = ethers.keccak256(ethers.toUtf8Bytes("My complete intent"));
const corpusHash = ethers.keccak256(ethers.toUtf8Bytes("Contextual corpus"));

await intentModule.connect(creator).captureIntent(
  intentHash, corpusHash,
  "ipfs://corpus", "ipfs://assets",
  2020, 2028,
  [ipTokenAddress]
);

// 2. Add goals
await intentModule.connect(creator).addGoal(
  "Fund AI safety research",
  ethers.keccak256(ethers.toUtf8Bytes("constraints")),
  95
);

// 3. Mint IP
await ipToken.mintIP(
  creator.address,
  "My Life's Work",
  "Collection of research papers",
  "collection",
  ethers.keccak256(ethers.toUtf8Bytes("content")),
  "ipfs://work-metadata",
  "CC-BY-4.0"
);

// 4. Configure trigger
await triggerMechanism.connect(creator).configureDeadmanSwitch(90 * 24 * 60 * 60);

// 5. Set up lexicon
await lexiconHolder.freezeCorpus(
  creator.address, corpusHash,
  "ipfs://corpus-storage",
  2020, 2028
);

// ... execution happens after trigger ...

// 6. After 20 years, sunset activates
await sunsetProtocol.initiateSunset(creator.address, triggerTimestamp);
await sunsetProtocol.transitionIP(creator.address, 0); // CC0
```

## Security Considerations

1. **Private Keys**: Keep your private key secure - it's the only way to revoke intent while alive
2. **Corpus Integrity**: Ensure corpus is immutably stored with cryptographic hashes
3. **Trusted Signers**: Choose quorum members carefully
4. **Oracle Selection**: Use reputable, decentralized oracles
5. **Asset Control**: Transfer asset ownership to execution contracts carefully

## Troubleshooting

### Intent Capture Fails

- Check corpus window is 5-10 years
- Ensure at least one asset address is provided
- Verify you haven't already captured an intent

### Trigger Not Activating

- Deadman: Ensure sufficient time has passed
- Quorum: Check all required signatures submitted
- Oracle: Verify oracle addresses are correct

### Execution Defaults to Inaction

- Confidence below 95%: Ambiguity cannot be resolved
- Add more semantic indices to lexicon
- Ensure corpus contains relevant context

## Advanced Topics

### Custom Lexicon Indices

Create rich semantic indices for better interpretation:

```javascript
await lexiconHolder.batchCreateIndices(
  creator.address,
  ["AI safety", "open-source", "education"],
  [
    ["Support technical AI alignment research", "Fund interpretability work"],
    ["Prefer MIT/Apache licenses", "Value active communities"],
    ["Support free educational content", "Prioritize underserved regions"]
  ],
  [
    [98, 95],
    [97, 90],
    [96, 92]
  ]
);
```

### Multi-Chain Deployment

Deploy to multiple chains for redundancy:

```bash
npx hardhat run scripts/deploy.js --network ethereum
npx hardhat run scripts/deploy.js --network polygon
npx hardhat run scripts/deploy.js --network arbitrum
```

### Integration with Decentralized Storage

```javascript
// Example with IPFS
const ipfsHash = await uploadToIPFS(intentDocument);
const corpusHash = ethers.keccak256(ethers.toUtf8Bytes(corpusContent));

await intentModule.captureIntent(
  ethers.keccak256(ethers.toUtf8Bytes(intentDocument)),
  corpusHash,
  `ipfs://${ipfsHash}`,
  // ... other params
);
```

## Support

For issues and questions:
- GitHub Issues: [Report bugs or request features]
- Documentation: See full specification in README.md
- Tests: Run `npm test` to see example usage
