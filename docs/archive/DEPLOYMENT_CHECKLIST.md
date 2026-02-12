# Finite Intent Executor - Production Deployment Checklist

## Overview

This document provides a comprehensive checklist for deploying the Finite Intent Executor (FIE) system to production. Follow each step carefully and verify completion before proceeding.

---

## Pre-Deployment Checklist

### 1. Code Verification

- [ ] **All tests passing**
  ```bash
  npx hardhat test
  ```
  - Verify: 100% of unit tests pass
  - Verify: All integration tests pass
  - Document: Test coverage report

- [ ] **Static analysis complete**
  ```bash
  npx hardhat compile --force
  ```
  - Verify: No compilation errors
  - Verify: SMTChecker warnings reviewed

- [ ] **Formal verification run**
  ```bash
  ./certora/run_verification.sh
  ```
  - Verify: All Certora specs pass
  - Document: Verification report links

- [ ] **Fuzzing tests complete**
  ```bash
  forge test --fuzz-runs 5000
  ```
  - Verify: No invariant violations
  - Document: Fuzzing report

- [ ] **Security audit complete**
  - Verify: External audit report received
  - Verify: All critical/high findings fixed
  - Document: Audit report and remediation

### 2. Configuration Verification

- [ ] **Immutable parameters confirmed**
  | Parameter | Expected Value | Contract |
  |-----------|---------------|----------|
  | CONFIDENCE_THRESHOLD | 95 | ExecutionAgent |
  | SUNSET_DURATION | 630720000 (20 years) | ExecutionAgent, SunsetProtocol |
  | Corpus Window | 5-10 years | IntentCaptureModule |

- [ ] **Political filter keywords verified**
  - Review: `PoliticalFilter.sol` keyword list
  - Verify: All prohibited actions in ExecutionAgent

- [ ] **Access control roles documented**
  | Role | Purpose | Initial Holder |
  |------|---------|----------------|
  | DEFAULT_ADMIN_ROLE | Grant/revoke roles | Deployer (multisig) |
  | EXECUTOR_ROLE | Execute posthumous actions | Authorized executor |
  | INDEXER_ROLE | Create semantic indices | Indexing service |
  | SUNSET_OPERATOR_ROLE | Manage sunset process | Sunset operator |
  | MINTER_ROLE | Mint IP tokens | IP minting service |

---

## Deployment Procedure

### Step 1: Environment Setup

- [ ] **Create deployment wallet**
  - Type: Hardware wallet or multisig
  - Minimum signers: 3 of 5 (for mainnet)
  - Document: Wallet address

- [ ] **Fund deployment wallet**
  - Network: Target chain (Mainnet/Testnet)
  - Amount: Estimated gas + 20% buffer
  - Document: Funding transaction hash

- [ ] **Set environment variables**
  ```bash
  export DEPLOYER_PRIVATE_KEY=<secure_key>
  export ETHERSCAN_API_KEY=<api_key>
  export NETWORK=<mainnet|goerli|sepolia>
  ```

### Step 2: Contract Deployment Order

**CRITICAL: Deploy in exact order to maintain dependencies**

#### Phase 1: Core Contracts (No Dependencies)

1. [ ] **Deploy LexiconHolder**
   ```bash
   npx hardhat run scripts/deploy.js --network $NETWORK
   ```
   - Document: Contract address
   - Verify: `INDEXER_ROLE` granted to deployer

2. [ ] **Deploy IntentCaptureModule**
   - Document: Contract address
   - Verify: Owner is deployer

#### Phase 2: Dependent Contracts

3. [ ] **Deploy TriggerMechanism**
   - Constructor param: IntentCaptureModule address
   - Document: Contract address
   - Verify: intentModule link correct

4. [ ] **Deploy ExecutionAgent**
   - Constructor param: LexiconHolder address
   - Document: Contract address
   - Verify: lexiconHolder link correct
   - Verify: CONFIDENCE_THRESHOLD = 95
   - Verify: SUNSET_DURATION = 630720000

5. [ ] **Deploy SunsetProtocol**
   - Constructor params: ExecutionAgent, LexiconHolder addresses
   - Document: Contract address
   - Verify: Both links correct

6. [ ] **Deploy IPToken**
   - Document: Contract address
   - Verify: ERC721 interface correct

#### Phase 3: Oracle Infrastructure (Optional)

7. [ ] **Deploy OracleRegistry** (if using)
   - Document: Contract address

8. [ ] **Deploy ZKVerifierAdapter** (if using ZK proofs)
   - Document: Contract address

### Step 3: Contract Linking

- [ ] **Link IntentCaptureModule to TriggerMechanism**
  ```solidity
  intentModule.setTriggerMechanism(triggerMechanism.address)
  ```
  - Verify: triggerMechanism() returns correct address

- [ ] **Link TriggerMechanism to OracleRegistry** (if using)
  ```solidity
  triggerMechanism.setOracleRegistry(oracleRegistry.address)
  ```

### Step 4: Role Configuration

- [ ] **Grant EXECUTOR_ROLE**
  ```solidity
  executionAgent.grantRole(EXECUTOR_ROLE, executorAddress)
  ```
  - Document: Executor address

- [ ] **Grant INDEXER_ROLE to SunsetProtocol**
  ```solidity
  lexiconHolder.grantRole(INDEXER_ROLE, sunsetProtocol.address)
  ```

- [ ] **Grant SUNSET_OPERATOR_ROLE**
  ```solidity
  sunsetProtocol.grantRole(SUNSET_OPERATOR_ROLE, operatorAddress)
  ```

- [ ] **Grant IPToken EXECUTOR_ROLE to ExecutionAgent**
  ```solidity
  ipToken.grantRole(EXECUTOR_ROLE, executionAgent.address)
  ```

### Step 5: Verification

- [ ] **Verify all contracts on Etherscan**
  ```bash
  npx hardhat verify --network $NETWORK <address> <constructor_args>
  ```

- [ ] **Verify contract links**
  | Contract | Linked To | Expected |
  |----------|-----------|----------|
  | IntentCaptureModule.triggerMechanism() | TriggerMechanism | ✓ |
  | TriggerMechanism.intentModule() | IntentCaptureModule | ✓ |
  | ExecutionAgent.lexiconHolder() | LexiconHolder | ✓ |
  | SunsetProtocol.executionAgent() | ExecutionAgent | ✓ |
  | SunsetProtocol.lexiconHolder() | LexiconHolder | ✓ |

---

## Post-Deployment Verification

### Functional Tests

- [ ] **Test intent capture flow**
  1. Capture intent with valid parameters
  2. Add goal
  3. Sign version
  4. Verify all state correct

- [ ] **Test trigger mechanism**
  1. Configure deadman switch
  2. Perform check-in
  3. Verify timer reset

- [ ] **Test political filter**
  1. Attempt action with "political" keyword
  2. Verify rejection

- [ ] **Test confidence threshold**
  1. Create low-confidence index
  2. Attempt action
  3. Verify InactionDefault event

### Security Verification

- [ ] **Verify role holders**
  ```solidity
  // Check each role has correct holder
  executionAgent.hasRole(EXECUTOR_ROLE, expectedAddress)
  ```

- [ ] **Verify immutables**
  ```solidity
  assert(executionAgent.CONFIDENCE_THRESHOLD() == 95)
  assert(executionAgent.SUNSET_DURATION() == 630720000)
  ```

- [ ] **Test access control**
  - Attempt action without role (should fail)
  - Attempt action with role (should succeed)

---

## Monitoring Setup

### Event Monitoring

- [ ] **Configure event listeners**
  - ActionExecuted
  - InactionDefault
  - IntentTriggered
  - SunsetActivated

- [ ] **Set up alerts**
  - Critical: SunsetActivated, IntentTriggered
  - Warning: InactionDefault
  - Info: ActionExecuted, LicenseIssued

### Health Checks

- [ ] **Create monitoring dashboard**
  - Treasury balances
  - Active executions
  - Sunset countdown timers

- [ ] **Configure uptime monitoring**
  - RPC endpoint availability
  - Contract responsiveness

---

## Emergency Procedures

### Circuit Breaker

If critical issue discovered:

1. [ ] **Pause operations** (if pausable)
2. [ ] **Assess impact**
3. [ ] **Communicate to stakeholders**
4. [ ] **Implement fix or workaround**
5. [ ] **Resume operations**

### Emergency Contacts

| Role | Contact | Backup |
|------|---------|--------|
| Lead Developer | | |
| Security Lead | | |
| Operations | | |

---

## Documentation

### Final Documentation Checklist

- [ ] **Deployed addresses document**
  - All contract addresses
  - Network information
  - Block numbers

- [ ] **Admin runbook**
  - Common operations
  - Role management
  - Upgrade procedures (if applicable)

- [ ] **User guide updated**
  - Correct contract addresses
  - Network configuration

---

## Sign-off

### Deployment Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Technical Lead | | | |
| Security Lead | | | |
| Operations Lead | | | |
| Project Manager | | | |

### Final Notes

```
Deployment Date: _______________
Network: _______________
Block Number: _______________
Deployer Address: _______________

Notes:
_________________________________
_________________________________
_________________________________
```

---

## Appendix A: Contract Addresses Template

```json
{
  "network": "",
  "chainId": 0,
  "deploymentDate": "",
  "contracts": {
    "LexiconHolder": "",
    "IntentCaptureModule": "",
    "TriggerMechanism": "",
    "ExecutionAgent": "",
    "SunsetProtocol": "",
    "IPToken": "",
    "OracleRegistry": "",
    "ZKVerifierAdapter": ""
  },
  "roles": {
    "admin": "",
    "executor": "",
    "indexer": "",
    "sunsetOperator": "",
    "minter": ""
  }
}
```

---

## Appendix B: Gas Estimates

| Contract | Deployment Gas | Approx Cost (at 30 gwei) |
|----------|---------------|--------------------------|
| LexiconHolder | ~1,500,000 | ~0.045 ETH |
| IntentCaptureModule | ~1,200,000 | ~0.036 ETH |
| TriggerMechanism | ~2,500,000 | ~0.075 ETH |
| ExecutionAgent | ~2,000,000 | ~0.060 ETH |
| SunsetProtocol | ~1,800,000 | ~0.054 ETH |
| IPToken | ~2,200,000 | ~0.066 ETH |
| **Total** | **~11,200,000** | **~0.336 ETH** |

*Note: Actual gas costs may vary based on network conditions*
