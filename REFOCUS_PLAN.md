# REFOCUS PLAN

*Derived from [EVALUATION.md](EVALUATION.md) — February 2026*

**Goal:** Close the gap between what the specification describes and what the code delivers. Stop expanding horizontally (docs, tooling, infrastructure). Start expanding vertically (correctness, coverage, fidelity).

**Guiding Principle:** Every phase must leave the system more deployable than it was before. No phase introduces new features — only fixes, tests, and fidelity improvements.

---

## Phase 0: Cut Dead Weight

**Duration:** 1 day
**Risk:** None — removes code that isn't used in the execution path
**Exit Criteria:** Repo is leaner, CI still passes, no contract behavior changes

### 0.1 Remove Distraction Files

| Action | Target | Reason |
|--------|--------|--------|
| Delete | `scripts/license_suggester.py` | Solves a different problem (pre-mortem license selection). Adds Python/Ollama dependency for zero posthumous execution value. |
| Delete | `LICENSE_SUGGESTER.md` | Documentation for removed tool. |
| Delete | `requirements.txt` | Only existed for the license suggester's Python dependencies. |
| Delete | `security/` (entire directory) | SIEM/Boundary-Daemon middleware for a system with no production instance. Premature. Rebuild when there's something live to monitor. |
| Delete | `setup.bat`, `dev.bat`, `start-node.bat`, `start-frontend.bat`, `deploy.bat`, `run-tests.bat`, `setup.ps1` | Seven Windows scripts for a crypto developer audience on Linux/Mac. All functionality already exists in `package.json` npm scripts. |

### 0.2 Trim Documentation Bloat

Do NOT delete documentation — but consolidate. The current 16 markdown files (~200KB) describe a more capable system than what exists. Accuracy matters more than volume.

| Action | Target | Reason |
|--------|--------|--------|
| Update | `SPECIFICATION.md` | Reclassify `medical_verifier.circom` and `legal_verifier.circom` from "Implemented" to "Stub/Entry Point". They are single-line includes with no domain-specific logic. |
| Update | `SPECIFICATION.md` | Change "retrieval-augmented generation" language to accurately describe the current exact-match hash lookup in `LexiconHolder.resolveAmbiguity`. Note the gap as a known limitation. |
| Update | `README.md` | Fix security audit table to match `SECURITY.md` (HIGH severity count is inconsistent). |
| Remove references | `OPERATIONS.md` | Remove references to SIEM/Boundary-Daemon integration that was cut in 0.1. |

### 0.3 Clean PoliticalFilter Noise

| Action | Target | Reason |
|--------|--------|--------|
| Remove | `PoliticalFilter.sol:461` | Duplicate check — "lobbying" listed as misspelling of itself. Already caught by primary keyword on line 88. |
| Document | `SPECIFICATION.md`, `PoliticalFilter.sol` NatSpec | Add explicit note: "Action strings must be ASCII-only. Non-ASCII bytes are rejected by homoglyph protection. This is a known limitation for international text." |

---

## Phase 1: Fix Logic Bugs

**Duration:** 2-3 days
**Risk:** Medium — changes contract behavior in the execution and sunset paths
**Exit Criteria:** All value-transfer functions verify corpus alignment. Sunset workflow works for estates of any size. Existing tests still pass.

### 1.1 Add Corpus Verification to `distributeRevenue`

**File:** `ExecutionAgent.sol:312-327`

**Problem:** `distributeRevenue` is the only value-transfer function without corpus verification. `issueLicense` (line 225) and `fundProject` (line 269) both call `lexiconHolder.resolveAmbiguity()`. `distributeRevenue` skips it entirely, allowing executors to send treasury funds to arbitrary addresses without confidence checks.

**Fix:**
- Add `_corpusHash` parameter to `distributeRevenue`
- Add `_description` parameter (string, like `fundProject`)
- Call `lexiconHolder.resolveAmbiguity()` with a query string like `"distribute_revenue:<description>"`
- Enforce `confidence >= CONFIDENCE_THRESHOLD` with `InactionDefault` emit on failure
- Update the `IExecutionAgent` interface if one exists externally
- Update frontend `config.js` ABI to match

**Validation:**
- Write a test that attempts revenue distribution without corpus match — must revert or emit `InactionDefault`
- Write a test that succeeds with a valid corpus match above 95% confidence
- Verify `fundProject` and `issueLicense` tests still pass (regression check)

### 1.2 Fix `archiveAssets` Single-Shot Limitation

**File:** `SunsetProtocol.sol:147-177`

**Problem:** `assetsArchived` is set to `true` after one call to `archiveAssets`. Combined with `MAX_ARCHIVE_BATCH_SIZE = 50`, creators with >50 assets cannot complete the sunset workflow — the second call reverts at line 154.

**Fix:** Two options (choose one):

**Option A — Separate archive and finalize steps:**
- Remove `sunsetStates[_creator].assetsArchived = true` from `archiveAssets`
- Add a new `finalizeArchive(address _creator)` function that sets the flag
- `transitionIP` continues to require `assetsArchived == true`

**Option B — Allow multiple archive calls:**
- Replace the `!sunsetStates[_creator].assetsArchived` check with a `!sunsetStates[_creator].ipTransitioned` check (archives are still valid until IP transition locks them)
- Move `assetsArchived = true` to be set only when the operator explicitly marks archival as complete

Option A is cleaner. It makes the state machine explicit: archive (repeatable) -> finalize archive (once) -> transition IP.

**Validation:**
- Write a test that archives 120 assets across 3 batches, then finalizes
- Write a test confirming `transitionIP` still requires archival to be finalized
- Write a test that verifies the full sunset workflow end-to-end with >50 assets

### 1.3 Remove Redundant `initiateSunset` Parameter

**File:** `SunsetProtocol.sol:104-138`

**Problem:** `initiateSunset(address _creator, uint256 _triggerTimestamp)` accepts a timestamp, then immediately validates it against `executionAgent.triggerTimestamps(_creator)` on line 109-113. The parameter is pointless — the function could just read the value directly, as `emergencySunset` already does on line 294.

**Fix:**
- Remove `_triggerTimestamp` parameter
- Read `actualTriggerTimestamp` directly from `executionAgent.triggerTimestamps(_creator)`
- Remove the equality check (lines 111-114) since there's no user-supplied value to compare
- Update callers (deployment scripts, frontend)

**Validation:**
- Existing sunset tests pass with the simplified signature
- Deploy script updated if it calls `initiateSunset`

---

## Phase 2: Test Coverage Blitz

**Duration:** 1-2 weeks
**Risk:** Low — tests don't change contract behavior
**Exit Criteria:** Coverage >= 90% on the 6 core contracts. All Foundry invariant tests pass. CI runs both Hardhat and Foundry test suites.
**Dependency:** Phase 1 complete (tests must validate the fixed behavior)

### 2.1 Hardhat Unit Tests — Fill Gaps

Priority order based on risk to user funds:

| Contract | Current State | Target | Focus Areas |
|----------|--------------|--------|-------------|
| `ExecutionAgent` | Partial (some empty test bodies) | Full | Confidence threshold boundary (94/95/96), corpus verification on all 3 value-transfer functions, political filter integration, sunset activation, emergency recovery timing |
| `SunsetProtocol` | Partial | Full | 20-year boundary precision, multi-batch archival (Phase 1.2 fix), workflow ordering enforcement, emergency sunset by non-operator, double-sunset prevention |
| `TriggerMechanism` | Partial | Full | Trigger irreversibility, deadman interval boundary, quorum threshold, oracle mode switching, ZK verification flow |
| `PoliticalFilter` | None (tested indirectly) | Dedicated suite | False positive rate (test "insurance policy", "devote resources", "area of influence"), false negative rate (test bypass attempts), misspelling coverage, homoglyph detection, MAX_FILTER_STRING_LENGTH boundary |
| `LexiconHolder` | Partial | Full | Corpus freeze immutability, hash mismatch rejection, empty index handling, batch index creation, MAX bounds |
| `IntentCaptureModule` | Partial | Full | Revocation while alive, double-trigger prevention, corpus window validation (5-10 year), MAX_GOALS boundary |
| `IPToken` | Partial | Full | Royalty distribution, license management, post-sunset public domain transition |

**Action items:**
- Delete empty test bodies in `test/FIESystem.test.js:224-243` — replace with real assertions or remove to eliminate false coverage signal
- Add negative tests for every `require()` statement in the 6 core contracts
- Add boundary tests for every `MAX_*` constant

### 2.2 Foundry Fuzz Tests — Expand Skeleton

The existing `foundry-tests/` has 3 files. Expand:

| File | Status | Add |
|------|--------|-----|
| `ExecutionAgent.fuzz.t.sol` | Exists | Fuzz confidence values (0-100), fuzz action strings for PoliticalFilter bypass attempts, fuzz treasury amounts for over/underflow |
| `IntentCaptureModule.fuzz.t.sol` | Exists | Fuzz corpus window years, fuzz goal counts up to MAX_GOALS |
| `Invariants.t.sol` | Exists | Add invariants: `isSunset` can only go false->true, `CONFIDENCE_THRESHOLD` always == 95, `SUNSET_DURATION` always == 20*365 days, treasury balance >= sum of pending distributions |
| `SunsetProtocol.fuzz.t.sol` | **New** | Fuzz timestamp values around the 20-year boundary, fuzz batch sizes for archival |
| `TriggerMechanism.fuzz.t.sol` | **New** | Fuzz deadman intervals, fuzz signature counts vs. quorum thresholds |
| `PoliticalFilter.fuzz.t.sol` | **New** | Fuzz random strings for false positive rate measurement, fuzz known political terms with character substitutions |

### 2.3 CI Pipeline — Add Foundry

**File:** `.github/workflows/ci.yml`

Current CI runs Hardhat compile, Hardhat test, and frontend lint. Add:

- Install Foundry (foundryup) in CI
- Run `forge test` after Hardhat tests
- Run `forge test --gas-report` and save as artifact
- Add `npx hardhat coverage` step with minimum threshold check (fail if < 90%)

---

## Phase 3: PoliticalFilter Hardening

**Duration:** 3-5 days
**Risk:** Medium — changes filter behavior, may affect what actions pass/fail
**Exit Criteria:** False positive rate on a curated test set of 50 legitimate asset-management phrases < 5%. No regression on known political term detection.
**Dependency:** Phase 2 complete (need test coverage to validate filter changes safely)

### 3.1 Reduce False Positives with Word Boundary Detection

**Problem:** Substring matching causes "policy" to block "insurance policy distribution", "vote" to block "devote", and "influence" to block "area of influence."

**Approach:** Add word-boundary-aware matching for terms that commonly appear in legitimate contexts. For primary keywords with high false-positive risk (`policy`, `vote`, `influence`, `regulation`, `advocate`, `liberal`, `conservative`), check that the match is bounded by spaces, punctuation, or string start/end — not embedded in a larger word.

**Affected terms to analyze:**
| Term | False positive example | Action needed |
|------|----------------------|---------------|
| `policy` | "insurance policy distribution" | Add boundary check OR move to secondary (contextual) |
| `vote` | "devote resources to" | Add boundary check |
| `influence` | "area of influence in market" | Move to secondary (only block when combined with political context) |
| `regulatory` | "regulatory compliance review" | Move to secondary |
| `advocate` | "advocate for better tooling" | Move to secondary |
| `liberal` | "liberal interpretation of terms" | Move to secondary |
| `conservative` | "conservative estimate" | Move to secondary |

### 3.2 Document ASCII-Only Limitation

If `_containsSuspiciousCharacters` stays (blocking all non-ASCII):
- Add NatSpec documentation to PoliticalFilter explaining the restriction
- Add to SPECIFICATION.md under "Non-Negotiable Constraints" or a new "Known Limitations" section
- Add a revert message that says "Non-ASCII characters not permitted in action strings" instead of the generic "suspicious_characters"

If the decision is to loosen it:
- Allow common Latin Extended characters (accents: 0xC0-0xFF single-byte range)
- Keep blocking multi-byte sequences (Cyrillic, CJK, etc.) which are the actual homoglyph risk
- This requires careful UTF-8 parsing — defer to Phase 5 if the complexity is too high

### 3.3 Build a PoliticalFilter Test Corpus

Create `test/fixtures/political-filter-corpus.json` with three sections:

1. **Must Block** (50+ entries): known political actions, misspellings, homoglyph attempts
2. **Must Allow** (50+ entries): legitimate asset management phrases that currently false-positive
3. **Edge Cases** (20+ entries): ambiguous phrases that document the filter's intended behavior

Run this corpus as a parameterized test suite in both Hardhat and Foundry. Track false positive/negative rates as a CI metric.

---

## Phase 4: Semantic Resolution Fidelity

**Duration:** 2-4 weeks
**Risk:** High — this is the most architecturally significant change
**Exit Criteria:** `resolveAmbiguity` returns meaningful confidence scores for queries that are semantically similar (not just exact matches) to indexed terms. The 95% threshold produces different outcomes for strong vs. weak corpus matches.
**Dependency:** Phases 1-3 complete. Core contracts are bug-free and well-tested before changing the interpretation engine.

### 4.1 Define the Problem Precisely

Currently `LexiconHolder.resolveAmbiguity` does:
```
queryHash = keccak256(query)
index = semanticIndices[creator][queryHash]
return highest-scoring citation from index
```

This means:
- Query "license_issuance" returns a result only if someone pre-indexed exactly "license_issuance"
- Query "issue a license" returns nothing (different hash)
- The 95% confidence threshold is binary: either the pre-set score (if hash matches) or 0 (if it doesn't)

The spec says "retrieval-augmented generation against the frozen contextual corpus." The implementation needs to move toward this — but full on-chain RAG is infeasible. The realistic target is **off-chain semantic resolution with on-chain verification**.

### 4.2 Design: Off-Chain Resolution, On-Chain Verification

**Architecture:**
1. Off-chain service (could be an LLM, vector DB, or embedding model) receives the query and corpus
2. Service returns: `(citation, confidence, proof)` where proof is a commitment to the computation
3. On-chain `LexiconHolder` verifies the proof against the frozen corpus hash
4. Confidence score is now meaningful — it's the similarity score from the embedding model

**Options for on-chain verification:**
- **Option A: Trusted Indexer** — The INDEXER_ROLE submits resolution results on-chain. Trust-based but simple. Matches current architecture (just makes the indexer more capable).
- **Option B: Optimistic Verification** — Results are submitted with a challenge period. Anyone can dispute with counter-evidence. Integrates with existing UMA adapter pattern.
- **Option C: ZK Proof of Computation** — The off-chain service proves it ran the correct similarity computation on the correct corpus. Most trustless, but requires custom ZK circuits for embedding similarity.

**Recommendation:** Start with Option A (trusted indexer). The INDEXER_ROLE already exists and the trust model is already accepted. Replace the manual pre-indexing workflow with a service that:
1. Loads the frozen corpus from IPFS/Arweave (verified by corpus hash)
2. Computes embeddings for all corpus content
3. On query: computes query embedding, finds nearest corpus citation, returns similarity score as confidence
4. Submits result on-chain via `resolveAmbiguity` (which already accepts external calls from INDEXER_ROLE)

This doesn't change the contract interface — only the quality of the data being fed into it.

### 4.3 Modify LexiconHolder for Richer Indexing

- Add support for multiple index entries per query (fuzzy matches return top-k)
- Add a `resolveAmbiguityBatch` function for efficiency
- Consider making `resolveAmbiguity` a `view` function (remove the event emission, or move it to the caller). This reduces gas cost per execution action.

### 4.4 Build the Off-Chain Indexing Service

This is a new component — the only "new code" in the entire refocus plan.

- TypeScript/Python service that watches for `CorpusFrozen` events
- Fetches corpus from decentralized storage
- Builds vector embeddings (could use any model: OpenAI, local sentence-transformers, etc.)
- Responds to resolution requests from ExecutionAgent's off-chain orchestrator
- Submits results on-chain via the INDEXER_ROLE

**Scope guard:** This service is an INDEXER, not an EXECUTOR. It submits semantic indices. It cannot execute, modify, or veto any action. This preserves the LexiconHolder's non-actuating property.

---

## Phase 5: Audit Readiness

**Duration:** 2-3 weeks
**Risk:** Low — preparation work, no contract changes
**Exit Criteria:** External auditor has a clean, documented, well-tested codebase to review. All known issues are either fixed or documented as accepted risks.
**Dependency:** Phases 1-4 complete.

### 5.1 Pre-Audit Checklist

| Item | Status After Phases 0-4 | Action |
|------|------------------------|--------|
| Test coverage >= 90% | Done (Phase 2) | Run `npx hardhat coverage`, verify all contracts above threshold |
| All logic bugs fixed | Done (Phase 1) | Regression test suite confirms |
| Foundry invariant tests pass | Done (Phase 2) | `forge test` in CI |
| PoliticalFilter false positive rate < 5% | Done (Phase 3) | Corpus test suite confirms |
| Semantic resolution produces meaningful scores | Done (Phase 4) | Integration test with off-chain indexer |
| Known limitations documented | Done (Phase 0, 3) | ASCII-only filter, single-chain, no LLM parsing |
| Internal audit findings re-verified | Pending | Walk through SECURITY.md findings, confirm fixes still hold after Phase 1-4 changes |
| Gas benchmarks documented | Pending | Run `npm run test:gas`, document baseline costs per operation |
| Deployment script tested on Sepolia | Pending | Full deployment + interaction test on testnet |

### 5.2 Consolidate Documentation for Auditors

Create a single `AUDIT_BRIEF.md` that gives an external auditor everything they need:

1. System overview (1 page — extracted from SPECIFICATION.md)
2. Contract dependency graph (extracted from ARCHITECTURE.md)
3. Trust assumptions (which roles are trusted, which aren't)
4. Known limitations and accepted risks
5. Formal invariants from `@custom:invariant` NatSpec annotations
6. Test coverage report
7. Previous internal audit findings and their fixes (from SECURITY.md)

This replaces asking auditors to read 16 separate markdown files.

### 5.3 Engage External Auditor

Target firms (alphabetical): Consensys Diligence, OpenZeppelin, Spearbit, Trail of Bits.

Scope should cover:
- 6 core contracts (~2,500 lines)
- PoliticalFilter library (~480 lines)
- Oracle adapters only if they'll be used in initial deployment (otherwise defer)
- Foundry invariant test review (auditor can extend)

---

## Phase Summary

| Phase | Duration | Changes Contracts? | Risk | Key Outcome |
|-------|----------|--------------------|------|-------------|
| **0: Cut Dead Weight** | 1 day | Minimal (1 line delete in PoliticalFilter) | None | Leaner repo, accurate docs |
| **1: Fix Logic Bugs** | 2-3 days | Yes (3 contracts) | Medium | All value transfers verified, sunset works for any estate size |
| **2: Test Coverage Blitz** | 1-2 weeks | No | None | 90%+ coverage, Foundry fuzzing, CI integration |
| **3: PoliticalFilter Hardening** | 3-5 days | Yes (PoliticalFilter) | Medium | < 5% false positive rate, documented limitations |
| **4: Semantic Resolution** | 2-4 weeks | Yes (LexiconHolder) + new off-chain service | High | Meaningful confidence scores, real semantic matching |
| **5: Audit Readiness** | 2-3 weeks | No | None | Clean handoff to external auditor |

**Total estimated duration:** 7-12 weeks

**Non-negotiable ordering:** Phase 0 -> Phase 1 -> Phase 2 -> Phases 3 & 4 (can overlap) -> Phase 5

Phase 2 MUST complete before 3 or 4 because test coverage is what makes contract changes safe. Phase 5 MUST be last because it validates everything prior.
