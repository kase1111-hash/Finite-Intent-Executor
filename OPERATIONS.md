# Operations Runbook

This document provides operational procedures for deploying, maintaining, and troubleshooting the Finite Intent Executor (FIE) system.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Deployment Procedures](#deployment-procedures)
3. [Post-Deployment Configuration](#post-deployment-configuration)
4. [Monitoring](#monitoring)
5. [Troubleshooting](#troubleshooting)
6. [Emergency Procedures](#emergency-procedures)
7. [Maintenance Tasks](#maintenance-tasks)

---

## Environment Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- Access to RPC endpoints (Alchemy, Infura, or similar)
- Etherscan API key (for contract verification)
- Funded wallet for deployment

### Configuration Files

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Required environment variables:
   ```bash
   # Blockchain
   PRIVATE_KEY=           # Deployer wallet private key
   SEPOLIA_RPC_URL=       # For testnet deployment
   MAINNET_RPC_URL=       # For mainnet deployment
   ETHERSCAN_API_KEY=     # For contract verification

   # Security (optional but recommended)
   BOUNDARY_SIEM_URL=     # Security event reporting
   BOUNDARY_DAEMON_HOST=  # Connection protection
   ```

### Network Selection

| Network | Chain ID | Use Case |
|---------|----------|----------|
| hardhat | 31337 | Local development |
| sepolia | 11155111 | Testing |
| baseSepolia | 84532 | L2 testing |
| mainnet | 1 | Production |
| base | 8453 | L2 production |

---

## Deployment Procedures

### Local Deployment (Development)

```bash
# Start local node
npm run node

# Deploy in separate terminal
npm run deploy
```

### Testnet Deployment

```bash
# 1. Ensure .env is configured with testnet RPC and funded wallet
# 2. Run deployment
npx hardhat run scripts/deploy.js --network sepolia

# 3. Verify contracts (optional but recommended)
VERIFY_CONTRACTS=true npx hardhat run scripts/deploy.js --network sepolia
```

### Mainnet Deployment

**WARNING: Mainnet deployment is irreversible. Follow all steps carefully.**

1. **Pre-deployment checklist:**
   - [ ] All tests passing (`npm test`)
   - [ ] Security audit complete
   - [ ] Wallet funded with sufficient ETH (≥0.5 ETH recommended)
   - [ ] Multi-sig wallet ready for ownership transfer
   - [ ] Backup of private keys secured

2. **Deploy:**
   ```bash
   npx hardhat run scripts/deploy.js --network mainnet
   ```

3. **Verify contracts:**
   ```bash
   VERIFY_CONTRACTS=true npx hardhat run scripts/deploy.js --network mainnet
   ```

4. **Post-deployment:**
   - Transfer ownership to multi-sig
   - Update frontend with contract addresses
   - Notify stakeholders

### Deployment Outputs

After deployment, the following files are created:
- `deployments/<network>.json` - Full deployment info
- `deployment-addresses.json` - Contract addresses (root)
- `frontend/src/contracts/deployedAddresses.js` - Frontend config

---

## Post-Deployment Configuration

### 1. Update Frontend Environment

Create `frontend/.env.production`:
```bash
VITE_CHAIN_ID=1
VITE_NETWORK_NAME=mainnet
VITE_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_INTENT_MODULE_ADDRESS=0x...
VITE_TRIGGER_MECHANISM_ADDRESS=0x...
VITE_EXECUTION_AGENT_ADDRESS=0x...
VITE_LEXICON_HOLDER_ADDRESS=0x...
VITE_SUNSET_PROTOCOL_ADDRESS=0x...
VITE_IP_TOKEN_ADDRESS=0x...
```

### 2. Configure Oracle Integration

If using oracle-verified triggers:

```javascript
// Configure trusted oracles
await triggerMechanism.configureOracleVerified([
  '0xOracleAddress1',
  '0xOracleAddress2'
]);
```

### 3. Transfer Ownership (Production)

For production deployments, transfer ownership to multi-sig:

```javascript
// Transfer ownership of each contract
await intentModule.transferOwnership(MULTISIG_ADDRESS);
await triggerMechanism.transferOwnership(MULTISIG_ADDRESS);
await executionAgent.transferOwnership(MULTISIG_ADDRESS);
// ... repeat for all contracts
```

---

## Monitoring

### Contract Events to Monitor

| Event | Contract | Severity | Action |
|-------|----------|----------|--------|
| `IntentTriggered` | IntentCaptureModule | CRITICAL | Verify trigger validity |
| `ExecutionActivated` | ExecutionAgent | HIGH | Monitor execution |
| `SunsetInitiated` | SunsetProtocol | HIGH | Begin sunset procedures |
| `SunsetCompleted` | SunsetProtocol | INFO | Verify completion |
| `InactionDefault` | ExecutionAgent | WARNING | Review confidence |

### Security Integration

If using Boundary-SIEM:

```javascript
const { createFIESecurity } = require('./security');

const security = createFIESecurity({
  siemUrl: process.env.BOUNDARY_SIEM_URL,
  daemonSocket: process.env.BOUNDARY_DAEMON_SOCKET
});

await security.connect();

// Monitor contract events
const cleanup = security.security.monitorContractEvents(
  executionAgent,
  ['ActionExecuted', 'InactionDefault', 'PoliticalViolation']
);
```

### Health Checks

```bash
# Check contract deployment
npx hardhat verify --network mainnet <CONTRACT_ADDRESS>

# Check contract state
npx hardhat console --network mainnet
> const contract = await ethers.getContractAt('ExecutionAgent', '<ADDRESS>')
> await contract.isActive()
```

---

## Troubleshooting

### Common Issues

#### 1. Deployment Fails with "Insufficient Funds"

```
Error: Insufficient balance. Need at least 0.1 ETH for deployment.
```

**Solution:** Fund the deployer wallet with more ETH.

#### 2. Contract Verification Fails

```
Error: Already Verified
```

**Solution:** Contract is already verified. Check on Etherscan.

```
Error: Contract source code not verified
```

**Solution:**
1. Ensure ETHERSCAN_API_KEY is set
2. Wait a few blocks after deployment
3. Retry with `VERIFY_CONTRACTS=true`

#### 3. Transaction Reverted

```
Error: Transaction reverted: <reason>
```

**Common causes:**
- Access control: Caller lacks required role
- State: Contract not in expected state
- Parameters: Invalid input values

**Debug:**
```javascript
// Use hardhat console to check state
> await contract.owner()
> await contract.getState()
```

#### 4. RPC Connection Issues

```
Error: could not detect network
```

**Solution:**
1. Check RPC URL in .env
2. Verify API key is valid
3. Try alternative RPC endpoint

### Log Analysis

Check transaction logs on block explorer:
- Ethereum: https://etherscan.io
- Sepolia: https://sepolia.etherscan.io
- Base: https://basescan.org

---

## Emergency Procedures

### Scenario 1: Compromised Deployer Key

1. **Immediate:** Transfer ownership to backup address
2. **Assess:** Check for unauthorized transactions
3. **Report:** Notify stakeholders
4. **Remediate:** Generate new keys, redeploy if necessary

### Scenario 2: Critical Bug Discovered

1. **Document:** Record exact issue and impact
2. **Communicate:** Alert affected users
3. **Mitigate:** If possible, pause affected functionality
4. **Fix:** Prepare and test fix
5. **Deploy:** Deploy fix (may require redeployment)

### Scenario 3: Oracle Failure

1. **Detect:** Monitor for missing oracle responses
2. **Fallback:** Switch to backup oracle or trusted quorum
3. **Investigate:** Determine cause of failure
4. **Restore:** Reconfigure oracles when available

### Emergency Contacts

- Security Team: [Configure in .env]
- On-Call Engineer: [Configure in .env]
- Boundary-SIEM Alerts: [Configure in SIEM dashboard]

---

## Maintenance Tasks

### Daily

- [ ] Check contract event logs for anomalies
- [ ] Verify SIEM connectivity
- [ ] Monitor gas prices for pending operations

### Weekly

- [ ] Review execution agent action logs
- [ ] Check oracle health and response times
- [ ] Verify backup procedures

### Monthly

- [ ] Rotate API keys (RPC, Etherscan)
- [ ] Review access control configurations
- [ ] Test disaster recovery procedures
- [ ] Update dependencies (security patches)

### Quarterly

- [ ] Security review of new features
- [ ] Performance analysis
- [ ] Cost optimization review
- [ ] Stakeholder reporting

---

## Appendix

### Useful Commands

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Run specific test
npx hardhat test test/ExecutionAgent.test.js

# Gas report
REPORT_GAS=true npm test

# Contract size report
REPORT_SIZE=true npm run compile

# Flatten for verification
npx hardhat flatten contracts/ExecutionAgent.sol > flat.sol
```

### Contract Roles

| Role | Permissions |
|------|-------------|
| Owner | Full administrative access |
| Executor | Can execute actions on behalf of creator |
| Oracle | Can submit verification proofs |
| Trusted Signer | Can sign for quorum triggers |

### Gas Estimates

| Operation | Estimated Gas | Cost (20 gwei) |
|-----------|---------------|----------------|
| captureIntent | ~200,000 | ~0.004 ETH |
| triggerIntent | ~150,000 | ~0.003 ETH |
| executeAction | ~100,000 | ~0.002 ETH |
| mintIP | ~250,000 | ~0.005 ETH |
| completeSunset | ~300,000 | ~0.006 ETH |

---

*Last Updated: 2026-01-02*
*Version: 0.1.0-alpha*
