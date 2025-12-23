# Finite Intent Executor - Specification v1.1

## Overview

The Finite Intent Executor (FIE) is a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously, with strict bounds on duration, scope, and agency. It provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive.

**Related Documentation:**
- [README.md](README.md) - Quick start guide and project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and component design
- [USAGE.md](USAGE.md) - Comprehensive usage guide with examples
- [REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md) - System interaction flows
- [LICENSE_SUGGESTER.md](LICENSE_SUGGESTER.md) - Optional AI-powered license suggestion tool
- [SECURITY.md](SECURITY.md) - Security audit findings and best practices
- [FORMAL_VERIFICATION.md](FORMAL_VERIFICATION.md) - Formal verification specifications and invariants
- [ORACLE_INTEGRATION.md](ORACLE_INTEGRATION.md) - Oracle infrastructure and verification protocols

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

**Interpretation**: All ambiguous terms resolved exclusively via retrieval-augmented generation against the frozen contextual corpus.

**Ambiguity Resolution Failure Mode**: If intent cannot be resolved with >=95% confidence through corpus citation, the Execution Agent MUST permanently default to inaction for the affected operation or branch. No speculative or creative interpretation permitted.

**No Political Agency Clause**: The FIE MAY NOT engage in electoral activity, political advocacy, lobbying, or policy influence beyond passive licensing of the creator's authored works.

**Logging**: All decisions logged on-chain with corpus citations.

### Lexicon Holders

**Definition**: Lexicon holders are non-actuating semantic indexers. They possess no authority to initiate, modify, veto, or otherwise influence execution.

**Functions**:
1. Providing interpretive citations from the frozen corpus during active execution
2. Post-sunset clustering of archived legacies

**Operation**: Operated via decentralized protocols or neutral LLM instances; no centralized control.

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

*Last Updated: 2025-12-23*

### Smart Contracts

All core smart contracts are implemented (6 core + 4 oracle):

| Contract | File | Status | Notes |
|----------|------|--------|-------|
| **IntentCaptureModule** | `contracts/IntentCaptureModule.sol` | Implemented | Intent capture, goals, revocation, multi-version signing |
| **TriggerMechanism** | `contracts/TriggerMechanism.sol` | Implemented | Deadman switch, quorum, enhanced oracle integration |
| **ExecutionAgent** | `contracts/ExecutionAgent.sol` | Implemented | 95% confidence threshold, political filtering, licensing |
| **LexiconHolder** | `contracts/LexiconHolder.sol` | Implemented | Corpus freezing, semantic indexing, clustering |
| **SunsetProtocol** | `contracts/SunsetProtocol.sol` | Implemented | 20-year enforcement, public domain transition |
| **IPToken** | `contracts/IPToken.sol` | Implemented | ERC721, licensing, royalties |
| **IOracle** | `contracts/oracles/IOracle.sol` | Implemented | Standard oracle interface |
| **ChainlinkAdapter** | `contracts/oracles/ChainlinkAdapter.sol` | Implemented | Chainlink Any API integration |
| **UMAAdapter** | `contracts/oracles/UMAAdapter.sol` | Implemented | UMA Optimistic Oracle with dispute resolution |
| **OracleRegistry** | `contracts/oracles/OracleRegistry.sol` | Implemented | Multi-oracle consensus and reputation |

### Additional Tools

| Tool | Location | Status | Notes |
|------|----------|--------|-------|
| Deployment Script | `scripts/deploy.js` | Implemented | Local and network deployment |
| License Suggester | `scripts/license_suggester.py` | Implemented | Optional Ollama-based license suggestions |
| Test Suite | `test/FIESystem.test.js` | Basic | Core functionality tested, ~30% coverage |

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
| **Oracle Integration** | ChainlinkAdapter + UMAAdapter + OracleRegistry | ZK proof verification pending |
| **Political Activity Filtering** | Basic keyword matching | Needs LLM-based intent classification |
| **Semantic Search** | Exact keyword lookup | No vector embeddings or fuzzy matching |
| **Test Coverage** | Basic unit tests | Missing integration, security, and gas tests |

---

## Unimplemented Features

### Critical (Required Before Production)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | **External Security Audit** | Internal audit complete, external audit pending | Partial |
| 2 | **Formal Verification** | Certora specs written, SMTChecker configured, verification pending | Partial |
| 3 | **Comprehensive Test Suite** | Current coverage ~30%, need 90%+ with fuzzing | Pending |
| 4 | **Enhanced Oracle Integration** | OracleRegistry and ChainlinkAdapter implemented; ZK proof verification pending | Partial |
| 5 | **Frontend/UI** | No user interface, contract interaction via scripts only | Pending |

### High Priority

| # | Feature | Description |
|---|---------|-------------|
| 6 | **LLM-Assisted Intent Parsing** | Spec mentions but not implemented - AI clarity checking |
| 7 | **Multi-Chain Deployment & Escrow** | Mentioned in threat model, currently single-chain only |
| 8 | **Vector Embeddings for Semantic Search** | Basic keyword matching only, no similarity search |
| 9 | **Monitoring Dashboard** | Events defined but no real-time monitoring |
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
| **95% Confidence Threshold** | `CONFIDENCE_THRESHOLD = 95` | `ExecutionAgent.sol:26` |
| **No Political Agency** | `_isProhibitedAction()` function | `ExecutionAgent.sol:293-308` |
| **Corpus Immutability** | `freezeCorpus()` with `isFrozen` flag | `LexiconHolder.sol:65-84` |
| **Inaction Default** | Return on `confidence < 95` | `ExecutionAgent.sol:138-141` |

---

## Technical Reference

For detailed technical information, see:

- **Architecture & Data Structures**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **API & Contract Functions**: [USAGE.md](USAGE.md)
- **System Interaction Flows**: [REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md)

---

## Summary

The Finite Intent Executor core contracts are implemented and functional. The system achieves its core design goals:

**Achieved:**
- Scope-bounded execution with 95% confidence threshold
- Mandatory 20-year sunset with public domain transition
- Default-to-inaction on ambiguity
- No political agency enforcement
- On-chain audit logging

**Key Gaps:**
- External security audit pending (internal audit complete)
- Limited testing coverage (~30%, need 90%+)
- No frontend/UI for users
- Oracle ZK proof verification pending (infrastructure complete)
- Basic keyword-based filtering (not LLM-based)

**Production Readiness:** Requires additional development in security, testing, and usability before mainnet deployment.

---

*This specification document consolidates information from all repository documentation. For detailed architecture see [ARCHITECTURE.md](ARCHITECTURE.md), for usage examples see [USAGE.md](USAGE.md).*
