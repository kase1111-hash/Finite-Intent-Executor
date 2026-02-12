# ZK Verifiers (Auto-Generated)

These Solidity contracts are **auto-generated** from Circom circuits by
snarkjs. Do not edit them manually.

| Contract | Lines | Proof System | Source |
|----------|-------|-------------|--------|
| Groth16Verifier.sol | 460 | Groth16 | `circuits/` via `scripts/zk/build_circuits.sh` |
| PlonkVerifier.sol | 750 | PLONK | `circuits/` via `scripts/zk/build_circuits.sh` |

## Regeneration

To regenerate these verifiers from circuits:

```bash
cd scripts/zk
./build_circuits.sh
```

This requires the Circom toolchain (circom, snarkjs) and will:
1. Compile `.circom` source files to WASM + R1CS
2. Generate zkey files from a Powers of Tau ceremony
3. Export Solidity verifier contracts to this directory

## Notes

- The `.circom` source files are defined in `circuits/circuits.json` but are
  not committed to this repository. Only the generated verifiers are checked in.
- These verifiers are consumed by `contracts/oracles/ZKVerifierAdapter.sol`.
- **STARK verifier does not exist.** Only Groth16 and PLONK are supported.
  STARK support in `ZKVerifierAdapter` falls back to a guarded placeholder.
- These contracts are part of the optional oracle infrastructure and are not
  required for the core FIE system.
