# Gas Benchmarks — Finite Intent Executor

**Generated:** 2026-02-08
**Status:** Estimated (pre-deployment). Run `npx hardhat test` with `hardhat-gas-reporter` for exact measurements.

---

## Estimated Gas Costs by Operation

### IntentCaptureModule

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `captureIntent()` | 200,000-400,000 | Stores struct + dynamic arrays (assets). Cost scales with asset count. |
| `addGoal()` | 80,000-120,000 | Stores struct with string. Cost scales with description length. |
| `signVersion()` | 50,000-60,000 | Single storage write. |
| `revokeIntent()` | 30,000-40,000 | Single boolean flip. |

### TriggerMechanism

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `configureDeadmanSwitch()` | 80,000-100,000 | Stores config struct. |
| `configureTrustedQuorum()` | 100,000-200,000 | Stores signer array. Scales with signer count (max 20). |
| `configureOracleVerified()` | 80,000-150,000 | Stores oracle array. Scales with oracle count (max 10). |
| `checkIn()` | 30,000-40,000 | Single timestamp update. |
| `submitTrustedSignature()` | 50,000-80,000 | Storage write + loop check. |
| `executeDeadmanSwitch()` | 80,000-120,000 | State changes + cross-contract call to IntentCaptureModule. |
| `executeTrustedQuorum()` | 60,000-100,000 | State changes + cross-contract call. |

### ExecutionAgent

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `activateExecution()` | 40,000-50,000 | Single storage write. |
| `executeAction()` | 150,000-250,000 | PoliticalFilter check (~50k) + LexiconHolder.resolveAmbiguity (view, free on-chain but ~30k via staticcall) + storage writes for execution record. |
| `issueLicense()` | 120,000-180,000 | resolveAmbiguity + struct storage. |
| `fundProject()` | 150,000-200,000 | resolveAmbiguity + struct storage + ETH transfer. |
| `distributeRevenue()` | 120,000-160,000 | resolveAmbiguity + balance update + ETH transfer. |
| `depositToTreasury()` | 30,000-40,000 | Single storage addition. |
| `activateSunset()` | 40,000-50,000 | Boolean flip + event. |
| `emergencyRecoverFunds()` | 50,000-70,000 | Balance zero + ETH transfer. |

### LexiconHolder

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `freezeCorpus()` | 100,000-150,000 | Stores struct with string URI. |
| `createSemanticIndex()` | 100,000-300,000 | Scales with citation count (max 100). ~2,000 gas per citation string. |
| `submitResolution()` | 80,000-200,000 | Scales with citation count (max 10). |
| `submitResolutionBatch()` | N × submitResolution | Scales linearly with query count (max 20). |
| `resolveAmbiguity()` | 10,000-30,000 | View function. Loop over citations (max 100). Free when called externally; gas cost when called via staticcall from contract. |
| `resolveAmbiguityTopK()` | 15,000-50,000 | View. Selection sort O(k*n). |
| `resolveAmbiguityBatch()` | N × resolveAmbiguity | View. Scales with query count (max 20). |
| `batchCreateIndices()` | N × createSemanticIndex | Scales with keyword count (max 50). |
| `createCluster()` | 80,000-100,000 | Struct storage. |
| `assignLegacyToCluster()` | 60,000-80,000 | Array push + mapping write. |

### SunsetProtocol

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `initiateSunset()` | 80,000-120,000 | Cross-contract reads + state changes. |
| `archiveAssets()` | 100,000-300,000 | Scales with batch size (max 50). ~3,000 gas per asset. |
| `finalizeArchive()` | 40,000-50,000 | Boolean flip. |
| `transitionIP()` | 50,000-80,000 | State change + cross-contract call to IPToken. |
| `clusterLegacy()` | 60,000-80,000 | Cross-contract call to LexiconHolder. |
| `completeSunset()` | 40,000-50,000 | Final state change. |
| `emergencySunset()` | 80,000-120,000 | Cross-contract reads + state changes. Callable by anyone. |

### IPToken

| Function | Estimated Gas | Notes |
|----------|--------------|-------|
| `mintIP()` | 200,000-300,000 | ERC721 mint + metadata storage. |
| `grantLicense()` | 80,000-120,000 | Struct storage. |
| `payRoyalty()` | 50,000-100,000 | Loop over licenses (max 100) + ETH transfers. |
| `transitionToPublicDomain()` | 60,000-100,000 | Loop over licenses + state changes. |

### PoliticalFilter (library, included in caller's gas)

| Check | Estimated Gas | Notes |
|-------|--------------|-------|
| Full `checkAction()` | 30,000-80,000 | 6-layer detection. Cost depends on action string length (max 1000 chars). |
| Layer 1: Hash match | ~2,000 | Single keccak256 + mapping lookup. |
| Layer 2: Primary keywords | 5,000-20,000 | Word-boundary search over ~20 keywords. |
| Layer 3: Misspellings | 5,000-15,000 | Case-insensitive substring search. |
| Layer 4: Secondary keywords | 5,000-20,000 | Word-boundary search over ~15 keywords. |
| Layer 5: Phrases | 3,000-10,000 | Substring search for political phrases. |
| Layer 6: Homoglyph detection | 1,000-5,000 | Byte-by-byte ASCII check. |

---

## Optimization Notes

1. **resolveAmbiguity as view**: Saves ~21,000 gas per execution action (no event emission, no SSTORE for event log). This is the most-called function in the execution path.

2. **Resolution cache**: Avoids repeated off-chain computation. The `submitResolution` cost is paid once by the indexer; all subsequent reads are free (view).

3. **Batch operations**: `batchCreateIndices`, `submitResolutionBatch`, `resolveAmbiguityBatch` amortize fixed per-transaction costs across multiple operations.

4. **PoliticalFilter early exit**: Layers are checked in order of specificity. Exact hash match (cheapest) is checked first. Most benign actions exit after Layer 6 with no match.

---

## How to Generate Exact Benchmarks

```bash
# Install gas reporter
npm install --save-dev hardhat-gas-reporter

# Add to hardhat.config.js:
# require("hardhat-gas-reporter");
# gasReporter: { enabled: true, currency: "USD" }

# Run tests with gas reporting
REPORT_GAS=true npx hardhat test
```
