# Finite Intent Executor - Specification v1.1

## Overview

The Finite Intent Executor (FIE) is a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously, with strict bounds on duration, scope, and agency. It provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive.

**Related Documentation:**
- [README.md](README.md) - Quick start guide and project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and component design
- [SECURITY.md](SECURITY.md) - Security audit findings and best practices
- [docs/archive/](docs/archive/) - Additional documentation (usage, oracle integration, formal verification, etc.)

---

## Components

### Intent Capture Module

Captures assets (tokenized IP, funds, keys, rights), goals, constraints, and a time-boxed contextual corpus (5-10 year window centered on capture date).

**Output**: Immutable intent graph stored on-chain with cryptographic commitments.

**Features**:
- LLM-assisted parsing for clarity
- Creator signs all versions

### Trigger Mechanism

**Trigger Types**:
- Deadman switch (30+ day inactivity)
- Trusted-signature quorum (M-of-N signatures)
- Verified oracles (medical/legal events via OracleRegistry)

**Oracle Verification Modes**:
- **Direct Mode**: Legacy - trust registered oracle addresses directly
- **Registry Mode**: Multi-oracle consensus via OracleRegistry with reputation tracking
- **ZK Proof Mode**: Zero-knowledge proof verification (infrastructure ready)

**Event Types**:
- Death certificate verification
- Medical incapacitation
- Legal events (probate, court rulings)
- Custom events

**Behavior**: Atomic, irreversible transfer of control upon valid trigger with 95% confidence threshold.

### Execution Agent

Narrow, scope-bounded AI executor.

**Capabilities**:
- License assets
- Collect and distribute revenue
- Fund aligned projects
- Enforce constraints via smart contracts

**Interpretation**: All ambiguous terms resolved exclusively against the frozen contextual corpus. `LexiconHolder.resolveAmbiguity()` checks a resolution cache (populated by the off-chain indexer service via `submitResolution()`) first, then falls back to exact keyword-hash lookup. The off-chain indexer computes semantic embeddings against the frozen corpus and submits pre-computed resolution results on-chain via `INDEXER_ROLE`. This enables meaningful confidence scores for semantically similar queries without requiring full on-chain RAG. See `indexer-service/` for the off-chain component.

**Ambiguity Resolution Failure Mode**: If intent cannot be resolved with >=95% confidence through corpus citation, the Execution Agent MUST permanently default to inaction for the affected operation or branch. No speculative or creative interpretation permitted.

**No Political Agency Clause**: The FIE MAY NOT engage in electoral activity, political advocacy, lobbying, or policy influence beyond passive licensing of the creator's authored works. Enforcement is via the `PoliticalFilter` library, which implements multi-layer detection: exact action hash matching, case-insensitive primary keywords with word-boundary enforcement, common misspelling detection, political phrase matching, advisory-only secondary contextual keywords (non-blocking), and homoglyph attack protection. Primary keywords (electoral, election, campaign, ballot, vote, voting, voter, lobby, lobbying, lobbyist, political, politician, partisan, legislation, legislative, lawmaker, government, senator, congressman, parliament) block execution. Secondary keywords (policy, advocacy, advocate, endorse, endorsement, regulatory, regulation, deregulation, influence, persuade, sway, republican, democrat, conservative, liberal) are logged but do not block, reducing false positives on legitimate phrases like "insurance policy distribution" or "conservative estimate".

**Political Keyword Immutability (Design Choice)**: The political keyword list is compiled into the contract bytecode and is intentionally immutable. This is consistent with the drift-resistance philosophy: a posthumous executor should not have its constraints modified after deployment. Political language may evolve, but the contract's prohibition scope is fixed at deployment time. This prevents post-deployment weakening of the No Political Agency Clause by any party, including operators.

**Logging**: All decisions logged on-chain with corpus citations. Political filter violations emit `PoliticalActionBlocked` events with the matched term and confidence score.

**Known Limitation — ASCII-Only Action Strings**: The PoliticalFilter homoglyph protection (`_containsSuspiciousCharacters`) rejects any non-ASCII byte in action strings. This means action descriptions containing accented characters, CJK text, Arabic, or other non-Latin scripts will be blocked. This is a known trade-off for homoglyph attack prevention. See REFOCUS_PLAN.md Phase 3.

### Lexicon Holders

**Definition**: Lexicon holders are non-actuating semantic indexers. They possess no authority to initiate, modify, veto, or otherwise influence execution.

**Functions**:
1. Providing interpretive citations from the frozen corpus during active execution
2. Caching pre-computed semantic resolution results from the off-chain indexer
3. Top-k and batch resolution for efficient multi-query processing
4. Post-sunset clustering of archived legacies

**Resolution Architecture**: The off-chain indexer service (`indexer-service/`) watches for `CorpusFrozen` events, fetches the corpus from decentralized storage, computes vector embeddings, and submits resolution results on-chain via `submitResolution()` / `submitResolutionBatch()`. The `resolveAmbiguity()` function (now a gas-efficient `view` function) checks this resolution cache first, enabling meaningful intermediate confidence scores rather than binary hash-match results.

**Operation**: Operated via decentralized protocols or neutral LLM instances; no centralized control. The indexer service is a non-actuating component — it submits semantic indices but cannot execute, modify, or veto any action.

### Sunset Protocol

**Duration**: Mandatory termination exactly 20 years after trigger date (fixed, non-configurable).

**Process**:
1. Halts all execution
2. Migrates all assets and IP to permanent decentralized storage
3. Transitions assets to public domain

**Post-Sunset Asset State**: All IP assets SHALL transition to public-domain-equivalent licensing (CC0 or equivalent) or a neutral stewardship license that prohibits exclusive re-enclosure.

**Automated Clustering**: Embeddings group the legacy with semantically similar archived intents for discoverability and cultural remix. Fully automated via lexicon holders; no human curation.

### IP Token

ERC721 tokens for intellectual property assets with licensing, royalty distribution, and post-sunset public domain transition support.

---

## Features & Safeguards

- **Drift Resistance**: Interpretation locked to time-boxed corpus
- **Transparency & Auditability**: All triggers, decisions, logs, and sunsets on-chain
- **Revocability**: Complete while alive via private key
- **Self-Funding**: Endowed treasuries cover operational costs
- **Fork Neutrality**: Post-sunset forks or adaptations by third parties are unmanaged and outside FIE scope

---

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Oracle failure | Conservative halt (default to inaction) |
| LLM misalignment | Hard scope-bounded APIs and confidence thresholds |
| Chain failure | Multi-chain escrow with automated fallback |
| Corpus poisoning | Immutable cryptographic snapshot hashes |
| Key compromise while alive | Immediate revocation and reissue |

---

## Implementation Notes

- Compatible with mature blockchain ecosystems supporting tokenization, smart contracts, and decentralized storage
- Core design remains deliberately simple to enable formal verification and broad adoption

---

## Core Principle

**FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance.**

---

This specification turns the problem of posthumous intent from an intractable trust problem into a solvable systems problem—delivering finite, inspectable, enforceable continuity without creating unkillable power structures.

---

## Implementation Status

*Last Updated: 2026-02-12*

### Smart Contracts

All core smart contracts are implemented (6 core + 9 oracle/verifier):

| Contract | File | Status | Notes |
|----------|------|--------|-------|
| **IntentCaptureModule** | `contracts/IntentCaptureModule.sol` | Implemented | Intent capture, goals, revocation, multi-version signing |
| **TriggerMechanism** | `contracts/TriggerMechanism.sol` | Implemented | Deadman switch, quorum, enhanced oracle + ZK integration |
| **ExecutionAgent** | `contracts/ExecutionAgent.sol` | Implemented | 95% confidence threshold, political filtering, licensing |
| **LexiconHolder** | `contracts/LexiconHolder.sol` | Implemented | Corpus freezing, semantic indexing, resolution cache, top-k/batch resolution, clustering |
| **SunsetProtocol** | `contracts/SunsetProtocol.sol` | Implemented | 20-year enforcement, public domain transition |
| **IPToken** | `contracts/IPToken.sol` | Implemented | ERC721, licensing, royalties |
| **IOracle** | `contracts/oracles/IOracle.sol` | Implemented | Standard oracle interface |
| **ChainlinkAdapter** | `contracts/oracles/ChainlinkAdapter.sol` | Implemented | Chainlink Any API integration |
| **UMAAdapter** | `contracts/oracles/UMAAdapter.sol` | Implemented | UMA Optimistic Oracle with dispute resolution |
| **OracleRegistry** | `contracts/oracles/OracleRegistry.sol` | Implemented | Multi-oracle consensus and reputation |
| **IZKVerifier** | `contracts/oracles/IZKVerifier.sol` | Implemented | ZK proof verifier interface |
| **TrustedIssuerRegistry** | `contracts/oracles/TrustedIssuerRegistry.sol` | Implemented | Certificate authority registry |
| **ZKVerifierAdapter** | `contracts/oracles/ZKVerifierAdapter.sol` | Implemented | ZK proof verification oracle adapter |
| **Groth16Verifier** | `contracts/verifiers/Groth16Verifier.sol` | Implemented | On-chain Groth16 proof verification |
| **PlonkVerifier** | `contracts/verifiers/PlonkVerifier.sol` | Implemented | On-chain PLONK proof verification |

### ZK Circuits

| Circuit | File | Status | Notes |
|---------|------|--------|-------|
| DeathCertificateVerifier | `circuits/certificate_verifier.circom` | Implemented | Death certificate ZK verification (full circuit logic) |
| MedicalIncapacitationVerifier | `circuits/medical_verifier.circom` | Entry Point | Wrapper including certificate_verifier; needs medical-specific logic |
| LegalDocumentVerifier | `circuits/legal_verifier.circom` | Entry Point | Wrapper including certificate_verifier; needs legal-specific logic |

### Additional Tools

| Tool | Location | Status | Notes |
|------|----------|--------|-------|
| Deployment Script | `scripts/deploy.js` | Implemented | Local and network deployment |
| ~~License Suggester~~ | ~~`scripts/license_suggester.py`~~ | Removed | Removed in Phase 0 refocus — different problem domain (pre-mortem), added Python/Ollama dependency |
| ZK Proof Generator | `scripts/zk/zkProofGenerator.js` | Implemented | Off-chain proof generation SDK |
| Circuit Build Script | `scripts/zk/build_circuits.sh` | Implemented | Compile circuits and generate keys |
| Test Suite | `test/` (11 files) | Expanded | 80%+ coverage enforced in CI (Phase 2) |

---

## Implemented Features

### Core Features (Fully Implemented)

- Immutable intent graph with cryptographic hashes
- 5-10 year corpus window enforcement
- Multi-version signing
- Revocability while alive
- Deadman switch trigger (30+ day minimum)
- Trusted-signature quorum (2+ signatures required)
- Oracle-verified triggers (interface ready)
- 95% confidence threshold for execution
- Default to inaction on ambiguity
- No Political Agency Clause (keyword filtering)
- On-chain execution logging with citations
- IP tokenization (ERC721)
- License issuance and management
- Royalty collection and distribution
- 20-year sunset enforcement (hard-coded)
- Public domain transition (CC0)
- Post-sunset semantic clustering
- Emergency sunset function (anyone can trigger after 20 years)

### Partially Implemented Features

| Feature | Current State | Gap |
|---------|---------------|-----|
| **Oracle Integration** | ChainlinkAdapter + UMAAdapter + OracleRegistry + ZKVerifierAdapter | Production ZK circuits pending; no end-to-end oracle test in CI |
| **Political Activity Filtering** | Multi-layer detection: word-boundary matching, homoglyph protection, misspelling detection, primary/secondary keyword classification (Phase 3) | LLM-based intent classification would improve coverage of novel political terms |
| **Semantic Search** | Resolution cache with off-chain indexer; OpenAI `text-embedding-3-small` support (Phase 6); TF-IDF fallback for testing | Production-grade embedding pipeline needs hardening |
| **Test Coverage** | 11 Hardhat test files, 7 Foundry fuzz test files, CI gates on 80% coverage (Phase 2) | Target 90%+ before external audit |

---

## Unimplemented Features

### Critical (Required Before Production)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | **External Security Audit** | Internal audit complete, external audit pending | Partial |
| 2 | **Formal Verification** | Certora specs written, SMTChecker configured, verification pending | Partial |
| 3 | **Comprehensive Test Suite** | 80%+ coverage enforced in CI; 11 Hardhat + 7 Foundry fuzz test files | Mostly Complete (target 90%+ for audit) |
| 4 | **Enhanced Oracle Integration** | OracleRegistry, ChainlinkAdapter, UMAAdapter, ZKVerifierAdapter implemented; production ZK circuits pending | Mostly Complete |
| 5 | **Frontend/UI** | React dashboard with full functionality | ✅ Complete |

### High Priority

| # | Feature | Description |
|---|---------|-------------|
| 6 | **LLM-Assisted Intent Parsing** | Spec mentions but not implemented - AI clarity checking |
| 7 | **Multi-Chain Deployment & Escrow** | Mentioned in threat model, currently single-chain only |
| 8 | **Vector Embeddings for Semantic Search** | Resolution cache + off-chain indexer (Phase 4); OpenAI embeddings (Phase 6); needs production hardening |
| 9 | **Monitoring Dashboard** | React MonitoringDashboard page implemented in frontend |
| 10 | **IPFS Pinning Service Integration** | URIs stored but no active pinning or redundancy |

### Medium Priority

| # | Feature | Description |
|---|---------|-------------|
| 11 | **Revenue Streaming** | Simple transfers only, no Superfluid/Sablier integration |
| 12 | **Multi-Signature for High-Value Actions** | Single executor role, no M-of-N approvals |
| 13 | **Time-Weighted Goal Prioritization** | Static priority only, no temporal weighting |
| 14 | **Automated Compliance Checking** | Manual constraint verification only |
| 15 | **Enhanced NLP for Political Filtering** | LLM-based detection needed for bypass prevention |
| 16 | **Gas Optimization** | Standard implementations, minimal optimization |
| 17 | **Developer SDK** | No TypeScript/Python SDK for easier integration |

### Lower Priority

| # | Feature | Description |
|---|---------|-------------|
| 18 | Cross-Chain Asset Bridges | Asset bridging between networks |
| 19 | Advanced Analytics and Reporting | Usage metrics and execution analytics |
| 20 | Mobile Application | Native mobile app for creators |
| 21 | AI-Powered Execution Recommendations | Smart suggestions for aligned projects |
| 22 | Social Recovery Mechanisms | Recovery options for key loss scenarios |
| 23 | Decentralized Governance | System upgrade governance mechanism |

---

## Non-Negotiable Constraints

These constraints are hard-coded and cannot be changed:

| Constraint | Implementation | Location |
|------------|---------------|----------|
| **20-Year Sunset** | `SUNSET_DURATION = 20 * 365 days` | `SunsetProtocol.sol`, `ExecutionAgent.sol` |
| **95% Confidence Threshold** | `CONFIDENCE_THRESHOLD = 95` | `ExecutionAgent.sol:41` |
| **No Political Agency** | `PoliticalFilter.checkAction()` via `_isProhibitedAction()` | `ExecutionAgent.sol:165, 367-379` |
| **Corpus Immutability** | `freezeCorpus()` with `isFrozen` flag | `LexiconHolder.sol:88` |
| **Inaction Default** | Return on `confidence < 95` | `ExecutionAgent.sol:184` |

---

## Technical Reference

For detailed technical information, see:

- **Architecture & Data Structures**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **API & Contract Functions**: [USAGE.md](docs/archive/USAGE.md)
- **System Interaction Flows**: [REPOSITORY_INTERACTION_DIAGRAM.md](docs/archive/REPOSITORY_INTERACTION_DIAGRAM.md)

---

## Summary

The Finite Intent Executor core contracts are implemented and functional. The system achieves its core design goals:

**Achieved:**
- Scope-bounded execution with 95% confidence threshold
- Mandatory 20-year sunset with public domain transition
- Default-to-inaction on ambiguity
- No political agency enforcement
- On-chain audit logging
- Complete React dashboard for user interaction
- Multi-oracle consensus infrastructure (Chainlink, UMA, ZK)
- Zero-knowledge proof verification infrastructure

**Key Gaps:**
- External security audit pending (internal audit complete)
- Test coverage at 80%+ CI gate; target 90%+ before audit
- Trusted setup ceremony for production ZK circuits pending
- Multi-layer keyword-based political filtering (Phase 3); LLM-based classification would improve coverage
- Off-chain indexer needs production hardening (real embeddings proven in Phase 6 E2E test)

**Production Readiness:** Requires external audit, indexer hardening, and testnet deployment before mainnet. See [REFOCUS_PLAN.md](REFOCUS_PLAN.md) Phase 8.

---

*This specification document consolidates information from all repository documentation. For detailed architecture see [ARCHITECTURE.md](ARCHITECTURE.md), for usage examples see [USAGE.md](docs/archive/USAGE.md).*

*Last Updated: 2026-02-12*
