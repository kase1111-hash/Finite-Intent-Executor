# Finite Intent Executor (FIE)

[![Version](https://img.shields.io/badge/Version-0.1.0--alpha-orange.svg)](https://github.com/kase1111-hash/Finite-Intent-Executor/releases)
[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](https://creativecommons.org/publicdomain/zero/1.0/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.0-yellow.svg)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4.0-blue.svg)](https://openzeppelin.com/)
[![Tests](https://img.shields.io/badge/Tests-Passing-green.svg)](./test)

> A **posthumous smart contract** system and **digital will executor** for blockchain-based intent execution after death

## Overview

The Finite Intent Executor (FIE) is a **digital estate automation** platform—a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously. Acting as a **dead man's switch contract**, it provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive. This **intent execution after death** system prioritizes verifiability, auditability, and resistance to drift, capture, or expansion while remaining fully revocable during the creator's lifetime.

Whether you need **blockchain will execution**, **automated digital legacy** management, or a **digital inheritance executor** for your crypto assets, FIE delivers **posthumous crypto management** with strict temporal bounds and comprehensive safeguards.

### Core Principle

**FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance.**

## What Problem Does This Solve?

- **What happens to crypto when you die?** FIE ensures your digital assets are managed according to your wishes through smart contracts that execute your intent posthumously.
- **Need a digital will smart contract?** FIE captures your goals, assets, and instructions in an immutable, cryptographically secure format.
- **Looking for posthumous blockchain execution?** The system activates only after verified death triggers (deadman switch, trusted quorum, or oracle verification).
- **Want a dead man's switch for cryptocurrency?** FIE implements a true dead man's wallet with automatic execution and mandatory 20-year sunset.

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy to local network
npm run node          # Terminal 1
npm run deploy        # Terminal 2
```

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org)
- **Git** (optional) - For version control

## Features

- **Immutable Intent Capture**: Cryptographically secure storage of goals, assets, and contextual corpus
- **Multiple Trigger Types**: Deadman switch, trusted quorum, or oracle-verified triggers
- **Scope-Bounded Execution**: AI executor with strict constraints and 95% confidence threshold
- **IP Tokenization**: ERC721 tokens for intellectual property with licensing and royalties
- **Mandatory Sunset**: Automatic termination after exactly 20 years
- **Public Domain Transition**: All assets move to CC0 or equivalent after sunset
- **Semantic Clustering**: Post-sunset grouping for cultural discoverability
- **No Political Agency**: Hard-coded prohibition on political activities
- **Full Auditability**: All decisions logged on-chain with corpus citations
- **Comprehensive Testing**: Unit, integration, fuzzing, and formal verification support

## Documentation

### Core Documentation

| Document | Description |
|----------|-------------|
| **[SPECIFICATION.md](SPECIFICATION.md)** | Core specification v1.1 with implementation status |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Technical architecture and design details |
| **[USAGE.md](USAGE.md)** | Comprehensive usage guide with examples |

### Technical Guides

| Document | Description |
|----------|-------------|
| **[ORACLE_INTEGRATION.md](ORACLE_INTEGRATION.md)** | Oracle infrastructure and verification protocols |
| **[FORMAL_VERIFICATION.md](FORMAL_VERIFICATION.md)** | Formal verification specs and critical invariants |
| **[REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md)** | System interaction flows and diagrams |

### Operations & Deployment

| Document | Description |
|----------|-------------|
| **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** | Pre-deployment verification checklist |
| **[OPERATIONS.md](OPERATIONS.md)** | Operations runbook: deployment, monitoring, troubleshooting |
| **[SECURITY.md](SECURITY.md)** | Security audit findings and best practices |

### Reference

| Document | Description |
|----------|-------------|
| **[CHANGELOG.md](CHANGELOG.md)** | Version history and release notes |
| **[REFOCUS_PLAN.md](REFOCUS_PLAN.md)** | Phased plan to close spec-to-implementation gaps |
| **[Frontend README](frontend/README.md)** | React dashboard documentation |

## Smart Contracts

### Core Contracts (6)

| Contract | Purpose | Key Features |
|----------|---------|--------------|
| **IntentCaptureModule** | Captures and stores intent | Immutable storage, multi-version signing, revocability |
| **TriggerMechanism** | Manages trigger conditions | Deadman switch, quorum, enhanced oracle + ZK support |
| **ExecutionAgent** | Executes posthumous intent | Scope-bounded, 95% confidence, political filter |
| **LexiconHolder** | Semantic indexing | Non-actuating, corpus resolution, clustering |
| **SunsetProtocol** | 20-year termination | Asset archival, public domain transition |
| **IPToken** | IP tokenization | ERC721, licensing, royalties, public domain |

### Oracle Infrastructure (6)

| Contract | Purpose |
|----------|---------|
| **IOracle** | Standard oracle interface |
| **OracleRegistry** | Multi-oracle consensus with reputation tracking |
| **ChainlinkAdapter** | Chainlink Any API integration |
| **UMAAdapter** | UMA Optimistic Oracle with dispute resolution |
| **ZKVerifierAdapter** | Zero-knowledge proof verification |
| **TrustedIssuerRegistry** | Certificate authority registry for ZK verification |

### Libraries (2)

| Contract | Purpose |
|----------|---------|
| **ErrorHandler** | Standardized error codes and SIEM-compatible event formatting |
| **PoliticalFilter** | Multi-layer political content detection and filtering |

### Verifiers (2)

| Contract | Purpose |
|----------|---------|
| **Groth16Verifier** | On-chain Groth16 proof verification |
| **PlonkVerifier** | On-chain PLONK proof verification |

## Architecture

```
Intent Capture → Trigger → Execution Agent → Sunset Protocol
                    ↓            ↓                ↓
              Lexicon Holder  IP Tokens    Public Archive
                    ↑
            Oracle Registry ← Chainlink/UMA/ZK Verifiers
```

### Frontend Dashboard

A React-based web dashboard (`frontend/`) provides:
- **Dashboard**: Overview of intent status, trigger config, and sunset countdown
- **Intent Capture**: Create and manage posthumous intent with goals
- **Trigger Configuration**: Set up deadman switch, quorum, or oracle triggers
- **IP Token Management**: Mint ERC721 tokens, manage licenses
- **Execution Monitor**: Monitor posthumous execution
- **Sunset Status**: Track 20-year countdown and public domain transition
- **Lexicon Holder**: Freeze corpus and create semantic indices

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed component design and [REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md) for system interaction flows.

## Usage

See [USAGE.md](USAGE.md) for comprehensive usage guide including:
- Installation and deployment
- Intent capture and goal definition
- Trigger configuration (deadman, quorum, oracle)
- IP tokenization and licensing
- Execution workflows
- Sunset process

## Security

**Audit Status:** Internal review completed (2025-12-23). External audit pending.

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 4 | All Fixed |
| High | 9 | 9 Fixed |
| Medium | 12 | 8 Fixed, 4 Acknowledged |
| Low | 6 | 2 Fixed, 4 Acknowledged |

**Key Security Features**:
- 95% confidence threshold for all actions (immutable)
- Default to inaction if ambiguity cannot be resolved
- No Political Agency Clause (hard-coded prohibition)
- Immutable cryptographic corpus hashes
- On-chain logging of all decisions with citations
- Revocability while creator is alive
- Hard-coded 20-year sunset (non-configurable)
- ReentrancyGuard on all value transfers
- Access control via OpenZeppelin roles

See [SECURITY.md](SECURITY.md) for detailed audit findings and [ARCHITECTURE.md](ARCHITECTURE.md) for threat mitigation.

## Technology Stack

### Smart Contracts
- **Solidity ^0.8.20** - Smart contract language (compiled with 0.8.20 via Hardhat)
- **Hardhat 2.22.0** - Development framework with SMTChecker
- **OpenZeppelin 5.4.0** - Security-audited contract libraries

### Frontend Dashboard
- **React 19.0.0** - UI framework
- **Vite 6.2.0** - Build tool with code splitting
- **ethers.js 6.16.0** - Ethereum interaction
- **Tailwind CSS 3.3.6** - Styling

### Testing & Verification
- **Hardhat Test** - Unit and integration tests
- **Foundry** - Fuzzing tests with invariant checking
- **Certora Prover** - Formal verification
- **SMTChecker** - Built-in Solidity verification
- **Circom** - Zero-knowledge circuits

## Testing

Run the comprehensive test suite:

```bash
# Unit and integration tests
npm test

# Gas benchmarking
npx hardhat test test/GasBenchmark.test.js

# Fuzzing tests (requires Foundry)
forge test --fuzz-runs 1000

# Formal verification (requires Certora)
./certora/run_verification.sh
```

### Test Coverage
- **9 test files** covering all core contracts
- **Unit tests** for individual contract functions
- **Integration tests** for complete workflows
- **Gas benchmarks** for cost optimization
- **Fuzzing tests** for edge case discovery

## Contributing

Contributions are welcome! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

**Quick Start:**

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

See the [Contributing Guide](CONTRIBUTING.md) for coding standards, testing requirements, and security considerations.

## License

This project is dedicated to the public domain under the CC0 1.0 Universal license - see the [LICENSE](LICENSE) file for details. All code is contributed to the public domain, aligning with FIE's core principle that all assets transition to public domain after the 20-year sunset period.

## Part of the NatLangChain Ecosystem

Finite Intent Executor is part of a broader ecosystem of projects focused on **natural language programming**, **intent preservation**, **digital sovereignty**, and the **authenticity economy**—valuing human cognitive labor and human-AI collaboration.

### NatLangChain Ecosystem

| Repository | Description |
|------------|-------------|
| [NatLangChain](https://github.com/kase1111-hash/NatLangChain) | Prose-first, intent-native blockchain protocol for recording human intent in natural language |
| [IntentLog](https://github.com/kase1111-hash/IntentLog) | Git for human reasoning—tracks "why" changes happen via prose commits |
| [RRA-Module](https://github.com/kase1111-hash/RRA-Module) | Revenant Repo Agent: Converts abandoned repositories into autonomous AI agents for licensing |
| [mediator-node](https://github.com/kase1111-hash/mediator-node) | LLM mediation layer for matching, negotiation, and closure proposals |
| [ILR-module](https://github.com/kase1111-hash/ILR-module) | IP & Licensing Reconciliation: Dispute resolution for intellectual property conflicts |

### Agent-OS Ecosystem

| Repository | Description |
|------------|-------------|
| [Agent-OS](https://github.com/kase1111-hash/Agent-OS) | Natural-language native operating system for AI agents (NLOS) |
| [synth-mind](https://github.com/kase1111-hash/synth-mind) | NLOS-based agent with psychological modules for emergent continuity and empathy |
| [boundary-daemon-](https://github.com/kase1111-hash/boundary-daemon-) | Trust enforcement layer defining cognition boundaries for Agent OS |
| [memory-vault](https://github.com/kase1111-hash/memory-vault) | Secure, offline-capable, owner-sovereign storage for cognitive artifacts |
| [value-ledger](https://github.com/kase1111-hash/value-ledger) | Economic accounting layer for cognitive work (ideas, effort, novelty) |
| [learning-contracts](https://github.com/kase1111-hash/learning-contracts) | Safety protocols for AI learning and data management |
| [Boundary-SIEM](https://github.com/kase1111-hash/Boundary-SIEM) | Security Information and Event Management for AI systems |

### Games & Creative Projects

| Repository | Description |
|------------|-------------|
| [Shredsquatch](https://github.com/kase1111-hash/Shredsquatch) | 3D first-person snowboarding infinite runner (SkiFree homage) |
| [Midnight-pulse](https://github.com/kase1111-hash/Midnight-pulse) | Procedurally generated night drive experience |
| [Long-Home](https://github.com/kase1111-hash/Long-Home) | Atmospheric indie game built with Godot |

---

**Version:** 0.1.0-alpha | **Last Updated:** 2026-01-10
