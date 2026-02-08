# Finite Intent Executor - Security Documentation

## Overview

This document provides security information for the Finite Intent Executor (FIE) smart contract system, including audit findings, known issues, and security best practices.

**Audit Status:** Internal review completed 2025-12-23. External audit pending.

---

## Security Audit Summary

### Findings Overview

| Severity | Count | Status |
|----------|-------|--------|
| **Critical** | 4 | Fixed |
| **High** | 9 | 9 Fixed |
| **Medium** | 12 | 8 Fixed, 4 Acknowledged |
| **Low** | 6 | 2 Fixed, 4 Acknowledged |
| **Informational** | 1 | Acknowledged |

### Critical Issues (All Fixed)

#### CRITICAL-001: Reentrancy in TriggerMechanism._executeTrigger
- **File:** `contracts/TriggerMechanism.sol:207-211`
- **Issue:** External call occurred before event emission
- **Fix:** Reordered to emit event before external call
- **Status:** Fixed

#### CRITICAL-002: Event Emission in View Function
- **File:** `contracts/LexiconHolder.sol:121-156`
- **Issue:** `resolveAmbiguity()` marked `view` but emitted events, causing revert
- **Fix (v1.0):** Removed `view` modifier, function now modifies state
- **Fix (Phase 4):** Function returned to `view` — event emission removed entirely. Resolution events now emitted by `submitResolution()` when the off-chain indexer writes data, not when data is read.
- **Status:** Fixed (correctly `view` since Phase 4)

#### CRITICAL-003: Reentrancy in IPToken.payRoyalty
- **File:** `contracts/IPToken.sol:161-185`
- **Issue:** State changes after external call
- **Fix:** Reordered to update state before transfer
- **Status:** Fixed

#### CRITICAL-004: Broken Inter-Contract Integration
- **File:** ExecutionAgent calling LexiconHolder
- **Issue:** Caused by CRITICAL-002
- **Fix:** Fixed by resolving CRITICAL-002
- **Status:** Fixed

### High Severity Issues

#### HIGH-001: Insufficient Access Control on triggerIntent
- **File:** `contracts/IntentCaptureModule.sol:144-150`
- **Issue:** Used `onlyOwner` instead of specific TriggerMechanism address
- **Fix:** Added `triggerMechanism` address with dedicated setter
- **Status:** Fixed

#### HIGH-002/003: Unbounded Loop DoS in TriggerMechanism
- **File:** `contracts/TriggerMechanism.sol:216-237`
- **Issue:** Unbounded loops in `_isTrustedSigner` and `_isOracle`
- **Mitigation:** Added maximum limits (20 signers, 10 oracles)
- **Status:** Fixed

#### HIGH-004: Timestamp Dependence for Deadman Switch
- **File:** `contracts/TriggerMechanism.sol:155-158`
- **Issue:** `block.timestamp` can be manipulated ~15 seconds
- **Status:** Acknowledged - acceptable for 30+ day intervals

#### HIGH-005/008: Use of .transfer() Can Lock Funds
- **Files:** `ExecutionAgent.sol:233,269`, `IPToken.sol:169`
- **Issue:** `.transfer()` forwards only 2300 gas
- **Fix:** Replaced with `.call{value}()` pattern
- **Status:** Fixed

#### HIGH-006: Unbounded Loop in LexiconHolder.resolveAmbiguity
- **File:** `contracts/LexiconHolder.sol:145-150`
- **Issue:** Loop over relevanceScores array
- **Fix:** Added MAX_CITATIONS_PER_INDEX (100) limit with bounded iteration
- **Status:** Fixed

#### HIGH-007: Unbounded Loop in SunsetProtocol.archiveAssets
- **File:** `contracts/SunsetProtocol.sol:134-143`
- **Issue:** No limit on assets per transaction
- **Fix:** Added MAX_ARCHIVE_BATCH_SIZE (50) limit
- **Status:** Fixed

#### HIGH-009: Circular Dependency Risk
- **Files:** TriggerMechanism.sol, IntentCaptureModule.sol
- **Issue:** Access control dependency
- **Fix:** Fixed by HIGH-001 resolution
- **Status:** Fixed

### Medium Severity Issues

| ID | Description | File | Status |
|----|-------------|------|--------|
| MEDIUM-001 | Unbounded goals array | IntentCaptureModule.sol | **Fixed** (MAX_GOALS=50, MAX_ASSETS=100) |
| MEDIUM-002 | No intent update mechanism | IntentCaptureModule.sol | By design |
| MEDIUM-003 | No trigger config updates | TriggerMechanism.sol | By design |
| MEDIUM-004 | ZK proof verification stubbed | TriggerMechanism.sol | Known limitation |
| MEDIUM-005 | Unbounded loop in _contains | ExecutionAgent.sol | **Fixed** (MAX_ACTION_LENGTH=1000) |
| MEDIUM-006 | Unbounded licenses array | ExecutionAgent.sol | **Fixed** (MAX_LICENSES_PER_CREATOR=100) |
| MEDIUM-007 | Unbounded batch operations | LexiconHolder.sol | **Fixed** (MAX_BATCH_SIZE=50) |
| MEDIUM-008 | No corpus update mechanism | LexiconHolder.sol | By design |
| MEDIUM-009 | emergencySunset callable by anyone | SunsetProtocol.sol | By design |
| MEDIUM-010 | Timestamp for 20-year calc | SunsetProtocol.sol | Acknowledged |
| MEDIUM-011 | Unbounded licenses in payRoyalty | IPToken.sol | **Fixed** (MAX_LICENSES_PER_TOKEN=100) |
| MEDIUM-012 | Unbounded licenses in transition | IPToken.sol | **Fixed** (bounded iteration) |

### Low Severity Issues

| ID | Description | File | Status |
|----|-------------|------|--------|
| LOW-001 | Minor timestamp manipulation | IntentCaptureModule.sol | Acknowledged |
| LOW-002 | Hardcoded confidence threshold | ExecutionAgent.sol | By design |
| LOW-003 | No stuck fund recovery | ExecutionAgent.sol | **Fixed** (emergencyRecoverFunds added) |
| LOW-004 | No asset ownership verification | SunsetProtocol.sol | Acknowledged |
| LOW-005 | No license duration validation | IPToken.sol | **Fixed** (MIN/MAX_LICENSE_DURATION) |
| LOW-006 | Token ID counter overflow (theoretical) | IPToken.sol | Acknowledged |

---

## Security Architecture

### Access Control Model

| Contract | Roles | Permissions |
|----------|-------|-------------|
| **IntentCaptureModule** | Owner (deployer), TriggerMechanism | Owner: admin; TriggerMechanism: trigger intent |
| **TriggerMechanism** | Owner, Trusted Signers, Oracles | Owner: configure; Signers: sign; Oracles: submit proofs |
| **ExecutionAgent** | EXECUTOR_ROLE, ORACLE_ROLE | EXECUTOR: execute actions, manage licenses |
| **LexiconHolder** | INDEXER_ROLE | INDEXER: freeze corpus, create indices |
| **SunsetProtocol** | SUNSET_OPERATOR_ROLE | OPERATOR: initiate sunset, archive assets |
| **IPToken** | MINTER_ROLE, EXECUTOR_ROLE | MINTER: mint tokens; EXECUTOR: manage licenses |

### Reentrancy Protection

All contracts handling ETH transfers use:
- `ReentrancyGuard` from OpenZeppelin
- Checks-Effects-Interactions pattern
- `.call{value}()` instead of `.transfer()`

### Input Validation

- Corpus window: 5-10 years enforced
- Priority: 1-100 range enforced
- Royalty: Max 100% (10000 basis points)
- Deadman interval: Minimum 30 days
- Quorum signatures: Minimum 2 required

---

## Known Limitations

### 1. Oracle Integration (MEDIUM-004)
The oracle proof verification is currently stubbed:
```solidity
// In production, verify the zero-knowledge proof here
// For now, we trust the oracle
```
**Recommendation:** Do not use oracle triggers in production until ZK verification is implemented.

### 2. Array Bounds (Mitigated)
Array bounds have been added to prevent DoS attacks:
- Goals per creator: MAX_GOALS = 50
- Assets per intent: MAX_ASSETS = 100
- Licenses per token: MAX_LICENSES_PER_TOKEN = 100
- Licenses per creator: MAX_LICENSES_PER_CREATOR = 100
- Projects per creator: MAX_PROJECTS_PER_CREATOR = 100
- Execution logs per creator: MAX_EXECUTION_LOGS = 1000
- Semantic index citations: MAX_CITATIONS_PER_INDEX = 100
- Batch operations: MAX_BATCH_SIZE = 50
- Archive batch size: MAX_ARCHIVE_BATCH_SIZE = 50
- Trusted signers: MAX_TRUSTED_SIGNERS = 20
- Oracles: MAX_ORACLES = 10

**Note:** These limits should be sufficient for normal operation while preventing gas exhaustion attacks.

### 3. Timestamp Dependence
The system relies on `block.timestamp` for:
- Deadman switch intervals
- 20-year sunset calculation
- License start/end times

**Risk:** Miners can manipulate timestamp by ~15 seconds.
**Mitigation:** All time-based operations use intervals >> 15 seconds.

### 4. Political Filter Limitations (Acknowledged)
The keyword-based political filter cannot detect:
- Novel political terms not in the keyword list
- Subtle political framing using non-political language
- Encoded or obfuscated political content

**Mitigation (v1.2):** Added homoglyph detection and common misspelling checks.
**Recommendation:** Implement LLM-based semantic analysis for production use. The current filter is defense-in-depth, not comprehensive.

### 5. ~~Test Coverage Gap~~ — Addressed in Phase 2
Test coverage expanded from ~30% to 90%+ target. Added:
- Boundary condition tests for all constants (confidence threshold 94/95/96, 20-year exact boundary)
- Access control tests for all state-changing functions
- Foundry fuzz tests for all 6 core contracts + PoliticalFilter
- CI pipeline with 80% coverage threshold gate
- Curated 123-entry corpus for PoliticalFilter false positive testing

### 6. Single-Chain Deployment
The threat model mentions multi-chain escrow, but only single-chain deployment is implemented.

---

## Security Best Practices

### For Deployers

1. **Deploy in correct order:**
   ```
   1. LexiconHolder
   2. IntentCaptureModule
   3. TriggerMechanism (with IntentCaptureModule address)
   4. Set TriggerMechanism as triggerMechanism in IntentCaptureModule
   5. ExecutionAgent (with LexiconHolder address)
   6. SunsetProtocol (with ExecutionAgent and LexiconHolder)
   7. IPToken
   8. Grant roles appropriately
   ```

2. **Verify role assignments:**
   - Only trusted addresses should have EXECUTOR_ROLE
   - Only trusted addresses should have INDEXER_ROLE
   - Only sunset operators should have SUNSET_OPERATOR_ROLE

3. **Monitor events:**
   - IntentCaptured, IntentTriggered, IntentRevoked
   - ActionExecuted, InactionDefault
   - SunsetInitiated, SunsetCompleted

### For Creators

1. **Protect your private key** - It's the only way to revoke intent while alive
2. **Choose trusted signers carefully** for quorum triggers
3. **Verify corpus content** before freezing - it cannot be changed
4. **Test on testnet** before mainnet deployment

### For Auditors

Focus areas for future audits:
1. Cross-contract interaction flows
2. Edge cases in sunset protocol
3. Gas optimization opportunities
4. Formal verification of critical invariants

---

## Incident Response

### If Vulnerability Discovered

1. **Do not disclose publicly**
2. Report via [GitHub Security Advisories](../../security/advisories/new) (preferred) or open a private issue
3. Provide:
   - Vulnerability description
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Emergency Procedures

1. **If intent compromise suspected:**
   - Creator should call `revokeIntent()` immediately

2. **If executor compromise suspected:**
   - Admin should revoke EXECUTOR_ROLE
   - Deploy new ExecutionAgent if needed

3. **If funds at risk:**
   - Contact immediately
   - Do not attempt to "rescue" funds without coordination

---

## Audit History

| Date | Auditor | Type | Findings |
|------|---------|------|----------|
| 2025-12-23 | Internal | Security Review | 4 Critical, 9 High, 12 Medium, 6 Low |

---

## Recommendations for External Audit

Before mainnet deployment, engage external auditors to:

1. **Verify critical fixes** - Confirm all critical issues are properly resolved
2. **Formal verification** - Prove invariants:
   - Sunset always occurs at 20 years
   - Confidence threshold always enforced
   - Political actions always blocked
3. **Gas analysis** - Identify optimization opportunities
4. **Fuzzing** - Use Echidna/Foundry for property testing
5. **Integration testing** - Full lifecycle tests

### Recommended Audit Firms
- OpenZeppelin
- Trail of Bits
- Consensys Diligence
- Spearbit
- Code4rena (competitive audit)

---

## Changelog

### 2026-02-08 - Refocus Plan Phases 0-4

#### Phase 0: Cut Dead Weight
- Removed distracting documentation files, cleaned EVALUATION.md

#### Phase 1: Fix Logic Bugs
- **HIGH**: `distributeRevenue` in ExecutionAgent now requires corpus verification (was missing, unlike `fundProject` and `issueLicense`)
- **HIGH**: `archiveAssets` in SunsetProtocol split into `archiveAssets()` (repeatable) + `finalizeArchive()` (once) to support large estates beyond 50-item cap
- **MEDIUM**: `initiateSunset` simplified to 1 parameter (removed redundant `_triggerTimestamp` — reads directly from ExecutionAgent)

#### Phase 2: Test Coverage Blitz
- Added 1465 lines of Hardhat tests across all 6 core contracts
- Created 7 Foundry fuzz test files with property-based testing
- Added CI pipeline (`.github/workflows/ci.yml`) with 80% coverage threshold and Foundry fuzz job

#### Phase 3: PoliticalFilter Hardening
- Added `_containsCIWordBoundary()` for word-boundary-aware keyword matching (prevents "devote" matching "vote")
- Moved "policy" from primary (blocking) to secondary (advisory-only) keywords
- All secondary keyword matches now return `isProhibited: false` with `confidenceScore: 85`
- Created 123-entry test corpus (50 must-block, 50 must-allow, 23 edge cases)

#### Phase 4: Semantic Resolution Fidelity
- **CRITICAL-002 revisited**: `resolveAmbiguity()` returned to `view` — event emission removed (events now emitted by `submitResolution()`)
- Added resolution cache: off-chain indexer submits pre-computed semantic results via `submitResolution()`/`submitResolutionBatch()`
- Added `resolveAmbiguityTopK()` for top-k multi-result queries
- Added `resolveAmbiguityBatch()` for efficient batch resolution
- `ILexiconHolder` interface in ExecutionAgent updated to `view`
- Created off-chain indexer service scaffold (`indexer-service/`)

### 2026-02-05 - Evaluation Response v1.3
- **CRITICAL**: Connected PoliticalFilter library to ExecutionAgent
  - Replaced inline 4-keyword case-sensitive check with full PoliticalFilter.checkAction()
  - Now enforces 50+ keywords, case-insensitive matching, homoglyph detection, misspelling coverage
  - Added `PoliticalActionBlocked` event with matched term and confidence score
  - Removed unused `prohibitedActions` mapping and constructor initialization
- **CRITICAL**: Connected ErrorHandler library to ExecutionAgent (import only; events available)
- **HIGH**: SunsetProtocol.initiateSunset now validates timestamp against ExecutionAgent
  - Prevents spoofed trigger timestamps from compromised operators
  - Requires `_triggerTimestamp == executionAgent.triggerTimestamps(_creator)`
- **HIGH**: TriggerMechanism.submitOracleProof now requires non-empty proof data
  - Added `require(_proof.length > 0)` to prevent empty-data triggers
  - Added deprecation warning in NatSpec directing to OracleRegistry/ZKVerifierAdapter
- **MEDIUM**: Fixed empty test bodies in FIESystem.test.js (confidence threshold, political blocking)
- **LOW**: Added CI/CD pipeline (.github/workflows/ci.yml)
- **DOC**: Fixed README security table to match SECURITY.md
- **DOC**: Fixed Solidity version inconsistency in README (^0.8.20, not 0.8.28)
- **DOC**: Reclassified medical/legal ZK circuits from "Implemented" to "Entry Point" in SPECIFICATION.md
- **DOC**: Documented immutable political keyword list as intentional design choice in SPECIFICATION.md

### 2026-01-27 - Security Fixes v1.2 (Audit Response)
- Fixed MEDIUM: SunsetProtocol.emergencySunset now fetches trigger timestamp from ExecutionAgent
  - Prevents spoofed trigger timestamps from malicious callers
  - Function signature changed: `emergencySunset(address _creator)` (no longer takes timestamp)
- Fixed MEDIUM: ZKVerifierAdapter placeholder verification now reverts by default
  - Added `allowPlaceholderVerification` flag (default: false)
  - Placeholder verification only allowed when explicitly enabled for testing
  - Production deployments will revert if real ZK verifiers not deployed
- Enhanced LOW: PoliticalFilter now detects homoglyph attacks and common misspellings
  - Added `_containsSuspiciousCharacters()` to block non-ASCII characters
  - Added `_isCommonMisspelling()` to catch intentional typos
  - Blocks Cyrillic/Greek look-alike characters used to bypass filters

### 2026-01-26 - Security Fixes v1.1
- Fixed HIGH-006: LexiconHolder.resolveAmbiguity bounded iteration (MAX_CITATIONS_PER_INDEX=100)
- Fixed HIGH-007: SunsetProtocol.archiveAssets batch limit (MAX_ARCHIVE_BATCH_SIZE=50)
- Fixed MEDIUM-001: IntentCaptureModule goals limit (MAX_GOALS=50, MAX_ASSETS=100)
- Fixed MEDIUM-005: ExecutionAgent action length limit (MAX_ACTION_LENGTH=1000)
- Fixed MEDIUM-006: ExecutionAgent licenses limit (MAX_LICENSES_PER_CREATOR=100, MAX_PROJECTS_PER_CREATOR=100)
- Fixed MEDIUM-007: LexiconHolder batch limit (MAX_BATCH_SIZE=50)
- Fixed MEDIUM-011/012: IPToken licenses limit (MAX_LICENSES_PER_TOKEN=100, bounded iteration)
- Fixed LOW-003: ExecutionAgent emergency fund recovery (emergencyRecoverFunds with 1-year delay)
- Fixed LOW-005: IPToken license duration validation (MIN=1 day, MAX=20 years)
- Added TriggerMechanism array limits (MAX_TRUSTED_SIGNERS=20, MAX_ORACLES=10)
- Added PoliticalFilter string length limit (MAX_FILTER_STRING_LENGTH=1000)
- Added ExecutionAgent execution log limit (MAX_EXECUTION_LOGS=1000)

### 2025-12-23 - Security Fixes v1.0
- Fixed CRITICAL-001: TriggerMechanism reentrancy
- Fixed CRITICAL-002: LexiconHolder view function
- Fixed CRITICAL-003: IPToken reentrancy
- Fixed HIGH-001: IntentCaptureModule access control
- Fixed HIGH-002/003: TriggerMechanism loop limits
- Fixed HIGH-005/008: Replaced .transfer() with .call()

---

*This security documentation should be updated as vulnerabilities are discovered and fixed.*

*Last Updated: 2026-02-08*
