# Finite Intent Executor (FIE)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.22.0-yellow.svg)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4.0-blue.svg)](https://openzeppelin.com/)

> Blockchain-based posthumous intent execution with strict temporal bounds and safeguards

## Overview

The Finite Intent Executor (FIE) is a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously, with strict bounds on duration, scope, and agency. It provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive. The design prioritizes verifiability, auditability, and resistance to drift, capture, or expansion while remaining fully revocable during the creator's lifetime.

### Core Principle

**FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance.**

## Quick Start

### Windows (Easy Setup)

**Double-click `setup.bat`** or run in PowerShell:

```powershell
.\setup.ps1
```

This will:
- Check prerequisites (Node.js 18+)
- Install all dependencies
- Compile smart contracts
- Set up the frontend

**After setup, use these helper scripts:**

| Script | Description |
|--------|-------------|
| `dev.bat` | Start full development environment (recommended) |
| `start-node.bat` | Start Hardhat blockchain node |
| `start-frontend.bat` | Start React frontend dev server |
| `deploy.bat` | Deploy contracts to local network |
| `run-tests.bat` | Run smart contract tests |

### Linux/macOS

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
- **Python 3** (optional) - For license suggester tool

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
- **License Suggester** *(Optional)*: AI-powered tool to suggest appropriate licenses before tokenizing IP

## Optional Tools

### License Suggester

An **optional helper tool** that uses local AI (Ollama) to suggest appropriate licenses for your intellectual property before minting it as an ERC721 token on the blockchain.

```bash
# Quick start (requires Ollama + Python)
ollama pull llama3.2
pip install -r requirements.txt
npm run suggest-license -- path/to/your/file.txt
```

**Features**:
- Analyzes code, text, art, music, and other IP
- Suggests licenses compatible with blockchain and 20-year sunset
- Completely private (runs locally)
- Optional - provides suggestions only, not legal advice

See **[LICENSE_SUGGESTER.md](LICENSE_SUGGESTER.md)** for detailed setup and usage.

## Documentation

| Document | Description |
|----------|-------------|
| **[SPECIFICATION.md](SPECIFICATION.md)** | Core specification v1.1 with implementation status |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Technical architecture and design details |
| **[USAGE.md](USAGE.md)** | Comprehensive usage guide with examples |
| **[ORACLE_INTEGRATION.md](ORACLE_INTEGRATION.md)** | Oracle infrastructure and verification protocols |
| **[SECURITY.md](SECURITY.md)** | Security audit findings and best practices |
| **[FORMAL_VERIFICATION.md](FORMAL_VERIFICATION.md)** | Formal verification specs and critical invariants |
| **[LICENSE_SUGGESTER.md](LICENSE_SUGGESTER.md)** | Optional AI-powered license suggestion tool |
| **[REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md)** | System interaction flows and diagrams |
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
| High | 9 | 5 Fixed, 4 Acknowledged |
| Medium | 12 | Acknowledged |
| Low | 6 | Acknowledged |

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
- **Solidity 0.8.28** - Smart contract language
- **Hardhat 2.22.0** - Development framework with SMTChecker
- **OpenZeppelin 5.4.0** - Security-audited contract libraries

### Frontend Dashboard
- **React 19.0.0** - UI framework
- **Vite 6.2.0** - Build tool with code splitting
- **ethers.js 6.16.0** - Ethereum interaction
- **Tailwind CSS 3.3.6** - Styling

### Verification Infrastructure
- **Circom** - Zero-knowledge circuits
- **Certora Prover** - Formal verification
- **SMTChecker** - Built-in Solidity verification

### Optional Tools
- **Ollama** - Local AI for license suggestions
- **Python 3** - License suggester script

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Last Updated: 2026-01-01*
