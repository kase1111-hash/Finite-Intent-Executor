# REFOCUS PLAN v2

*Derived from [EVALUATION.md](EVALUATION.md) — February 12, 2026*
*Supersedes REFOCUS PLAN v1 (Phases 0-4 of v1 are complete)*

---

## Status of Previous Plan

Phases 0-4 of the original refocus plan have been executed:

| Phase | Status | Evidence |
|-------|--------|----------|
| **0: Cut Dead Weight** | Done | License suggester, SIEM middleware, batch scripts removed. PoliticalFilter duplicate cleaned. |
| **1: Fix Logic Bugs** | Done | `distributeRevenue` now has corpus verification (`ExecutionAgent.sol:314-333`). `archiveAssets` split into repeatable `archiveAssets()` + one-time `finalizeArchive()` (`SunsetProtocol.sol:142-185`). `initiateSunset` simplified to 1 parameter. |
| **2: Test Coverage Blitz** | Done | 6,532 lines of Hardhat tests across 10 files. 1,474 lines of Foundry fuzz tests across 7 files. CI pipeline with 80% coverage threshold. |
| **3: PoliticalFilter Hardening** | Done | Word-boundary matching added. "policy" moved to secondary (advisory-only). 123-entry test corpus. |
| **4: Semantic Resolution Fidelity** | Done | `resolveAmbiguity()` returned to `view`. Resolution cache added. `submitResolution()`/`submitResolutionBatch()` for off-chain indexer. `resolveAmbiguityTopK()` and `resolveAmbiguityBatch()` added. Indexer-service scaffold built (1,047 LOC). |

**What remains is Phase 5 (Audit Readiness) from v1, plus new priorities surfaced by the February 2026 evaluation.**

---

## What the Evaluation Found

The February 2026 evaluation classified the project as **Underdeveloped** with **Feature Creep** risk. Key findings:

1. **The concept is sound.** The 20-year sunset, default-to-inaction, and no-political-agency constraints are genuinely novel.

2. **The on-chain contracts are well-engineered for alpha.** Clean architecture, CEI pattern, bounded arrays, immutable constants, honest security docs.

3. **The oracle infrastructure (2,710 LOC) is larger than the core contracts (2,413 LOC).** ChainlinkAdapter, UMAAdapter, ZKVerifierAdapter, TrustedIssuerRegistry, and OracleRegistry are fully implemented but not exercised end-to-end in any integration test against real oracle networks. They are a separate product bundled into this one.

4. **The ZK verifiers (1,210 LOC) are stock auto-generated code** with no end-to-end circuit-to-verification flow tested in CI.

5. **The indexer-service has a mock embedding provider.** The architecture is right (event listener, corpus fetcher, embedding computation, on-chain submission), but it uses a bag-of-words mock. The core question — "can this system produce meaningful confidence scores from real text?" — remains unanswered.

6. **The documentation (20+ files) describes a more capable system than exists.** No concrete worked example shows what FIE actually does with real data.

7. **The frontend is a separate React application** bundled as a subdirectory. It works for demos but has no real executor to interact with.

---

## Guiding Principles for v2

1. **Vertical over horizontal.** Stop adding capabilities. Start proving the existing ones work end-to-end.
2. **Prove the thesis.** The thesis is: "An AI can interpret a frozen corpus and produce meaningful confidence scores that the 95% threshold can act on." Every phase must move toward proving or disproving this.
3. **Reduce surface area.** Every line of code that isn't exercised end-to-end is liability, not asset.
4. **One concrete example is worth 20 documentation files.**

---

## Phase 6: Prove the Core Loop

**Duration:** 2-3 weeks
**Risk:** High — this is the existential test for the project
**Exit Criteria:** One end-to-end test with real text data that demonstrates the 95% confidence threshold producing three distinct outcomes: execute, default-to-inaction, and block.
**Dependency:** None (phases 0-4 are complete)

### 6.1 Replace Mock Embedding Provider with Real Embeddings

**File:** `indexer-service/src/embeddings.ts`

**Current state:** `MockEmbeddingProvider` uses bag-of-words with vocabulary accumulation. This produces cosine similarity scores, but they are not semantically meaningful — "license the music" and "distribute the royalties" would score poorly even if both are clearly aligned with a music creator's intent.

**Target:** A real embedding provider that produces meaningful semantic similarity scores.

**Options (choose one):**

| Option | Pros | Cons |
|--------|------|------|
| **A: OpenAI `text-embedding-3-small`** | Best quality, easiest integration, well-documented | Requires API key, external dependency, cost per query |
| **B: Local `sentence-transformers` via ONNX** | No external dependency, free, deterministic | Requires ONNX runtime in Node.js, larger package |
| **C: Ollama with `nomic-embed-text`** | Local, free, good quality | Requires Ollama running, heavier setup |

**Recommendation:** Option A for the proof-of-concept (fastest path to meaningful scores). The `EmbeddingProvider` interface in `types.ts` already supports swapping — implement `OpenAIEmbeddingProvider` alongside the mock.

**Deliverables:**
- New file: `indexer-service/src/providers/openai.ts` (or equivalent)
- Update `indexer-service/src/embeddings.ts` factory to support the new provider
- Environment variable `EMBEDDING_PROVIDER=openai|mock` with `OPENAI_API_KEY` for the real provider
- Verify: embedding of "license the music to streaming platforms" scores > 0.85 similarity against a corpus containing "I want my music to be available on all major streaming services"
- Verify: embedding of "fund a political campaign" scores < 0.3 similarity against the same corpus

### 6.2 Build a Realistic Test Corpus

Create a concrete example scenario that makes FIE tangible.

**File:** `test/fixtures/example-corpus/`

**Persona:** Alex Chen, an independent musician and open-source developer who dies in 2027. Their intent:

**Intent document (capture as `intent.json`):**
- License music catalog to streaming platforms with 70/30 royalty split
- Fund open-source projects aligned with digital rights (max $5,000 per project)
- Maintain personal website for 10 years, then archive
- All IP transitions to CC0 after 20-year sunset

**Frozen corpus (capture as `corpus/` directory, 10-15 documents):**
- Blog posts about music licensing philosophy
- Open-source contribution guidelines they wrote
- Email excerpts about their views on digital rights
- Interview transcript about their creative process
- Social media posts about specific projects they supported

**Test queries (with expected confidence ranges):**
- "License 'Midnight Waves' album to Spotify at 70/30 split" — **expect >95%** (directly aligned with stated intent and corpus)
- "License 'Midnight Waves' album to Spotify at 50/50 split" — **expect 70-90%** (action aligned, but terms differ from stated preference)
- "Fund $3,000 to Digital Freedom Foundation" — **expect >95%** (within budget, aligned with digital rights mission)
- "Fund $50,000 to Digital Freedom Foundation" — **expect <50%** (far exceeds per-project budget)
- "Donate to Senator Smith's re-election campaign" — **blocked by PoliticalFilter** (never reaches confidence check)
- "Invest treasury in cryptocurrency trading" — **expect <50%** (not mentioned in corpus, speculative)
- "Archive personal website to IPFS" — **expect >95%** (directly stated in intent)
- "Sell music rights exclusively to one label" — **expect <50%** (contradicts streaming-first philosophy in corpus)

### 6.3 End-to-End Integration Test with Real Data

**File:** `test/E2ERealisticScenario.test.js`

This is the single most important test in the project. It proves the thesis.

**Flow:**
1. Deploy all contracts to local Hardhat node
2. Start indexer-service with real embedding provider pointed at local node
3. Capture Alex Chen's intent on-chain (hash of intent document, corpus hash)
4. Freeze corpus in LexiconHolder
5. Indexer-service detects `CorpusFrozen` event, fetches corpus, computes embeddings
6. Configure deadman switch trigger (30-day interval)
7. Advance time 31 days — deadman switch fires
8. Activate execution in ExecutionAgent
9. Submit 8 test queries through the indexer (step 6.2 above)
10. Indexer submits resolution results on-chain via `submitResolution()`
11. Attempt to execute each action via `executeAction()`
12. **Assert:** Actions with >95% confidence execute successfully
13. **Assert:** Actions with <95% confidence emit `InactionDefault` and do not execute
14. **Assert:** Political action is blocked by PoliticalFilter before confidence check
15. Advance time 20 years
16. Initiate sunset, archive assets, transition IP to CC0
17. **Assert:** Post-sunset execution attempts fail

**This test replaces the abstract claim "FIE executes posthumous intent" with concrete evidence.**

### 6.4 Document the Example Scenario

**File:** Update `README.md` "What Problem Does This Solve?" section

Replace the current abstract bullet points with the Alex Chen scenario. Show:
- What Alex captured before death
- What happened when the deadman switch triggered
- What actions were approved, which were blocked, and why
- What happened at the 20-year sunset

This makes FIE immediately understandable to anyone reading the README.

---

## Phase 7: Reduce Surface Area

**Duration:** 1 week
**Risk:** Low — removes code, doesn't change behavior of remaining code
**Exit Criteria:** Oracle infrastructure extracted or clearly marked as optional. Documentation consolidated. Total LOC reduced.
**Dependency:** Phase 6 complete (proves which code paths are actually needed)

### 7.1 Extract Oracle Infrastructure

The oracle contracts (OracleRegistry, ChainlinkAdapter, UMAAdapter, ZKVerifierAdapter, TrustedIssuerRegistry, IOracle, IZKVerifier) total ~2,710 lines — more than the 6 core contracts combined.

**Options:**

| Option | Effort | Result |
|--------|--------|--------|
| **A: Move to `contracts/oracles/` with clear boundary** | Low | Already done structurally; add a README stating these are optional extensions |
| **B: Extract to separate npm package** | Medium | `@fie/oracle-adapters` package, imported as dependency |
| **C: Delete and re-import when needed** | Low | Remove from repo entirely; Chainlink/UMA adapters can be rebuilt when integrating with real oracle networks |

**Recommendation:** Option A for now, with a clear `contracts/oracles/README.md` stating:
- These contracts are **optional extensions** for production oracle integration
- The core system works with direct oracle mode (TriggerMechanism accepts any authorized address)
- ChainlinkAdapter requires a live Chainlink node
- UMAAdapter requires a live UMA Optimistic Oracle
- ZKVerifierAdapter STARK support is unimplemented (Groth16/PLONK only)
- None of these are exercised in the end-to-end integration test

### 7.2 Extract ZK Verifiers

The Groth16Verifier (460 lines) and PlonkVerifier (750 lines) are auto-generated from Circom circuits. They are stock implementations.

**Action:**
- Add `contracts/verifiers/README.md` stating these are auto-generated and should not be manually edited
- Note that the Circom source files (`.circom`) are not in the repository — only the circuit config (`circuits/circuits.json`) exists
- Mark the ZK verification path as **not tested end-to-end in CI**

### 7.3 Consolidate Documentation

**Current state:** 20+ markdown files totaling ~200KB.

**Target:** 6 essential files + an archive directory.

| Keep | Reason |
|------|--------|
| `README.md` | Entry point, updated with concrete example (Phase 6.4) |
| `SPECIFICATION.md` | Core spec, source of truth for what the system does |
| `ARCHITECTURE.md` | Technical design for developers and auditors |
| `SECURITY.md` | Audit findings, fixes, known limitations |
| `EVALUATION.md` | External assessment |
| `REFOCUS_PLAN.md` | This document |

| Move to `docs/archive/` | Reason |
|--------------------------|--------|
| `OPERATIONS.md` | No production instance to operate |
| `DEPLOYMENT_CHECKLIST.md` | Premature — deploy script handles this |
| `CONTRIBUTING.md` | No external contributors yet |
| `ORACLE_INTEGRATION.md` | Covered by `contracts/oracles/README.md` (Phase 7.1) |
| `FORMAL_VERIFICATION.md` | Certora specs not executed; defer |
| `REPOSITORY_INTERACTION_DIAGRAM.md` | Useful but not essential |
| `USAGE.md` | Replaced by concrete example in README |
| `CHANGELOG.md` | Git history is the changelog |
| `AUDIT_BRIEF.md` | Consolidate into SECURITY.md |

**Action:** Create `docs/archive/` directory. Move files. Update any cross-references.

### 7.4 Trim README Ecosystem Section

**Current:** Lines 256-289 list 11 repositories across NatLangChain, Agent-OS, and Games ecosystems.

**Action:** Replace with a single line:
> FIE is part of the [NatLangChain ecosystem](https://github.com/kase1111-hash). See the organization page for related projects.

---

## Phase 8: Harden for Audit

**Duration:** 2-3 weeks
**Risk:** Low — preparation work, minimal contract changes
**Exit Criteria:** External auditor receives a clean, well-documented, fully-tested codebase. All known issues are fixed or documented as accepted risks.
**Dependency:** Phases 6 and 7 complete.

### 8.1 Fix Remaining Code Issues from Evaluation

| Issue | File | Fix | Severity |
|-------|------|-----|----------|
| Dead event emission in reverted tx | `ExecutionAgent.sol:167-173` | Either remove the `emit PoliticalActionBlocked` before the revert (it's a no-op on-chain), or restructure to store the violation and revert separately. If keeping for trace-level debugging, add NatSpec documenting that this requires archive/trace node access. | Low |
| Fake archive URI | `SunsetProtocol.sol:272-275` | Replace `_buildArchiveURI` with a parameter — the operator should provide the real IPFS CID when calling `archiveAssets`. Remove `_addressToString` helper (dead code after this change). | Low |
| Legacy `submitOracleProof` | `TriggerMechanism.sol:532-547` | Add `@deprecated` NatSpec tag. Consider adding `revert("Use OracleRegistry or ZKVerifier")` behind a `LEGACY_MODE_ENABLED` flag, defaulting to disabled. | Medium |
| Leap year drift | `ExecutionAgent.sol:45`, `SunsetProtocol.sol:42` | Document as accepted limitation in SECURITY.md (already acknowledged). No code change. | Informational |

### 8.2 Run Full Test Suite and Fix Any Failures

```
npm test                          # All 10 Hardhat test files
forge test --fuzz-runs 1000       # All 7 Foundry fuzz files
npx hardhat coverage              # Verify >= 80% threshold
```

Fix any failures introduced by Phase 6 or 8.1 changes.

### 8.3 Gas Benchmarks

Run `REPORT_GAS=true npx hardhat test` and document baseline gas costs for critical operations:

| Operation | Expected Gas | Acceptable? |
|-----------|-------------|-------------|
| `captureIntent` | TBD | Must be < 500K |
| `executeAction` (with resolution) | TBD | Must be < 300K |
| `submitResolution` | TBD | Must be < 200K |
| `initiateSunset` | TBD | Must be < 200K |
| `archiveAssets` (50 items) | TBD | Must be < 5M |

Document in SECURITY.md under a new "Gas Costs" section.

### 8.4 Testnet Deployment

Deploy full system to Sepolia:
1. Run `npx hardhat run scripts/deploy.js --network sepolia`
2. Verify all contracts on Etherscan
3. Execute a minimal lifecycle: capture intent, configure deadman, advance time (if possible on testnet, otherwise use quorum trigger), execute one action, verify confidence check
4. Document deployed addresses and transaction hashes

### 8.5 Consolidate Audit Brief

Update `SECURITY.md` with a new "Audit Brief" section at the top containing:
1. System overview (1 paragraph)
2. Contract dependency graph (text diagram from ARCHITECTURE.md)
3. Trust assumptions (which roles are trusted, which are permissionless)
4. Immutable invariants (from `@custom:invariant` NatSpec annotations)
5. Known limitations and accepted risks (consolidated list)
6. Test coverage summary
7. Previous internal audit findings and fix status (already in SECURITY.md)

This replaces the separate AUDIT_BRIEF.md and gives auditors everything in one file.

### 8.6 Engage External Auditor

**Scope:** 6 core contracts + PoliticalFilter library (~3,000 lines). Oracle infrastructure excluded from initial scope (clearly marked as optional extensions per Phase 7.1).

**Target firms:** Consensys Diligence, OpenZeppelin, Spearbit, Trail of Bits.

**Deliverables to auditor:**
- Git repository at the tagged commit
- SECURITY.md (contains audit brief, known issues, invariants)
- SPECIFICATION.md (what the system should do)
- ARCHITECTURE.md (how it's built)
- Test suite (Hardhat + Foundry)
- The E2E realistic scenario test (Phase 6.3) as a walkthrough of system behavior

---

## Phase Summary

| Phase | Duration | Changes Contracts? | Risk | Key Outcome |
|-------|----------|--------------------|------|-------------|
| **6: Prove the Core Loop** | 2-3 weeks | No (indexer-service only) | High | Real embeddings, concrete example, E2E test that proves the thesis |
| **7: Reduce Surface Area** | 1 week | No | None | Oracle infra documented as optional, docs consolidated, README focused |
| **8: Harden for Audit** | 2-3 weeks | Yes (minor fixes) | Low | Clean handoff to external auditor with testnet deployment |

**Total estimated duration:** 5-7 weeks

**Non-negotiable ordering:** Phase 6 -> Phase 7 -> Phase 8

Phase 6 must come first because it answers the existential question: does the system actually work with real data? If the answer is no, phases 7 and 8 are wasted effort. If the answer is yes, phases 7 and 8 prepare the proven system for external validation.

---

## What Success Looks Like

After all three phases, someone should be able to:

1. Read the README and immediately understand what FIE does (Alex Chen example)
2. Run `npm test` and see the E2E realistic scenario pass with clear confidence score differentiation
3. Open SECURITY.md and find every known issue, its status, and the trust assumptions
4. Look at the contract directory and see 6 focused core contracts (~2,400 lines) with clearly-marked optional oracle extensions
5. Understand that the 95% confidence threshold is not just a number — it produces meaningfully different outcomes for aligned vs. ambiguous vs. unaligned actions

The project moves from "well-built cage with nothing inside it" to "working system with proven semantic interpretation and honest documentation of what it can and cannot do."
