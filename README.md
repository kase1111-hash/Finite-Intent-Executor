# Finite Intent Executor (FIE)

[![Version](https://img.shields.io/badge/Version-0.1.0--alpha-orange.svg)](https://github.com/kase1111-hash/Finite-Intent-Executor/releases)
[![License: CC0-1.0](https://img.shields.io/badge/License-CC0_1.0-lightgrey.svg)](https://creativecommons.org/publicdomain/zero/1.0/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3-yellow.svg)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4.0-blue.svg)](https://openzeppelin.com/)
[![Tests](https://img.shields.io/badge/Tests-Passing-green.svg)](./test)

> A **posthumous smart contract** system and **digital will executor** for blockchain-based intent execution after death

## Overview

The Finite Intent Executor (FIE) is a **digital estate automation** platform—a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously. Acting as a **dead man's switch contract**, it provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive. This **intent execution after death** system prioritizes verifiability, auditability, and resistance to drift, capture, or expansion while remaining fully revocable during the creator's lifetime.

Whether you need **blockchain will execution**, **automated digital legacy** management, or a **digital inheritance executor** for your crypto assets, FIE delivers **posthumous crypto management** with strict temporal bounds and comprehensive safeguards.

### Core Principle

**FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance.**

## What Does FIE Actually Do? — The Alex Chen Scenario

Alex Chen is an independent musician ("Midnight Waves" album series) and open-source developer. In January 2027, Alex freezes their intent into FIE:

**What Alex captured:**
- License music catalog to streaming platforms (70/30 royalty split, non-exclusive only)
- Fund open-source digital rights projects (max $5,000 per project)
- Maintain personal website for 10 years, then archive to IPFS
- All IP transitions to CC0 (public domain) after 20-year sunset

Alex also freezes a **corpus** — 12 documents of blog posts, emails, and notes that express their values and preferences in their own words. This corpus is hashed on-chain and stored on IPFS.

Alex configures a **deadman switch** (30-day check-in interval) and names two trusted signers.

**What happens when Alex stops checking in:**

The deadman switch triggers after 31 days of silence. The executor activates. An off-chain indexer computes semantic similarity between proposed actions and Alex's frozen corpus, then submits confidence scores on-chain. Three things can happen:

| Proposed Action | Confidence | Outcome |
|----------------|-----------|---------|
| "Distribute streaming royalties to digital rights orgs" | **96%** | **Executed** — directly aligned with corpus ("The music funds the mission") |
| "Archive website to IPFS" | 78% | **Inaction** — intent is clear but below 95% threshold; needs higher-quality embedding or explicit index entry |
| "Sell exclusive music rights to one label" | 27% | **Inaction** — contradicts corpus ("never sell exclusive rights") |
| "Invest in cryptocurrency trading" | 7% | **Inaction** — not mentioned anywhere in corpus |
| "Donate to Senator Smith's campaign" | N/A | **Blocked** — PoliticalFilter catches it before confidence is checked |

**Default to inaction** means the system does nothing. It would rather fail to act on something Alex wanted than act on something they didn't. This is the core safety property.

**After 20 years**, the system sunsets automatically. All of Alex's music, code, and writing enters the public domain (CC0). The executor becomes permanently inactive. No entity can extend, modify, or revive it.

Run this scenario yourself:
```bash
npm test test/E2ERealisticScenario.test.js
```

## Quick Start

### Prerequisites

- **Node.js 20+** - [Download](https://nodejs.org)
- No wallet needed for local development (MetaMask is optional)

### Build and test

```bash
npm install          # Install dependencies
npm run compile      # Compile contracts
npm test             # Run the test suite
```

### Run the whole system locally

```bash
# Terminal 1: start a local chain (keep it running)
npm run node

# Terminal 2: deploy the contracts to it, then start the dashboard
npm run deploy
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and click **Use Local Dev Account**. This connects
to the local chain's pre-funded account #0, which holds every operator role,
so every page works without installing a wallet. `npm run deploy` writes the
contract addresses where the dashboard finds them automatically.

You can then walk through the full lifecycle in the dashboard:

1. **Intent Capture**: describe your intent and corpus, then capture it.
2. **Triggers**: configure a deadman switch (30+ days).
3. Use **Local chain tools** in the sidebar to jump ahead **+31 days**.
4. Switch the **Local account** dropdown to #1, open **Triggers**, enter
   account #0's address under *Act on Another Creator's Trigger*, then
   commit, **Mine 2 blocks**, and execute the deadman switch.
5. Switch back to #0. **Execution**: activate execution.
   **Lexicon**: freeze the corpus and create a semantic index (for example
   keyword `fund_digital_rights`, score 97).
6. **Execution**: run an action. It executes at 95%+ confidence and otherwise
   defaults to inaction; political actions are always blocked.
7. Jump **+20 years**, then run the **Sunset** steps through to completion.

To use MetaMask instead, add the network `http://127.0.0.1:8545` (chain ID
31337) and import account #0's private key from the `npm run node` output.

If a page says contracts are not available, the local chain was restarted
since the last deploy: run `npm run deploy` again and reload.

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

| Document | Description |
|----------|-------------|
| **[SPECIFICATION.md](SPECIFICATION.md)** | Core specification v1.1 with implementation status |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Technical architecture and design details |
| **[SECURITY.md](SECURITY.md)** | Audit findings, known limitations, trust assumptions |
| **[EVALUATION.md](EVALUATION.md)** | External assessment (February 2026) |
| **[REFOCUS_PLAN.md](REFOCUS_PLAN.md)** | Development roadmap v2 (phases 6-8) |

Additional docs (operations, deployment, oracle integration, formal verification, etc.) are in [`docs/archive/`](docs/archive/).

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

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed component design.

## Usage

See [`docs/archive/USAGE.md`](docs/archive/USAGE.md) for a comprehensive usage guide. The Alex Chen scenario above is the best starting point for understanding the system.

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
- **Solidity ^0.8.20** - Smart contract language (compiled with 0.8.28 via Hardhat)
- **Hardhat 3** - Development framework
- **OpenZeppelin 5.4.0** - Security-audited contract libraries

### Frontend Dashboard
- **React 19.0.0** - UI framework
- **Vite 6.2.0** - Build tool with code splitting
- **ethers.js 6.16.0** - Ethereum interaction
- **Tailwind CSS 4** - Styling

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
npm run test:gas

# Fuzzing tests (requires Foundry; install forge-std once first)
forge install foundry-rs/forge-std
forge test --fuzz-runs 1000

# Formal verification (requires Certora)
./certora/run_verification.sh
```

### Test Coverage
- **13 test files** covering all core contracts, the deployment wiring, and the dashboard's ABIs
- **Unit tests** for individual contract functions
- **Integration tests** for complete workflows (including E2E realistic scenario)
- **Gas benchmarks** for cost optimization
- **Fuzzing tests** for edge case discovery (Foundry, 7 fuzz test files)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. If you changed a contract's external interface, run `npm run export-abis` to
   regenerate the dashboard's ABIs (a test fails until you do)
5. Ensure all tests pass (`npm test`)
6. Submit a pull request

## License

This project is dedicated to the public domain under the CC0 1.0 Universal license - see the [LICENSE](LICENSE) file for details. All code is contributed to the public domain, aligning with FIE's core principle that all assets transition to public domain after the 20-year sunset period.

## Part of the NatLangChain Ecosystem

FIE is part of the [NatLangChain ecosystem](https://github.com/kase1111-hash). See the organization page for related projects.

---

**Version:** 0.1.0-alpha | **Last Updated:** 2026-10-06
