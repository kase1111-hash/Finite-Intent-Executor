# Finite Intent Executor (FIE)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)

> Blockchain-based posthumous intent execution with strict temporal bounds and safeguards

## Overview

The Finite Intent Executor (FIE) is a modular, blockchain-based system for capturing and executing an individual's predefined intent posthumously, with strict bounds on duration, scope, and agency. It provides high-fidelity continuity of values, projects, and assets for exactly 20 years after trigger, then automatically sunsets into a non-executable public archive. The design prioritizes verifiability, auditability, and resistance to drift, capture, or expansion while remaining fully revocable during the creator's lifetime.

### Core Principle

**FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance.**

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

- **[USAGE.md](USAGE.md)**: Complete usage guide with examples
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: Technical architecture and design details
- **[LICENSE_SUGGESTER.md](LICENSE_SUGGESTER.md)**: Optional license suggestion tool guide
- **[REPOSITORY_INTERACTION_DIAGRAM.md](REPOSITORY_INTERACTION_DIAGRAM.md)**: System interaction diagrams
- **[Specification](#specification-v11)**: Original specification (below)

## Smart Contracts

| Contract | Purpose | Key Features |
|----------|---------|--------------|
| **IntentCaptureModule** | Captures and stores intent | Immutable storage, multi-version signing, revocability |
| **TriggerMechanism** | Manages trigger conditions | Deadman switch, quorum, oracle verification |
| **ExecutionAgent** | Executes posthumous intent | Scope-bounded, 95% confidence, political filter |
| **LexiconHolder** | Semantic indexing | Non-actuating, corpus resolution, clustering |
| **SunsetProtocol** | 20-year termination | Asset archival, public domain transition |
| **IPToken** | IP tokenization | ERC721, licensing, royalties, public domain |

## Architecture

```
Intent Capture → Trigger → Execution Agent → Sunset Protocol
                    ↓            ↓                ↓
              Lexicon Holder  IP Tokens    Public Archive
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design.

## Installation

### Prerequisites

- Node.js v16+ and npm
- Hardhat development environment

### Setup

```bash
git clone https://github.com/your-username/Finite-Intent-Executor.git
cd Finite-Intent-Executor
npm install
```

### Compile

```bash
npm run compile
```

### Test

```bash
npm test
```

### Deploy

```bash
# Local deployment
npx hardhat node                          # Terminal 1
npx hardhat run scripts/deploy.js         # Terminal 2

# Network deployment
npx hardhat run scripts/deploy.js --network <network-name>
```

Deployment addresses are saved to `deployment-addresses.json`.

## Usage Example

```javascript
// 1. Capture intent
await intentModule.captureIntent(
  intentHash,
  corpusHash,
  "ipfs://corpus-uri",
  "ipfs://assets-uri",
  2020,
  2028,
  [assetAddress1, assetAddress2]
);

// 2. Configure trigger
await triggerMechanism.configureDeadmanSwitch(90 * 24 * 60 * 60); // 90 days

// 3. Mint IP tokens
await ipToken.mintIP(
  creatorAddress,
  "My Life's Work",
  "Important research",
  "article",
  contentHash,
  "ipfs://metadata-uri",
  "CC-BY-4.0"
);

// 4. After trigger, execution begins
// 5. After 20 years, automatic sunset to public domain
```

See [USAGE.md](USAGE.md) for comprehensive examples.

## Security

### Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Oracle failure | Conservative halt (default to inaction) |
| LLM misalignment | Hard scope-bounded APIs, 95% confidence |
| Chain failure | Multi-chain deployment capability |
| Corpus poisoning | Immutable cryptographic hashes |
| Key compromise | Revocation while alive |
| Political capture | No Political Agency Clause |
| Indefinite execution | Hard-coded 20-year sunset |

### Auditing

All decisions are logged on-chain with:
- Action taken
- Corpus citation
- Confidence score
- Timestamp
- Decision hash

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

# Specification v1.1
Components

Intent Capture Module
Captures assets (tokenized IP, funds, keys, rights), goals, constraints, and a time-boxed contextual corpus (5–10 year window centered on capture date).
Output: Immutable intent graph stored on-chain with cryptographic commitments.
LLM-assisted parsing for clarity; creator signs all versions.

Trigger Mechanism
Deadman switch, trusted-signature quorum, or verified oracles (e.g., medical/legal events via zero-knowledge proofs).
Atomic, irreversible transfer of control upon valid trigger.

Execution Agent
Narrow, scope-bounded AI executor.
Capabilities: License assets, collect and distribute revenue, fund aligned projects, enforce constraints via smart contracts.
Interpretation: All ambiguous terms resolved exclusively via retrieval-augmented generation against the frozen contextual corpus.
Ambiguity Resolution Failure Mode: If intent cannot be resolved with ≥95% confidence through corpus citation, the Execution Agent MUST permanently default to inaction for the affected operation or branch. No speculative or creative interpretation permitted.
No Political Agency Clause: The FIE MAY NOT engage in electoral activity, political advocacy, lobbying, or policy influence beyond passive licensing of the creator’s authored works.
All decisions logged on-chain with corpus citations.

Lexicon Holders
Definition: Lexicon holders are non-actuating semantic indexers. They possess no authority to initiate, modify, veto, or otherwise influence execution. Their sole functions are (a) providing interpretive citations from the frozen corpus during active execution and (b) post-sunset clustering of archived legacies.
Operated via decentralized protocols or neutral LLM instances; no centralized control.

Sunset Protocol
Mandatory termination exactly 20 years after trigger date (fixed, non-configurable).
Halts all execution.
Migrates all assets and IP to permanent decentralized storage.
Post-Sunset Asset State: All IP assets SHALL transition to public-domain-equivalent licensing (CC0 or equivalent) or a neutral stewardship license that prohibits exclusive re-enclosure.
Automated clustering: Embeddings group the legacy with semantically similar archived intents for discoverability and cultural remix.
Fully automated via lexicon holders; no human curation.


Features & Safeguards

Drift Resistance: Interpretation locked to time-boxed corpus.
Transparency & Auditability: All triggers, decisions, logs, and sunsets on-chain.
Revocability: Complete while alive via private key.
Self-Funding: Endowed treasuries cover operational costs.
Fork Neutrality: Post-sunset forks or adaptations by third parties are unmanaged and outside FIE scope.

Threat Model (Minimal)

Oracle failure → conservative halt (default to inaction).
LLM misalignment → hard scope-bounded APIs and confidence thresholds.
Chain failure → multi-chain escrow with automated fallback.
Corpus poisoning → immutable cryptographic snapshot hashes.
Key compromise while alive → immediate revocation and reissue.

Implementation Notes

Compatible with mature blockchain ecosystems supporting tokenization, smart contracts, and decentralized storage.
Core design remains deliberately simple to enable formal verification and broad adoption.

This revised specification turns the problem of posthumous intent from an intractable trust problem into a solvable systems problem—delivering finite, inspectable, enforceable continuity without creating unkillable power structures.
