# Audit Brief — Finite Intent Executor (FIE)

**Prepared for:** External security auditor
**Date:** 2026-02-08
**Version:** Post-Phase 4 (all refocus plan phases complete)
**Contact:** security@finiteintent.example

---

## 1. System Overview

The Finite Intent Executor (FIE) is a blockchain system for posthumous intent execution. A creator captures their wishes (licensing IP, distributing revenue, funding projects) into an immutable on-chain record. After a trigger event (deadman switch, quorum, or oracle proof), the system executes the creator's intent for up to 20 years, then mandatorily sunsets — all assets transition to public domain.

**Core guarantees:**
- 95% confidence threshold: ambiguous actions default to inaction
- No political agency: electoral/political actions are permanently blocked
- 20-year sunset: hard-coded, immutable, no exceptions
- Corpus immutability: the frozen contextual corpus cannot be modified

**Tech stack:** Solidity ^0.8.20, OpenZeppelin 5.4.0, Hardhat 2.22.0, Foundry (fuzzing).

---

## 2. Contracts In Scope

| Contract | File | Lines | Purpose |
|----------|------|-------|---------|
| IntentCaptureModule | `contracts/IntentCaptureModule.sol` | 198 | Intent capture, goals, revocation |
| TriggerMechanism | `contracts/TriggerMechanism.sol` | 650 | Deadman switch, quorum, oracle triggers |
| ExecutionAgent | `contracts/ExecutionAgent.sol` | 438 | Action execution, licensing, revenue |
| LexiconHolder | `contracts/LexiconHolder.sol` | 499 | Corpus indexing, semantic resolution |
| SunsetProtocol | `contracts/SunsetProtocol.sol` | 326 | 20-year sunset, archival, IP transition |
| IPToken | `contracts/IPToken.sol` | 304 | ERC721 IP tokens, licensing, royalties |
| PoliticalFilter | `contracts/libraries/PoliticalFilter.sol` | 540 | Multi-layer political keyword detection |
| ErrorHandler | `contracts/libraries/ErrorHandler.sol` | 412 | Structured error events |

**Total in-scope:** ~3,367 lines across 8 files.

**Out of scope (unless requested):** Oracle adapters (`contracts/oracles/`), ZK verifiers (`contracts/verifiers/`), ZK circuits (`circuits/`), off-chain indexer service (`indexer-service/`), frontend (`frontend/`).

---

## 3. Contract Dependency Graph

```
                    ┌──────────────────────┐
                    │  IntentCaptureModule  │
                    └──────────┬───────────┘
                               │ triggerIntent()
                    ┌──────────┴───────────┐
                    │   TriggerMechanism   │
                    └──────────────────────┘
                               │ activateExecution()
                    ┌──────────┴───────────┐
           ┌────────┤   ExecutionAgent     ├────────┐
           │        │  (PoliticalFilter)   │        │
           │        └──────────────────────┘        │
           │ resolveAmbiguity()      activateSunset()│
┌──────────┴───────────┐            ┌───────────────┴──────┐
│    LexiconHolder     │            │   SunsetProtocol     │
│  + resolution cache  │◄───────────┤  + archiveAssets     │
│  + off-chain indexer │            │  + transitionIP      │
└──────────────────────┘            └──────────────────────┘
                                             │ transitionToPublicDomain()
                                    ┌────────┴─────────┐
                                    │     IPToken      │
                                    │  (ERC721 + lic)  │
                                    └──────────────────┘
```

**Cross-contract calls:**
- TriggerMechanism → IntentCaptureModule: `triggerIntent()`
- ExecutionAgent → LexiconHolder: `resolveAmbiguity()` (view)
- SunsetProtocol → ExecutionAgent: `triggerTimestamps()`, `isSunset()`
- SunsetProtocol → LexiconHolder: `assignLegacyToCluster()`
- SunsetProtocol → IPToken: `transitionToPublicDomain()`

---

## 4. Trust Assumptions

| Role | Trust Level | Can Do | Cannot Do |
|------|-------------|--------|-----------|
| **DEFAULT_ADMIN** | High | Grant/revoke roles, deploy | Bypass confidence threshold, modify political filter, extend sunset |
| **EXECUTOR_ROLE** | High | Execute actions, issue licenses, fund projects, distribute revenue | Execute below 95% confidence, execute political actions, act after sunset |
| **INDEXER_ROLE** | Medium | Freeze corpus, create semantic indices, submit resolution results | Execute any action, modify frozen corpus, influence execution directly |
| **SUNSET_OPERATOR_ROLE** | Medium | Initiate sunset, archive assets, transition IP | Initiate before 20 years, reverse sunset, modify assets |
| **MINTER_ROLE** | Medium | Mint IP tokens | Transfer others' tokens, modify existing metadata |
| **Anyone** | None | Emergency sunset (after 20y), deadman switch execution, pay royalties, read state | All restricted operations |

**Key trust boundary:** The INDEXER_ROLE can influence execution outcomes *indirectly* by choosing what resolution results to submit. A malicious indexer could submit high-confidence citations for harmful queries, potentially enabling actions the creator didn't intend. This is mitigated by:
1. Corpus hash verification (resolution must reference the correct frozen corpus)
2. The indexer cannot bypass the political filter
3. The indexer cannot create new execution authority — only influence confidence scores

---

## 5. Formal Invariants

These are annotated with `@custom:invariant` in the contract NatSpec:

### ExecutionAgent
1. `CONFIDENCE_THRESHOLD == 95` — immutable, hard-coded constant
2. `SUNSET_DURATION == 20 * 365 days` — immutable, hard-coded constant
3. `isSunset[creator]` can only transition `false → true` (irreversible)
4. Actions blocked when `confidence < 95%` (emit `InactionDefault`, return)
5. Political actions always blocked (revert with `PoliticalActionBlocked` event)
6. Execution inactive after sunset or 20 years elapsed

### SunsetProtocol
7. `SUNSET_DURATION == 630720000 seconds` — immutable
8. Sunset cannot be initiated before 20 years elapsed
9. `isSunset` state: `false → true` only (irreversible)
10. `assetsArchived` state: `false → true` only (irreversible)
11. `ipTransitioned` state: `false → true` only (irreversible)
12. Workflow order: sunset → archive (repeatable) → finalize → transition → cluster
13. Default license type is CC0 (public domain)
14. `emergencySunset` accessible to anyone after 20 years

---

## 6. Known Limitations and Accepted Risks

| # | Limitation | Severity | Status |
|---|-----------|----------|--------|
| 1 | **ASCII-only action strings**: PoliticalFilter homoglyph protection rejects all non-ASCII bytes. Actions with accented/CJK/Arabic characters are blocked. | Medium | Accepted — trade-off for homoglyph attack prevention |
| 2 | **ZK proof verification stubbed**: Oracle trigger path trusts oracle without cryptographic verification | Medium | Known — do not use oracle triggers in production until implemented |
| 3 | **Timestamp dependence**: `block.timestamp` used for deadman switch, sunset, licenses. Miners can manipulate ~15s. | Low | Accepted — all intervals >> 15s |
| 4 | **Political filter completeness**: Keyword-based filter cannot detect novel political terms, subtle framing, or semantic circumvention | Medium | Accepted — defense-in-depth, not comprehensive |
| 5 | **Immutable political keywords**: Keyword list compiled into bytecode, cannot be updated post-deployment | Low | By design — prevents post-deployment weakening |
| 6 | **Single-chain deployment**: Spec mentions multi-chain escrow; only single-chain implemented | Low | Known scope limitation |
| 7 | **INDEXER_ROLE trust**: Off-chain indexer can influence confidence scores by choosing what to submit | Medium | Accepted — corpus hash verification + non-actuating design mitigate |
| 8 | **No intent update mechanism**: Creator cannot modify captured intent | Low | By design — prevents posthumous modification |
| 9 | **No trigger config updates**: Trigger configuration locked after creation | Low | By design |

---

## 7. Array Bounds (DoS Mitigations)

All unbounded arrays have been capped:

| Constant | Value | Contract |
|----------|-------|----------|
| MAX_GOALS | 50 | IntentCaptureModule |
| MAX_ASSETS | 100 | IntentCaptureModule |
| MAX_TRUSTED_SIGNERS | 20 | TriggerMechanism |
| MAX_ORACLES | 10 | TriggerMechanism |
| MAX_ACTION_LENGTH | 1000 | ExecutionAgent |
| MAX_LICENSES_PER_CREATOR | 100 | ExecutionAgent |
| MAX_PROJECTS_PER_CREATOR | 100 | ExecutionAgent |
| MAX_EXECUTION_LOGS | 1000 | ExecutionAgent |
| MAX_CITATIONS_PER_INDEX | 100 | LexiconHolder |
| MAX_BATCH_SIZE | 50 | LexiconHolder |
| MAX_TOPK_RESULTS | 10 | LexiconHolder |
| MAX_RESOLUTION_BATCH | 20 | LexiconHolder |
| MAX_ARCHIVE_BATCH_SIZE | 50 | SunsetProtocol |
| MAX_LICENSES_PER_TOKEN | 100 | IPToken |
| MIN_LICENSE_DURATION | 1 day | IPToken |
| MAX_LICENSE_DURATION | 20 years | IPToken |

---

## 8. Security Patterns Used

- **Reentrancy protection**: OpenZeppelin `ReentrancyGuard` on all ETH-transfer functions
- **Checks-Effects-Interactions**: State changes before external calls throughout
- **Access control**: OpenZeppelin `AccessControl` (role-based) on all state-changing functions
- **ETH transfers**: `.call{value}()` pattern (not `.transfer()`) to avoid 2300 gas limit
- **View functions**: `resolveAmbiguity()` is `view` — no state modification during resolution
- **Input validation**: Array length checks, bounds enforcement, corpus hash verification
- **Immutable constants**: Confidence threshold and sunset duration are compile-time constants

---

## 9. Recent Changes (Refocus Plan Phases 0-4)

| Phase | Commit | Summary |
|-------|--------|---------|
| **0: Cut Dead Weight** | `fbf4150` | Removed dead files, fixed docs |
| **1: Fix Logic Bugs** | `486a809` | `distributeRevenue` corpus verification, multi-batch archival, simplified `initiateSunset` |
| **2: Test Coverage** | `731f39a` | 1465 lines of tests added, Foundry fuzz tests, CI pipeline |
| **3: PoliticalFilter** | `d80c0d1` | Word-boundary matching, advisory-only secondary keywords, test corpus |
| **4: Semantic Resolution** | `06bfd3a` | Resolution cache, top-k/batch resolution, view function, off-chain indexer scaffold |

**High-attention areas post-refocus:**
1. `LexiconHolder.resolveAmbiguity()` — changed from state-modifying to `view`, added resolution cache fallback logic
2. `PoliticalFilter._containsCIWordBoundary()` — new word-boundary matching algorithm
3. `SunsetProtocol.archiveAssets()`/`finalizeArchive()` — split into two functions for multi-batch support
4. `ExecutionAgent.distributeRevenue()` — added corpus verification (5 params, was 3)

---

## 10. Internal Audit Findings Summary

Full details in `SECURITY.md`. Summary of findings and current status:

| Severity | Total | Fixed | Accepted/By Design |
|----------|-------|-------|--------------------|
| Critical | 4 | 4 | 0 |
| High | 9 | 8 | 1 (timestamp dependence) |
| Medium | 12 | 8 | 4 (by design) |
| Low | 6 | 4 | 2 (by design) |

**Note on CRITICAL-002**: The original finding was that `resolveAmbiguity()` was marked `view` but emitted events (causing revert). This was fixed by removing the `view` modifier. In Phase 4, the function was returned to `view` — this time correctly, with event emission removed. The auditor should verify that the current `view` implementation has no state-modifying operations.

---

## 11. Test Coverage

**Hardhat tests:** 7 test files covering all 6 core contracts + PoliticalFilter
**Foundry fuzz tests:** 7 fuzz test files with property-based testing
**CI pipeline:** `.github/workflows/ci.yml` with 80% coverage threshold gate

| Test File | Target Contract | Test Count (approx) |
|-----------|----------------|---------------------|
| `test/IntentCaptureModule.test.js` | IntentCaptureModule | ~30 |
| `test/TriggerMechanism.test.js` | TriggerMechanism | ~30 |
| `test/ExecutionAgent.test.js` | ExecutionAgent | ~50 |
| `test/LexiconHolder.test.js` | LexiconHolder | ~60 |
| `test/SunsetProtocol.test.js` | SunsetProtocol | ~35 |
| `test/IPToken.test.js` | IPToken | ~35 |
| `test/PoliticalFilter.test.js` | PoliticalFilter | ~70+ |
| `test/fixtures/political-filter-corpus.json` | PoliticalFilter | 123 corpus entries |
| `foundry-tests/test/*.fuzz.t.sol` (7 files) | All contracts | ~40 fuzz tests |

**Key test properties verified:**
- Confidence threshold enforcement at exact boundary (94/95/96)
- Political filter false positive rate on curated corpus
- Sunset timing at exact 20-year boundary
- Multi-batch archival for large estates
- Resolution cache precedence over semantic index
- Top-k result sorting correctness
- Access control on all state-changing functions

---

## 12. Deployment

**Deploy script:** `scripts/deploy.js` — deploys all 6 core contracts in dependency order with retry logic and optional Etherscan verification.

**Deployment order:**
1. LexiconHolder (no dependencies)
2. IntentCaptureModule (no dependencies)
3. TriggerMechanism (← IntentCaptureModule address)
4. Configure IntentCaptureModule → TriggerMechanism link
5. ExecutionAgent (← LexiconHolder address)
6. SunsetProtocol (← ExecutionAgent + LexiconHolder addresses)
7. IPToken (no dependencies)
8. Grant roles

---

## 13. Files for Auditor Review

**Priority 1 (core execution path):**
- `contracts/ExecutionAgent.sol` — action execution, revenue distribution, licensing
- `contracts/LexiconHolder.sol` — ambiguity resolution, resolution cache
- `contracts/libraries/PoliticalFilter.sol` — keyword detection, word boundaries

**Priority 2 (lifecycle):**
- `contracts/SunsetProtocol.sol` — 20-year sunset, archival
- `contracts/TriggerMechanism.sol` — trigger activation
- `contracts/IntentCaptureModule.sol` — intent capture

**Priority 3 (assets):**
- `contracts/IPToken.sol` — ERC721, licensing, royalties

**Supporting:**
- `SECURITY.md` — full internal audit findings
- `SPECIFICATION.md` — design specification
- `ARCHITECTURE.md` — system architecture
- `test/` — all test files
- `foundry-tests/` — fuzz tests

---

## 14. Suggested Audit Focus Areas

1. **Cross-contract reentrancy**: ExecutionAgent → LexiconHolder → back to ExecutionAgent (resolveAmbiguity is now `view`, so this should be safe, but verify)
2. **Resolution cache manipulation**: Can a malicious INDEXER_ROLE submit resolutions that bypass intended safeguards?
3. **PoliticalFilter bypass**: Can the word-boundary matching be circumvented? Edge cases in `_containsCIWordBoundary`
4. **Sunset timing**: Exact boundary at 20 years — can it be triggered early via timestamp manipulation?
5. **Multi-batch archival**: `archiveAssets` → `finalizeArchive` separation — can `finalizeArchive` be called prematurely?
6. **ETH handling**: All `distributeRevenue`, `fundProject`, `emergencyRecoverFunds` paths — CEI pattern, reentrancy guards
7. **Access control completeness**: Every state-changing function should be role-gated
8. **Gas griefing**: Can large arrays or long strings cause out-of-gas in any path?
