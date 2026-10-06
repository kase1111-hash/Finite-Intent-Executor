# Finite Intent Executor (FIE)

A blockchain-based digital estate and posthumous intent execution system. FIE captures human intentions immutably on-chain and executes them autonomously after verified death triggers, with a mandatory 20-year sunset after which all assets transition to public domain.

## Core Principle

"FIE allows human intent to execute faithfully beyond life, without allowing power to outlive relevance."

## Tech Stack

- **Smart Contracts**: Solidity ^0.8.20 (compiled with 0.8.28), Hardhat 3, OpenZeppelin 5.4.0
- **Frontend**: React 19, Vite 6, ethers.js 6, Tailwind CSS 4
- **Testing**: Hardhat Test, Foundry (fuzzing), Certora (formal verification)
- **ZK Proofs**: Circom circuits with Groth16/PLONK verifiers

## Project Structure

```
contracts/                  # Smart contracts
├── IntentCaptureModule.sol # Captures intent and goals
├── TriggerMechanism.sol    # Activation mechanisms (deadman, quorum, oracle)
├── ExecutionAgent.sol      # Scope-bounded executor (95% confidence)
├── LexiconHolder.sol       # Semantic indexing and corpus
├── SunsetProtocol.sol      # 20-year termination
├── IPToken.sol             # ERC721 IP tokenization
├── libraries/              # ErrorHandler, PoliticalFilter
├── oracles/                # Oracle adapters (Chainlink, UMA, ZK)
└── verifiers/              # ZK proof verifiers

frontend/src/               # React dashboard
├── pages/                  # Dashboard, IntentCapture, TriggerConfig, MonitoringDashboard, etc.
├── context/                # Web3Context for wallet connection
└── contracts/              # Generated ABIs (abis.js), addresses, constants

indexer-service/            # Off-chain semantic indexer (TypeScript)
test/                       # Hardhat test suites (13 files)
foundry-tests/              # Foundry fuzz tests (7 files)
scripts/                    # Deployment and utility scripts
└── lib/deployFIE.js        # Deploys + wires the contracts (used by deploy.js and tests)
circuits/                   # Circom ZK circuits
```

## Common Commands

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test

# Deploy locally
npm run node          # Start local Hardhat node (separate terminal)
npm run deploy        # Deploy contracts to it (--network localhost)

# Frontend development (picks up the local deployment automatically;
# "Use Local Dev Account" connects without MetaMask)
cd frontend && npm run dev

# Regenerate the frontend ABIs after changing a contract's external interface
npm run export-abis

# Gas benchmarking
npm run test:gas

# Contract size report
npm run size
```

## Non-Negotiable Architectural Constraints

These values are hard-coded and immutable by design:

| Constraint | Value | Location |
|-----------|-------|----------|
| Sunset Duration | 20 years (7,300 days) | SunsetProtocol.sol:42, ExecutionAgent.sol:45 |
| Confidence Threshold | 95% | ExecutionAgent.sol:41 |
| Political Activity | Blocked entirely | ExecutionAgent.sol:165 (via PoliticalFilter.checkAction) |
| Corpus Immutability | Hash-locked after freeze | LexiconHolder.sol:88 |
| Default Behavior | Inaction if confidence < 95% | ExecutionAgent.sol:184 |

## Trigger Types

1. **Deadman Switch** - Activates after 30+ days of owner inactivity
2. **Trusted Quorum** - Requires M-of-N signatures (minimum 2)
3. **Oracle Verified** - Chainlink, UMA optimistic oracle, or ZK proofs

## Key Security Patterns

- ReentrancyGuard on all value transfers
- OpenZeppelin AccessControl for role management
- State-before-transfer pattern in payment functions
- Bounded loops (MAX_GOALS=50, MAX_ASSETS=100, MAX_ORACLES=10)
- ErrorHandler library with SIEM-compatible event formatting
- PoliticalFilter with multi-layer content detection

## Testing

```bash
npm test                    # All tests
npm run test:gas            # Gas benchmarks
npm run test:coverage       # Coverage report

# Foundry fuzzing (requires Foundry)
cd foundry-tests && forge test
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
PRIVATE_KEY=               # Deployer wallet
SEPOLIA_RPC_URL=           # For testnet deployment
ETHERSCAN_API_KEY=         # Contract verification
BOUNDARY_SIEM_ENDPOINT=    # Security monitoring (optional)
```

## Contract Roles

- `EXECUTOR_ROLE` - Can execute intents after trigger (ExecutionAgent)
- `ORACLE_ROLE` - Oracle adapters for death verification (ExecutionAgent)
- `INDEXER_ROLE` - Can freeze corpus, create indices, manage clusters (LexiconHolder)
- `SUNSET_OPERATOR_ROLE` - Can initiate sunset, archive assets (SunsetProtocol)
- `MINTER_ROLE` - Can mint new IP tokens (IPToken)

## Keeping the Pieces in Sync

- **Frontend ABIs** (`frontend/src/contracts/abis.js`) are generated from the
  compiled contracts. Never hand-edit them; run `npm run export-abis`.
  `test/FrontendAbis.test.js` fails when they drift.
- **Deployment wiring** (cross-contract role grants) lives only in
  `scripts/lib/deployFIE.js`. `test/Deployment.test.js` runs the full
  lifecycle on exactly that wiring.
- **Indexer ABI** (`indexer-service/src/submitter.ts`) is hand-written; event
  signatures must match `LexiconHolder.sol` exactly or events are never received.

## Important Notes

1. **Immutability by Design** - Core constraints (sunset, confidence threshold, political block) are deliberately non-upgradeable
2. **Revocability** - Intent creators can revoke anytime while alive
3. **Post-Sunset** - All assets become public domain (CC0), contracts become non-executable archives
4. **ZK Verification** - Death certificates verified via zero-knowledge proofs preserving privacy
5. **Corpus-Based Interpretation** - Ambiguous actions resolved against frozen corpus, not subjective interpretation

## License

CC0 1.0 Universal (Public Domain Dedication)
