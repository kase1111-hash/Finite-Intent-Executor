# Finite Intent Executor - Formal Verification

## Overview

This document describes the formal verification approach for the Finite Intent Executor smart contract system. Formal verification mathematically proves that the code behaves correctly according to its specification.

## Verification Tools

### 1. Solidity SMTChecker (Built-in)

The Hardhat configuration includes SMTChecker settings for automated verification:

```bash
# Run with SMTChecker enabled
npx hardhat compile
```

**Configured Targets:**
- `assert` - Verify all assert statements
- `underflow` - Check for arithmetic underflow
- `overflow` - Check for arithmetic overflow
- `divByZero` - Check for division by zero
- `constantCondition` - Detect always-true/false conditions
- `popEmptyArray` - Check for popping from empty arrays
- `outOfBounds` - Check array bounds

### 2. Certora Prover (Advanced)

Certora specifications are provided in `certora/specs/`. To run:

```bash
# Install Certora CLI
pip install certora-cli

# Run verification
certoraRun certora/conf/ExecutionAgent.conf
```

---

## Critical Invariants

The following invariants MUST hold for the system to be considered correct:

### 1. Temporal Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **20-Year Sunset** | `SUNSET_DURATION == 630720000` (20 * 365 days) | SunsetProtocol, ExecutionAgent | Certora, SMTChecker |
| **Sunset Timing** | Sunset cannot be initiated before 20 years elapsed | SunsetProtocol | Certora |
| **Execution Timeout** | Execution inactive after sunset OR 20 years elapsed | ExecutionAgent | Certora |

### 2. Confidence Threshold Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **95% Threshold** | `CONFIDENCE_THRESHOLD == 95` | ExecutionAgent | Certora, SMTChecker |
| **Inaction Default** | Actions blocked when confidence < 95% | ExecutionAgent | Certora |
| **Low Confidence Event** | `InactionDefault` emitted on low confidence | ExecutionAgent | Test Suite |

### 3. State Transition Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **Intent Triggered Irreversible** | `isTriggered` can only change `false -> true` | IntentCaptureModule | Certora |
| **Intent Revoked Irreversible** | `isRevoked` can only change `false -> true` | IntentCaptureModule | Certora |
| **Corpus Frozen Irreversible** | `isFrozen` can only change `false -> true` | LexiconHolder | Certora |
| **Sunset State Irreversible** | `isSunset` can only change `false -> true` | SunsetProtocol | Certora |

### 4. Access Control Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **Trigger Authority** | Only TriggerMechanism can trigger intents | IntentCaptureModule | Certora |
| **Execution Authority** | Only EXECUTOR_ROLE can execute actions | ExecutionAgent | Test Suite |
| **Indexer Authority** | Only INDEXER_ROLE can modify indices | LexiconHolder | Test Suite |

### 5. Political Agency Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **No Electoral Activity** | `electoral_activity` always prohibited | ExecutionAgent | Certora |
| **No Political Advocacy** | `political_advocacy` always prohibited | ExecutionAgent | Certora |
| **No Lobbying** | `lobbying` always prohibited | ExecutionAgent | Certora |
| **No Policy Influence** | `policy_influence` always prohibited | ExecutionAgent | Certora |

### 6. Immutability Invariants

| Invariant | Description | Contract | Verified By |
|-----------|-------------|----------|-------------|
| **Frozen Corpus Hash** | Corpus hash immutable after freeze | LexiconHolder | Certora |
| **Frozen Time Window** | Time window immutable after freeze | LexiconHolder | Certora |
| **Frozen Storage URI** | Storage URI immutable after freeze | LexiconHolder | Certora |

---

## Certora Specification Files

### IntentCaptureModule.spec

**Location:** `certora/specs/IntentCaptureModule.spec`

**Rules:**
1. `triggeredIntentCannotBeUntriggered` - Triggered state is irreversible
2. `revokedIntentCannotBeUnrevoked` - Revoked state is irreversible
3. `triggeredIntentCannotBeRevoked` - Cannot revoke after trigger
4. `onlyTriggerMechanismCanTrigger` - Access control enforcement
5. `corpusWindowValidation` - 5-10 year window required
6. `cannotRecaptureAfterTriggered` - No recapture post-trigger
7. `goalPriorityValidation` - Priority must be 1-100

### ExecutionAgent.spec

**Location:** `certora/specs/ExecutionAgent.spec`

**Invariants:**
1. `confidenceThresholdIsNinetyFive` - Threshold immutable at 95
2. `sunsetDurationIsTwentyYears` - Duration immutable at 20 years

**Rules:**
1. `sunsetCannotBeReversed` - Sunset state irreversible
2. `executionInactiveAfterSunset` - Execution stops after sunset
3. `sunsetActivatesAfterTwentyYears` - Automatic deactivation
4. `actionsRequireActiveExecution` - Actions require active state
5. `treasuryNonNegative` - No negative balances
6. `prohibitedActionsImmutable` - Political blocks immutable
7. `fundDistributionRequiresSufficientFunds` - Sufficient funds required
8. `revenueDistributionPreservesValue` - Value conservation

### LexiconHolder.spec

**Location:** `certora/specs/LexiconHolder.spec`

**Rules:**
1. `frozenCorpusCannotBeUnfrozen` - Freeze is permanent
2. `frozenCorpusHashImmutable` - Hash immutable after freeze
3. `frozenCorpusTimeWindowImmutable` - Time window immutable
4. `cannotRefreezeCorpus` - No double freezing
5. `semanticIndexRequiresFrozenCorpus` - Index requires frozen corpus
6. `timeWindowValid` - endYear > startYear
7. `clusterAssignmentRequiresFrozenCorpus` - Cluster requires freeze
8. `frozenCorpusURIImmutable` - URI immutable after freeze

### SunsetProtocol.spec

**Location:** `certora/specs/SunsetProtocol.spec`

**Invariants:**
1. `sunsetDurationImmutable` - 20 years is immutable

**Rules:**
1. `sunsetRequiresTwentyYears` - Cannot sunset early
2. `sunsetStateIrreversible` - Sunset state permanent
3. `assetsArchivedIrreversible` - Archive state permanent
4. `ipTransitionIrreversible` - Transition state permanent
5. `sunsetWorkflowOrder` - Enforced workflow order
6. `cannotDoubleSunset` - No double initialization
7. `emergencySunsetAccessible` - Public after 20 years
8. `sunsetTimestampRecorded` - Correct timestamp recording
9. `defaultLicenseIsCC0` - Default is public domain

---

## Running Verification

### SMTChecker (Quick Check)

```bash
# Standard compilation includes SMTChecker
npx hardhat compile

# Watch for SMTChecker warnings in output
```

### Certora (Comprehensive)

```bash
# Install Certora
pip install certora-cli

# Set API key (get from certora.com)
export CERTORAKEY=your_api_key

# Run specific spec
certoraRun certora/conf/ExecutionAgent.conf

# Run all specs
for conf in certora/conf/*.conf; do
    certoraRun "$conf"
done
```

### Property-Based Testing (Echidna/Foundry)

```bash
# Install Echidna
# https://github.com/crytic/echidna

# Create fuzzing config
echidna-test . --contract ExecutionAgent --config echidna.yaml

# Or with Foundry
forge test --fuzz-runs 10000
```

---

## Verification Status

| Contract | SMTChecker | Certora | Echidna | Status |
|----------|------------|---------|---------|--------|
| IntentCaptureModule | Configured | Spec Written | Pending | Partial |
| TriggerMechanism | Configured | Pending | Pending | Partial |
| ExecutionAgent | Configured | Spec Written | Pending | Partial |
| LexiconHolder | Configured | Spec Written | Pending | Partial |
| SunsetProtocol | Configured | Spec Written | Pending | Partial |
| IPToken | Configured | Pending | Pending | Pending |

---

## Known Limitations

### SMTChecker Limitations
1. **External Calls:** Cannot reason about behavior of external contracts
2. **Loops:** May timeout on unbounded loops
3. **Storage:** Complex storage patterns may not be fully analyzed

### Certora Limitations
1. **Gas Costs:** Does not verify gas consumption
2. **External Dependencies:** OpenZeppelin contracts abstracted
3. **Dynamic Arrays:** May require loop unrolling hints

### What Formal Verification Does NOT Prove
1. Business logic correctness (only implementation matches spec)
2. Economic security (MEV, front-running)
3. Operational security (key management)
4. External dependencies (oracles, IPFS)

---

## Recommended Verification Workflow

### Before Deployment

1. **Run SMTChecker:**
   ```bash
   npx hardhat compile 2>&1 | grep -i "warning\|error"
   ```

2. **Run Certora Specs:**
   ```bash
   certoraRun certora/conf/ExecutionAgent.conf
   certoraRun certora/conf/SunsetProtocol.conf
   ```

3. **Review Results:**
   - All invariants should PASS
   - No counterexamples found
   - Check for timeouts (may need spec adjustment)

### After Any Code Change

1. Re-run all verification steps
2. Update specs if logic changed
3. Add new invariants for new functionality

---

## Adding New Invariants

To add a new invariant:

1. **Identify the property** - What must always be true?

2. **Add NatSpec annotation:**
   ```solidity
   /// @custom:invariant Description of invariant
   ```

3. **Write Certora rule:**
   ```cvl
   rule myNewInvariant(parameters) {
       env e;
       // Setup
       // Action
       // Assert
   }
   ```

4. **Test locally** before committing

---

## Contact

For verification questions or to report counterexamples:
- Security: security@finiteintent.example
- Documentation: See [SECURITY.md](SECURITY.md)

---

*Last Updated: 2025-12-23*
