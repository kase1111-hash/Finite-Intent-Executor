# Oracle Infrastructure (Optional Extensions)

These contracts are **optional extensions** for production oracle integration.
The core FIE system (6 contracts + PoliticalFilter) works without them.

## What's here

| Contract | Lines | Purpose | Status |
|----------|-------|---------|--------|
| IOracle.sol | 114 | Standard interface for all oracle adapters | Interface only |
| ChainlinkAdapter.sol | 367 | Chainlink Any API integration | Implemented; requires live Chainlink node |
| UMAAdapter.sol | 522 | UMA Optimistic Oracle with dispute flow | Implemented; requires live UMA testnet/mainnet |
| ZKVerifierAdapter.sol | 661 | Zero-knowledge proof verification | Groth16/PLONK working; **STARK unimplemented** |
| OracleRegistry.sol | 403 | Multi-oracle aggregation and consensus | Implemented; reputation tracking included |
| TrustedIssuerRegistry.sol | 423 | Certificate authority registry for ZK proofs | Implemented |
| IZKVerifier.sol | 139 | ZK verifier interface (Groth16/PLONK/STARK) | Interface only |

**Total: ~2,630 lines** (more than the 6 core contracts combined).

## How the core system works without these

The `TriggerMechanism` contract supports three trigger modes:

1. **Deadman switch** — creator stops checking in after a configured interval
2. **Trusted quorum** — N-of-M trusted signers confirm the trigger event
3. **Oracle-verified** — delegates to an oracle adapter (this directory)

Modes 1 and 2 require no oracle infrastructure. Mode 3 is where these
contracts plug in.

The `ExecutionAgent` does not interact with oracles at all. Confidence
scores come from `LexiconHolder`, which receives them from the off-chain
indexer service via `submitResolution()`.

## Known limitations

- **STARK verification is unimplemented.** `ZKVerifierAdapter` falls back to
  `_verifyPlaceholder()` for STARK proofs. This is guarded by an
  `allowPlaceholderVerification` flag that MUST be `false` in production.
- **No end-to-end oracle test in CI.** Chainlink and UMA adapters are fully
  coded but not exercised against real oracle networks in any integration test.
  They require live testnet infrastructure.
- **OracleRegistry reputation is untested at scale.** The reputation tracking
  mechanism works in unit tests but has not been validated with real oracle
  response distributions.

## When to use these

Use these contracts when deploying FIE with oracle-verified triggers (mode 3):

- **ChainlinkAdapter**: For Chainlink Any API integration with off-chain
  death certificate verification services.
- **UMAAdapter**: For UMA Optimistic Oracle integration with economic security
  (dispute bonds).
- **ZKVerifierAdapter**: For zero-knowledge proof verification of death
  certificates, medical documents, or legal rulings without revealing document
  contents on-chain.

For alpha/testnet deployments, deadman switch or trusted quorum triggers
are sufficient and don't require this infrastructure.
